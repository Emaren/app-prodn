#!/usr/bin/env python3
"""Run one content-addressed AoE2 HD replay through the candidate-only native witness."""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any
from contextlib import contextmanager

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from scripts.native_replay_contract import (
    NativeReplayContractError,
    build_stats_only_review_evidence,
    canonical_json,
    load_manifest_json,
    validate_control_observations,
    validate_native_manifest,
)


def canonical_checkout_root(repository: Path) -> Path:
    """Resolve the owning checkout without taking a user-supplied filesystem path."""
    common = subprocess.check_output(
        ["git", "rev-parse", "--git-common-dir"], cwd=repository, text=True, timeout=10,
    ).strip()
    common_path = Path(common)
    if not common_path.is_absolute():
        common_path = repository / common_path
    return common_path.resolve().parent


def canonical_api_root() -> Path:
    """Resolve the governed sibling API from the app Git common checkout."""
    return canonical_checkout_root(ROOT).parent / "api-prodn"


def native_evidence_root(api_source: Path) -> Path:
    # Source may be a governed API worktree. Durable runtime files stay at the
    # canonical checkout so its retirement cannot lose receipts or exceed the
    # native engine's Windows path bound. There is no CLI output-root override.
    return canonical_checkout_root(api_source) / "instance/native-replay-worker/attempts"


API_ROOT = canonical_api_root()
# Importing app-owned contracts does not require the sibling native runtime.
# Resolve and cache its canonical durable root only when execution starts.
EVIDENCE_ROOT: Path | None = None
RUNNER = API_ROOT / "scripts" / "replay_engine_runner.py"
RUNNER_IMPL = API_ROOT / "utils" / "replay_engine_runner.py"
TERMINAL_CONTROL_VALIDATOR = (
    API_ROOT / "scripts" / "validate_replay_engine_terminal_control.py"
)
TRUSTED_CONTROL_SHA256 = {32388: "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b"}
TRUSTED_CONTROL_GAME_IDS = set(TRUSTED_CONTROL_SHA256)
TRUSTED_CONTROL_ROSTER = {32388: [1, 2, 3, 4]}
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
    "abdccc18f6f216ae2b166d70a7aac9665b3bb1ba"
)
REQUIRED_API_IMPLEMENTATION_COMMIT = (
    "cd99188c55d1d1ecd0465b1662a459db0b30f2a6"
)
MAX_REPLAY_BYTES = 64 * 1024 * 1024
SAFE_REPLAY_EXTENSIONS = {".aoe2record"}
SHA256_RE = __import__("re").compile(r"^[0-9a-f]{64}$")


class WorkerError(RuntimeError):
    pass


def configure_api_source(source: Path) -> None:
    """Select only a governed worktree of the canonical sibling API checkout."""
    global API_ROOT, EVIDENCE_ROOT, RUNNER, RUNNER_IMPL, TERMINAL_CONTROL_VALIDATOR, TRUSTED_LOCAL_CONTROLS
    candidate = source.expanduser().absolute()
    if candidate.is_symlink():
        raise WorkerError("Symlinked API source checkout rejected.")
    try:
        top = Path(subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"], cwd=candidate, text=True, timeout=10,
        ).strip()).resolve()
        canonical = canonical_api_root().resolve()
        candidate_common = canonical_checkout_root(candidate)
        canonical_common = canonical_checkout_root(canonical)
    except (OSError, subprocess.SubprocessError) as exc:
        raise WorkerError("Could not validate governed API source checkout.") from exc
    candidate = candidate.resolve()
    if top != candidate or candidate_common != canonical_common:
        raise WorkerError("API source must be an exact worktree of the canonical sibling repository.")
    API_ROOT = candidate
    EVIDENCE_ROOT = None
    RUNNER = API_ROOT / "scripts" / "replay_engine_runner.py"
    RUNNER_IMPL = API_ROOT / "utils" / "replay_engine_runner.py"
    TERMINAL_CONTROL_VALIDATOR = API_ROOT / "scripts" / "validate_replay_engine_terminal_control.py"
    TRUSTED_LOCAL_CONTROLS = {
        32388: (
            canonical_common
            / "instance/engine-runner-20260920/inputs"
            / "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b.aoe2record"
        )
    }


