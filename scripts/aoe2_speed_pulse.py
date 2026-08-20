#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import statistics
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "bin" / "aoe2war"
RECEIPT_DIR = ROOT / ".aoe2war-release" / "site-pulse-receipts"

DEFAULT_ROUTES = (
    "/",
    "/lobby",
    "/bets",
    "/live-games",
    "/leaderboard",
    "/players",
    "/clans",
    "/wolo",
    "/academy",
    "/requests",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_json(args: list[str], timeout: int = 60) -> dict[str, Any]:
    proc = subprocess.run(
        args,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"command failed rc={proc.returncode}: {' '.join(args)}\\n{proc.stdout[-4000:]}"
        )
    value = json.loads(proc.stdout)
    if not isinstance(value, dict):
        raise RuntimeError("expected JSON object")
    return value


def release_identity() -> dict[str, Any]:
    status = run_json([str(CLI), "status", "--json"], timeout=45)
    production = status.get("production") or {}
    release = status.get("release") or {}
    return {
        "release_sha": (
            production.get("source_sha")
            or release.get("certified_release_sha")
            or status.get("certified_release_sha")
        ),
        "build_version": production.get("public_build_version"),
        "active_build_id": production.get("active_build_id"),
        "release_state": release.get("state") or status.get("state"),
    }


def curl_sample(base_url: str, route: str, timeout: int) -> dict[str, Any]:
    url = base_url.rstrip("/") + route
    proc = subprocess.run(
        [
            "curl",
            "-L",
            "-sS",
            "--connect-timeout",
            "5",
            "--max-time",
            str(timeout),
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}\t%{time_starttransfer}\t%{time_total}",
            url,
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout + 5,
        check=False,
    )
    if proc.returncode != 0:
        return {
            "route": route,
            "url": url,
            "ok": False,
            "error": proc.stderr.strip() or f"curl rc={proc.returncode}",
        }
    parts = proc.stdout.strip().split("\t")
    if len(parts) != 3:
        return {
            "route": route,
            "url": url,
            "ok": False,
            "error": f"unexpected curl output: {proc.stdout!r}",
        }
    code = int(parts[0] or 0)
    return {
        "route": route,
        "url": url,
        "ok": 200 <= code < 400,
        "http_code": code,
        "ttfb_seconds": float(parts[1]),
        "total_seconds": float(parts[2]),
    }


def summarize(samples: list[dict[str, Any]]) -> dict[str, Any]:
    good = [item for item in samples if item.get("ok")]
    ttfb = [float(item["ttfb_seconds"]) for item in good]
    total = [float(item["total_seconds"]) for item in good]
    return {
        "sample_count": len(samples),
        "ok_count": len(good),
        "failed_count": len(samples) - len(good),
        "ttfb_median_seconds": statistics.median(ttfb) if ttfb else None,
        "total_median_seconds": statistics.median(total) if total else None,
        "ttfb_max_seconds": max(ttfb) if ttfb else None,
        "total_max_seconds": max(total) if total else None,
    }


def previous_receipt(routes: tuple[str, ...]) -> dict[str, Any] | None:
    if not RECEIPT_DIR.is_dir():
        return None
    for path in sorted(RECEIPT_DIR.glob("*.json"), reverse=True):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if tuple(payload.get("routes") or ()) == routes:
            return payload
    return None


def comparison(current: dict[str, Any], previous: dict[str, Any] | None) -> dict[str, Any]:
    if not previous:
        return {"comparable": False, "reason": "no-prior-like-for-like-pulse"}
    old = previous.get("summary") or {}
    result: dict[str, Any] = {
        "comparable": True,
        "previous_receipt": previous.get("receipt_path"),
    }
    regression = False
    for key, floor in (
        ("ttfb_median_seconds", 0.150),
        ("total_median_seconds", 0.300),
    ):
        new_v = current.get(key)
        old_v = old.get(key)
        if not isinstance(new_v, (int, float)) or not isinstance(old_v, (int, float)) or old_v <= 0:
            result[key] = None
            continue
        delta = float(new_v) - float(old_v)
        pct = delta / float(old_v) * 100.0
        material = delta > floor and float(new_v) > float(old_v) * 1.35
        result[key] = {
            "previous": old_v,
            "current": new_v,
            "delta_seconds": delta,
            "delta_percent": pct,
            "material_regression": material,
        }
        regression = regression or material
    result["material_regression"] = regression
    return result


def pulse(
    *,
    base_url: str,
    routes: tuple[str, ...],
    rounds: int,
    timeout: int,
) -> dict[str, Any]:
    if rounds < 1 or rounds > 3:
        raise ValueError("--rounds must be between 1 and 3")
    identity = release_identity()
    samples: list[dict[str, Any]] = []
    for _ in range(rounds):
        for route in routes:
            samples.append(curl_sample(base_url, route, timeout))
    summary = summarize(samples)
    previous = previous_receipt(routes)
    compare = comparison(summary, previous)

    status = "PASS"
    if summary["failed_count"]:
        status = "FAIL"
    elif compare.get("material_regression"):
        status = "WARN"

    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    release_short = str(identity.get("release_sha") or "unknown")[:12]
    path = RECEIPT_DIR / f"{stamp}-{release_short}.json"

    payload = {
        "schema": 1,
        "kind": "aoe2war-site-performance-pulse",
        "generated_at": utc_now(),
        "status": status,
        "base_url": base_url,
        "routes": list(routes),
        "rounds": rounds,
        **identity,
        "summary": summary,
        "comparison": compare,
        "samples": samples,
        "receipt_path": str(path),
    }
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return payload


def print_payload(payload: dict[str, Any]) -> None:
    summary = payload["summary"]
    compare = payload["comparison"]
    print("⚔️  AOE2WAR SITE PERFORMANCE PULSE")
    print()
    print(f"Status:       {payload['status']}")
    print(f"Release:      {str(payload.get('release_sha') or 'unknown')[:12]}")
    print(f"Routes:       {summary['ok_count']}/{summary['sample_count']} healthy")
    if summary.get("ttfb_median_seconds") is not None:
        print(f"TTFB median:  {summary['ttfb_median_seconds'] * 1000:.1f} ms")
        print(f"Total median: {summary['total_median_seconds'] * 1000:.1f} ms")
    if compare.get("comparable"):
        print(
            "Comparison:   "
            + ("MATERIAL REGRESSION" if compare.get("material_regression") else "normal")
        )
    else:
        print("Comparison:   first like-for-like pulse")
    print(f"Receipt:      {payload['receipt_path']}")


def main() -> int:
    parser = argparse.ArgumentParser(prog="aoe2war speed pulse")
    parser.add_argument("--base-url", default="https://aoe2war.com")
    parser.add_argument("--rounds", type=int, default=1)
    parser.add_argument("--timeout", type=int, default=15)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    payload = pulse(
        base_url=args.base_url,
        routes=DEFAULT_ROUTES,
        rounds=args.rounds,
        timeout=args.timeout,
    )
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print_payload(payload)
    return 2 if payload["status"] == "FAIL" else (1 if payload["status"] == "WARN" else 0)


if __name__ == "__main__":
    raise SystemExit(main())
