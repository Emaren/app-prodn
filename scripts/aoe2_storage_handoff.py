#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import json
import os
import signal
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
HANDOFF_ROOT = ROOT / ".aoe2war-release" / "storage-handoffs"
LOCK_PATH = HANDOFF_ROOT / "handoff.lock"
FINAL_STATE = "V2_RESUMED"
STATE_ORDER = (
    "CREATED",
    "V1_FROZEN",
    "TRANSACTION_SEAM_PROVEN",
    "SOURCE_READY",
    "RUNNER_RECONCILED",
    "V2_CERTIFIED",
    "V1_RETIRED",
    FINAL_STATE,
)


class HandoffError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def safe_id(value: str) -> str:
    if not value or "/" in value or ".." in value:
        raise HandoffError(f"unsafe handoff id: {value!r}")
    return value


def handoff_dir(handoff_id: str) -> Path:
    return HANDOFF_ROOT / safe_id(handoff_id)


def state_path(handoff_id: str) -> Path:
    return handoff_dir(handoff_id) / "state.json"


def log_path(handoff_id: str) -> Path:
    return handoff_dir(handoff_id) / "handoff.log"


def receipts_dir(handoff_id: str) -> Path:
    return handoff_dir(handoff_id) / "receipts"


def atomic_write(path: Path, payload: dict[str, Any], *, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.partial.{os.getpid()}")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def load_state(handoff_id: str) -> dict[str, Any]:
    path = state_path(handoff_id)
    if not path.is_file():
        raise HandoffError(f"handoff state not found: {handoff_id}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if (
        payload.get("schema") != 1
        or payload.get("kind") != "aoe2war-storage-handoff"
        or payload.get("handoff_id") != handoff_id
    ):
        raise HandoffError(f"invalid handoff state: {path}")
    if payload.get("status") not in STATE_ORDER:
        raise HandoffError(f"invalid handoff status: {payload.get('status')!r}")
    return payload


def save_state(state: dict[str, Any]) -> None:
    state["updated_at"] = utc_now()
    atomic_write(state_path(str(state["handoff_id"])), state)


def latest_handoff_id() -> str | None:
    if not HANDOFF_ROOT.is_dir():
        return None
    states = sorted(
        HANDOFF_ROOT.glob("*/state.json"),
        key=lambda path: (path.stat().st_mtime_ns, str(path)),
        reverse=True,
    )
    return states[0].parent.name if states else None


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


def process_table() -> list[dict[str, Any]]:
    proc = subprocess.run(
        ["ps", "-axo", "pid=,ppid=,pgid=,stat="],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=15,
        check=False,
    )
    if proc.returncode != 0:
        raise HandoffError("cannot inspect local process table: " + (proc.stderr or "")[-2000:])
    rows: list[dict[str, Any]] = []
    for raw in (proc.stdout or "").splitlines():
        parts = raw.split()
        if len(parts) < 4:
            continue
        try:
            pid, ppid, pgid = (int(parts[0]), int(parts[1]), int(parts[2]))
        except ValueError:
            continue
        rows.append(
            {
                "pid": pid,
                "ppid": ppid,
                "pgid": pgid,
                "stat": parts[3],
            }
        )
    return rows


def process_snapshot(pid: int) -> dict[str, Any]:
    if not process_alive(pid):
        raise HandoffError(f"campaign controller pid {pid} is not alive")
    try:
        pgid = os.getpgid(pid)
    except OSError as exc:
        raise HandoffError(f"cannot resolve process group for pid {pid}") from exc

    rows = process_table()
    children: dict[int, list[int]] = {}
    by_pid: dict[int, dict[str, Any]] = {}
    for row in rows:
        by_pid[int(row["pid"])] = row
        children.setdefault(int(row["ppid"]), []).append(int(row["pid"]))

    descendants: list[int] = []
    queue = list(children.get(pid, []))
    while queue:
        child = queue.pop(0)
        if child in descendants:
            continue
        descendants.append(child)
        queue.extend(children.get(child, []))

    parent = by_pid.get(pid)
    if parent is None:
        raise HandoffError(f"campaign controller pid {pid} vanished during inspection")

    return {
        "pid": pid,
        "pgid": pgid,
        "stat": parent.get("stat"),
        "stopped": "T" in str(parent.get("stat") or ""),
        "descendants": [
            {
                "pid": child,
                "pgid": by_pid.get(child, {}).get("pgid"),
                "stat": by_pid.get(child, {}).get("stat"),
                "stopped": "T" in str(by_pid.get(child, {}).get("stat") or ""),
            }
            for child in sorted(descendants)
        ],
    }


def validate_campaign_seam(
    campaign_state: dict[str, Any],
    *,
    require_running: bool,
) -> None:
    if campaign_state.get("current_generation") or campaign_state.get(
        "current_generation_started_at"
    ):
        raise HandoffError(
            "storage campaign is inside a one-generation transaction; "
            "handoff requires the serialized between-generation seam"
        )
    status = str(campaign_state.get("status") or "")
    if require_running and status != "RUNNING":
        raise HandoffError(
            f"storage campaign must be RUNNING at handoff start, found {status or 'UNKNOWN'}"
        )


def assert_frozen_identity(state: dict[str, Any]) -> dict[str, Any]:
    identity = state.get("v1_process") or {}
    pid = int(identity.get("pid") or 0)
    expected_pgid = int(identity.get("pgid") or 0)
    if pid <= 0 or expected_pgid <= 0:
        raise HandoffError("handoff has no recorded V1 pid/pgid identity")

    current = process_snapshot(pid)
    if int(current["pgid"]) != expected_pgid:
        raise HandoffError(
            f"V1 process-group identity changed: expected {expected_pgid}, "
            f"found {current['pgid']}"
        )
    expected_desc = {
        (int(row.get("pid") or 0), int(row.get("pgid") or 0))
        for row in identity.get("descendants") or []
    }
    current_desc = {
        (int(row.get("pid") or 0), int(row.get("pgid") or 0))
        for row in current.get("descendants") or []
    }
    if current_desc != expected_desc:
        raise HandoffError(
            "V1 descendant identity changed while frozen; refusing takeover"
        )
    if not current.get("stopped"):
        raise HandoffError("V1 parent is not stopped")
    if any(not row.get("stopped") for row in current.get("descendants") or []):
        raise HandoffError("one or more V1 descendants are not stopped")
    return current


def seal_transition(
    state: dict[str, Any],
    target: str,
    evidence: dict[str, Any],
) -> dict[str, Any]:
    current = str(state.get("status") or "")
    try:
        current_index = STATE_ORDER.index(current)
        target_index = STATE_ORDER.index(target)
    except ValueError as exc:
        raise HandoffError(f"invalid state transition {current!r} -> {target!r}") from exc
    if target_index != current_index + 1:
        raise HandoffError(f"non-sequential state transition {current} -> {target}")

    history = list(state.get("history") or [])
    transition_number = len(history) + 1
    at = utc_now()
    receipt = {
        "schema": 1,
        "kind": "aoe2war-storage-handoff-transition",
        "handoff_id": state["handoff_id"],
        "campaign_id": state["campaign_id"],
        "transition": transition_number,
        "from": current,
        "to": target,
        "at": at,
        "evidence": evidence,
        "database_mutated": False,
        "wolo_mutated": False,
    }
    path = receipts_dir(str(state["handoff_id"])) / (
        f"{transition_number:02d}-{target.lower()}.json"
    )
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise HandoffError(
                f"existing transition receipt is unreadable: {path}"
            ) from exc
        expected_identity = {
            "schema": 1,
            "kind": "aoe2war-storage-handoff-transition",
            "handoff_id": state["handoff_id"],
            "campaign_id": state["campaign_id"],
            "transition": transition_number,
            "from": current,
            "to": target,
            "evidence": evidence,
            "database_mutated": False,
            "wolo_mutated": False,
        }
        for key, value in expected_identity.items():
            if existing.get(key) != value:
                raise HandoffError(
                    f"existing transition receipt conflicts at {key}: {path}"
                )
        at = str(existing.get("at") or "")
        if not at:
            raise HandoffError(
                f"existing transition receipt has no timestamp: {path}"
            )
    else:
        atomic_write(path, receipt, mode=0o444)

    history.append(
        {
            "transition": transition_number,
            "from": current,
            "to": target,
            "at": at,
            "receipt": str(path),
        }
    )
    state["history"] = history
    state["status"] = target
    state["last_transition_receipt"] = str(path)
    state["last_error"] = None
    save_state(state)
    return state


def git_output(*args: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(ROOT), *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=60,
        check=False,
    )
    if proc.returncode != 0:
        raise HandoffError(
            "git " + " ".join(args) + " failed: " + (proc.stderr or proc.stdout or "")[-2000:]
        )
    return (proc.stdout or "").strip()


def source_ready_evidence(state: dict[str, Any]) -> dict[str, Any]:
    branch = git_output("branch", "--show-current")
    if branch != "main":
        raise HandoffError(f"storage handoff requires canonical main, found {branch!r}")
    dirty = git_output("status", "--porcelain", "--untracked-files=all")
    if dirty:
        raise HandoffError("canonical main is dirty; refusing Storage OS handoff")

    head = git_output("rev-parse", "HEAD")
    remote = git_output("rev-parse", "origin/main")
    if head != remote:
        raise HandoffError(f"canonical main {head} != origin/main {remote}")

    release, build = storage.operator_baseline()
    if release != state.get("v1_release_sha") or build != state.get("v1_build_id"):
        raise HandoffError(
            "certified production changed before handoff source-ready proof: "
            f"expected {state.get('v1_release_sha')}:{state.get('v1_build_id')} "
            f"found {release}:{build}"
        )
    return {
        "branch": branch,
        "target_source_sha": head,
        "github_source_sha": remote,
        "v1_release_sha": release,
        "v1_build_id": build,
    }


def run_finish_json() -> dict[str, Any]:
    command = [
        str(ROOT / "bin" / "aoe2war"),
        "finish",
        "--json",
        "-m",
        "Complete Storage OS V1 to V2 handoff",
    ]
    proc = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=7200,
        check=False,
    )
    output = (proc.stdout or "").strip()
    try:
        payload = json.loads(output)
    except json.JSONDecodeError as exc:
        raise HandoffError(
            "Finish returned non-JSON output during handoff: " + output[-5000:]
        ) from exc
    if proc.returncode != 0:
        raise HandoffError(
            "Finish failed during Storage OS handoff: "
            + str(payload.get("error") or payload.get("status") or "unknown")
        )
    return payload


