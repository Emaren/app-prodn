#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import aoe2_speed as speed
import aoe2_speed_inventory as inventory

PUBLIC_BASE = "https://aoe2war.com"
EDGE_RECEIPTS = speed.STATE / "performance-edge-receipts"
EDGE_AUDIT_REUSE_SECONDS = 15 * 60
SESSION_COOKIE_NAME = "aoe2hdbets_session"
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


def build_cloudflare_plan(audit: dict[str, Any]) -> dict[str, Any]:
    eligible: list[str] = []
    blocked: list[str] = []
    review: list[str] = []
    for row in audit.get("rows") or []:
        route = str(row.get("route") or "")
        priority = str(row.get("priority") or "")
        live = row.get("live") or {}
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
            else:
                review.append(route)

    quoted = " ".join(json.dumps(path) for path in sorted(set(eligible)))
    cookie_names = discover_app_cookie_names()
    cookie_bypass = " and ".join(
        f'not http.cookie contains "{name}="' for name in cookie_names
    )
    expression = (
        '(http.host eq "aoe2war.com" and '
        'http.request.method in {"GET" "HEAD"} and '
        f'{cookie_bypass} and '
        f'http.request.uri.path in {{{quoted}}})'
    ) if eligible else None
    return {
        "schema": 1,
        "kind": "aoe2war-speed-cloudflare-cache-plan",
        "generated_at": utc_now(),
        "mutation_authorized": False,
        "session_cookie_bypass": SESSION_COOKIE_NAME,
        "cookie_bypass_names": cookie_names,
        "eligible_exact_routes": sorted(set(eligible)),
        "blocked_routes": sorted(set(blocked)),
        "review_routes": sorted(set(review)),
        "proposed_cache_rule_expression": expression,
        "cache_behavior": "eligible_for_cache_respect_origin_ttl",
        "requirements": [
            "GET/HEAD only",
            "bypass whenever any known AoE2WAR cookie is present",
            "preserve all /api/ cache-control and no-store contracts",
            "do not include server-personalized or runtime-cookie routes",
            "verify anonymous HTML/RSC equivalence before enabling any new route",
            "purge candidate URLs on every app deployment before certification",
        ],
    }


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
    parser.add_argument("command", nargs="?", choices=["audit", "plan"], default="audit")
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
    if args.command == "plan":
        plan = build_cloudflare_plan(payload)
        plan["reused_fresh_audit"] = reused_audit
        if args.json:
            print(json.dumps(plan, indent=2, sort_keys=True))
        else:
            print("⚔️  AOE2WAR SPEED CLOUDFLARE PLAN")
            print()
            print(f"Eligible exact routes: {len(plan['eligible_exact_routes'])}")
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