def worker_evidence_root() -> Path:
    global EVIDENCE_ROOT
    if EVIDENCE_ROOT is None:
        try:
            EVIDENCE_ROOT = native_evidence_root(API_ROOT)
        except (OSError, subprocess.SubprocessError) as exc:
            raise WorkerError("The governed sibling api-prodn checkout is unavailable for native execution.") from exc
    return EVIDENCE_ROOT


@contextmanager
def native_execution_lock():
    """One game process at a time across bridge and direct worker invocations."""
    directory = worker_evidence_root().parent
    directory.mkdir(parents=True, exist_ok=True)
    if directory.is_symlink():
        raise WorkerError("Native worker lock directory cannot be a symlink.")
    lock_path = directory / "execution.lock"
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "a+") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise WorkerError("Another native replay worker owns the serial execution lock.") from exc
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


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


def file_identity(path: Path) -> dict[str, Any]:
    if path.is_symlink():
        raise WorkerError(f"Symlinked native helper file rejected: {path}")
    path = path.resolve(strict=True)
    if not path.is_file():
        raise WorkerError(f"Expected one regular native helper file: {path}")
    return {"path": str(path), "byte_size": path.stat().st_size, "sha256": sha256_file(path)}


def fixed_native_tools() -> dict[str, Path]:
    """Use the same fixed host toolchain already reviewed by native-control."""
    clang = Path("/usr/bin/clang").resolve(strict=True)
    lld_link = (
        Path.home()
        / ".rustup/toolchains/stable-aarch64-apple-darwin/lib/rustlib/"
          "aarch64-apple-darwin/bin/gcc-ld/lld-link"
    ).resolve(strict=True)
    return {"clang": clang, "lld_link": lld_link}