def maintenance_runner_evidence(finish: dict[str, Any]) -> dict[str, Any]:
    phase = (finish.get("phases") or {}).get("maintenance_runner_reconciliation") or {}
    if phase.get("status") != "PASSED":
        raise HandoffError("Finish did not prove maintenance-runner reconciliation")
    result = finish.get("maintenance_runner_reconciliation") or {}
    if result.get("status") not in {"NOOP", "UPDATED"}:
        raise HandoffError("maintenance-runner reconciliation has invalid status")
    try:
        h1 = int(result.get("wolo_height_before"))
        h2 = int(result.get("wolo_height_after"))
        pid = int(result.get("wolo_pid"))
        restarts = int(result.get("wolo_restart_counter"))
    except (TypeError, ValueError) as exc:
        raise HandoffError("maintenance-runner Wolo continuity evidence is incomplete") from exc
    if pid <= 0 or restarts < 0 or h2 <= h1:
        raise HandoffError("maintenance-runner Wolo continuity proof is invalid")
    return {
        "status": result.get("status"),
        "installed_sha256": result.get("installed_sha256"),
        "receipt_path": result.get("receipt_path"),
        "wolo_pid": pid,
        "wolo_restart_counter": restarts,
        "wolo_height_before": h1,
        "wolo_height_after": h2,
    }


