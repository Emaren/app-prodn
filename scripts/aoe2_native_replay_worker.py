#!/usr/bin/env python3
"""Run one content-addressed AoE2 HD replay through the candidate-only native witness."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT.parent / "api-prodn"
RUNNER = API_ROOT / "scripts" / "replay_engine_runner.py"
RUNNER_IMPL = API_ROOT / "utils" / "replay_engine_runner.py"
TERMINAL_CONTROL_VALIDATOR = (
    API_ROOT / "scripts" / "validate_replay_engine_terminal_control.py"
)
TRUSTED_CONTROL_GAME_IDS = {32388}
TRUSTED_LOCAL_CONTROLS = {
    32388: (
        API_ROOT
        / "instance/engine-runner-20260920/inputs"
        / "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b.aoe2record"
    )
}
DEFAULT_URL = os.getenv("AOE2WAR_OS_BRIDGE_URL", "https://aoe2war.com").rstrip("/")
DEFAULT_TOKEN_FILE = Path(
    os.getenv("AOE2WAR_OS_BRIDGE_TOKEN_FILE", "~/.config/aoe2war/os-bridge-token")
).expanduser()

BOTTLE = Path.home() / "Library/Application Support/CrossOver/Bottles/SteamReplayLab"
GAME_ROOT = BOTTLE / "drive_c/Program Files (x86)/Steam/steamapps/common/Age2HD"
EXECUTABLE = GAME_ROOT / "AoK HD.exe"
DATA_FILE = GAME_ROOT / "resources/_common/dat/empires2_x2_p1.dat"
LAUNCHER = Path(
    "/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/"
    "CrossOver-Hosted Application/wine"
)

EXPECTED_EXECUTABLE_SHA256 = (
    "cbd10d81b93601ffb26773d250b7478969da92d70792a40ae423294202e14650"
)
EXPECTED_DATA_SHA256 = (
    "21591ac67251d8674635d5634f2d8e9ff80ad90f3c792f9503d60dd658d61058"
)
REQUIRED_APP_IMPLEMENTATION_COMMIT = (
    "7d99d07b6c5e215d1a029b701dabe76a9d8811c8"
)
REQUIRED_API_IMPLEMENTATION_COMMIT = (
    "51bd43ecadc9f830976925bcc3586a1bd29a4275"
)
MAX_REPLAY_BYTES = 64 * 1024 * 1024
SAFE_REPLAY_EXTENSIONS = {".aoe2record"}
SHA256_RE = __import__("re").compile(r"^[0-9a-f]{64}$")


class WorkerError(RuntimeError):
    pass


def load_token() -> str:
    value = os.getenv("AOE2WAR_OS_BRIDGE_TOKEN", "").strip()
    if value:
        return value
    try:
        value = DEFAULT_TOKEN_FILE.read_text(encoding="utf-8").strip()
    except FileNotFoundError as exc:
        raise WorkerError("AoE2WAR OS bridge token is not configured.") from exc
    if not value:
        raise WorkerError("AoE2WAR OS bridge token file is empty.")
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_head(repo: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=str(repo),
            text=True,
            stderr=subprocess.STDOUT,
            timeout=10,
        ).strip()
    except (OSError, subprocess.SubprocessError) as exc:
        raise WorkerError(f"Could not read Git source identity for {repo}.") from exc


def require_clean_git_repo(repo: Path, *, label: str) -> str:
    head = git_head(repo)
    try:
        dirty = subprocess.check_output(
            ["git", "status", "--porcelain", "--untracked-files=no"],
            cwd=str(repo),
            text=True,
            stderr=subprocess.STDOUT,
            timeout=10,
        ).strip()
    except (OSError, subprocess.SubprocessError) as exc:
        raise WorkerError(f"Could not verify {label} worktree cleanliness.") from exc
    if dirty:
        raise WorkerError(f"{label} has tracked worktree changes; native evidence requires clean source.")
    return head


def require_git_ancestor(repo: Path, ancestor: str, *, label: str) -> None:
    try:
        process = subprocess.run(
            ["git", "merge-base", "--is-ancestor", ancestor, "HEAD"],
            cwd=str(repo),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise WorkerError(f"Could not verify canonical {label} source ancestry.") from exc
    if process.returncode != 0:
        raise WorkerError(
            f"{label} HEAD does not contain required canonical implementation {ancestor}."
        )


def require_runtime() -> dict[str, str]:
    app_head = require_clean_git_repo(ROOT, label="app-prodn")
    api_head = require_clean_git_repo(API_ROOT, label="api-prodn")
    require_git_ancestor(
        ROOT,
        REQUIRED_APP_IMPLEMENTATION_COMMIT,
        label="app-prodn",
    )
    require_git_ancestor(
        API_ROOT,
        REQUIRED_API_IMPLEMENTATION_COMMIT,
        label="api-prodn",
    )

    for path in (
        RUNNER,
        RUNNER_IMPL,
        TERMINAL_CONTROL_VALIDATOR,
        EXECUTABLE,
        DATA_FILE,
        LAUNCHER,
        BOTTLE,
    ):
        if not path.exists():
            raise WorkerError(f"Required native runtime object is missing: {path}")
        if path.is_symlink():
            raise WorkerError(f"Symlinked native runtime object rejected: {path}")

    runner_text = RUNNER_IMPL.read_text(encoding="utf-8", errors="replace")
    if "native_terminal_witness_recorded_candidate_only" not in runner_text:
        raise WorkerError(
            "api-prodn does not yet contain the governed native terminal-witness runner."
        )
    if sha256_file(EXECUTABLE) != EXPECTED_EXECUTABLE_SHA256:
        raise WorkerError("AoK HD executable identity differs from the governed runtime.")
    if sha256_file(DATA_FILE) != EXPECTED_DATA_SHA256:
        raise WorkerError("AoE2 HD data identity differs from the governed runtime.")

    return {
        "appHead": app_head,
        "apiHead": api_head,
        "requiredAppImplementationCommit": REQUIRED_APP_IMPLEMENTATION_COMMIT,
        "requiredApiImplementationCommit": REQUIRED_API_IMPLEMENTATION_COMMIT,
    }


def download_replay(
    *,
    base_url: str,
    token: str,
    run_id: str,
    expected_sha256: str,
    destination_dir: Path,
) -> tuple[Path, int]:
    query = urllib.parse.urlencode({"runId": run_id})
    request = urllib.request.Request(
        f"{base_url}/api/internal/aoe2war-os/native-replay/artifact?{query}",
        headers={
            "x-aoe2war-os-key": token,
            "User-Agent": "AoE2WAR-Native-Replay-Worker/1.0.0",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            advertised = response.headers.get("X-AoE2WAR-Replay-SHA256", "").strip()
            if advertised != expected_sha256:
                raise WorkerError(
                    "Server replay identity does not match the queued native-run identity."
                )
            extension = response.headers.get(
                "X-AoE2WAR-Replay-Extension", ""
            ).strip().lower()
            if extension not in SAFE_REPLAY_EXTENSIONS:
                raise WorkerError("Server replay extension is not supported by the native worker.")
            destination = destination_dir / f"{expected_sha256}{extension}"
            length_header = response.headers.get("Content-Length", "").strip()
            if length_header:
                try:
                    declared = int(length_header)
                except ValueError as exc:
                    raise WorkerError("Server replay Content-Length is invalid.") from exc
                if declared < 1 or declared > MAX_REPLAY_BYTES:
                    raise WorkerError("Server replay byte length is outside the worker bound.")

            total = 0
            digest = hashlib.sha256()
            with destination.open("xb") as handle:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > MAX_REPLAY_BYTES:
                        raise WorkerError("Replay download exceeded the worker byte bound.")
                    digest.update(chunk)
                    handle.write(chunk)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise WorkerError(
            f"Replay artifact endpoint returned HTTP {exc.code}: {detail[:1200]}"
        ) from exc
    except urllib.error.URLError as exc:
        raise WorkerError(f"Replay artifact endpoint is unavailable: {exc}") from exc

    if total < 1:
        raise WorkerError("Replay artifact endpoint returned no bytes.")
    observed = digest.hexdigest()
    if observed != expected_sha256:
        raise WorkerError(
            f"Downloaded replay failed SHA-256 validation: {observed}"
        )
    destination.chmod(0o400)
    return destination, total


def materialize_replay(
    *,
    game_stats_id: int,
    replay_sha256: str,
    base_url: str,
    token: str,
    run_id: str,
    destination_dir: Path,
) -> tuple[Path, int, str]:
    local_control = TRUSTED_LOCAL_CONTROLS.get(game_stats_id)
    if local_control is not None and local_control.exists():
        if local_control.is_symlink() or not local_control.is_file():
            raise WorkerError("Trusted local control must be one regular file.")
        size = local_control.stat().st_size
        if size < 1 or size > MAX_REPLAY_BYTES:
            raise WorkerError("Trusted local control is outside the worker byte bound.")
        if sha256_file(local_control) != replay_sha256:
            raise WorkerError("Trusted local control failed its exact SHA-256 identity.")
        extension = local_control.suffix.lower()
        if extension not in SAFE_REPLAY_EXTENSIONS:
            raise WorkerError("Trusted local control has an unsupported replay extension.")
        destination = destination_dir / f"{replay_sha256}{extension}"
        digest = hashlib.sha256()
        copied = 0
        with local_control.open("rb") as source, destination.open("xb") as target:
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                copied += len(chunk)
                if copied > MAX_REPLAY_BYTES:
                    raise WorkerError("Trusted local control exceeded the worker byte bound.")
                digest.update(chunk)
                target.write(chunk)
        if copied != size or digest.hexdigest() != replay_sha256:
            raise WorkerError("Trusted local control changed while being materialized.")
        destination.chmod(0o400)
        return destination, copied, "trusted_local_control"

    artifact, byte_size = download_replay(
        base_url=base_url,
        token=token,
        run_id=run_id,
        expected_sha256=replay_sha256,
        destination_dir=destination_dir,
    )
    return artifact, byte_size, "server_archive"


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise WorkerError(f"Required native evidence is unavailable: {path.name}") from exc
    if not isinstance(value, dict):
        raise WorkerError(f"Native evidence object is invalid: {path.name}")
    return value


def result_payload(
    *,
    game_stats_id: int,
    replay_sha256: str,
    output: Path,
    runner_returncode: int,
) -> tuple[dict[str, Any], int]:
    attempt = read_json(output / "attempt.json")
    receipt = read_json(output / "receipt.json")
    validation = read_json(output / "validation.json")
    observation = read_json(output / "observation.json")

    receipt_observation = receipt.get("observations")
    if not isinstance(receipt_observation, dict):
        raise WorkerError("Native witness receipt has no observations object.")

    result = receipt_observation.get("result")
    terminal = receipt_observation.get("terminal_outcome_proven") is True
    loaded = receipt_observation.get("loaded") is True
    validation_status = str(validation.get("status") or "")
    cleanup_complete = attempt.get("cleanup_complete") is True

    evidence_files = [
        "attempt.json",
        "receipt.json",
        "validation.json",
        "observation.json",
        "invocation.json",
        "events.jsonl",
    ]
    evidence_sha256 = {
        name: sha256_file(output / name)
        for name in evidence_files
        if (output / name).is_file()
    }

    payload: dict[str, Any] = {
        "kind": "aoe2war-native-replay-candidate",
        "schema": 1,
        "candidateOnly": True,
        "gameStatsId": game_stats_id,
        "replaySha256": replay_sha256,
        "loaded": loaded,
        "terminalOutcomeProven": terminal,
        "validationStatus": validation_status,
        "cleanupComplete": cleanup_complete,
        "runnerReturnCode": runner_returncode,
        "nativeRunId": attempt.get("run_id"),
        "result": result if terminal else None,
        "evidenceDirectory": str(output),
        "evidenceSha256": evidence_sha256,
        "authority": {
            "replayTruthPromoted": False,
            "productionResultsMutated": False,
            "bettingMutated": False,
            "woloMutated": False,
            "settlementMutated": False,
        },
        "nativeObservation": {
            "gameOverCandidate": observation.get("native_game_over_result_candidate"),
            "performanceLoadWitness": observation.get("native_performance_load_witness"),
        },
    }

    if not cleanup_complete:
        payload["status"] = "cleanup_incomplete"
        return payload, 6
    if terminal and validation_status == "recorded_terminal_witness":
        payload["status"] = "candidate_terminal_witness"
        return payload, 0
    if loaded:
        payload["status"] = "loaded_without_terminal"
        return payload, 4
    payload["status"] = "load_not_proven"
    return payload, 5


def apply_trusted_control_validation(
    *,
    game_stats_id: int,
    output: Path,
    payload: dict[str, Any],
    candidate_exit_code: int,
) -> tuple[dict[str, Any], int]:
    if game_stats_id not in TRUSTED_CONTROL_GAME_IDS:
        return payload, candidate_exit_code
    if payload.get("status") != "candidate_terminal_witness":
        payload["trustedControlValidation"] = {
            "status": "not_run",
            "reason": "native terminal witness is not available",
        }
        return payload, candidate_exit_code

    control_path = output / "trusted-control-validation.json"
    process = subprocess.run(
        [
            sys.executable,
            str(TERMINAL_CONTROL_VALIDATOR),
            str(output),
            "--output",
            str(control_path),
        ],
        cwd=str(API_ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=30,
        env={
            **os.environ,
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONUNBUFFERED": "1",
        },
    )
    if process.returncode != 0:
        payload["status"] = "trusted_control_failed"
        payload["trustedControlValidation"] = {
            "status": "FAIL",
            "exitCode": process.returncode,
            "detail": process.stdout[-4000:],
        }
        return payload, 7

    control = read_json(control_path)
    if control.get("status") != "PASS" or control.get("control_passed") is not True:
        payload["status"] = "trusted_control_failed"
        payload["trustedControlValidation"] = control
        return payload, 7

    payload["status"] = "candidate_terminal_witness_control_pass"
    payload["trustedControlValidation"] = control
    payload["evidenceSha256"]["trusted-control-validation.json"] = sha256_file(
        control_path
    )
    return payload, 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--game-stats-id", required=True, type=int)
    parser.add_argument("--replay-sha256", required=True)
    parser.add_argument("--roster-slot", action="append", type=int, default=[])
    parser.add_argument("--native-performance-seconds", type=int, default=240)
    parser.add_argument("--timeout-seconds", type=int, default=300)
    parser.add_argument("--url", default=DEFAULT_URL)
    args = parser.parse_args()

    if not __import__("re").fullmatch(r"[A-Za-z0-9-]{1,100}", args.run_id):
        raise WorkerError("Invalid AoE2WAR OS run id.")
    replay_sha256 = args.replay_sha256.strip().lower()
    if not SHA256_RE.fullmatch(replay_sha256):
        raise WorkerError("Invalid replay SHA-256.")
    slots = sorted(set(args.roster_slot))
    if len(slots) < 2 or len(slots) > 8 or any(slot < 1 or slot > 8 for slot in slots):
        raise WorkerError("Native replay worker requires 2-8 unique roster slots 1-8.")
    if not 1 <= args.native_performance_seconds <= 240:
        raise WorkerError("native-performance-seconds is outside the governed bound.")
    if not args.native_performance_seconds + 15 <= args.timeout_seconds <= 300:
        raise WorkerError("timeout-seconds is outside the governed bound.")

    source_identity = require_runtime()
    token = load_token()
    output = API_ROOT / "instance/native-replay-worker/attempts" / args.run_id
    if output.exists():
        raise WorkerError(f"Native attempt directory already exists: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="aoe2war-native-replay-") as temp_dir:
        artifact, byte_size, artifact_source = materialize_replay(
            game_stats_id=args.game_stats_id,
            replay_sha256=replay_sha256,
            base_url=args.url.rstrip("/"),
            token=token,
            run_id=args.run_id,
            destination_dir=Path(temp_dir),
        )

        command = [
            sys.executable,
            str(RUNNER),
            "run",
            "--artifact",
            str(artifact),
            "--expected-replay-sha256",
            replay_sha256,
            "--executable",
            str(EXECUTABLE),
            "--expected-executable-sha256",
            EXPECTED_EXECUTABLE_SHA256,
            "--data-file",
            str(DATA_FILE),
            "--expected-data-sha256",
            EXPECTED_DATA_SHA256,
            "--launcher",
            str(LAUNCHER),
            "--bottle-path",
            str(BOTTLE),
            "--output",
            str(output),
            "--game-id",
            str(args.game_stats_id),
            "--native-performance-seconds",
            str(args.native_performance_seconds),
            "--timeout-seconds",
            str(args.timeout_seconds),
            "--steam-app-context",
        ]
        for slot in slots:
            command.extend(["--roster-slot", str(slot)])

        process = subprocess.run(
            command,
            cwd=str(API_ROOT),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=args.timeout_seconds + 90,
            env={
                **os.environ,
                "PYTHONDONTWRITEBYTECODE": "1",
                "PYTHONUNBUFFERED": "1",
            },
        )

    payload, exit_code = result_payload(
        game_stats_id=args.game_stats_id,
        replay_sha256=replay_sha256,
        output=output,
        runner_returncode=process.returncode,
    )
    payload["artifactByteSize"] = byte_size
    payload["artifactSource"] = artifact_source
    payload["sourceIdentity"] = source_identity
    payload, exit_code = apply_trusted_control_validation(
        game_stats_id=args.game_stats_id,
        output=output,
        payload=payload,
        candidate_exit_code=exit_code,
    )
    print(json.dumps(payload, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, WorkerError, subprocess.SubprocessError) as exc:
        print(
            json.dumps(
                {
                    "kind": "aoe2war-native-replay-candidate",
                    "schema": 1,
                    "status": "invalid",
                    "candidateOnly": True,
                    "error": str(exc),
                },
                sort_keys=True,
            )
        )
        raise SystemExit(2)
