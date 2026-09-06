#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import json
import os
import signal
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from scripts import aoe2_storage as storage
except ImportError:
    import aoe2_storage as storage  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
CAMPAIGN_DIR = ROOT / ".aoe2war-release" / "storage-campaigns"
LOCK_PATH = CAMPAIGN_DIR / "campaign.lock"


class CampaignError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def state_path(campaign_id: str) -> Path:
    if not campaign_id or "/" in campaign_id or ".." in campaign_id:
        raise CampaignError(f"unsafe campaign id: {campaign_id!r}")
    return CAMPAIGN_DIR / f"{campaign_id}.json"


def log_path(campaign_id: str) -> Path:
    return CAMPAIGN_DIR / f"{campaign_id}.log"


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp.{os.getpid()}")
    tmp.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(tmp, path)


def load_state(campaign_id: str) -> dict[str, Any]:
    path = state_path(campaign_id)
    if not path.is_file():
        raise CampaignError(f"campaign state not found: {campaign_id}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema") != 1 or payload.get("kind") != "aoe2war-storage-campaign":
        raise CampaignError(f"invalid campaign state: {path}")
    return payload


def save_state(state: dict[str, Any]) -> None:
    state["updated_at"] = utc_now()
    atomic_write(state_path(str(state["campaign_id"])), state)


