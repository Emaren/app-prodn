#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from scripts import aoe2_storage as storage
    from scripts import aoe2_storage_campaign as campaign
except ImportError:
    import aoe2_storage as storage  # type: ignore
    import aoe2_storage_campaign as campaign  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "bin" / "aoe2war"
HANDOFF_DIR = ROOT / ".aoe2war-release" / "storage-handoffs"
FINISH_RECEIPT_DIR = ROOT / ".aoe2war-release" / "finish-receipts"
LOCK_PATH = HANDOFF_DIR / "handoff.lock"

FLOW = [
    "V1_RUNNING",
    "V1_FROZEN",
    "TRANSACTION_SEAM_PROVEN",
    "SOURCE_READY",
    "RUNNER_RECONCILED",
    "V2_CERTIFIED",
    "V1_RETIRED",
    "V2_RESUMED",
]


class HandoffError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def state_path(handoff_id: str) -> Path:
    if not handoff_id or "/" in handoff_id or ".." in handoff_id:
        raise HandoffError(f"unsafe handoff id: {handoff_id!r}")
    return HANDOFF_DIR / f"{handoff_id}.json"


def log_path(handoff_id: str) -> Path:
    return HANDOFF_DIR / f"{handoff_id}.log"


def finish_log_path(handoff_id: str) -> Path:
    return HANDOFF_DIR / f"{handoff_id}.finish.log"


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp.{os.getpid()}")
    tmp.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(tmp, path)


def load_state(handoff_id: str) -> dict[str, Any]:
    path = state_path(handoff_id)
    if not path.is_file():
        raise HandoffError(f"handoff state not found: {handoff_id}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema") != 1 or payload.get("kind") != "aoe2war-storage-handoff":
        raise HandoffError(f"invalid handoff state: {path}")
    return payload


def save_state(state: dict[str, Any]) -> None:
    state["updated_at"] = utc_now()
    atomic_write(state_path(str(state["handoff_id"])), state)


def latest_handoff_id() -> str | None:
    if not HANDOFF_DIR.is_dir():
        return None
    rows = sorted(
        HANDOFF_DIR.glob("*.json"),
        key=lambda path: (path.stat().st_mtime_ns, path.name),
        reverse=True,
    )
    return rows[0].stem if rows else None


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


