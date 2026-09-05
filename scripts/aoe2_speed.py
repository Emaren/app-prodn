#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".aoe2war-release"
FINISH_RECEIPTS = STATE / "finish-receipts"
STAGE_RECEIPTS = STATE / "stage-receipts"
ACTIVATION_RECEIPTS = STATE / "activation-receipts"
PERFORMANCE_RECEIPTS = STATE / "performance-receipts"
BASELINE_DIR = STATE / "performance-baselines"
HISTORICAL_ROUTE_CSV = (
    ROOT / "docs" / "audits" / "performance-route-comparison-2026-08-13.csv"
)
FULL_ROUTE_COHORT_V2 = (
    ROOT / "docs" / "audits" / "performance-route-cohort-v2.txt"
)
PUBLIC_BASE = "https://aoe2war.com"
PRODUCTION_HOST = "hel1"
ORIGIN_SPEED_URL = "http://127.0.0.1:3030/api/speed/check"
PUBLIC_SPEED_URL = f"{PUBLIC_BASE}/api/speed/check"

QUICK_ROUTES = [
    "/",
    "/bets",
    "/live-games",
    "/watch",
    "/players",
    "/market",
    "/academy",
    "/staking",
    "/kingdom",
    "/wolo",
]


class SpeedError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise SpeedError(f"invalid JSON {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise SpeedError(f"JSON root is not an object: {path}")
    return payload


def safe_json(path: Path) -> dict[str, Any] | None:
    try:
        return load_json(path)
    except Exception:
        return None


def parse_dt(value: object) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def duration_seconds(payload: dict[str, Any]) -> float | None:
    if isinstance(payload.get("duration_seconds"), (int, float)):
        return float(payload["duration_seconds"])
    started = parse_dt(payload.get("started_at") or payload.get("generated_at"))
    ended = parse_dt(payload.get("completed_at"))
    if started and ended:
        return (ended - started).total_seconds()
    return None


def phase_seconds(phase: dict[str, Any]) -> float | None:
    started = parse_dt(phase.get("started_at"))
    ended = parse_dt(phase.get("completed_at") or phase.get("failed_at"))
    if started and ended:
        return (ended - started).total_seconds()
    return None


def percentile(values: list[float], pct: float) -> float:
    if not values:
        raise SpeedError("cannot calculate percentile of empty sample")
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * pct
    low = math.floor(rank)
    high = math.ceil(rank)
    if low == high:
        return ordered[low]
    weight = rank - low
    return ordered[low] * (1.0 - weight) + ordered[high] * weight


def finish_history() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in sorted(FINISH_RECEIPTS.glob("*.json")):
        payload = safe_json(path)
        if not payload or payload.get("kind") != "aoe2war-finish-result":
            continue
        generated = parse_dt(payload.get("generated_at"))
        completed = parse_dt(payload.get("completed_at"))
        total = (
            (completed - generated).total_seconds()
            if generated and completed
            else None
        )
        phases: dict[str, float] = {}
        for name, phase in (payload.get("phases") or {}).items():
            if not isinstance(phase, dict):
                continue
            value = phase_seconds(phase)
            if value is not None:
                phases[str(name)] = value
        final = payload.get("final_release") or {}
        certification = final.get("certification") or {}
        local = final.get("local") or {}
        rows.append(
            {
                "path": str(path),
                "generated_at": payload.get("generated_at"),
                "completed_at": payload.get("completed_at"),
                "status": payload.get("status"),
                "release_sha": certification.get("release_sha") or local.get("head"),
                "deployed": bool(payload.get("production_deployed")),
                "total_seconds": total,
                "phases": phases,
            }
        )
    rows.sort(key=lambda row: row.get("generated_at") or "")
    return rows


def receipt_for_release(directory: Path, release_sha: str) -> dict[str, Any] | None:
    candidates = sorted(
        directory.glob(f"{release_sha}-*.json"),
        key=lambda path: path.stat().st_mtime,
    )
    for path in reversed(candidates):
        payload = safe_json(path)
        if payload and payload.get("release_sha") == release_sha:
            return payload
    return None


def latest_performance_receipt() -> dict[str, Any] | None:
    paths = sorted(
        PERFORMANCE_RECEIPTS.glob("*.json"),
        key=lambda path: path.stat().st_mtime,
    )
    for path in reversed(paths):
        payload = safe_json(path)
        if payload and payload.get("kind") == "aoe2war-performance-benchmark":
            payload["_path"] = str(path)
            return payload
    return None


def all_performance_receipts() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in sorted(
        PERFORMANCE_RECEIPTS.glob("*.json"),
        key=lambda item: item.stat().st_mtime,
    ):
        payload = safe_json(path)
        if payload and payload.get("kind") == "aoe2war-performance-benchmark":
            payload["_path"] = str(path)
            rows.append(payload)
    return rows


def baseline_zero_summary() -> dict[str, Any] | None:
    dirs = sorted(
        [path for path in BASELINE_DIR.glob("*") if path.is_dir()],
        key=lambda path: path.name,
    )
    for directory in reversed(dirs):
        summary_path = directory / "http-summary.json"
        if not summary_path.is_file():
            continue
        try:
            rows = json.loads(summary_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(rows, list):
            continue
        passing = [
            row
            for row in rows
            if isinstance(row, dict)
            and row.get("status") == "PASS"
            and isinstance(row.get("current_ttfb_ms"), (int, float))
            and isinstance(row.get("current_total_ms"), (int, float))
        ]
        if not passing:
            continue
        return {
            "source": str(summary_path.relative_to(ROOT)),
            "route_count": len(passing),
            "median_ttfb_ms": statistics.median(
                float(row["current_ttfb_ms"]) for row in passing
            ),
            "median_total_ms": statistics.median(
                float(row["current_total_ms"]) for row in passing
            ),
        }
    return None


def ready_coverage() -> dict[str, Any]:
    routes: set[str] = set()
    usage_count = 0
    pattern = re.compile(r'<SpeedReadyMarker\b[^>]*\broute=["\']([^"\']+)["\']')
    roots = [ROOT / "app", ROOT / "components"]
    for base in roots:
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if path.suffix not in {".ts", ".tsx"} or not path.is_file():
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            usage_count += text.count("<SpeedReadyMarker")
            for match in pattern.finditer(text):
                routes.add(match.group(1))
    runtime_mounts = 0
    for base in roots:
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if path.suffix not in {".ts", ".tsx"} or not path.is_file():
                continue
            runtime_mounts += path.read_text(
                encoding="utf-8",
                errors="replace",
            ).count("<SpeedRuntime")
    return {
        "ready_marker_usages": usage_count,
        "ready_routes": sorted(routes),
        "ready_route_count": len(routes),
        "speed_runtime_mounts": runtime_mounts,
    }


def run_curl(url: str, timeout: int = 15) -> dict[str, Any]:
    fmt = (
        "%{http_code}\\t%{time_namelookup}\\t%{time_connect}\\t"
        "%{time_appconnect}\\t%{time_starttransfer}\\t%{time_total}\\t"
        "%{size_download}\\t%{url_effective}"
    )
    proc = subprocess.run(
        [
            "curl",
            "-sS",
            "-L",
            "--compressed",
            "--max-time",
            str(timeout),
            "-o",
            "/dev/null",
            "-w",
            fmt,
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
            "ok": False,
            "error": (proc.stderr or "").strip()[-500:],
            "url": url,
        }
    fields = proc.stdout.rstrip("\n").split("\t")
    if len(fields) != 8:
        return {
            "ok": False,
            "error": "unexpected curl metric output",
            "url": url,
        }
    code, dns, connect, tls, ttfb, total, size_download, effective = fields
    return {
        "ok": code == "200",
        "http_code": int(code),
        "dns_ms": float(dns) * 1000,
        "connect_ms": float(connect) * 1000,
        "tls_ms": float(tls) * 1000,
        "ttfb_ms": float(ttfb) * 1000,
        "total_ms": float(total) * 1000,
        "download_bytes": int(float(size_download)),
        "effective_url": effective,
        "url": url,
    }


def summarize_route_cohort(
    per_route: list[dict[str, Any]],
) -> dict[str, float]:
    if not per_route:
        raise SpeedError("cannot summarize an empty route cohort")

    ttfb = [
        float(row["median_ttfb_ms"])
        for row in per_route
    ]
    total = [
        float(row["median_total_ms"])
        for row in per_route
    ]

    return {
        "ttfb_p50_ms": percentile(ttfb, 0.50),
        "ttfb_p75_ms": percentile(ttfb, 0.75),
        "ttfb_p95_ms": percentile(ttfb, 0.95),
        "total_p50_ms": percentile(total, 0.50),
        "total_p75_ms": percentile(total, 0.75),
        "total_p95_ms": percentile(total, 0.95),
    }


def cohort_identity(payload: dict[str, Any]) -> tuple[str, tuple[str, ...]]:
    mode = str(payload.get("mode") or "")
    routes = tuple(
        str(row.get("path"))
        for row in (payload.get("routes") or [])
        if isinstance(row, dict) and row.get("path")
    )
    return mode, routes


def origin_seam(samples: int = 5) -> dict[str, Any]:
    public: list[float] = []
    origin: list[float] = []

    for _ in range(samples):
        sample = run_curl(PUBLIC_SPEED_URL, timeout=10)
        if sample.get("ok"):
            public.append(float(sample["ttfb_ms"]))

    script = r'''
set -euo pipefail
for _ in $(seq 1 %d); do
  curl -fsS --max-time 5 -o /dev/null \
    -w '%%{time_starttransfer}\n' \
    %s
done
''' % (samples, ORIGIN_SPEED_URL)

    proc = subprocess.run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            PRODUCTION_HOST,
            "bash",
            "-s",
        ],
        input=script,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode == 0:
        for line in proc.stdout.splitlines():
            try:
                origin.append(float(line.strip()) * 1000)
            except ValueError:
                continue

    return {
        "public_samples": len(public),
        "origin_samples": len(origin),
        "public_median_ttfb_ms": statistics.median(public) if public else None,
        "origin_median_ttfb_ms": statistics.median(origin) if origin else None,
        "ratio": (
            statistics.median(public) / statistics.median(origin)
            if public and origin and statistics.median(origin) > 0
            else None
        ),
    }


def production_capacity_snapshot() -> dict[str, Any]:
    script = r'''
cpu_count="$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || echo 0)"
load1="$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo 0)"
load5="$(awk '{print $2}' /proc/loadavg 2>/dev/null || echo 0)"
mem_total_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
mem_available_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
swap_total_kb="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
swap_free_kb="$(awk '/^SwapFree:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
root_total_kb="$(df -Pk / 2>/dev/null | awk 'NR==2 {print $2}')"
root_free_kb="$(df -Pk / 2>/dev/null | awk 'NR==2 {print $4}')"
volume_mount="/mnt/HC_Volume_105319120"
if [ -d "$volume_mount" ]; then
  volume_total_kb="$(df -Pk "$volume_mount" 2>/dev/null | awk 'NR==2 {print $2}')"
  volume_free_kb="$(df -Pk "$volume_mount" 2>/dev/null | awk 'NR==2 {print $4}')"
else
  volume_total_kb=0
  volume_free_kb=0
fi
web_pid="$(systemctl show aoe2hdbets-web.service -p MainPID --value 2>/dev/null || echo 0)"
web_rss_kb=0
web_threads=0
if [ "${web_pid:-0}" -gt 0 ] 2>/dev/null && [ -r "/proc/$web_pid/status" ]; then
  web_rss_kb="$(awk '/^VmRSS:/ {print $2}' "/proc/$web_pid/status" 2>/dev/null || echo 0)"
  web_threads="$(awk '/^Threads:/ {print $2}' "/proc/$web_pid/status" 2>/dev/null || echo 0)"
fi
printf 'cpu_count=%s\n' "${cpu_count:-0}"
printf 'load1=%s\n' "${load1:-0}"
printf 'load5=%s\n' "${load5:-0}"
printf 'mem_total_kb=%s\n' "${mem_total_kb:-0}"
printf 'mem_available_kb=%s\n' "${mem_available_kb:-0}"
printf 'swap_total_kb=%s\n' "${swap_total_kb:-0}"
printf 'swap_free_kb=%s\n' "${swap_free_kb:-0}"
printf 'root_total_kb=%s\n' "${root_total_kb:-0}"
printf 'root_free_kb=%s\n' "${root_free_kb:-0}"
printf 'volume_total_kb=%s\n' "${volume_total_kb:-0}"
printf 'volume_free_kb=%s\n' "${volume_free_kb:-0}"
printf 'web_pid=%s\n' "${web_pid:-0}"
printf 'web_rss_kb=%s\n' "${web_rss_kb:-0}"
printf 'web_threads=%s\n' "${web_threads:-0}"
'''

    try:
        proc = subprocess.run(
            [
                "ssh",
                "-o",
                "BatchMode=yes",
                "-o",
                "ConnectTimeout=8",
                PRODUCTION_HOST,
                "bash",
                "-s",
            ],
            input=script,
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"available": False, "error": str(exc)}

    if proc.returncode != 0:
        return {
            "available": False,
            "error": (proc.stderr or proc.stdout or "").strip()[-1000:],
        }

    raw: dict[str, str] = {}
    for line in proc.stdout.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        raw[key.strip()] = value.strip()

    def integer(key: str) -> int:
        try:
            return int(float(raw.get(key, "0")))
        except ValueError:
            return 0

    def number(key: str) -> float:
        try:
            return float(raw.get(key, "0"))
        except ValueError:
            return 0.0

    return {
        "available": True,
        "cpu_count": integer("cpu_count"),
        "load1": number("load1"),
        "load5": number("load5"),
        "mem_total_kb": integer("mem_total_kb"),
        "mem_available_kb": integer("mem_available_kb"),
        "swap_total_kb": integer("swap_total_kb"),
        "swap_free_kb": integer("swap_free_kb"),
        "root_total_kb": integer("root_total_kb"),
        "root_free_kb": integer("root_free_kb"),
        "volume_total_kb": integer("volume_total_kb"),
        "volume_free_kb": integer("volume_free_kb"),
        "web_pid": integer("web_pid"),
        "web_rss_kb": integer("web_rss_kb"),
        "web_threads": integer("web_threads"),
    }

def collect_release_identity() -> dict[str, Any]:
    sys.path.insert(0, str(ROOT / "scripts"))
    import aoe2_release  # type: ignore

    data = aoe2_release.collect()
    return {
        "release_sha": data.get("production", {}).get("source_sha"),
        "operator_source_sha": data.get("local", {}).get("head"),
        "github_main_sha": data.get("github", {}).get("main_sha"),
        "build_id": data.get("production", {}).get("active_build_id"),
        "build_version": data.get("production", {}).get("internal_build_version"),
        "certification": data.get("certification", {}).get("status"),
    }


def route_list(full: bool) -> list[str]:
    if not full:
        return QUICK_ROUTES.copy()

    if not FULL_ROUTE_COHORT_V2.is_file():
        raise SpeedError(
            f"full performance route cohort missing: {FULL_ROUTE_COHORT_V2}"
        )

    paths = [
        line.strip()
        for line in FULL_ROUTE_COHORT_V2.read_text(
            encoding="utf-8",
        ).splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    if len(paths) != len(set(paths)):
        raise SpeedError("full performance route cohort contains duplicate paths")
    if not paths:
        raise SpeedError("full performance route cohort is empty")
    if any(not path.startswith("/") for path in paths):
        raise SpeedError("full performance route cohort contains a non-route entry")

    return paths


def benchmark(*, full: bool, rounds: int) -> dict[str, Any]:
    if rounds < 1 or rounds > 10:
        raise SpeedError("rounds must be between 1 and 10")

    identity = collect_release_identity()
    if identity.get("certification") != "CERTIFIED":
        raise SpeedError("production is not CERTIFIED")

    routes = route_list(full)
    samples: list[dict[str, Any]] = []
    started = time.monotonic()

    for round_no in range(1, rounds + 1):
        for path in routes:
            sample = run_curl(PUBLIC_BASE + path)
            sample.update({"round": round_no, "path": path})
            samples.append(sample)

    elapsed = time.monotonic() - started
    passing = [sample for sample in samples if sample.get("ok")]
    failed = [sample for sample in samples if not sample.get("ok")]
    if failed:
        raise SpeedError(
            f"{len(failed)} HTTP benchmark sample(s) failed; first={failed[0]}"
        )

    per_route: list[dict[str, Any]] = []
    for path in routes:
        route_samples = [sample for sample in passing if sample["path"] == path]
        per_route.append(
            {
                "path": path,
                "samples": len(route_samples),
                "median_ttfb_ms": statistics.median(
                    float(sample["ttfb_ms"]) for sample in route_samples
                ),
                "median_total_ms": statistics.median(
                    float(sample["total_ms"]) for sample in route_samples
                ),
                "median_download_bytes": int(
                    statistics.median(
                        int(sample["download_bytes"]) for sample in route_samples
                    )
                ),
            }
        )

    seam = origin_seam()
    ready = ready_coverage()
    capacity = production_capacity_snapshot()

    payload = {
        "schema": 1,
        "kind": "aoe2war-performance-benchmark",
        "generated_at": utc_now(),
        "mode": "full" if full else "quick",
        "rounds": rounds,
        "route_count": len(routes),
        "request_count": len(passing),
        "elapsed_seconds": round(elapsed, 3),
        **identity,
        "cohort": summarize_route_cohort(per_route),
        "origin_seam": seam,
        "ready_coverage": ready,
        "production_capacity": capacity,
        "routes": per_route,
    }

    PERFORMANCE_RECEIPTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    release_short = str(identity.get("release_sha") or "unknown")[:12]
    path = PERFORMANCE_RECEIPTS / (
        f"{stamp}-{release_short}-{payload['mode']}.json"
    )
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    payload["_path"] = str(path)
    return payload


def release_history_rows(limit: int = 8) -> list[dict[str, Any]]:
    rows = [
        row
        for row in finish_history()
        if row.get("status") == "CERTIFIED"
        and isinstance(row.get("total_seconds"), (int, float))
    ]
    result: list[dict[str, Any]] = []
    for row in rows[-limit:]:
        release_sha = str(row.get("release_sha") or "")
        stage = receipt_for_release(STAGE_RECEIPTS, release_sha) if release_sha else None
        activation = (
            receipt_for_release(ACTIVATION_RECEIPTS, release_sha)
            if release_sha
            else None
        )
        deployment = row["phases"].get("deployment")
        stage_seconds = duration_seconds(stage or {})
        activation_seconds = duration_seconds(activation or {})
        known = sum(
            value
            for value in (stage_seconds, activation_seconds)
            if isinstance(value, (int, float))
        )
        orchestration = (
            max(0.0, float(deployment) - known)
            if isinstance(deployment, (int, float))
            and (stage_seconds is not None or activation_seconds is not None)
            else None
        )
        result.append(
            {
                **row,
                "stage_seconds": stage_seconds,
                "activation_seconds": activation_seconds,
                "deployment_other_seconds": orchestration,
                "stage_timings_ms": (
                    stage.get("timings_ms", {})
                    if isinstance(stage, dict)
                    else {}
                ),
            }
        )
    return result


def print_release_history(limit: int) -> None:
    rows = release_history_rows(limit)
    print("⚔️  AOE2WAR RELEASE PERFORMANCE HISTORY")
    print()
    if not rows:
        print("No certified finish receipts with duration data.")
        return
    print(
        f"{'TOTAL':>9} {'DEPLOY':>9} {'STAGE':>9} "
        f"{'ACTIVATE':>9} {'SHA':<12}"
    )
    for row in rows:
        total = float(row["total_seconds"])
        deploy = row["phases"].get("deployment")
        stage = row.get("stage_seconds")
        activation = row.get("activation_seconds")

        def fmt(value: object) -> str:
            if not isinstance(value, (int, float)):
                return "—"
            seconds = float(value)
            return f"{int(seconds // 60):02d}:{seconds % 60:04.1f}"

        print(
            f"{fmt(total):>9} {fmt(deploy):>9} {fmt(stage):>9} "
            f"{fmt(activation):>9} {str(row.get('release_sha') or '—')[:12]}"
        )


def print_status() -> None:
    history = release_history_rows(1)
    latest_finish = history[-1] if history else None
    perf = latest_performance_receipt()
    baseline = baseline_zero_summary()
    ready = ready_coverage()

    print("⚔️  AOE2WAR PERFORMANCE OS")
    print()

    if latest_finish:
        total = float(latest_finish["total_seconds"])
        deploy = latest_finish["phases"].get("deployment")
        docs = sum(
            latest_finish["phases"].get(name, 0.0)
            for name in (
                "pre_release_documentation",
                "post_release_documentation",
            )
        )
        print(
            f"Latest finish:       {total / 60:.2f} min · "
            f"{str(latest_finish.get('release_sha') or '—')[:12]}"
        )
        if isinstance(deploy, (int, float)):
            print(
                f"Deployment phase:    {float(deploy) / 60:.2f} min · "
                f"{float(deploy) / total * 100:.1f}% of finish"
            )
        print(
            f"Docs/context phases: {docs / 60:.2f} min · "
            f"{docs / total * 100:.1f}% of finish"
        )
        stage = latest_finish.get("stage_seconds")
        if isinstance(stage, (int, float)):
            print(f"Stage wall:          {float(stage) / 60:.2f} min")
        else:
            print("Stage wall:          awaiting instrumented release")
    else:
        print("Latest finish:       unavailable")

    if perf:
        cohort = perf.get("cohort") or {}
        print(
            f"Latest benchmark:    {perf.get('mode')} · "
            f"{perf.get('route_count')} routes · "
            f"TTFB p50={float(cohort.get('ttfb_p50_ms', 0)):.1f} ms · "
            f"p95={float(cohort.get('ttfb_p95_ms', 0)):.1f} ms"
        )
    elif baseline:
        print(
            f"Baseline zero:        {baseline['route_count']} routes · "
            f"median TTFB={baseline['median_ttfb_ms']:.1f} ms · "
            f"total={baseline['median_total_ms']:.1f} ms"
        )
    else:
        print("HTTP benchmark:      none")

    print(
        f"Ready coverage:       {ready['ready_route_count']} explicit routes · "
        f"{ready['ready_marker_usages']} marker mount(s)"
    )


def diagnose() -> None:
    history = release_history_rows(1)
    baseline = baseline_zero_summary()
    ready = ready_coverage()

    print("⚔️  AOE2WAR PERFORMANCE DIAGNOSIS")
    print()

    if history:
        latest = history[-1]
        total = float(latest["total_seconds"])
        phases = latest["phases"]
        deploy = float(phases.get("deployment") or 0.0)
        pre_docs = float(phases.get("pre_release_documentation") or 0.0)
        post_docs = float(phases.get("post_release_documentation") or 0.0)
        docs = pre_docs + post_docs

        if total > 0 and deploy / total >= 0.50:
            print(
                "P1 RELEASE BOTTLENECK: deployment is "
                f"{deploy / total * 100:.1f}% of finish "
                f"({deploy / 60:.2f} min)."
            )
        if total > 0 and docs / total >= 0.15:
            print(
                "P2 RELEASE OVERHEAD: documentation/context phases are "
                f"{docs / total * 100:.1f}% of finish "
                f"({docs / 60:.2f} min)."
            )

        stage = latest.get("stage_seconds")
        if isinstance(stage, (int, float)):
            print(f"Stage wall: {float(stage) / 60:.2f} min.")
            timings = latest.get("stage_timings_ms") or {}
            if timings:
                ranked = sorted(
                    (
                        (name, float(ms) / 1000.0)
                        for name, ms in timings.items()
                        if isinstance(ms, (int, float))
                    ),
                    key=lambda item: item[1],
                    reverse=True,
                )
                print("Stage internals:")
                for name, seconds in ranked:
                    print(f"  {seconds:8.2f}s  {name}")
        else:
            print(
                "Stage internals: awaiting first release after V1 instrumentation."
            )

    if baseline:
        print(
            "HTTP baseline zero: "
            f"{baseline['route_count']} routes · "
            f"median TTFB {baseline['median_ttfb_ms']:.1f} ms · "
            f"median total {baseline['median_total_ms']:.1f} ms."
        )

    print(
        "Ready markers: "
        f"{ready['ready_route_count']} explicit route(s); "
        "global SpeedRuntime is present but route-level readiness is not yet "
        "authoritative across the full public cohort."
    )


def compare() -> None:
    receipts = all_performance_receipts()
    if not receipts:
        raise SpeedError("no Performance OS benchmark receipts exist")

    after = receipts[-1]
    after_identity = cohort_identity(after)

    before = next(
        (
            receipt
            for receipt in reversed(receipts[:-1])
            if cohort_identity(receipt) == after_identity
        ),
        None,
    )

    after_label = Path(str(after["_path"])).name
    after_ttfb = float(after["cohort"]["ttfb_p50_ms"])
    after_total = float(after["cohort"]["total_p50_ms"])

    if before is not None:
        before_label = Path(str(before["_path"])).name
        before_ttfb = float(before["cohort"]["ttfb_p50_ms"])
        before_total = float(before["cohort"]["total_p50_ms"])
    elif after.get("mode") == "full":
        baseline = baseline_zero_summary()
        if not baseline:
            raise SpeedError("full benchmark has no comparable baseline zero")
        before_label = "baseline-zero"
        before_ttfb = float(baseline["median_ttfb_ms"])
        before_total = float(baseline["median_total_ms"])
    else:
        raise SpeedError(
            "no previous benchmark exists for this exact route cohort; "
            "capture another like-for-like benchmark before comparing"
        )

    def pct(old: float, new: float) -> float:
        return ((new - old) / old * 100.0) if old else 0.0

    print("⚔️  AOE2WAR PERFORMANCE COMPARISON")
    print()
    print(f"Before: {before_label}")
    print(f"After:  {after_label}")
    print()
    print(
        f"TTFB p50/median: {before_ttfb:.1f} → {after_ttfb:.1f} ms "
        f"({pct(before_ttfb, after_ttfb):+.1f}%)"
    )
    print(
        f"Total p50/median:{before_total:.1f} → {after_total:.1f} ms "
        f"({pct(before_total, after_total):+.1f}%)"
    )


def self_test() -> None:
    assert abs(percentile([1.0, 2.0, 3.0], 0.5) - 2.0) < 0.001
    assert QUICK_ROUTES[0] == "/"
    assert len(QUICK_ROUTES) == len(set(QUICK_ROUTES))
    print("PASS: Performance OS policy invariants")


def main() -> int:
    parser = argparse.ArgumentParser(description="AoE2WAR Performance OS")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("status")
    history = sub.add_parser("release-history")
    history.add_argument("--limit", type=int, default=8)

    bench = sub.add_parser("benchmark")
    bench.add_argument("--full", action="store_true")
    bench.add_argument("--rounds", type=int, default=3)

    sub.add_parser("compare")
    sub.add_parser("diagnose")
    sub.add_parser("self-test")
    parser.add_argument("--self-test", action="store_true", dest="legacy_self_test")

    args = parser.parse_args()

    try:
        if args.legacy_self_test or args.command == "self-test":
            self_test()
            return 0
        if args.command in (None, "status"):
            print_status()
            return 0
        if args.command == "release-history":
            print_release_history(args.limit)
            return 0
        if args.command == "benchmark":
            payload = benchmark(full=args.full, rounds=args.rounds)
            cohort = payload["cohort"]
            seam = payload["origin_seam"]
            print("⚔️  AOE2WAR PERFORMANCE BENCHMARK")
            print()
            print(
                f"Mode:            {payload['mode']} · "
                f"{payload['route_count']} routes × {payload['rounds']} rounds"
            )
            print(f"Release:         {str(payload['release_sha'])[:12]}")
            print(f"Build:           {payload['build_id']}")
            print(
                f"TTFB:            p50={cohort['ttfb_p50_ms']:.1f} ms · "
                f"p75={cohort['ttfb_p75_ms']:.1f} · "
                f"p95={cohort['ttfb_p95_ms']:.1f}"
            )
            print(
                f"Total:           p50={cohort['total_p50_ms']:.1f} ms · "
                f"p75={cohort['total_p75_ms']:.1f} · "
                f"p95={cohort['total_p95_ms']:.1f}"
            )
            if seam.get("public_median_ttfb_ms") and seam.get("origin_median_ttfb_ms"):
                print(
                    "Public/origin:   "
                    f"{seam['public_median_ttfb_ms']:.1f} / "
                    f"{seam['origin_median_ttfb_ms']:.2f} ms · "
                    f"{seam['ratio']:.1f}×"
                )
            print(f"Receipt:         {Path(payload['_path']).relative_to(ROOT)}")
            print()
            print("PASS: performance benchmark captured")
            return 0
        if args.command == "compare":
            compare()
            return 0
        if args.command == "diagnose":
            diagnose()
            return 0
    except SpeedError as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        return 2

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
