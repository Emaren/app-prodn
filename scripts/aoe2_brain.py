#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import aoe2_council
import aoe2_release
import aoe2_recovery_campaign
import aoe2_speed_campaign
import aoe2_storage_campaign
import aoe2_storage_handoff
import aoe2_truth
import aoe2_update

ROOT = Path(__file__).resolve().parents[1]
TRUTH_STALE_SECONDS = 24 * 60 * 60
PERFORMANCE_STALE_SECONDS = 7 * 24 * 60 * 60
FINISH_RECEIPT_DIR = ROOT / ".aoe2war-release" / "finish-receipts"
COLD_LCP_ROOT = ROOT / ".aoe2war-release" / "performance-cold-lcp"
EDGE_RECEIPT_ROOT = ROOT / ".aoe2war-release" / "performance-edge-receipts"
ENGINEERING_MEMORY_PATH = ROOT / "docs" / "ENGINEERING_MEMORY.md"


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
    documentation = release.get("documentation") or {}
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
    implementation_equivalent = bool(
        documentation.get("production_implementation_equivalent") is True
        and local_head
        and local_head == github_head
        and local_clean
        and production_head
        and production_clean
        and certified
        and certified_head == production_head
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
            "root_free_kb": production.get("root_free_kb"),
            "volume_free_kb": production.get("volume_free_kb"),
            "wolo_8092_count": production.get("wolo_8092_count"),
            "wolo_8093_count": production.get("wolo_8093_count"),
        },
        "certification": {
            "status": certification.get("status"),
            "release_sha": certified_head,
            "active_build_id": certification.get("active_build_id"),
            "artifact_sha256": certification.get("artifact_sha256"),
        },
        "documentation": {
            "implementation_baseline": documentation.get("implementation_baseline"),
            "release_head_is_docs_descendant": documentation.get(
                "release_head_is_docs_descendant"
            ),
        },
        "exact": exact,
        "implementation_equivalent": implementation_equivalent,
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


