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

WOLO_REMOTE_SCRIPT = r"""set -euo pipefail
NODE="wolochaind-mainnet.service"
RPC="http://127.0.0.1:27657"

service="$(systemctl is-active "$NODE")"
pid="$(systemctl show "$NODE" -p MainPID --value)"
restarts="$(systemctl show "$NODE" -p NRestarts --value)"
active_enter="$(systemctl show "$NODE" -p ActiveEnterTimestampMonotonic --value)"
w8092="$(ss -ltn | grep -Ec ':8092[[:space:]]' || true)"
w8093="$(ss -ltn | grep -Ec ':8093[[:space:]]' || true)"
rpc1="$(curl -fsS --max-time 4 "$RPC/status")"
sleep 6
rpc2="$(curl -fsS --max-time 4 "$RPC/status")"

python3 - "$service" "$pid" "$restarts" "$active_enter" "$w8092" "$w8093" "$rpc1" "$rpc2" <<'PY'
import datetime as dt
import json
import sys

service, pid, restarts, active_enter, w8092, w8093, raw1, raw2 = sys.argv[1:]
one = json.loads(raw1)["result"]["sync_info"]
two = json.loads(raw2)["result"]["sync_info"]
h1 = int(one["latest_block_height"])
h2 = int(two["latest_block_height"])
stamp = dt.datetime.fromisoformat(two["latest_block_time"].replace("Z", "+00:00"))
age = int((dt.datetime.now(dt.timezone.utc) - stamp).total_seconds())
print(json.dumps({
    "service": service,
    "pid": int(pid),
    "restart_counter": int(restarts),
    "active_enter_monotonic": int(active_enter),
    "listener_8092_count": int(w8092),
    "listener_8093_count": int(w8093),
    "height_before": h1,
    "height_after": h2,
    "block_age_seconds": age,
}, sort_keys=True))
PY
"""

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
    encoded = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    try:
        with tmp.open("w", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
        try:
            directory_fd = os.open(path.parent, os.O_RDONLY)
        except OSError:
            directory_fd = None
        if directory_fd is not None:
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    finally:
        tmp.unlink(missing_ok=True)


def transition_receipt_dir(handoff_id: str) -> Path:
    state_path(handoff_id)
    return HANDOFF_DIR / f"{handoff_id}.receipts"


def transition_receipt_path(handoff_id: str, target: str) -> Path:
    if target not in FLOW:
        raise HandoffError(f"invalid handoff receipt state: {target}")
    index = FLOW.index(target) + 1
    return transition_receipt_dir(handoff_id) / f"{index:02d}-{target}.json"


def write_transition_receipt(
    *,
    handoff_id: str,
    source: str | None,
    target: str,
    evidence: dict[str, Any],
) -> tuple[Path, str, dict[str, Any]]:
    path = transition_receipt_path(handoff_id, target)
    path.parent.mkdir(parents=True, exist_ok=True)

    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise HandoffError(f"invalid existing handoff receipt: {path}") from exc
        if (
            existing.get("schema") != 1
            or existing.get("kind") != "aoe2war-storage-handoff-transition"
            or existing.get("handoff_id") != handoff_id
            or existing.get("from") != source
            or existing.get("to") != target
        ):
            raise HandoffError(f"existing handoff receipt identity mismatch: {path}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        return path, digest, existing

    payload = {
        "schema": 1,
        "kind": "aoe2war-storage-handoff-transition",
        "handoff_id": handoff_id,
        "from": source,
        "to": target,
        "created_at": utc_now(),
        "evidence": evidence,
    }
    encoded = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    try:
        with path.open("x", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(path, 0o444)
        try:
            directory_fd = os.open(path.parent, os.O_RDONLY)
        except OSError:
            directory_fd = None
        if directory_fd is not None:
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    except FileExistsError:
        return write_transition_receipt(
            handoff_id=handoff_id,
            source=source,
            target=target,
            evidence=evidence,
        )
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return path, digest, payload


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


def process_table() -> dict[int, dict[str, Any]]:
    proc = subprocess.run(
        ["ps", "-ww", "-axo", "pid=,ppid=,pgid=,command="],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        raise HandoffError(
            "cannot inspect process table: " + (proc.stderr or "ps failed")[-1000:]
        )
    rows: dict[int, dict[str, Any]] = {}
    for raw in proc.stdout.splitlines():
        parts = raw.strip().split(None, 3)
        if len(parts) < 3:
            continue
        try:
            pid, ppid, pgid = map(int, parts[:3])
        except ValueError:
            continue
        rows[pid] = {
            "pid": pid,
            "ppid": ppid,
            "pgid": pgid,
            "command": parts[3] if len(parts) > 3 else "",
        }
    return rows


def process_family(pid: int | None) -> dict[str, Any]:
    if not isinstance(pid, int) or pid <= 0:
        return {"pid": None, "pgid": None, "descendants": []}
    rows = process_table()
    root = rows.get(pid)
    if root is None:
        return {"pid": pid, "pgid": None, "descendants": []}

    descendant_pids: list[int] = []
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
            descendant_pids.append(child)
            frontier.append(child)

    def identity(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "pid": int(row["pid"]),
            "ppid": int(row["ppid"]),
            "pgid": int(row["pgid"]),
            "command": str(row.get("command") or ""),
        }

    return {
        **identity(root),
        "descendants": [identity(rows[child]) for child in descendant_pids],
    }


def same_process_identity(current: dict[str, Any], recorded: dict[str, Any]) -> bool:
    return bool(
        int(current.get("pid") or 0) == int(recorded.get("pid") or 0)
        and int(current.get("pgid") or 0) == int(recorded.get("pgid") or 0)
        and str(current.get("command") or "") == str(recorded.get("command") or "")
    )


def recorded_process_alive(recorded: dict[str, Any] | None) -> bool:
    if not isinstance(recorded, dict):
        return False
    pid = recorded.get("pid")
    if not isinstance(pid, int) or pid <= 0:
        return False
    current = process_table().get(pid)
    return bool(current is not None and same_process_identity(current, recorded))


def capture_process_identity(
    pid: int,
    *,
    required_tokens: tuple[str, ...] = (),
    attempts: int = 20,
) -> dict[str, Any]:
    for _ in range(attempts):
        row = process_table().get(pid)
        command = str((row or {}).get("command") or "")
        if row is not None and all(token in command for token in required_tokens):
            return {
                "pid": int(row["pid"]),
                "ppid": int(row["ppid"]),
                "pgid": int(row["pgid"]),
                "command": command,
            }
        time.sleep(0.05)
    raise HandoffError(
        f"cannot bind process identity for pid={pid} "
        f"tokens={list(required_tokens)}"
    )


def recorded_family_dead(snapshot: dict[str, Any]) -> bool:
    rows = process_table()
    members: list[dict[str, Any]] = []
    if isinstance(snapshot.get("pid"), int):
        members.append(snapshot)
    for value in snapshot.get("descendants") or []:
        if isinstance(value, dict) and isinstance(value.get("pid"), int):
            members.append(value)

    for recorded in members:
        pid = int(recorded["pid"])
        current = rows.get(pid)
        if current is not None and same_process_identity(current, recorded):
            return False
    return True


def live_campaign_controller(campaign_id: str) -> dict[str, Any] | None:
    matches = [
        row
        for row in process_table().values()
        if (
            "aoe2_storage_campaign.py" in str(row.get("command") or "")
            and "_run" in str(row.get("command") or "")
            and campaign_id in str(row.get("command") or "")
        )
    ]
    if len(matches) > 1:
        raise HandoffError(
            f"multiple live Storage campaign controllers match {campaign_id}: "
            + ", ".join(str(row.get("pid")) for row in matches)
        )
    return matches[0] if matches else None


def prove_v2_campaign_adoption(
    campaign_id: str,
    *,
    release_sha: str,
    build_id: str,
    expected_pid: int | None = None,
    attempts: int = 40,
) -> dict[str, Any]:
    last: dict[str, Any] = {}
    for _ in range(attempts):
        current = campaign.load_state(campaign_id)
        last = current
        if (
            current.get("release_sha") != release_sha
            or current.get("build_id") != build_id
        ):
            raise HandoffError(
                "V2 campaign authority drifted during adoption proof: "
                f"campaign={current.get('release_sha')}:{current.get('build_id')} "
                f"expected={release_sha}:{build_id}"
            )

        live = live_campaign_controller(campaign_id)
        if live is not None:
            live_pid = int(live["pid"])
            if expected_pid is not None and live_pid != expected_pid:
                raise HandoffError(
                    "V2 campaign resumed under an unexpected controller PID: "
                    f"expected={expected_pid} observed={live_pid}"
                )
            return {
                "mode": "LIVE_V2_CONTROLLER",
                "pid": live_pid,
                "status": current.get("status"),
                "resumed_at": current.get("resumed_at"),
            }

        status = str(current.get("status") or "")
        if current.get("resumed_at") and status in {
            "COMPLETE",
            "FAILED",
            "BLOCKED",
            "PAUSED",
        }:
            return {
                "mode": "TERMINAL_V2_RUN",
                "pid": current.get("pid"),
                "status": status,
                "resumed_at": current.get("resumed_at"),
                "completion_reason": current.get("completion_reason"),
                "last_error": current.get("last_error"),
            }

        time.sleep(0.1)

    raise HandoffError(
        "V2 campaign adoption was not proven after resume: "
        f"status={last.get('status')} pid={last.get('pid')} "
        f"resumed_at={last.get('resumed_at')}"
    )


def wolo_snapshot() -> dict[str, Any]:
    host = str(storage.policy()["root_maintenance_host"])
    proc = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", host, "bash", "-s"],
        input=WOLO_REMOTE_SCRIPT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=30,
    )
    if proc.returncode != 0:
        raise HandoffError(
            "cannot prove Wolo continuity: "
            + (proc.stderr or proc.stdout or "remote snapshot failed")[-1500:]
        )
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise HandoffError("Wolo continuity snapshot returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise HandoffError("Wolo continuity snapshot returned a non-object")
    if payload.get("service") != "active":
        raise HandoffError("Wolo node service is not active")
    if payload.get("listener_8092_count") != 1:
        raise HandoffError("Wolo listener 8092 count is not exactly one")
    if payload.get("listener_8093_count") != 1:
        raise HandoffError("Wolo listener 8093 count is not exactly one")
    if int(payload.get("pid") or 0) <= 0:
        raise HandoffError("Wolo node PID is invalid")
    if int(payload.get("restart_counter") or 0) < 0:
        raise HandoffError("Wolo restart counter is invalid")
    if int(payload.get("active_enter_monotonic") or 0) <= 0:
        raise HandoffError("Wolo active-enter identity is invalid")
    if int(payload.get("height_after") or 0) <= int(payload.get("height_before") or 0):
        raise HandoffError("Wolo chain did not advance during continuity snapshot")
    if int(payload.get("block_age_seconds") or 999999) > 20:
        raise HandoffError("Wolo latest block is stale")
    return payload


def verify_wolo_continuity(
    before: dict[str, Any],
    after: dict[str, Any],
) -> None:
    for key in ("pid", "restart_counter", "active_enter_monotonic"):
        if after.get(key) != before.get(key):
            raise HandoffError(
                f"Wolo continuity changed {key}: before={before.get(key)} "
                f"after={after.get(key)}"
            )
    if int(after.get("height_after") or 0) < int(before.get("height_after") or 0):
        raise HandoffError(
            "Wolo chain height regressed across Storage handoff: "
            f"before={before.get('height_after')} after={after.get('height_after')}"
        )


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
    tracking = git_output("rev-parse", "origin/main")
    live_remote = git_output("ls-remote", "origin", "refs/heads/main")
    parts = live_remote.split()
    if (
        len(parts) != 2
        or len(parts[0]) != 40
        or any(ch not in "0123456789abcdef" for ch in parts[0])
        or parts[1] != "refs/heads/main"
    ):
        raise HandoffError(f"cannot prove live GitHub main: {live_remote!r}")
    remote = parts[0]
    if tracking != remote:
        raise HandoffError(
            f"local origin/main is stale: tracking={tracking} live={remote}; "
            "fetch canonical main before handoff"
        )
    if head != remote:
        raise HandoffError(f"local HEAD {head} != live origin/main {remote}")
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
    proof = evidence or {}
    receipt_path, receipt_sha256, receipt = write_transition_receipt(
        handoff_id=str(state["handoff_id"]),
        source=current or None,
        target=target,
        evidence=proof,
    )
    history = list(state.get("history") or [])
    history.append(
        {
            "from": current or None,
            "to": target,
            "at": receipt.get("created_at"),
            "evidence": receipt.get("evidence") or {},
            "receipt_path": str(receipt_path),
            "receipt_sha256": receipt_sha256,
        }
    )
    state["status"] = target
    state["history"] = history
    state["last_transition_receipt"] = str(receipt_path)
    state["last_transition_receipt_sha256"] = receipt_sha256
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
    status = str(existing.get("status") or "")
    if status not in {"RUNNING", "RUNNING_TRANSACTION"}:
        raise HandoffError(
            f"campaign {campaign_id} is not a live V1 controller: "
            f"status={status or 'unknown'}; start/resume the campaign first"
        )
    pid = existing.get("pid")
    if not isinstance(pid, int) or not process_alive(pid):
        raise HandoffError(
            f"campaign {campaign_id} has no live V1 controller PID"
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
    family = process_family(pid)
    root_command = str(family.get("command") or "")
    if (
        family.get("pgid") is None
        or "aoe2_storage_campaign.py" not in root_command
        or "_run" not in root_command
        or campaign_id not in root_command
    ):
        raise HandoffError(
            "live V1 controller process identity does not match the exact "
            f"Storage campaign: pid={pid} command={root_command!r}"
        )

    wolo_before = wolo_snapshot()
    handoff_id = f"{stamp()}-{campaign_id}-{target_source[:12]}"
    created_at = utc_now()
    initial_evidence = {
        "campaign_status": existing.get("status"),
        "campaign_release_sha": existing.get("release_sha"),
        "campaign_build_id": existing.get("build_id"),
        "process_family": family,
        "target_source_sha": target_source,
        "wolo": wolo_before,
    }
    receipt_path, receipt_sha256, receipt = write_transition_receipt(
        handoff_id=handoff_id,
        source=None,
        target="V1_RUNNING",
        evidence=initial_evidence,
    )
    payload = {
        "schema": 1,
        "kind": "aoe2war-storage-handoff",
        "handoff_id": handoff_id,
        "campaign_id": campaign_id,
        "status": "V1_RUNNING",
        "created_at": created_at,
        "updated_at": created_at,
        "old_release_sha": current_release,
        "old_build_id": current_build,
        "target_source_sha": target_source,
        "new_release_sha": None,
        "new_build_id": None,
        "v1_process_family": family,
        "wolo_before": wolo_before,
        "wolo_after_certification": None,
        "wolo_after_resume": None,
        "wolo_mutated": False,
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
                "at": receipt.get("created_at"),
                "evidence": receipt.get("evidence") or {},
                "receipt_path": str(receipt_path),
                "receipt_sha256": receipt_sha256,
            }
        ],
        "last_transition_receipt": str(receipt_path),
        "last_transition_receipt_sha256": receipt_sha256,
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
    state["runner_process_identity"] = None
    state["runner_started_at"] = utc_now()
    state["runner_identity_error"] = None
    save_state(state)
    try:
        runner_identity = capture_process_identity(
            int(proc.pid),
            required_tokens=("aoe2_storage_handoff.py", "_run", handoff_id),
        )
    except Exception as exc:
        state["runner_identity_error"] = str(exc)
        save_state(state)
        raise
    state["runner_process_identity"] = runner_identity
    state["runner_identity_error"] = None
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
    state["finish_process_identity"] = None
    state["finish_started_at"] = utc_now()
    state["finish_returncode"] = None
    state["finish_identity_error"] = None
    save_state(state)
    try:
        finish_identity = capture_process_identity(
            int(proc.pid),
            required_tokens=("aoe2_finish.py", str(state["handoff_id"])),
        )
    except Exception as exc:
        state["finish_identity_error"] = str(exc)
        save_state(state)
        raise
    state["finish_process_identity"] = finish_identity
    state["finish_identity_error"] = None
    save_state(state)
    return proc


def seal_finish_log(state: dict[str, Any]) -> None:
    path = finish_log_path(str(state["handoff_id"]))
    if path.is_file():
        state["finish_log_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()


def finish_receipt_for_target(
    target_source: str,
    *,
    not_before: str | None = None,
) -> tuple[Path, dict[str, Any]] | None:
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
        certified_at = str(payload.get("release_certified_at") or "")
        if not_before and (not certified_at or certified_at < not_before):
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
    found = finish_receipt_for_target(
        target,
        not_before=str(state.get("created_at") or "") or None,
    )
    if found is None:
        raise HandoffError(
            "target runtime is certified but no exact CERTIFIED Finish receipt "
            "proves maintenance-runner reconciliation"
        )
    path, payload = found

    maintenance = payload.get("maintenance_runner_reconciliation") or {}
    final_release = payload.get("final_release") or payload.get("certified_release") or {}
    production = (
        final_release.get("production") or {}
        if isinstance(final_release, dict)
        else {}
    )
    try:
        wolo_pid = int(maintenance["wolo_pid"])
        wolo_restarts = int(maintenance["wolo_restart_counter"])
        height_before = int(maintenance["wolo_height_before"])
        height_after = int(maintenance["wolo_height_after"])
        listener_8092 = int(production["wolo_8092_count"])
        listener_8093 = int(production["wolo_8093_count"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HandoffError(
            "certified Finish receipt lacks exact Wolo PID/restart/height/listener evidence"
        ) from exc
    if (
        wolo_pid <= 0
        or wolo_restarts < 0
        or height_before <= 0
        or height_after <= height_before
        or listener_8092 != 1
        or listener_8093 != 1
    ):
        raise HandoffError(
            "certified Finish receipt does not prove protected Wolo continuity: "
            f"pid={wolo_pid} restarts={wolo_restarts} "
            f"height={height_before}->{height_after} "
            f"listeners=8092:{listener_8092},8093:{listener_8093}"
        )

    state["finish_receipt_path"] = str(path)
    state["finish_receipt_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    state["finish_release_certified_at"] = payload.get("release_certified_at")
    state["wolo_continuity"] = {
        "pid": wolo_pid,
        "restart_counter": wolo_restarts,
        "height_before": height_before,
        "height_after": height_after,
        "listener_8092_count": listener_8092,
        "listener_8093_count": listener_8093,
        "wolo_mutated_by_handoff": False,
    }
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
        try:
            bind_finish_receipt(state)
        except HandoffError:
            # The target can be live after a Finish that certified activation
            # but failed a later closure check. Target-live alone is not handoff
            # authority: rerun canonical Finish to complete and seal the exact
            # post-handoff CERTIFIED receipt instead of deadlocking recovery.
            pass
        else:
            return current_release, current_build

    finish_pid = state.get("finish_pid")
    finish_identity = state.get("finish_process_identity")
    if isinstance(finish_pid, int) and recorded_process_alive(
        finish_identity if isinstance(finish_identity, dict) else None
    ):
        while recorded_process_alive(
            finish_identity if isinstance(finish_identity, dict) else None
        ):
            time.sleep(2)
        state = load_state(str(state["handoff_id"]))
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
    elif isinstance(finish_pid, int) and process_alive(finish_pid):
        raise HandoffError(
            "Finish PID is alive but exact process identity is unavailable or "
            "mismatched; refusing to launch a duplicate Finish. Wait for that "
            "PID to exit, then resume the same handoff."
        )

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
                if not recorded_family_dead(state.get("v1_process_family") or {}):
                    raise HandoffError(
                        "V1 process family is still alive at the transaction seam; "
                        "handoff will not overlap the archive controller or its descendants"
                    )
                transition(
                    state,
                    "TRANSACTION_SEAM_PROVEN",
                    evidence={
                        "current_generation": current.get("current_generation"),
                        "current_generation_started_at": current.get(
                            "current_generation_started_at"
                        ),
                        "controller_pid": current.get("pid"),
                        "v1_process_family_dead": True,
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
                wolo_after = wolo_snapshot()
                verify_wolo_continuity(
                    state.get("wolo_before") or {},
                    wolo_after,
                )
                state["wolo_after_certification"] = wolo_after
                state["wolo_mutated"] = False
                save_state(state)
                transition(
                    state,
                    "V2_CERTIFIED",
                    evidence={
                        "release_sha": release,
                        "build_id": build,
                        "wolo_before": state.get("wolo_before"),
                        "wolo_after": wolo_after,
                        "wolo_mutated": False,
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

                current_campaign = campaign.load_state(campaign_id)
                if (
                    current_campaign.get("release_sha") != release
                    or current_campaign.get("build_id") != build
                ):
                    raise HandoffError(
                        "V2 campaign authority drifted after handoff rebind"
                    )

                recovered_controller = live_campaign_controller(campaign_id)
                if recovered_controller is not None:
                    expected_pid = int(recovered_controller["pid"])
                    adoption = prove_v2_campaign_adoption(
                        campaign_id,
                        release_sha=release,
                        build_id=build,
                        expected_pid=expected_pid,
                    )
                    resumed_pid = adoption.get("pid")
                    resume_mode = "RECOVERED_LIVE_V2_CONTROLLER"
                elif current_campaign.get("resumed_at"):
                    adoption = prove_v2_campaign_adoption(
                        campaign_id,
                        release_sha=release,
                        build_id=build,
                    )
                    resumed_pid = adoption.get("pid")
                    resume_mode = "RECOVERED_TERMINAL_V2_RUN"
                else:
                    resumed = campaign.resume(campaign_id)
                    spawned_pid = resumed.get("spawned_pid")
                    expected_pid = (
                        int(spawned_pid)
                        if isinstance(spawned_pid, int)
                        else None
                    )
                    adoption = prove_v2_campaign_adoption(
                        campaign_id,
                        release_sha=release,
                        build_id=build,
                        expected_pid=expected_pid,
                    )
                    resumed_pid = adoption.get("pid")
                    resume_mode = "SPAWNED_AND_PROVEN_V2_CONTROLLER"

                state = load_state(handoff_id)
                state["resumed_pid"] = resumed_pid
                state["v2_campaign_adoption"] = adoption
                wolo_after_resume = wolo_snapshot()
                verify_wolo_continuity(
                    state.get("wolo_before") or {},
                    wolo_after_resume,
                )
                state["wolo_after_resume"] = wolo_after_resume
                state["wolo_mutated"] = False
                save_state(state)
                transition(
                    state,
                    "V2_RESUMED",
                    evidence={
                        "new_release_sha": release,
                        "new_build_id": build,
                        "resumed_pid": resumed_pid,
                        "resume_mode": resume_mode,
                        "v2_campaign_adoption": adoption,
                        "wolo_after_resume": wolo_after_resume,
                        "wolo_mutated": False,
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
    runner_identity = state.get("runner_process_identity")
    if recorded_process_alive(
        runner_identity if isinstance(runner_identity, dict) else None
    ):
        return state
    if isinstance(runner_pid, int) and process_alive(runner_pid):
        raise HandoffError(
            "handoff runner PID is alive but its recorded process identity no "
            "longer matches; refusing to treat a reused PID as the handoff"
        )
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
    runner_identity = state.get("runner_process_identity")
    finish_identity = state.get("finish_process_identity")
    state["runner_alive"] = recorded_process_alive(
        runner_identity if isinstance(runner_identity, dict) else None
    )
    state["finish_alive"] = recorded_process_alive(
        finish_identity if isinstance(finish_identity, dict) else None
    )
    state["runner_pid_present_but_identity_mismatch"] = bool(
        isinstance(runner_pid, int)
        and process_alive(runner_pid)
        and not state["runner_alive"]
    )
    state["finish_pid_present_but_identity_mismatch"] = bool(
        isinstance(finish_pid, int)
        and process_alive(finish_pid)
        and not state["finish_alive"]
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
    wolo = (
        state.get("wolo_after_resume")
        or state.get("wolo_after_certification")
        or state.get("wolo_before")
        or {}
    )
    print(
        "Wolo:          "
        f"pid={wolo.get('pid') or '—'} "
        f"restarts={wolo.get('restart_counter') if wolo.get('restart_counter') is not None else '—'} "
        f"height={wolo.get('height_after') or '—'} "
        f"mutated={state.get('wolo_mutated', False)}"
    )
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