def build_native_helper(builder: str, executable: str, target: Path, tools: dict[str, Path]) -> dict[str, Any]:
    script = API_ROOT / "scripts" / builder
    if script.is_symlink() or not script.is_file():
        raise WorkerError(f"Governed native helper builder is unavailable: {script}")
    subprocess.run(
        [
            sys.executable, str(script),
            "--clang", str(tools["clang"]),
            "--lld-link", str(tools["lld_link"]),
            "--output", str(target),
        ],
        cwd=str(API_ROOT),
        check=True,
        timeout=180,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return file_identity(target / executable)


def prepare_memory_control_runtime(run_id: str, manifest: dict[str, Any]) -> dict[str, Any]:
    """Build/rebuild the read-only observer lane before one known-control run."""
    manifest = validate_native_manifest(manifest)
    root = worker_evidence_root().parent / "preflights" / run_id
    if root.exists() or root.is_symlink():
        raise WorkerError(f"Native memory-control preflight already exists: {root}")
    root.mkdir(parents=True, mode=0o700)
    if root.is_symlink():
        raise WorkerError("Native memory-control preflight root cannot be a symlink.")

    manifest_path = root / "control-manifest.json"
    manifest_bytes = (canonical_json(manifest) + "\n").encode("utf-8")
    with manifest_path.open("xb") as handle:
        handle.write(manifest_bytes)
        handle.flush()
        os.fsync(handle.fileno())
    manifest_path.chmod(0o400)
    manifest_identity = file_identity(manifest_path)

    tools = fixed_native_tools()
    builds = []
    for suffix in ("a", "b"):
        observer = build_native_helper(
            "build_replay_memory_observer.py", "replay-memory-observer.exe",
            root / f"observer-{suffix}", tools,
        )
        controller = build_native_helper(
            "build_replay_playback_controller.py", "replay-playback-controller.exe",
            root / f"controller-{suffix}", tools,
        )
        builds.append({"observer": observer, "controller": controller})

    for role in ("observer", "controller"):
        if (
            builds[0][role]["sha256"] != builds[1][role]["sha256"]
            or builds[0][role]["byte_size"] != builds[1][role]["byte_size"]
        ):
            raise WorkerError(f"Native {role} helper did not reproduce byte-for-byte.")

    receipt = {
        "schema": "aoe2war-native-memory-control-preflight/v1",
        "runId": run_id,
        "candidateOnly": True,
        "apiHead": git_head(API_ROOT),
        "manifest": manifest_identity,
        "tools": {key: file_identity(value) for key, value in tools.items()},
        "helpers": builds,
        "reproducible": True,
        "writesTargetMemory": False,
        "resultAuthority": False,
        "promotionAuthority": False,
        "bettingAuthority": False,
        "settlementAuthority": False,
        "woloAuthority": False,
    }
    receipt_path = root / "preflight.json"
    with receipt_path.open("xb") as handle:
        handle.write((canonical_json(receipt) + "\n").encode("utf-8"))
        handle.flush()
        os.fsync(handle.fileno())
    receipt_path.chmod(0o400)
    return {
        "manifest": manifest_identity,
        "observer": builds[0]["observer"],
        "controller": builds[0]["controller"],
        "preflight": file_identity(receipt_path),
    }


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
    expected_game_stats_id: int,
    expected_sha256: str,
    destination_dir: Path,
    manifest: dict[str, Any] | None = None,
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
            if manifest is not None:
                validate_native_manifest(manifest)
                if response.headers.get("X-AoE2WAR-Manifest-SHA256", "") != manifest["manifestSha256"]:
                    raise WorkerError("Server manifest identity does not match the queued native control.")
            advertised = response.headers.get("X-AoE2WAR-Replay-SHA256", "").strip()
            if advertised != expected_sha256:
                raise WorkerError(
                    "Server replay identity does not match the queued native-run identity."
                )
            advertised_game_id = response.headers.get(
                "X-AoE2WAR-Game-Stats-ID", ""
            ).strip()
            if advertised_game_id != str(expected_game_stats_id):
                raise WorkerError(
                    "Server GameStats identity does not match the queued native-run identity."
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
    if manifest is not None and total != manifest["archive"]["byteSize"]:
        raise WorkerError("Downloaded replay byte size differs from the immutable manifest.")
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
    manifest: dict[str, Any] | None = None,
) -> tuple[Path, int, str]:
    # General controls must obtain a fresh server-fenced artifact. The legacy
    # exact canary retains its existing independently hashed local fallback.
    local_control = TRUSTED_LOCAL_CONTROLS.get(game_stats_id)
    if manifest is None and local_control is not None and local_control.exists():
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
        expected_game_stats_id=game_stats_id,
        expected_sha256=replay_sha256,
        destination_dir=destination_dir,
        **({"manifest": manifest} if manifest is not None else {}),
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


def record_runner_failure(
    *, output: Path, game_stats_id: int, replay_sha256: str, runner_returncode: int,
    runner_output: str, token: str, manifest: dict[str, Any] | None,
) -> dict[str, Any]:
    """Preserve prelaunch errors even when the runner never creates its receipt."""
    tail = runner_output[-8000:]
    if token:
        tail = tail.replace(token, "[redacted bridge credential]")
    payload = {
        "kind": "aoe2war-native-replay-candidate", "schema": 1,
        "status": "native_runner_failed_before_receipt", "candidateOnly": True,
        "gameStatsId": game_stats_id, "replaySha256": replay_sha256,
        "manifestSha256": manifest["manifestSha256"] if manifest else None,
        "runnerReturnCode": runner_returncode, "runnerOutputTail": tail,
        "loaded": False, "terminalOutcomeProven": False, "cleanupComplete": None,
        "authority": {
            "replayTruthPromoted": False, "productionResultsMutated": False,
            "bettingMutated": False, "woloMutated": False, "settlementMutated": False,
        },
    }
    failure_path = output.parent / (output.name + ".worker-failure.json")
    with failure_path.open("xb") as handle:
        handle.write((canonical_json(payload) + "\n").encode("utf-8"))
    failure_path.chmod(0o400)
    return {**payload, "failureReceiptPath": str(failure_path), "failureReceiptSha256": sha256_file(failure_path)}


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
            "memoryTerminalCandidate": observation.get("native_memory_terminal_candidate"),
            "gameOverCandidate": observation.get("native_game_over_result_candidate"),
            "terminalEvidenceKind": observation.get("terminal_evidence_kind"),
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


def independently_revalidate_control_evidence(
    output: Path, manifest: dict[str, Any],
) -> dict[str, Any]:
    """Rehash the witness and recompute terminal bytes before control comparison."""
    manifest = validate_native_manifest(manifest)
    if output.is_symlink() or not output.is_dir():
        raise WorkerError("Native evidence directory must be one real directory.")
    root = output.resolve(strict=True)

    def bound_file(path_value: str) -> Path:
        path = Path(path_value)
        if path.is_symlink() or path.resolve(strict=True).parent != root or not path.is_file():
            raise WorkerError("Native evidence file escaped the immutable attempt directory.")
        return path

    for name in ("attempt.json", "plan.json", "receipt.json", "validation.json", "observation.json", "invocation.json"):
        bound_file(str(output / name))
    attempt = read_json(output / "attempt.json")
    plan = read_json(output / "plan.json")
    receipt = read_json(output / "receipt.json")
    validation = read_json(output / "validation.json")
    observation = read_json(output / "observation.json")
    invocation = read_json(output / "invocation.json")
    artifact = plan.get("artifact", {})
    expected_slots = [player["slot"] for player in manifest["roster"]]
    if (
        artifact.get("sha256") != manifest["replaySha256"]
        or artifact.get("byte_size") != manifest["archive"]["byteSize"]
        or plan.get("expected_roster_slots") != expected_slots
    ):
        raise WorkerError("Native witness plan differs from the immutable manifest.")
    artifact_path = bound_file(str(artifact.get("path", "")))
    if artifact_path.name != manifest["archive"]["objectKey"]:
        raise WorkerError("Native replay archive object identity differs from the manifest.")
    runtime = plan.get("runtime", {})
    if runtime.get("executable", {}).get("sha256") != EXPECTED_EXECUTABLE_SHA256 or not any(
        row.get("sha256") == EXPECTED_DATA_SHA256 for row in runtime.get("data_files", [])
    ):
        raise WorkerError("Native witness runtime differs from the governed executable/data.")

    # Reuse the existing independent byte/schema referee. It rehashes the replay,
    # fixed engine runtime and every receipt evidence file; stored JSON flags are
    # insufficient. Loading this exact sibling source does not execute playback.
    witness_path = API_ROOT / "utils/replay_engine_witness.py"
    spec = importlib.util.spec_from_file_location("aoe2war_native_witness_referee", witness_path)
    if spec is None or spec.loader is None:
        raise WorkerError("Native witness referee is unavailable.")
    witness = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(witness)
    recomputed = witness.validate_receipt(plan, receipt)
    if any(validation.get(key) != recomputed.get(key) for key in (
        "status", "plan_sha256", "receipt_sha256", "file_integrity_verified",
        "observation_semantics_independently_verified", "automatic_promotion_allowed", "settlement_authority",
    )):
        raise WorkerError("Native receipt validation changed during independent revalidation.")
    if not isinstance(attempt.get("artifacts"), list):
        raise WorkerError("Native attempt has no immutable evidence inventory.")
    evidence_names: set[str] = set()
    for identity in attempt["artifacts"]:
        path = bound_file(str(identity.get("path", "")))
        if path.name in evidence_names or path.stat().st_size != identity.get("byte_size") or sha256_file(path) != identity.get("sha256"):
            raise WorkerError("Native attempt evidence hash or size mismatch.")
        evidence_names.add(path.name)
    if not {"plan.json", "receipt.json", "validation.json", "observation.json", "invocation.json", "events.jsonl"}.issubset(evidence_names):
        raise WorkerError("Native attempt evidence inventory is incomplete.")

    requested_path = "Z:" + str(artifact_path).replace("/", "\\")
    if invocation.get("replay_selection", {}).get("requested_path") != requested_path or invocation.get("steam_app_context") is not True:
        raise WorkerError("Native invocation did not bind the exact Steam-context replay.")
    performance_matches = 0
    for identity in observation.get("native_performance_outputs", []):
        path = bound_file(str(identity.get("path", "")))
        if path.name not in evidence_names or sha256_file(path) != identity.get("sha256"):
            raise WorkerError("Native load evidence hash mismatch.")
        text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
        record = text[text.find(requested_path):] if text.count(requested_path) == 1 else ""
        metrics = [
            re.search(rf"{title}\n\tAverage: [0-9]+(?:\.[0-9]+)?ms\n\tLow: [0-9]+(?:\.[0-9]+)?ms\n\tHigh: [0-9]+(?:\.[0-9]+)?ms\n\tSpike: [0-9]+(?:\.[0-9]+)?ms", record)
            for title in ("Update", "Render")
        ]
        metrics.append(re.search(r"FPS\n\tAverage: [0-9]+(?:\.[0-9]+)?fps\n\tLow: [0-9]+(?:\.[0-9]+)?fps\n\tHigh: [0-9]+(?:\.[0-9]+)?fps", record))
        if text.count(requested_path) == 1 and text.lower().count(".aoe2record") == 1 and all(metrics):
            performance_matches += 1
    if performance_matches != 1:
        raise WorkerError("Independent exact native replay load is not proven.")

    result = receipt.get("observations", {}).get("result", {})
    terminal_kind = observation.get("terminal_evidence_kind")
    if terminal_kind == "native_memory_terminal":
        memory_path = bound_file(str(output / "memory-observer.jsonl"))
        if memory_path.name not in evidence_names:
            raise WorkerError("Native memory terminal capture is absent from the immutable evidence inventory.")
        observer_binding = invocation.get("memory_observer", {}).get("staged_identity")
        if type(observer_binding) is not dict or observer_binding.get("sha256") != sha256_file(
            bound_file(str(observer_binding.get("path", "")))
        ):
            raise WorkerError("Native memory observer helper binding changed.")
        module_path = API_ROOT / "utils/replay_engine_memory.py"
        spec = importlib.util.spec_from_file_location("aoe2war_native_memory_referee", module_path)
        if spec is None or spec.loader is None:
            raise WorkerError("Native memory terminal referee is unavailable.")
        memory = importlib.util.module_from_spec(spec)
        api_source = str(API_ROOT)
        sys.path.insert(0, api_source)
        try:
            spec.loader.exec_module(memory)
        finally:
            if sys.path and sys.path[0] == api_source:
                sys.path.pop(0)
            else:
                try:
                    sys.path.remove(api_source)
                except ValueError:
                    pass
        recomputed_memory = memory.parse_memory_terminal_candidate(
            memory_path,
            game_id=manifest["gameStatsId"],
            replay_sha256=manifest["replaySha256"],
            executable_sha256=EXPECTED_EXECUTABLE_SHA256,
            observer_sha256=observer_binding["sha256"],
            runtime_sha256=sha256_file(bound_file(str(output / "runtime.json"))),
            capture_sha256=sha256_file(memory_path),
            expected_module_path=invocation.get("executable_windows_path"),
            run_id=attempt.get("run_id"),
            evidence_id="memory-observer.jsonl",
            control_manifest=manifest,
            expected_replay_bytes=manifest["archive"]["byteSize"],
        )
        if recomputed_memory.get("proven") is not True or type(recomputed_memory.get("match")) is not dict:
            raise WorkerError("Independent repeated native memory terminal proof is unavailable.")
        if canonical_json(recomputed_memory) != canonical_json(observation.get("native_memory_terminal_candidate")):
            raise WorkerError("Stored native memory terminal candidate differs from independent recomputation.")
        match = recomputed_memory["match"]
        if (
            sorted(match.get("roster_slots", [])) != expected_slots
            or sorted(match.get("winning_slots", [])) != sorted(result.get("winning_slots", []))
            or sorted(match.get("losing_slots", [])) != sorted(result.get("losing_slots", []))
            or result.get("evidence_refs") != ["memory-observer.jsonl"]
        ):
            raise WorkerError("Independent native memory terminal partition is absent, ambiguous or changed.")
    elif terminal_kind == "native_ailog":
        terminal_partitions = []
        native_before = observation.get("native_logs_before")
        native_after = observation.get("native_logs_after")
        if type(native_before) is not dict or type(native_after) is not dict:
            raise WorkerError("Native terminal evidence lacks before/after log inventories.")
        for row in observation.get("copied_native_logs", []):
            delta = row.get("delta_copy")
            source = row.get("source", {})
            source_path = source.get("path", "")
            if Path(source_path).parent.name.lower() != "ailog":
                continue
            if native_after.get(source_path) != source:
                raise WorkerError("Native full log does not bind the after-snapshot identity.")
            if source.get("byte_size") == 0 and row.get("copy") is None and delta is None:
                continue
            copied = row.get("copy")
            if type(copied) is not dict or type(delta) is not dict or row.get("delta_reason") is not None:
                raise WorkerError("Native terminal log does not prove an append-safe copy.")
            full_path = bound_file(str(copied.get("path", "")))
            full_bytes = full_path.read_bytes()
            if (
                full_path.name not in evidence_names
                or len(full_bytes) != copied.get("byte_size")
                or hashlib.sha256(full_bytes).hexdigest() != copied.get("sha256")
                or copied.get("sha256") != source.get("sha256")
                or copied.get("byte_size") != source.get("byte_size")
            ):
                raise WorkerError("Native full log copy differs from the after-snapshot bytes.")
            prior = native_before.get(source_path)
            prior_size = 0
            if prior is not None:
                if type(prior) is not dict or prior.get("path") != source_path or type(prior.get("byte_size")) is not int:
                    raise WorkerError("Native before-snapshot identity is invalid.")
                prior_size = prior["byte_size"]
                if prior_size < 0 or prior_size > len(full_bytes) or hashlib.sha256(full_bytes[:prior_size]).hexdigest() != prior.get("sha256"):
                    raise WorkerError("Native prior-prefix bytes do not match the before-snapshot hash/size.")
            if type(row.get("delta_start")) is not int or row["delta_start"] != prior_size:
                raise WorkerError("Native delta boundary differs from the independently derived prior prefix.")
            path = bound_file(str(delta.get("path", "")))
            if path.name not in evidence_names or sha256_file(path) != delta.get("sha256") or path.stat().st_size != delta.get("byte_size"):
                raise WorkerError("Native terminal evidence hash mismatch.")
            if path.read_bytes() != full_bytes[prior_size:]:
                raise WorkerError("Native terminal delta is not the exact attempt-new full-log suffix.")
            if not delta.get("byte_size"):
                continue
            text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
            if text.count("GAME OVER!") != 1:
                continue
            blocks = re.findall(r"GAME OVER!\n((?:  Player #[0-9]+ (?:Won|Lost)\.\n)+)", text)
            if len(blocks) != 1:
                continue
            outcomes = [(int(slot), outcome) for slot, outcome in re.findall(r"  Player #([0-9]+) (Won|Lost)\.", blocks[0])]
            slots = [slot for slot, _ in outcomes]
            winners = sorted(slot for slot, outcome in outcomes if outcome == "Won")
            losers = sorted(slot for slot, outcome in outcomes if outcome == "Lost")
            if sorted(slots) == expected_slots and len(set(slots)) == len(slots) and winners and losers:
                terminal_partitions.append((winners, losers))
        if len(terminal_partitions) != 1 or terminal_partitions[0] != (
            sorted(result.get("winning_slots", [])), sorted(result.get("losing_slots", [])),
        ):
            raise WorkerError("Independent native GAME OVER partition is absent, ambiguous or changed.")
    else:
        raise WorkerError("Native terminal evidence kind is absent or unsupported.")
    return validate_control_observations(manifest, attempt, receipt, validation, independently_verified=True)


def apply_manifest_control_validation(
    *, manifest: dict[str, Any], output: Path, payload: dict[str, Any], candidate_exit_code: int,
) -> tuple[dict[str, Any], int]:
    payload["manifestSha256"] = manifest["manifestSha256"]
    payload["sourceSnapshotSha256"] = manifest["sourceSnapshotSha256"]
    if payload.get("status") != "candidate_terminal_witness":
        payload["trustedControlValidation"] = {"status": "not_run", "reason": "native terminal witness is not available"}
        return payload, candidate_exit_code
    try:
        control = independently_revalidate_control_evidence(output, manifest)
    except (OSError, ValueError, WorkerError) as exc:
        payload["status"] = "trusted_control_failed"
        payload["trustedControlValidation"] = {"status": "FAIL", "detail": str(exc)}
        return payload, 7
    control_path = output / "trusted-control-validation.json"
    with control_path.open("xb") as handle:
        handle.write((canonical_json(control) + "\n").encode("utf-8"))
    control_path.chmod(0o400)
    payload["status"] = "candidate_terminal_witness_control_pass"
    payload["trustedControlValidation"] = control
    payload["statsOnlyReviewEvidence"] = build_stats_only_review_evidence(manifest, control)
    payload["evidenceSha256"]["trusted-control-validation.json"] = sha256_file(control_path)
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
    parser.add_argument("--manifest-json", required=True)
    parser.add_argument(
        "--api-source", type=Path,
        help="canonical sibling api-prodn checkout or one governed worktree",
    )
    args = parser.parse_args()
    if args.api_source is not None:
        configure_api_source(args.api_source)

    with native_execution_lock():
        return run_native_attempt(args)


def run_native_attempt(args: argparse.Namespace) -> int:
    if args.manifest_json is None:
        raise WorkerError("Immutable known-control manifest is required for native execution.")
    manifest = load_manifest_json(args.manifest_json)

    if not __import__("re").fullmatch(r"[A-Za-z0-9-]{1,100}", args.run_id):
        raise WorkerError("Invalid AoE2WAR OS run id.")
    replay_sha256 = args.replay_sha256.strip().lower()
    if not SHA256_RE.fullmatch(replay_sha256):
        raise WorkerError("Invalid replay SHA-256.")
    slots = sorted(set(args.roster_slot))
    if len(slots) < 2 or len(slots) > 8 or any(slot < 1 or slot > 8 for slot in slots):
        raise WorkerError("Native replay worker requires 2-8 unique roster slots 1-8.")
    if (
        args.game_stats_id != manifest["gameStatsId"] or args.replay_sha256 != manifest["replaySha256"]
        or args.roster_slot != [player["slot"] for player in manifest["roster"]]
    ):
        raise WorkerError("Worker command identity differs from the immutable manifest.")
    if not 1 <= args.native_performance_seconds <= 240:
        raise WorkerError("native-performance-seconds is outside the governed bound.")
    if not args.native_performance_seconds + 15 <= args.timeout_seconds <= 300:
        raise WorkerError("timeout-seconds is outside the governed bound.")

    source_identity = require_runtime()
    token = load_token()
    output = worker_evidence_root() / args.run_id
    if output.exists() or output.is_symlink() or (output.parent / (output.name + ".worker-failure.json")).exists():
        raise WorkerError(f"Native attempt directory already exists: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    memory_runtime = prepare_memory_control_runtime(args.run_id, manifest)

    with tempfile.TemporaryDirectory(prefix="aoe2war-native-replay-") as temp_dir:
        artifact, byte_size, artifact_source = materialize_replay(
            game_stats_id=args.game_stats_id,
            replay_sha256=replay_sha256,
            base_url=args.url.rstrip("/"),
            token=token,
            run_id=args.run_id,
            destination_dir=Path(temp_dir),
            **({"manifest": manifest} if manifest is not None else {}),
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
        command.extend([
            "--native-fast-replay",
            "--memory-observer", memory_runtime["observer"]["path"],
            "--expected-memory-observer-sha256", memory_runtime["observer"]["sha256"],
            "--playback-controller", memory_runtime["controller"]["path"],
            "--expected-playback-controller-sha256", memory_runtime["controller"]["sha256"],
            "--control-manifest", memory_runtime["manifest"]["path"],
            "--expected-control-manifest-sha256", memory_runtime["manifest"]["sha256"],
        ])
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

    if not all((output / name).is_file() for name in (
        "attempt.json", "receipt.json", "validation.json", "observation.json",
    )):
        failure = record_runner_failure(
            output=output, game_stats_id=args.game_stats_id, replay_sha256=replay_sha256,
            runner_returncode=process.returncode, runner_output=process.stdout or "",
            token=token, manifest=manifest,
        )
        print(json.dumps(failure, sort_keys=True))
        return 2
    payload, exit_code = result_payload(
        game_stats_id=args.game_stats_id,
        replay_sha256=replay_sha256,
        output=output,
        runner_returncode=process.returncode,
    )
    payload["artifactByteSize"] = byte_size
    payload["artifactSource"] = artifact_source
    payload["sourceIdentity"] = source_identity
    if memory_runtime is not None:
        payload["memoryControlPreflight"] = memory_runtime["preflight"]
    if manifest is not None:
        manifest_path = output / "native-manifest.json"
        with manifest_path.open("xb") as handle:
            handle.write((canonical_json(manifest) + "\n").encode("utf-8"))
        manifest_path.chmod(0o400)
        payload["evidenceSha256"]["native-manifest.json"] = sha256_file(manifest_path)
        payload, exit_code = apply_manifest_control_validation(
            manifest=manifest, output=output, payload=payload, candidate_exit_code=exit_code,
        )
    else:
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
    except (OSError, WorkerError, NativeReplayContractError, subprocess.SubprocessError) as exc:
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