def certified_finish_evidence(finish: dict[str, Any]) -> dict[str, Any]:
    if finish.get("status") != "CERTIFIED" or finish.get("release_outcome") != "CERTIFIED":
        raise HandoffError(
            "Finish did not reach full CERTIFIED closure during Storage OS handoff"
        )
    phases = finish.get("phases") or {}
    for name in ("release_certification", "final_certification"):
        if (phases.get(name) or {}).get("status") != "PASSED":
            raise HandoffError(f"Finish phase {name} is not PASSED")

    if finish.get("wolo_mutated_by_finish") is not False:
        raise HandoffError("Finish did not preserve the Wolo observe-only boundary")
    final_release = finish.get("final_release") or {}
    production = final_release.get("production") or {}
    if production.get("wolo_8092_count") != 1 or production.get("wolo_8093_count") != 1:
        raise HandoffError("final certified release does not prove exactly one Wolo listener per port")
    source = str((final_release.get("local") or {}).get("head") or "")
    build = str(production.get("active_build_id") or "")
    certification = final_release.get("certification") or {}
    if certification.get("status") != "CERTIFIED":
        raise HandoffError("final release certification status is not CERTIFIED")
    if not source or certification.get("release_sha") != source:
        raise HandoffError("final release source/certification identity is inconsistent")
    return {
        "source_sha": source,
        "build_id": build,
        "certification_status": certification.get("status"),
        "certification_receipt": certification.get("receipt_path"),
        "wolo_8092_count": 1,
        "wolo_8093_count": 1,
        "wolo_mutated": False,
    }


