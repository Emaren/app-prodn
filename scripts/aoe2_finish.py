#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
import fcntl
import hashlib
import json
import os
import re
import shutil
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import aoe2_audit
import aoe2_doctor
import aoe2_release
import aoe2_update

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "bin" / "aoe2war"
STATE_DIR = ROOT / ".aoe2war-release"
FINISH_LOCK = STATE_DIR / "finish.lock"
RECEIPT_DIR = STATE_DIR / "finish-receipts"
ADOPTION_DIR = STATE_DIR / "vps-adoptions"

DEFAULT_BRANCH = "main"
ROOT_SSH = os.getenv("AOE2_FINISH_ROOT_SSH", "root@hel1")

SENSITIVE_PATTERNS = (
    re.compile(r"(^|/)\.env($|[.])", re.IGNORECASE),
    re.compile(r"(^|/)(id_rsa|id_ed25519)(\.|$)", re.IGNORECASE),
    re.compile(r"(^|/).*\.pem$", re.IGNORECASE),
    re.compile(r"(^|/).*\.p12$", re.IGNORECASE),
    re.compile(r"(^|/)os-bridge-token$", re.IGNORECASE),
)


class FinishError(RuntimeError):
    pass


@dataclass(frozen=True)
class SourcePlan:
    mode: str
    detail: str


class Progress:
    def __init__(self, *, enabled: bool = True) -> None:
        self.started = time.monotonic()
        self.enabled = enabled

    def emit(self, symbol: str, text: str) -> None:
        if not self.enabled:
            return
        elapsed = int(time.monotonic() - self.started)
        minutes, seconds = divmod(elapsed, 60)
        print(f"[{minutes:02d}:{seconds:02d}] {symbol} {text}", flush=True)

    def start(self, text: str) -> None:
        self.emit("→", text)

    def done(self, text: str) -> None:
        self.emit("✓", text)

    def wait(self, text: str) -> None:
        self.emit("…", text)


