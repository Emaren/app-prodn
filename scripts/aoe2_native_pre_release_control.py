#!/usr/bin/env python3
"""Run the governed #32388 native pre-release control and seal one local receipt."""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RECEIPT_DIR = ROOT / ".aoe2war-release" / "truth-receipts"
GAME_ID = 32388
REPLAY_SHA256 = "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b"
REPLAY_BYTES = 665734
EXECUTABLE_SHA256 = "cbd10d81b93601ffb26773d250b7478969da92d70792a40ae423294202e14650"
DATA_SHA256 = "21591ac67251d8674635d5634f2d8e9ff80ad90f3c792f9503d60dd658d61058"
ROSTER = (1, 2, 3, 4)


class ControlError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def identity(path: Path) -> dict[str, Any]:
    path = path.resolve(strict=True)
    if not path.is_file():
        raise ControlError(f"Expected one regular file: {path}")
    return {
        "path": str(path),
        "byteSize": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def canonical_checkout_root(repository: Path) -> Path:
    common = subprocess.check_output(
        ["git", "rev-parse", "--git-common-dir"],
        cwd=repository,
        text=True,
        timeout=10,
    ).strip()
    common_path = Path(common)
    if not common_path.is_absolute():
        common_path = repository / common_path
    return common_path.resolve().parent


def canonical_api_root() -> Path:
    return canonical_checkout_root(ROOT).parent / "api-prodn"


def git_state(repo: Path, label: str) -> dict[str, str]:
    if not repo.is_dir():
        raise ControlError(f"{label} checkout is unavailable: {repo}")
    head = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=repo, text=True, timeout=10,
    ).strip()
    branch = subprocess.check_output(
        ["git", "branch", "--show-current"], cwd=repo, text=True, timeout=10,
    ).strip()
    dirty = subprocess.check_output(
        ["git", "status", "--porcelain", "--untracked-files=no"],
        cwd=repo,
        text=True,
        timeout=10,
    ).strip()
    if dirty:
        raise ControlError(f"{label} has tracked worktree changes; native evidence requires clean source.")
    return {"head": head, "branch": branch or "(detached)", "path": str(repo.resolve())}


def find_tool(name: str) -> Path:
    candidates = [
        shutil.which(name),
        f"/opt/homebrew/opt/llvm/bin/{name}",
        f"/usr/local/opt/llvm/bin/{name}",
    ]
    for candidate in candidates:
        if candidate:
            path = Path(candidate).expanduser()
            if path.is_file() and os.access(path, os.X_OK):
                return path.resolve()
    raise ControlError(
        f"Required LLVM tool {name!r} was not found. Install Homebrew llvm or expose it on PATH."
    )


def run_checked(command: list[str], *, cwd: Path, timeout: int = 120) -> str:
    process = subprocess.run(
        command,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        env={
            **os.environ,
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONUNBUFFERED": "1",
        },
    )
    if process.returncode != 0:
        raise ControlError(
            f"Command failed rc={process.returncode}: {' '.join(command)}\n"
            + (process.stdout or "")[-8000:]
        )
    return process.stdout or ""


def parse_last_json(text: str) -> dict[str, Any] | None:
    for line in reversed(text.splitlines()):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    return None


def build_helpers(api_root: Path, temp_root: Path) -> dict[str, dict[str, Any]]:
    clang = find_tool("clang")
    lld_link = find_tool("lld-link")
    observer_dir = temp_root / "observer"
    controller_dir = temp_root / "controller"

    run_checked(
        [
            sys.executable,
            str(api_root / "scripts/build_replay_memory_observer.py"),
            "--clang",
            str(clang),
            "--lld-link",
            str(lld_link),
            "--output",
            str(observer_dir),
        ],
        cwd=api_root,
    )
    run_checked(
        [
            sys.executable,
            str(api_root / "scripts/build_replay_playback_controller.py"),
            "--clang",
            str(clang),
            "--lld-link",
            str(lld_link),
            "--output",
            str(controller_dir),
        ],
        cwd=api_root,
    )
    observer = observer_dir / "replay-memory-observer.exe"
    controller = controller_dir / "replay-playback-controller.exe"
    return {
        "observer": identity(observer),
        "controller": identity(controller),
        "observerBuild": identity(observer_dir / "build.json"),
        "controllerBuild": identity(controller_dir / "build.json"),
        "clang": identity(clang),
        "lldLink": identity(lld_link),
    }


@contextmanager
def execution_lock(api_root: Path):
    directory = canonical_checkout_root(api_root) / "instance/native-replay-worker"
    directory.mkdir(parents=True, exist_ok=True)
    if directory.is_symlink():
        raise ControlError("Native evidence root cannot be a symlink.")
    lock_path = directory / "execution.lock"
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "a+") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ControlError("Another native replay control owns the serial execution lock.") from exc
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def write_immutable_receipt(payload: dict[str, Any]) -> tuple[Path, str]:
    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8")
    digest = hashlib.sha256(encoded).hexdigest()
    path = RECEIPT_DIR / f"native-pre-release-32388-{digest}.json"
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o400)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(encoded)
        handle.flush()
        os.fsync(handle.fileno())
    return path, digest


