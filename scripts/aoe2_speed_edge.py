#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import urllib.parse
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import aoe2_speed as speed
import aoe2_speed_inventory as inventory

PUBLIC_BASE = "https://aoe2war.com"
EDGE_RECEIPTS = speed.STATE / "performance-edge-receipts"
DYNAMIC_QUALIFICATION_RECEIPTS = speed.STATE / "performance-edge-dynamic-qualification-receipts"
DYNAMIC_POLICY_PATH = ROOT / "config" / "speed-edge-dynamic-policy.json"
DYNAMIC_SAMPLE_OFFSETS = (0.0, 15.0, 30.0)
EDGE_AUDIT_REUSE_SECONDS = 15 * 60
STATIC_VERIFY_SETTLE_SECONDS = 1.5
STATIC_VERIFY_ATTEMPTS = 5
STATIC_VERIFY_BACKOFF_SECONDS = 1.0
ASSET_EDGE_TTL_SECONDS = 3600
ASSET_QUALITY = 95
ASSET_PROBE_WIDTH = 1920
ASSET_VARY_MEDIA_TYPES = ["image/avif", "image/webp", "image/*"]
ASSET_MODERN_ACCEPT = "image/avif,image/webp,image/*,*/*;q=0.8"
ASSET_FALLBACK_ACCEPT = "image/png,image/*;q=0.8,*/*;q=0.5"
FEATURED_AVATAR_EDGE_TTL_SECONDS = 3600
FEATURED_AVATAR_CACHE_VERSION = "20260630a"
FEATURED_AVATAR_EXTRA_UIDS = ("aoe2hd-moose", "aoe2hd_ai_concierge", "aoe2hd_ai_grimer")
FEATURED_AVATAR_VARY_MEDIA_TYPES = ["image/avif", "image/webp", "image/*"]
FEATURED_AVATAR_PASSTHROUGH_HEADERS = [
    "next-router-prefetch",
    "next-router-segment-prefetch",
    "next-router-state-tree",
    "rsc",
]
SESSION_COOKIE_NAME = "aoe2hdbets_session"
CLOUDFLARE_SSH = os.getenv("AOE2_SPEED_CLOUDFLARE_SSH", "hetzner-codex")
CLOUDFLARE_UNIT = "aoe2war-speedos-cloudflare@{command}.service"
CLOUDFLARE_REMOTE_STATE = "/var/lib/aoe2war-speedos/cloudflare"
CLOUDFLARE_HELPER_LOCAL = ROOT / "scripts" / "aoe2_speed_cloudflare_remote.py"
CLOUDFLARE_UNIT_LOCAL = ROOT / "deploy" / "aoe2war-speedos-cloudflare@.service"
CLOUDFLARE_HELPER_REMOTE = "/usr/local/bin/aoe2war-speedos-cloudflare"
CLOUDFLARE_UNIT_REMOTE = "/etc/systemd/system/aoe2war-speedos-cloudflare@.service"
COOKIE_SCAN_ROOTS = (ROOT / "app", ROOT / "components", ROOT / "context", ROOT / "hooks", ROOT / "lib")