def run(
    args: list[str],
    *,
    cwd: Path = ROOT,
    timeout: int = 120,
    capture: bool = True,
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            args,
            cwd=str(cwd),
            text=True,
            stdout=subprocess.PIPE if capture else None,
            stderr=subprocess.STDOUT if capture else None,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise FinishError(
            f"command timed out after {timeout}s: {shlex.join(args)}"
        ) from exc


def is_production_checkout() -> bool:
    forced = os.getenv("AOE2_FINISH_HOST_ROLE", "").strip().lower()
    if forced:
        if forced not in {"operator", "production"}:
            raise FinishError(
                "AOE2_FINISH_HOST_ROLE must be 'operator' or 'production'"
            )
        return forced == "production"
    try:
        contract = aoe2_doctor.load_contract()
        production_repo = Path(str(contract["canonical"]["production_repo"]))
    except Exception as exc:
        raise FinishError(f"cannot resolve host role from operations contract: {exc}") from exc
    return ROOT.resolve() == production_repo.resolve()


def parse_environment_value(path: Path, key: str) -> str | None:
    try:
        text = path.read_text(encoding="utf-8")
    except PermissionError:
        process = run(
            ["sudo", "-n", "/usr/bin/cat", str(path)],
            cwd=ROOT,
            timeout=10,
        )
        if process.returncode != 0:
            return None
        text = process.stdout or ""
    except FileNotFoundError:
        return None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        name, separator, raw_value = line.partition("=")
        if separator and name.strip() == key:
            value = raw_value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
                value = value[1:-1]
            return value or None
    return None


def production_bridge_request(
    *,
    base_url: str,
    token: str,
    payload: dict[str, Any],
    timeout: int = 30,
) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        base_url.rstrip("/") + "/api/internal/aoe2war-os/bridge",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-aoe2war-os-key": token,
            "User-Agent": "AoE2WAR-Production-Finish/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            value = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise FinishError(
            f"Operator Bridge API HTTP {exc.code}: {detail[:1200]}"
        ) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise FinishError(f"Operator Bridge API unavailable: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise FinishError("Operator Bridge API returned invalid JSON") from exc
    if not isinstance(value, dict):
        raise FinishError("Operator Bridge API returned a non-object response")
    return value


def delegate_finish_from_production(
    *,
    message: str,
    dry_run: bool,
    json_mode: bool,
) -> int:
    contract = aoe2_doctor.load_contract()
    canonical = contract["canonical"]
    env_file = Path(str(canonical["bridge_env_file"]))
    token = os.getenv("AOE2WAR_OS_BRIDGE_TOKEN", "").strip()
    if not token:
        token = parse_environment_value(env_file, "AOE2WAR_OS_BRIDGE_TOKEN") or ""
    if not token:
        raise FinishError(
            "cannot read the Operator Bridge credential on production; "
            f"verify {env_file} or passwordless scoped sudo access"
        )

    base_url = str(canonical["public_base_url"])
    queued = production_bridge_request(
        base_url=base_url,
        token=token,
        payload={
            "op": "queue_finish",
            "hostname": os.uname().nodename,
            "message": message,
            "dryRun": dry_run,
        },
    )
    run_value = queued.get("run")
    if not isinstance(run_value, dict) or not run_value.get("id"):
        raise FinishError("Operator Bridge did not return a queued finish run")
    run_id = str(run_value["id"])

    if not json_mode:
        print("⚔️  AOE2WAR FINISH · PRODUCTION DELEGATION", flush=True)
        print(
            f"Queued {run_id} on the canonical Mac source authority.",
            flush=True,
        )

    seen_events: set[str] = set()
    deadline = time.monotonic() + 3600
    transient_started: float | None = None
    while time.monotonic() < deadline:
        try:
            status_payload = production_bridge_request(
                base_url=base_url,
                token=token,
                payload={"op": "run_status", "runId": run_id},
            )
            transient_started = None
        except FinishError:
            # The web service is expected to be briefly unavailable while its
            # own release activates. A bounded retry preserves the delegation.
            if transient_started is None:
                transient_started = time.monotonic()
            if time.monotonic() - transient_started > 120:
                raise
            time.sleep(2)
            continue

        events = status_payload.get("events")
        if not json_mode and isinstance(events, list):
            for event in events:
                if not isinstance(event, dict):
                    continue
                event_id = str(event.get("id") or "")
                if not event_id or event_id in seen_events:
                    continue
                seen_events.add(event_id)
                print(str(event.get("message") or ""), flush=True)

        run_state = status_payload.get("run")
        if not isinstance(run_state, dict):
            raise FinishError("Operator Bridge run status is malformed")
        status = str(run_state.get("status") or "")
        if status in {"succeeded", "failed", "cancelled"}:
            result = run_state.get("result")
            exit_code = run_state.get("exitCode")
            normalized_exit = int(exit_code) if isinstance(exit_code, int) else 2
            if json_mode:
                if isinstance(result, dict):
                    payload = {
                        **result,
                        "delegated_from_production": True,
                        "control_run_id": run_id,
                    }
                else:
                    payload = {
                        "status": status.upper(),
                        "delegated_from_production": True,
                        "control_run_id": run_id,
                        "result": result,
                        "error": run_state.get("error"),
                    }
                print(json.dumps(payload, indent=2, sort_keys=True))
            elif status != "succeeded":
                print(
                    "STOP: delegated finish failed: "
                    + str(run_state.get("error") or status),
                    file=sys.stderr,
                )
            return normalized_exit

        time.sleep(2)

    raise FinishError(f"delegated finish {run_id} exceeded the 60-minute limit")


def reload_operator_bridge_after_release(progress: Progress) -> dict[str, Any]:
    delegated_run = os.getenv("AOE2WAR_OPERATOR_BRIDGE_RUN_ID", "").strip()
    if delegated_run:
        progress.done("Operator Bridge will self-reload after this delegated run")
        return {
            "status": "PARENT_SELF_RELOAD_PENDING",
            "run_id": delegated_run,
        }
    if sys.platform != "darwin":
        return {"status": "SKIPPED_NON_DARWIN"}

    contract = aoe2_doctor.load_contract()
    label = str(contract["canonical"]["bridge_launchagent_label"])
    target = f"gui/{os.getuid()}/{label}"
    progress.start("Reloading Operator Bridge onto the released control contract...")
    process = run(
        ["launchctl", "kickstart", "-k", target],
        timeout=30,
    )
    if process.returncode != 0:
        raise FinishError(
            "cannot reload persistent Operator Bridge: "
            + (process.stdout or "unknown launchctl failure")[-2000:]
        )
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        state = run(["launchctl", "print", target], timeout=10)
        if state.returncode == 0 and "state = running" in (state.stdout or ""):
            progress.done("Operator Bridge reloaded and running")
            return {"status": "RELOADED", "launchagent": target}
        time.sleep(1)
    raise FinishError("Operator Bridge did not return to running state after reload")


def run_live(
    args: list[str],
    *,
    label: str,
    progress: Progress,
    timeout: int = 1800,
    json_mode: bool = False,
) -> str:
    progress.start(label)
    if json_mode:
        process = run(args, timeout=timeout, capture=True)
        output = process.stdout or ""
    else:
        try:
            process = subprocess.run(
                args,
                cwd=str(ROOT),
                text=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise FinishError(
                f"{label} timed out after {timeout}s"
            ) from exc
        output = ""

    if process.returncode != 0:
        detail = output[-12000:] if output else f"exit={process.returncode}"
        raise FinishError(f"{label} failed: {detail}")
    progress.done(label + " passed")
    return output


def run_capture_with_heartbeat(
    args: list[str],
    *,
    label: str,
    progress: Progress,
    timeout: int,
    heartbeat_seconds: float = 15.0,
) -> tuple[int, str]:
    import tempfile

    started = time.monotonic()
    with tempfile.TemporaryFile(mode="w+t", encoding="utf-8") as capture:
        process = subprocess.Popen(
            args,
            cwd=str(ROOT),
            text=True,
            stdout=capture,
            stderr=subprocess.STDOUT,
        )
        deadline = started + timeout

        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                process.kill()
                process.wait()
                capture.seek(0)
                return 124, capture.read()

            try:
                rc = process.wait(timeout=min(heartbeat_seconds, remaining))
                capture.seek(0)
                return rc, capture.read()
            except subprocess.TimeoutExpired:
                progress.wait(label + " still running")


def git_output(*args: str) -> str:
    process = run(["git", *args], timeout=60)
    if process.returncode != 0:
        raise FinishError(
            f"git {' '.join(args)} failed: {(process.stdout or '').strip()}"
        )
    return (process.stdout or "").strip()


def decode_nul_paths(
    payload: bytes,
) -> list[str]:
    return [
        raw.decode(
            "utf-8",
            "surrogateescape",
        )
        for raw in payload.split(
            b"\0"
        )
        if raw
    ]


def git_paths() -> list[str]:
    # Return every staged, unstaged and untracked path without
    # fixed-character porcelain slicing.
    commands = (
        [
            "git",
            "diff",
            "--name-only",
            "-z",
        ],
        [
            "git",
            "diff",
            "--cached",
            "--name-only",
            "-z",
        ],
        [
            "git",
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
        ],
    )

    paths: set[str] = set()

    for args in commands:
        process = subprocess.run(
            args,
            cwd=str(ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        if process.returncode != 0:
            raise FinishError(
                "git path inventory failed for "
                + shlex.join(args)
                + ": "
                + process.stderr.decode(
                    "utf-8",
                    "replace",
                )[-4000:]
            )

        paths.update(
            decode_nul_paths(
                process.stdout
            )
        )

    return sorted(
        paths
    )


def is_ancestor(older: str, newer: str) -> bool:
    process = run(["git", "merge-base", "--is-ancestor", older, newer])
    return process.returncode == 0


def remote_branch_sha(branch: str = DEFAULT_BRANCH) -> str:
    process = run(
        [
            "git",
            "ls-remote",
            "--exit-code",
            "origin",
            f"refs/heads/{branch}",
        ],
        timeout=30,
    )
    if process.returncode != 0 or not (process.stdout or "").strip():
        raise FinishError(f"cannot resolve origin/{branch}")
    return (process.stdout or "").split()[0]


def source_plan(
    *,
    local_dirty: int,
    production_dirty: int,
    local_head: str,
    github_head: str,
    production_head: str,
) -> SourcePlan:
    if local_dirty and production_dirty:
        raise FinishError(
            "both Mac and production have unpublished work; "
            "refusing to choose an authority automatically"
        )

    if local_dirty:
        if local_head != github_head:
            raise FinishError(
                "Mac worktree is dirty while Mac HEAD differs from GitHub main; "
                "reconcile source history before automatic finish"
            )
        return SourcePlan(
            "local_worktree",
            "adopt the dirty Mac worktree as the source candidate",
        )

    if production_dirty:
        if local_head != github_head:
            raise FinishError(
                "production is dirty while Mac/GitHub are not at one exact base"
            )
        if production_head != local_head:
            raise FinishError(
                "production dirty work is based on a different source commit; "
                "automatic VPS adoption requires one exact shared base"
            )
        return SourcePlan(
            "vps_worktree",
            "capture the tracked VPS patch, prove it, adopt it on Mac, then "
            "restore production to its clean base before canonical deployment",
        )

    if local_head == github_head:
        return SourcePlan("clean", "Mac and GitHub already share one source authority")

    return SourcePlan(
        "history_reconcile",
        "reconcile clean committed Mac/GitHub history before maintenance",
    )


def is_sensitive_path(path: str) -> bool:
    normalized = path.replace("\\", "/")
    if normalized in {".env.example", ".env.production.example"}:
        return False
    return any(pattern.search(normalized) for pattern in SENSITIVE_PATTERNS)


def ensure_safe_candidate_paths(paths: list[str]) -> None:
    sensitive = [path for path in paths if is_sensitive_path(path)]
    if sensitive:
        raise FinishError(
            "refusing to auto-commit paths that look like secrets/config authority: "
            + ", ".join(sensitive)
        )

    oversized: list[str] = []
    for rel in paths:
        path = ROOT / rel
        if path.is_file() and path.stat().st_size > 50 * 1024 * 1024:
            oversized.append(rel)
    if oversized:
        raise FinishError(
            "refusing to auto-commit file(s) larger than 50 MiB: "
            + ", ".join(oversized)
        )


def ssh_text(
    host: str,
    command: str,
    *,
    timeout: int = 60,
) -> tuple[int, str]:
    process = run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            host,
            f"bash -lc {shlex.quote(command)}",
        ],
        timeout=timeout,
    )
    return process.returncode, process.stdout or ""


def production_capacity_snapshot() -> dict[str, Any]:
    contract = aoe2_doctor.load_contract()
    volume = str(contract["canonical"]["volume_mount"])
    script = (
        "import json,os;"
        "paths=['/'," + repr(volume) + "];"
        "out={};"
        "\nfor p in paths:\n"
        " v=os.statvfs(p); b=v.f_frsize or v.f_bsize; "
        "t=v.f_blocks*b; a=v.f_bavail*b; u=max(0,t-a); "
        "out[p]={'total_bytes':t,'available_bytes':a,"
        "'used_bytes':u,'used_percent':round((u*100.0/t) if t else 100.0,2)}\n"
        "print(json.dumps(out,sort_keys=True))"
    )
    rc, output = ssh_text(
        ROOT_SSH,
        "python3 -c " + shlex.quote(script),
        timeout=30,
    )
    if rc != 0:
        raise FinishError("cannot read production filesystem capacity: " + output[-2000:])
    try:
        payload = json.loads(output.strip())
    except json.JSONDecodeError as exc:
        raise FinishError(
            "production filesystem capacity returned invalid JSON: " + output[-2000:]
        ) from exc
    if not isinstance(payload, dict) or "/" not in payload or volume not in payload:
        raise FinishError("production filesystem capacity payload is incomplete")
    return {"root": payload["/"], "volume": payload[volume], "volume_path": volume}


def assert_capacity_headroom(snapshot: dict[str, Any]) -> None:
    contract = aoe2_doctor.load_contract()
    capacity = contract.get("capacity", {})
    root_warn = float(capacity.get("root_free_warn_gib") or 5.0)
    volume_critical = float(capacity.get("volume_used_critical_percent") or 92.0)

    root_available = int(snapshot["root"]["available_bytes"])
    root_available_gib = root_available / (1024 ** 3)
    if root_available_gib < root_warn:
        raise FinishError(
            "production root headroom is below the release floor: "
            f"{root_available_gib:.2f} GiB free < {root_warn:.2f} GiB"
        )

    volume_used = float(snapshot["volume"]["used_percent"])
    if volume_used >= volume_critical:
        raise FinishError(
            "production mounted volume is at/above the critical release threshold: "
            f"{volume_used:.2f}% >= {volume_critical:.2f}%"
        )


def capacity_human(snapshot: dict[str, Any]) -> str:
    root_gib = int(snapshot["root"]["available_bytes"]) / (1024 ** 3)
    volume_gib = int(snapshot["volume"]["available_bytes"]) / (1024 ** 3)
    volume_used = float(snapshot["volume"]["used_percent"])
    return (
        f"root {root_gib:.1f} GiB free · "
        f"volume {volume_gib:.1f} GiB free / {volume_used:.1f}% used"
    )


def vps_dirty_paths(host: str, repo: str) -> tuple[list[str], list[str]]:
    command = (
        f"cd {shlex.quote(repo)} && "
        "printf '%s\\n' __TRACKED__ && "
        "git diff --name-only HEAD && "
        "printf '%s\\n' __UNTRACKED__ && "
        "git ls-files --others --exclude-standard"
    )
    rc, output = ssh_text(host, command)
    if rc != 0:
        raise FinishError(f"cannot enumerate VPS candidate paths: {output}")

    tracked: list[str] = []
    untracked: list[str] = []
    mode: str | None = None
    for raw in output.splitlines():
        if raw == "__TRACKED__":
            mode = "tracked"
            continue
        if raw == "__UNTRACKED__":
            mode = "untracked"
            continue
        if not raw.strip():
            continue
        if mode == "tracked":
            tracked.append(raw)
        elif mode == "untracked":
            untracked.append(raw)

    return sorted(set(tracked)), sorted(set(untracked))


def file_manifest_local(paths: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for rel in paths:
        path = ROOT / rel
        if path.is_file():
            result[rel] = hashlib.sha256(path.read_bytes()).hexdigest()
        elif path.exists():
            result[rel] = "<non-file>"
        else:
            result[rel] = "<missing>"
    return result


def file_manifest_remote(
    host: str,
    repo: str,
    paths: list[str],
) -> dict[str, str]:
    lines = [
        f"cd {shlex.quote(repo)}",
        "set -e",
    ]
    for rel in paths:
        quoted = shlex.quote(rel)
        lines.append(
            f"if [ -f {quoted} ]; then "
            f"printf '%s\\t%s\\n' {shlex.quote(rel)} "
            f"\"$(sha256sum -- {quoted} | awk '{{print $1}}')\"; "
            f"elif [ -e {quoted} ]; then "
            f"printf '%s\\t%s\\n' {shlex.quote(rel)} '<non-file>'; "
            f"else printf '%s\\t%s\\n' {shlex.quote(rel)} '<missing>'; fi"
        )
    rc, output = ssh_text(host, "; ".join(lines), timeout=120)
    if rc != 0:
        raise FinishError(f"cannot hash VPS candidate files: {output}")

    result: dict[str, str] = {}
    for line in output.splitlines():
        if "\t" not in line:
            continue
        path, digest = line.split("\t", 1)
        result[path] = digest.strip()
    return result


def capture_vps_patch(
    *,
    host: str,
    repo: str,
    tracked_paths: list[str],
    base_sha: str,
    progress: Progress,
) -> dict[str, Any]:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    local_dir = ADOPTION_DIR / stamp
    local_dir.mkdir(parents=True, exist_ok=False)
    patch_path = local_dir / "candidate.patch"

    progress.start("Capturing exact tracked VPS candidate patch...")
    process = subprocess.run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            host,
            f"cd {shlex.quote(repo)} && git diff --binary --full-index HEAD",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=120,
        check=False,
    )
    if process.returncode != 0:
        raise FinishError(
            "VPS patch capture failed: "
            + process.stderr.decode("utf-8", "replace")[-4000:]
        )
    patch_path.write_bytes(process.stdout)
    patch_sha = hashlib.sha256(process.stdout).hexdigest()

    if not process.stdout:
        raise FinishError("VPS reports dirty state but exact tracked patch is empty")

    remote_manifest = file_manifest_remote(host, repo, tracked_paths)
    evidence = {
        "schema": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_sha": base_sha,
        "tracked_paths": tracked_paths,
        "patch_sha256": patch_sha,
        "remote_manifest": remote_manifest,
    }
    (local_dir / "capture.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    durable = (
        "/mnt/HC_Volume_105319120/aoe2war/"
        f"vps-adoptions/{stamp}"
    )
    command = (
        f"install -d -m 0750 -o root -g root {shlex.quote(durable)} && "
        f"cat > {shlex.quote(durable + '/candidate.patch')} && "
        f"chmod 0600 {shlex.quote(durable + '/candidate.patch')} && "
        f"printf '%s  candidate.patch\\n' {shlex.quote(patch_sha)} > "
        f"{shlex.quote(durable + '/candidate.patch.sha256')}"
    )
    root_copy = subprocess.run(
        ["ssh", ROOT_SSH, command],
        input=process.stdout,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=60,
        check=False,
    )
    if root_copy.returncode != 0:
        raise FinishError(
            "durable VPS-adoption evidence write failed: "
            + root_copy.stderr.decode("utf-8", "replace")[-4000:]
        )

    progress.done(
        f"VPS candidate captured · {len(tracked_paths)} path(s) · "
        f"{patch_sha[:12]}"
    )
    return {
        "stamp": stamp,
        "local_dir": str(local_dir),
        "patch_path": str(patch_path),
        "patch_sha256": patch_sha,
        "durable_dir": durable,
        "tracked_paths": tracked_paths,
        "remote_manifest": remote_manifest,
    }


def adopt_vps_candidate(
    data: dict[str, Any],
    *,
    progress: Progress,
    dry_run: bool,
) -> dict[str, Any]:
    production = data["production"]
    host = str(production["host"])
    repo = str(production["repo"])
    base_sha = str(production["source_sha"])

    tracked, untracked = vps_dirty_paths(host, repo)
    if untracked:
        raise FinishError(
            "VPS candidate contains untracked files. For safety, automatic "
            "VPS adoption currently accepts tracked-file edits only; move/add "
            "those files canonically on Mac first. Untracked: "
            + ", ".join(untracked)
        )
    if not tracked:
        raise FinishError("production dirty count is nonzero but no tracked candidate paths exist")

    ensure_safe_candidate_paths(tracked)

    if dry_run:
        return {
            "mode": "vps_worktree",
            "base_sha": base_sha,
            "tracked_paths": tracked,
            "untracked_paths": [],
            "dry_run": True,
        }

    capture = capture_vps_patch(
        host=host,
        repo=repo,
        tracked_paths=tracked,
        base_sha=base_sha,
        progress=progress,
    )
    patch_path = Path(capture["patch_path"])

    progress.start("Proving VPS patch applies exactly to canonical Mac base...")
    check = run(["git", "apply", "--check", str(patch_path)], timeout=60)
    if check.returncode != 0:
        raise FinishError(
            "captured VPS patch does not apply cleanly to Mac base: "
            + (check.stdout or "")[-4000:]
        )

    apply = run(["git", "apply", str(patch_path)], timeout=60)
    if apply.returncode != 0:
        raise FinishError(
            "captured VPS patch application failed: "
            + (apply.stdout or "")[-4000:]
        )

    local_manifest = file_manifest_local(tracked)
    if local_manifest != capture["remote_manifest"]:
        raise FinishError(
            "Mac/VPS file manifest differs after candidate adoption; "
            "VPS has NOT been cleaned"
        )

    local_paths = git_paths()
    if sorted(local_paths) != sorted(tracked):
        raise FinishError(
            "adopted Mac dirty paths differ from VPS tracked paths; "
            f"Mac={local_paths} VPS={tracked}"
        )
    progress.done("VPS candidate reproduced byte-for-byte on Mac")
    return capture


def gate_and_commit(
    *,
    message: str,
    progress: Progress,
    json_mode: bool,
) -> str:
    paths = git_paths()
    if not paths:
        return git_output("rev-parse", "HEAD")

    ensure_safe_candidate_paths(paths)

    run_live(
        [str(CLI), "gate"],
        label="Gating unpublished source candidate",
        progress=progress,
        timeout=1800,
        json_mode=json_mode,
    )

    progress.start(f"Committing {len(paths)} reviewed source path(s)...")
    add = run(["git", "add", "-A"], timeout=60)
    if add.returncode != 0:
        raise FinishError(f"git add failed: {add.stdout}")

    staged = run(["git", "diff", "--cached", "--check"], timeout=60)
    if staged.returncode != 0:
        raise FinishError(f"staged diff check failed: {staged.stdout}")

    commit = run(["git", "commit", "-m", message], timeout=120)
    if commit.returncode != 0:
        raise FinishError(f"git commit failed: {commit.stdout}")

    head = git_output("rev-parse", "HEAD")
    progress.done(f"Source committed ({head[:10]})")

    progress.start("Publishing exact source commit to GitHub...")
    push = run(["git", "push", "origin", DEFAULT_BRANCH], timeout=180)
    if push.returncode != 0:
        raise FinishError(f"git push failed: {push.stdout}")

    remote = remote_branch_sha()
    if remote != head:
        raise FinishError(
            f"post-push parity failed: local={head} GitHub={remote}"
        )
    progress.done(f"GitHub exact at {head[:10]}")
    return head


def publish_clean_local_commits(
    *,
    progress: Progress,
    json_mode: bool,
) -> str:
    run_live(
        [str(CLI), "gate"],
        label="Gating committed unpublished source",
        progress=progress,
        timeout=1800,
        json_mode=json_mode,
    )
    head = git_output("rev-parse", "HEAD")
    progress.start("Publishing committed source to GitHub...")
    push = run(["git", "push", "origin", DEFAULT_BRANCH], timeout=180)
    if push.returncode != 0:
        raise FinishError(f"git push failed: {push.stdout}")
    if remote_branch_sha() != head:
        raise FinishError("GitHub parity failed after push")
    progress.done(f"GitHub exact at {head[:10]}")
    return head


def reconcile_clean_history(
    *,
    progress: Progress,
    dry_run: bool,
    json_mode: bool,
) -> dict[str, Any]:
    local = git_output("rev-parse", "HEAD")
    remote = remote_branch_sha()
    if local == remote:
        return {"action": "none", "head": local}

    known = run(["git", "cat-file", "-e", f"{remote}^{{commit}}"], timeout=30)
    if known.returncode != 0:
        if dry_run:
            return {
                "action": "fetch-required",
                "local": local,
                "github": remote,
            }
        progress.start("Fetching GitHub main for history reconciliation...")
        fetch = run(["git", "fetch", "--quiet", "origin", DEFAULT_BRANCH], timeout=120)
        if fetch.returncode != 0:
            raise FinishError(f"git fetch failed: {fetch.stdout}")
        progress.done("GitHub history fetched")

    if is_ancestor(local, remote):
        if dry_run:
            return {
                "action": "fast-forward-local",
                "from": local,
                "to": remote,
            }
        progress.start("Fast-forwarding clean Mac source to GitHub main...")
        merge = run(["git", "merge", "--ff-only", remote], timeout=120)
        if merge.returncode != 0:
            raise FinishError(f"fast-forward failed: {merge.stdout}")
        progress.done(f"Mac fast-forwarded to {remote[:10]}")
        return {"action": "fast-forward-local", "head": remote}

    if is_ancestor(remote, local):
        if dry_run:
            return {
                "action": "publish-local-commits",
                "from": remote,
                "to": local,
            }
        head = publish_clean_local_commits(
            progress=progress,
            json_mode=json_mode,
        )
        return {"action": "publish-local-commits", "head": head}

    raise FinishError(
        "Mac and GitHub histories diverged; refusing automatic merge/rebase"
    )


def reset_vps_candidate_after_publish(
    *,
    capture: dict[str, Any],
    production: dict[str, Any],
    committed_head: str,
    progress: Progress,
) -> None:
    host = str(production["host"])
    repo = str(production["repo"])
    base_sha = str(production["source_sha"])

    if remote_branch_sha() != committed_head:
        raise FinishError("GitHub does not yet contain the adopted VPS candidate")

    if file_manifest_local(capture["tracked_paths"]) != capture["remote_manifest"]:
        raise FinishError(
            "local committed candidate no longer matches captured VPS manifest"
        )

    progress.start("Restoring production checkout to its proven clean base...")
    command = (
        f"cd {shlex.quote(repo)} && "
        f"git reset --hard {shlex.quote(base_sha)} >/dev/null && "
        "test -z \"$(git status --porcelain --untracked-files=all)\" && "
        f"test \"$(git rev-parse HEAD)\" = {shlex.quote(base_sha)}"
    )
    rc, output = ssh_text(host, command, timeout=90)
    if rc != 0:
        raise FinishError(
            "VPS candidate was committed/pushed, but production cleanup failed: "
            + output[-4000:]
        )
    progress.done(
        "Production candidate workspace restored; canonical deploy owns activation"
    )


def needs_deploy(data: dict[str, Any]) -> bool:
    local = data.get("local", {})
    production = data.get("production", {})
    certification = data.get("certification", {})
    return not (
        production.get("reachable")
        and production.get("dirty_count") in (0, None)
        and production.get("source_sha") == local.get("head")
        and production.get("service") == "active"
        and production.get("version_parity")
        and certification.get("status") == "CERTIFIED"
        and certification.get("release_sha") == local.get("head")
    )


def write_receipt(payload: dict[str, Any]) -> Path:
    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    path = RECEIPT_DIR / f"{stamp}-{os.getpid()}.json"
    checkpoint_receipt(path, payload)
    return path


def checkpoint_receipt(path: Path, payload: dict[str, Any]) -> None:
    """Atomically persist the current finish transaction state."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    encoded = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    try:
        with temporary.open("w", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
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
        temporary.unlink(missing_ok=True)


def start_phase(
    receipt: dict[str, Any],
    name: str,
    checkpoint: Callable[[], None],
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    receipt["active_phase"] = name
    receipt.setdefault("phases", {})[name] = {
        "status": "RUNNING",
        "started_at": now,
    }
    checkpoint()


def finish_phase(
    receipt: dict[str, Any],
    name: str,
    checkpoint: Callable[[], None],
    *,
    detail: dict[str, Any] | None = None,
) -> None:
    phase = receipt.setdefault("phases", {}).setdefault(name, {})
    phase["status"] = "PASSED"
    phase["completed_at"] = datetime.now(timezone.utc).isoformat()
    if detail:
        phase.update(detail)
    receipt["active_phase"] = None
    checkpoint()


def fail_active_phase(receipt: dict[str, Any], error: str) -> None:
    name = receipt.get("active_phase")
    if not isinstance(name, str):
        return
    phase = receipt.setdefault("phases", {}).setdefault(name, {})
    phase["status"] = "FAILED"
    phase["failed_at"] = datetime.now(timezone.utc).isoformat()
    phase["error"] = error


def doctor_blocker_details(payload: dict[str, Any]) -> list[str]:
    return [
        str(finding.get("detail") or finding.get("key") or "unknown blocker")
        for finding in payload.get("findings", [])
        if finding.get("severity") == "BLOCKER"
    ]


def assert_certified_release(data: dict[str, Any]) -> None:
    if needs_deploy(data):
        raise FinishError(
            "release proof does not show current source as CERTIFIED production"
        )
    production = data.get("production", {})
    if production.get("wolo_8092_count") != 1:
        raise FinishError("protected Wolo listener 8092 count is not exactly 1")
    if production.get("wolo_8093_count") != 1:
        raise FinishError("protected Wolo listener 8093 count is not exactly 1")


def documentation_plan_summary(plan: dict[str, Any]) -> dict[str, Any]:
    return {
        "blocked": bool(plan.get("blocked")),
        "changes_needed": bool(plan.get("changes_needed")),
        "baseline_refreshes": list(plan.get("baseline_refreshes") or []),
        "central_sync": bool(plan.get("central_sync")),
        "context_projects": list(plan.get("context_projects") or []),
        "blocked_source_docs": list(plan.get("blocked_source_docs") or []),
        "unknown_p1": list(plan.get("unknown_p1") or []),
    }


def docs_history_relation(repo: Path, head: str, remote: str) -> str:
    if head == remote:
        return "EXACT"
    known_rc, _ = aoe2_update.git(repo, "cat-file", "-e", f"{remote}^{{commit}}")
    if known_rc != 0:
        return "FETCH_REQUIRED"
    ahead_rc, _ = aoe2_update.git(
        repo, "merge-base", "--is-ancestor", remote, head
    )
    if ahead_rc == 0:
        return "LOCAL_AHEAD"
    behind_rc, _ = aoe2_update.git(
        repo, "merge-base", "--is-ancestor", head, remote
    )
    if behind_rc == 0:
        return "LOCAL_BEHIND"
    return "DIVERGED"


def reconcile_managed_docs_history(progress: Progress) -> dict[str, Any]:
    repo = aoe2_update.DOCS
    if not repo.is_dir():
        raise FinishError(f"AoE2WAR-docs repository is missing: {repo}")

    branch = aoe2_update.git_output(repo, "branch", "--show-current")
    if not branch:
        raise FinishError("AoE2WAR-docs is detached")
    dirty = sorted(aoe2_update.status_paths(repo))
    if dirty:
        raise FinishError(
            "AoE2WAR-docs worktree is dirty; refusing automatic history choice: "
            + ", ".join(dirty)
        )

    progress.start("Reconciling clean AoE2WAR-docs history...")
    fetch = run(
        ["git", "fetch", "--quiet", "origin", branch],
        cwd=repo,
        timeout=120,
    )
    if fetch.returncode != 0:
        raise FinishError(
            "AoE2WAR-docs fetch failed: " + (fetch.stdout or "")[-4000:]
        )

    head = aoe2_update.git_output(repo, "rev-parse", "HEAD")
    remote = aoe2_update.remote_sha(repo, branch)
    if remote is None:
        raise FinishError(f"cannot resolve AoE2WAR-docs origin/{branch}")

    relation = docs_history_relation(repo, head, remote)
    if relation == "EXACT":
        progress.done("AoE2WAR-docs already exact with origin")
        return {"action": "none", "head": head}

    if relation == "LOCAL_BEHIND":
        merge = run(["git", "merge", "--ff-only", remote], cwd=repo, timeout=120)
        if merge.returncode != 0:
            raise FinishError(
                "AoE2WAR-docs fast-forward failed: " + (merge.stdout or "")[-4000:]
            )
        final = aoe2_update.git_output(repo, "rev-parse", "HEAD")
        if final != remote or aoe2_update.status_paths(repo):
            raise FinishError("AoE2WAR-docs fast-forward did not end exact and clean")
        progress.done(f"AoE2WAR-docs fast-forwarded ({final[:10]})")
        return {"action": "fast-forward-local", "head": final}

    if relation == "LOCAL_AHEAD":
        for target in ("docs-check", "audit-taxonomy", "build"):
            gate = run(["make", target], cwd=repo, timeout=300)
            if gate.returncode != 0:
                raise FinishError(
                    f"AoE2WAR-docs {target} failed before auto-publish: "
                    + (gate.stdout or "")[-4000:]
                )
        aoe2_update.push_and_verify("AoE2WAR-docs", repo, branch)
        final = aoe2_update.git_output(repo, "rev-parse", "HEAD")
        progress.done(f"AoE2WAR-docs validated and published ({final[:10]})")
        return {"action": "publish-local-commits", "head": final}

    raise FinishError(
        "AoE2WAR-docs histories diverged; refusing automatic merge/rebase "
        f"(local={head[:10]} origin={remote[:10]})"
    )


def external_source_authority_snapshot() -> dict[str, Any]:
    """Prove every non-web source authority is clean before any mutation.

    `finish` can reconcile the web checkout itself. It must not silently choose
    an authority or publish work from API, watcher, VPSSentry, WoloChain, or the
    federated docs repository, so those repositories are explicit preflight
    stop-lines.
    """
    repositories = {
        repo_id: repo
        for repo_id, repo in aoe2_update.SOURCES.items()
        if repo.resolve() != ROOT.resolve()
    }
    repositories["AoE2WAR-docs"] = aoe2_update.DOCS

    details: dict[str, Any] = {}
    blockers: list[str] = []
    for repo_id, repo in repositories.items():
        entry: dict[str, Any] = {"path": str(repo)}
        details[repo_id] = entry
        if not repo.is_dir():
            entry["status"] = "MISSING"
            blockers.append(f"{repo_id} repository is missing: {repo}")
            continue
        try:
            branch = aoe2_update.git_output(repo, "branch", "--show-current")
            head = aoe2_update.git_output(repo, "rev-parse", "HEAD")
            dirty = sorted(aoe2_update.status_paths(repo))
            remote = aoe2_update.remote_sha(repo, branch) if branch else None
        except Exception as exc:
            entry.update({"status": "UNRESOLVED", "error": str(exc)})
            blockers.append(f"{repo_id} source authority is unresolved: {exc}")
            continue

        entry.update(
            {
                "branch": branch,
                "head": head,
                "remote": remote,
                "dirty_paths": dirty,
                "status": "EXACT",
            }
        )
        if not branch:
            entry["status"] = "DETACHED"
            blockers.append(f"{repo_id} source authority is detached")
        if dirty:
            entry["status"] = "DIRTY"
            blockers.append(
                f"{repo_id} worktree has unpublished paths: {dirty}"
            )
        if remote is None:
            entry["status"] = "REMOTE_UNRESOLVED"
            blockers.append(f"{repo_id} origin/{branch or '?'} is unresolved")
        elif remote != head:
            if repo_id == "AoE2WAR-docs" and not dirty and branch:
                relation = docs_history_relation(repo, head, remote)
                entry["history_relation"] = relation
                if relation in {"LOCAL_AHEAD", "LOCAL_BEHIND", "FETCH_REQUIRED"}:
                    entry["status"] = "RECONCILABLE"
                    entry["automatic_reconciliation"] = True
                else:
                    entry["status"] = "REMOTE_MISMATCH"
                    blockers.append(
                        f"{repo_id} local/origin mismatch is not safely reconcilable: "
                        f"relation={relation} local={head[:10]} origin={remote[:10]}"
                    )
            else:
                entry["status"] = "REMOTE_MISMATCH"
                blockers.append(
                    f"{repo_id} local/origin mismatch: "
                    f"local={head[:10]} origin={remote[:10]}"
                )

    return {
        "status": "BLOCKED" if blockers else "EXACT",
        "repositories": details,
        "blockers": blockers,
    }


def reconcile_documentation(
    *,
    label: str,
    progress: Progress,
    json_mode: bool,
    defer_context: bool = False,
    defer_final_audit: bool = False,
) -> dict[str, Any]:
    plan = aoe2_update.collect_plan()
    summary = documentation_plan_summary(plan)
    if plan.get("blocked"):
        raise FinishError(
            f"{label} documentation plan is blocked: "
            + json.dumps(summary, sort_keys=True)
        )
    if not plan.get("changes_needed"):
        progress.done(f"{label} documentation/context already current")
        return {**summary, "result": "ALREADY_CURRENT"}
    update_args = [str(CLI), "update", "--apply"]
    if defer_context:
        update_args.append("--defer-context")
    if defer_final_audit:
        update_args.append("--defer-final-audit")

    run_live(
        update_args,
        label=f"{label} documentation federation + context evidence",
        progress=progress,
        timeout=1800,
        json_mode=json_mode,
    )
    return {**summary, "result": "RECONCILED"}


def start_pre_release_context_overlap(
    *,
    projects: list[str],
    receipt: dict[str, Any],
    checkpoint: Callable[[], None],
    progress: Progress,
) -> dict[str, Any] | None:
    selected = set(projects)
    ordered = [
        project
        for project in (
            "AoE2HDBets",
            "WoloChain-wolo-1",
            "VPSSentry",
            "AoE2WAR-docs",
        )
        if project in selected
    ]
    if not ordered:
        return None

    progress.start("Launching pre-release context capture beside deployment...")
    executor = concurrent.futures.ThreadPoolExecutor(
        max_workers=1,
        thread_name_prefix="aoe2war-context-overlap",
    )
    started_at = datetime.now(timezone.utc).isoformat()
    started_monotonic = time.monotonic()
    future = executor.submit(
        aoe2_update.capture_context,
        ordered,
        None,
    )

    receipt["pre_release_context_overlap"] = {
        "status": "RUNNING",
        "projects": ordered,
        "started_at": started_at,
    }
    checkpoint()
    progress.done(
        "Pre-release context capture running in parallel · "
        + ", ".join(ordered)
    )

    return {
        "executor": executor,
        "future": future,
        "projects": ordered,
        "started_at": started_at,
        "started_monotonic": started_monotonic,
    }


def settle_pre_release_context_overlap(
    *,
    state: dict[str, Any] | None,
    receipt: dict[str, Any],
    checkpoint: Callable[[], None],
    progress: Progress,
) -> None:
    if state is None:
        return

    future = state["future"]
    executor = state["executor"]
    projects = list(state["projects"])
    started_monotonic = float(state["started_monotonic"])

    progress.start("Reconciling overlapped pre-release context result...")
    try:
        archives = future.result()
    except Exception as exc:
        receipt["pre_release_context_overlap"] = {
            "status": "FAILED_FALLBACK_TO_POST_RELEASE",
            "projects": projects,
            "started_at": state["started_at"],
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "duration_seconds": round(
                time.monotonic() - started_monotonic,
                3,
            ),
            "error": str(exc),
        }
        progress.done(
            "Overlapped context failed; post-release update will reconcile it"
        )
    else:
        receipt["pre_release_context_overlap"] = {
            "status": "PASSED",
            "projects": projects,
            "started_at": state["started_at"],
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "duration_seconds": round(
                time.monotonic() - started_monotonic,
                3,
            ),
            "archives": archives,
        }
        progress.done("Overlapped pre-release context capture verified")
    finally:
        executor.shutdown(wait=True)
        checkpoint()


def run_json_cli(
    args: list[str],
    *,
    label: str,
    progress: Progress,
    timeout: int,
) -> tuple[int, dict[str, Any]]:
    progress.start(label)
    rc, output = run_capture_with_heartbeat(
        args,
        label=label,
        progress=progress,
        timeout=timeout,
    )
    try:
        payload = json.loads(output)
    except json.JSONDecodeError as exc:
        raise FinishError(f"{label} returned invalid JSON: {output[-4000:]}") from exc
    if not isinstance(payload, dict):
        raise FinishError(f"{label} returned a non-object JSON result")
    return rc, payload


def storage_retention_cycle(
    *,
    receipt: dict[str, Any],
    receipt_key: str,
    checkpoint: Callable[[], None],
    progress: Progress,
    apply_allowed: bool,
) -> dict[str, Any]:
    rc, preview = run_json_cli(
        [str(CLI), "storage-retention", "--json"],
        label="Previewing bounded durable-cache retention",
        progress=progress,
        timeout=600,
    )
    result: dict[str, Any] = {"preview": preview, "apply": None}
    receipt[receipt_key] = result
    checkpoint()
    if rc != 0 or preview.get("status") not in {"READY", "NOOP"}:
        raise FinishError(
            "storage-retention preview failed: " + json.dumps(preview, sort_keys=True)
        )

    contract = aoe2_doctor.load_contract()
    auto_apply = bool(contract.get("finish", {}).get("auto_storage_retention"))
    candidates = int(preview.get("candidate_count") or 0)
    if not apply_allowed or not auto_apply or candidates == 0:
        result["decision"] = (
            "NO_CANDIDATES"
            if candidates == 0
            else "PREVIEW_ONLY"
        )
        checkpoint()
        return result

    apply_rc, applied = run_json_cli(
        [str(CLI), "storage-retention", "--apply", "--json"],
        label="Applying digest-bound cache-only retention",
        progress=progress,
        timeout=1800,
    )
    result["apply"] = applied
    result["decision"] = "APPLIED"
    checkpoint()
    if apply_rc != 0 or applied.get("status") not in {"APPLIED", "NOOP"}:
        raise FinishError(
            "storage-retention apply failed: " + json.dumps(applied, sort_keys=True)
        )
    if not applied.get("runtime_identity_unchanged"):
        raise FinishError("storage retention did not prove runtime identity unchanged")
    if not applied.get("wolo_listener_counts_unchanged"):
        raise FinishError("storage retention did not prove Wolo listener counts unchanged")
    if int(applied.get("generation_directories_deleted") or 0) != 0:
        raise FinishError("storage retention reported generation-directory deletion")
    progress.done(
        "Storage retention proved safe · "
        f"{applied.get('deleted_count', 0)} cache tree(s) · runtime/Wolo unchanged"
    )
    return result


@contextmanager
def finish_lock():
    FINISH_LOCK.parent.mkdir(parents=True, exist_ok=True)
    with FINISH_LOCK.open("a+", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            handle.seek(0)
            holder = handle.read().strip() or "holder metadata unavailable"
            raise FinishError(
                "another `aoe2war finish` already holds the finish lock: "
                + holder.replace("\n", "; ")
            ) from exc

        handle.seek(0)
        handle.truncate()
        handle.write(f"pid={os.getpid()}\n")
        handle.write("command=" + shlex.join(sys.argv) + "\n")
        handle.flush()
        try:
            yield
        finally:
            handle.seek(0)
            handle.truncate()
            handle.write("released\n")
            handle.flush()
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def assert_no_competing_operator_process() -> None:
    patterns = (
        "scripts/aoe2_audit.py",
        "scripts/aoe2_update.py",
        "scripts/aoe2_release_",
        "bin/aoe2war-release",
    )
    process = run(["ps", "-axo", "pid=,command="], timeout=15)
    if process.returncode != 0:
        return
    output = process.stdout or ""

    current_pid = os.getpid()
    conflicts: list[str] = []
    for line in output.splitlines():
        if not line.strip():
            continue
        first = line.split(None, 1)[0]
        try:
            pid = int(first)
        except ValueError:
            pid = -1
        if pid == current_pid:
            continue
        if "aoe2_operator_bridge.py" in line:
            continue
        if any(pattern in line for pattern in patterns):
            conflicts.append(line)

    if conflicts:
        raise FinishError(
            "another AoE2WAR operator command is still active; wait for it "
            "to finish before starting `aoe2war finish`: "
            + " | ".join(conflicts[:5])
        )


def plan_payload() -> dict[str, Any]:
    data = aoe2_release.collect()
    local = data["local"]
    production = data["production"]
    if not production.get("reachable"):
        raise FinishError(
            "production inspection failed: "
            + str(production.get("error") or "unknown")
        )
    github = data["github"]["main_sha"]
    if not github:
        raise FinishError("GitHub main is unavailable")

    plan = source_plan(
        local_dirty=int(local.get("dirty_count") or 0),
        production_dirty=int(production.get("dirty_count") or 0),
        local_head=str(local.get("head") or ""),
        github_head=str(github),
        production_head=str(production.get("source_sha") or ""),
    )
    external_sources = external_source_authority_snapshot()
    capacity_snapshot = production_capacity_snapshot()

    quiet_progress = Progress(enabled=False)
    storage_rc, storage_preview = run_json_cli(
        [str(CLI), "storage-retention", "--json"],
        label="Storage-retention preview",
        progress=quiet_progress,
        timeout=600,
    )
    doctor = aoe2_doctor.collect_doctor(
        include_estate=False,
        progress=False,
    ).payload()
    contract = aoe2_doctor.load_contract()
    auto_retention = bool(
        contract.get("finish", {}).get("auto_storage_retention")
    )
    projected = storage_preview.get("projected_capacity_after", {})
    projected_used = projected.get("used_percent")
    capacity_critical = int(
        contract.get("capacity", {}).get("volume_used_critical_percent") or 92
    )
    retention_can_remediate_capacity = bool(
        storage_rc == 0
        and storage_preview.get("status") == "READY"
        and int(storage_preview.get("candidate_count") or 0) > 0
        and isinstance(projected_used, (int, float))
        and projected_used < capacity_critical
        and auto_retention
    )
    blocker_findings = [
        finding
        for finding in doctor.get("findings", [])
        if finding.get("severity") == "BLOCKER"
    ]
    remediated_blockers = [
        str(finding.get("detail") or finding.get("key"))
        for finding in blocker_findings
        if finding.get("key") == "volume-capacity-critical"
        and retention_can_remediate_capacity
    ]
    blockers = [
        str(finding.get("detail") or finding.get("key") or "unknown blocker")
        for finding in blocker_findings
        if not (
            finding.get("key") == "volume-capacity-critical"
            and retention_can_remediate_capacity
        )
    ]
    if storage_rc != 0 or storage_preview.get("status") not in {"READY", "NOOP"}:
        blockers.append("storage-retention preview did not pass")
    blockers.extend(external_sources["blockers"])
    try:
        assert_capacity_headroom(capacity_snapshot)
    except FinishError as exc:
        blockers.append(str(exc))

    docs_entry = external_sources.get("repositories", {}).get("AoE2WAR-docs", {})
    if docs_entry.get("status") == "RECONCILABLE":
        remediated_blockers.append(
            "AoE2WAR-docs clean history will be reconciled automatically "
            f"({docs_entry.get('history_relation')})"
        )

    detail: dict[str, Any] = {
        "schema": 2,
        "kind": "aoe2war-finish-plan",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": (
            "BLOCKED"
            if blockers
            else "READY_WITH_AUTOMATIC_REMEDIATION"
            if remediated_blockers
            else "READY"
        ),
        "source_plan": asdict(plan),
        "external_source_authorities": external_sources,
        "release": data,
        "local_dirty_paths": list(local.get("dirty_paths") or []),
        "deploy_expected": plan.mode != "clean" or needs_deploy(data),
        "doctor": doctor,
        "storage_retention": storage_preview,
        "capacity": capacity_snapshot,
        "blockers": blockers,
        "automatic_remediations": remediated_blockers,
        "validation_plan": [
            "safe storage retention preview/apply when policy permits",
            "explicit root + mounted-volume release headroom proof",
            "pre-mutation operational Doctor",
            "source authority reconciliation and release gate",
            "clean AoE2WAR-docs history reconciliation",
            "bounded pre-capture context retention and exact archive verification",
            "isolated stage and protected activation",
            "immediate certified runtime + Wolo proof",
            "post-release current-state documentation refresh",
            "independent estate audit and final Doctor",
        ],
        "automatic_mutation_boundaries": {
            "database": False,
            "wolo": False,
            "host_reboot": False,
            "package_upgrade": False,
        },
    }
    if plan.mode == "vps_worktree":
        tracked, untracked = vps_dirty_paths(
            str(production["host"]),
            str(production["repo"]),
        )
        detail["vps_candidate"] = {
            "tracked_paths": tracked,
            "untracked_paths": untracked,
        }
    return detail


def execute_finish(
    *,
    receipt: dict[str, Any],
    checkpoint: Callable[[], None],
    message: str,
    dry_run: bool,
    json_mode: bool,
) -> tuple[int, dict[str, Any]]:
    progress = Progress(enabled=not json_mode)

    if dry_run:
        receipt.update(plan_payload())
        receipt["dry_run"] = True
        checkpoint()
        return (2 if receipt.get("status") == "BLOCKED" else 0), receipt

    start_phase(receipt, "inspect", checkpoint)
    before = aoe2_release.collect()
    local = before["local"]
    production = before["production"]
    github_head = before["github"].get("main_sha")

    if local.get("branch") != DEFAULT_BRANCH:
        raise FinishError(
            f"Mac branch={local.get('branch')!r}; finish requires {DEFAULT_BRANCH}"
        )
    if not production.get("reachable"):
        raise FinishError(
            "production inspection failed: "
            + str(production.get("error") or "unknown")
        )
    if not github_head:
        raise FinishError("GitHub main is unavailable")

    plan = source_plan(
        local_dirty=int(local.get("dirty_count") or 0),
        production_dirty=int(production.get("dirty_count") or 0),
        local_head=str(local.get("head") or ""),
        github_head=str(github_head),
        production_head=str(production.get("source_sha") or ""),
    )
    receipt.update(
        {
            "source_plan": asdict(plan),
            "before_release": before,
            "code_commit": None,
            "vps_adoption": None,
            "documentation_reconciled": False,
            "production_deployed": False,
            "release_outcome": "NOT_ATTEMPTED",
        }
    )
    external_sources = external_source_authority_snapshot()
    receipt["external_source_authorities"] = external_sources
    if external_sources["blockers"]:
        raise FinishError(
            "non-web source authorities are not exact; finish will not mutate "
            "anything until they are reconciled: "
            + "; ".join(external_sources["blockers"])
        )
    finish_phase(receipt, "inspect", checkpoint)

    start_phase(receipt, "preflight_storage_retention", checkpoint)
    storage_retention_cycle(
        receipt=receipt,
        receipt_key="preflight_storage_retention",
        checkpoint=checkpoint,
        progress=progress,
        apply_allowed=True,
    )
    finish_phase(receipt, "preflight_storage_retention", checkpoint)

    start_phase(receipt, "capacity_preflight", checkpoint)
    progress.start("Proving production root + mounted-volume headroom...")
    preflight_capacity = production_capacity_snapshot()
    assert_capacity_headroom(preflight_capacity)
    receipt["preflight_capacity"] = preflight_capacity
    progress.done("Capacity preflight passed — " + capacity_human(preflight_capacity))
    finish_phase(receipt, "capacity_preflight", checkpoint)

    start_phase(receipt, "operational_preflight", checkpoint)
    progress.start("Running pre-mutation operational Doctor...")
    preflight_doctor = aoe2_doctor.collect_doctor(
        include_estate=False,
        progress=False,
    ).payload()
    receipt["preflight_doctor"] = preflight_doctor
    preflight_blockers = doctor_blocker_details(preflight_doctor)
    if preflight_blockers:
        raise FinishError(
            "pre-mutation Doctor found blocking operational issues: "
            + "; ".join(preflight_blockers)
        )
    progress.done(
        f"Pre-mutation Doctor passed — {preflight_doctor['score']}/100 · "
        f"{preflight_doctor['warnings']} warning(s)"
    )
    finish_phase(receipt, "operational_preflight", checkpoint)

    start_phase(receipt, "source_reconciliation", checkpoint)
    progress.start(
        "Source authority: "
        + plan.mode.replace("_", " ")
        + " — "
        + plan.detail
    )

    capture: dict[str, Any] | None = None
    if plan.mode == "history_reconcile":
        receipt["history_reconcile"] = reconcile_clean_history(
            progress=progress,
            dry_run=False,
            json_mode=json_mode,
        )
        checkpoint()

    elif plan.mode == "vps_worktree":
        capture = adopt_vps_candidate(
            before,
            progress=progress,
            dry_run=False,
        )
        receipt["vps_adoption"] = capture
        checkpoint()

    if plan.mode in {"local_worktree", "vps_worktree"}:
        committed = gate_and_commit(
            message=message,
            progress=progress,
            json_mode=json_mode,
        )
        receipt["code_commit"] = committed
        checkpoint()

        if capture is not None:
            reset_vps_candidate_after_publish(
                capture=capture,
                production=production,
                committed_head=committed,
                progress=progress,
            )

    elif plan.mode == "clean":
        progress.done("Mac and GitHub source already exact")

    finish_phase(receipt, "source_reconciliation", checkpoint)

    # A clean local branch may have become fast-forwarded or published above.
    start_phase(receipt, "source_parity", checkpoint)
    if git_paths():
        raise FinishError(
            "source reconciliation left a dirty Mac worktree; refusing maintenance"
        )
    if git_output("rev-parse", "HEAD") != remote_branch_sha():
        raise FinishError("Mac/GitHub parity is not exact after source reconciliation")
    finish_phase(receipt, "source_parity", checkpoint)

    start_phase(receipt, "documentation_history_reconciliation", checkpoint)
    receipt["documentation_history_reconciliation"] = reconcile_managed_docs_history(
        progress
    )
    exact_external_sources = external_source_authority_snapshot()
    if exact_external_sources["blockers"]:
        raise FinishError(
            "source authorities are not exact after documentation history reconciliation: "
            + "; ".join(exact_external_sources["blockers"])
        )
    receipt["external_source_authorities"] = exact_external_sources
    finish_phase(receipt, "documentation_history_reconciliation", checkpoint)

    start_phase(receipt, "pre_release_documentation", checkpoint)
    receipt["pre_release_documentation"] = reconcile_documentation(
        label="Pre-release",
        progress=progress,
        json_mode=json_mode,
        defer_context=True,
        defer_final_audit=True,
    )
    receipt["documentation_reconciled"] = True
    finish_phase(receipt, "pre_release_documentation", checkpoint)

    if git_paths():
        raise FinishError(
            "documentation reconciliation left a dirty operator worktree"
        )
    if git_output("rev-parse", "HEAD") != remote_branch_sha():
        raise FinishError(
            "documentation reconciliation left Mac/GitHub source out of parity"
        )

    context_overlap_state = start_pre_release_context_overlap(
        projects=list(
            receipt["pre_release_documentation"].get("context_projects") or []
        ),
        receipt=receipt,
        checkpoint=checkpoint,
        progress=progress,
    )

    post_update = aoe2_release.collect()
    receipt["post_update_release"] = post_update
    checkpoint()

    start_phase(receipt, "deployment", checkpoint)
    if needs_deploy(post_update):
        run_live(
            [str(CLI), "deploy"],
            label="Shipping through protected release engine",
            progress=progress,
            timeout=2400,
            json_mode=json_mode,
        )
        receipt["production_deployed"] = True
    else:
        progress.done("Production already matches certified source; deploy skipped")
    finish_phase(
        receipt,
        "deployment",
        checkpoint,
        detail={"deployed": receipt["production_deployed"]},
    )

    # Prove and record the runtime result immediately. Later documentation or
    # maintenance failures must never erase a successful certified activation.
    start_phase(receipt, "release_certification", checkpoint)
    certified_release = aoe2_release.collect()
    receipt["certified_release"] = certified_release
    assert_certified_release(certified_release)
    receipt["release_outcome"] = "CERTIFIED"
    receipt["release_certified_at"] = datetime.now(timezone.utc).isoformat()
    finish_phase(receipt, "release_certification", checkpoint)

    start_phase(receipt, "post_release_storage_retention", checkpoint)
    storage_retention_cycle(
        receipt=receipt,
        receipt_key="post_release_storage_retention",
        checkpoint=checkpoint,
        progress=progress,
        apply_allowed=True,
    )
    finish_phase(receipt, "post_release_storage_retention", checkpoint)

    settle_pre_release_context_overlap(
        state=context_overlap_state,
        receipt=receipt,
        checkpoint=checkpoint,
        progress=progress,
    )

    start_phase(receipt, "post_release_documentation", checkpoint)
    receipt["post_release_documentation"] = reconcile_documentation(
        label="Post-release current-state",
        progress=progress,
        json_mode=json_mode,
        defer_final_audit=True,
    )
    finish_phase(receipt, "post_release_documentation", checkpoint)

    start_phase(receipt, "operator_bridge_reload", checkpoint)
    receipt["operator_bridge_reload"] = reload_operator_bridge_after_release(progress)
    finish_phase(receipt, "operator_bridge_reload", checkpoint)

    start_phase(receipt, "release_transient_hygiene", checkpoint)
    try:
        rc, hygiene = run_json_cli(
            [
                str(CLI),
                "host",
                "tidy",
                "--apply",
                "--transients-only",
                "--json",
            ],
            label=(
                "Clearing recorded failed AoE2WAR "
                "release transients..."
            ),
            progress=progress,
            timeout=120,
        )
        receipt["release_transient_hygiene"] = {
            "rc": rc,
            "result": hygiene,
        }
        progress.done(
            "Release transient hygiene complete — "
            f"reset={hygiene.get('reset_transients', 0)}"
        )
    except Exception as exc:
        receipt["release_transient_hygiene"] = {
            "status": "WARN",
            "error": str(exc),
        }
        progress.done(
            "Release transient hygiene unavailable; "
            "recorded as advisory warning"
        )
    finish_phase(
        receipt,
        "release_transient_hygiene",
        checkpoint,
    )

    start_phase(receipt, "estate_audit", checkpoint)
    progress.start("Running independent final estate audit...")
    rc, audit_output = run_capture_with_heartbeat(
        [str(CLI), "audit", "--json"],
        label="Final estate audit",
        progress=progress,
        timeout=600,
    )
    if rc != 0:
        raise FinishError(
            "final estate audit did not pass: " + audit_output[-12000:]
        )
    try:
        final_audit = json.loads(audit_output)
    except json.JSONDecodeError as exc:
        raise FinishError("final estate audit JSON could not be parsed") from exc
    if final_audit.get("p0") or final_audit.get("p1"):
        raise FinishError(
            "final estate audit is not clean: "
            f"P0={final_audit.get('p0')} P1={final_audit.get('p1')}"
        )
    progress.done("Independent estate audit passed — P0=0 P1=0")
    receipt["final_audit"] = final_audit
    finish_phase(receipt, "estate_audit", checkpoint)

    start_phase(receipt, "final_doctor", checkpoint)
    progress.start("Running AoE2WAR Doctor...")
    doctor = aoe2_doctor.collect_doctor(
        estate_payload=final_audit,
        include_estate=False,
        progress=not json_mode,
    )
    doctor_payload = doctor.payload()
    receipt["doctor"] = doctor_payload
    if doctor.count("BLOCKER"):
        raise FinishError(
            "doctor found blocking operational issues: "
            + "; ".join(
                finding.detail
                for finding in doctor.findings
                if finding.severity == "BLOCKER"
            )
        )
    progress.done(
        f"Doctor complete — {doctor_payload['score']}/100 · "
        f"{doctor_payload['warnings']} warning(s)"
    )
    finish_phase(receipt, "final_doctor", checkpoint)

    start_phase(receipt, "final_capacity", checkpoint)
    progress.start("Re-proving final filesystem headroom...")
    final_capacity = production_capacity_snapshot()
    assert_capacity_headroom(final_capacity)
    receipt["final_capacity"] = final_capacity
    progress.done("Final capacity proof passed — " + capacity_human(final_capacity))
    finish_phase(receipt, "final_capacity", checkpoint)

    start_phase(receipt, "final_certification", checkpoint)
    final_release = aoe2_release.collect()
    receipt["final_release"] = final_release
    assert_certified_release(final_release)
    finish_phase(receipt, "final_certification", checkpoint)

    start_phase(receipt, "site_performance_pulse", checkpoint)
    try:
        rc, pulse = run_json_cli(
            [
                sys.executable,
                str(ROOT / "scripts" / "aoe2_speed_pulse.py"),
                "--json",
            ],
            label=(
                "Running cheap post-release public "
                "performance pulse..."
            ),
            progress=progress,
            timeout=180,
        )
        receipt["site_performance_pulse"] = {
            "rc": rc,
            "result": pulse,
        }
        progress.done(
            "Site performance pulse complete — "
            f"{pulse.get('status', 'UNKNOWN')} · routes="
            f"{(pulse.get('summary') or {}).get('ok_count', '—')}/"
            f"{(pulse.get('summary') or {}).get('sample_count', '—')}"
        )
    except Exception as exc:
        receipt["site_performance_pulse"] = {
            "status": "WARN",
            "error": str(exc),
        }
        progress.done(
            "Site performance pulse unavailable; "
            "release certification remains authoritative"
        )
    finish_phase(
        receipt,
        "site_performance_pulse",
        checkpoint,
    )

    receipt["status"] = "CERTIFIED"
    receipt["completed_at"] = datetime.now(timezone.utc).isoformat()
    checkpoint()
    return 0, receipt


def print_finish_summary(receipt: dict[str, Any], receipt_path: Path) -> None:
    final = receipt.get("final_release", {})
    production = final.get("production", {})
    certification = final.get("certification", {})
    doctor = receipt.get("doctor", {})
    audit = receipt.get("final_audit", {})

    print()
    print("⚔️  AOE2WAR FINISH COMPLETE")
    print()
    print(f"Source:          {str(final.get('local', {}).get('head') or '—')[:10]}  exact")
    print("GitHub:          synchronized")
    print("Documentation:   synchronized")
    print("Context:         verified by finish/update pipeline")
    print(f"Production:      {certification.get('status') or '—'}")
    print(f"Build:           {production.get('active_build_id') or '—'}")
    print(f"Estate:          {audit.get('estate') or '—'}")
    print(f"P0 / P1:         {audit.get('p0')} / {audit.get('p1')}")
    print(f"Doctor:          {doctor.get('score', '—')}/100")
    final_capacity = receipt.get("final_capacity")
    if isinstance(final_capacity, dict):
        print("Capacity:        " + capacity_human(final_capacity))
    print(
        "Wolo:            "
        f"8092={production.get('wolo_8092_count')} "
        f"8093={production.get('wolo_8093_count')}  UNTOUCHED"
    )
    print(f"Receipt:         {receipt_path}")
    if int(doctor.get("warnings") or 0):
        print()
        print(
            "Core release is complete. `aoe2war doctor` lists the remaining "
            "maintenance/upgrade items; they did not compromise this release."
        )
    print()
    print("You are done.")


def git_output_at(
    repo: Path,
    *args: str,
) -> str:
    process = run(
        [
            "git",
            *args,
        ],
        cwd=repo,
        timeout=120,
    )

    if process.returncode != 0:
        raise FinishError(
            "git "
            + " ".join(args)
            + " failed in "
            + str(repo)
            + ": "
            + (
                process.stdout
                or ""
            )[-4000:]
        )

    return (
        process.stdout
        or ""
    ).strip()


def git_common_dir_at(
    repo: Path,
) -> Path:
    raw = git_output_at(
        repo,
        "rev-parse",
        "--git-common-dir",
    )

    value = Path(raw)

    if not value.is_absolute():
        value = (
            repo
            / value
        )

    return value.resolve()


def canonical_operator_repo() -> Path:
    contract = (
        aoe2_doctor.load_contract()
    )

    value = (
        contract.get(
            "canonical",
            {},
        ).get(
            "operator_repo"
        )
    )

    if not value:
        raise FinishError(
            "operations contract has no "
            "canonical.operator_repo"
        )

    return Path(
        str(value)
    ).expanduser().resolve()


def validate_feature_handoff_state(
    *,
    feature_branch: str,
    feature_head: str,
    canonical_branch: str,
    canonical_head: str,
    github_head: str,
    canonical_dirty: bool,
    feature_descends_from_main: bool,
) -> None:
    if (
        not feature_branch
        or feature_branch
        == DEFAULT_BRANCH
    ):
        raise FinishError(
            "feature-worktree handoff requires "
            "a named non-main branch"
        )

    if canonical_branch != DEFAULT_BRANCH:
        raise FinishError(
            "canonical operator worktree "
            "is not on main"
        )

    if canonical_dirty:
        raise FinishError(
            "canonical main is dirty; refusing "
            "feature promotion"
        )

    if canonical_head != github_head:
        raise FinishError(
            "canonical main and GitHub main "
            "must be exact before feature promotion"
        )

    if not feature_descends_from_main:
        raise FinishError(
            "feature branch does not descend "
            "from current canonical main; "
            "refusing automatic merge/rebase"
        )

    if not feature_head:
        raise FinishError(
            "feature HEAD is unavailable"
        )


def feature_handoff_plan() -> dict[str, Any]:
    canonical = (
        canonical_operator_repo()
    )

    if not canonical.is_dir():
        raise FinishError(
            "canonical operator repository "
            f"is missing: {canonical}"
        )

    if (
        git_common_dir_at(
            ROOT
        )
        != git_common_dir_at(
            canonical
        )
    ):
        raise FinishError(
            "current worktree is not part "
            "of canonical app-prodn"
        )

    feature_branch = git_output(
        "branch",
        "--show-current",
    )

    feature_head = git_output(
        "rev-parse",
        "HEAD",
    )

    canonical_branch = git_output_at(
        canonical,
        "branch",
        "--show-current",
    )

    canonical_head = git_output_at(
        canonical,
        "rev-parse",
        "HEAD",
    )

    canonical_dirty = bool(
        git_output_at(
            canonical,
            "status",
            "--porcelain",
            "--untracked-files=all",
        )
    )

    github_head = remote_branch_sha()

    feature_descends = is_ancestor(
        canonical_head,
        feature_head,
    )

    validate_feature_handoff_state(
        feature_branch=feature_branch,
        feature_head=feature_head,
        canonical_branch=canonical_branch,
        canonical_head=canonical_head,
        github_head=github_head,
        canonical_dirty=canonical_dirty,
        feature_descends_from_main=(
            feature_descends
        ),
    )

    release = aoe2_release.collect()
    production = release[
        "production"
    ]

    if not production.get(
        "reachable"
    ):
        raise FinishError(
            "production inspection failed "
            "before feature promotion"
        )

    if int(
        production.get(
            "dirty_count"
        )
        or 0
    ):
        raise FinishError(
            "production worktree is dirty; "
            "refusing to advance canonical main"
        )

    return {
        "mode": "feature_worktree",
        "feature_branch": (
            feature_branch
        ),
        "feature_head": (
            feature_head
        ),
        "feature_dirty_paths": (
            git_paths()
        ),
        "canonical_repo": (
            str(canonical)
        ),
        "canonical_head": (
            canonical_head
        ),
        "github_head": (
            github_head
        ),
        "production_head": (
            production.get(
                "source_sha"
            )
        ),
    }


@contextmanager
def feature_handoff_lock(
    canonical: Path,
):
    path = (
        canonical
        / ".aoe2war-release"
        / "feature-handoff.lock"
    )

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with path.open(
        "a+",
        encoding="utf-8",
    ) as handle:
        try:
            fcntl.flock(
                handle.fileno(),
                fcntl.LOCK_EX
                | fcntl.LOCK_NB,
            )
        except BlockingIOError as exc:
            raise FinishError(
                "another feature handoff "
                "is already active"
            ) from exc

        try:
            yield
        finally:
            fcntl.flock(
                handle.fileno(),
                fcntl.LOCK_UN,
            )


def commit_feature_candidate(
    *,
    message: str,
    progress: Progress,
) -> str:
    paths = git_paths()

    if not paths:
        return git_output(
            "rev-parse",
            "HEAD",
        )

    ensure_safe_candidate_paths(
        paths
    )

    diff = run(
        [
            "git",
            "diff",
            "--check",
        ],
        timeout=60,
    )

    if diff.returncode != 0:
        raise FinishError(
            "feature diff check failed: "
            + (
                diff.stdout
                or ""
            )[-4000:]
        )

    progress.start(
        "Committing finished feature "
        "worktree locally..."
    )

    add = run(
        [
            "git",
            "add",
            "-A",
        ],
        timeout=60,
    )

    if add.returncode != 0:
        raise FinishError(
            "feature git add failed: "
            + (
                add.stdout
                or ""
            )[-4000:]
        )

    staged = run(
        [
            "git",
            "diff",
            "--cached",
            "--check",
        ],
        timeout=60,
    )

    if staged.returncode != 0:
        raise FinishError(
            "feature staged diff check failed: "
            + (
                staged.stdout
                or ""
            )[-4000:]
        )

    commit = run(
        [
            "git",
            "commit",
            "-m",
            message,
        ],
        timeout=120,
    )

    if commit.returncode != 0:
        raise FinishError(
            "feature commit failed: "
            + (
                commit.stdout
                or ""
            )[-4000:]
        )

    head = git_output(
        "rev-parse",
        "HEAD",
    )

    progress.done(
        "Feature committed locally "
        f"({head[:10]})"
    )

    return head


FEATURE_BASELINE_GENERATED_PATHS = {
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
}


def validate_feature_baseline_paths(
    paths: list[str],
) -> None:
    unexpected = sorted(
        set(paths)
        - FEATURE_BASELINE_GENERATED_PATHS
    )

    if unexpected:
        raise FinishError(
            "documentation baseline refresh changed "
            "unexpected path(s): "
            + ", ".join(unexpected)
        )


def refresh_feature_documentation_baseline(
    *,
    implementation_sha: str,
    progress: Progress,
) -> str:
    progress.start(
        "Refreshing governed documentation "
        "baseline to committed implementation..."
    )

    refresh = run(
        [
            sys.executable,
            "scripts/docs_v2_check.py",
            "--write",
            "--refresh-baseline",
        ],
        timeout=180,
    )

    if refresh.returncode != 0:
        raise FinishError(
            "feature documentation baseline refresh failed: "
            + (refresh.stdout or "")[-4000:]
        )

    verify = run(
        [
            sys.executable,
            "scripts/docs_v2_check.py",
        ],
        timeout=120,
    )

    if verify.returncode != 0:
        raise FinishError(
            "feature documentation baseline verification failed: "
            + (verify.stdout or "")[-4000:]
        )

    paths = git_paths()
    validate_feature_baseline_paths(
        paths
    )

    if not paths:
        progress.done(
            "Documentation baseline already current "
            f"for implementation {implementation_sha[:10]}"
        )
        return implementation_sha

    add = run(
        [
            "git",
            "add",
            "--",
            *paths,
        ],
        timeout=60,
    )

    if add.returncode != 0:
        raise FinishError(
            "documentation baseline git add failed: "
            + (add.stdout or "")[-4000:]
        )

    staged = run(
        [
            "git",
            "diff",
            "--cached",
            "--check",
        ],
        timeout=60,
    )

    if staged.returncode != 0:
        raise FinishError(
            "documentation baseline staged diff failed: "
            + (staged.stdout or "")[-4000:]
        )

    commit = run(
        [
            "git",
            "commit",
            "-m",
            "Refresh documentation baseline after feature implementation",
        ],
        timeout=120,
    )

    if commit.returncode != 0:
        raise FinishError(
            "documentation baseline commit failed: "
            + (commit.stdout or "")[-4000:]
        )

    target_sha = git_output(
        "rev-parse",
        "HEAD",
    )

    if not is_ancestor(
        implementation_sha,
        target_sha,
    ):
        raise FinishError(
            "documentation baseline commit is not "
            "a descendant of implementation"
        )

    if git_paths():
        raise FinishError(
            "documentation baseline commit left "
            "the feature worktree dirty"
        )

    progress.done(
        "Documentation baseline committed "
        f"({target_sha[:10]}) for implementation "
        f"{implementation_sha[:10]}"
    )

    return target_sha


def copy_feature_gate_receipts(
    *,
    canonical: Path,
    target_sha: str,
) -> list[str]:
    source_dir = (
        ROOT
        / ".aoe2war-release"
        / "gates"
    )

    target_dir = (
        canonical
        / ".aoe2war-release"
        / "gates"
    )

    target_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    copied = []

    if not source_dir.is_dir():
        raise FinishError(
            "feature release gate produced "
            "no receipt directory"
        )

    for source in source_dir.glob(
        f"{target_sha[:12]}-*.json"
    ):
        try:
            payload = json.loads(
                source.read_text(
                    encoding="utf-8"
                )
            )
        except Exception:
            continue

        if (
            payload.get(
                "status"
            )
            != "PASS"
            or payload.get(
                "target_sha"
            )
            != target_sha
            or int(
                payload.get(
                    "schema"
                )
                or 0
            )
            < 2
        ):
            continue

        target = (
            target_dir
            / source.name
        )

        shutil.copy2(
            source,
            target,
        )

        if (
            hashlib.sha256(
                source.read_bytes()
            ).hexdigest()
            != hashlib.sha256(
                target.read_bytes()
            ).hexdigest()
        ):
            raise FinishError(
                "gate receipt copy digest mismatch"
            )

        copied.append(
            str(target)
        )

    if not copied:
        raise FinishError(
            "no digest-bound PASS gate receipt "
            "was found for feature target"
        )

    return copied


def write_feature_handoff_receipt(
    *,
    canonical: Path,
    payload: dict[str, Any],
) -> Path:
    directory = (
        canonical
        / ".aoe2war-release"
        / "feature-handoffs"
    )

    directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    stamp = datetime.now(
        timezone.utc
    ).strftime(
        "%Y%m%dT%H%M%S%fZ"
    )

    path = (
        directory
        / (
            f"{stamp}-"
            f"{os.getpid()}.json"
        )
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


def promote_feature_worktree(
    *,
    message: str,
    json_mode: bool,
) -> int:
    progress = Progress(
        enabled=not json_mode
    )

    plan = feature_handoff_plan()

    canonical = Path(
        plan[
            "canonical_repo"
        ]
    )

    base_sha = str(
        plan[
            "canonical_head"
        ]
    )

    with feature_handoff_lock(
        canonical
    ):
        # Re-prove canonical authority immediately
        # before any local-main mutation.
        if git_output_at(
            canonical,
            "rev-parse",
            "HEAD",
        ) != base_sha:
            raise FinishError(
                "canonical main moved during "
                "feature handoff"
            )

        if git_output_at(
            canonical,
            "status",
            "--porcelain",
            "--untracked-files=all",
        ):
            raise FinishError(
                "canonical main became dirty "
                "during feature handoff"
            )

        if remote_branch_sha() != base_sha:
            raise FinishError(
                "GitHub main moved during "
                "feature handoff"
            )

        implementation_sha = (
            commit_feature_candidate(
                message=message,
                progress=progress,
            )
        )

        if not is_ancestor(
            base_sha,
            implementation_sha,
        ):
            raise FinishError(
                "final feature implementation no longer "
                "descends from canonical main"
            )

        target_sha = (
            refresh_feature_documentation_baseline(
                implementation_sha=implementation_sha,
                progress=progress,
            )
        )

        if not is_ancestor(
            implementation_sha,
            target_sha,
        ):
            raise FinishError(
                "feature release target is not a "
                "descendant of implementation"
            )

        progress.start(
            "Running one full digest-bound "
            "feature release gate..."
        )

        run_live(
            [
                str(CLI),
                "gate",
            ],
            label=(
                "Validating exact feature "
                "implementation"
            ),
            progress=progress,
            timeout=1800,
            json_mode=json_mode,
        )

        copied = (
            copy_feature_gate_receipts(
                canonical=canonical,
                target_sha=target_sha,
            )
        )

        progress.done(
            "Feature validation receipt sealed "
            "for canonical reuse"
        )

        # Final authority check before ff-only.
        if git_output_at(
            canonical,
            "rev-parse",
            "HEAD",
        ) != base_sha:
            raise FinishError(
                "canonical main changed after "
                "feature validation"
            )

        if git_output_at(
            canonical,
            "status",
            "--porcelain",
            "--untracked-files=all",
        ):
            raise FinishError(
                "canonical main became dirty "
                "after feature validation"
            )

        if remote_branch_sha() != base_sha:
            raise FinishError(
                "GitHub main changed after "
                "feature validation"
            )

        progress.start(
            "Fast-forwarding canonical main "
            "to validated feature..."
        )

        merge = run(
            [
                "git",
                "merge",
                "--ff-only",
                target_sha,
            ],
            cwd=canonical,
            timeout=120,
        )

        if merge.returncode != 0:
            raise FinishError(
                "canonical main fast-forward "
                "failed: "
                + (
                    merge.stdout
                    or ""
                )[-4000:]
            )

        if (
            git_output_at(
                canonical,
                "rev-parse",
                "HEAD",
            )
            != target_sha
        ):
            raise FinishError(
                "canonical main does not equal "
                "validated feature target"
            )

        if git_output_at(
            canonical,
            "status",
            "--porcelain",
            "--untracked-files=all",
        ):
            raise FinishError(
                "canonical main is dirty "
                "after feature fast-forward"
            )

        handoff = (
            write_feature_handoff_receipt(
                canonical=canonical,
                payload={
                    "schema": 1,
                    "kind": (
                        "aoe2war-feature-handoff"
                    ),
                    "generated_at": (
                        datetime.now(
                            timezone.utc
                        ).isoformat()
                    ),
                    "feature_worktree": (
                        str(ROOT)
                    ),
                    "feature_branch": (
                        plan[
                            "feature_branch"
                        ]
                    ),
                    "base_sha": (
                        base_sha
                    ),
                    "implementation_sha": (
                        implementation_sha
                    ),
                    "target_sha": (
                        target_sha
                    ),
                    "gate_receipts": (
                        copied
                    ),
                    "promotion": (
                        "ff-only"
                    ),
                    "github_mutated": (
                        False
                    ),
                    "production_mutated": (
                        False
                    ),
                    "wolo_mutated": (
                        False
                    ),
                },
            )
        )

        progress.done(
            "Canonical main now owns validated "
            f"feature ({target_sha[:10]})"
        )

    # Canonical finish now owns publication,
    # documentation, deployment and certification.
    env = os.environ.copy()
    env[
        "AOE2WAR_FEATURE_HANDOFF_RECEIPT"
    ] = str(
        handoff
    )

    command = [
        str(
            canonical
            / "bin"
            / "aoe2war"
        ),
        "finish",
        "-m",
        message,
    ]

    if json_mode:
        command.append(
            "--json"
        )

    os.chdir(
        canonical
    )

    os.execve(
        command[0],
        command,
        env,
    )

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="aoe2war finish",
        description=(
            "Canonical end-of-work command: reconcile source authority, "
            "gate unpublished work, publish Git, update documentation/context, "
            "deploy, certify, audit and leave one receipt."
        ),
    )
    parser.add_argument(
        "-m",
        "--message",
        default="Finish AoE2WAR work",
        help="commit message used only when finish auto-commits unpublished work",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="show the source-authority plan without changing anything",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit the final plan/result as JSON; child command output is captured",
    )
    args = parser.parse_args()

    try:
        production_role = is_production_checkout()
    except Exception as exc:
        if args.json:
            print(json.dumps({"status": "ERROR", "error": str(exc)}, indent=2))
        else:
            print(f"STOP: {exc}", file=sys.stderr)
        return 2

    if not production_role:
        current_branch = git_output(
            "branch",
            "--show-current",
        )

        if current_branch != DEFAULT_BRANCH:
            try:
                if args.dry_run:
                    payload = feature_handoff_plan()

                    if args.json:
                        print(
                            json.dumps(
                                {
                                    "schema": 1,
                                    "kind": (
                                        "aoe2war-feature-"
                                        "finish-plan"
                                    ),
                                    "status": "READY",
                                    **payload,
                                },
                                indent=2,
                                sort_keys=True,
                            )
                        )
                    else:
                        print(
                            "⚔️  AOE2WAR FEATURE "
                            "FINISH PLAN"
                        )
                        print()
                        print(
                            "Feature:       "
                            + payload[
                                "feature_branch"
                            ]
                        )
                        print(
                            "Feature HEAD:  "
                            + payload[
                                "feature_head"
                            ]
                        )
                        print(
                            "Canonical:     "
                            + payload[
                                "canonical_head"
                            ]
                        )
                        print(
                            "GitHub main:   "
                            + payload[
                                "github_head"
                            ]
                        )
                        print(
                            "Dirty paths:   "
                            + str(
                                len(
                                    payload[
                                        "feature_dirty_paths"
                                    ]
                                )
                            )
                        )
                        print()
                        print(
                            "Plan: local commit "
                            "→ one full gate "
                            "→ ff canonical main "
                            "→ canonical finish"
                        )
                        print(
                            "No changes made."
                        )

                    return 0

                return promote_feature_worktree(
                    message=args.message,
                    json_mode=args.json,
                )

            except Exception as exc:
                if args.json:
                    print(
                        json.dumps(
                            {
                                "status": "ERROR",
                                "feature_worktree": True,
                                "error": str(exc),
                            },
                            indent=2,
                            sort_keys=True,
                        )
                    )
                else:
                    print(
                        f"STOP: {exc}",
                        file=sys.stderr,
                    )

                return 2

    if production_role:
        try:
            return delegate_finish_from_production(
                message=args.message,
                dry_run=args.dry_run,
                json_mode=args.json,
            )
        except Exception as exc:
            if args.json:
                print(
                    json.dumps(
                        {
                            "status": "ERROR",
                            "delegated_from_production": True,
                            "error": str(exc),
                        },
                        indent=2,
                        sort_keys=True,
                    )
                )
            else:
                print(f"STOP: {exc}", file=sys.stderr)
            return 2

    if args.dry_run:
        try:
            payload = plan_payload()
        except Exception as exc:
            if args.json:
                print(json.dumps({"status": "ERROR", "error": str(exc)}, indent=2))
            else:
                print(f"STOP: {exc}", file=sys.stderr)
            return 2

        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            plan = payload["source_plan"]
            print("⚔️  AOE2WAR FINISH PLAN")
            print()
            print(f"Source mode:  {plan['mode']}")
            print(f"Plan:         {plan['detail']}")
            print(
                "Mac dirty:    "
                f"{payload['release']['local'].get('dirty_count')} "
                f"{payload['local_dirty_paths']}"
            )
            print(
                "VPS dirty:    "
                f"{payload['release']['production'].get('dirty_count')}"
            )
            print(f"Deploy:       {'EXPECTED' if payload['deploy_expected'] else 'SKIP'}")
            print(
                "Doctor:       "
                f"{payload['doctor'].get('score', '—')}/100 "
                f"{payload['doctor'].get('status', 'UNKNOWN')}"
            )
            storage = payload["storage_retention"]
            print(
                "Retention:    "
                f"{storage.get('candidate_count', 0)} cache candidate(s), "
                f"projected volume "
                f"{storage.get('projected_capacity_after', {}).get('used_percent', '—')}%"
            )
            print("Capacity:     " + capacity_human(payload["capacity"]))
            if payload.get("vps_candidate"):
                print(
                    "VPS tracked:  "
                    + ", ".join(payload["vps_candidate"]["tracked_paths"])
                )
                print(
                    "VPS untracked:"
                    + (
                        " " + ", ".join(payload["vps_candidate"]["untracked_paths"])
                        if payload["vps_candidate"]["untracked_paths"]
                        else " none"
                    )
                )
            print()
            if payload["blockers"]:
                print("Blocking preflight findings:")
                for blocker in payload["blockers"]:
                    print(f"  - {blocker}")
                print()
            if payload["automatic_remediations"]:
                print("Automatically remediated before mutation:")
                for remediation in payload["automatic_remediations"]:
                    print(f"  - {remediation}")
                print()
            print("No changes made.")
        return 2 if payload["status"] == "BLOCKED" else 0

    if not args.json:
        print("⚔️  AOE2WAR FINISH", flush=True)
        print("One command from finished code to certified operating state.", flush=True)
        print("WOLO: observe only.", flush=True)
        print(flush=True)

    receipt: dict[str, Any] = {
        "schema": 2,
        "kind": "aoe2war-finish-result",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "RUNNING",
        "release_outcome": "NOT_ATTEMPTED",
        "active_phase": None,
        "phases": {},
        "wolo_mutated_by_finish": False,
        "database_mutated": False,
        "host_rebooted": False,
        "packages_upgraded": False,
        "feature_handoff_receipt": (
            os.getenv(
                "AOE2WAR_FEATURE_HANDOFF_RECEIPT"
            )
            or None
        ),
    }
    path: Path | None = None

    try:
        path = write_receipt(receipt)

        def checkpoint() -> None:
            assert path is not None
            checkpoint_receipt(path, receipt)

        start_phase(receipt, "serialization", checkpoint)
        with finish_lock():
            assert_no_competing_operator_process()
            with aoe2_release.global_release_lease():
                receipt["global_release_lease"] = "canonical-production-held"
                finish_phase(receipt, "serialization", checkpoint)
                execute_finish(
                    receipt=receipt,
                    checkpoint=checkpoint,
                    message=args.message,
                    dry_run=False,
                    json_mode=args.json,
                )

        if args.json:
            print(
                json.dumps(
                    {
                        **receipt,
                        "receipt_path": str(path),
                    },
                    indent=2,
                    sort_keys=True,
                )
            )
        else:
            print_finish_summary(receipt, path)
        return 0

    except Exception as exc:
        fail_active_phase(receipt, str(exc))
        if receipt.get("release_outcome") == "CERTIFIED":
            receipt["status"] = "CERTIFIED_WITH_POSTCHECK_FAILURE"
        else:
            receipt["status"] = "FAILED"
        receipt["failed_at"] = datetime.now(timezone.utc).isoformat()
        receipt["error"] = str(exc)
        try:
            if path is None:
                path = write_receipt(receipt)
            else:
                checkpoint_receipt(path, receipt)
        except Exception:
            path = None

        if args.json:
            payload = {**receipt, "receipt_path": str(path) if path else None}
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            if receipt.get("release_outcome") == "CERTIFIED":
                print(
                    "ATTENTION: production release is CERTIFIED, but a later "
                    f"finish check failed: {exc}",
                    file=sys.stderr,
                )
            else:
                print(f"STOP: {exc}", file=sys.stderr)
            if path:
                print(f"finish failure receipt: {path}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
