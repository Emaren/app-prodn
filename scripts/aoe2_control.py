#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aoe2_audit
import aoe2_release
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
                    ["VPSSentry", "AoE2WAR-docs"],
                    progress=own_progress,
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