def retire_v1(state: dict[str, Any]) -> dict[str, Any]:
    frozen = assert_frozen_identity(state)
    pgid = int(frozen["pgid"])
    pid = int(frozen["pid"])
    os.killpg(pgid, signal.SIGKILL)

    deadline = time.monotonic() + 5
    while process_alive(pid) and time.monotonic() < deadline:
        time.sleep(0.1)
    if process_alive(pid):
        raise HandoffError(f"V1 controller pid {pid} survived SIGKILL")

    old = campaign.load_state(str(state["campaign_id"]))
    validate_campaign_seam(old, require_running=False)
    if int(old.get("pid") or 0) != pid:
        raise HandoffError("V1 campaign pid drifted before retirement receipt")
    old["status"] = "RETIRED_HANDOFF"
    old["pid"] = None
    old["completion_reason"] = "V2_CERTIFIED_HANDOFF"
    old["handoff_id"] = state["handoff_id"]
    old["finished_at"] = utc_now()
    campaign.save_state(old)
    return {
        "v1_pid": pid,
        "v1_pgid": pgid,
        "signal": "SIGKILL",
        "process_alive_after": False,
        "campaign_status": old["status"],
    }


def create_successor_campaign(state: dict[str, Any]) -> dict[str, Any]:
    old = campaign.load_state(str(state["campaign_id"]))
    completed = int(old.get("completed_generations") or 0)
    maximum = int(old.get("max_generations") or 0)
    remaining = max(0, maximum - completed)
    if remaining == 0:
        return {
            "status": "NO_REMAINING_GENERATIONS",
            "successor_campaign_id": None,
            "remaining_generations": 0,
        }

    release, build = campaign.current_baseline()
    plan = storage.make_plan()
    actionable, reason = campaign.actionable_plan(
        plan,
        completed=completed,
        force=bool(old.get("force")),
    )
    if not actionable:
        return {
            "status": "NO_ACTION_REQUIRED",
            "reason": reason,
            "successor_campaign_id": None,
            "remaining_generations": remaining,
            "release_sha": release,
            "build_id": build,
        }

    successor_id = f"{stamp()}-{release[:12]}-handoff"
    successor = {
        "schema": 1,
        "kind": "aoe2war-storage-campaign",
        "campaign_id": successor_id,
        "status": "CREATED",
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "release_sha": release,
        "build_id": build,
        "target_percent": storage.policy()["healthy_target"],
        "max_generations": remaining,
        "completed_generations": 0,
        "continuation_generations": completed,
        "force": bool(old.get("force")),
        "pause_requested": False,
        "pid": None,
        "current_generation": None,
        "current_generation_started_at": None,
        "history": [],
        "last_plan": plan,
        "last_error": None,
        "completion_reason": None,
        "log_path": str(campaign.log_path(successor_id)),
        "handoff_parent": {
            "handoff_id": state["handoff_id"],
            "campaign_id": state["campaign_id"],
            "completed_generations": completed,
        },
    }
    campaign.save_state(successor)
    pid = campaign.spawn(successor_id)
    return {
        "status": "STARTED",
        "successor_campaign_id": successor_id,
        "successor_pid": pid,
        "remaining_generations": remaining,
        "release_sha": release,
        "build_id": build,
    }


