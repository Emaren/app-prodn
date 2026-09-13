#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aoe2_audit
import aoe2_brain
import aoe2_finish
import aoe2_release
import aoe2_speed
import aoe2_update

ROOT = Path(__file__).resolve().parents[1]
RECEIPT_DIR = ROOT / ".aoe2war-release" / "control-receipts"


class ControlError(RuntimeError):
    pass


def _receipt_path() -> Path:
    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return RECEIPT_DIR / f"{stamp}.json"


def _write(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def status_payload() -> dict[str, Any]:
    release = aoe2_release.collect()
    plan = aoe2_update.estate_map_refresh_plan(release)
    return {
        "schema": 1,
        "kind": "aoe2war-control-status",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": plan.get("status"),
        "reason": plan.get("reason"),
        "intended_source_sha": plan.get("intended_source_sha"),
        "current_source_sha": plan.get("current_source_sha"),
        "authoritative_files": [
            str(aoe2_update.VPSSENTRY / "context" / name)
            for name in aoe2_update.CONTROL_DOC_FILES
        ],
        "runtime_mutated": False,
        "database_mutated": False,
        "wolo_mutated": False,
    }


def fast_source_plan(brain: dict[str, Any]) -> dict[str, Any]:
    source = brain.get("source") or {}
    local = source.get("local") or {}
    github = source.get("github") or {}
    production = source.get("production") or {}

    local_head = str(local.get("head") or "")
    github_head = str(github.get("main_sha") or "")
    production_head = str(production.get("source_sha") or "")
    if not local_head or not github_head or not production_head:
        return {
            "status": "BLOCKED",
            "error": "source authority snapshot is incomplete",
            "seal_preflight": "REQUIRED",
        }

    try:
        plan = aoe2_finish.source_plan(
            local_dirty=0 if local.get("clean") is True else 1,
            production_dirty=0 if production.get("clean") is True else 1,
            local_head=local_head,
            github_head=github_head,
            production_head=production_head,
        )
    except aoe2_finish.FinishError as exc:
        return {
            "status": "BLOCKED",
            "error": str(exc),
            "seal_preflight": "REQUIRED",
        }

    return {
        "status": "READY",
        "mode": plan.mode,
        "detail": plan.detail,
        "deploy_expected": bool(
            plan.mode != "clean" or production_head != github_head
        ),
        "seal_preflight": "DEFERRED_TO_AOE2WAR_FINISH",
    }


def fast_payload() -> dict[str, Any]:
    """Collect one fresh read-only Kingdom view; defer exhaustive work to SEAL."""
    started = time.monotonic()
    brain = aoe2_brain.collect()
    brain_seconds = time.monotonic() - started
    source_plan = fast_source_plan(brain)

    health = brain.get("health") or {}
    doctor_status = str(health.get("doctor_status") or "UNKNOWN").upper()
    p0 = int(health.get("p0") or 0)
    p1 = int(health.get("p1") or 0)

    if source_plan.get("status") == "BLOCKED" or p0 > 0 or doctor_status == "UNSAFE":
        status = "BLOCKED"
    elif p1 > 0 or doctor_status not in {"HEALTHY", "PASS"}:
        status = "ATTENTION"
    else:
        status = "READY"

    elapsed = time.monotonic() - started
    return {
        "schema": 1,
        "kind": "aoe2war-control-fast",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "FAST",
        "status": status,
        "read_only": True,
        "runtime_mutated": False,
        "database_mutated": False,
        "wolo_mutated": False,
        "seal_command": "aoe2war finish",
        "seal_preflight": "NOT_RUN",
        "timing": {
            "elapsed_seconds": round(elapsed, 3),
            "brain_seconds": round(brain_seconds, 3),
            "collection_strategy": "fresh-shared-live-observation",
        },
        "health": health,
        "operating_state": brain.get("operating_state"),
        "best_next_action": brain.get("best_next_action"),
        "storage": brain.get("storage") or {},
        "workspace": brain.get("workspace") or {},
        "source_plan": source_plan,
        "brain": brain,
    }


def refresh_control_state(
    *,
    progress: aoe2_update.Progress | None = None,
    capture_context: bool = True,
) -> dict[str, Any]:
    own_progress = progress or aoe2_update.Progress()
    path = _receipt_path()
    result: dict[str, Any] = {
        "schema": 1,
        "kind": "aoe2war-control-refresh",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "RUNNING",
        "runtime_mutated": False,
        "database_mutated": False,
        "wolo_mutated": False,
        "host_rebooted": False,
        "packages_upgraded": False,
    }
    _write(path, result)

    try:
        own_progress.start("Acquiring documentation/control-plane lock...")
        with aoe2_update.update_lock():
            own_progress.done("Control-plane lock acquired")
            refresh = aoe2_update.refresh_estate_maps(
                progress=own_progress,
                force=True,
            )
            result["control_docs"] = refresh
            result["source_sha"] = refresh.get("intended_source_sha")

            own_progress.start("Synchronizing central documentation federation...")
            central = aoe2_update.central_sync(progress=own_progress)
            result["central"] = central
            own_progress.done(
                "Central documentation federation synchronized"
                if central.get("status") == "synchronized"
                else "Central documentation federation already current"
            )

            if capture_context:
                own_progress.start(
                    "Capturing reset-ready control-plane context evidence..."
                )
                result["context_archives"] = aoe2_update.capture_context(
                    [
                        "AoE2HDBets",
                        "WoloChain-wolo-1",
                        "VPSSentry",
                        "AoE2WAR-docs",
                    ],
                    progress=own_progress,
                    include_host_context=True,
                )
                own_progress.done("Control-plane context evidence verified")
            else:
                result["context_archives"] = {}

        own_progress.start("Running post-refresh estate audit...")
        final_audit = aoe2_audit.collect_audit().payload()
        result["final_audit"] = final_audit
        if final_audit.get("p0") or final_audit.get("p1"):
            raise ControlError(
                "post-refresh estate audit is not clean: "
                f"P0={final_audit.get('p0')} P1={final_audit.get('p1')}"
            )
        own_progress.done("Post-refresh estate audit passed — P0=0 P1=0")

        result["status"] = "VERIFIED"
        result["completed_at"] = datetime.now(timezone.utc).isoformat()
        result["receipt"] = str(path)
        _write(path, result)
        return result
    except Exception as exc:
        result["status"] = "FAILED"
        result["failed_at"] = datetime.now(timezone.utc).isoformat()
        result["error"] = str(exc)
        result["receipt"] = str(path)
        _write(path, result)
        if isinstance(exc, ControlError):
            raise
        raise ControlError(str(exc)) from exc


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="aoe2war control",
        description=(
            "Validate or refresh SYSTEM_MAP, SERVER_STORAGE_MAP and the "
            "100/100 closure evidence block from one certified observation."
        ),
    )
    sub = parser.add_subparsers(dest="command")
    status = sub.add_parser("status")
    status.add_argument("--json", action="store_true")
    fast = sub.add_parser(
        "fast",
        help="run the read-only fast Kingdom loop; SEAL remains aoe2war finish",
    )
    fast.add_argument("--json", action="store_true")
    refresh = sub.add_parser("refresh")
    refresh.add_argument("--json", action="store_true")
    refresh.add_argument(
        "--no-context",
        action="store_true",
        help="refresh/verify docs without capturing portable context archives",
    )
    args = parser.parse_args()
    command = args.command or "status"

    try:
        if command == "status":
            payload = status_payload()
            if getattr(args, "json", False):
                print(json.dumps(payload, indent=2, sort_keys=True))
            else:
                print("⚔️  AOE2WAR CONTROL STATE")
                print()
                print(f"State:   {payload['status']}")
                print(f"Reason:  {payload['reason']}")
                print(f"Source:  {payload.get('current_source_sha') or '—'}")
                print("Files:")
                for item in payload["authoritative_files"]:
                    print(f"  {item}")
            return 0 if payload.get("status") == "current" else 1

        if command == "fast":
            payload = fast_payload()
            source = (payload.get("brain") or {}).get("source") or {}
            aoe2_speed.record_operator_timing(
                command="control-fast",
                elapsed_seconds=float((payload.get("timing") or {}).get("elapsed_seconds") or 0.0),
                status=str(payload.get("status") or "UNKNOWN"),
                generated_at=str(payload.get("generated_at") or "") or None,
                operator_source_sha=str((source.get("local") or {}).get("head") or "") or None,
                production_source_sha=str((source.get("production") or {}).get("source_sha") or "") or None,
            )
            if getattr(args, "json", False):
                print(json.dumps(payload, indent=2, sort_keys=True))
            else:
                timing = payload["timing"]
                health = payload["health"]
                source_plan = payload["source_plan"]
                print("⚡ AOE2WAR FAST LOOP")
                print()
                print(f"State:     {payload['status']}")
                print(f"Elapsed:   {timing['elapsed_seconds']:.2f}s")
                print(f"Doctor:    {health.get('doctor_score')}/100 · {health.get('doctor_status')}")
                print(f"Estate:    P0={int(health.get('p0') or 0)} P1={int(health.get('p1') or 0)}")
                print(f"Source:    {source_plan.get('status')} · {source_plan.get('mode') or '—'}")
                print(f"Deploy:    {'yes' if source_plan.get('deploy_expected') else 'no'}")
                print("Preflight: deferred to SEAL")
                action = payload.get("best_next_action") or {}
                if isinstance(action, dict) and action.get("title"):
                    print(f"Next:      {action.get('title')}")
                print()
                print("SEAL:      aoe2war finish")
            return 2 if payload["status"] == "BLOCKED" else 1 if payload["status"] == "ATTENTION" else 0

        if command == "refresh":
            progress = (
                aoe2_update.Progress(stream=sys.stderr)
                if args.json
                else None
            )
            payload = refresh_control_state(
                progress=progress,
                capture_context=not args.no_context,
            )
            if args.json:
                print(json.dumps(payload, indent=2, sort_keys=True))
            else:
                print()
                print("⚔️  AOE2WAR CONTROL REFRESH VERIFIED")
                print(f"Source:  {payload.get('source_sha')}")
                print("Estate:  P0=0 P1=0")
                print(f"Receipt: {payload['receipt']}")
            return 0

        raise ControlError(f"unsupported command: {command}")
    except Exception as exc:
        if getattr(args, "json", False):
            print(json.dumps({"status": "ERROR", "error": str(exc)}, indent=2))
        else:
            print(f"STOP: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