def process_table() -> dict[int, dict[str, int]]:
    proc = subprocess.run(
        ["ps", "-axo", "pid=,ppid=,pgid="],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        raise HandoffError(
            "cannot inspect process table: " + (proc.stderr or "ps failed")[-1000:]
        )
    rows: dict[int, dict[str, int]] = {}
    for raw in proc.stdout.splitlines():
        parts = raw.split()
        if len(parts) < 3:
            continue
        try:
            pid, ppid, pgid = map(int, parts[:3])
        except ValueError:
            continue
        rows[pid] = {"pid": pid, "ppid": ppid, "pgid": pgid}
    return rows


def process_family(pid: int | None) -> dict[str, Any]:
    if not isinstance(pid, int) or pid <= 0:
        return {"pid": None, "pgid": None, "descendants": []}
    rows = process_table()
    root = rows.get(pid)
    if root is None:
        return {"pid": pid, "pgid": None, "descendants": []}

    descendants: list[int] = []
    frontier = [pid]
    seen = {pid}
    while frontier:
        parent = frontier.pop()
        children = sorted(
            row_pid
            for row_pid, row in rows.items()
            if row["ppid"] == parent and row_pid not in seen
        )
        for child in children:
            seen.add(child)
            descendants.append(child)
            frontier.append(child)
    return {
        "pid": pid,
        "pgid": root["pgid"],
        "descendants": descendants,
    }


def recorded_family_dead(snapshot: dict[str, Any]) -> bool:
    pids: list[int] = []
    root = snapshot.get("pid")
    if isinstance(root, int):
        pids.append(root)
    for value in snapshot.get("descendants") or []:
        if isinstance(value, int):
            pids.append(value)
    return all(not process_alive(pid) for pid in pids)


def git_output(*args: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(ROOT), *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        raise HandoffError(
            f"git {' '.join(args)} failed: " + (proc.stderr or proc.stdout)[-1500:]
        )
    return proc.stdout.strip()


def source_ready(old_release: str, *, expected_target: str | None = None) -> str:
    branch = git_output("branch", "--show-current")
    if branch != "main":
        raise HandoffError(f"handoff requires canonical main, found {branch!r}")
    if git_output("status", "--porcelain", "--untracked-files=all"):
        raise HandoffError("handoff requires a clean canonical worktree")
    head = git_output("rev-parse", "HEAD")
    remote = git_output("rev-parse", "origin/main")
    if head != remote:
        raise HandoffError(f"local HEAD {head} != origin/main {remote}")
    if expected_target and head != expected_target:
        raise HandoffError(
            f"handoff target drifted: expected={expected_target} current={head}"
        )
    ancestor = subprocess.run(
        ["git", "-C", str(ROOT), "merge-base", "--is-ancestor", old_release, head],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if ancestor.returncode != 0:
        raise HandoffError(
            f"current main {head} does not descend from V1 source {old_release}"
        )
    if head == old_release:
        raise HandoffError("handoff target is identical to the certified V1 source")
    return head


def transition(
    state: dict[str, Any],
    target: str,
    *,
    evidence: dict[str, Any] | None = None,
) -> None:
    if target not in FLOW:
        raise HandoffError(f"invalid handoff state: {target}")
    current = str(state.get("status") or "")
    if current:
        current_index = FLOW.index(current)
        target_index = FLOW.index(target)
        if target_index != current_index + 1:
            raise HandoffError(f"invalid handoff transition: {current} -> {target}")
    history = list(state.get("history") or [])
    history.append(
        {
            "from": current or None,
            "to": target,
            "at": utc_now(),
            "evidence": evidence or {},
        }
    )
    state["status"] = target
    state["history"] = history
    state["last_error"] = None
    save_state(state)


def prove_frozen(campaign_state: dict[str, Any]) -> None:
    if campaign_state.get("status") != "PAUSED":
        raise HandoffError(
            "V1 is not frozen at a cooperative seam: "
            f"campaign status={campaign_state.get('status')}"
        )
    if campaign_state.get("completion_reason") != "OPERATOR_PAUSE_BETWEEN_GENERATIONS":
        raise HandoffError(
            "V1 pause lacks the between-generation completion reason"
        )
    if (
        campaign_state.get("current_generation")
        or campaign_state.get("current_generation_started_at")
    ):
        raise HandoffError("V1 still records an active generation transaction")
    pid = campaign_state.get("pid")
    if process_alive(pid if isinstance(pid, int) else None):
        raise HandoffError(f"V1 controller is still alive with pid={pid}")


def create_state(campaign_id: str) -> dict[str, Any]:
    existing = campaign.load_state(campaign_id)
    if existing.get("status") in {"COMPLETE", "FAILED", "BLOCKED"}:
        raise HandoffError(
            f"campaign {campaign_id} is not eligible for handoff: "
            f"status={existing.get('status')}"
        )

    current_release, current_build = storage.operator_baseline()
    if (
        current_release != existing.get("release_sha")
        or current_build != existing.get("build_id")
    ):
        raise HandoffError(
            "campaign authority does not match certified V1 runtime: "
            f"campaign={existing.get('release_sha')}:{existing.get('build_id')} "
            f"runtime={current_release}:{current_build}"
        )

    target_source = source_ready(current_release)
    pid = existing.get("pid")
    family = process_family(pid if isinstance(pid, int) else None)
    handoff_id = f"{stamp()}-{campaign_id}-{target_source[:12]}"
    payload = {
        "schema": 1,
        "kind": "aoe2war-storage-handoff",
        "handoff_id": handoff_id,
        "campaign_id": campaign_id,
        "status": "V1_RUNNING",
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "old_release_sha": current_release,
        "old_build_id": current_build,
        "target_source_sha": target_source,
        "new_release_sha": None,
        "new_build_id": None,
        "v1_process_family": family,
        "finish_pid": None,
        "finish_started_at": None,
        "finish_returncode": None,
        "finish_log_path": str(finish_log_path(handoff_id)),
        "finish_log_sha256": None,
        "resumed_pid": None,
        "history": [
            {
                "from": None,
                "to": "V1_RUNNING",
                "at": utc_now(),
                "evidence": {
                    "campaign_status": existing.get("status"),
                    "campaign_release_sha": existing.get("release_sha"),
                    "campaign_build_id": existing.get("build_id"),
                    "process_family": family,
                    "target_source_sha": target_source,
                },
            }
        ],
        "last_error": None,
        "log_path": str(log_path(handoff_id)),
    }
    save_state(payload)
    return payload


def spawn_runner(handoff_id: str) -> int:
    state = load_state(handoff_id)
    runner_pid = state.get("runner_pid")
    if process_alive(runner_pid if isinstance(runner_pid, int) else None):
        raise HandoffError(f"handoff runner already active with pid={runner_pid}")

    HANDOFF_DIR.mkdir(parents=True, exist_ok=True)
    log = log_path(handoff_id).open("a", encoding="utf-8")
    proc = subprocess.Popen(
        [sys.executable, str(Path(__file__).resolve()), "_run", handoff_id],
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        close_fds=True,
    )
    log.close()
    state["runner_pid"] = int(proc.pid)
    state["runner_started_at"] = utc_now()
    save_state(state)
    return int(proc.pid)


def start(campaign_id: str | None) -> dict[str, Any]:
    selected = campaign_id or campaign.latest_campaign_id()
    if not selected:
        raise HandoffError("no storage campaign exists")
    state = create_state(selected)
    pid = spawn_runner(str(state["handoff_id"]))
    return {**load_state(str(state["handoff_id"])), "spawned_pid": pid}


def launch_finish(state: dict[str, Any]) -> subprocess.Popen[str]:
    path = finish_log_path(str(state["handoff_id"]))
    path.parent.mkdir(parents=True, exist_ok=True)
    log = path.open("a", encoding="utf-8")
    proc = subprocess.Popen(
        [
            str(CLI),
            "finish",
            "-m",
            f"Storage OS handoff {state['handoff_id']}",
        ],
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
        close_fds=True,
    )
    log.close()
    state["finish_pid"] = int(proc.pid)
    state["finish_started_at"] = utc_now()
    state["finish_returncode"] = None
    save_state(state)
    return proc


def seal_finish_log(state: dict[str, Any]) -> None:
    path = finish_log_path(str(state["handoff_id"]))
    if path.is_file():
        state["finish_log_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()


def finish_receipt_for_target(target_source: str) -> tuple[Path, dict[str, Any]] | None:
    if not FINISH_RECEIPT_DIR.is_dir():
        return None
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
        if payload.get("kind") != "aoe2war-finish-result":
            continue
        if payload.get("status") != "CERTIFIED":
            continue
        if payload.get("release_outcome") != "CERTIFIED":
            continue
        phase = (payload.get("phases") or {}).get(
            "maintenance_runner_reconciliation"
        ) or {}
        if not isinstance(phase, dict) or phase.get("status") != "PASSED":
            continue
        final_release = payload.get("final_release") or payload.get("certified_release") or {}
        if not isinstance(final_release, dict):
            continue
        production = final_release.get("production") or {}
        certification = final_release.get("certification") or {}
        if not isinstance(production, dict) or not isinstance(certification, dict):
            continue
        if production.get("source_sha") != target_source:
            continue
        if certification.get("status") != "CERTIFIED":
            continue
        if certification.get("release_sha") != target_source:
            continue
        return path, payload
    return None


def bind_finish_receipt(state: dict[str, Any]) -> None:
    target = str(state["target_source_sha"])
    found = finish_receipt_for_target(target)
    if found is None:
        raise HandoffError(
            "target runtime is certified but no exact CERTIFIED Finish receipt "
            "proves maintenance-runner reconciliation"
        )
    path, payload = found
    state["finish_receipt_path"] = str(path)
    state["finish_receipt_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    state["finish_release_certified_at"] = payload.get("release_certified_at")
    save_state(state)


def prove_target_certified(state: dict[str, Any]) -> tuple[str, str]:
    release, build = storage.operator_baseline()
    target = str(state["target_source_sha"])
    if release != target:
        raise HandoffError(
            "Finish did not certify the intended V2 source: "
            f"target={target} certified={release}"
        )
    return release, build


def wait_for_finish_or_recover(state: dict[str, Any]) -> tuple[str, str]:
    target = str(state["target_source_sha"])

    try:
        current_release, current_build = storage.operator_baseline()
    except Exception:
        current_release, current_build = "", ""

    if current_release == target:
        state["finish_pid"] = None
        seal_finish_log(state)
        save_state(state)
        bind_finish_receipt(state)
        return current_release, current_build

    finish_pid = state.get("finish_pid")
    if isinstance(finish_pid, int) and process_alive(finish_pid):
        while process_alive(finish_pid):
            time.sleep(2)
        state = load_state(str(state["handoff_id"]))

    proc = launch_finish(state)
    returncode = proc.wait()
    state = load_state(str(state["handoff_id"]))
    state["finish_pid"] = None
    state["finish_returncode"] = int(returncode)
    seal_finish_log(state)
    save_state(state)
    if returncode != 0:
        raise HandoffError(
            f"canonical Finish failed with exit code {returncode}; "
            f"inspect {state['finish_log_path']}"
        )
    release, build = prove_target_certified(state)
    bind_finish_receipt(state)
    return release, build


def drive(handoff_id: str) -> int:
    HANDOFF_DIR.mkdir(parents=True, exist_ok=True)
    lock = LOCK_PATH.open("a+")
    try:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        raise HandoffError("another Storage OS handoff runner is active") from exc

    try:
        while True:
            state = load_state(handoff_id)
            status = str(state["status"])
            campaign_id = str(state["campaign_id"])

            if status == "V2_RESUMED":
                state["runner_pid"] = None
                state["completed_at"] = state.get("completed_at") or utc_now()
                save_state(state)
                return 0

            if status == "V1_RUNNING":
                campaign.request_pause(campaign_id)
                current = campaign.load_state(campaign_id)
                if current.get("status") != "PAUSED":
                    if current.get("status") in {"COMPLETE", "FAILED", "BLOCKED"}:
                        raise HandoffError(
                            "V1 could not reach the cooperative freeze seam: "
                            f"campaign status={current.get('status')} "
                            f"reason={current.get('completion_reason') or current.get('last_error')}"
                        )
                    pid = current.get("pid")
                    if (
                        current.get("status") not in {"CREATED", "RESUME_REQUESTED"}
                        and not process_alive(pid if isinstance(pid, int) else None)
                    ):
                        raise HandoffError(
                            "V1 controller disappeared before the cooperative freeze seam"
                        )
                    time.sleep(2)
                    continue
                prove_frozen(current)
                transition(
                    state,
                    "V1_FROZEN",
                    evidence={
                        "campaign_status": current.get("status"),
                        "completion_reason": current.get("completion_reason"),
                    },
                )
                continue

            if status == "V1_FROZEN":
                current = campaign.load_state(campaign_id)
                prove_frozen(current)
                transition(
                    state,
                    "TRANSACTION_SEAM_PROVEN",
                    evidence={
                        "current_generation": current.get("current_generation"),
                        "current_generation_started_at": current.get(
                            "current_generation_started_at"
                        ),
                        "controller_pid": current.get("pid"),
                    },
                )
                continue

            if status == "TRANSACTION_SEAM_PROVEN":
                target = source_ready(
                    str(state["old_release_sha"]),
                    expected_target=str(state["target_source_sha"]),
                )
                transition(
                    state,
                    "SOURCE_READY",
                    evidence={"target_source_sha": target},
                )
                continue

            if status == "SOURCE_READY":
                release, build = wait_for_finish_or_recover(state)
                state = load_state(handoff_id)
                state["new_release_sha"] = release
                state["new_build_id"] = build
                save_state(state)
                transition(
                    state,
                    "RUNNER_RECONCILED",
                    evidence={
                        "finish_returncode": state.get("finish_returncode"),
                        "finish_log_sha256": state.get("finish_log_sha256"),
                        "finish_receipt_path": state.get("finish_receipt_path"),
                        "finish_receipt_sha256": state.get("finish_receipt_sha256"),
                    },
                )
                continue

            if status == "RUNNER_RECONCILED":
                release, build = prove_target_certified(state)
                transition(
                    state,
                    "V2_CERTIFIED",
                    evidence={
                        "release_sha": release,
                        "build_id": build,
                    },
                )
                continue

            if status == "V2_CERTIFIED":
                if not recorded_family_dead(state.get("v1_process_family") or {}):
                    raise HandoffError(
                        "recorded V1 process family is still alive after V2 certification"
                    )
                transition(
                    state,
                    "V1_RETIRED",
                    evidence={"process_family_dead": True},
                )
                continue

            if status == "V1_RETIRED":
                release, build = prove_target_certified(state)
                campaign.rebind_after_handoff(
                    campaign_id,
                    handoff_id=handoff_id,
                    old_release_sha=str(state["old_release_sha"]),
                    old_build_id=str(state["old_build_id"]),
                    new_release_sha=release,
                    new_build_id=build,
                )
                resumed = campaign.resume(campaign_id)
                state["resumed_pid"] = resumed.get("spawned_pid")
                save_state(state)
                transition(
                    state,
                    "V2_RESUMED",
                    evidence={
                        "new_release_sha": release,
                        "new_build_id": build,
                        "resumed_pid": resumed.get("spawned_pid"),
                    },
                )
                continue

            raise HandoffError(f"unsupported handoff state: {status}")

    except Exception as exc:
        state = load_state(handoff_id)
        state["last_error"] = str(exc)
        state["runner_pid"] = None
        state["failed_at"] = utc_now()
        save_state(state)
        print(f"STOP: {exc}", file=sys.stderr, flush=True)
        return 2
    finally:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        finally:
            lock.close()


def resume(handoff_id: str | None) -> dict[str, Any]:
    selected = handoff_id or latest_handoff_id()
    if not selected:
        raise HandoffError("no storage handoff exists")
    state = load_state(selected)
    if state.get("status") == "V2_RESUMED":
        return state
    runner_pid = state.get("runner_pid")
    if process_alive(runner_pid if isinstance(runner_pid, int) else None):
        return state
    state["last_error"] = None
    save_state(state)
    pid = spawn_runner(selected)
    return {**load_state(selected), "spawned_pid": pid}


def status_payload(handoff_id: str | None) -> dict[str, Any]:
    selected = handoff_id or latest_handoff_id()
    if not selected:
        return {
            "schema": 1,
            "kind": "aoe2war-storage-handoff-status",
            "status": "NONE",
        }
    state = load_state(selected)
    runner_pid = state.get("runner_pid")
    finish_pid = state.get("finish_pid")
    state["runner_alive"] = process_alive(
        runner_pid if isinstance(runner_pid, int) else None
    )
    state["finish_alive"] = process_alive(
        finish_pid if isinstance(finish_pid, int) else None
    )
    return state


def print_status(state: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR STORAGE HANDOFF")
    print()
    if state.get("status") == "NONE":
        print("Status: NONE")
        return
    print(f"Handoff:      {state.get('handoff_id')}")
    print(f"Campaign:     {state.get('campaign_id')}")
    print(f"Status:       {state.get('status')}")
    print(f"V1 source:    {state.get('old_release_sha')}")
    print(f"Target:       {state.get('target_source_sha')}")
    print(f"V2 source:    {state.get('new_release_sha') or '—'}")
    print(f"V2 build:     {state.get('new_build_id') or '—'}")
    print(f"Runner PID:   {state.get('runner_pid') or '—'}")
    print(f"Runner alive: {state.get('runner_alive', False)}")
    print(f"Finish PID:   {state.get('finish_pid') or '—'}")
    print(f"Finish alive: {state.get('finish_alive', False)}")
    print(f"Resumed PID:  {state.get('resumed_pid') or '—'}")
    print(f"Last error:   {state.get('last_error') or '—'}")
    print(f"Log:          {state.get('log_path') or '—'}")
    print(f"Finish log:   {state.get('finish_log_path') or '—'}")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="AoE2WAR resumable Storage OS V1->V2 handoff controller"
    )
    sub = p.add_subparsers(dest="command", required=True)

    q = sub.add_parser("start")
    q.add_argument("campaign_id", nargs="?")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("status")
    q.add_argument("handoff_id", nargs="?")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("resume")
    q.add_argument("handoff_id", nargs="?")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("_run")
    q.add_argument("handoff_id")

    return p


def main() -> int:
    args = parser().parse_args()
    if args.command == "_run":
        return drive(args.handoff_id)

    if args.command == "start":
        payload = start(args.campaign_id)
    elif args.command == "status":
        payload = status_payload(args.handoff_id)
    elif args.command == "resume":
        payload = resume(args.handoff_id)
    else:
        raise HandoffError(f"unknown command: {args.command}")

    if getattr(args, "json", False):
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print_status(
            status_payload(str(payload.get("handoff_id")))
            if payload.get("handoff_id")
            else payload
        )
        if payload.get("spawned_pid"):
            print(f"Spawned PID: {payload['spawned_pid']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (
        HandoffError,
        campaign.CampaignError,
        storage.StorageError,
        subprocess.TimeoutExpired,
    ) as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        raise SystemExit(2)