def bounded_run(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    api_root = canonical_api_root()
    app_source = git_state(ROOT, "app-prodn")
    api_source = git_state(api_root, "api-prodn")

    api_canonical = canonical_checkout_root(api_root)
    replay = (
        api_canonical
        / "instance/engine-runner-20260920/inputs"
        / f"{REPLAY_SHA256}.aoe2record"
    )
    if identity(replay)["sha256"] != REPLAY_SHA256 or replay.stat().st_size != REPLAY_BYTES:
        raise ControlError("Trusted #32388 replay differs from the sealed control identity.")

    bottle = Path.home() / "Library/Application Support/CrossOver/Bottles/SteamReplayLab"
    game_root = bottle / "drive_c/Program Files (x86)/Steam/steamapps/common/Age2HD"
    executable = game_root / "AoK HD.exe"
    data_file = game_root / "resources/_common/dat/empires2_x2_p1.dat"
    launcher = Path(
        "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/"
        "CrossOver-Hosted Application/wine"
    )
    if identity(executable)["sha256"] != EXECUTABLE_SHA256:
        raise ControlError("AoK HD executable differs from the governed exact-build control.")
    if identity(data_file)["sha256"] != DATA_SHA256:
        raise ControlError("AoK HD data file differs from the governed exact-build control.")
    if not launcher.is_file() or not os.access(launcher, os.X_OK):
        raise ControlError("CrossOver Wine launcher is unavailable.")

    run_id = args.run_id or f"pre-release-32388-{timestamp()}"
    if not __import__("re").fullmatch(r"[A-Za-z0-9-]{1,80}", run_id):
        raise ControlError("Run ID must use only letters, digits and hyphens (max 80).")

    evidence_root = api_canonical / "instance/native-replay-worker/attempts"
    attempt = evidence_root / run_id
    probe = evidence_root / f"{run_id}-pre-release-probe"
    if attempt.exists() or probe.exists():
        raise ControlError("Run evidence path already exists; use a new --run-id.")

    runner_script = api_root / "scripts/replay_engine_runner.py"
    probe_script = api_root / "scripts/replay_pre_release_probe.py"
    if not runner_script.is_file() or not probe_script.is_file():
        raise ControlError("API replay runner or pre-release probe is missing from the selected branch.")

    with tempfile.TemporaryDirectory(prefix="aoe2war-pre-release-build-") as temp:
        helpers = build_helpers(api_root, Path(temp))
        runner = [
            sys.executable,
            str(runner_script),
            "run",
            "--artifact",
            str(replay),
            "--expected-replay-sha256",
            REPLAY_SHA256,
            "--executable",
            str(executable),
            "--expected-executable-sha256",
            EXECUTABLE_SHA256,
            "--data-file",
            str(data_file),
            "--expected-data-sha256",
            DATA_SHA256,
            "--launcher",
            str(launcher),
            "--bottle-path",
            str(bottle),
            "--output",
            str(attempt),
            "--game-id",
            str(GAME_ID),
            "--native-performance-seconds",
            str(args.native_performance_seconds),
            "--timeout-seconds",
            str(args.timeout_seconds),
            "--steam-app-context",
            "--native-fast-replay",
            "--memory-observer",
            helpers["observer"]["path"],
            "--expected-memory-observer-sha256",
            helpers["observer"]["sha256"],
            "--playback-controller",
            helpers["controller"]["path"],
            "--expected-playback-controller-sha256",
            helpers["controller"]["sha256"],
        ]
        for slot in ROSTER:
            runner.extend(["--roster-slot", str(slot)])

        probe_command = [
            sys.executable,
            str(probe_script),
            "--game-id",
            str(GAME_ID),
            "--output",
            str(probe),
            "--launcher",
            str(launcher),
            "--bottle",
            str(bottle),
            "--executable",
            str(executable),
            "--wait-seconds",
            str(args.probe_wait_seconds),
            "--debugger-timeout-seconds",
            str(args.debugger_timeout_seconds),
        ]

        started = time.monotonic()
        with execution_lock(api_root):
            runner_process = subprocess.Popen(
                runner,
                cwd=api_root,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                start_new_session=True,
                env={
                    **os.environ,
                    "PYTHONDONTWRITEBYTECODE": "1",
                    "PYTHONUNBUFFERED": "1",
                },
            )
            time.sleep(1.0)
            probe_process = subprocess.run(
                probe_command,
                cwd=api_root,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=args.probe_wait_seconds + args.debugger_timeout_seconds + 45,
                env={
                    **os.environ,
                    "PYTHONDONTWRITEBYTECODE": "1",
                    "PYTHONUNBUFFERED": "1",
                },
            )
            try:
                runner_output, _ = runner_process.communicate(
                    timeout=args.timeout_seconds + 120
                )
            except subprocess.TimeoutExpired as exc:
                # The API runner owns game cleanup. Do not kill it early and bypass that cleanup.
                raise ControlError("Native runner exceeded its bounded cleanup window.") from exc

        elapsed = round(time.monotonic() - started, 6)
        runner_payload = parse_last_json(runner_output or "")
        probe_payload = parse_last_json(probe_process.stdout or "")

        attempt_files = {}
        if attempt.is_dir():
            for name in ("attempt.json", "receipt.json", "validation.json", "observation.json", "invocation.json", "events.jsonl"):
                path = attempt / name
                if path.is_file():
                    attempt_files[name] = identity(path)
        probe_files = {}
        if probe.is_dir():
            for name in ("plan.json", "invocation.json", "winedbg-transcript.txt", "receipt.json", "process-census.txt"):
                path = probe / name
                if path.is_file():
                    probe_files[name] = identity(path)

        payload = {
            "schema": "aoe2war-native-pre-release-control/v1",
            "generatedAt": utc_now(),
            "status": "HOLD_PENDING_INDEPENDENT_REVIEW",
            "candidateOnly": True,
            "gameStatsId": GAME_ID,
            "replaySha256": REPLAY_SHA256,
            "replayBytes": REPLAY_BYTES,
            "source": {"app": app_source, "api": api_source},
            "runtime": {
                "elapsedSeconds": elapsed,
                "runnerReturnCode": runner_process.returncode,
                "probeReturnCode": probe_process.returncode,
            },
            "helpers": helpers,
            "runner": {
                "command": runner,
                "result": runner_payload,
                "outputTail": (runner_output or "")[-8000:],
                "evidenceDirectory": str(attempt),
                "evidence": attempt_files,
            },
            "probe": {
                "command": probe_command,
                "result": probe_payload,
                "outputTail": (probe_process.stdout or "")[-8000:],
                "evidenceDirectory": str(probe),
                "evidence": probe_files,
            },
            "authority": {
                "readOnlyObserverUnchanged": True,
                "instrumentedProbeUsesSoftwareBreakpoint": True,
                "persistentExecutableMutation": False,
                "replayMutation": False,
                "productionWrites": 0,
                "databaseWrites": 0,
                "resultPromotions": 0,
                "adjudicationWrites": 0,
                "bettingWrites": 0,
                "settlementWrites": 0,
                "woloWrites": 0,
                "engineEofObserved": False,
                "wholeInputConsumptionProven": False,
                "unknownGameExecutionEnabled": False,
            },
            "expansionGate": (
                "CLOSED: independently review the #32388 instruction-boundary evidence. "
                "Do not admit additional known or unknown controls until the strengthened "
                "known-result control proves the required EOF/consumption semantics."
            ),
        }
        receipt_path, digest = write_immutable_receipt(payload)
        result = {
            "status": payload["status"],
            "gameStatsId": GAME_ID,
            "runId": run_id,
            "runnerReturnCode": runner_process.returncode,
            "probeReturnCode": probe_process.returncode,
            "attemptDirectory": str(attempt),
            "probeDirectory": str(probe),
            "receipt": str(receipt_path),
            "receiptSha256": digest,
            "engineEofObserved": False,
            "wholeInputConsumptionProven": False,
            "unknownGameExecutionEnabled": False,
        }
        return result, 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id")
    parser.add_argument("--native-performance-seconds", type=int, default=240)
    parser.add_argument("--timeout-seconds", type=int, default=280)
    parser.add_argument("--probe-wait-seconds", type=int, default=120)
    parser.add_argument("--debugger-timeout-seconds", type=int, default=240)
    args = parser.parse_args(argv)
    if not 30 <= args.native_performance_seconds <= 240:
        parser.error("--native-performance-seconds must be between 30 and 240")
    if not args.native_performance_seconds + 15 <= args.timeout_seconds <= 300:
        parser.error("--timeout-seconds must be 15-300 seconds beyond the performance window")
    if not 15 <= args.probe_wait_seconds <= 180:
        parser.error("--probe-wait-seconds must be between 15 and 180")
    if not 30 <= args.debugger_timeout_seconds <= 300:
        parser.error("--debugger-timeout-seconds must be between 30 and 300")

    try:
        result, code = bounded_run(args)
        print(json.dumps(result, indent=2, sort_keys=True))
        return code
    except (ControlError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        print(
            json.dumps(
                {
                    "schema": "aoe2war-native-pre-release-control-error/v1",
                    "status": "HOLD",
                    "candidateOnly": True,
                    "error": str(exc),
                    "authority": {
                        "productionWrites": 0,
                        "resultPromotions": 0,
                        "woloWrites": 0,
                    },
                },
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