def create_state(campaign_id: str | None) -> dict[str, Any]:
    selected = campaign_id or campaign.latest_campaign_id()
    if not selected:
        raise HandoffError("no Storage OS campaign exists")

    old = campaign.load_state(selected)
    validate_campaign_seam(old, require_running=True)
    pid = int(old.get("pid") or 0)
    if not campaign.process_alive(pid):
        raise HandoffError(f"Storage OS campaign {selected} has no live controller")
    process = process_snapshot(pid)
    if process.get("stopped"):
        raise HandoffError("V1 campaign controller is already stopped before handoff authority exists")
    if any(row.get("stopped") for row in process.get("descendants") or []):
        raise HandoffError("V1 campaign has a pre-stopped descendant before handoff")

    release, build = storage.operator_baseline()
    if release != old.get("release_sha") or build != old.get("build_id"):
        raise HandoffError(
            "live Storage OS campaign is not bound to the current certified runtime"
        )

    handoff_id = f"{stamp()}-{selected}"
    state = {
        "schema": 1,
        "kind": "aoe2war-storage-handoff",
        "handoff_id": handoff_id,
        "campaign_id": selected,
        "status": "CREATED",
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "controller_pid": None,
        "controller_pgid": None,
        "v1_release_sha": release,
        "v1_build_id": build,
        "v1_completed_generations": int(old.get("completed_generations") or 0),
        "v1_max_generations": int(old.get("max_generations") or 0),
        "v1_force": bool(old.get("force")),
        "v1_process": process,
        "history": [],
        "finish_result": None,
        "successor": None,
        "last_error": None,
        "log_path": str(log_path(handoff_id)),
    }
    save_state(state)
    return state


def spawn(handoff_id: str) -> int:
    state = load_state(handoff_id)
    pid = state.get("controller_pid")
    if process_alive(pid if isinstance(pid, int) else None):
        raise HandoffError(f"handoff controller is already running with pid={pid}")

    handoff_dir(handoff_id).mkdir(parents=True, exist_ok=True)
    log = log_path(handoff_id).open("a", encoding="utf-8")
    proc = subprocess.Popen(
        [
            sys.executable,
            str(Path(__file__).resolve()),
            "_run",
            handoff_id,
        ],
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        close_fds=True,
    )
    log.close()
    return int(proc.pid)