def read_json_object(path: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def latest_cold_lcp(now: datetime) -> dict[str, Any]:
    if not COLD_LCP_ROOT.is_dir():
        return {"available": False}

    receipts = sorted(
        COLD_LCP_ROOT.glob("*/receipt.json"),
        key=lambda path: (path.stat().st_mtime_ns, str(path)),
        reverse=True,
    )
    for path in receipts:
        payload = read_json_object(path)
        if not payload or payload.get("kind") != "aoe2war-cold-process-lcp":
            continue
        summary = payload.get("summary") or {}
        if not isinstance(summary, dict):
            summary = {}
        targets = summary.get("lcpTargets") or []
        top_target_count = 0
        if isinstance(targets, list):
            for item in targets:
                if not isinstance(item, dict):
                    continue
                try:
                    top_target_count = max(
                        top_target_count,
                        int(item.get("count") or 0),
                    )
                except (TypeError, ValueError):
                    continue

        metrics: dict[str, dict[str, Any]] = {}
        for source_key, target_key in (
            ("lcpMs", "lcp_ms"),
            ("readyMs", "ready_ms"),
            ("documentTtfbMs", "document_ttfb_ms"),
        ):
            row = summary.get(source_key) or {}
            if not isinstance(row, dict):
                row = {}
            metrics[target_key] = {
                key: row.get(key)
                for key in ("count", "p50", "p75", "p95", "max")
            }

        generated_at = payload.get("generatedAt")
        return {
            "available": True,
            "release_sha": payload.get("releaseSha"),
            "build_version": payload.get("buildVersion"),
            "generated_at": generated_at,
            "samples": payload.get("samples"),
            "top_lcp_target_count": top_target_count,
            "mutation_boundary": {
                "production_mutated": payload.get("productionMutated"),
                "database_mutated": payload.get("databaseMutated"),
                "wolo_mutated": payload.get("woloMutated"),
            },
            "metrics": metrics,
            "freshness": freshness(
                generated_at,
                now=now,
                stale_after_seconds=PERFORMANCE_STALE_SECONDS,
            ),
        }
    return {"available": False}


def edge_ratio(rows: object) -> dict[str, int]:
    values = rows if isinstance(rows, list) else []
    passed = 0
    for item in values:
        if not isinstance(item, dict):
            continue
        final = item.get("final") or {}
        if (
            isinstance(final, dict)
            and final.get("cf_cache_status") == "HIT"
            and int(final.get("http_status") or 0) == 200
        ):
            passed += 1
    return {"passed": passed, "total": len(values)}


def latest_edge_delivery(now: datetime) -> dict[str, Any]:
    if not EDGE_RECEIPT_ROOT.is_dir():
        return {"available": False}

    receipts = sorted(
        EDGE_RECEIPT_ROOT.glob("*cloudflare-featured-avatar-apply.json"),
        key=lambda path: (path.stat().st_mtime_ns, path.name),
        reverse=True,
    )
    for path in receipts:
        payload = read_json_object(path)
        if not payload:
            continue
        verification = payload.get("verification") or {}
        avatar_plan = payload.get("avatar_plan") or {}
        if not isinstance(verification, dict) or not isinstance(avatar_plan, dict):
            continue
        generated_at = (
            verification.get("generated_at")
            or payload.get("generated_at")
            or avatar_plan.get("generated_at")
        )
        return {
            "available": True,
            "release_sha": avatar_plan.get("release_sha"),
            "generated_at": generated_at,
            "ok": bool(verification.get("ok")),
            "static": edge_ratio(verification.get("static_cohort")),
            "dynamic": edge_ratio(verification.get("dynamic_cohort")),
            "featured_avatar": edge_ratio(
                verification.get("featured_avatar_rows")
            ),
            "freshness": freshness(
                generated_at,
                now=now,
                stale_after_seconds=PERFORMANCE_STALE_SECONDS,
            ),
        }
    return {"available": False}


def latest_performance(now: datetime) -> dict[str, Any]:
    cold_lcp = latest_cold_lcp(now)
    edge_delivery = latest_edge_delivery(now)
    campaign = aoe2_speed_campaign.latest_campaign()
    if not campaign:
        return {
            "available": False,
            "cold_lcp": cold_lcp,
            "edge_delivery": edge_delivery,
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

    def target_rows(source_analysis: dict[str, Any]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for row in (source_analysis.get("targets") or [])[:10]:
            if not isinstance(row, dict):
                continue
            rows.append(
                {
                    "path": row.get("path"),
                    "median_ttfb_ms": row.get("median_ttfb_ms"),
                    "median_total_ms": row.get("median_total_ms"),
                    "reasons": row.get("reasons") or [],
                    "recommendation": row.get("recommendation") or [],
                }
            )
        return rows

    baseline_targets = target_rows(analysis)
    targets = baseline_targets
    target_basis = "baseline_analysis"
    target_release_sha = baseline.get("release_sha")

    verification_receipt = verification.get("receipt") if verification else None
    if isinstance(verification_receipt, str) and verification_receipt.strip():
        receipt_path = Path(verification_receipt)
        if not receipt_path.is_absolute():
            receipt_path = ROOT / receipt_path
        try:
            after_receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            after_receipt = None
        if isinstance(after_receipt, dict):
            inventory_after = (
                (verification.get("source_inventory") or {}).get("after")
                if isinstance(verification.get("source_inventory"), dict)
                else None
            )
            verified_analysis = aoe2_speed_campaign.analyze_baseline(
                after_receipt,
                inventory_after if isinstance(inventory_after, dict) else None,
            )
            targets = target_rows(verified_analysis)
            target_basis = "verification_after"
            target_release_sha = verification.get("release_sha")

    effective_release_sha = (
        verification.get("release_sha")
        if verification
        else baseline.get("release_sha")
    )
    effective_build_id = (
        verification.get("build_id")
        if verification
        else baseline.get("build_id")
    )

    return {
        "available": True,
        "campaign_id": campaign.get("campaign_id"),
        "status": campaign.get("status"),
        "release_sha": effective_release_sha,
        "build_id": effective_build_id,
        "baseline_release_sha": baseline.get("release_sha"),
        "verification_release_sha": verification.get("release_sha") if verification else None,
        "route_count": baseline.get("route_count"),
        "baseline": {
            "ttfb_p50_ms": cohort.get("ttfb_p50_ms"),
            "total_p50_ms": cohort.get("total_p50_ms"),
        },
        "verification": {
            "status": verification.get("status"),
            "release_sha": verification.get("release_sha"),
            "build_id": verification.get("build_id"),
            "build_version": verification.get("build_version"),
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
        "target_basis": target_basis,
        "target_release_sha": target_release_sha,
        "baseline_targets": baseline_targets,
        "cold_lcp": cold_lcp,
        "edge_delivery": edge_delivery,
        "freshness": freshness(
            generated_at,
            now=now,
            stale_after_seconds=PERFORMANCE_STALE_SECONDS,
        ),
    }


def storage_summary(
    storage: dict[str, Any],
    source: dict[str, Any],
) -> dict[str, Any]:
    volume = storage.get("volume") or {}
    production = source.get("production") or {}
    root_free_kb = production.get("root_free_kb")
    volume_free_kb = production.get("volume_free_kb")
    return {
        "health": storage.get("health") or storage.get("status"),
        "volume_used_percent": (
            storage.get("volume_used_percent")
            or storage.get("used_percent")
            or volume.get("used_percent")
        ),
        "volume_free_bytes": (
            storage.get("volume_free_bytes")
            or storage.get("available_bytes")
            or storage.get("free_bytes")
            or volume.get("available_bytes")
            or volume.get("free_bytes")
            or (
                int(volume_free_kb) * 1024
                if isinstance(volume_free_kb, (int, float))
                else None
            )
        ),
        "root_free_bytes": (
            storage.get("root_free_bytes")
            or (storage.get("root") or {}).get("free_bytes")
            or (
                int(root_free_kb) * 1024
                if isinstance(root_free_kb, (int, float))
                else None
            )
        ),
        "protected_newest_count": len(storage.get("protected_newest") or []),
        "eligible_expanded_count": storage.get("eligible_expanded_count"),
        "verified_receipt_count": storage.get("verified_receipt_count"),
        "next_candidate": storage.get("next_candidate"),
    }


def latest_finish() -> dict[str, Any]:
    if not FINISH_RECEIPT_DIR.is_dir():
        return {
            "available": False,
            "status": None,
            "release_outcome": None,
            "closure_complete": False,
            "receipt": None,
        }

    paths = sorted(
        FINISH_RECEIPT_DIR.glob("*.json"),
        key=lambda path: (path.stat().st_mtime_ns, path.name),
        reverse=True,
    )
    for path in paths:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(payload, dict):
            continue

        failed_phase = None
        failed_detail: dict[str, Any] | None = None
        for name, detail in (payload.get("phases") or {}).items():
            if isinstance(detail, dict) and detail.get("status") == "FAILED":
                failed_phase = str(name)
                failed_detail = detail

        status = payload.get("status")
        release_outcome = payload.get("release_outcome")
        closure_complete = status == "CERTIFIED"
        certified_runtime = str(release_outcome or "").startswith("CERTIFIED")

        try:
            receipt = str(path.relative_to(ROOT))
        except ValueError:
            receipt = str(path)

        return {
            "available": True,
            "status": status,
            "release_outcome": release_outcome,
            "closure_complete": closure_complete,
            "certified_runtime": certified_runtime,
            "active_phase": payload.get("active_phase"),
            "failed_phase": failed_phase,
            "error": (
                (failed_detail or {}).get("error")
                or payload.get("error")
                or payload.get("failure")
            ),
            "release_certified_at": payload.get("release_certified_at"),
            "completed_at": payload.get("completed_at"),
            "updated_at": payload.get("updated_at"),
            "receipt": receipt,
        }

    return {
        "available": False,
        "status": None,
        "release_outcome": None,
        "closure_complete": False,
        "receipt": None,
    }


def control_summary(release: dict[str, Any]) -> dict[str, Any]:
    plan = aoe2_update.estate_map_refresh_plan(release)
    return {
        "status": plan.get("status"),
        "reason": plan.get("reason"),
        "intended_source_sha": plan.get("intended_source_sha"),
        "current_source_sha": plan.get("current_source_sha"),
    }


def brain_recommendations(
    *,
    finish: dict[str, Any],
    control: dict[str, Any],
    performance: dict[str, Any],
    truth: dict[str, Any],
    council_recommendations: list[dict[str, Any]],
    storage: dict[str, Any] | None = None,
    storage_handoff: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    storage = storage or {}
    storage_handoff = storage_handoff or {}
    handoff_status = str(storage_handoff.get("status") or "NONE")
    if handoff_status not in {"NONE", aoe2_storage_handoff.FINAL_STATE}:
        handoff_id = str(storage_handoff.get("handoff_id") or "")
        active = bool(storage_handoff.get("process_alive"))
        rows.append(
            {
                "rank": 1,
                "level": "IN PROGRESS" if active else "MUST RESUME",
                "key": "storage-handoff-incomplete",
                "title": "Continue the proven Storage OS handoff",
                "reason": (
                    f"handoff={handoff_id or 'unknown'} state={handoff_status}; "
                    + (
                        "the detached handoff controller is still active."
                        if active
                        else "the controller is not active, so resume from the last durably receipted state."
                    )
                ),
                "action": (
                    f"aoe2war storage handoff status {handoff_id}"
                    if active and handoff_id
                    else f"aoe2war storage handoff resume {handoff_id}"
                    if handoff_id
                    else "aoe2war storage handoff status"
                ),
            }
        )
    storage_health = str(
        storage.get("health")
        or storage.get("status")
        or ""
    ).upper()
    storage_used = (
        storage.get("volume_used_percent")
        or storage.get("used_percent")
        or (storage.get("volume") or {}).get(
            "used_percent"
        )
    )
    if storage_health and storage_health not in {"HEALTHY", "PASS"}:
        if finish.get("available") and not finish.get("closure_complete"):
            rows.append(
                {
                    "rank": 4,
                    "level": "MUST FIX",
                    "key": "storage-blocks-finish",
                    "title": "Relieve storage pressure before rerunning Finish",
                    "reason": (
                        f"Storage health={storage_health or 'ATTENTION'} "
                        f"used={storage_used if storage_used is not None else 'unknown'}; "
                        "rerunning Finish before restoring headroom can only repeat "
                        "the final Doctor blocker."
                    ),
                    "action": "aoe2war storage plan --json",
                }
            )
        else:
            rows.append(
                {
                    "rank": 9,
                    "level": "MAINTENANCE",
                    "key": "storage-headroom-maintenance",
                    "title": "Restore storage headroom",
                    "reason": (
                        f"Storage health={storage_health or 'ATTENTION'} "
                        f"used={storage_used if storage_used is not None else 'unknown'}; "
                        "the latest Finish is already certified, so this is "
                        "maintenance work rather than a release prerequisite."
                    ),
                    "action": "aoe2war storage plan --json",
                }
            )

    control_status = str(control.get("status") or "")
    if control_status == "blocked":
        rows.append(
            {
                "rank": 5,
                "level": "MUST CLOSE",
                "key": "control-state-blocked",
                "title": "Repair certified control-state documentation",
                "reason": str(control.get("reason") or "control state is blocked"),
                "action": "aoe2war control status --json",
            }
        )
    elif control_status == "refresh":
        rows.append(
            {
                "rank": 5,
                "level": "DO NOW",
                "key": "control-state-refresh",
                "title": "Refresh certified control-state documentation",
                "reason": str(
                    control.get("reason")
                    or "generated control state lags certified production"
                ),
                "action": "aoe2war control refresh --no-context",
            }
        )

    if finish.get("available") and not finish.get("closure_complete"):
        if control_status == "current":
            rows.append(
                {
                    "rank": 6,
                    "level": "DO NOW",
                    "key": "finish-closure",
                    "title": "Complete the certified Finish transaction",
                    "reason": (
                        f"latest finish status={finish.get('status')} "
                        f"phase={finish.get('failed_phase') or finish.get('active_phase')}"
                    ),
                    "action": "aoe2war finish",
                }
            )

    if truth.get("available") and truth.get("matches_current_release") is False:
        rows.append(
            {
                "rank": 8,
                "level": "MEASURE NOW",
                "key": "replay-certainty-current-release",
                "title": "Refresh Replay Truth certainty for current production",
                "reason": (
                    "latest certainty closure belongs to "
                    f"{str(truth.get('production_source') or 'unknown')[:12]}, "
                    "not current certified production"
                ),
                "action": "aoe2war truth closure",
            }
        )

    if (
        performance.get("available")
        and performance.get("matches_current_release") is False
    ):
        campaign_status = str(
            performance.get("status")
            or ""
        ).lower()
        if campaign_status == "analyzed":
            rows.append(
                {
                    "rank": 7,
                    "level": "MEASURE NOW",
                    "key": "speed-verify-open-campaign",
                    "title": "Verify the open Speed campaign against current production",
                    "reason": (
                        "the frozen 77-route Before campaign belongs to "
                        f"{str(performance.get('release_sha') or 'unknown')[:12]}, "
                        "while production has advanced; this is the intended "
                        "before/after verification state, not a request for a "
                        "second baseline."
                    ),
                    "action": "aoe2war speed campaign verify",
                }
            )
        else:
            rows.append(
                {
                    "rank": 7,
                    "level": "MEASURE NOW",
                    "key": "speed-baseline-current-release",
                    "title": "Freeze the current certified Speed OS baseline",
                    "reason": (
                        "latest 77-route campaign belongs to "
                        f"{str(performance.get('release_sha') or 'unknown')[:12]}, "
                        "not current certified production"
                    ),
                    "action": (
                        "aoe2war speed inventory --require-complete-public-coverage && "
                        "aoe2war speed build && "
                        "aoe2war speed campaign start"
                    ),
                }
            )

    rows.extend(council_recommendations)
    return sorted(
        rows,
        key=lambda item: (
            int(item["rank"]) if item.get("rank") is not None else 999,
            str(item.get("key") or ""),
        ),
    )


def invariant_rows(
    *,
    source: dict[str, Any],
    council: dict[str, Any],
    truth: dict[str, Any],
    finish: dict[str, Any],
    control: dict[str, Any],
    performance: dict[str, Any],
) -> list[dict[str, str]]:
    production = source.get("production") or {}
    recovery = council.get("recovery") or {}
    rows = [
        {
            "key": "source-authority-current",
            "status": (
                "PASS"
                if source.get("implementation_equivalent")
                else "ATTENTION"
            ),
            "evidence": (
                "exact local/GitHub/production/certification identity"
                if source.get("exact")
                else "certified production is within current implementation authority"
                if source.get("implementation_equivalent")
                else "implementation authority is not current"
            ),
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
                and truth.get("matches_current_release") is True
                else "ATTENTION"
            ),
            "evidence": (
                f"accounted={truth.get('accounted_percent')}% "
                f"unclassified={truth.get('unclassified')} "
                f"release={str(truth.get('production_source') or '—')[:12]} "
                f"current={'YES' if truth.get('matches_current_release') else 'NO'}"
                if truth.get("available")
                else "closure receipt unavailable"
            ),
        },
        {
            "key": "finish-closure-complete",
            "status": "PASS" if finish.get("closure_complete") else "ATTENTION",
            "evidence": (
                f"status={finish.get('status')} "
                f"phase={finish.get('failed_phase') or finish.get('active_phase') or '—'}"
                if finish.get("available")
                else "finish receipt unavailable"
            ),
        },
        {
            "key": "control-state-current",
            "status": "PASS" if control.get("status") == "current" else "ATTENTION",
            "evidence": (
                f"status={control.get('status')} "
                f"reason={control.get('reason') or '—'}"
            ),
        },
        {
            "key": "speed-baseline-current-release",
            "status": (
                "PASS"
                if performance.get("available")
                and performance.get("matches_current_release") is True
                else "ATTENTION"
            ),
            "evidence": (
                f"campaign={performance.get('campaign_id')} "
                f"release={str(performance.get('release_sha') or '—')[:12]}"
                if performance.get("available")
                else "performance campaign unavailable"
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
        any(row["status"] == "ATTENTION" for row in invariants)
        or not source.get("implementation_equivalent")
        or int(council.get("p1") or 0) > 0
        or str(council.get("doctor_status") or "").upper()
        not in {"HEALTHY", "PASS"}
    ):
        return "ATTENTION"
    return "READY"


def storage_campaign_summary() -> dict[str, Any]:
    try:
        payload = aoe2_storage_campaign.status_payload(None)
    except Exception as exc:
        return {
            "status": "UNAVAILABLE",
            "error": str(exc),
        }
    if not isinstance(payload, dict):
        return {"status": "UNAVAILABLE"}
    return payload


def recovery_campaign_summary() -> dict[str, Any]:
    try:
        payload = aoe2_recovery_campaign.status_payload(None)
    except Exception as exc:
        return {
            "status": "UNAVAILABLE",
            "error": str(exc),
        }
    if not isinstance(payload, dict):
        return {"status": "UNAVAILABLE"}

    campaign_id = str(payload.get("campaign_id") or "").strip()
    if not campaign_id:
        return payload

    try:
        offhost = aoe2_recovery_campaign.wolo_offhost_status(campaign_id)
    except Exception:
        return payload
    if not isinstance(offhost, dict):
        return payload

    return {**offhost, "phase": "wolo_offhost"}


def classify_source_system(paths: list[str], subject: str) -> str:
    joined = " ".join(paths).lower() + " " + subject.lower()
    rules = (
        ("Recovery OS", ("recovery", "evidence_vault")),
        ("Storage OS", ("storage", "retention")),
        ("Replay Truth OS", ("truth", "replay", "parser")),
        ("Speed OS", ("speed", "performance", "latency")),
        ("Workspace OS", ("workspace", "worktree")),
        ("Host OS", ("host", "vps", "systemd")),
        (
            "Documentation OS",
            (
                "documentation_os",
                "aoe2_docs",
                "document-registry",
                "documentation_control_plane",
                "docs_v2",
            ),
        ),
        ("Release OS", ("release", "finish", "deploy", "rollback")),
    )
    matches = [
        label
        for label, tokens in rules
        if any(token in joined for token in tokens)
    ]
    return matches[0] if len(matches) == 1 else "Kingdom Intelligence"


def recent_source_activity(limit: int = 14) -> list[dict[str, Any]]:
    try:
        raw = subprocess.check_output(
            [
                "git",
                "log",
                "-n",
                str(limit),
                "--date=iso-strict",
                "--pretty=format:%x1e%H%x1f%cI%x1f%s",
                "--name-only",
                "HEAD",
            ],
            cwd=str(ROOT),
            text=True,
            timeout=12,
        )
    except Exception:
        return []

    rows: list[dict[str, Any]] = []
    for block in raw.split("\x1e"):
        block = block.strip()
        if not block:
            continue
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines or "\x1f" not in lines[0]:
            continue
        parts = lines[0].split("\x1f", 2)
        if len(parts) != 3:
            continue
        sha, created_at, subject = parts
        paths = lines[1:]
        rows.append(
            {
                "sha": sha,
                "created_at": created_at,
                "title": subject[:180],
                "system": classify_source_system(paths, subject),
                "file_count": len(paths),
                "status": "SUCCEEDED",
            }
        )
    return rows


def memory_seals(limit: int = 8) -> list[dict[str, Any]]:
    if not ENGINEERING_MEMORY_PATH.is_file():
        return []
    try:
        raw = subprocess.check_output(
            [
                "git",
                "log",
                "-n",
                str(limit),
                "--date=iso-strict",
                "--pretty=format:%H%x1f%cI%x1f%s",
                "--",
                str(ENGINEERING_MEMORY_PATH.relative_to(ROOT)),
            ],
            cwd=str(ROOT),
            text=True,
            timeout=10,
        )
    except Exception:
        return []

    rows: list[dict[str, Any]] = []
    for line in raw.splitlines():
        parts = line.split("\x1f", 2)
        if len(parts) != 3:
            continue
        sha, created_at, title = parts
        rows.append(
            {
                "sha": sha,
                "created_at": created_at,
                "title": title[:180],
                "status": "SEALED",
            }
        )
    return rows


def system_agent_rows(
    *,
    source: dict[str, Any],
    council: dict[str, Any],
    truth: dict[str, Any],
    performance: dict[str, Any],
    control: dict[str, Any],
    storage_campaign: dict[str, Any],
    recovery_campaign: dict[str, Any],
) -> list[dict[str, Any]]:
    storage = council.get("storage") or {}
    host = council.get("host") or {}
    recovery = council.get("recovery") or {}
    workspace = council.get("workspace") or {}
    health = str(council.get("doctor_status") or "UNKNOWN").upper()

    storage_campaign_status = str(storage_campaign.get("status") or "NONE").upper()
    storage_active = storage_campaign_status in {
        "RUNNING",
        "RUNNING_TRANSACTION",
        "RESUME_REQUESTED",
    }
    recovery_campaign_status = str(recovery_campaign.get("status") or "NONE").upper()
    recovery_active = recovery_campaign_status in {
        "RUNNING",
        "RUNNING_CAPTURE",
        "RESUME_REQUESTED",
        "CREATED",
        "SPAWN_REQUESTED",
        "WOLO_OFFHOST_CAPTURE_RUNNING",
    }

    source_state = (
        "HEALTHY"
        if source.get("implementation_equivalent")
        else "ACTIVE"
        if source.get("production_behind_github")
        else "ATTENTION"
    )
    control_status = str(control.get("status") or "unknown").lower()
    docs_due = int(council.get("docs_due_7d") or 0)
    documentation = council.get("documentation") or {}
    documentation_gate = str(
        documentation.get("estate_gate") or "UNKNOWN"
    ).upper()
    docs_state = (
        "HEALTHY"
        if control_status == "current"
        and documentation_gate in {"PASS", "HEALTHY"}
        else "ACTIVE"
        if control_status == "refresh"
        else "ATTENTION"
    )

    storage_health = str(
        storage.get("health") or storage.get("status") or "UNKNOWN"
    ).upper()
    storage_state = (
        "ACTIVE"
        if storage_active
        else "HEALTHY"
        if storage_health in {"HEALTHY", "PASS"}
        else "ATTENTION"
    )

    host_updates = aoe2_council.host_update_counts(host)
    host_attention = bool(
        host.get("reboot_required")
        or host_updates["actionable"]
        or host_updates["other_deferred"]
        or not host_updates["probe_ok"]
        or int(host.get("failed_transient") or 0)
    )
    host_state = "ATTENTION" if host_attention else "HEALTHY"

    recovery_status = str(recovery.get("status") or "NOT_VERIFIED").upper()
    recovery_state = (
        "ACTIVE"
        if recovery_active
        else "HEALTHY"
        if recovery_status == "VERIFIED"
        else "ATTENTION"
    )

    canonical_drift = int(workspace.get("canonical_drift_count") or 0)
    active_agents = int(workspace.get("active_agent_count") or 0)
    workspace_state = (
        "ATTENTION"
        if canonical_drift
        else "ACTIVE"
        if active_agents
        else "HEALTHY"
    )

    performance_current = bool(
        performance.get("available")
        and performance.get("matches_current_release") is True
    )
    speed_state = "HEALTHY" if performance_current else "ATTENTION"

    resolved = int(truth.get("resolved") or 0)
    final_games = int(truth.get("final_games") or 0)
    unresolved = int(truth.get("unresolved") or max(final_games - resolved, 0))
    accounted_percent = float(truth.get("accounted_percent") or 0)
    unclassified = int(truth.get("unclassified") or 0)
    replay_percent = (
        round((resolved / final_games) * 100, 2)
        if final_games > 0
        else None
    )
    replay_state = (
        "HEALTHY"
        if truth.get("complete") is True
        and truth.get("matches_current_release") is True
        and accounted_percent == 100.0
        and unclassified == 0
        else "ATTENTION"
    )

    doctor_state = (
        "HEALTHY"
        if health in {"HEALTHY", "PASS"}
        else "BLOCKED"
        if int(council.get("p0") or 0) > 0
        else "ATTENTION"
    )

    recovery_completed = len(recovery_campaign.get("completed_classes") or [])
    recovery_classes = (
        recovery_campaign.get("ordinary_classes")
        or recovery_campaign.get("classes")
        or []
    )
    recovery_total = len(recovery_classes)
    recovery_phase = str(recovery_campaign.get("phase") or "ordinary")
    recovery_live = recovery_campaign.get("live_capture") or {}
    recovery_current_class = str(
        recovery_campaign.get("current_class") or ""
    ).replace("_", " ").strip()
    recovery_live_percent = recovery_live.get("overall_percent")
    recovery_progress_percent = (
        float(recovery_live_percent)
        if isinstance(recovery_live_percent, (int, float))
        else round((recovery_completed / recovery_total) * 100, 1)
        if recovery_total > 0
        else 100
        if recovery_status == "VERIFIED"
        else 20
        if (recovery.get("pilot") or {}).get("status") == "PILOT_VERIFIED"
        else None
    )
    storage_completed = int(storage_campaign.get("completed_generations") or 0)
    storage_total = int(storage_campaign.get("max_generations") or 0)

    return [
        {
            "key": "release",
            "label": "Release OS",
            "state": source_state,
            "summary": (
                "Source, runtime and certification are exact."
                if source.get("exact")
                else "Certified production is implementation-current; GitHub is documentation-only ahead."
                if source.get("implementation_equivalent")
                and source.get("production_behind_github")
                else "GitHub implementation is ahead of certified production."
                if source.get("production_behind_github")
                else "Source authority needs reconciliation."
            ),
            "progress_percent": (
                100 if source.get("implementation_equivalent") else None
            ),
            "progress_label": "source authority",
        },
        {
            "key": "documentation",
            "label": "Documentation OS",
            "state": docs_state,
            "summary": (
                f"Healthy · {docs_due} document review(s) due within seven days."
                if docs_state == "HEALTHY" and docs_due
                else f"{docs_due} document review(s) due within seven days."
                if docs_due
                else f"Control state: {control_status}."
            ),
            "progress_percent": 100 if docs_state == "HEALTHY" else None,
            "progress_label": "knowledge control",
        },
        {
            "key": "storage",
            "label": "Storage OS",
            "state": storage_state,
            "summary": (
                f"Detached storage campaign {storage_completed}/{storage_total}."
                if storage_active and storage_total
                else f"Storage health: {storage_health}."
            ),
            "progress_percent": (
                round((storage_completed / storage_total) * 100, 1)
                if storage_total > 0
                else None
            ),
            "progress_label": (
                f"{storage_completed}/{storage_total} generations"
                if storage_total
                else "capacity"
            ),
            "active_process": storage_active,
            "active_since": (
                storage_campaign.get("started_at")
                if storage_active
                else None
            ),
        },
        {
            "key": "host",
            "label": "Host OS",
            "state": host_state,
            "summary": (
                (
                    f"Maintenance pending: {host_updates['actionable']} actionable update(s)"
                    + (
                        f", {host_updates['other_deferred']} non-phased deferred update(s)"
                        if host_updates["other_deferred"]
                        else ""
                    )
                    + (" and reboot." if host.get("reboot_required") else ".")
                )
                if host_attention
                else (
                    "Host hygiene is clear; "
                    f"{host_updates['phased_deferred']} Ubuntu-phased update(s) "
                    "intentionally deferred."
                    if host_updates["phased_deferred"]
                    else "Host hygiene is clear."
                )
            ),
            "progress_percent": 100 if host_state == "HEALTHY" else None,
            "progress_label": "host hygiene",
        },
        {
            "key": "recovery",
            "label": "Recovery OS",
            "state": recovery_state,
            "summary": (
                (
                    (
                        "Wolo encrypted capture"
                        if recovery_phase == "wolo_offhost"
                        else "Ordinary encrypted capture"
                    )
                    + f" {recovery_completed}/{recovery_total}"
                    + (
                        f" · {recovery_current_class}."
                        if recovery_current_class
                        else "."
                    )
                )
                if recovery_total and recovery_active
                else f"Recovery proof: {recovery_status}."
                if recovery_status == "VERIFIED"
                else (
                    (
                        "Wolo encrypted capture"
                        if recovery_phase == "wolo_offhost"
                        else "Ordinary encrypted capture"
                    )
                    + f" {recovery_completed}/{recovery_total}."
                )
                if recovery_total
                else f"Recovery proof: {recovery_status}."
            ),
            "progress_percent": recovery_progress_percent,
            "progress_label": (
                (
                    f"{recovery_completed}/{recovery_total} "
                    + (
                        "Wolo classes"
                        if recovery_phase == "wolo_offhost"
                        else "ordinary classes"
                    )
                    + (
                        f" · {int(recovery_live.get('sealed_chunks') or 0)} chunks"
                        if recovery_live.get("sealed_chunks") is not None
                        else ""
                    )
                )
                if recovery_total
                else "full recovery proof"
            ),
            "active_process": recovery_active,
            "active_since": (
                recovery_campaign.get("current_class_started_at")
                or recovery_campaign.get("started_at")
                if recovery_active
                else None
            ),
            "current_step": recovery_current_class or None,
            "eta_seconds": recovery_live.get("eta_seconds"),
            "elapsed_seconds": recovery_live.get("elapsed_seconds"),
            "sealed_chunks": recovery_live.get("sealed_chunks"),
            "observed_bytes": recovery_live.get("observed_bytes"),
            "expected_bytes": recovery_live.get("expected_bytes"),
            "throughput_bytes_per_second": recovery_live.get(
                "throughput_bytes_per_second"
            ),
            "progress_basis": recovery_live.get("progress_basis"),
        },
        {
            "key": "workspace",
            "label": "Workspace OS",
            "state": workspace_state,
            "summary": (
                f"{active_agents} registered agent workstream(s); "
                f"{int(workspace.get('unmerged_count') or 0)} unmerged."
                if active_agents
                else "Workspace healthy; no registered agent workspace is active."
            ),
            "progress_percent": None,
            "progress_label": "parallel engineering",
        },
        {
            "key": "speed",
            "label": "Speed OS",
            "state": speed_state,
            "summary": (
                f"{int(performance.get('route_count') or 0)} route benchmark is current."
                if performance_current
                else "Performance evidence needs current-release verification."
            ),
            "progress_percent": 100 if performance_current else None,
            "progress_label": "release performance proof",
        },
        {
            "key": "replay_truth",
            "label": "Replay Truth OS",
            "state": replay_state,
            "summary": (
                f"{resolved}/{final_games} final battles have resolved winner authority; "
                f"{unresolved} are explicitly evidence-bounded unresolved."
                if final_games
                else "Replay certainty evidence is unavailable."
            ),
            "progress_percent": replay_percent,
            "progress_label": "winner authority",
        },
        {
            "key": "doctor",
            "label": "System Doctor",
            "state": doctor_state,
            "summary": (
                f"Doctor {council.get('doctor_score')}/100 · "
                f"P0={int(council.get('p0') or 0)} "
                f"P1={int(council.get('p1') or 0)}."
            ),
            "progress_percent": (
                float(council.get("doctor_score"))
                if isinstance(council.get("doctor_score"), (int, float))
                else None
            ),
            "progress_label": "system health",
        },
    ]


def external_agent_rows(council: dict[str, Any]) -> list[dict[str, Any]]:
    workspace = council.get("workspace") or {}
    rows = []
    for item in workspace.get("agents") or []:
        if not isinstance(item, dict):
            continue
        classification = str(item.get("classification") or "")
        rows.append(
            {
                "name": str(item.get("agent") or "Agent"),
                "purpose": str(item.get("purpose") or "Registered engineering work"),
                "state": (
                    "ACTIVE"
                    if classification in {
                        "AGENT_ACTIVE_DIRTY",
                        "AGENT_ACTIVE_UNMERGED",
                    }
                    else "COMPLETE"
                    if classification == "AGENT_RETIREABLE"
                    else "IDLE"
                ),
                "branch": item.get("branch"),
                "head": item.get("head"),
            }
        )
    return rows


def activity_24h(now: datetime) -> dict[str, Any]:
    since = iso_z(now - timedelta(hours=24))
    try:
        output = subprocess.check_output(
            ["git", "rev-list", "--count", f"--since={since}", "HEAD"],
            cwd=str(ROOT),
            text=True,
            timeout=10,
        ).strip()
        source_commits = int(output)
    except Exception:
        source_commits = None

    finish_runs = 0
    certified_finishes = 0
    cutoff = now - timedelta(hours=24)
    if FINISH_RECEIPT_DIR.is_dir():
        for path in FINISH_RECEIPT_DIR.glob("*.json"):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
            when = parse_time(
                payload.get("completed_at")
                or payload.get("generated_at")
                or payload.get("started_at")
            )
            if when is None or when < cutoff:
                continue
            finish_runs += 1
            if str(payload.get("status") or "").upper() in {
                "CERTIFIED",
                "COMPLETE",
                "SUCCEEDED",
                "SUCCESS",
            } and str(payload.get("release_outcome") or "").upper() not in {
                "NOT_ATTEMPTED",
                "FAILED",
            }:
                certified_finishes += 1

    return {
        "window_hours": 24,
        "source_commits": source_commits,
        "finish_runs": finish_runs,
        "certified_finishes": certified_finishes,
    }


def collect() -> dict[str, Any]:
    now = now_utc()
    council = aoe2_council.collect()
    release = council.get("release_snapshot")
    if not isinstance(release, dict) or not isinstance(release.get("production"), dict):
        # Backward-compatible fail-safe for older/external Council payloads.
        release = aoe2_release.collect()
    source = source_summary(release)
    truth = latest_truth(now)
    performance = latest_performance(now)
    production_source = source.get("production", {}).get("source_sha")
    performance["matches_current_release"] = bool(
        performance.get("available")
        and performance.get("release_sha")
        == production_source
    )
    for key in ("cold_lcp", "edge_delivery"):
        detail = performance.get(key)
        if isinstance(detail, dict):
            detail["matches_current_release"] = bool(
                detail.get("available")
                and detail.get("release_sha")
                == production_source
            )
    truth["matches_current_release"] = bool(
        truth.get("available")
        and truth.get("production_source")
        == source.get("production", {}).get("source_sha")
    )
    finish = latest_finish()
    control = control_summary(release)
    storage_campaign = storage_campaign_summary()
    try:
        storage_handoff = aoe2_storage_handoff.status_payload(None)
    except Exception as exc:
        storage_handoff = {
            "status": "ERROR",
            "error": str(exc),
        }
    recovery_campaign = recovery_campaign_summary()
    activity = activity_24h(now)
    source_activity = recent_source_activity()
    memories = memory_seals()
    invariants = invariant_rows(
        source=source,
        council=council,
        truth=truth,
        finish=finish,
        control=control,
        performance=performance,
    )

    recommendations = brain_recommendations(
        finish=finish,
        control=control,
        performance=performance,
        truth=truth,
        council_recommendations=list(council.get("recommendations") or []),
        storage=council.get("storage") or {},
        storage_handoff=storage_handoff,
    )
    system_agents = system_agent_rows(
        source=source,
        council=council,
        truth=truth,
        performance=performance,
        control=control,
        storage_campaign=storage_campaign,
        recovery_campaign=recovery_campaign,
    )
    external_agents = external_agent_rows(council)
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
        "finish": finish,
        "control_state": control,
        "health": {
            "estate": council.get("estate"),
            "p0": int(council.get("p0") or 0),
            "p1": int(council.get("p1") or 0),
            "doctor_score": council.get("doctor_score"),
            "doctor_status": council.get("doctor_status"),
        },
        "storage": storage_summary(
            council.get("storage") or {},
            source,
        ),
        "storage_campaign": storage_campaign,
        "storage_handoff": storage_handoff,
        "recovery_campaign": recovery_campaign,
        "activity_24h": activity,
        "system_agents": system_agents,
        "external_agents": external_agents,
        "recent_source_activity": source_activity,
        "memory_seals": memories,
        "host": council.get("host") or {},
        "recovery": council.get("recovery") or {},
        "workspace": council.get("workspace") or {},
        "documentation": council.get("documentation") or {},
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
        "best_next_action": recommendations[0] if recommendations else None,
    }


def short_sha(value: object) -> str:
    return str(value or "—")[:10]


def print_payload(payload: dict[str, Any]) -> None:
    source = payload["source"]
    health = payload["health"]
    storage = payload["storage"]
    truth = payload["replay_truth"]
    performance = payload["performance"]
    finish = payload.get("finish") or {}
    control = payload.get("control_state") or {}
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
        "Finish closure:  "
        f"{finish.get('status') or '—'} · "
        f"phase={finish.get('failed_phase') or finish.get('active_phase') or '—'}"
    )
    print(
        "Control state:   "
        f"{control.get('status') or '—'} · "
        f"{control.get('reason') or '—'}"
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
        verification = performance.get("verification") or {}
        if verification:
            print(
                "Performance:     "
                f"{performance.get('status')} · "
                f"{performance.get('route_count')} routes · "
                f"TTFB p50={verification.get('ttfb_p50_before_ms')}→"
                f"{verification.get('ttfb_p50_after_ms')} ms · "
                f"total p50={verification.get('total_p50_before_ms')}→"
                f"{verification.get('total_p50_after_ms')} ms · "
                f"current={'YES' if performance.get('matches_current_release') else 'NO'}"
            )
        else:
            print(
                "Performance:     "
                f"{performance.get('status')} · "
                f"{performance.get('route_count')} routes · "
                f"TTFB p50={baseline.get('ttfb_p50_ms')} ms · "
                f"total p50={baseline.get('total_p50_ms')} ms · "
                f"current={'YES' if performance.get('matches_current_release') else 'NO'}"
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
