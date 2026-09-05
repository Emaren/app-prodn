#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aoe2_speed as speed
import aoe2_speed_inventory as speed_inventory

ROOT = Path(__file__).resolve().parents[1]
CAMPAIGN_DIR = speed.STATE / "performance-campaigns"

TTFB_MATERIAL_MS = 100.0
TOTAL_MATERIAL_MS = 150.0
MATERIAL_PERCENT = 20.0
HISTORY_LIMIT = 5


class CampaignError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def git_head() -> str:
    proc = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return proc.stdout.strip() if proc.returncode == 0 else "unknown"


def rel(path: str | Path) -> str:
    value = Path(path)
    try:
        return str(value.resolve().relative_to(ROOT))
    except Exception:
        return str(value)


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise CampaignError(f"invalid campaign JSON {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise CampaignError(f"campaign JSON root is not an object: {path}")
    return payload


def campaign_paths() -> list[Path]:
    if not CAMPAIGN_DIR.is_dir():
        return []
    return sorted(
        CAMPAIGN_DIR.glob("*.json"),
        key=lambda path: path.stat().st_mtime,
    )


def all_campaigns() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in campaign_paths():
        try:
            payload = load_json(path)
        except CampaignError:
            continue
        if payload.get("kind") != "aoe2war-performance-campaign":
            continue
        payload["_path"] = str(path)
        rows.append(payload)
    return rows


def latest_campaign(*, open_only: bool = False) -> dict[str, Any] | None:
    campaigns = all_campaigns()
    for campaign in reversed(campaigns):
        if open_only and campaign.get("status") == "verified":
            continue
        return campaign
    return None


def resolve_campaign(value: str | None, *, open_only: bool = False) -> dict[str, Any]:
    if value:
        candidate = Path(value)
        if not candidate.is_absolute():
            direct = ROOT / candidate
            named = CAMPAIGN_DIR / value
            if direct.is_file():
                candidate = direct
            elif named.is_file():
                candidate = named
            elif (CAMPAIGN_DIR / f"{value}.json").is_file():
                candidate = CAMPAIGN_DIR / f"{value}.json"
        if not candidate.is_file():
            raise CampaignError(f"campaign not found: {value}")
        payload = load_json(candidate)
        payload["_path"] = str(candidate)
        return payload

    campaign = latest_campaign(open_only=open_only)
    if not campaign:
        raise CampaignError("no Performance OS campaign exists")
    return campaign


def receipt_path(value: str) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    return path


def load_receipt(value: str) -> dict[str, Any]:
    path = receipt_path(value)
    payload = speed.load_json(path)
    payload["_path"] = str(path)
    return payload


def campaign_file(campaign_id: str) -> Path:
    return CAMPAIGN_DIR / f"{campaign_id}.json"


def write_campaign(payload: dict[str, Any]) -> Path:
    CAMPAIGN_DIR.mkdir(parents=True, exist_ok=True)
    campaign_id = str(payload["campaign_id"])
    path = campaign_file(campaign_id)
    clean = {key: value for key, value in payload.items() if key != "_path"}
    path.write_text(
        json.dumps(clean, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    payload["_path"] = str(path)
    return path


def route_map(receipt: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(row.get("path")): row
        for row in receipt.get("routes") or []
        if isinstance(row, dict) and row.get("path")
    }


def cohort_routes(receipt: dict[str, Any]) -> list[str]:
    return [
        str(row.get("path"))
        for row in receipt.get("routes") or []
        if isinstance(row, dict) and row.get("path")
    ]


def pct(old: float, new: float) -> float:
    return ((new - old) / old * 100.0) if old else 0.0


def faster_pct(old: float, new: float) -> float:
    return ((old - new) / old * 100.0) if old else 0.0


def operator_change(old: float, new: float) -> str:
    saved = old - new
    faster = faster_pct(old, new)
    if abs(saved) < 0.05:
        return "unchanged"
    if saved > 0:
        return f"{faster:.1f}% faster · {saved:.1f} ms saved"
    return f"{abs(faster):.1f}% slower · {abs(saved):.1f} ms added"


def material_delta(
    old: float,
    new: float,
    *,
    floor_ms: float,
) -> str | None:
    delta = new - old
    percent = pct(old, new)
    if delta >= floor_ms and percent >= MATERIAL_PERCENT:
        return "regression"
    if delta <= -floor_ms and percent <= -MATERIAL_PERCENT:
        return "improvement"
    return None


def comparable_history(baseline: dict[str, Any]) -> list[dict[str, Any]]:
    identity = speed.cohort_identity(baseline)
    generated = str(baseline.get("generated_at") or "")
    rows = [
        receipt
        for receipt in speed.all_performance_receipts()
        if speed.cohort_identity(receipt) == identity
        and str(receipt.get("generated_at") or "") < generated
    ]
    return rows[-HISTORY_LIMIT:]


def historical_route_median(
    history: list[dict[str, Any]],
    route: str,
    field: str,
) -> float | None:
    values: list[float] = []
    for receipt in history:
        row = route_map(receipt).get(route)
        value = row.get(field) if row else None
        if isinstance(value, (int, float)):
            values.append(float(value))
    if not values:
        return None
    values.sort()
    middle = len(values) // 2
    if len(values) % 2:
        return values[middle]
    return (values[middle - 1] + values[middle]) / 2.0


def incident_advice(baseline: dict[str, Any]) -> dict[str, Any]:
    probe = baseline.get("performance_incidents") or {}
    if not probe.get("available"):
        return {
            "available": False,
            "findings": [],
            "actions": [],
        }

    counts = probe.get("counts") or {}

    def count(name: str) -> int:
        raw = counts.get(name)
        return int(raw) if isinstance(raw, (int, float)) else 0

    findings: list[str] = []
    actions: list[str] = []

    archive = count("physical_archive_scan_timeout")
    if archive:
        findings.append(
            f"Physical replay-archive scans exceeded their request budget {archive} time(s) in the last hour."
        )
        actions.append(
            "Move recursive replay-archive inventory/stat work out of public Next.js request paths and serve a precomputed snapshot instead."
        )

    relay = count("speed_telemetry_timeout")
    if relay:
        findings.append(
            f"Speed telemetry/report relay timed out {relay} time(s) in the last hour."
        )
        actions.append(
            "Profile the Traffic performance-ingest path and preserve browser telemetry asynchronously so observability cannot stall or disappear behind a slow relay."
        )

    database = count("database_error")
    if database:
        findings.append(
            f"Database/pool error patterns appeared {database} time(s) in the last hour."
        )
        actions.append(
            "Inspect the exact slow query or pool saturation before adding database capacity."
        )

    memory = count("memory_pressure")
    if memory:
        findings.append(
            f"Memory-pressure/OOM patterns appeared {memory} time(s) in the last hour."
        )
        actions.append(
            "Treat RAM pressure as an active performance incident and correlate it with the capacity snapshot before deployment."
        )

    generic_timeout = count("upstream_timeout")
    if generic_timeout and not (archive or relay or database):
        findings.append(
            f"Generic timeout patterns appeared {generic_timeout} time(s) in the last hour."
        )
        actions.append(
            "Resolve the upstream/caller identity from the journal before tuning unrelated routes."
        )

    return {
        "available": True,
        "window_minutes": probe.get("window_minutes"),
        "counts": counts,
        "findings": findings,
        "actions": actions,
    }

def capacity_advice(baseline: dict[str, Any]) -> dict[str, Any]:
    capacity = baseline.get("production_capacity") or {}
    seam = baseline.get("origin_seam") or {}
    cohort = baseline.get("cohort") or {}

    result: dict[str, Any] = {
        "available": bool(capacity.get("available")),
        "summary": [],
        "hardware": {
            "cpu": {"action": "measure", "reason": "Capacity evidence unavailable."},
            "memory": {"action": "measure", "reason": "Capacity evidence unavailable."},
            "storage": {"action": "measure", "reason": "Capacity evidence unavailable."},
            "gpu": {
                "action": "do_not_buy",
                "reason": "AoE2WAR page delivery and Next.js SSR are CPU/network/database workloads; a GPU will not materially reduce normal page-load latency.",
            },
            "delivery": {"action": "measure", "reason": "Origin/public seam evidence unavailable."},
        },
    }

    ratio = seam.get("ratio")
    public_ttfb = seam.get("public_median_ttfb_ms")
    origin_ttfb = seam.get("origin_median_ttfb_ms")
    if (
        isinstance(ratio, (int, float))
        and isinstance(public_ttfb, (int, float))
        and isinstance(origin_ttfb, (int, float))
    ):
        if float(ratio) >= 4.0 and float(public_ttfb) - float(origin_ttfb) >= 150.0:
            result["hardware"]["delivery"] = {
                "action": "priority",
                "reason": (
                    f"The public speed-check is {float(ratio):.1f}x slower than origin "
                    f"({float(public_ttfb):.0f} ms vs {float(origin_ttfb):.0f} ms). "
                    "Fix proxy/CDN/network delivery before buying server hardware."
                ),
            }
            result["summary"].append(
                "The delivery path is adding much more delay than the app origin on the lightweight check."
            )
        else:
            result["hardware"]["delivery"] = {
                "action": "hold",
                "reason": (
                    f"Public/origin seam is {float(ratio):.1f}x; it is not yet strong evidence that "
                    "the network edge is the dominant bottleneck."
                ),
            }

    if not capacity.get("available"):
        result["summary"].append(
            "Server-capacity probe was unavailable, so Speed OS will not guess whether CPU or RAM should be purchased."
        )
        return result

    def value(name: str) -> float:
        raw = capacity.get(name)
        return float(raw) if isinstance(raw, (int, float)) else 0.0

    cpu_count = max(1.0, value("cpu_count"))
    load1 = value("load1")
    load_per_cpu = load1 / cpu_count
    origin_ms = float(origin_ttfb) if isinstance(origin_ttfb, (int, float)) else 0.0
    route_p75 = float(cohort.get("ttfb_p75_ms") or 0.0)

    cpu_action = "hold"
    cpu_reason = (
        f"Load is {load1:.2f} across {int(cpu_count)} CPU(s) ({load_per_cpu:.2f} per CPU). "
        "No CPU purchase is justified by capacity evidence alone."
    )
    if load_per_cpu >= 0.85 and (origin_ms >= 150.0 or route_p75 >= 500.0):
        cpu_action = "consider_upgrade"
        cpu_reason = (
            f"Load is {load1:.2f} across {int(cpu_count)} CPU(s) while origin/route latency is elevated. "
            "A faster or larger-vCPU VPS may materially help after route profiling confirms CPU-bound SSR."
        )
        result["summary"].append(
            "CPU contention is plausible; confirm with route profiling before paying for a larger VPS."
        )
    result["hardware"]["cpu"] = {
        "action": cpu_action,
        "reason": cpu_reason,
        "load_per_cpu": round(load_per_cpu, 3),
    }

    mem_total = value("mem_total_kb")
    mem_available = value("mem_available_kb")
    swap_total = value("swap_total_kb")
    swap_free = value("swap_free_kb")
    mem_available_pct = (mem_available / mem_total * 100.0) if mem_total > 0 else 0.0
    swap_used_gib = max(0.0, swap_total - swap_free) / 1024.0 / 1024.0

    memory_action = "hold"
    memory_reason = (
        f"Available RAM is {mem_available_pct:.1f}% and swap currently holds about {swap_used_gib:.1f} GiB. "
        "More RAM is not the first speed purchase unless live pressure is sustained during slow requests."
    )
    if mem_total > 0 and (mem_available_pct < 15.0 or swap_used_gib >= 3.0):
        memory_action = "consider_upgrade"
        memory_reason = (
            f"Available RAM is only {mem_available_pct:.1f}% and swap usage is about {swap_used_gib:.1f} GiB. "
            "If this repeats during traffic, increasing RAM can reduce memory pressure and swap-related stalls."
        )
        result["summary"].append(
            "Memory pressure is high enough that a RAM upgrade may help if the same condition appears during slow-page samples."
        )
    result["hardware"]["memory"] = {
        "action": memory_action,
        "reason": memory_reason,
        "available_percent": round(mem_available_pct, 2),
        "swap_used_gib": round(swap_used_gib, 2),
    }

    root_total = value("root_total_kb")
    root_free = value("root_free_kb")
    volume_total = value("volume_total_kb")
    volume_free = value("volume_free_kb")
    root_free_pct = (root_free / root_total * 100.0) if root_total > 0 else 0.0
    volume_free_pct = (volume_free / volume_total * 100.0) if volume_total > 0 else 0.0

    storage_action = "hold"
    storage_reason = (
        f"Root free is {root_free_pct:.1f}% and durable-volume free is {volume_free_pct:.1f}%. "
        "Buying disk space improves safety/capacity, not normal page latency, unless I/O contention is separately proven."
    )
    if (root_total > 0 and root_free_pct < 15.0) or (volume_total > 0 and volume_free_pct < 12.0):
        storage_action = "expand_for_headroom"
        storage_reason = (
            f"Root free is {root_free_pct:.1f}% and durable-volume free is {volume_free_pct:.1f}%. "
            "Expand or reclaim storage for operational headroom; do not expect storage capacity alone to make pages faster."
        )
        result["summary"].append(
            "Storage headroom is becoming an operational constraint, but more capacity is not a substitute for latency optimization."
        )
    result["hardware"]["storage"] = {
        "action": storage_action,
        "reason": storage_reason,
        "root_free_percent": round(root_free_pct, 2),
        "volume_free_percent": round(volume_free_pct, 2),
    }

    if not result["summary"]:
        result["summary"].append(
            "Current capacity evidence does not justify buying hardware before the route-level software and delivery bottlenecks are optimized."
        )

    return result

def prior_campaign_learning() -> dict[str, Any]:
    verified = [
        campaign
        for campaign in all_campaigns()
        if campaign.get("status") == "verified"
        and isinstance(campaign.get("verification"), dict)
    ]
    if not verified:
        return {
            "verified_campaigns": 0,
            "note": "No prior verified campaign exists yet; this campaign establishes the learning rail.",
            "persistent_regression_routes": [],
            "repeat_improvement_routes": [],
        }

    route_scores: dict[str, int] = {}
    for campaign in verified[-8:]:
        verification = campaign.get("verification") or {}
        for row in verification.get("routes") or []:
            route = str(row.get("path") or "")
            verdict = row.get("verdict")
            if not route or verdict not in {"improvement", "regression", "neutral"}:
                continue
            route_scores[route] = route_scores.get(route, 0) + (
                1 if verdict == "improvement" else -1 if verdict == "regression" else 0
            )

    return {
        "verified_campaigns": len(verified),
        "persistent_regression_routes": [
            route
            for route, score in sorted(route_scores.items(), key=lambda item: item[1])
            if score < 0
        ][:10],
        "repeat_improvement_routes": [
            route
            for route, score in sorted(
                route_scores.items(),
                key=lambda item: item[1],
                reverse=True,
            )
            if score > 0
        ][:10],
    }


def analyze_baseline(baseline: dict[str, Any]) -> dict[str, Any]:
    cohort = baseline.get("cohort") or {}
    p50_ttfb = float(cohort.get("ttfb_p50_ms") or 1.0)
    p75_ttfb = float(cohort.get("ttfb_p75_ms") or p50_ttfb)
    p50_total = float(cohort.get("total_p50_ms") or 1.0)
    p75_total = float(cohort.get("total_p75_ms") or p50_total)
    seam = baseline.get("origin_seam") or {}
    seam_ratio = (
        float(seam["ratio"])
        if isinstance(seam.get("ratio"), (int, float))
        else None
    )
    ready = baseline.get("ready_coverage") or {}
    ready_routes = set(str(route) for route in ready.get("ready_routes") or [])
    history = comparable_history(baseline)
    prior_learning = prior_campaign_learning()

    rows: list[dict[str, Any]] = []
    for route_row in baseline.get("routes") or []:
        if not isinstance(route_row, dict):
            continue
        route = str(route_row.get("path") or "")
        if not route:
            continue
        ttfb = float(route_row.get("median_ttfb_ms") or 0.0)
        total = float(route_row.get("median_total_ms") or 0.0)
        download = int(route_row.get("median_download_bytes") or 0)
        transfer_tail = max(0.0, total - ttfb)

        old_ttfb = historical_route_median(
            history,
            route,
            "median_ttfb_ms",
        )
        old_total = historical_route_median(
            history,
            route,
            "median_total_ms",
        )
        trend_ttfb = (
            material_delta(old_ttfb, ttfb, floor_ms=TTFB_MATERIAL_MS)
            if old_ttfb is not None
            else None
        )
        trend_total = (
            material_delta(old_total, total, floor_ms=TOTAL_MATERIAL_MS)
            if old_total is not None
            else None
        )

        reasons: list[str] = []
        if trend_ttfb == "regression" or trend_total == "regression":
            reasons.append("historical regression")
        if ttfb >= max(500.0, p75_ttfb * 1.10):
            reasons.append("high server/public TTFB")
        if total >= max(750.0, p75_total * 1.10):
            reasons.append("high total response time")
        if transfer_tail >= 300.0:
            reasons.append("large post-TTFB transfer tail")
        if download >= 750_000:
            reasons.append("large response payload")
        if route not in ready_routes:
            reasons.append("no explicit browser Ready marker")

        score = (
            (ttfb / max(p50_ttfb, 1.0)) * 0.50
            + (total / max(p50_total, 1.0)) * 0.30
            + min(download / 750_000.0, 3.0) * 0.10
            + min(transfer_tail / 500.0, 3.0) * 0.10
        )
        if "historical regression" in reasons:
            score += 1.0

        recommendation: list[str] = []
        if "historical regression" in reasons:
            recommendation.append("diff recent route/data changes before broad tuning")
        if "high server/public TTFB" in reasons:
            if seam_ratio is not None and seam_ratio >= 4.0:
                recommendation.append("inspect CDN/proxy/public delivery seam before blaming origin")
            else:
                recommendation.append("profile SSR/data/cache path and remove avoidable blocking work")
        if "large response payload" in reasons or "large post-TTFB transfer tail" in reasons:
            recommendation.append("trim RSC/HTML/API payload and optimize route-critical images/assets")
        if "no explicit browser Ready marker" in reasons:
            recommendation.append("add authoritative SpeedReadyMarker before client-readiness claims")
        if not recommendation:
            recommendation.append("preserve; not a first-wave optimization target")

        rows.append(
            {
                "path": route,
                "score": round(score, 3),
                "median_ttfb_ms": round(ttfb, 3),
                "median_total_ms": round(total, 3),
                "median_download_bytes": download,
                "post_ttfb_ms": round(transfer_tail, 3),
                "historical_ttfb_ms": (
                    round(old_ttfb, 3) if old_ttfb is not None else None
                ),
                "historical_total_ms": (
                    round(old_total, 3) if old_total is not None else None
                ),
                "trend_ttfb": trend_ttfb,
                "trend_total": trend_total,
                "reasons": reasons,
                "recommendation": recommendation,
            }
        )

    rows.sort(
        key=lambda row: (
            1 if row["reasons"] else 0,
            float(row["score"]),
        ),
        reverse=True,
    )

    missing_ready = [
        route
        for route in cohort_routes(baseline)
        if route not in ready_routes
    ]

    incidents = incident_advice(baseline)

    estate_findings: list[str] = []
    estate_findings.extend(incidents.get("findings") or [])
    if seam_ratio is not None and seam_ratio >= 4.0:
        estate_findings.append(
            f"Public speed-check TTFB is {seam_ratio:.1f}x origin; delivery seam remains material."
        )
    if missing_ready:
        estate_findings.append(
            f"{len(missing_ready)} benchmark route(s) lack explicit authoritative Ready coverage."
        )
    if history:
        estate_findings.append(
            f"Trend model has {len(history)} prior like-for-like benchmark(s)."
        )
    else:
        estate_findings.append(
            "No prior like-for-like receipt exists for this exact cohort; baseline is the first campaign truth."
        )

    return {
        "generated_at": utc_now(),
        "history_receipts_used": len(history),
        "origin_public_ratio": seam_ratio,
        "estate_findings": estate_findings,
        "ready_gaps": missing_ready,
        "learning": prior_learning,
        "capacity_advice": capacity_advice(baseline),
        "incident_advice": incidents,
        "targets": rows[:20],
    }


def verify_routes(
    before: dict[str, Any],
    after: dict[str, Any],
) -> dict[str, Any]:
    if speed.cohort_identity(before) != speed.cohort_identity(after):
        raise CampaignError("verification benchmark does not match baseline route cohort")

    before_map = route_map(before)
    after_map = route_map(after)
    rows: list[dict[str, Any]] = []
    improvements = 0
    regressions = 0

    for route in cohort_routes(before):
        left = before_map.get(route)
        right = after_map.get(route)
        if not left or not right:
            raise CampaignError(f"verification is missing route {route}")

        before_ttfb = float(left["median_ttfb_ms"])
        after_ttfb = float(right["median_ttfb_ms"])
        before_total = float(left["median_total_ms"])
        after_total = float(right["median_total_ms"])

        ttfb_verdict = material_delta(
            before_ttfb,
            after_ttfb,
            floor_ms=TTFB_MATERIAL_MS,
        )
        total_verdict = material_delta(
            before_total,
            after_total,
            floor_ms=TOTAL_MATERIAL_MS,
        )

        verdict = "neutral"
        if ttfb_verdict == "regression" or total_verdict == "regression":
            verdict = "regression"
            regressions += 1
        elif ttfb_verdict == "improvement" or total_verdict == "improvement":
            verdict = "improvement"
            improvements += 1

        rows.append(
            {
                "path": route,
                "before_ttfb_ms": round(before_ttfb, 3),
                "after_ttfb_ms": round(after_ttfb, 3),
                "ttfb_delta_ms": round(after_ttfb - before_ttfb, 3),
                "ttfb_delta_percent": round(pct(before_ttfb, after_ttfb), 2),
                "ttfb_saved_ms": round(before_ttfb - after_ttfb, 3),
                "ttfb_faster_percent": round(faster_pct(before_ttfb, after_ttfb), 2),
                "before_total_ms": round(before_total, 3),
                "after_total_ms": round(after_total, 3),
                "total_delta_ms": round(after_total - before_total, 3),
                "total_delta_percent": round(pct(before_total, after_total), 2),
                "total_saved_ms": round(before_total - after_total, 3),
                "total_faster_percent": round(faster_pct(before_total, after_total), 2),
                "verdict": verdict,
            }
        )

    before_cohort = before["cohort"]
    after_cohort = after["cohort"]
    before_ttfb = float(before_cohort["ttfb_p50_ms"])
    after_ttfb = float(after_cohort["ttfb_p50_ms"])
    before_total = float(before_cohort["total_p50_ms"])
    after_total = float(after_cohort["total_p50_ms"])

    overall_ttfb_verdict = material_delta(
        before_ttfb,
        after_ttfb,
        floor_ms=TTFB_MATERIAL_MS,
    )
    overall_total_verdict = material_delta(
        before_total,
        after_total,
        floor_ms=TOTAL_MATERIAL_MS,
    )

    status = "PASS"
    if regressions > 0 or overall_ttfb_verdict == "regression" or overall_total_verdict == "regression":
        status = "WARN"

    return {
        "generated_at": utc_now(),
        "status": status,
        "route_count": len(rows),
        "material_improvements": improvements,
        "material_regressions": regressions,
        "overall": {
            "ttfb_p50_before_ms": round(before_ttfb, 3),
            "ttfb_p50_after_ms": round(after_ttfb, 3),
            "ttfb_delta_percent": round(pct(before_ttfb, after_ttfb), 2),
            "ttfb_saved_ms": round(before_ttfb - after_ttfb, 3),
            "ttfb_faster_percent": round(faster_pct(before_ttfb, after_ttfb), 2),
            "total_p50_before_ms": round(before_total, 3),
            "total_p50_after_ms": round(after_total, 3),
            "total_delta_percent": round(pct(before_total, after_total), 2),
            "total_saved_ms": round(before_total - after_total, 3),
            "total_faster_percent": round(faster_pct(before_total, after_total), 2),
        },
        "routes": rows,
    }


def campaign_source_inventory() -> dict[str, Any]:
    payload = speed_inventory.snapshot()
    uncovered = payload.get("coverage", {}).get("uncovered_public_templates") or []
    if uncovered:
        raise CampaignError(
            "Speed OS source inventory has unbenchmarked public routes: "
            + ", ".join(str(route) for route in uncovered)
        )
    return payload


def inventory_delta(
    before: dict[str, Any],
    after: dict[str, Any],
) -> dict[str, Any]:
    before_assets = before.get("assets") or {}
    after_assets = after.get("assets") or {}
    before_pages = {
        str(row.get("template"))
        for row in before.get("pages") or []
        if isinstance(row, dict) and row.get("template")
    }
    after_pages = {
        str(row.get("template"))
        for row in after.get("pages") or []
        if isinstance(row, dict) and row.get("template")
    }
    return {
        "source_page_count_before": before.get("source_page_count"),
        "source_page_count_after": after.get("source_page_count"),
        "added_page_templates": sorted(after_pages - before_pages),
        "removed_page_templates": sorted(before_pages - after_pages),
        "public_asset_files_before": before_assets.get("total_files"),
        "public_asset_files_after": after_assets.get("total_files"),
        "public_asset_bytes_before": before_assets.get("total_bytes"),
        "public_asset_bytes_after": after_assets.get("total_bytes"),
        "public_asset_bytes_delta": (
            int(after_assets.get("total_bytes") or 0)
            - int(before_assets.get("total_bytes") or 0)
        ),
        "duplicate_avoidable_bytes_before": before_assets.get(
            "duplicate_avoidable_bytes"
        ),
        "duplicate_avoidable_bytes_after": after_assets.get(
            "duplicate_avoidable_bytes"
        ),
        "duplicate_avoidable_bytes_delta": (
            int(after_assets.get("duplicate_avoidable_bytes") or 0)
            - int(before_assets.get("duplicate_avoidable_bytes") or 0)
        ),
    }


def start_campaign(*, full: bool, rounds: int, force_new: bool) -> dict[str, Any]:
    existing = latest_campaign(open_only=True)
    if existing and not force_new:
        current_identity = speed.collect_release_identity()
        current_release = str(current_identity.get("release_sha") or "")
        existing_release = str(
            ((existing.get("baseline") or {}).get("release_sha")) or ""
        )
        # An analyzed-but-unverified campaign remains protected for the same
        # certified release. A campaign from an older release is historical
        # evidence and must not block freezing a new release baseline.
        if not current_release or existing_release == current_release:
            raise CampaignError(
                "an open performance campaign already exists for the current "
                f"release: {existing.get('campaign_id')}; verify it or "
                "explicitly use --force-new"
            )

    source_inventory = campaign_source_inventory()
    baseline = speed.benchmark(full=full, rounds=rounds)
    mode = str(baseline["mode"])
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    release_short = str(baseline.get("release_sha") or "unknown")[:12]
    campaign_id = f"{stamp}-{release_short}-{mode}"

    analysis = analyze_baseline(baseline)
    payload: dict[str, Any] = {
        "schema": 1,
        "kind": "aoe2war-performance-campaign",
        "campaign_id": campaign_id,
        "status": "analyzed",
        "started_at": utc_now(),
        "operator_source_sha": git_head(),
        "baseline": {
            "receipt": rel(baseline["_path"]),
            "release_sha": baseline.get("release_sha"),
            "build_id": baseline.get("build_id"),
            "build_version": baseline.get("build_version"),
            "mode": baseline.get("mode"),
            "rounds": baseline.get("rounds"),
            "route_count": baseline.get("route_count"),
            "cohort": baseline.get("cohort"),
            "source_inventory": source_inventory,
        },
        "analysis": analysis,
        "verification": None,
    }
    write_campaign(payload)
    return payload


def analyze_campaign(campaign: dict[str, Any]) -> dict[str, Any]:
    baseline_info = campaign.get("baseline") or {}
    receipt = baseline_info.get("receipt")
    if not isinstance(receipt, str):
        raise CampaignError("campaign baseline receipt is missing")
    baseline = load_receipt(receipt)
    analysis = analyze_baseline(baseline)
    campaign["analysis"] = analysis
    if campaign.get("status") != "verified":
        campaign["status"] = "analyzed"
    campaign["analyzed_at"] = utc_now()
    write_campaign(campaign)
    return campaign


def verify_campaign(
    campaign: dict[str, Any],
    *,
    rounds: int | None,
) -> dict[str, Any]:
    if campaign.get("status") == "verified":
        raise CampaignError("campaign is already verified")

    baseline_info = campaign.get("baseline") or {}
    receipt = baseline_info.get("receipt")
    if not isinstance(receipt, str):
        raise CampaignError("campaign baseline receipt is missing")
    baseline = load_receipt(receipt)

    mode = str(baseline.get("mode") or "")
    full = mode == "full"
    verify_rounds = rounds if rounds is not None else int(baseline.get("rounds") or 3)
    after_inventory = campaign_source_inventory()
    after = speed.benchmark(full=full, rounds=verify_rounds)

    verification = verify_routes(baseline, after)
    before_inventory = baseline_info.get("source_inventory") or {}
    inventory_change = inventory_delta(before_inventory, after_inventory)
    verification["source_inventory"] = {
        "before": before_inventory,
        "after": after_inventory,
        "delta": inventory_change,
    }
    if (
        inventory_change["added_page_templates"]
        or inventory_change["removed_page_templates"]
    ):
        verification["status"] = "WARN"
    verification["receipt"] = rel(after["_path"])
    verification["release_sha"] = after.get("release_sha")
    verification["build_id"] = after.get("build_id")
    verification["build_version"] = after.get("build_version")

    campaign["verification"] = verification
    campaign["status"] = "verified"
    campaign["verified_at"] = utc_now()
    campaign["verified_operator_source_sha"] = git_head()
    write_campaign(campaign)
    return campaign


def print_analysis(campaign: dict[str, Any]) -> None:
    baseline = campaign.get("baseline") or {}
    analysis = campaign.get("analysis") or {}
    print("⚔️  AOE2WAR SPEED CAMPAIGN")
    print()
    print(f"Campaign:       {campaign.get('campaign_id')}")
    print(f"Status:         {campaign.get('status')}")
    print(
        f"Baseline:       {str(baseline.get('release_sha') or 'unknown')[:12]} · "
        f"{baseline.get('mode')} · {baseline.get('route_count')} routes"
    )
    cohort = baseline.get("cohort") or {}
    print(
        "Baseline speed: "
        f"TTFB p50={float(cohort.get('ttfb_p50_ms') or 0):.1f} ms · "
        f"total p50={float(cohort.get('total_p50_ms') or 0):.1f} ms"
    )
    source_inventory = baseline.get("source_inventory") or {}
    source_assets = source_inventory.get("assets") or {}
    source_coverage = source_inventory.get("coverage") or {}
    if source_inventory:
        print(
            "Source estate:   "
            f"{source_inventory.get('source_page_count', 0)} pages · "
            f"{source_coverage.get('coverage_percent', 0):.1f}% public coverage · "
            f"{source_assets.get('total_files', 0)} public assets / "
            f"{speed_inventory.human_bytes(int(source_assets.get('total_bytes') or 0))}"
        )
        print(
            "Duplicate bytes: "
            f"{speed_inventory.human_bytes(int(source_assets.get('duplicate_avoidable_bytes') or 0))} "
            "exact tracked duplication"
        )
    print()
    for finding in analysis.get("estate_findings") or []:
        print(f"- {finding}")
    print()
    print("Highest-leverage route targets:")
    for index, row in enumerate((analysis.get("targets") or [])[:10], start=1):
        reasons = ", ".join(row.get("reasons") or ["preserve"])
        print(
            f"{index:>2}. {row['path']:<24} "
            f"TTFB {row['median_ttfb_ms']:>7.1f} ms · "
            f"total {row['median_total_ms']:>7.1f} ms · "
            f"{reasons}"
        )
        recommendation = "; ".join(row.get("recommendation") or [])
        if recommendation:
            print(f"    → {recommendation}")

    incidents = analysis.get("incident_advice") or {}
    actions = incidents.get("actions") or []
    if actions:
        print()
        print("Production incidents:")
        for action in actions:
            print(f"  → {action}")

    advice = analysis.get("capacity_advice") or {}
    hardware = advice.get("hardware") or {}
    print()
    print("Hardware / delivery:")
    for key in ("delivery", "cpu", "memory", "storage", "gpu"):
        item = hardware.get(key) or {}
        print(f"  {key:<8} {item.get('action', 'unknown')}: {item.get('reason', '')}")

    learning = analysis.get("learning") or {}
    print()
    print(
        f"Learning rail:  {learning.get('verified_campaigns', 0)} prior verified campaign(s)"
    )
    print(f"Receipt:        {rel(campaign['_path'])}")


def print_verification(campaign: dict[str, Any]) -> None:
    verification = campaign.get("verification") or {}
    overall = verification.get("overall") or {}
    print("⚔️  AOE2WAR SPEED CAMPAIGN VERIFICATION")
    print()
    print(f"Campaign:       {campaign.get('campaign_id')}")
    print(f"Status:         {verification.get('status')}")
    ttfb_before = float(overall.get("ttfb_p50_before_ms") or 0)
    ttfb_after = float(overall.get("ttfb_p50_after_ms") or 0)
    total_before = float(overall.get("total_p50_before_ms") or 0)
    total_after = float(overall.get("total_p50_after_ms") or 0)
    print(
        "TTFB p50:      "
        f"{ttfb_before:.1f} → {ttfb_after:.1f} ms · "
        f"{operator_change(ttfb_before, ttfb_after)}"
    )
    print(
        "Total p50:     "
        f"{total_before:.1f} → {total_after:.1f} ms · "
        f"{operator_change(total_before, total_after)}"
    )
    print(
        f"Routes:         {verification.get('material_improvements', 0)} material improvement(s) · "
        f"{verification.get('material_regressions', 0)} regression(s)"
    )
    inventory_change = (
        (verification.get("source_inventory") or {}).get("delta") or {}
    )
    if inventory_change:
        before_bytes = int(inventory_change.get("public_asset_bytes_before") or 0)
        after_bytes = int(inventory_change.get("public_asset_bytes_after") or 0)
        delta_bytes = int(inventory_change.get("public_asset_bytes_delta") or 0)
        duplicate_before = int(
            inventory_change.get("duplicate_avoidable_bytes_before") or 0
        )
        duplicate_after = int(
            inventory_change.get("duplicate_avoidable_bytes_after") or 0
        )
        print(
            "Public assets:  "
            f"{speed_inventory.human_bytes(before_bytes)} → "
            f"{speed_inventory.human_bytes(after_bytes)} · "
            f"delta {delta_bytes:+,} bytes"
        )
        print(
            "Exact dupes:    "
            f"{speed_inventory.human_bytes(duplicate_before)} → "
            f"{speed_inventory.human_bytes(duplicate_after)}"
        )
        changed_pages = (
            list(inventory_change.get("added_page_templates") or [])
            + list(inventory_change.get("removed_page_templates") or [])
        )
        if changed_pages:
            print(
                "Page universe:   changed during campaign · "
                + ", ".join(changed_pages)
            )
    route_rows = [
        row
        for row in verification.get("routes") or []
        if isinstance(row, dict)
    ]
    if route_rows:
        print()
        print("Page-by-page before → after:")
        for row in route_rows:
            before_total = float(row.get("before_total_ms") or 0)
            after_total = float(row.get("after_total_ms") or 0)
            before_ttfb = float(row.get("before_ttfb_ms") or 0)
            after_ttfb = float(row.get("after_ttfb_ms") or 0)
            print(
                f"  {str(row.get('path') or ''):<44} "
                f"total {before_total:>7.1f} → {after_total:>7.1f} ms · "
                f"{operator_change(before_total, after_total)} · "
                f"TTFB {before_ttfb:>7.1f} → {after_ttfb:>7.1f} ms · "
                f"{row.get('verdict', 'neutral')}"
            )

    regressions = [
        row
        for row in route_rows
        if row.get("verdict") == "regression"
    ]
    if regressions:
        print("Regressions:")
        for row in regressions[:10]:
            print(
                f"  {row['path']}: "
                f"TTFB {row['ttfb_delta_percent']:+.1f}% · "
                f"total {row['total_delta_percent']:+.1f}%"
            )
    print(f"Campaign receipt:{rel(campaign['_path'])}")


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="aoe2war speed campaign",
        description="Durable before/analyze/after performance campaign",
    )
    sub = parser.add_subparsers(dest="command")

    start = sub.add_parser("start")
    start.add_argument("--quick", action="store_true")
    start.add_argument("--rounds", type=int, default=3)
    start.add_argument("--force-new", action="store_true")

    status = sub.add_parser("status")
    status.add_argument("--campaign")

    analyze = sub.add_parser("analyze")
    analyze.add_argument("--campaign")

    verify = sub.add_parser("verify")
    verify.add_argument("--campaign")
    verify.add_argument("--rounds", type=int)

    args = parser.parse_args()

    try:
        if args.command in (None, "status"):
            campaign = resolve_campaign(
                getattr(args, "campaign", None),
            )
            if campaign.get("verification"):
                print_verification(campaign)
            else:
                print_analysis(campaign)
            return 0

        if args.command == "start":
            campaign = start_campaign(
                full=not args.quick,
                rounds=args.rounds,
                force_new=args.force_new,
            )
            print_analysis(campaign)
            return 0

        if args.command == "analyze":
            campaign = resolve_campaign(args.campaign)
            campaign = analyze_campaign(campaign)
            print_analysis(campaign)
            return 0

        if args.command == "verify":
            campaign = resolve_campaign(
                args.campaign,
                open_only=not bool(args.campaign),
            )
            campaign = verify_campaign(
                campaign,
                rounds=args.rounds,
            )
            print_verification(campaign)
            return 1 if (campaign.get("verification") or {}).get("status") == "WARN" else 0
    except (CampaignError, speed.SpeedError, ValueError) as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        return 2

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