def transition_created(state: dict[str, Any]) -> dict[str, Any]:
    old = campaign.load_state(str(state["campaign_id"]))
    validate_campaign_seam(old, require_running=True)
    frozen_before = process_snapshot(int(state["v1_process"]["pid"]))
    if frozen_before["pgid"] != state["v1_process"]["pgid"]:
        raise HandoffError("V1 process-group identity drifted before freeze")
    os.killpg(int(frozen_before["pgid"]), signal.SIGSTOP)

    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        current = process_snapshot(int(frozen_before["pid"]))
        if current.get("stopped") and all(
            row.get("stopped") for row in current.get("descendants") or []
        ):
            break
        time.sleep(0.1)
    current = process_snapshot(int(frozen_before["pid"]))
    if not current.get("stopped") or any(
        not row.get("stopped") for row in current.get("descendants") or []
    ):
        raise HandoffError("V1 process group did not enter a fully stopped state")
    state["v1_process"] = current
    return seal_transition(
        state,
        "V1_FROZEN",
        {
            "pid": current["pid"],
            "pgid": current["pgid"],
            "descendants": current["descendants"],
            "signal": "SIGSTOP",
        },
    )


def transition_v1_frozen(state: dict[str, Any]) -> dict[str, Any]:
    frozen = assert_frozen_identity(state)
    old = campaign.load_state(str(state["campaign_id"]))
    validate_campaign_seam(old, require_running=True)
    if int(old.get("pid") or 0) != int(frozen["pid"]):
        raise HandoffError("campaign state pid does not match frozen V1 identity")
    return seal_transition(
        state,
        "TRANSACTION_SEAM_PROVEN",
        {
            "campaign_status": old.get("status"),
            "current_generation": old.get("current_generation"),
            "current_generation_started_at": old.get("current_generation_started_at"),
            "completed_generations": old.get("completed_generations"),
            "pid": frozen["pid"],
            "pgid": frozen["pgid"],
        },
    )


def transition_seam_proven(state: dict[str, Any]) -> dict[str, Any]:
    assert_frozen_identity(state)
    evidence = source_ready_evidence(state)
    state["target_source_sha"] = evidence["target_source_sha"]
    save_state(state)
    return seal_transition(state, "SOURCE_READY", evidence)


def transition_source_ready(state: dict[str, Any]) -> dict[str, Any]:
    assert_frozen_identity(state)
    old = campaign.load_state(str(state["campaign_id"]))
    validate_campaign_seam(old, require_running=True)
    finish = run_finish_json()
    state["finish_result"] = finish
    save_state(state)
    evidence = maintenance_runner_evidence(finish)
    evidence["finish_receipt_path"] = finish.get("receipt_path")
    return seal_transition(state, "RUNNER_RECONCILED", evidence)


def transition_runner_reconciled(state: dict[str, Any]) -> dict[str, Any]:
    assert_frozen_identity(state)
    finish = state.get("finish_result")
    if not isinstance(finish, dict):
        raise HandoffError("RUNNER_RECONCILED state has no persisted Finish result")
    evidence = certified_finish_evidence(finish)
    target = str(state.get("target_source_sha") or "")
    if evidence["source_sha"] != target:
        raise HandoffError(
            f"certified V2 source {evidence['source_sha']} != source-ready target {target}"
        )
    evidence["finish_receipt_path"] = finish.get("receipt_path")
    return seal_transition(state, "V2_CERTIFIED", evidence)


def transition_v2_certified(state: dict[str, Any]) -> dict[str, Any]:
    evidence = retire_v1(state)
    return seal_transition(state, "V1_RETIRED", evidence)


def transition_v1_retired(state: dict[str, Any]) -> dict[str, Any]:
    successor = create_successor_campaign(state)
    state["successor"] = successor
    save_state(state)
    return seal_transition(state, FINAL_STATE, successor)


def advance_once(state: dict[str, Any]) -> dict[str, Any]:
    status = str(state.get("status"))
    if status == "CREATED":
        return transition_created(state)
    if status == "V1_FROZEN":
        return transition_v1_frozen(state)
    if status == "TRANSACTION_SEAM_PROVEN":
        return transition_seam_proven(state)
    if status == "SOURCE_READY":
        return transition_source_ready(state)
    if status == "RUNNER_RECONCILED":
        return transition_runner_reconciled(state)
    if status == "V2_CERTIFIED":
        return transition_v2_certified(state)
    if status == "V1_RETIRED":
        return transition_v1_retired(state)
    if status == FINAL_STATE:
        return state
    raise HandoffError(f"unsupported handoff state: {status}")