class EdgeAuditError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def cache_safety_signature(source_inventory: dict[str, Any]) -> str:
    rows = []
    for page in source_inventory.get("pages") or []:
        if page.get("classification") != "public":
            continue
        profile = page.get("source_profile") or {}
        rows.append(
            {
                "template": page.get("template"),
                "representative": page.get("benchmark_representative"),
                "source_path": profile.get("source_path"),
                "edge_cache_classification": profile.get("edge_cache_classification"),
                "server_request_personalization_signal": profile.get("server_request_personalization_signal"),
                "layout_server_personalization_signal": profile.get("layout_server_personalization_signal"),
                "applicable_layouts": profile.get("applicable_layouts") or [],
            }
        )
    encoded = json.dumps(sorted(rows, key=lambda row: str(row.get("template"))), sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def latest_edge_audit() -> dict[str, Any] | None:
    if not EDGE_RECEIPTS.is_dir():
        return None
    paths = sorted(EDGE_RECEIPTS.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    for path in paths:
        payload = speed.safe_json(path)
        if payload and payload.get("kind") == "aoe2war-speed-edge-delivery-audit":
            payload["_path"] = str(path)
            return payload
    return None


def latest_successful_static_apply() -> dict[str, Any] | None:
    """Return the receipt that authoritatively describes the installed static SpeedOS rule."""
    if not EDGE_RECEIPTS.is_dir():
        return None
    paths = sorted(
        EDGE_RECEIPTS.glob("*-cloudflare-apply.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for path in paths:
        payload = speed.safe_json(path)
        if not payload or payload.get("kind") != "aoe2war-speedos-cloudflare-apply":
            continue
        if payload.get("rollback_performed"):
            continue
        if not (payload.get("verification") or {}).get("ok"):
            continue
        plan = payload.get("plan") or {}
        routes = plan.get("eligible_exact_routes")
        if not isinstance(routes, list) or not routes:
            continue
        payload["_path"] = str(path)
        return payload
    return None


def latest_successful_dynamic_apply() -> dict[str, Any] | None:
    if not EDGE_RECEIPTS.is_dir():
        return None
    paths = sorted(
        EDGE_RECEIPTS.glob("*-cloudflare-dynamic-apply.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for path in paths:
        payload = speed.safe_json(path)
        if not payload or payload.get("kind") != "aoe2war-speedos-cloudflare-dynamic-apply":
            continue
        if payload.get("rollback_performed"):
            continue
        if not (payload.get("verification") or {}).get("ok"):
            continue
        plan = payload.get("dynamic_plan") or {}
        routes = plan.get("eligible_exact_routes")
        if not isinstance(routes, list) or not routes:
            continue
        payload["_path"] = str(path)
        return payload
    return None


def latest_successful_asset_apply() -> dict[str, Any] | None:
    if not EDGE_RECEIPTS.is_dir():
        return None
    paths = sorted(
        EDGE_RECEIPTS.glob("*-cloudflare-asset-apply.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for path in paths:
        payload = speed.safe_json(path)
        if not payload or payload.get("kind") != "aoe2war-speedos-cloudflare-asset-apply":
            continue
        if payload.get("rollback_performed"):
            continue
        if not (payload.get("verification") or {}).get("ok"):
            continue
        plan = payload.get("asset_plan") or {}
        if not plan.get("source_path"):
            continue
        payload["_path"] = str(path)
        return payload
    return None


def reusable_edge_audit(
    audit: dict[str, Any] | None,
    source_inventory: dict[str, Any],
    benchmark: dict[str, Any],
    *,
    max_age_seconds: int = EDGE_AUDIT_REUSE_SECONDS,
) -> bool:
    if not audit:
        return False
    if audit.get("benchmark_release_sha") != benchmark.get("release_sha"):
        return False
    if audit.get("cache_safety_signature") != cache_safety_signature(source_inventory):
        return False
    generated = speed.parse_dt(audit.get("generated_at"))
    now = speed.parse_dt(utc_now())
    if not generated or not now:
        return False
    age = (now - generated).total_seconds()
    return 0 <= age <= max_age_seconds


def latest_full_cost_stack() -> dict[str, Any] | None:
    for receipt in reversed(speed.all_performance_receipts()):
        if receipt.get("mode") != "full":
            continue
        rows = receipt.get("routes") or []
        if rows and all(
            isinstance(row, dict)
            and isinstance(row.get("origin_warm_median_ttfb_ms"), (int, float))
            for row in rows
        ):
            return receipt
    return None


def parse_final_header_block(raw: str) -> dict[str, str | list[str]]:
    normalized = raw.replace("\r\n", "\n")
    blocks = [
        block.strip()
        for block in re.split(r"\n\n+", normalized)
        if block.strip().startswith("HTTP/")
    ]
    if not blocks:
        return {}
    lines = blocks[-1].splitlines()
    result: dict[str, str | list[str]] = {"status_line": lines[0].strip()}
    cookies: list[str] = []
    for line in lines[1:]:
        if ":" not in line:
            continue
        name, value = line.split(":", 1)
        key = name.strip().lower()
        cleaned = value.strip()
        if key == "set-cookie":
            cookies.append(cleaned)
        else:
            result[key] = cleaned
    if cookies:
        result["set-cookie"] = cookies
    return result


def header_probe(path: str) -> dict[str, Any]:
    url = PUBLIC_BASE + path
    marker = "__AOE2_EDGE_FINAL__"
    proc = subprocess.run(
        [
            "curl",
            "-sS",
            "-L",
            "--compressed",
            "--max-time",
            "15",
            "-D",
            "-",
            "-o",
            "/dev/null",
            "-w",
            f"\n{marker}%{{http_code}}\t%{{url_effective}}\n",
            url,
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        return {
            "available": False,
            "url": url,
            "error": (proc.stderr or "curl failed").strip()[-500:],
        }
    before, sep, final = proc.stdout.rpartition(marker)
    if not sep:
        return {"available": False, "url": url, "error": "missing curl final marker"}
    fields = final.strip().split("\t", 1)
    try:
        status = int(fields[0])
    except (ValueError, IndexError):
        status = 0
    effective = fields[1] if len(fields) > 1 else url
    headers = parse_final_header_block(before)
    cache_control = str(headers.get("cache-control") or "")
    cdn_cache_control = str(headers.get("cdn-cache-control") or "")
    cf_cache = str(headers.get("cf-cache-status") or "").upper()
    next_cache = str(headers.get("x-nextjs-cache") or "").upper()
    set_cookie = headers.get("set-cookie")
    return {
        "available": True,
        "url": url,
        "effective_url": effective,
        "http_status": status,
        "cache_control": cache_control,
        "cdn_cache_control": cdn_cache_control,
        "cf_cache_status": cf_cache or None,
        "next_cache_status": next_cache or None,
        "age": headers.get("age"),
        "vary": headers.get("vary"),
        "server": headers.get("server"),
        "cf_ray": headers.get("cf-ray"),
        "set_cookie": bool(set_cookie),
        "shared_cache_prohibited": bool(
            re.search(r"(?:^|,)\s*(?:private|no-store)\b", cache_control, re.IGNORECASE)
            or re.search(r"(?:^|,)\s*(?:private|no-store)\b", cdn_cache_control, re.IGNORECASE)
        ),
        "edge_cache_hit": cf_cache == "HIT",
    }


def priority_for(
    source_class: str,
    live: dict[str, Any],
) -> tuple[str, str]:
    if source_class == "server_personalized_do_not_cache" or live.get("set_cookie"):
        return (
            "blocked_shared_cache",
            "server/session runtime evidence prohibits blanket shared HTML caching",
        )
    if source_class == "static_client_shell_candidate":
        if live.get("edge_cache_hit"):
            return "already_edge_cached_shell", "shared shell is already an edge HIT"
        return (
            "strong_edge_shell_candidate",
            "client shell has no server personalization signal; keep user truth in API/client layers",
        )
    if source_class == "static_or_revalidated_public_candidate":
        if live.get("edge_cache_hit"):
            return "already_edge_cached_public", "public response is already an edge HIT"
        return (
            "static_delivery_candidate",
            "source is static/revalidated but live HTML/RSC is not an edge HIT",
        )
    if source_class == "anonymous_dynamic_candidate_review":
        return (
            "anonymous_dynamic_freshness_review",
            "requires response-equivalence proof plus an explicit staleness budget before shared caching",
        )
    return "unknown_review", "cache safety classification is unknown"


def build_audit(
    *,
    source_inventory: dict[str, Any] | None = None,
    benchmark: dict[str, Any] | None = None,
    probe_fn=header_probe,
) -> dict[str, Any]:
    source_inventory = source_inventory or inventory.snapshot()
    benchmark = benchmark or latest_full_cost_stack()
    if not benchmark:
        raise EdgeAuditError("no full per-route Speed OS cost-stack receipt exists")

    by_route = {
        str(row.get("path")): row
        for row in benchmark.get("routes") or []
        if isinstance(row, dict) and row.get("path")
    }
    rows: list[dict[str, Any]] = []
    for page in source_inventory.get("pages") or []:
        if page.get("classification") != "public":
            continue
        representative = page.get("benchmark_representative")
        if not isinstance(representative, str) or not representative:
            continue
        profile = page.get("source_profile") or {}
        source_class = str(profile.get("edge_cache_classification") or "unknown")
        live = probe_fn(representative)
        priority, reason = priority_for(source_class, live)
        measured = by_route.get(representative) or {}
        gap = measured.get("warm_public_origin_gap_ms")
        warm_public = measured.get("warm_median_ttfb_ms")
        origin = measured.get("origin_warm_median_ttfb_ms")
        score = float(gap or 0.0)
        if priority == "strong_edge_shell_candidate":
            score += 250.0
        elif priority == "static_delivery_candidate":
            score += 175.0
        elif priority == "anonymous_dynamic_freshness_review":
            score += 50.0
        elif priority.startswith("blocked"):
            score = -1.0

        rows.append(
            {
                "template": page.get("template"),
                "route": representative,
                "source_path": profile.get("source_path"),
                "source_cache_classification": source_class,
                "priority": priority,
                "reason": reason,
                "score": round(score, 3),
                "warm_public_ttfb_ms": warm_public,
                "origin_warm_ttfb_ms": origin,
                "warm_delivery_gap_ms": gap,
                "live": live,
            }
        )

    rows.sort(
        key=lambda row: (
            0 if str(row["priority"]).startswith("blocked") else 1,
            float(row["score"]),
        ),
        reverse=True,
    )
    counts: dict[str, int] = {}
    for row in rows:
        key = str(row["priority"])
        counts[key] = counts.get(key, 0) + 1

    return {
        "schema": 1,
        "kind": "aoe2war-speed-edge-delivery-audit",
        "generated_at": utc_now(),
        "benchmark_receipt": speed.evidence_ref(benchmark.get("_path") or ""),
        "benchmark_release_sha": benchmark.get("release_sha"),
        "operator_source_sha": speed.git_head(ROOT),
        "cache_safety_signature": cache_safety_signature(source_inventory),
        "route_count": len(rows),
        "counts": dict(sorted(counts.items())),
        "rows": rows,
    }


COOKIE_ASSIGNMENT_PATTERN = re.compile(
    r"\b[A-Z0-9_]*COOKIE(?:_NAME|_KEY)?\s*=\s*[\"']([^\"']+)[\"']"
)


def discover_app_cookie_names() -> list[str]:
    names: set[str] = {SESSION_COOKIE_NAME}
    for root in COOKIE_SCAN_ROOTS:
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in {".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"}:
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for match in COOKIE_ASSIGNMENT_PATTERN.finditer(text):
                value = match.group(1).strip()
                if value and "=" not in value and len(value) <= 128:
                    names.add(value)
    return sorted(names)


def build_cloudflare_plan(
    audit: dict[str, Any],
    *,
    installed_plan: dict[str, Any] | None = None,
) -> dict[str, Any]:
    installed = set((installed_plan or {}).get("eligible_exact_routes") or [])
    eligible: list[str] = []
    blocked: list[str] = []
    review: list[str] = []
    preserved: list[str] = []
    newly_eligible: list[str] = []
    revoked: list[str] = []

    for row in audit.get("rows") or []:
        route = str(row.get("route") or "")
        priority = str(row.get("priority") or "")
        source_class = str(row.get("source_cache_classification") or "")
        live = row.get("live") or {}
        was_installed = route in installed
        static_source_safe = source_class in {
            "static_client_shell_candidate",
            "static_or_revalidated_public_candidate",
        }
        runtime_prohibited = bool(
            live.get("set_cookie") or live.get("shared_cache_prohibited")
        )

        if was_installed:
            if static_source_safe and not runtime_prohibited and not priority.startswith("blocked"):
                eligible.append(route)
                preserved.append(route)
                continue
            revoked.append(route)

        if priority.startswith("blocked") or live.get("set_cookie"):
            blocked.append(route)
            continue
        if priority == "anonymous_dynamic_freshness_review":
            review.append(route)
            continue
        if priority in {"strong_edge_shell_candidate", "static_delivery_candidate"}:
            if (
                live.get("next_cache_status") == "HIT"
                and not live.get("shared_cache_prohibited")
                and not live.get("set_cookie")
            ):
                eligible.append(route)
                if not was_installed:
                    newly_eligible.append(route)
            else:
                review.append(route)
        elif priority in {"already_edge_cached_shell", "already_edge_cached_public"}:
            # An edge HIT not owned by the installed SpeedOS receipt is not adoption authority.
            review.append(route)
        elif route:
            review.append(route)

    eligible_routes = sorted(set(eligible))
    quoted = " ".join(json.dumps(path) for path in eligible_routes)
    cookie_names = discover_app_cookie_names()
    cookie_bypass = " and ".join(
        f'not http.cookie contains "{name}="' for name in cookie_names
    )
    expression = (
        '(http.host eq "aoe2war.com" and '
        'http.request.method in {"GET" "HEAD"} and '
        'not http.request.uri.query contains "_rsc=" and '
        f'{cookie_bypass} and '
        f'http.request.uri.path in {{{quoted}}})'
    ) if eligible_routes else None
    return {
        "schema": 1,
        "kind": "aoe2war-speed-cloudflare-cache-plan",
        "generated_at": utc_now(),
        "mutation_authorized": False,
        "benchmark_release_sha": audit.get("benchmark_release_sha"),
        "operator_source_sha": audit.get("operator_source_sha"),
        "edge_ttl_seconds": 300,
        "rsc_cache_authorized": False,
        "session_cookie_bypass": SESSION_COOKIE_NAME,
        "cookie_bypass_names": cookie_names,
        "eligible_exact_routes": eligible_routes,
        "installed_exact_routes_before": sorted(installed),
        "preserved_installed_routes": sorted(set(preserved)),
        "newly_eligible_routes": sorted(set(newly_eligible)),
        "revoked_installed_routes": sorted(set(revoked)),
        "blocked_routes": sorted(set(blocked)),
        "review_routes": sorted(set(review)),
        "proposed_cache_rule_expression": expression,
        "cache_behavior": "eligible_for_cache_respect_origin_ttl",
        "requirements": [
            "GET/HEAD only",
            "HTML/document cohort only; bypass Next RSC query traffic until cache-key equivalence is proven",
            "bypass whenever any known AoE2WAR cookie is present",
            "preserve all /api/ cache-control and no-store contracts",
            "do not include server-personalized or runtime-cookie routes",
            "preserve previously installed static routes while source/runtime cache safety remains valid",
            "require fresh x-nextjs-cache HIT evidence before adding a new static route",
            "verify anonymous HTML/RSC equivalence before enabling any new route",
            "purge candidate URLs on every app deployment before certification",
        ],
    }



DYNAMIC_POLICY_ADMISSIONS = {
    "anonymous_dynamic": "anonymous_dynamic_candidate_review",
    "request_time_public": "static_or_revalidated_public_candidate",
}


def load_dynamic_policy(path: Path = DYNAMIC_POLICY_PATH) -> dict[str, Any]:
    payload = speed.safe_json(path)
    if not payload or payload.get("schema") != 2 or payload.get("kind") != "aoe2war-speedos-dynamic-edge-policy":
        raise EdgeAuditError(f"dynamic edge policy is missing or invalid: {path}")
    raw_routes = payload.get("routes")
    if not isinstance(raw_routes, list) or not raw_routes:
        raise EdgeAuditError("dynamic edge policy must contain at least one route")
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_routes:
        if not isinstance(raw, dict):
            raise EdgeAuditError("dynamic edge policy route entries must be objects")
        route = str(raw.get("route") or "").strip()
        if not route.startswith("/") or "?" in route or "#" in route or route in seen:
            raise EdgeAuditError(f"dynamic edge policy contains an invalid/duplicate route: {route!r}")
        ttl = raw.get("ttl_seconds")
        if ttl != 30:
            raise EdgeAuditError(f"dynamic edge policy TTL must be exactly 30 seconds: {route}")
        if raw.get("empty_query_only") is not True:
            raise EdgeAuditError(f"dynamic edge policy must require empty-query HTML: {route}")
        admission = str(raw.get("admission") or "").strip()
        if admission not in DYNAMIC_POLICY_ADMISSIONS:
            raise EdgeAuditError(f"dynamic edge policy has invalid admission {admission!r}: {route}")
        rationale = str(raw.get("rationale") or "").strip()
        if not rationale:
            raise EdgeAuditError(f"dynamic edge policy requires a rationale: {route}")
        seen.add(route)
        rows.append({
            "route": route,
            "ttl_seconds": 30,
            "empty_query_only": True,
            "admission": admission,
            "rationale": rationale,
        })
    return {**payload, "routes": sorted(rows, key=lambda row: row["route"])}


def operator_git_state() -> dict[str, Any]:
    branch = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    status = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    if branch.returncode != 0 or status.returncode != 0:
        raise EdgeAuditError("cannot prove operator Git state for dynamic qualification")
    return {
        "branch": branch.stdout.strip(),
        "clean": not bool(status.stdout.strip()),
        "dirty_paths": len([line for line in status.stdout.splitlines() if line.strip()]),
    }


def require_dynamic_release_identity() -> dict[str, Any]:
    identity = speed.collect_release_identity()
    release_sha = str(identity.get("release_sha") or "")
    github_sha = str(identity.get("github_main_sha") or "")
    operator_sha = str(identity.get("operator_source_sha") or "")
    git_state = operator_git_state()
    if identity.get("certification") != "CERTIFIED":
        raise EdgeAuditError("dynamic qualification requires CERTIFIED production")
    if git_state.get("branch") != "main" or not git_state.get("clean"):
        raise EdgeAuditError("dynamic qualification requires a clean operator main worktree")
    if not release_sha or release_sha != github_sha or release_sha != operator_sha:
        raise EdgeAuditError(
            "dynamic qualification requires production SHA = GitHub main = operator source SHA"
        )
    return {**identity, "operator_git": git_state}


def dynamic_inventory_routes(source_inventory: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    admission_by_source = {source: admission for admission, source in DYNAMIC_POLICY_ADMISSIONS.items()}
    for page in source_inventory.get("pages") or []:
        if page.get("classification") != "public":
            continue
        route = page.get("benchmark_representative")
        profile = page.get("source_profile") or {}
        if not isinstance(route, str):
            continue
        source_class = str(profile.get("edge_cache_classification") or "")
        admission = admission_by_source.get(source_class)
        if not admission:
            continue
        if profile.get("server_request_personalization_signal") or profile.get("layout_server_personalization_signal"):
            continue
        result[route] = {
            "template": page.get("template"),
            "source_path": profile.get("source_path"),
            "source_edge_cache_classification": source_class,
            "admission": admission,
            "server_request_personalization_signal": False,
            "layout_server_personalization_signal": False,
        }
    return result


def _response_probe_from_files(
    *,
    path: str,
    url: str,
    effective_url: str,
    status: int,
    raw_headers: str,
    body: bytes,
    ttfb_ms: float,
    total_ms: float,
) -> dict[str, Any]:
    headers = parse_final_header_block(raw_headers)
    return {
        "available": True,
        "route": path,
        "url": url,
        "effective_url": effective_url,
        "http_status": status,
        "content_type": str(headers.get("content-type") or ""),
        "cache_control": str(headers.get("cache-control") or ""),
        "cdn_cache_control": str(headers.get("cdn-cache-control") or ""),
        "cf_cache_status": str(headers.get("cf-cache-status") or "").upper() or None,
        "next_cache_status": str(headers.get("x-nextjs-cache") or "").upper() or None,
        "set_cookie": bool(headers.get("set-cookie")),
        "body_sha256": hashlib.sha256(body).hexdigest(),
        "body_bytes": len(body),
        "ttfb_ms": round(float(ttfb_ms), 3),
        "total_ms": round(float(total_ms), 3),
    }


def public_html_body_probe(path: str) -> dict[str, Any]:
    url = PUBLIC_BASE + path
    marker = "__AOE2_DYNAMIC_PROBE__"
    with tempfile.TemporaryDirectory(prefix="aoe2-dynamic-public-") as tmp:
        headers_path = Path(tmp) / "headers.txt"
        body_path = Path(tmp) / "body.bin"
        proc = subprocess.run(
            [
                "curl", "-sS", "-L", "--compressed", "--max-time", "20",
                "-H", "Cookie:",
                "-D", str(headers_path), "-o", str(body_path),
                "-w", f"{marker}%{{http_code}}\\t%{{url_effective}}\\t%{{time_starttransfer}}\\t%{{time_total}}\\n",
                url,
            ],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=25,
        )
        if proc.returncode != 0 or marker not in proc.stdout:
            return {"available": False, "route": path, "url": url, "error": (proc.stderr or proc.stdout or "curl failed").strip()[-500:]}
        fields = proc.stdout.rsplit(marker, 1)[1].strip().split("\t")
        if len(fields) != 4:
            return {"available": False, "route": path, "url": url, "error": "invalid public curl metrics"}
        try:
            status = int(fields[0])
            ttfb_ms = float(fields[2]) * 1000.0
            total_ms = float(fields[3]) * 1000.0
        except ValueError:
            return {"available": False, "route": path, "url": url, "error": "invalid public curl numeric metrics"}
        return _response_probe_from_files(
            path=path,
            url=url,
            effective_url=fields[1],
            status=status,
            raw_headers=headers_path.read_text(encoding="utf-8", errors="replace"),
            body=body_path.read_bytes(),
            ttfb_ms=ttfb_ms,
            total_ms=total_ms,
        )


def origin_html_body_probe(path: str) -> dict[str, Any]:
    url = speed.ORIGIN_BASE + path
    remote_script = f'''set -e
headers=$(mktemp)
body=$(mktemp)
trap 'rm -f "$headers" "$body"' EXIT
metrics=$(curl -sS -L --compressed --max-time 20 -H 'Host: aoe2war.com' -H 'Cookie:' -D "$headers" -o "$body" -w '%{{http_code}}\\t%{{url_effective}}\\t%{{time_starttransfer}}\\t%{{time_total}}' {shlex.quote(url)})
printf '__META__%s\\n' "$metrics"
printf '__SHA__%s\\n' "$(sha256sum "$body" | awk '{{print $1}}')"
printf '__BYTES__%s\\n' "$(wc -c < "$body" | tr -d ' ')"
printf '__HEADERS__'
base64 -w0 "$headers"
printf '\\n'
'''
    proc = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", speed.PRODUCTION_HOST, "bash", "-s"],
        input=remote_script,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=30,
    )
    if proc.returncode != 0:
        return {"available": False, "route": path, "url": url, "error": (proc.stderr or proc.stdout or "origin probe failed").strip()[-500:]}
    values: dict[str, str] = {}
    for line in proc.stdout.splitlines():
        for prefix, key in (("__META__", "meta"), ("__SHA__", "sha"), ("__BYTES__", "bytes"), ("__HEADERS__", "headers")):
            if line.startswith(prefix):
                values[key] = line[len(prefix):]
    fields = values.get("meta", "").split("\t")
    if len(fields) != 4 or not values.get("sha") or not values.get("headers"):
        return {"available": False, "route": path, "url": url, "error": "origin probe returned incomplete evidence"}
    try:
        status = int(fields[0])
        ttfb_ms = float(fields[2]) * 1000.0
        total_ms = float(fields[3]) * 1000.0
        body_bytes = int(values.get("bytes") or 0)
        raw_headers = base64.b64decode(values["headers"]).decode("utf-8", errors="replace")
    except (ValueError, base64.binascii.Error):
        return {"available": False, "route": path, "url": url, "error": "origin probe returned invalid evidence"}
    headers = parse_final_header_block(raw_headers)
    return {
        "available": True,
        "route": path,
        "url": url,
        "effective_url": fields[1],
        "http_status": status,
        "content_type": str(headers.get("content-type") or ""),
        "cache_control": str(headers.get("cache-control") or ""),
        "cdn_cache_control": str(headers.get("cdn-cache-control") or ""),
        "cf_cache_status": None,
        "next_cache_status": str(headers.get("x-nextjs-cache") or "").upper() or None,
        "set_cookie": bool(headers.get("set-cookie")),
        "body_sha256": values["sha"],
        "body_bytes": body_bytes,
        "ttfb_ms": round(ttfb_ms, 3),
        "total_ms": round(total_ms, 3),
    }


def qualify_dynamic_edge(
    source_inventory: dict[str, Any],
    *,
    policy: dict[str, Any] | None = None,
    sample_offsets: tuple[float, ...] = DYNAMIC_SAMPLE_OFFSETS,
    public_probe=public_html_body_probe,
    origin_probe=origin_html_body_probe,
    sleep_fn=time.sleep,
    monotonic_fn=time.monotonic,
) -> dict[str, Any]:
    identity = require_dynamic_release_identity()
    policy = policy or load_dynamic_policy()
    candidates = dynamic_inventory_routes(source_inventory)
    routes = [row["route"] for row in policy["routes"]]
    policy_by_route = {row["route"]: row for row in policy["routes"]}
    missing = [route for route in routes if route not in candidates]
    if missing:
        raise EdgeAuditError("dynamic policy route is no longer an admitted public candidate: " + ", ".join(missing))
    admission_mismatch = [
        route for route in routes
        if candidates[route].get("admission") != policy_by_route[route].get("admission")
    ]
    if admission_mismatch:
        raise EdgeAuditError("dynamic policy/source admission mismatch: " + ", ".join(admission_mismatch))
    if tuple(sample_offsets) != tuple(sorted(sample_offsets)) or not sample_offsets or sample_offsets[0] != 0:
        raise EdgeAuditError("dynamic qualification sample offsets must start at zero and be ordered")
    if sample_offsets[-1] < 30:
        raise EdgeAuditError("dynamic qualification must span at least the authorized 30-second TTL")

    rows = {route: {"route": route, "policy": next(row for row in policy["routes"] if row["route"] == route), "inventory": candidates[route], "samples": []} for route in routes}
    started = monotonic_fn()
    for round_no, offset in enumerate(sample_offsets, start=1):
        delay = started + offset - monotonic_fn()
        if delay > 0:
            sleep_fn(delay)
        for route in routes:
            public = public_probe(route)
            origin = origin_probe(route)
            rows[route]["samples"].append({"round": round_no, "target_offset_seconds": offset, "public": public, "origin": origin})

    qualified_count = 0
    final_rows: list[dict[str, Any]] = []
    for route in routes:
        row = rows[route]
        reasons: list[str] = []
        hashes: set[str] = set()
        public_hashes: set[str] = set()
        origin_hashes: set[str] = set()
        for sample in row["samples"]:
            for side in ("public", "origin"):
                probe = sample[side]
                label = f"round {sample['round']} {side}"
                if not probe.get("available"):
                    reasons.append(f"{label}: unavailable")
                    continue
                if probe.get("http_status") != 200:
                    reasons.append(f"{label}: HTTP {probe.get('http_status')}")
                if "text/html" not in str(probe.get("content_type") or "").lower():
                    reasons.append(f"{label}: non-HTML response")
                if probe.get("set_cookie"):
                    reasons.append(f"{label}: Set-Cookie present")
                digest = str(probe.get("body_sha256") or "")
                if not re.fullmatch(r"[0-9a-f]{64}", digest):
                    reasons.append(f"{label}: invalid body SHA-256")
                else:
                    hashes.add(digest)
                    (public_hashes if side == "public" else origin_hashes).add(digest)
            public = sample["public"]
            if public.get("available"):
                if public.get("effective_url") != PUBLIC_BASE + route:
                    reasons.append(f"round {sample['round']} public: redirected")
        if len(public_hashes) != 1:
            reasons.append(f"public body changed across window ({len(public_hashes)} hashes)")
        if len(origin_hashes) != 1:
            reasons.append(f"origin body changed across window ({len(origin_hashes)} hashes)")
        if len(hashes) != 1:
            reasons.append(f"public/origin byte equality failed ({len(hashes)} hashes)")
        qualified = not reasons
        if qualified:
            qualified_count += 1
        final_rows.append({
            **row,
            "qualified": qualified,
            "reasons": sorted(set(reasons)),
            "body_sha256": next(iter(hashes)) if len(hashes) == 1 else None,
            "sample_count": len(row["samples"]),
        })

    policy_sha = hashlib.sha256(DYNAMIC_POLICY_PATH.read_bytes()).hexdigest()
    return {
        "schema": 1,
        "kind": "aoe2war-speedos-dynamic-edge-qualification",
        "generated_at": utc_now(),
        "release_identity": identity,
        "operator_source_sha": identity["operator_source_sha"],
        "policy_sha256": policy_sha,
        "authorized_ttl_seconds": 30,
        "sample_offsets_seconds": list(sample_offsets),
        "elapsed_seconds": round(monotonic_fn() - started, 3),
        "route_count": len(final_rows),
        "qualified_count": qualified_count,
        "all_qualified": qualified_count == len(final_rows),
        "rows": final_rows,
    }


def dynamic_qualification_digest(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def write_dynamic_qualification_receipt(payload: dict[str, Any]) -> Path:
    DYNAMIC_QUALIFICATION_RECEIPTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    release = str((payload.get("release_identity") or {}).get("release_sha") or "unknown")[:12]
    path = DYNAMIC_QUALIFICATION_RECEIPTS / f"{stamp}-{release}-qualification.json"
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def latest_dynamic_qualification() -> dict[str, Any] | None:
    if not DYNAMIC_QUALIFICATION_RECEIPTS.is_dir():
        return None
    for path in sorted(DYNAMIC_QUALIFICATION_RECEIPTS.glob("*-qualification.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        payload = speed.safe_json(path)
        if payload and payload.get("kind") == "aoe2war-speedos-dynamic-edge-qualification":
            payload["_path"] = str(path)
            return payload
    return None


def build_dynamic_cloudflare_plan(qualification: dict[str, Any]) -> dict[str, Any]:
    identity = require_dynamic_release_identity()
    q_identity = qualification.get("release_identity") or {}
    if q_identity.get("release_sha") != identity.get("release_sha") or qualification.get("operator_source_sha") != identity.get("operator_source_sha"):
        raise EdgeAuditError("dynamic qualification is stale relative to current certified release")
    if not qualification.get("all_qualified"):
        raise EdgeAuditError("dynamic qualification did not pass for the full authorized cohort")
    policy = load_dynamic_policy()
    expected_routes = sorted(row["route"] for row in policy["routes"])
    qualified_routes = sorted(row["route"] for row in qualification.get("rows") or [] if row.get("qualified"))
    if qualified_routes != expected_routes:
        raise EdgeAuditError("dynamic qualification route set does not exactly match policy")
    policy_sha = hashlib.sha256(DYNAMIC_POLICY_PATH.read_bytes()).hexdigest()
    if qualification.get("policy_sha256") != policy_sha:
        raise EdgeAuditError("dynamic qualification policy digest is stale")
    cookie_names = discover_app_cookie_names()
    quoted = " ".join(json.dumps(path) for path in expected_routes)
    cookie_bypass = " and ".join(f'not http.cookie contains "{name}="' for name in cookie_names)
    expression = (
        '(http.host eq "aoe2war.com" and '
        'http.request.method in {"GET" "HEAD"} and '
        'http.request.uri.query eq "" and '
        f'{cookie_bypass} and '
        f'http.request.uri.path in {{{quoted}}})'
    )
    return {
        "schema": 1,
        "kind": "aoe2war-speedos-cloudflare-dynamic-plan",
        "generated_at": utc_now(),
        "mutation_authorized": True,
        "release_sha": identity["release_sha"],
        "operator_source_sha": identity["operator_source_sha"],
        "edge_ttl_seconds": 30,
        "empty_query_only": True,
        "rsc_cache_authorized": False,
        "cookie_bypass_names": cookie_names,
        "eligible_exact_routes": expected_routes,
        "expression": expression,
        "policy_sha256": policy_sha,
        "qualification_sha256": dynamic_qualification_digest({k: v for k, v in qualification.items() if k != "_path"}),
    }


def stage_dynamic_cloudflare_request(plan: dict[str, Any]) -> tuple[dict[str, Any], str]:
    routes = plan.get("eligible_exact_routes") or []
    cookie_names = plan.get("cookie_bypass_names") or []
    if not routes or not plan.get("expression"):
        raise EdgeAuditError("dynamic Cloudflare plan has no eligible cohort")
    if cookie_names != discover_app_cookie_names():
        raise EdgeAuditError("dynamic Cloudflare plan cookie bypasses are stale")
    canonical = json.dumps(plan, sort_keys=True, separators=(",", ":")).encode("utf-8")
    plan_sha = hashlib.sha256(canonical).hexdigest()
    request = {
        "schema": 1,
        "kind": "aoe2war-speedos-cloudflare-dynamic-apply-request",
        "generated_at": utc_now(),
        "zone_name": "aoe2war.com",
        "expression": plan["expression"],
        "edge_ttl_seconds": 30,
        "eligible_exact_routes": routes,
        "cookie_bypass_names": cookie_names,
        "plan_sha256": plan_sha,
        "policy_sha256": plan["policy_sha256"],
        "qualification_sha256": plan["qualification_sha256"],
        "operator_source_sha": speed.git_head(ROOT),
    }
    encoded = json.dumps(request, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, prefix="aoe2war-cf-dynamic-", suffix=".json") as handle:
        handle.write(encoded)
        local_path = Path(handle.name)
    remote_tmp = f"/tmp/aoe2war-speedos-cloudflare-dynamic-request-{os.getpid()}.json"
    try:
        copy = subprocess.run(["scp", "-q", str(local_path), f"{CLOUDFLARE_SSH}:{remote_tmp}"], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, check=False)
        if copy.returncode != 0:
            raise EdgeAuditError("dynamic Cloudflare request transfer failed: " + copy.stderr[-1000:])
        install = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", CLOUDFLARE_SSH, "set -e; " + f"sudo -n /usr/bin/install -o root -g root -m 0600 {shlex.quote(remote_tmp)} {shlex.quote(CLOUDFLARE_REMOTE_STATE + '/dynamic-request.json')}; rm -f {shlex.quote(remote_tmp)}"],
            cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, check=False,
        )
        if install.returncode != 0:
            raise EdgeAuditError("dynamic Cloudflare request install failed: " + install.stderr[-1000:])
    finally:
        local_path.unlink(missing_ok=True)
    return request, plan_sha


def sha256_path(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cloudflare_runtime_status() -> dict[str, Any]:
    local = {
        "helper_sha256": sha256_path(CLOUDFLARE_HELPER_LOCAL),
        "unit_sha256": sha256_path(CLOUDFLARE_UNIT_LOCAL),
    }
    remote_command = (
        f"set -e; sha256sum {shlex.quote(CLOUDFLARE_HELPER_REMOTE)} {shlex.quote(CLOUDFLARE_UNIT_REMOTE)}"
    )
    proc = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", CLOUDFLARE_SSH, remote_command],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=20,
        check=False,
    )
    remote: dict[str, str] = {}
    if proc.returncode == 0:
        for line in proc.stdout.splitlines():
            fields = line.split()
            if len(fields) < 2:
                continue
            digest, path = fields[0], fields[-1]
            if path == CLOUDFLARE_HELPER_REMOTE:
                remote["helper_sha256"] = digest
            elif path == CLOUDFLARE_UNIT_REMOTE:
                remote["unit_sha256"] = digest
    return {
        "local": local,
        "remote": remote,
        "exact": bool(remote) and remote == local,
    }


def require_cloudflare_runtime_exact() -> dict[str, Any]:
    status = cloudflare_runtime_status()
    if not status["exact"]:
        raise EdgeAuditError("Cloudflare privileged runtime is not source-exact; run `aoe2war speed edge bootstrap`")
    return status


def bootstrap_cloudflare_runtime() -> dict[str, Any]:
    helper_tmp = f"/tmp/aoe2war-speedos-cloudflare-helper-{os.getpid()}"
    unit_tmp = f"/tmp/aoe2war-speedos-cloudflare-unit-{os.getpid()}"
    transfers = [
        (CLOUDFLARE_HELPER_LOCAL, helper_tmp),
        (CLOUDFLARE_UNIT_LOCAL, unit_tmp),
    ]
    for local_path, remote_tmp in transfers:
        proc = subprocess.run(
            ["scp", "-q", str(local_path), f"{CLOUDFLARE_SSH}:{remote_tmp}"],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
            check=False,
        )
        if proc.returncode != 0:
            raise EdgeAuditError("Cloudflare runtime transfer failed: " + proc.stderr[-1000:])
    remote = (
        "set -e; "
        f"sudo -n /usr/bin/install -d -o root -g root -m 0750 {shlex.quote(CLOUDFLARE_REMOTE_STATE)}; "
        f"sudo -n /usr/bin/install -o root -g root -m 0755 {shlex.quote(helper_tmp)} {shlex.quote(CLOUDFLARE_HELPER_REMOTE)}; "
        f"sudo -n /usr/bin/install -o root -g root -m 0644 {shlex.quote(unit_tmp)} {shlex.quote(CLOUDFLARE_UNIT_REMOTE)}; "
        f"rm -f {shlex.quote(helper_tmp)} {shlex.quote(unit_tmp)}; "
        "sudo -n /usr/bin/systemctl daemon-reload"
    )
    proc = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", CLOUDFLARE_SSH, remote],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=45,
        check=False,
    )
    if proc.returncode != 0:
        raise EdgeAuditError("Cloudflare runtime install failed: " + (proc.stderr or proc.stdout)[-1500:])
    status = cloudflare_runtime_status()
    if not status["exact"]:
        raise EdgeAuditError("Cloudflare runtime install completed but hash parity is not exact")
    return status


def remote_cloudflare_service(command: str) -> dict[str, Any]:
    if command not in {"verify", "snapshot", "apply", "rollback", "apply-dynamic", "rollback-dynamic", "apply-asset", "rollback-asset", "apply-featured-avatar", "rollback-featured-avatar"}:
        raise EdgeAuditError(f"unsupported Cloudflare helper command: {command}")
    unit = CLOUDFLARE_UNIT.format(command=command)
    remote = (
        f"set -e; sudo -n /usr/bin/systemctl reset-failed {shlex.quote(unit)} >/dev/null 2>&1 || true; "
        f"sudo -n /usr/bin/systemctl start --wait {shlex.quote(unit)}; "
        f"sudo -n /usr/bin/journalctl -u {shlex.quote(unit)} -n 30 --no-pager -o cat"
    )
    proc = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", CLOUDFLARE_SSH, remote],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=90,
        check=False,
    )
    if proc.returncode != 0:
        raise EdgeAuditError(
            f"Cloudflare helper {command} failed: " + (proc.stderr or proc.stdout)[-2000:].strip()
        )
    for line in reversed(proc.stdout.splitlines()):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if payload.get("command") == command:
            if not payload.get("ok"):
                raise EdgeAuditError(f"Cloudflare helper {command} rejected: {payload.get('error')}")
            return payload
    raise EdgeAuditError(f"Cloudflare helper {command} returned no machine-readable result")


def stage_cloudflare_request(plan: dict[str, Any]) -> tuple[dict[str, Any], str]:
    expression = plan.get("proposed_cache_rule_expression")
    routes = plan.get("eligible_exact_routes") or []
    cookie_names = plan.get("cookie_bypass_names") or []
    discovered_cookie_names = discover_app_cookie_names()
    if not expression or not routes:
        raise EdgeAuditError("Cloudflare plan has no eligible exact-route cohort")
    if cookie_names != discovered_cookie_names:
        raise EdgeAuditError("Cloudflare plan cookie bypasses are stale relative to current source")
    canonical_plan = json.dumps(plan, sort_keys=True, separators=(",", ":")).encode()
    plan_sha = hashlib.sha256(canonical_plan).hexdigest()
    request = {
        "schema": 2,
        "kind": "aoe2war-speedos-cloudflare-apply-request",
        "generated_at": utc_now(),
        "zone_name": "aoe2war.com",
        "expression": expression,
        "edge_ttl_seconds": int(plan.get("edge_ttl_seconds") or 300),
        "eligible_exact_routes": routes,
        "cookie_bypass_names": cookie_names,
        "plan_sha256": plan_sha,
        "operator_source_sha": speed.git_head(ROOT),
    }
    encoded = json.dumps(request, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, prefix="aoe2war-cf-", suffix=".json") as handle:
        handle.write(encoded)
        local_path = Path(handle.name)
    remote_tmp = f"/tmp/aoe2war-speedos-cloudflare-request-{os.getpid()}.json"
    try:
        copy = subprocess.run(
            ["scp", "-q", str(local_path), f"{CLOUDFLARE_SSH}:{remote_tmp}"],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
            check=False,
        )
        if copy.returncode != 0:
            raise EdgeAuditError("Cloudflare apply-request transfer failed: " + copy.stderr[-1000:])
        install = subprocess.run(
            [
                "ssh", "-o", "BatchMode=yes", CLOUDFLARE_SSH,
                "set -e; "
                f"sudo -n /usr/bin/install -o root -g root -m 0600 {shlex.quote(remote_tmp)} "
                f"{shlex.quote(CLOUDFLARE_REMOTE_STATE + '/request.json')}; "
                f"rm -f {shlex.quote(remote_tmp)}",
            ],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
            check=False,
        )
        if install.returncode != 0:
            raise EdgeAuditError("Cloudflare apply-request install failed: " + install.stderr[-1000:])
    finally:
        local_path.unlink(missing_ok=True)
    return request, plan_sha


def slugify_avatar_target(value: str) -> str:
    normalized = str(value or "").strip().lower()
    normalized = normalized.replace("&", " and ")
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return normalized[:160]


def canonical_featured_avatar_expression(
    paths: list[str],
    cache_version: str = FEATURED_AVATAR_CACHE_VERSION,
) -> str:
    quoted = " ".join(f'"{path}"' for path in paths)
    return (
        '(http.host eq "aoe2war.com" and '
        'http.request.method in {"GET" "HEAD"} and '
        f'http.request.uri.path in {{{quoted}}} and '
        'len(http.request.uri.args["size"]) eq 1 and '
        'any(http.request.uri.args["size"][*] == "card") and '
        'len(http.request.uri.args["v"]) eq 1 and '
        f'any(http.request.uri.args["v"][*] == "{cache_version}"))'
    )


def discover_live_featured_avatar_paths() -> dict[str, Any]:
    proc = subprocess.run(
        ["curl", "-fsS", "--max-time", "20", PUBLIC_BASE + "/api/lobby"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=25,
        check=False,
    )
    if proc.returncode != 0:
        raise EdgeAuditError("featured-avatar roster discovery failed: " + (proc.stderr or "curl failed")[-500:])
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise EdgeAuditError(f"featured-avatar roster discovery returned invalid JSON: {exc}") from None
    entries = payload.get("featuredWarriorEntries") or []
    if not isinstance(entries, list) or not entries:
        raise EdgeAuditError("featured-avatar roster discovery returned no featured warriors")
    uids = {
        str(row.get("uid") or "").strip()
        for row in entries
        if isinstance(row, dict) and row.get("hasFeaturedAvatar") and row.get("uid")
    }
    uids.update(FEATURED_AVATAR_EXTRA_UIDS)
    paths = sorted(
        f"/api/media-assets/avatar/user-{slugify_avatar_target(uid)}-featured"
        for uid in uids
        if slugify_avatar_target(uid)
    )
    if not paths or len(paths) > 64 or len(paths) != len(set(paths)):
        raise EdgeAuditError("featured-avatar roster produced an invalid exact-path cohort")
    roster_sha = hashlib.sha256(
        json.dumps(paths, separators=(",", ":"), sort_keys=True).encode()
    ).hexdigest()
    return {
        "paths": paths,
        "roster_sha256": roster_sha,
        "featured_entry_count": len(entries),
        "eligible_path_count": len(paths),
    }


def build_featured_avatar_cloudflare_plan() -> dict[str, Any]:
    identity = require_dynamic_release_identity()
    roster = discover_live_featured_avatar_paths()
    paths = roster["paths"]
    return {
        "schema": 1,
        "kind": "aoe2war-speedos-cloudflare-featured-avatar-plan",
        "generated_at": utc_now(),
        "mutation_authorized": True,
        "release_sha": identity["release_sha"],
        "operator_source_sha": identity["operator_source_sha"],
        "eligible_exact_paths": paths,
        "eligible_path_count": len(paths),
        "featured_entry_count": roster["featured_entry_count"],
        "roster_sha256": roster["roster_sha256"],
        "cache_version": FEATURED_AVATAR_CACHE_VERSION,
        "edge_ttl_seconds": FEATURED_AVATAR_EDGE_TTL_SECONDS,
        "vary_default": "bypass",
        "vary_accept": "normalize",
        "vary_media_types": list(FEATURED_AVATAR_VARY_MEDIA_TYPES),
        "vary_passthrough_headers": list(FEATURED_AVATAR_PASSTHROUGH_HEADERS),
        "query_string_preserved": True,
        "expression": canonical_featured_avatar_expression(paths),
    }


def stage_featured_avatar_cloudflare_request(plan: dict[str, Any]) -> tuple[dict[str, Any], str]:
    identity = require_dynamic_release_identity()
    if plan.get("release_sha") != identity.get("release_sha"):
        raise EdgeAuditError("featured-avatar plan is stale relative to current certified release")
    roster = discover_live_featured_avatar_paths()
    if plan.get("roster_sha256") != roster.get("roster_sha256"):
        raise EdgeAuditError("featured-avatar plan is stale relative to live featured roster")
    paths = list(plan.get("eligible_exact_paths") or [])
    if paths != roster.get("paths"):
        raise EdgeAuditError("featured-avatar plan paths differ from live featured roster")
    if plan.get("expression") != canonical_featured_avatar_expression(paths):
        raise EdgeAuditError("featured-avatar plan expression is not canonical")
    canonical = json.dumps(plan, sort_keys=True, separators=(",", ":")).encode()
    plan_sha = hashlib.sha256(canonical).hexdigest()
    request = {
        "schema": 1,
        "kind": "aoe2war-speedos-cloudflare-featured-avatar-apply-request",
        "generated_at": utc_now(),
        "zone_name": "aoe2war.com",
        "eligible_exact_paths": paths,
        "cache_version": FEATURED_AVATAR_CACHE_VERSION,
        "edge_ttl_seconds": FEATURED_AVATAR_EDGE_TTL_SECONDS,
        "vary_media_types": list(FEATURED_AVATAR_VARY_MEDIA_TYPES),
        "vary_passthrough_headers": list(FEATURED_AVATAR_PASSTHROUGH_HEADERS),
        "expression": plan["expression"],
        "plan_sha256": plan_sha,
        "roster_sha256": plan["roster_sha256"],
        "operator_source_sha": identity["operator_source_sha"],
    }
    encoded = json.dumps(request, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", delete=False, prefix="aoe2war-cf-featured-avatar-", suffix=".json"
    ) as handle:
        handle.write(encoded)
        local_path = Path(handle.name)
    remote_tmp = f"/tmp/aoe2war-speedos-cloudflare-featured-avatar-request-{os.getpid()}.json"
    try:
        copy = subprocess.run(
            ["scp", "-q", str(local_path), f"{CLOUDFLARE_SSH}:{remote_tmp}"],
            cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=30, check=False,
        )
        if copy.returncode != 0:
            raise EdgeAuditError("featured-avatar request transfer failed: " + copy.stderr[-1000:])
        install = subprocess.run(
            [
                "ssh", "-o", "BatchMode=yes", CLOUDFLARE_SSH,
                "set -e; "
                + f"sudo -n /usr/bin/install -o root -g root -m 0600 {shlex.quote(remote_tmp)} "
                + f"{shlex.quote(CLOUDFLARE_REMOTE_STATE + '/featured-avatar-request.json')}; "
                + f"rm -f {shlex.quote(remote_tmp)}",
            ],
            cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=30, check=False,
        )
        if install.returncode != 0:
            raise EdgeAuditError("featured-avatar request install failed: " + install.stderr[-1000:])
    finally:
        local_path.unlink(missing_ok=True)
    return request, plan_sha


def canonical_asset_expression(
    source_path: str,
    responsive_widths: list[int],
    quality: int = ASSET_QUALITY,
) -> str:
    encoded_source = urllib.parse.quote(source_path, safe="")
    width_checks = " or ".join(
        f'any(http.request.uri.args["w"][*] == "{width}")'
        for width in responsive_widths
    )
    return (
        '(http.host eq "aoe2war.com" and '
        'http.request.method in {"GET" "HEAD"} and '
        'http.request.uri.path eq "/_next/image" and '
        'len(http.request.uri.args["url"]) eq 1 and '
        f'any(http.request.uri.args["url"][*] == "{encoded_source}") and '
        'len(http.request.uri.args["q"]) eq 1 and '
        f'any(http.request.uri.args["q"][*] == "{quality}") and '
        'len(http.request.uri.args["w"]) eq 1 and '
        f'({width_checks}))'
    )


def extract_hero_image_candidates(home_html: str) -> list[dict[str, Any]]:
    decoded = html.unescape(home_html)
    urls = re.findall(r'/_next/image\?[^"\'< >]+', decoded)
    rows: dict[tuple[str, int, int], dict[str, Any]] = {}
    for raw in urls:
        parsed = urllib.parse.urlsplit(raw)
        query = urllib.parse.parse_qs(parsed.query)
        source_path = (query.get("url") or [""])[0]
        try:
            width = int((query.get("w") or ["0"])[0])
            quality = int((query.get("q") or ["0"])[0])
        except ValueError:
            continue
        if (
            source_path.startswith("/uploads/managed-assets/background/hero-chain-")
            and quality == ASSET_QUALITY
            and width > 0
        ):
            key = (source_path, width, quality)
            rows[key] = {
                "source_path": source_path,
                "width": width,
                "quality": quality,
                "next_image_path": raw,
            }
    return sorted(rows.values(), key=lambda row: (row["source_path"], row["width"]))


def discover_live_hero_image() -> dict[str, Any]:
    proc = subprocess.run(
        ["curl", "-fsS", "--max-time", "20", PUBLIC_BASE + "/"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=25,
        check=False,
    )
    if proc.returncode != 0:
        raise EdgeAuditError("live hero discovery failed: " + (proc.stderr or "curl failed")[-500:])
    candidates = extract_hero_image_candidates(proc.stdout)
    sources = sorted({row["source_path"] for row in candidates})
    if len(sources) != 1:
        raise EdgeAuditError(
            f"live hero discovery requires exactly one q95 hero source; found {len(sources)}"
        )
    widths = sorted({row["width"] for row in candidates})
    if ASSET_PROBE_WIDTH not in widths:
        raise EdgeAuditError(
            f"live hero discovery did not expose the required {ASSET_PROBE_WIDTH}px LCP variant"
        )
    source_path = sources[0]
    return {
        "source_path": source_path,
        "quality": ASSET_QUALITY,
        "widths": widths,
        "probe_width": ASSET_PROBE_WIDTH,
        "candidate_count": len(candidates),
    }


def build_asset_cloudflare_plan() -> dict[str, Any]:
    identity = require_dynamic_release_identity()
    hero = discover_live_hero_image()
    source_path = hero["source_path"]
    return {
        "schema": 1,
        "kind": "aoe2war-speedos-cloudflare-asset-plan",
        "generated_at": utc_now(),
        "mutation_authorized": True,
        "release_sha": identity["release_sha"],
        "operator_source_sha": identity["operator_source_sha"],
        "source_path": source_path,
        "quality": ASSET_QUALITY,
        "probe_width": ASSET_PROBE_WIDTH,
        "responsive_widths": hero["widths"],
        "edge_ttl_seconds": ASSET_EDGE_TTL_SECONDS,
        "vary_default": "bypass",
        "vary_accept": "normalize",
        "vary_media_types": list(ASSET_VARY_MEDIA_TYPES),
        "query_string_preserved": True,
        "expression": canonical_asset_expression(source_path, hero["widths"]),
    }


def stage_asset_cloudflare_request(plan: dict[str, Any]) -> tuple[dict[str, Any], str]:
    identity = require_dynamic_release_identity()
    if plan.get("release_sha") != identity.get("release_sha"):
        raise EdgeAuditError("asset Cloudflare plan is stale relative to current certified release")
    hero = discover_live_hero_image()
    if plan.get("source_path") != hero.get("source_path"):
        raise EdgeAuditError("asset Cloudflare plan is stale relative to the live hero")
    if plan.get("expression") != canonical_asset_expression(
        str(plan.get("source_path") or ""),
        list(plan.get("responsive_widths") or []),
    ):
        raise EdgeAuditError("asset Cloudflare plan expression is not canonical")
    canonical = json.dumps(plan, sort_keys=True, separators=(",", ":")).encode()
    plan_sha = hashlib.sha256(canonical).hexdigest()
    request = {
        "schema": 1,
        "kind": "aoe2war-speedos-cloudflare-asset-apply-request",
        "generated_at": utc_now(),
        "zone_name": "aoe2war.com",
        "source_path": plan["source_path"],
        "quality": ASSET_QUALITY,
        "responsive_widths": list(plan["responsive_widths"]),
        "edge_ttl_seconds": ASSET_EDGE_TTL_SECONDS,
        "vary_media_types": list(ASSET_VARY_MEDIA_TYPES),
        "expression": plan["expression"],
        "plan_sha256": plan_sha,
        "operator_source_sha": identity["operator_source_sha"],
    }
    encoded = json.dumps(request, indent=2, sort_keys=True) + "\n"
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", delete=False, prefix="aoe2war-cf-asset-", suffix=".json"
    ) as handle:
        handle.write(encoded)
        local_path = Path(handle.name)
    remote_tmp = f"/tmp/aoe2war-speedos-cloudflare-asset-request-{os.getpid()}.json"
    try:
        copy = subprocess.run(
            ["scp", "-q", str(local_path), f"{CLOUDFLARE_SSH}:{remote_tmp}"],
            cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=30, check=False,
        )
        if copy.returncode != 0:
            raise EdgeAuditError("asset Cloudflare request transfer failed: " + copy.stderr[-1000:])
        install = subprocess.run(
            [
                "ssh", "-o", "BatchMode=yes", CLOUDFLARE_SSH,
                "set -e; "
                + f"sudo -n /usr/bin/install -o root -g root -m 0600 {shlex.quote(remote_tmp)} "
                + f"{shlex.quote(CLOUDFLARE_REMOTE_STATE + '/asset-request.json')}; "
                + f"rm -f {shlex.quote(remote_tmp)}",
            ],
            cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=30, check=False,
        )
        if install.returncode != 0:
            raise EdgeAuditError("asset Cloudflare request install failed: " + install.stderr[-1000:])
    finally:
        local_path.unlink(missing_ok=True)
    return request, plan_sha


def asset_probe(
    source_path: str,
    *,
    accept: str,
    width: int = ASSET_PROBE_WIDTH,
    quality: int = ASSET_QUALITY,
) -> dict[str, Any]:
    query = urllib.parse.urlencode({"url": source_path, "w": width, "q": quality})
    target = f"{PUBLIC_BASE}/_next/image?{query}"
    with tempfile.TemporaryDirectory(prefix="aoe2war-asset-probe-") as tmp:
        headers_path = Path(tmp) / "headers.txt"
        body_path = Path(tmp) / "body.bin"
        proc = subprocess.run(
            [
                "curl", "-sS", "-L", "--max-time", "20",
                "-H", f"Accept: {accept}",
                "-D", str(headers_path),
                "-o", str(body_path),
                "-w", "%{http_code}\t%{time_starttransfer}\t%{time_total}",
                target,
            ],
            cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=25, check=False,
        )
        if proc.returncode != 0:
            return {"ok": False, "error": (proc.stderr or "curl failed")[-500:]}
        fields = proc.stdout.strip().split("\t")
        raw_headers = headers_path.read_text(encoding="utf-8", errors="replace")
        headers = parse_final_header_block(raw_headers)
        body = body_path.read_bytes()
        return {
            "ok": bool(fields) and fields[0] == "200",
            "url": target,
            "http_status": int(fields[0]) if fields and fields[0].isdigit() else 0,
            "ttfb_ms": round(float(fields[1]) * 1000, 3) if len(fields) > 1 else None,
            "total_ms": round(float(fields[2]) * 1000, 3) if len(fields) > 2 else None,
            "body_sha256": hashlib.sha256(body).hexdigest(),
            "bytes": len(body),
            "content_type": str(headers.get("content-type") or ""),
            "cache_control": str(headers.get("cache-control") or ""),
            "vary": str(headers.get("vary") or ""),
            "cf_cache_status": str(headers.get("cf-cache-status") or "").upper() or None,
            "next_cache_status": str(headers.get("x-nextjs-cache") or "").upper() or None,
            "age": headers.get("age"),
            "cf_ray": headers.get("cf-ray"),
            "accept": accept,
            "width": width,
            "quality": quality,
        }


def _converge_html_hit(route: str, *, attempts: int = 5, sleep_fn=time.sleep) -> dict[str, Any]:
    rows = []
    for attempt in range(attempts):
        probe = cache_status_probe(route)
        rows.append(probe)
        if probe.get("ok") and probe.get("cf_cache_status") == "HIT":
            break
        if attempt < attempts - 1:
            sleep_fn(STATIC_VERIFY_BACKOFF_SECONDS)
    return {"route": route, "attempts": rows, "final": rows[-1]}


def verify_asset_cloudflare_apply(
    asset_plan: dict[str, Any],
    static_plan: dict[str, Any],
    dynamic_plan: dict[str, Any],
    *,
    sleep_fn=time.sleep,
) -> dict[str, Any]:
    source_path = str(asset_plan.get("source_path") or "")
    failures: list[str] = []
    variants: list[dict[str, Any]] = []
    for label, accept in (
        ("modern", ASSET_MODERN_ACCEPT),
        ("fallback", ASSET_FALLBACK_ACCEPT),
    ):
        attempts = []
        for attempt in range(4):
            probe = asset_probe(source_path, accept=accept)
            attempts.append(probe)
            if probe.get("ok") and probe.get("cf_cache_status") == "HIT":
                break
            if attempt < 3:
                sleep_fn(0.75)
        final = attempts[-1]
        successful = [row for row in attempts if row.get("ok")]
        hashes = {row.get("body_sha256") for row in successful}
        types = {row.get("content_type") for row in successful}
        variants.append({"variant": label, "attempts": attempts, "final": final})
        if not final.get("ok") or final.get("cf_cache_status") != "HIT":
            failures.append(f"hero {label} variant did not converge to Cloudflare HIT")
        if len(hashes) != 1:
            failures.append(f"hero {label} variant body changed across MISS/HIT boundary")
        if len(types) != 1 or not str(final.get("content_type") or "").lower().startswith("image/"):
            failures.append(f"hero {label} variant content type was not stable image content")
        if "accept" not in str(final.get("vary") or "").lower():
            failures.append(f"hero {label} variant lost origin Vary: Accept")
        if int(final.get("bytes") or 0) < 10_000:
            failures.append(f"hero {label} variant body is unexpectedly small")

    responsive = []
    for width in (1080, ASSET_PROBE_WIDTH):
        attempts = []
        for attempt in range(3):
            probe = asset_probe(source_path, accept=ASSET_MODERN_ACCEPT, width=width)
            attempts.append(probe)
            if probe.get("ok") and probe.get("cf_cache_status") == "HIT":
                break
            if attempt < 2:
                sleep_fn(0.5)
        responsive.append({"width": width, "attempts": attempts, "final": attempts[-1]})
        if attempts[-1].get("cf_cache_status") != "HIT":
            failures.append(f"hero width {width} did not converge to HIT")

    excluded_quality = asset_probe(
        source_path,
        accept=ASSET_MODERN_ACCEPT,
        quality=90,
    )
    if excluded_quality.get("cf_cache_status") == "HIT":
        failures.append("q90 hero variant incorrectly entered the q95 asset cache rule")

    static_rows = []
    for route in list(static_plan.get("eligible_exact_routes") or []):
        row = _converge_html_hit(route, sleep_fn=sleep_fn)
        static_rows.append(row)
        if row["final"].get("cf_cache_status") != "HIT":
            failures.append(f"{route}: existing static HTML rule lost HIT after asset apply")

    dynamic_rows = []
    for route in list(dynamic_plan.get("eligible_exact_routes") or []):
        row = _converge_html_hit(route, sleep_fn=sleep_fn)
        dynamic_rows.append(row)
        if row["final"].get("cf_cache_status") != "HIT":
            failures.append(f"{route}: existing dynamic HTML rule lost HIT after asset apply")

    api = cache_status_probe("/api/deployment-version")
    if api.get("cf_cache_status") == "HIT":
        failures.append("/api/deployment-version incorrectly entered shared cache after asset apply")

    return {
        "ok": not failures,
        "generated_at": utc_now(),
        "asset_variants": variants,
        "responsive_widths": responsive,
        "excluded_q90": excluded_quality,
        "static_cohort": static_rows,
        "dynamic_cohort": dynamic_rows,
        "api_probe": api,
        "failures": failures,
    }


def featured_avatar_probe(
    path: str,
    *,
    accept: str = ASSET_MODERN_ACCEPT,
    size: str = "card",
    cache_version: str = FEATURED_AVATAR_CACHE_VERSION,
) -> dict[str, Any]:
    query = urllib.parse.urlencode(
        {
            "fallback": "/champions/players/silhouette.webp",
            "v": cache_version,
            "size": size,
        }
    )
    target = PUBLIC_BASE + path + "?" + query
    with tempfile.TemporaryDirectory(prefix="aoe2war-avatar-probe-") as tmp:
        header_path = Path(tmp) / "headers.txt"
        body_path = Path(tmp) / "body.bin"
        proc = subprocess.run(
            [
                "curl", "-sS", "--compressed", "--max-time", "20",
                "-H", f"Accept: {accept}",
                "-D", str(header_path), "-o", str(body_path),
                "-w", "%{http_code}	%{time_starttransfer}	%{time_total}",
                target,
            ],
            cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=25, check=False,
        )
        if proc.returncode != 0:
            return {"ok": False, "path": path, "error": (proc.stderr or "curl failed")[-500:]}
        fields = proc.stdout.strip().split("	")
        headers = parse_final_header_block(header_path.read_text(errors="replace"))
        body = body_path.read_bytes()
        return {
            "ok": len(fields) == 3 and fields[0] == "200",
            "path": path,
            "url": target,
            "http_status": int(fields[0]) if fields and fields[0].isdigit() else 0,
            "ttfb_ms": float(fields[1]) * 1000 if len(fields) > 1 else None,
            "total_ms": float(fields[2]) * 1000 if len(fields) > 2 else None,
            "bytes": len(body),
            "body_sha256": hashlib.sha256(body).hexdigest(),
            "content_type": headers.get("content-type"),
            "cache_control": headers.get("cache-control"),
            "vary": headers.get("vary"),
            "cf_cache_status": str(headers.get("cf-cache-status") or "").upper() or None,
            "age": headers.get("age"),
            "cf_ray": headers.get("cf-ray"),
            "accept": accept,
            "size": size,
            "cache_version": cache_version,
        }


def verify_featured_avatar_cloudflare_apply(
    avatar_plan: dict[str, Any],
    static_plan: dict[str, Any],
    dynamic_plan: dict[str, Any],
    *,
    sleep_fn=time.sleep,
) -> dict[str, Any]:
    failures: list[str] = []
    rows: list[dict[str, Any]] = []
    for path in list(avatar_plan.get("eligible_exact_paths") or []):
        attempts = []
        for attempt in range(4):
            probe = featured_avatar_probe(path)
            attempts.append(probe)
            if probe.get("ok") and probe.get("cf_cache_status") == "HIT":
                break
            if attempt < 3:
                sleep_fn(0.5)
        final = attempts[-1]
        successful = [row for row in attempts if row.get("ok")]
        hashes = {row.get("body_sha256") for row in successful}
        rows.append({"path": path, "attempts": attempts, "final": final})
        if not final.get("ok") or final.get("cf_cache_status") != "HIT":
            failures.append(f"{path}: featured avatar did not converge to HIT")
        if len(hashes) != 1:
            failures.append(f"{path}: featured avatar body changed across cache boundary")
        if not str(final.get("content_type") or "").lower().startswith("image/"):
            failures.append(f"{path}: featured avatar content type is not image/*")
        if int(final.get("bytes") or 0) < 5_000:
            failures.append(f"{path}: featured avatar body is unexpectedly small")

    representative = str((avatar_plan.get("eligible_exact_paths") or [""])[0])
    fallback_attempts = []
    for attempt in range(3):
        row = featured_avatar_probe(representative, accept=ASSET_FALLBACK_ACCEPT)
        fallback_attempts.append(row)
        if row.get("ok") and row.get("cf_cache_status") == "HIT":
            break
        if attempt < 2:
            sleep_fn(0.5)
    fallback_final = fallback_attempts[-1]
    if not fallback_final.get("ok") or fallback_final.get("cf_cache_status") != "HIT":
        failures.append("featured-avatar fallback Accept variant did not converge to HIT")

    excluded_size = featured_avatar_probe(representative, size="thumb")
    if excluded_size.get("cf_cache_status") == "HIT":
        failures.append("featured-avatar thumb request incorrectly entered card rule")
    excluded_version = featured_avatar_probe(representative, cache_version="speedos-excluded")
    if excluded_version.get("cf_cache_status") == "HIT":
        failures.append("featured-avatar wrong-version request incorrectly entered cache rule")

    static_rows = []
    for route in list(static_plan.get("eligible_exact_routes") or []):
        row = _converge_html_hit(route, sleep_fn=sleep_fn)
        static_rows.append(row)
        if row["final"].get("cf_cache_status") != "HIT":
            failures.append(f"{route}: static HTML rule lost HIT after featured-avatar apply")

    dynamic_rows = []
    for route in list(dynamic_plan.get("eligible_exact_routes") or []):
        row = _converge_html_hit(route, sleep_fn=sleep_fn)
        dynamic_rows.append(row)
        if row["final"].get("cf_cache_status") != "HIT":
            failures.append(f"{route}: dynamic HTML rule lost HIT after featured-avatar apply")

    hero_plan = build_asset_cloudflare_plan()
    hero = asset_probe(str(hero_plan["source_path"]), accept=ASSET_MODERN_ACCEPT)
    if hero.get("cf_cache_status") != "HIT":
        failures.append("certified hero asset rule lost HIT after featured-avatar apply")
    api = cache_status_probe("/api/deployment-version")
    if api.get("cf_cache_status") == "HIT":
        failures.append("/api/deployment-version incorrectly entered cache after featured-avatar apply")

    return {
        "ok": not failures,
        "generated_at": utc_now(),
        "featured_avatar_rows": rows,
        "fallback_accept": {"attempts": fallback_attempts, "final": fallback_final},
        "excluded_thumb": excluded_size,
        "excluded_version": excluded_version,
        "hero_probe": hero,
        "static_cohort": static_rows,
        "dynamic_cohort": dynamic_rows,
        "api_probe": api,
        "failures": failures,
    }


def cache_status_probe(
    path: str,
    *,
    cookie: str | None = None,
    rsc: bool = False,
    query: str | None = None,
) -> dict[str, Any]:
    if rsc and query is not None:
        raise EdgeAuditError("cache probe cannot combine explicit query and RSC probe")
    suffix = "_rsc=speedos" if rsc else query
    target = PUBLIC_BASE + path + (("&" if "?" in path else "?") + suffix if suffix else "")
    command = [
        "curl", "-sS", "--compressed", "--max-time", "15", "-D", "-", "-o", "/dev/null",
        "-w", "\\n__AOE2_SPEED__%{http_code}\\t%{time_starttransfer}\\t%{time_total}\\n",
    ]
    if cookie:
        command += ["-H", f"Cookie: {cookie}"]
    if rsc:
        command += ["-H", "RSC: 1"]
    command.append(target)
    proc = subprocess.run(command, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20, check=False)
    if proc.returncode != 0:
        return {"ok": False, "error": (proc.stderr or "curl failed")[-500:]}
    before, sep, tail = proc.stdout.rpartition("__AOE2_SPEED__")
    headers = parse_final_header_block(before)
    fields = tail.strip().split("\t") if sep else []
    return {
        "ok": bool(sep) and fields and fields[0] == "200",
        "http_status": int(fields[0]) if fields and fields[0].isdigit() else 0,
        "ttfb_ms": round(float(fields[1]) * 1000, 3) if len(fields) > 1 else None,
        "total_ms": round(float(fields[2]) * 1000, 3) if len(fields) > 2 else None,
        "cf_cache_status": str(headers.get("cf-cache-status") or "").upper() or None,
        "age": headers.get("age"),
    }


def verify_cloudflare_apply(plan: dict[str, Any]) -> dict[str, Any]:
    routes = list(plan.get("eligible_exact_routes") or [])
    anonymous = []
    failures = []
    for route in routes:
        attempts = []
        for attempt in range(4):
            probe = cache_status_probe(route)
            attempts.append(probe)
            if probe.get("ok") and probe.get("cf_cache_status") == "HIT":
                break
            if attempt < 3:
                time.sleep(0.75)
        final = attempts[-1]
        row = {"route": route, "attempts": attempts, "final": final}
        anonymous.append(row)
        if not final.get("ok") or final.get("cf_cache_status") != "HIT":
            failures.append(f"{route}: anonymous request did not converge to HIT")
    bypass = []
    for route in routes[: min(5, len(routes))]:
        cookie = cache_status_probe(route, cookie=f"{SESSION_COOKIE_NAME}=speedos-proof")
        rsc = cache_status_probe(route, rsc=True)
        bypass.append({"route": route, "cookie": cookie, "rsc": rsc})
        if cookie.get("cf_cache_status") == "HIT":
            failures.append(f"{route}: session-cookie request incorrectly HIT shared cache")
        if rsc.get("cf_cache_status") == "HIT":
            failures.append(f"{route}: RSC request incorrectly HIT phase-1 shared cache")
    api = cache_status_probe("/api/deployment-version")
    if api.get("cf_cache_status") == "HIT":
        failures.append("/api/deployment-version incorrectly HIT shared cache")
    return {
        "ok": not failures,
        "generated_at": utc_now(),
        "anonymous": anonymous,
        "bypass_samples": bypass,
        "api_probe": api,
        "failures": failures,
    }



def verify_dynamic_cloudflare_apply(
    dynamic_plan: dict[str, Any],
    static_plan: dict[str, Any],
    *,
    sleep_fn=time.sleep,
) -> dict[str, Any]:
    dynamic_routes = list(dynamic_plan.get("eligible_exact_routes") or [])
    static_routes = list(static_plan.get("eligible_exact_routes") or [])
    failures: list[str] = []
    anonymous: list[dict[str, Any]] = []
    for route in dynamic_routes:
        attempts: list[dict[str, Any]] = []
        for attempt in range(4):
            probe = cache_status_probe(route)
            attempts.append(probe)
            if probe.get("ok") and probe.get("cf_cache_status") == "HIT":
                break
            if attempt < 3:
                time.sleep(0.75)
        final = attempts[-1]
        anonymous.append({"route": route, "attempts": attempts, "final": final})
        if not final.get("ok") or final.get("cf_cache_status") != "HIT":
            failures.append(f"{route}: qualified anonymous empty-query HTML did not converge to HIT")

    bypass: list[dict[str, Any]] = []
    cookie_names = list(dynamic_plan.get("cookie_bypass_names") or [])
    for route in dynamic_routes:
        cookie_rows = []
        for name in cookie_names:
            probe = cache_status_probe(route, cookie=f"{name}=speedos-proof")
            cookie_rows.append({"cookie": name, "probe": probe})
            if probe.get("cf_cache_status") != "DYNAMIC":
                failures.append(
                    f"{route}: cookie {name} expected DYNAMIC, got {probe.get('cf_cache_status') or 'NONE'}"
                )
        rsc = cache_status_probe(route, rsc=True)
        query = cache_status_probe(route, query="speedos_probe=1")
        bypass.append({"route": route, "cookies": cookie_rows, "rsc": rsc, "query": query})
        if rsc.get("cf_cache_status") != "DYNAMIC":
            failures.append(
                f"{route}: RSC request expected DYNAMIC, got {rsc.get('cf_cache_status') or 'NONE'}"
            )
        if query.get("cf_cache_status") != "DYNAMIC":
            failures.append(
                f"{route}: arbitrary-query request expected DYNAMIC, got {query.get('cf_cache_status') or 'NONE'}"
            )

    api = cache_status_probe("/api/deployment-version")
    if api.get("cf_cache_status") != "DYNAMIC":
        failures.append(
            "/api/deployment-version expected DYNAMIC, got "
            + str(api.get("cf_cache_status") or "NONE")
        )

    # A Cloudflare ruleset mutation can temporarily surface a healthy long-lived
    # static object as MISS/EXPIRED while the edge revalidates it. Prime the
    # already-authorized static cohort once, allow a short bounded settle, then
    # require every route to converge back to HIT. The gate remains fail-closed;
    # this only prevents false rollback on asynchronous edge revalidation.
    static_prime: list[dict[str, Any]] = []
    for route in static_routes:
        static_prime.append({"route": route, "probe": cache_status_probe(route)})
    if static_routes:
        sleep_fn(STATIC_VERIFY_SETTLE_SECONDS)

    static_proof: list[dict[str, Any]] = []
    for route in static_routes:
        attempts = []
        for attempt in range(STATIC_VERIFY_ATTEMPTS):
            probe = cache_status_probe(route)
            attempts.append(probe)
            if probe.get("ok") and probe.get("cf_cache_status") == "HIT":
                break
            if attempt < STATIC_VERIFY_ATTEMPTS - 1:
                sleep_fn(STATIC_VERIFY_BACKOFF_SECONDS)
        final = attempts[-1]
        static_proof.append({"route": route, "attempts": attempts, "final": final})
        if not final.get("ok") or final.get("cf_cache_status") != "HIT":
            failures.append(f"{route}: existing static SpeedOS route lost HIT after dynamic apply")

    return {
        "ok": not failures,
        "generated_at": utc_now(),
        "dynamic_anonymous": anonymous,
        "dynamic_bypass": bypass,
        "api_probe": api,
        "static_prime": static_prime,
        "static_settle_seconds": STATIC_VERIFY_SETTLE_SECONDS,
        "static_cohort": static_proof,
        "failures": failures,
    }

def write_edge_operation_receipt(label: str, payload: dict[str, Any]) -> Path:
    EDGE_RECEIPTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = EDGE_RECEIPTS / f"{stamp}-cloudflare-{label}.json"
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def write_receipt(payload: dict[str, Any]) -> Path:
    EDGE_RECEIPTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    release = str(payload.get("benchmark_release_sha") or "unknown")[:12]
    path = EDGE_RECEIPTS / f"{stamp}-{release}-edge-audit.json"
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def print_audit(payload: dict[str, Any], limit: int) -> None:
    print("⚔️  AOE2WAR SPEED EDGE DELIVERY AUDIT")
    print()
    print(f"Routes audited:   {payload['route_count']}")
    print(f"Release measured: {str(payload.get('benchmark_release_sha') or 'unknown')[:12]}")
    for key, value in payload["counts"].items():
        print(f"  {value:>3}  {key}")
    print()
    print("Highest safe delivery opportunities:")
    shown = 0
    for row in payload["rows"]:
        if str(row["priority"]).startswith("blocked"):
            continue
        live = row["live"]
        print(
            f"  {row['score']:>7.1f}  {row['route']:<36} "
            f"{row['priority']:<36} "
            f"gap={float(row.get('warm_delivery_gap_ms') or 0):>6.1f}ms "
            f"cf={live.get('cf_cache_status') or '—'} next={live.get('next_cache_status') or '—'}"
        )
        shown += 1
        if shown >= limit:
            break
    print()
    print("Blocked shared-cache routes remain fail-closed:")
    for row in [row for row in payload["rows"] if str(row["priority"]).startswith("blocked")][:10]:
        print(f"  - {row['route']} · {row['source_cache_classification']}")


def main() -> int:
    parser = argparse.ArgumentParser(prog="aoe2war speed edge")
    parser.add_argument("command", nargs="?", choices=["audit", "plan", "bootstrap", "authority", "snapshot", "apply", "rollback", "qualify-dynamic", "plan-dynamic", "apply-dynamic", "rollback-dynamic", "plan-asset", "apply-asset", "rollback-asset", "plan-featured-avatar", "apply-featured-avatar", "rollback-featured-avatar"], default="audit")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--no-receipt", action="store_true")
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="force a fresh 78-route header audit instead of reusing a current audit for plan",
    )
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 100:
        print("STOP: --limit must be between 1 and 100", file=sys.stderr)
        return 2
    if args.command in {"bootstrap", "authority", "snapshot", "rollback", "rollback-dynamic", "rollback-asset", "rollback-featured-avatar"}:
        try:
            if args.command == "bootstrap":
                runtime = bootstrap_cloudflare_runtime()
                result = {"ok": True, "command": "bootstrap", "runtime": runtime}
            else:
                runtime = require_cloudflare_runtime_exact()
                helper_command = {"authority": "verify", "snapshot": "snapshot", "rollback": "rollback", "rollback-dynamic": "rollback-dynamic", "rollback-asset": "rollback-asset", "rollback-featured-avatar": "rollback-featured-avatar"}[args.command]
                result = remote_cloudflare_service(helper_command)
                result["runtime_exact"] = runtime["exact"]
        except EdgeAuditError as exc:
            print(f"STOP: {exc}", file=sys.stderr)
            return 2
        if args.json:
            print(json.dumps(result, indent=2, sort_keys=True))
        else:
            print("⚔️  AOE2WAR SPEED CLOUDFLARE AUTHORITY")
            print()
            for key, value in result.items():
                if key != "ok":
                    print(f"{key}: {value}")
        return 0

    if args.command in {"plan-featured-avatar", "apply-featured-avatar"}:
        try:
            avatar_plan = build_featured_avatar_cloudflare_plan()
            if args.command == "plan-featured-avatar":
                if args.json:
                    print(json.dumps(avatar_plan, indent=2, sort_keys=True))
                else:
                    print("⚔️  AOE2WAR SPEED FEATURED AVATAR CLOUDFLARE PLAN")
                    print()
                    print(f"Release:         {avatar_plan['release_sha'][:12]}")
                    print(f"Paths:           {avatar_plan['eligible_path_count']}")
                    print(f"Roster SHA:      {avatar_plan['roster_sha256'][:12]}")
                    print(f"Cache version:   {avatar_plan['cache_version']}")
                    print(f"Edge TTL:        {avatar_plan['edge_ttl_seconds']}s")
                    print("Vary:            Accept normalized · Next router headers passthrough")
                    print("Query key:       PRESERVED")
                    print("Mutation:        NOT YET")
                    print()
                    print(avatar_plan["expression"])
                return 0

            static_authority = latest_successful_static_apply()
            dynamic_authority = latest_successful_dynamic_apply()
            asset_authority = latest_successful_asset_apply()
            if not static_authority or not dynamic_authority or not asset_authority:
                raise EdgeAuditError(
                    "featured-avatar apply requires successful static, dynamic and hero-asset authority receipts"
                )
            static_plan = static_authority.get("plan") or {}
            dynamic_plan = dynamic_authority.get("dynamic_plan") or {}
            runtime = require_cloudflare_runtime_exact()
            authority = remote_cloudflare_service("verify")
            authority["runtime_exact"] = runtime["exact"]
            snapshot_result = remote_cloudflare_service("snapshot")
            request, plan_sha = stage_featured_avatar_cloudflare_request(avatar_plan)
            applied = remote_cloudflare_service("apply-featured-avatar")
            verification = verify_featured_avatar_cloudflare_apply(
                avatar_plan, static_plan, dynamic_plan
            )
            receipt_payload = {
                "schema": 1,
                "kind": "aoe2war-speedos-cloudflare-featured-avatar-apply",
                "generated_at": utc_now(),
                "authority": authority,
                "snapshot": snapshot_result,
                "avatar_plan": avatar_plan,
                "static_plan_authority_receipt": speed.evidence_ref(
                    Path(str(static_authority.get("_path") or ""))
                ),
                "dynamic_plan_authority_receipt": speed.evidence_ref(
                    Path(str(dynamic_authority.get("_path") or ""))
                ),
                "asset_plan_authority_receipt": speed.evidence_ref(
                    Path(str(asset_authority.get("_path") or ""))
                ),
                "plan_sha256": plan_sha,
                "request": request,
                "apply": applied,
                "verification": verification,
                "rollback_performed": False,
            }
            if not verification.get("ok"):
                receipt_payload["rollback"] = remote_cloudflare_service("rollback-featured-avatar")
                receipt_payload["rollback_performed"] = True
                receipt = write_edge_operation_receipt("featured-avatar-apply-rolled-back", receipt_payload)
                raise EdgeAuditError(
                    "featured-avatar Cloudflare verification failed and avatar-only rollback completed: "
                    + "; ".join(verification.get("failures") or [])
                    + f" · receipt {speed.evidence_ref(receipt)}"
                )
            receipt = write_edge_operation_receipt("featured-avatar-apply", receipt_payload)
            if args.json:
                print(json.dumps(receipt_payload, indent=2, sort_keys=True))
            else:
                print("⚔️  AOE2WAR SPEED FEATURED AVATAR CLOUDFLARE APPLY")
                print()
                print(f"Paths:          {avatar_plan['eligible_path_count']}")
                print(f"Edge TTL:       {FEATURED_AVATAR_EDGE_TTL_SECONDS}s")
                print("Avatar cohort:  PASS")
                print("Hero asset:     PRESERVED")
                print(f"Static HTML:    {len(static_plan.get('eligible_exact_routes') or [])} preserved")
                print(f"Dynamic HTML:   {len(dynamic_plan.get('eligible_exact_routes') or [])} preserved")
                print("Exclusions:     thumb + wrong-version PASS")
                print("Rollback:       NOT REQUIRED")
                print(f"Receipt:        {speed.evidence_ref(receipt)}")
            return 0
        except EdgeAuditError as exc:
            print(f"STOP: {exc}", file=sys.stderr)
            return 2

    if args.command in {"plan-asset", "apply-asset"}:
        try:
            asset_plan = build_asset_cloudflare_plan()
            if args.command == "plan-asset":
                if args.json:
                    print(json.dumps(asset_plan, indent=2, sort_keys=True))
                else:
                    print("⚔️  AOE2WAR SPEED HERO ASSET CLOUDFLARE PLAN")
                    print()
                    print(f"Release:         {asset_plan['release_sha'][:12]}")
                    print(f"Source:          {asset_plan['source_path']}")
                    print(f"Quality:         q{asset_plan['quality']}")
                    print(f"Widths observed: {len(asset_plan['responsive_widths'])}")
                    print(f"Edge TTL:        {asset_plan['edge_ttl_seconds']}s")
                    print("Vary:            Accept normalized · unexpected Vary headers bypass")
                    print("Query key:       PRESERVED")
                    print("Mutation:        NOT YET")
                    print()
                    print(asset_plan["expression"])
                return 0

            static_authority = latest_successful_static_apply()
            dynamic_authority = latest_successful_dynamic_apply()
            if not static_authority or not dynamic_authority:
                raise EdgeAuditError(
                    "asset apply requires successful static and dynamic Cloudflare authority receipts"
                )
            static_plan = static_authority.get("plan") or {}
            dynamic_plan = dynamic_authority.get("dynamic_plan") or {}
            runtime = require_cloudflare_runtime_exact()
            authority = remote_cloudflare_service("verify")
            authority["runtime_exact"] = runtime["exact"]
            snapshot_result = remote_cloudflare_service("snapshot")
            request, plan_sha = stage_asset_cloudflare_request(asset_plan)
            applied = remote_cloudflare_service("apply-asset")
            verification = verify_asset_cloudflare_apply(asset_plan, static_plan, dynamic_plan)
            receipt_payload = {
                "schema": 1,
                "kind": "aoe2war-speedos-cloudflare-asset-apply",
                "generated_at": utc_now(),
                "authority": authority,
                "snapshot": snapshot_result,
                "asset_plan": asset_plan,
                "static_plan_authority_receipt": speed.evidence_ref(
                    Path(str(static_authority.get("_path") or ""))
                ),
                "dynamic_plan_authority_receipt": speed.evidence_ref(
                    Path(str(dynamic_authority.get("_path") or ""))
                ),
                "plan_sha256": plan_sha,
                "request": request,
                "apply": applied,
                "verification": verification,
                "rollback_performed": False,
            }
            if not verification.get("ok"):
                receipt_payload["rollback"] = remote_cloudflare_service("rollback-asset")
                receipt_payload["rollback_performed"] = True
                receipt = write_edge_operation_receipt("asset-apply-rolled-back", receipt_payload)
                raise EdgeAuditError(
                    "hero asset Cloudflare verification failed and asset-only rollback completed: "
                    + "; ".join(verification.get("failures") or [])
                    + f" · receipt {speed.evidence_ref(receipt)}"
                )
            receipt = write_edge_operation_receipt("asset-apply", receipt_payload)
            if args.json:
                print(json.dumps(receipt_payload, indent=2, sort_keys=True))
            else:
                print("⚔️  AOE2WAR SPEED HERO ASSET CLOUDFLARE APPLY")
                print()
                print(f"Source:         {asset_plan['source_path']}")
                print(f"Edge TTL:       {ASSET_EDGE_TTL_SECONDS}s")
                print("Accept variants: PASS")
                print(f"Static HTML:    {len(static_plan.get('eligible_exact_routes') or [])} preserved")
                print(f"Dynamic HTML:   {len(dynamic_plan.get('eligible_exact_routes') or [])} preserved")
                print("q90 exclusion:  PASS")
                print("Rollback:       NOT REQUIRED")
                print(f"Receipt:        {speed.evidence_ref(receipt)}")
            return 0
        except EdgeAuditError as exc:
            print(f"STOP: {exc}", file=sys.stderr)
            return 2

    if args.command in {"qualify-dynamic", "plan-dynamic", "apply-dynamic"}:
        try:
            source_inventory = inventory.snapshot()
            if args.command == "qualify-dynamic":
                qualification = qualify_dynamic_edge(source_inventory)
                receipt = write_dynamic_qualification_receipt(qualification)
                qualification["receipt"] = speed.evidence_ref(receipt)
                if args.json:
                    print(json.dumps(qualification, indent=2, sort_keys=True))
                else:
                    print("⚔️  AOE2WAR SPEED DYNAMIC EDGE QUALIFICATION")
                    print()
                    print(f"Release:       {str((qualification.get('release_identity') or {}).get('release_sha') or '')[:12]}")
                    print(f"Routes:        {qualification['qualified_count']}/{qualification['route_count']} qualified")
                    print(f"Window:        {qualification['sample_offsets_seconds']} seconds")
                    print(f"Receipt:       {speed.evidence_ref(receipt)}")
                    for row in qualification["rows"]:
                        state = "PASS" if row["qualified"] else "HOLD"
                        detail = "" if row["qualified"] else " · " + "; ".join(row["reasons"])
                        print(f"  {state:<4} {row['route']}{detail}")
                return 0 if qualification.get("all_qualified") else 2

            qualification = latest_dynamic_qualification()
            if not qualification:
                raise EdgeAuditError("no dynamic edge qualification receipt exists; run `aoe2war speed edge qualify-dynamic`")
            dynamic_plan = build_dynamic_cloudflare_plan(qualification)
            if args.command == "plan-dynamic":
                if args.json:
                    print(json.dumps(dynamic_plan, indent=2, sort_keys=True))
                else:
                    print("⚔️  AOE2WAR SPEED DYNAMIC CLOUDFLARE PLAN")
                    print()
                    print(f"Routes:              {len(dynamic_plan['eligible_exact_routes'])}")
                    print(f"Edge TTL:            {dynamic_plan['edge_ttl_seconds']}s")
                    print(f"Empty query only:    YES")
                    print(f"RSC cache:           NO")
                    print(f"Mutation authorized: YES — qualification-bound")
                    print(f"Qualification SHA:   {dynamic_plan['qualification_sha256']}")
                    print()
                    print(dynamic_plan["expression"])
                return 0

            static_authority = latest_successful_static_apply()
            if not static_authority:
                raise EdgeAuditError(
                    "no successful static Cloudflare apply receipt exists; apply the static SpeedOS rule first"
                )
            static_plan = static_authority.get("plan") or {}
            static_authority_path = Path(str(static_authority.get("_path") or ""))
            runtime = require_cloudflare_runtime_exact()
            authority = remote_cloudflare_service("verify")
            authority["runtime_exact"] = runtime["exact"]
            snapshot_result = remote_cloudflare_service("snapshot")
            request, plan_sha = stage_dynamic_cloudflare_request(dynamic_plan)
            applied = remote_cloudflare_service("apply-dynamic")
            verification = verify_dynamic_cloudflare_apply(dynamic_plan, static_plan)
            receipt_payload = {
                "schema": 1,
                "kind": "aoe2war-speedos-cloudflare-dynamic-apply",
                "generated_at": utc_now(),
                "authority": authority,
                "snapshot": snapshot_result,
                "dynamic_plan": dynamic_plan,
                "static_plan": static_plan,
                "static_plan_authority_receipt": speed.evidence_ref(static_authority_path),
                "plan_sha256": plan_sha,
                "request": request,
                "apply": applied,
                "verification": verification,
                "rollback_performed": False,
            }
            if not verification.get("ok"):
                receipt_payload["rollback"] = remote_cloudflare_service("rollback-dynamic")
                receipt_payload["rollback_performed"] = True
                receipt = write_edge_operation_receipt("dynamic-apply-rolled-back", receipt_payload)
                raise EdgeAuditError(
                    "dynamic Cloudflare verification failed and dynamic-only rollback completed: "
                    + "; ".join(verification.get("failures") or [])
                    + f" · receipt {speed.evidence_ref(receipt)}"
                )
            receipt = write_edge_operation_receipt("dynamic-apply", receipt_payload)
            if args.json:
                print(json.dumps(receipt_payload, indent=2, sort_keys=True))
            else:
                print("⚔️  AOE2WAR SPEED DYNAMIC CLOUDFLARE APPLY")
                print()
                print(f"Routes:        {len(dynamic_plan['eligible_exact_routes'])}")
                print(f"Edge TTL:      30s")
                print(f"Verification:  PASS")
                print(f"Static cohort: {len(static_plan['eligible_exact_routes'])}/{len(static_plan['eligible_exact_routes'])} HIT")
                print(f"Rollback:      NOT REQUIRED")
                print(f"Receipt:       {speed.evidence_ref(receipt)}")
            return 0
        except (EdgeAuditError, inventory.InventoryError) as exc:
            print(f"STOP: {exc}", file=sys.stderr)
            return 2

    try:
        source_inventory = inventory.snapshot()
        benchmark = latest_full_cost_stack()
        if not benchmark:
            raise EdgeAuditError("no full per-route Speed OS cost-stack receipt exists")
        reused_audit = False
        if args.command == "plan" and not args.refresh:
            prior = latest_edge_audit()
            if reusable_edge_audit(prior, source_inventory, benchmark):
                payload = prior
                reused_audit = True
            else:
                payload = build_audit(source_inventory=source_inventory, benchmark=benchmark)
        else:
            payload = build_audit(source_inventory=source_inventory, benchmark=benchmark)
    except (EdgeAuditError, inventory.InventoryError) as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        return 2
    if args.command in {"plan", "apply"}:
        static_authority = latest_successful_static_apply()
        installed_plan = (static_authority or {}).get("plan") or {}
        plan = build_cloudflare_plan(payload, installed_plan=installed_plan)
        if static_authority and static_authority.get("_path"):
            plan["installed_plan_authority_receipt"] = speed.evidence_ref(
                Path(str(static_authority["_path"]))
            )
        if args.command == "apply":
            try:
                runtime = require_cloudflare_runtime_exact()
                authority = remote_cloudflare_service("verify")
                authority["runtime_exact"] = runtime["exact"]
                snapshot_result = remote_cloudflare_service("snapshot")
                request, plan_sha = stage_cloudflare_request(plan)
                applied = remote_cloudflare_service("apply")
                verification = verify_cloudflare_apply(plan)
                receipt_payload = {
                    "schema": 1,
                    "kind": "aoe2war-speedos-cloudflare-apply",
                    "generated_at": utc_now(),
                    "authority": authority,
                    "snapshot": snapshot_result,
                    "plan": plan,
                    "plan_sha256": plan_sha,
                    "request": request,
                    "apply": applied,
                    "verification": verification,
                    "rollback_performed": False,
                }
                if not verification.get("ok"):
                    receipt_payload["rollback"] = remote_cloudflare_service("rollback")
                    receipt_payload["rollback_performed"] = True
                    receipt = write_edge_operation_receipt("apply-rolled-back", receipt_payload)
                    raise EdgeAuditError(
                        "Cloudflare post-apply verification failed and rollback completed: "
                        + "; ".join(verification.get("failures") or [])
                        + f" · receipt {speed.evidence_ref(receipt)}"
                    )
                receipt = write_edge_operation_receipt("apply", receipt_payload)
            except EdgeAuditError as exc:
                print(f"STOP: {exc}", file=sys.stderr)
                return 2
            if args.json:
                print(json.dumps(receipt_payload, indent=2, sort_keys=True))
            else:
                print("⚔️  AOE2WAR SPEED CLOUDFLARE APPLY")
                print()
                print(f"Routes:        {len(plan['eligible_exact_routes'])}")
                print(f"Edge TTL:      {plan['edge_ttl_seconds']}s")
                print(f"Verification:  PASS")
                print(f"Rollback:      NOT REQUIRED")
                print(f"Receipt:       {speed.evidence_ref(receipt)}")
            return 0
        plan["reused_fresh_audit"] = reused_audit
        if args.json:
            print(json.dumps(plan, indent=2, sort_keys=True))
        else:
            print("⚔️  AOE2WAR SPEED CLOUDFLARE PLAN")
            print()
            print(f"Eligible exact routes: {len(plan['eligible_exact_routes'])}")
            print(f"Installed before:      {len(plan['installed_exact_routes_before'])}")
            print(f"Preserved installed:   {len(plan['preserved_installed_routes'])}")
            print(f"Newly eligible:        {len(plan['newly_eligible_routes'])}")
            print(f"Revoked installed:     {len(plan['revoked_installed_routes'])}")
            print(f"Blocked routes:        {len(plan['blocked_routes'])}")
            print(f"Review routes:         {len(plan['review_routes'])}")
            print(f"Cookie bypasses:       {len(plan['cookie_bypass_names'])}")
            print(f"Reused fresh audit:    {'YES' if plan.get('reused_fresh_audit') else 'NO'}")
            print("Mutation authorized:   NO")
            print()
            print("Proposed expression:")
            print(plan.get("proposed_cache_rule_expression") or "  none")
        return 0

    receipt = None if args.no_receipt else write_receipt(payload)
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print_audit(payload, args.limit)
        if receipt:
            print()
            print(f"Receipt: {speed.evidence_ref(receipt)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
