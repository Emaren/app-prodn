#!/usr/bin/env python3
"""Read-only source-bound cold-phone LCP attribution from already-sealed receipts.

No browser launches, service/network calls, updates, cleanup, or live authority claims.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RECEIPT_ROOT = ROOT / ".aoe2war-release" / "performance-cold-lcp"
MAX_BYTES = 16 * 1024 * 1024


class EvidenceError(ValueError):
    pass


def number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        return None
    result = float(value)
    return result if math.isfinite(result) and result >= 0 else None


def record(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    values = sorted(values)
    index = (len(values) - 1) * fraction
    low = math.floor(index)
    high = math.ceil(index)
    return round(values[low] + (values[high] - values[low]) * (index - low), 2)


def stats(values: list[float]) -> dict[str, Any]:
    return {"count": len(values), "p50_ms": percentile(values, 0.5),
            "p95_ms": percentile(values, 0.95)}


def latest_receipt() -> Path:
    if not RECEIPT_ROOT.is_dir():
        raise EvidenceError("No cold-LCP receipt store; collect a certified cohort first")
    paths = sorted(
        (p for p in RECEIPT_ROOT.glob("*/receipt.json") if p.is_file() and not p.is_symlink()),
        key=lambda p: (p.stat().st_mtime_ns, str(p)),
        reverse=True,
    )
    if not paths:
        raise EvidenceError("No existing cold-LCP receipts")
    return paths[0]


def read_receipt(path: Path) -> dict[str, Any]:
    if not path.is_file() or path.is_symlink():
        raise EvidenceError("Receipt missing or symlinked")
    if path.stat().st_size > MAX_BYTES:
        raise EvidenceError("Receipt exceeds 16 MiB read bound")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError) as exc:
        raise EvidenceError("Invalid receipt JSON") from exc
    if not isinstance(payload, dict):
        raise EvidenceError("Receipt must be an object")
    return payload


def analyze(payload: dict[str, Any], *, expected_release: str = "") -> dict[str, Any]:
    if payload.get("schema") != 1 or payload.get("kind") != "aoe2war-cold-process-lcp":
        raise EvidenceError("Wrong receipt schema/kind")
    release = payload.get("releaseSha")
    if not isinstance(release, str) or len(release) != 40 or any(c not in "0123456789abcdef" for c in release):
        raise EvidenceError("Missing exact 40-hex source identity")
    if expected_release and release != expected_release:
        raise EvidenceError("Receipt not bound to expected release")
    if payload.get("viewport") != "phone":
        raise EvidenceError("Expected phone cold-process cohort")
    for key in ("productionMutated", "databaseMutated", "woloMutated"):
        if payload.get(key) is not False:
            raise EvidenceError("Receipt mutation boundary unproved")
    rows = payload.get("rows")
    count = payload.get("samples")
    if (not isinstance(rows, list) or type(count) is not int or count < 1 or count > 20
            or len(rows) != count or any(not isinstance(row, dict) for row in rows)):
        raise EvidenceError("Incomplete bounded sample inventory")

    values: dict[str, list[float]] = {
        key: [] for key in (
            "lcp", "ready", "document_ttfb", "request_start",
            "resource_response_end", "response_to_lcp", "insert_to_lcp",
            "native_load_to_lcp", "lcp_load_to_render",
        )
    }
    exact_resources = 0
    duplicate_exact_resources = 0
    exact_preload_samples = 0
    high_exact_preload_samples = 0
    image_lifecycle_capped = 0
    for row in rows:
        metrics = record(row.get("metrics"))
        lcp = record(metrics.get("finalLcp"))
        resource = record(metrics.get("lcpResourceTiming"))
        nav = record(metrics.get("navigation"))
        hint = record(metrics.get("lcpPreloadHint"))
        lifecycle = record(metrics.get("lcpImageLifecycle"))
        lcp_at = number(lcp.get("startTime"))
        ready_at = number(metrics.get("readyMs"))
        ttfb_at = number(nav.get("responseStart"))
        if lcp_at is not None:
            values["lcp"].append(lcp_at)
        if ready_at is not None:
            values["ready"].append(ready_at)
        if ttfb_at is not None:
            values["document_ttfb"].append(ttfb_at)
        matches = metrics.get("lcpResourceMatchCount")
        if type(matches) is int and matches > 1:
            duplicate_exact_resources += 1
        if number(hint.get("exactLcpHintCount")) and hint["exactLcpHintCount"] > 0:
            exact_preload_samples += 1
        if number(hint.get("highPriorityExactHintCount")) and hint["highPriorityExactHintCount"] > 0:
            high_exact_preload_samples += 1
        if lifecycle.get("capped") is True:
            image_lifecycle_capped += 1
        # Resource data without a matching final URL is never promoted.
        if not lcp.get("url") or resource.get("name") != lcp.get("url"):
            continue
        response_end = number(resource.get("responseEnd"))
        request_start = number(resource.get("startTime"))
        if response_end is None or response_end <= 0 or lcp_at is None or response_end > lcp_at:
            continue
        exact_resources += 1
        values["resource_response_end"].append(response_end)
        values["response_to_lcp"].append(lcp_at - response_end)
        if request_start is not None and request_start <= response_end:
            values["request_start"].append(request_start)
        inserted = number(lifecycle.get("firstInsertedAtMs"))
        if inserted is not None and inserted <= lcp_at:
            values["insert_to_lcp"].append(lcp_at - inserted)
        loaded = number(lifecycle.get("firstNativeLoadAtMs"))
        if loaded is not None and loaded <= lcp_at:
            values["native_load_to_lcp"].append(lcp_at - loaded)
        # Render versus load time is only meaningful if both exact values exist.
        load_time, render_time = number(lcp.get("loadTime")), number(lcp.get("renderTime"))
        if load_time is not None and render_time is not None and render_time >= load_time and load_time > 0:
            values["lcp_load_to_render"].append(render_time - load_time)

    return {
        "schema": 1, "kind": "aoe2war-cold-lcp-attribution", "releaseSha": release,
        "buildVersion": payload.get("buildVersion"), "generatedAt": payload.get("generatedAt"),
        "samples": count,
        "exactResourceEvidence": exact_resources,
        "duplicateExactResourceSamples": duplicate_exact_resources,
        "exactPreloadHintSamples": exact_preload_samples,
        "highPriorityExactPreloadSamples": high_exact_preload_samples,
        "imageLifecycleCappedSamples": image_lifecycle_capped,
        "timings": {key: stats(vals) for key, vals in values.items()},
        "authority": "DIAGNOSTIC_ONLY_NOT_PERFORMANCE_CERTIFICATION",
        "mutationAllowed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, help="Existing local cold-phone receipt; default newest")
    parser.add_argument("--expected-release", default="", help="Exact production SHA to enforce")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        path = args.receipt.expanduser().resolve() if args.receipt else latest_receipt()
        result = analyze(read_receipt(path), expected_release=args.expected_release)
    except (EvidenceError, OSError) as exc:
        print(f"STOP: {exc}")
        return 2
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print("⚔️  AOE2WAR SPEEDOS — EXACT LCP TIMING ATTRIBUTION")
        print(f"Release: {result['releaseSha'][:12]} · samples: {result['samples']}")
        print(f"Exact resource proof: {result['exactResourceEvidence']}/{result['samples']}")
        print(f"Duplicate exact resource entries: {result['duplicateExactResourceSamples']}")
        print(f"Matching preload hints: {result['exactPreloadHintSamples']} "
              f"(high priority: {result['highPriorityExactPreloadSamples']})")
        for label, row in result["timings"].items():
            print(f"  {label:24} n={row['count']:2} p50={row['p50_ms']} ms "
                  f"p95={row['p95_ms']} ms")
        print("READ ONLY · No performance score inferred from missing evidence.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