def run_handoff(handoff_id: str) -> int:
    HANDOFF_ROOT.mkdir(parents=True, exist_ok=True)
    lock = LOCK_PATH.open("a+")
    try:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        raise HandoffError("another Storage OS handoff controller is active") from exc

    try:
        state = load_state(handoff_id)
        state["controller_pid"] = os.getpid()
        state["controller_pgid"] = os.getpgrp()
        state["resumed_at"] = utc_now()
        state["last_error"] = None
        save_state(state)

        while state.get("status") != FINAL_STATE:
            state = advance_once(load_state(handoff_id))

        state = load_state(handoff_id)
        state["controller_pid"] = None
        state["controller_pgid"] = None
        state["completed_at"] = utc_now()
        save_state(state)
        return 0
    except Exception as exc:
        try:
            state = load_state(handoff_id)
            state["controller_pid"] = None
            state["controller_pgid"] = None
            state["last_error"] = str(exc)
            state["failed_at"] = utc_now()
            save_state(state)
        except Exception:
            pass
        print(f"STOP: {exc}", file=sys.stderr, flush=True)
        return 2
    finally:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        finally:
            lock.close()


def start(campaign_id: str | None) -> dict[str, Any]:
    state = create_state(campaign_id)
    pid = spawn(str(state["handoff_id"]))
    return {**state, "spawned_pid": pid}


def resume(handoff_id: str) -> dict[str, Any]:
    state = load_state(handoff_id)
    if state.get("status") == FINAL_STATE:
        raise HandoffError("completed handoff cannot be resumed")
    pid = state.get("controller_pid")
    if process_alive(pid if isinstance(pid, int) else None):
        raise HandoffError(f"handoff controller is still active with pid={pid}")
    new_pid = spawn(handoff_id)
    return {**state, "spawned_pid": new_pid}


def status_payload(handoff_id: str | None) -> dict[str, Any]:
    selected = handoff_id or latest_handoff_id()
    if not selected:
        return {
            "schema": 1,
            "kind": "aoe2war-storage-handoff-status",
            "status": "NONE",
        }
    state = load_state(selected)
    pid = state.get("controller_pid")
    return {
        **state,
        "process_alive": process_alive(pid if isinstance(pid, int) else None),
    }


def print_status(state: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR STORAGE HANDOFF")
    print()
    if state.get("status") == "NONE":
        print("Status: NONE")
        return
    print(f"Handoff:      {state['handoff_id']}")
    print(f"State:        {state['status']}")
    print(f"Campaign:     {state['campaign_id']}")
    print(f"Controller:   {state.get('controller_pid') or '—'}")
    print(f"Alive:        {state.get('process_alive', False)}")
    print(f"V1 source:    {state.get('v1_release_sha')}")
    print(f"V2 target:    {state.get('target_source_sha') or '—'}")
    print(f"Last error:   {state.get('last_error') or '—'}")
    print(f"Log:          {state.get('log_path')}")
    print(f"Receipt:      {state.get('last_transition_receipt') or '—'}")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="aoe2war storage handoff",
        description=(
            "Resumable terminal-independent Storage OS V1->V2 handoff. "
            "Every takeover state is durably receipted and Wolo remains observe-only."
        ),
    )
    sub = p.add_subparsers(dest="command", required=True)

    q = sub.add_parser("start")
    q.add_argument("--campaign-id")
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
        return run_handoff(args.handoff_id)

    if args.command == "start":
        payload = start(args.campaign_id)
    elif args.command == "status":
        payload = status_payload(args.handoff_id)
    elif args.command == "resume":
        selected = args.handoff_id or latest_handoff_id()
        if not selected:
            raise HandoffError("no Storage OS handoff exists")
        payload = resume(selected)
    else:
        raise HandoffError(f"unknown handoff command: {args.command}")

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
