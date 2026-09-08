#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import os
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


def parse_worktree_porcelain(text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    current: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.rstrip("\n")
        if not line:
            if current:
                rows.append(current)
                current = {}
            continue
        key, _, value = line.partition(" ")
        if key in {"worktree", "HEAD", "branch"}:
            current[key] = value
    if current:
        rows.append(current)
    return rows


def canonical_main_worktree() -> Path:
    override = os.getenv("AOE2_SPEED_AUTHORITY_ROOT", "").strip()
    if override:
        candidate = Path(override).expanduser().resolve()
        if not (candidate / ".git").exists():
            raise RuntimeError(
                f"AOE2_SPEED_AUTHORITY_ROOT is not a git worktree: {candidate}"
            )
        return candidate

    proc = subprocess.run(
        ["git", "worktree", "list", "--porcelain"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode == 0:
        for row in parse_worktree_porcelain(proc.stdout):
            if row.get("branch") == "refs/heads/main" and row.get("worktree"):
                return Path(row["worktree"]).resolve()
    return ROOT


AUTHORITY_ROOT = canonical_main_worktree()
STATE = Path(
    os.getenv(
        "AOE2_SPEED_STATE_ROOT",
        str(AUTHORITY_ROOT / ".aoe2war-release"),
    )
).expanduser().resolve()
FINISH_RECEIPTS = STATE / "finish-receipts"
STAGE_RECEIPTS = STATE / "stage-receipts"
ACTIVATION_RECEIPTS = STATE / "activation-receipts"
PERFORMANCE_RECEIPTS = STATE / "performance-receipts"
PERFORMANCE_ATTEMPTS = STATE / "performance-attempts"
BASELINE_DIR = STATE / "performance-baselines"


def evidence_ref(path: str | Path) -> str:
    value = Path(path).expanduser().resolve()
    try:
        relative = value.relative_to(STATE)
        return str(Path(".aoe2war-release") / relative)
    except ValueError:
        pass
    try:
        return str(value.relative_to(ROOT))
    except ValueError:
        return str(value)


def resolve_evidence_ref(value: str | Path) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    parts = path.parts
    if parts and parts[0] == ".aoe2war-release":
        return STATE.joinpath(*parts[1:])
    return ROOT / path
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
            "source": evidence_ref(summary_path),
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


CURL_METRIC_FORMAT = (
    "%{http_code}\\t%{time_namelookup}\\t%{time_connect}\\t"
    "%{time_appconnect}\\t%{time_starttransfer}\\t%{time_total}\\t"
    "%{size_download}\\t%{num_connects}\\t%{url_effective}"
)


def parse_curl_metric_line(line: str, url: str) -> dict[str, Any] | None:
    fields = line.rstrip("\n").split("\t")
    if len(fields) != 9:
        return None
    code, dns, connect, tls, ttfb, total, size_download, connects, effective = fields
    try:
        return {
            "ok": int(code) == 200,
            "http_code": int(code),
            "dns_ms": float(dns) * 1000,
            "connect_ms": float(connect) * 1000,
            "tls_ms": float(tls) * 1000,
            "ttfb_ms": float(ttfb) * 1000,
            "total_ms": float(total) * 1000,
            "download_bytes": int(float(size_download)),
            "new_connections": int(float(connects)),
            "effective_url": effective,
            "url": url,
        }
    except (TypeError, ValueError):
        return None


def run_curl(url: str, timeout: int = 15) -> dict[str, Any]:
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
            CURL_METRIC_FORMAT,
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
    parsed = parse_curl_metric_line(proc.stdout, url)
    if parsed is None:
        return {
            "ok": False,
            "error": "unexpected curl metric output",
            "url": url,
        }
    return parsed


def run_curl_sequence(
    urls: list[str],
    *,
    timeout: int = 15,
) -> list[dict[str, Any]]:
    """Measure several transfers in one curl process so its connection cache survives."""
    if not urls:
        return []

    command = [
        "curl",
        "-sS",
        "-L",
        "--compressed",
        "--max-time",
        str(timeout),
        "-w",
        CURL_METRIC_FORMAT + "\\n",
    ]
    for url in urls:
        command.extend(["-o", "/dev/null", url])

    proc = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        return []

    lines = proc.stdout.splitlines()
    if len(lines) != len(urls):
        return []

    rows: list[dict[str, Any]] = []
    for index, (line, url) in enumerate(zip(lines, urls, strict=True)):
        parsed = parse_curl_metric_line(line, url)
        if parsed is None:
            return []
        parsed["sequence_index"] = index
        rows.append(parsed)
    return rows


def benchmark_sample(
    url: str,
    *,
    retries: int = 1,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    failures: list[dict[str, Any]] = []
    sample = run_curl(url)

    if sample.get("ok"):
        return sample, failures

    failures.append({**sample, "attempt": 1})

    for retry_no in range(1, retries + 1):
        retry = run_curl(url)
        if retry.get("ok"):
            retry["retry_count"] = retry_no
            return retry, failures
        failures.append(
            {
                **retry,
                "attempt": retry_no + 1,
            }
        )
        sample = retry

    return sample, failures


def persist_failed_benchmark_attempt(
    *,
    identity: dict[str, Any],
    full: bool,
    rounds: int,
    route_count: int,
    elapsed_seconds: float,
    failures: list[dict[str, Any]],
) -> Path:
    PERFORMANCE_ATTEMPTS.mkdir(
        parents=True,
        exist_ok=True,
    )
    payload = {
        "schema": 1,
        "kind": "aoe2war-performance-benchmark-attempt",
        "status": "FAILED",
        "generated_at": utc_now(),
        "mode": "full" if full else "quick",
        "rounds": rounds,
        "route_count": route_count,
        "elapsed_seconds": round(elapsed_seconds, 3),
        **identity,
        "failed_samples": failures,
    }
    stamp = datetime.now(
        timezone.utc
    ).strftime("%Y%m%dT%H%M%SZ")
    release_short = str(
        identity.get("release_sha") or "unknown"
    )[:12]
    path = PERFORMANCE_ATTEMPTS / (
        f"{stamp}-{release_short}-"
        f"{payload['mode']}-failed.json"
    )
    path.write_text(
        json.dumps(
            payload,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    return path


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


def keepalive_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if len(rows) < 2 or not rows[0].get("ok"):
        return {
            "available": False,
            "reason": "at least two successful same-process transfers are required",
        }
    warm = [row for row in rows[1:] if row.get("ok")]
    if not warm:
        return {
            "available": False,
            "reason": "no successful warm transfer followed the priming request",
        }

    cold_ttfb = float(rows[0]["ttfb_ms"])
    warm_ttfb = statistics.median(float(row["ttfb_ms"]) for row in warm)
    warm_total = statistics.median(float(row["total_ms"]) for row in warm)
    return {
        "available": True,
        "transfer_count": len(rows),
        "warm_samples": len(warm),
        "cold_ttfb_ms": cold_ttfb,
        "cold_total_ms": float(rows[0]["total_ms"]),
        "warm_median_ttfb_ms": warm_ttfb,
        "warm_median_total_ms": warm_total,
        "cold_dns_ms": float(rows[0]["dns_ms"]),
        "cold_connect_ms": float(rows[0]["connect_ms"]),
        "cold_tls_complete_ms": float(rows[0]["tls_ms"]),
        "connection_setup_delta_ms": max(0.0, cold_ttfb - warm_ttfb),
        "warm_new_connection_transfers": sum(
            1 for row in warm if int(row.get("new_connections") or 0) > 0
        ),
        "warm_reused_connection_transfers": sum(
            1 for row in warm if int(row.get("new_connections") or 0) == 0
        ),
    }


def remote_origin_keepalive(samples: int) -> list[dict[str, Any]]:
    count = max(2, samples)
    operands = " ".join(
        f"-o /dev/null {ORIGIN_SPEED_URL}"
        for _ in range(count)
    )
    script = (
        "curl -fsS -L --compressed --max-time 5 "
        f"-w '{CURL_METRIC_FORMAT}\\n' {operands}\n"
    )
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
    if proc.returncode != 0:
        return []
    lines = proc.stdout.splitlines()
    if len(lines) != count:
        return []
    rows: list[dict[str, Any]] = []
    for index, line in enumerate(lines):
        parsed = parse_curl_metric_line(line, ORIGIN_SPEED_URL)
        if parsed is None:
            return []
        parsed["sequence_index"] = index
        rows.append(parsed)
    return rows


def origin_seam(samples: int = 5) -> dict[str, Any]:
    # Preserve the historical isolated-process metric exactly. It remains useful
    # for cold first-visit latency and keeps old receipts comparable.
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

    sequence_count = max(3, samples)
    public_keepalive = keepalive_summary(
        run_curl_sequence(
            [PUBLIC_SPEED_URL] * sequence_count,
            timeout=10,
        )
    )
    origin_keepalive = keepalive_summary(
        remote_origin_keepalive(sequence_count)
    )

    warm_ratio = None
    warm_gap = None
    if public_keepalive.get("available") and origin_keepalive.get("available"):
        public_warm = float(public_keepalive["warm_median_ttfb_ms"])
        origin_warm = float(origin_keepalive["warm_median_ttfb_ms"])
        if origin_warm > 0:
            warm_ratio = public_warm / origin_warm
            warm_gap = public_warm - origin_warm

    legacy_ratio = (
        statistics.median(public) / statistics.median(origin)
        if public and origin and statistics.median(origin) > 0
        else None
    )

    return {
        "measurement_contract": "isolated_process_legacy_plus_keepalive_v2",
        "public_samples": len(public),
        "origin_samples": len(origin),
        "public_median_ttfb_ms": statistics.median(public) if public else None,
        "origin_median_ttfb_ms": statistics.median(origin) if origin else None,
        "ratio": legacy_ratio,
        "legacy_isolated_process_ratio": legacy_ratio,
        "public_keepalive": public_keepalive,
        "origin_keepalive": origin_keepalive,
        "warm_ratio": warm_ratio,
        "warm_delivery_gap_ms": warm_gap,
        "public_connection_setup_delta_ms": (
            public_keepalive.get("connection_setup_delta_ms")
            if public_keepalive.get("available")
            else None
        ),
    }


def warm_route_probe(
    routes: list[str],
    rounds: int,
) -> dict[str, Any]:
    """Supplement the legacy cold route benchmark with browser-like connection reuse."""
    warm_rounds = min(max(1, rounds), 3)
    urls = [PUBLIC_SPEED_URL]
    labels: list[tuple[int, str]] = []
    for round_no in range(1, warm_rounds + 1):
        for path in routes:
            urls.append(PUBLIC_BASE + path)
            labels.append((round_no, path))

    rows = run_curl_sequence(urls, timeout=15)
    if len(rows) != len(urls) or not rows[0].get("ok"):
        return {
            "available": False,
            "rounds": warm_rounds,
            "sample_count": 0,
            "reason": "same-process public route sequence failed or was incomplete",
            "samples": [],
        }

    route_rows = rows[1:]
    for row, (round_no, path) in zip(route_rows, labels, strict=True):
        row["round"] = round_no
        row["path"] = path

    if any(not row.get("ok") for row in route_rows):
        return {
            "available": False,
            "rounds": warm_rounds,
            "sample_count": len(route_rows),
            "reason": "one or more warm route transfers failed",
            "samples": route_rows,
        }

    reused = sum(
        1 for row in route_rows if int(row.get("new_connections") or 0) == 0
    )
    return {
        "available": True,
        "rounds": warm_rounds,
        "sample_count": len(route_rows),
        "prime_ttfb_ms": float(rows[0]["ttfb_ms"]),
        "reused_connection_transfers": reused,
        "new_connection_transfers": len(route_rows) - reused,
        "reused_connection_percent": reused / len(route_rows) * 100.0 if route_rows else 0.0,
        "samples": route_rows,
    }


def warm_route_cohort(per_route: list[dict[str, Any]]) -> dict[str, float] | None:
    rows = [
        {
            "median_ttfb_ms": row["warm_median_ttfb_ms"],
            "median_total_ms": row["warm_median_total_ms"],
        }
        for row in per_route
        if isinstance(row.get("warm_median_ttfb_ms"), (int, float))
        and isinstance(row.get("warm_median_total_ms"), (int, float))
    ]
    if len(rows) != len(per_route) or not rows:
        return None
    return summarize_route_cohort(rows)


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

def production_performance_incidents() -> dict[str, Any]:
    script = r'''
logs="$(journalctl -u aoe2hdbets-web.service --since '-60 minutes' --no-pager -n 2500 2>/dev/null || true)"
count_pattern() {
  printf '%s\n' "$logs" | grep -Eic "$1" 2>/dev/null || true
}
printf 'physical_archive_scan_timeout=%s\n' "$(count_pattern 'physical archive scan exceeded')"
printf 'speed_telemetry_timeout=%s\n' "$(count_pattern 'Speed telemetry relay failed|Speed report service unavailable')"
printf 'upstream_timeout=%s\n' "$(count_pattern 'TimeoutError|timed out|timeout exceeded')"
printf 'database_error=%s\n' "$(count_pattern 'Prisma.*(error|timeout)|database.*(error|timeout)|connection pool.*timeout')"
printf 'memory_pressure=%s\n' "$(count_pattern 'heap out of memory|ENOMEM|allocation failed|JavaScript heap')"
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

    counts: dict[str, int] = {}
    for line in proc.stdout.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        try:
            counts[key.strip()] = max(0, int(value.strip() or "0"))
        except ValueError:
            counts[key.strip()] = 0

    return {
        "available": True,
        "window_minutes": 60,
        "counts": counts,
    }

def git_head(root: Path = ROOT) -> str | None:
    proc = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    value = proc.stdout.strip()
    return value if proc.returncode == 0 and value else None


def release_authority_data() -> dict[str, Any]:
    release_tool = AUTHORITY_ROOT / "scripts" / "aoe2_release.py"
    spec = importlib.util.spec_from_file_location(
        "aoe2_speed_release_authority",
        release_tool,
    )
    if not spec or not spec.loader:
        raise SpeedError(f"cannot load release authority: {release_tool}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    data = module.collect()
    if not isinstance(data, dict):
        raise SpeedError("release authority returned invalid state")
    return data


def collect_release_identity() -> dict[str, Any]:
    data = release_authority_data()
    return {
        "release_sha": data.get("production", {}).get("source_sha"),
        "operator_source_sha": git_head(ROOT),
        "github_main_sha": data.get("github", {}).get("main_sha"),
        "build_id": data.get("production", {}).get("active_build_id"),
        "build_version": data.get("production", {}).get("internal_build_version"),
        "certification": data.get("certification", {}).get("status"),
        "release_authority_root": str(AUTHORITY_ROOT),
        "performance_state_root": str(STATE),
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


def benchmark(
    *,
    full: bool,
    rounds: int,
    routes_override: list[str] | None = None,
) -> dict[str, Any]:
    if rounds < 1 or rounds > 10:
        raise SpeedError("rounds must be between 1 and 10")

    identity = collect_release_identity()
    if identity.get("certification") != "CERTIFIED":
        raise SpeedError("production is not CERTIFIED")

    routes = (
        list(routes_override)
        if routes_override is not None
        else route_list(full)
    )
    if not routes:
        raise SpeedError("performance route cohort is empty")
    if len(routes) != len(set(routes)):
        raise SpeedError("performance route cohort contains duplicate paths")
    if any(not path.startswith("/") for path in routes):
        raise SpeedError("performance route cohort contains a non-route entry")
    samples: list[dict[str, Any]] = []
    recovered_failures: list[dict[str, Any]] = []
    failed_attempts: list[dict[str, Any]] = []
    started = time.monotonic()

    for round_no in range(1, rounds + 1):
        for path in routes:
            sample, failures = benchmark_sample(
                PUBLIC_BASE + path,
                retries=1,
            )
            enriched_failures = [
                {
                    **failure,
                    "round": round_no,
                    "path": path,
                }
                for failure in failures
            ]
            failed_attempts.extend(
                enriched_failures
            )
            if failures and sample.get("ok"):
                recovered_failures.extend(
                    enriched_failures
                )
            sample.update(
                {
                    "round": round_no,
                    "path": path,
                }
            )
            samples.append(sample)

    elapsed = time.monotonic() - started
    passing = [
        sample
        for sample in samples
        if sample.get("ok")
    ]
    failed = [
        sample
        for sample in samples
        if not sample.get("ok")
    ]
    if failed:
        attempt_path = persist_failed_benchmark_attempt(
            identity=identity,
            full=full,
            rounds=rounds,
            route_count=len(routes),
            elapsed_seconds=elapsed,
            failures=failed_attempts,
        )
        raise SpeedError(
            f"{len(failed)} HTTP benchmark sample(s) failed after one "
            f"bounded retry; first={failed[0]}; "
            f"receipt={attempt_path}"
        )

    warm_probe = warm_route_probe(routes, rounds)
    warm_samples = list(warm_probe.get("samples") or [])

    per_route: list[dict[str, Any]] = []
    for path in routes:
        route_samples = [sample for sample in passing if sample["path"] == path]
        row: dict[str, Any] = {
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
        warm_for_route = [
            sample
            for sample in warm_samples
            if sample.get("path") == path and sample.get("ok")
        ]
        if warm_probe.get("available") and warm_for_route:
            row.update(
                {
                    "warm_samples": len(warm_for_route),
                    "warm_median_ttfb_ms": statistics.median(
                        float(sample["ttfb_ms"]) for sample in warm_for_route
                    ),
                    "warm_median_total_ms": statistics.median(
                        float(sample["total_ms"]) for sample in warm_for_route
                    ),
                    "warm_median_download_bytes": int(
                        statistics.median(
                            int(sample["download_bytes"])
                            for sample in warm_for_route
                        )
                    ),
                    "warm_reused_connection_percent": (
                        sum(
                            1
                            for sample in warm_for_route
                            if int(sample.get("new_connections") or 0) == 0
                        )
                        / len(warm_for_route)
                        * 100.0
                    ),
                }
            )
        per_route.append(row)

    seam = origin_seam()
    ready = ready_coverage()
    capacity = production_capacity_snapshot()
    incidents = production_performance_incidents()

    payload = {
        "schema": 1,
        "kind": "aoe2war-performance-benchmark",
        "generated_at": utc_now(),
        "mode": "full" if full else "quick",
        "rounds": rounds,
        "route_count": len(routes),
        "request_count": len(passing),
        "elapsed_seconds": round(elapsed, 3),
        "recovered_sample_failure_count": len(
            recovered_failures
        ),
        "recovered_sample_failures": recovered_failures,
        "unstable_routes": sorted(
            {
                str(row.get("path"))
                for row in recovered_failures
                if row.get("path")
            }
        ),
        **identity,
        "cohort": summarize_route_cohort(per_route),
        "warm_cohort": warm_route_cohort(per_route),
        "connection_reuse_probe": {
            key: value
            for key, value in warm_probe.items()
            if key != "samples"
        },
        "origin_seam": seam,
        "ready_coverage": ready,
        "production_capacity": capacity,
        "performance_incidents": incidents,
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
                    "Cold public/origin: "
                    f"{seam['public_median_ttfb_ms']:.1f} / "
                    f"{seam['origin_median_ttfb_ms']:.2f} ms · "
                    f"{seam['ratio']:.1f}×"
                )
            public_keepalive = seam.get("public_keepalive") or {}
            origin_keepalive = seam.get("origin_keepalive") or {}
            if (
                seam.get("warm_ratio") is not None
                and public_keepalive.get("available")
                and origin_keepalive.get("available")
            ):
                print(
                    "Warm public/origin: "
                    f"{public_keepalive['warm_median_ttfb_ms']:.1f} / "
                    f"{origin_keepalive['warm_median_ttfb_ms']:.2f} ms · "
                    f"{seam['warm_ratio']:.1f}×"
                )
            if seam.get("public_connection_setup_delta_ms") is not None:
                print(
                    "Connection setup:   "
                    f"~{float(seam['public_connection_setup_delta_ms']):.1f} ms "
                    "cold-to-warm delta"
                )
            print(f"Receipt:         {evidence_ref(payload['_path'])}")
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