def process_alive(pid: int | None) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def latest_campaign_id() -> str | None:
    if not CAMPAIGN_DIR.is_dir():
        return None
    rows = sorted(
        CAMPAIGN_DIR.glob("*.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return rows[0].stem if rows else None


def current_baseline() -> tuple[str, str]:
    return storage.operator_baseline()


def validate_bound_baseline(state: dict[str, Any]) -> None:
    release, build = current_baseline()
    if release != state.get("release_sha") or build != state.get("build_id"):
        raise CampaignError(
            "certified source/build changed since campaign authorization: "
            f"campaign={state.get('release_sha')}:{state.get('build_id')} "
            f"current={release}:{build}"
        )


def actionable_plan(
    plan: dict[str, Any],
    *,
    completed: int,
    force: bool,
) -> tuple[bool, str]:
    status = str(plan.get("status"))
    if status == "NOOP_HEALTHY":
        return False, "TARGET_REACHED"
    if status == "READY":
        return True, "READY"
    if status == "WATCH" and completed > 0 and plan.get("candidate") and not force:
        return True, "WATCH_CONTINUATION"
    if force and plan.get("candidate"):
        return True, "FORCED_CANDIDATE"
    if status == "WATCH":
        return False, "WATCH_NOT_DUE"
    return False, status


def create_state(*, max_generations: int, force: bool) -> dict[str, Any]:
    if max_generations < 1 or max_generations > 25:
        raise CampaignError("--max-generations must be between 1 and 25")

    release, build = current_baseline()
    plan = storage.make_plan()
    actionable, reason = actionable_plan(plan, completed=0, force=force)
    if not actionable:
        raise CampaignError(
            f"storage campaign is not actionable at start: {reason}"
        )

    campaign_id = f"{stamp()}-{release[:12]}"
    state = {
        "schema": 1,
        "kind": "aoe2war-storage-campaign",
        "campaign_id": campaign_id,
        "status": "CREATED",
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "release_sha": release,
        "build_id": build,
        "target_percent": storage.policy()["healthy_target"],
        "max_generations": max_generations,
        "completed_generations": 0,
        "force": bool(force),
        "pause_requested": False,
        "pid": None,
        "current_generation": None,
        "current_generation_started_at": None,
        "history": [],
        "last_plan": plan,
        "last_error": None,
        "completion_reason": None,
        "log_path": str(log_path(campaign_id)),
    }
    save_state(state)
    return state


def spawn(campaign_id: str) -> int:
    state = load_state(campaign_id)
    pid = state.get("pid")
    if process_alive(pid if isinstance(pid, int) else None):
        raise CampaignError(f"campaign already running with pid={pid}")

    CAMPAIGN_DIR.mkdir(parents=True, exist_ok=True)
    log = log_path(campaign_id).open("a", encoding="utf-8")
    cmd = [
        sys.executable,
        str(Path(__file__).resolve()),
        "_run",
        campaign_id,
    ]
    proc = subprocess.Popen(
        cmd,
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        close_fds=True,
    )
    log.close()
    return int(proc.pid)


def mark_terminal(
    state: dict[str, Any],
    *,
    status: str,
    reason: str,
    error: str | None = None,
) -> None:
    state["status"] = status
    state["completion_reason"] = reason
    state["last_error"] = error
    state["current_generation"] = None
    state["current_generation_started_at"] = None
    state["pid"] = None
    state["finished_at"] = utc_now()
    save_state(state)


def run_campaign(campaign_id: str) -> int:
    CAMPAIGN_DIR.mkdir(parents=True, exist_ok=True)
    lock_file = LOCK_PATH.open("a+")
    try:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        raise CampaignError("another Storage OS campaign controller is active") from exc

    state = load_state(campaign_id)
    state["status"] = "RUNNING"
    state["pid"] = os.getpid()
    state["resumed_at"] = utc_now()
    save_state(state)

    try:
        while True:
            validate_bound_baseline(state)

            if state.get("pause_requested"):
                mark_terminal(
                    state,
                    status="PAUSED",
                    reason="OPERATOR_PAUSE_BETWEEN_GENERATIONS",
                )
                return 0

            completed = int(state.get("completed_generations") or 0)
            maximum = int(state["max_generations"])
            if completed >= maximum:
                mark_terminal(
                    state,
                    status="COMPLETE",
                    reason="GENERATION_LIMIT_REACHED",
                )
                return 0

            plan = storage.make_plan()
            state["last_plan"] = plan
            save_state(state)

            actionable, reason = actionable_plan(
                plan,
                completed=completed,
                force=bool(state.get("force")),
            )
            if not actionable:
                if reason == "TARGET_REACHED":
                    mark_terminal(
                        state,
                        status="COMPLETE",
                        reason="HEALTHY_TARGET_REACHED",
                    )
                    return 0
                if reason == "WATCH_NOT_DUE" and completed == 0:
                    mark_terminal(
                        state,
                        status="COMPLETE",
                        reason="WATCH_NOT_DUE",
                    )
                    return 0
                mark_terminal(
                    state,
                    status="BLOCKED",
                    reason=reason,
                )
                return 2

            generation = str(plan.get("candidate") or "")
            if not storage.GENERATION_RE.fullmatch(generation):
                raise CampaignError(f"unsafe campaign candidate: {generation!r}")

            started_at = utc_now()
            state["current_generation"] = generation
            state["current_generation_started_at"] = started_at
            state["status"] = "RUNNING_TRANSACTION"
            save_state(state)

            print()
            print("=" * 60, flush=True)
            print(
                f"CAMPAIGN {campaign_id} · TRANSACTION {completed + 1}/{maximum}",
                flush=True,
            )
            print(f"Generation: {generation}", flush=True)
            print("=" * 60, flush=True)

            storage.invoke_worker(
                str(state["release_sha"]),
                str(state["build_id"]),
                generation,
            )

            current = storage.snapshot(measure=False)
            completed_at = utc_now()
            history = list(state.get("history") or [])
            history.append(
                {
                    "generation": generation,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "used_percent_after": float(current["used_percent"]),
                    "verified_receipt_count_after": int(
                        current["verified_receipt_count"]
                    ),
                }
            )
            state["history"] = history
            state["completed_generations"] = completed + 1
            state["current_generation"] = None
            state["current_generation_started_at"] = None
            state["status"] = "RUNNING"
            state["last_storage_status"] = current
            save_state(state)

            storage.print_status(current)

            if float(current["used_percent"]) < float(state["target_percent"]):
                mark_terminal(
                    state,
                    status="COMPLETE",
                    reason="HEALTHY_TARGET_REACHED",
                )
                return 0

    except Exception as exc:
        state = load_state(campaign_id)
        state["status"] = "FAILED"
        state["last_error"] = str(exc)
        state["pid"] = None
        state["failed_at"] = utc_now()
        save_state(state)
        print(f"STOP: {exc}", file=sys.stderr, flush=True)
        return 2
    finally:
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        finally:
            lock_file.close()


def start(*, max_generations: int, force: bool) -> dict[str, Any]:
    state = create_state(
        max_generations=max_generations,
        force=force,
    )
    pid = spawn(str(state["campaign_id"]))
    return {
        **state,
        "spawned_pid": pid,
    }


def resume(campaign_id: str) -> dict[str, Any]:
    state = load_state(campaign_id)
    if state.get("status") == "COMPLETE":
        raise CampaignError("completed campaign cannot be resumed")
    pid = state.get("pid")
    if process_alive(pid if isinstance(pid, int) else None):
        raise CampaignError(f"campaign is still active with pid={pid}")
    validate_bound_baseline(state)
    state["pause_requested"] = False
    state["status"] = "RESUME_REQUESTED"
    state["pid"] = None
    save_state(state)
    new_pid = spawn(campaign_id)
    return {
        **load_state(campaign_id),
        "spawned_pid": new_pid,
    }


def request_pause(campaign_id: str) -> dict[str, Any]:
    state = load_state(campaign_id)
    if state.get("status") in {"COMPLETE", "FAILED", "BLOCKED", "PAUSED"}:
        return state
    state["pause_requested"] = True
    state["pause_requested_at"] = utc_now()
    save_state(state)
    return state


def status_payload(campaign_id: str | None) -> dict[str, Any]:
    selected = campaign_id or latest_campaign_id()
    if not selected:
        return {
            "schema": 1,
            "kind": "aoe2war-storage-campaign-status",
            "status": "NONE",
        }
    state = load_state(selected)
    pid = state.get("pid")
    state["process_alive"] = process_alive(pid if isinstance(pid, int) else None)
    return state


def print_status(state: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR STORAGE CAMPAIGN")
    print()
    if state.get("status") == "NONE":
        print("Status: NONE")
        return
    print(f"Campaign:    {state['campaign_id']}")
    print(f"Status:      {state['status']}")
    print(
        f"Progress:    {state.get('completed_generations', 0)}/"
        f"{state.get('max_generations', '?')}"
    )
    print(f"PID:         {state.get('pid') or '—'}")
    print(f"Alive:       {state.get('process_alive', False)}")
    print(f"Current:     {state.get('current_generation') or '—'}")
    print(f"Reason:      {state.get('completion_reason') or '—'}")
    print(f"Last error:  {state.get('last_error') or '—'}")
    print(f"Log:         {state.get('log_path') or '—'}")
    last = state.get("last_storage_status") or {}
    if last:
        print(f"Volume:      {last.get('used_percent')}% used")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="AoE2WAR terminal-independent Storage OS campaign controller"
    )
    sub = p.add_subparsers(dest="command", required=True)

    q = sub.add_parser("start")
    q.add_argument("--max-generations", type=int, default=25)
    q.add_argument("--force", action="store_true")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("status")
    q.add_argument("campaign_id", nargs="?")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("pause")
    q.add_argument("campaign_id", nargs="?")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("resume")
    q.add_argument("campaign_id", nargs="?")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("_run")
    q.add_argument("campaign_id")

    return p


def main() -> int:
    args = parser().parse_args()

    if args.command == "_run":
        return run_campaign(args.campaign_id)

    if args.command == "start":
        payload = start(
            max_generations=args.max_generations,
            force=args.force,
        )
    elif args.command == "status":
        payload = status_payload(args.campaign_id)
    elif args.command == "pause":
        campaign_id = args.campaign_id or latest_campaign_id()
        if not campaign_id:
            raise CampaignError("no storage campaign exists")
        payload = request_pause(campaign_id)
    elif args.command == "resume":
        campaign_id = args.campaign_id or latest_campaign_id()
        if not campaign_id:
            raise CampaignError("no storage campaign exists")
        payload = resume(campaign_id)
    else:
        raise CampaignError(f"unknown command: {args.command}")

    if getattr(args, "json", False):
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print_status(
            status_payload(str(payload.get("campaign_id")))
            if payload.get("campaign_id")
            else payload
        )
        if payload.get("spawned_pid"):
            print(f"Spawned PID: {payload['spawned_pid']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (CampaignError, storage.StorageError, subprocess.TimeoutExpired) as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        raise SystemExit(2)
