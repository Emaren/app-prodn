#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

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
    def __init__(self) -> None:
        self.started = time.monotonic()

    def emit(self, symbol: str, text: str) -> None:
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


def git_paths() -> list[str]:
    output = git_output("status", "--porcelain=v1", "--untracked-files=all")
    paths: list[str] = []
    for line in output.splitlines():
        if not line:
            continue
        value = line[3:]
        if " -> " in value:
            value = value.split(" -> ", 1)[1]
        paths.append(value)
    return sorted(set(paths))


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
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = RECEIPT_DIR / f"{stamp}.json"
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return path


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

    detail: dict[str, Any] = {
        "schema": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_plan": asdict(plan),
        "release": data,
        "local_dirty_paths": list(local.get("dirty_paths") or []),
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
    message: str,
    dry_run: bool,
    json_mode: bool,
) -> tuple[int, dict[str, Any]]:
    progress = Progress()
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

    receipt: dict[str, Any] = {
        "schema": 1,
        "kind": "aoe2war-finish-result",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "RUNNING",
        "source_plan": asdict(plan),
        "before_release": before,
        "code_commit": None,
        "vps_adoption": None,
        "documentation_reconciled": False,
        "production_deployed": False,
        "database_mutated": False,
        "wolo_mutated_by_finish": False,
    }

    if dry_run:
        if plan.mode == "vps_worktree":
            tracked, untracked = vps_dirty_paths(
                str(production["host"]),
                str(production["repo"]),
            )
            receipt["vps_adoption"] = {
                "tracked_paths": tracked,
                "untracked_paths": untracked,
            }
        receipt["status"] = "DRY_RUN"
        return 0, receipt

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

    elif plan.mode == "vps_worktree":
        capture = adopt_vps_candidate(
            before,
            progress=progress,
            dry_run=False,
        )
        receipt["vps_adoption"] = capture

    if plan.mode in {"local_worktree", "vps_worktree"}:
        committed = gate_and_commit(
            message=message,
            progress=progress,
            json_mode=json_mode,
        )
        receipt["code_commit"] = committed

        if capture is not None:
            reset_vps_candidate_after_publish(
                capture=capture,
                production=production,
                committed_head=committed,
                progress=progress,
            )

    elif plan.mode == "clean":
        progress.done("Mac and GitHub source already exact")

    # A clean local branch may have become fast-forwarded or published above.
    if git_paths():
        raise FinishError(
            "source reconciliation left a dirty Mac worktree; refusing maintenance"
        )
    if git_output("rev-parse", "HEAD") != remote_branch_sha():
        raise FinishError("Mac/GitHub parity is not exact after source reconciliation")

    run_live(
        [str(CLI), "update", "--apply"],
        label="Reconciling documentation federation + context evidence",
        progress=progress,
        timeout=1800,
        json_mode=json_mode,
    )
    receipt["documentation_reconciled"] = True

    post_update = aoe2_release.collect()
    receipt["post_update_release"] = post_update

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

    final_release = aoe2_release.collect()
    receipt["final_release"] = final_release

    if needs_deploy(final_release):
        raise FinishError(
            "final release proof does not show current Mac source as CERTIFIED"
        )

    if final_release["production"].get("wolo_8092_count") != 1:
        raise FinishError("final protected Wolo listener 8092 count is not exactly 1")
    if final_release["production"].get("wolo_8093_count") != 1:
        raise FinishError("final protected Wolo listener 8093 count is not exactly 1")

    receipt["status"] = "CERTIFIED"
    receipt["completed_at"] = datetime.now(timezone.utc).isoformat()
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
    print("Context:         verified by update engine")
    print(f"Production:      {certification.get('status') or '—'}")
    print(f"Build:           {production.get('active_build_id') or '—'}")
    print(f"Estate:          {audit.get('estate') or '—'}")
    print(f"P0 / P1:         {audit.get('p0')} / {audit.get('p1')}")
    print(f"Doctor:          {doctor.get('score', '—')}/100")
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
            print("No changes made.")
        return 0

    print("⚔️  AOE2WAR FINISH", flush=True)
    print("One command from finished code to certified operating state.", flush=True)
    print("WOLO: observe only.", flush=True)
    print(flush=True)

    receipt: dict[str, Any] = {
        "schema": 1,
        "kind": "aoe2war-finish-result",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "FAILED",
        "wolo_mutated_by_finish": False,
        "database_mutated": False,
    }

    try:
        with finish_lock():
            assert_no_competing_operator_process()
            _, receipt = execute_finish(
                message=args.message,
                dry_run=False,
                json_mode=args.json,
            )
            path = write_receipt(receipt)

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
        receipt["status"] = "FAILED"
        receipt["failed_at"] = datetime.now(timezone.utc).isoformat()
        receipt["error"] = str(exc)
        try:
            path = write_receipt(receipt)
        except Exception:
            path = None

        if args.json:
            payload = {**receipt, "receipt_path": str(path) if path else None}
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print(f"STOP: {exc}", file=sys.stderr)
            if path:
                print(f"finish failure receipt: {path}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
