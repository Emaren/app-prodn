#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aoe2_council
import aoe2_release
import aoe2_speed_campaign
import aoe2_truth

ROOT = Path(__file__).resolve().parents[1]
TRUTH_STALE_SECONDS = 24 * 60 * 60
PERFORMANCE_STALE_SECONDS = 7 * 24 * 60 * 60


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def war_date(value: datetime) -> str:
    utc = value.astimezone(timezone.utc)
    return f"{utc.year}.{utc.timetuple().tm_yday:03d}.{utc.hour:02d}{utc.minute:02d}Z"


def parse_time(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def freshness(
    generated_at: object,
    *,
    now: datetime,
    stale_after_seconds: int,
) -> dict[str, Any]:
    parsed = parse_time(generated_at)
    if parsed is None:
        return {
            "generated_at": generated_at if isinstance(generated_at, str) else None,
            "age_seconds": None,
            "stale": True,
        }
    age = max(0, int((now - parsed).total_seconds()))
    return {
        "generated_at": iso_z(parsed),
        "age_seconds": age,
        "stale": age > stale_after_seconds,
    }


def source_summary(release: dict[str, Any]) -> dict[str, Any]:
    local = release.get("local") or {}
    github = release.get("github") or {}
    production = release.get("production") or {}
    certification = release.get("certification") or {}

    local_head = local.get("head")
    github_head = github.get("main_sha")
    production_head = production.get("source_sha")
    certified_head = certification.get("release_sha")

    local_clean = local.get("dirty_count") == 0
    production_clean = production.get("dirty_count") in (0, None)
    certified = certification.get("status") == "CERTIFIED"

    exact = bool(
        local_head
        and local_head == github_head == production_head == certified_head
        and local_clean
        and production_clean
        and certified
        and production.get("service") == "active"
        and production.get("version_parity") is True
    )

    return {
        "local": {
            "head": local_head,
            "branch": local.get("branch"),
            "clean": local_clean,
        },
        "github": {
            "main_sha": github_head,
        },
        "production": {
            "source_sha": production_head,
            "clean": production_clean,
            "service": production.get("service"),
            "version_parity": production.get("version_parity"),
            "active_build_id": production.get("active_build_id"),
            "wolo_8092_count": production.get("wolo_8092_count"),
            "wolo_8093_count": production.get("wolo_8093_count"),
        },
        "certification": {
            "status": certification.get("status"),
            "release_sha": certified_head,
            "active_build_id": certification.get("active_build_id"),
            "artifact_sha256": certification.get("artifact_sha256"),
        },
        "exact": exact,
        "production_behind_github": bool(
            github_head and production_head and github_head != production_head
        ),
    }


def latest_truth(now: datetime) -> dict[str, Any]:
    path = aoe2_truth.latest_receipt("closure")
    if path is None:
        return {
            "available": False,
            "receipt": None,
            "freshness": {
                "generated_at": None,
                "age_seconds": None,
                "stale": True,
            },
        }

    try:
        envelope = aoe2_truth.load_json(path)
    except Exception as exc:
        return {
            "available": False,
            "receipt": str(path),
            "error": str(exc),
            "freshness": {
                "generated_at": None,
                "age_seconds": None,
                "stale": True,
            },
        }

    payload = envelope.get("payload") or {}
    closure = payload.get("closure") or {}
    return {
        "available": True,
        "receipt": str(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path),
        "production_source": payload.get("productionSource"),
        "final_games": closure.get("finalGames"),
        "resolved": closure.get("resolved"),
        "unresolved": closure.get("unresolved"),
        "fully_accounted": closure.get("fullyAccounted"),
        "unclassified": closure.get("unclassified"),
        "accounted_percent": closure.get("accountedPercent"),
        "complete": closure.get("complete"),
        "parser_work_candidates": closure.get("parserWorkCandidates"),
        "human_evidence_candidates": closure.get("humanEvidenceCandidates"),
        "terminal_for_current_vault": closure.get("terminalForCurrentVault"),
        "disposition_buckets": closure.get("dispositionBuckets") or {},
        "current_vault_certainty_buckets": (
            closure.get("currentVaultCertaintyBuckets") or {}
        ),
        "freshness": freshness(
            envelope.get("generated_at") or payload.get("generatedAt"),
            now=now,
            stale_after_seconds=TRUTH_STALE_SECONDS,
        ),
    }


def latest_performance(now: datetime) -> dict[str, Any]:
    campaign = aoe2_speed_campaign.latest_campaign()
    if not campaign:
        return {
            "available": False,
            "freshness": {
                "generated_at": None,
                "age_seconds": None,
                "stale": True,
            },
        }

    baseline = campaign.get("baseline") or {}
    cohort = baseline.get("cohort") or {}
    analysis = campaign.get("analysis") or {}
    verification = campaign.get("verification") or {}
    overall = verification.get("overall") or {}

    generated_at = (
        campaign.get("verified_at")
        or campaign.get("analyzed_at")
        or campaign.get("started_at")
    )

    targets = []
    for row in (analysis.get("targets") or [])[:10]:
        if not isinstance(row, dict):
            continue
        targets.append(
            {
                "path": row.get("path"),
                "median_ttfb_ms": row.get("median_ttfb_ms"),
                "median_total_ms": row.get("median_total_ms"),
                "reasons": row.get("reasons") or [],
                "recommendation": row.get("recommendation") or [],
            }
        )

    return {
        "available": True,
        "campaign_id": campaign.get("campaign_id"),
        "status": campaign.get("status"),
        "release_sha": baseline.get("release_sha"),
        "build_id": baseline.get("build_id"),
        "route_count": baseline.get("route_count"),
        "baseline": {
            "ttfb_p50_ms": cohort.get("ttfb_p50_ms"),
            "total_p50_ms": cohort.get("total_p50_ms"),
        },
        "verification": {
            "status": verification.get("status"),
            "ttfb_p50_before_ms": overall.get("ttfb_p50_before_ms"),
            "ttfb_p50_after_ms": overall.get("ttfb_p50_after_ms"),
            "total_p50_before_ms": overall.get("total_p50_before_ms"),
            "total_p50_after_ms": overall.get("total_p50_after_ms"),
            "material_improvements": verification.get("material_improvements"),
            "material_regressions": verification.get("material_regressions"),
        }
        if verification
        else None,
        "targets": targets,
        "freshness": freshness(
            generated_at,
            now=now,
            stale_after_seconds=PERFORMANCE_STALE_SECONDS,
        ),
    }


def storage_summary(storage: dict[str, Any]) -> dict[str, Any]:
    volume = storage.get("volume") or {}
    return {
        "health": storage.get("health") or storage.get("status"),
        "volume_used_percent": (
            storage.get("volume_used_percent")
            or storage.get("used_percent")
            or volume.get("used_percent")
        ),
        "volume_free_bytes": (
            storage.get("volume_free_bytes")
            or storage.get("free_bytes")
            or volume.get("free_bytes")
        ),
        "root_free_bytes": (
            storage.get("root_free_bytes")
            or (storage.get("root") or {}).get("free_bytes")
        ),
    }


def invariant_rows(
    *,
    source: dict[str, Any],
    council: dict[str, Any],
    truth: dict[str, Any],
) -> list[dict[str, str]]:
    production = source.get("production") or {}
    recovery = council.get("recovery") or {}
    rows = [
        {
            "key": "source-authority-exact",
            "status": "PASS" if source.get("exact") else "ATTENTION",
            "evidence": "local/GitHub/production/certification identity",
        },
        {
            "key": "estate-p0-zero",
            "status": "PASS" if int(council.get("p0") or 0) == 0 else "FAIL",
            "evidence": f"P0={int(council.get('p0') or 0)}",
        },
        {
            "key": "estate-p1-zero",
            "status": "PASS" if int(council.get("p1") or 0) == 0 else "ATTENTION",
            "evidence": f"P1={int(council.get('p1') or 0)}",
        },
        {
            "key": "wolo-listener-boundary",
            "status": (
                "PASS"
                if production.get("wolo_8092_count") == 1
                and production.get("wolo_8093_count") == 1
                else "FAIL"
            ),
            "evidence": (
                f"8092={production.get('wolo_8092_count')} "
                f"8093={production.get('wolo_8093_count')}"
            ),
        },
        {
            "key": "offhost-recovery-verified",
            "status": "PASS" if recovery.get("status") == "VERIFIED" else "ATTENTION",
            "evidence": f"recovery={recovery.get('status') or 'UNKNOWN'}",
        },
        {
            "key": "replay-certainty-accounted",
            "status": (
                "PASS"
                if truth.get("available")
                and truth.get("complete") is True
                and int(truth.get("unclassified") or 0) == 0
                else "ATTENTION"
            ),
            "evidence": (
                f"accounted={truth.get('accounted_percent')}% "
                f"unclassified={truth.get('unclassified')}"
                if truth.get("available")
                else "closure receipt unavailable"
            ),
        },
    ]
    return rows


def operating_state(
    *,
    source: dict[str, Any],
    council: dict[str, Any],
    invariants: list[dict[str, str]],
) -> str:
    if any(row["status"] == "FAIL" for row in invariants):
        return "BLOCKED"
    if (
        not source.get("exact")
        or int(council.get("p1") or 0) > 0
        or str(council.get("doctor_status") or "").upper()
        not in {"HEALTHY", "PASS"}
    ):
        return "ATTENTION"
    return "READY"


def collect() -> dict[str, Any]:
    now = now_utc()
    release = aoe2_release.collect()
    council = aoe2_council.collect()
    source = source_summary(release)
    truth = latest_truth(now)
    performance = latest_performance(now)
    invariants = invariant_rows(
        source=source,
        council=council,
        truth=truth,
    )

    recommendations = council.get("recommendations") or []
    return {
        "schema": 1,
        "kind": "aoe2war-kingdom-intelligence",
        "generated_at": iso_z(now),
        "war_date": war_date(now),
        "operating_state": operating_state(
            source=source,
            council=council,
            invariants=invariants,
        ),
        "source": source,
        "health": {
            "estate": council.get("estate"),
            "p0": int(council.get("p0") or 0),
            "p1": int(council.get("p1") or 0),
            "doctor_score": council.get("doctor_score"),
            "doctor_status": council.get("doctor_status"),
        },
        "storage": storage_summary(council.get("storage") or {}),
        "host": council.get("host") or {},
        "recovery": council.get("recovery") or {},
        "workspace": council.get("workspace") or {},
        "performance": performance,
        "replay_truth": truth,
        "knowledge": {
            "docs_due_7d": council.get("docs_due_7d"),
            "ready_coverage": council.get("ready_coverage") or {},
            "architecture_opportunities": (
                council.get("architecture_opportunities") or []
            ),
        },
        "invariants": invariants,
        "recommendations": recommendations,
        "best_next_action": council.get("best_next_action"),
    }


def short_sha(value: object) -> str:
    return str(value or "—")[:10]


def print_payload(payload: dict[str, Any]) -> None:
    source = payload["source"]
    health = payload["health"]
    storage = payload["storage"]
    truth = payload["replay_truth"]
    performance = payload["performance"]
    best = payload.get("best_next_action")

    print("🧠  AOE2WAR KINGDOM INTELLIGENCE")
    print()
    print(f"War Date:        {payload['war_date']}")
    print(f"Operating state: {payload['operating_state']}")
    print()
    print(
        "Source:          "
        f"local {short_sha(source['local'].get('head'))} · "
        f"GitHub {short_sha(source['github'].get('main_sha'))} · "
        f"production {short_sha(source['production'].get('source_sha'))}"
    )
    print(
        "Certification:   "
        f"{source['certification'].get('status') or '—'} · "
        f"exact={'YES' if source.get('exact') else 'NO'}"
    )
    print(
        "Health:          "
        f"Doctor {health.get('doctor_score')}/100 · "
        f"{health.get('doctor_status')} · "
        f"P0={health.get('p0')} P1={health.get('p1')}"
    )
    print(
        "Storage:         "
        f"{storage.get('health') or '—'} · "
        f"volume used={storage.get('volume_used_percent') if storage.get('volume_used_percent') is not None else '—'}%"
    )
    print(
        "Recovery:        "
        f"{(payload.get('recovery') or {}).get('status') or 'UNKNOWN'}"
    )

    if truth.get("available"):
        print(
            "Replay truth:    "
            f"{truth.get('resolved')}/{truth.get('final_games')} resolved · "
            f"{truth.get('accounted_percent')}% certainty accounted · "
            f"parser work={truth.get('parser_work_candidates')}"
        )
    else:
        print("Replay truth:    no closure receipt")

    if performance.get("available"):
        baseline = performance.get("baseline") or {}
        print(
            "Performance:     "
            f"{performance.get('status')} · "
            f"{performance.get('route_count')} routes · "
            f"TTFB p50={baseline.get('ttfb_p50_ms')} ms · "
            f"total p50={baseline.get('total_p50_ms')} ms"
        )
    else:
        print("Performance:     no campaign receipt")

    print()
    print("Invariants:")
    for row in payload["invariants"]:
        print(f"  {row['status']:<9} {row['key']} · {row['evidence']}")

    print()
    if best:
        print(f"BEST NEXT ACTION: {best.get('title')}")
        print(f"→ {best.get('action')}")
        print(f"Why: {best.get('reason')}")
    else:
        print("BEST NEXT ACTION: none — core operating checks are clear.")


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="aoe2war brain",
        description=(
            "Read-only Kingdom Intelligence snapshot combining current source, "
            "health, storage, recovery, performance, replay certainty, "
            "invariants and ranked next action."
        ),
    )
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        payload = collect()
    except Exception as exc:
        if args.json:
            print(
                json.dumps(
                    {
                        "schema": 1,
                        "kind": "aoe2war-kingdom-intelligence",
                        "status": "ERROR",
                        "error": str(exc),
                    },
                    indent=2,
                    sort_keys=True,
                )
            )
        else:
            print(f"STOP: {exc}")
        return 2

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print_payload(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
