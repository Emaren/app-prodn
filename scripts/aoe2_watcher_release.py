#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import fcntl
import hashlib
import hmac
import json
import os
import re
import shlex
import shutil
import stat
import subprocess
import sys
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import aoe2_watcher_staging as staging

CONTRACT_PATH = ROOT / "config" / "aoe2war-operations.json"
WATCHER_REPO = ROOT.parent / "aoe2-watcher"
DEFAULT_SOURCE = WATCHER_REPO / "dist"

CANONICAL_PREVIEW_HOST = "hel1"
CANONICAL_APPLY_HOST = "root@hel1"
CANONICAL_GITHUB_REPO = "Emaren/aoe2-watcher"
CANONICAL_DOWNLOAD_ROOT = "/mnt/HC_Volume_105319120/aoe2-downloads"
CANONICAL_STAGING_ROOT = (
    "/mnt/HC_Volume_105319120/aoe2war/watcher-release-staging"
)
CANONICAL_RECEIPT_ROOT = (
    "/mnt/HC_Volume_105319120/aoe2war/os-control/"
    "watcher-release-promotion-receipts"
)
CANONICAL_LOCK_PATH = (
    "/mnt/HC_Volume_105319120/aoe2war/os-control/locks/"
    "watcher-release-promotion.lock"
)
VERSION_RE = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")


class WatcherReleasePromotionError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def receipt_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_files(version: str) -> list[str]:
    return [
        f"AoE2HDBets Watcher Setup {version}.exe",
        f"AoE2HDBets Watcher {version}.exe",
        f"AoE2HDBets Watcher-{version}-arm64.dmg",
        "aoe2hdbets-watcher-direct.zip",
        f"AoE2HDBets Watcher-{version}.AppImage",
        f"AoE2HDBets Watcher-{version}-arm64.dmg.blockmap",
        "latest.yml",
        "latest-mac.yml",
        "latest-linux.yml",
    ]


def receipt_files(version: str) -> list[str]:
    return [
        f"SHA256SUMS-{version}.txt",
        f"watcher-release-manifest-{version}.json",
    ]


def all_release_files(version: str) -> list[str]:
    return canonical_files(version) + receipt_files(version)


def promotion_order(version: str) -> list[str]:
    files = canonical_files(version)
    return files[:6] + receipt_files(version) + files[6:]


def load_contract(path: Path = CONTRACT_PATH) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise WatcherReleasePromotionError(
            f"cannot read operations contract {path}: {exc}"
        ) from exc
    if not isinstance(payload, dict) or payload.get("schema") != 1:
        raise WatcherReleasePromotionError(
            "unsupported operations contract"
        )
    return payload


def policy_from_contract(contract: dict[str, Any]) -> dict[str, Any]:
    raw = contract.get("watcher_release_promotion")
    rollback = contract.get("rollback_archive")
    protected = contract.get("protected")
    canonical = contract.get("canonical")
    if not isinstance(raw, dict):
        raise WatcherReleasePromotionError(
            "operations contract has no watcher_release_promotion block"
        )
    if not isinstance(rollback, dict):
        raise WatcherReleasePromotionError(
            "operations contract has no rollback_archive authority"
        )
    if not isinstance(protected, dict) or not isinstance(canonical, dict):
        raise WatcherReleasePromotionError(
            "operations contract is missing canonical/protected authority"
        )
    if rollback.get("root_maintenance_host") != CANONICAL_APPLY_HOST:
        raise WatcherReleasePromotionError(
            "rollback_archive.root_maintenance_host must remain "
            f"{CANONICAL_APPLY_HOST!r}"
        )
    if canonical.get("production_host") != CANONICAL_PREVIEW_HOST:
        raise WatcherReleasePromotionError(
            "canonical.production_host drifted"
        )
    if protected.get("wolo_listener_ports") != [8092, 8093]:
        raise WatcherReleasePromotionError(
            "protected Wolo listener ports must remain [8092, 8093]"
        )

    expected = {
        "default_mode": "preview-read-only",
        "github_repo": CANONICAL_GITHUB_REPO,
        "download_root": CANONICAL_DOWNLOAD_ROOT,
        "staging_root": CANONICAL_STAGING_ROOT,
        "receipt_root": CANONICAL_RECEIPT_ROOT,
        "lock_path": CANONICAL_LOCK_PATH,
        "require_public_release_digest_match": True,
        "require_runtime_identity_recheck": True,
        "wolo_mutation_allowed": False,
    }
    for key, value in expected.items():
        if raw.get(key) != value:
            raise WatcherReleasePromotionError(
                f"watcher_release_promotion.{key} must be exactly {value!r}"
            )

    policy = {
        "preview_host": CANONICAL_PREVIEW_HOST,
        "apply_host": CANONICAL_APPLY_HOST,
        "github_repo": CANONICAL_GITHUB_REPO,
        "download_root": CANONICAL_DOWNLOAD_ROOT,
        "staging_root": CANONICAL_STAGING_ROOT,
        "receipt_root": CANONICAL_RECEIPT_ROOT,
        "lock_path": CANONICAL_LOCK_PATH,
        "production_repo": staging.CANONICAL_REPO,
        "service": staging.CANONICAL_SERVICE,
        "volume_mount": staging.CANONICAL_VOLUME,
        "wolo_ports": [8092, 8093],
    }
    validate_policy(policy)
    return policy


def validate_policy(policy: dict[str, Any]) -> None:
    exact = {
        "preview_host": CANONICAL_PREVIEW_HOST,
        "apply_host": CANONICAL_APPLY_HOST,
        "github_repo": CANONICAL_GITHUB_REPO,
        "download_root": CANONICAL_DOWNLOAD_ROOT,
        "staging_root": CANONICAL_STAGING_ROOT,
        "receipt_root": CANONICAL_RECEIPT_ROOT,
        "lock_path": CANONICAL_LOCK_PATH,
        "production_repo": staging.CANONICAL_REPO,
        "service": staging.CANONICAL_SERVICE,
        "volume_mount": staging.CANONICAL_VOLUME,
        "wolo_ports": [8092, 8093],
    }
    if set(policy) != set(exact):
        raise WatcherReleasePromotionError(
            "Watcher release promotion policy fields are incomplete "
            "or unexpected"
        )
    for key, value in exact.items():
        if policy.get(key) != value:
            raise WatcherReleasePromotionError(
                f"Watcher release promotion policy {key} must be "
                f"exactly {value!r}"
            )


def encode_payload(value: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(canonical_json(value)).decode("ascii")


def decode_payload(value: str) -> dict[str, Any]:
    try:
        decoded = json.loads(
            base64.urlsafe_b64decode(value.encode("ascii")).decode("utf-8")
        )
    except Exception as exc:
        raise WatcherReleasePromotionError(
            f"cannot decode remote payload: {exc}"
        ) from exc
    if not isinstance(decoded, dict):
        raise WatcherReleasePromotionError(
            "remote payload must be a JSON object"
        )
    return decoded


def require_direct_directory(path: Path, label: str) -> os.stat_result:
    try:
        info = os.lstat(path)
    except OSError as exc:
        raise WatcherReleasePromotionError(
            f"cannot inspect {label} {path}: {exc}"
        ) from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise WatcherReleasePromotionError(
            f"{label} must be a direct directory: {path}"
        )
    return info


def require_regular_file(path: Path, label: str) -> os.stat_result:
    try:
        info = os.lstat(path)
    except OSError as exc:
        raise WatcherReleasePromotionError(
            f"cannot inspect {label} {path}: {exc}"
        ) from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise WatcherReleasePromotionError(
            f"{label} must be a regular non-symlink file: {path}"
        )
    return info


def validate_bundle(root: Path, version: str) -> list[dict[str, Any]]:
    if not VERSION_RE.fullmatch(version):
        raise WatcherReleasePromotionError(
            f"invalid Watcher version: {version!r}"
        )
    require_direct_directory(root, "Watcher release source")

    canonical = canonical_files(version)
    receipts = receipt_files(version)
    for name in canonical + receipts:
        require_regular_file(root / name, f"Watcher release file {name}")

    try:
        manifest = json.loads(
            (root / receipts[1]).read_text(encoding="utf-8")
        )
    except Exception as exc:
        raise WatcherReleasePromotionError(
            f"cannot parse Watcher release manifest: {exc}"
        ) from exc
    if (
        not isinstance(manifest, dict)
        or not isinstance(manifest.get("schema"), int)
        or int(manifest["schema"]) < 1
        or manifest.get("version") != version
        or not isinstance(manifest.get("files"), list)
    ):
        raise WatcherReleasePromotionError(
            "Watcher release manifest identity is invalid"
        )

    rows = manifest["files"]
    names = [row.get("filename") for row in rows if isinstance(row, dict)]
    if names != canonical:
        raise WatcherReleasePromotionError(
            "Watcher release manifest inventory mismatch"
        )

    manifest_hashes: dict[str, str] = {}
    inventory: list[dict[str, Any]] = []
    for row in rows:
        name = str(row["filename"])
        file_path = root / name
        info = require_regular_file(file_path, name)
        digest = sha256_file(file_path)
        if row.get("bytes") != info.st_size:
            raise WatcherReleasePromotionError(
                f"Watcher release manifest byte-size mismatch: {name}"
            )
        if row.get("sha256") != digest:
            raise WatcherReleasePromotionError(
                f"Watcher release manifest SHA-256 mismatch: {name}"
            )
        manifest_hashes[name] = digest
        inventory.append({
            "name": name,
            "bytes": info.st_size,
            "sha256": digest,
        })

    checksum_entries: dict[str, str] = {}
    for line in (root / receipts[0]).read_text(
        encoding="utf-8"
    ).splitlines():
        if not line:
            continue
        match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
        if not match:
            raise WatcherReleasePromotionError(
                "Watcher checksum receipt contains an invalid row"
            )
        digest, name = match.groups()
        if name in checksum_entries:
            raise WatcherReleasePromotionError(
                f"Watcher checksum receipt contains duplicate file: {name}"
            )
        checksum_entries[name] = digest

    if set(checksum_entries) != set(canonical):
        raise WatcherReleasePromotionError(
            "Watcher checksum receipt inventory mismatch"
        )
    for name in canonical:
        if checksum_entries[name] != manifest_hashes[name]:
            raise WatcherReleasePromotionError(
                "Watcher checksum and release manifest disagree: "
                + name
            )

    rules = {
        "latest.yml": f"AoE2HDBets Watcher Setup {version}.exe",
        "latest-mac.yml": f"AoE2HDBets Watcher-{version}-arm64.dmg",
        "latest-linux.yml": f"AoE2HDBets Watcher-{version}.AppImage",
    }
    for name, expected_path in rules.items():
        lines = (root / name).read_text(encoding="utf-8").splitlines()
        if f"version: {version}" not in lines:
            raise WatcherReleasePromotionError(
                f"Watcher updater version mismatch: {name}"
            )
        if f"path: {expected_path}" not in lines:
            raise WatcherReleasePromotionError(
                f"Watcher updater path mismatch: {name}"
            )

    for name in receipts:
        file_path = root / name
        info = require_regular_file(file_path, name)
        inventory.append({
            "name": name,
            "bytes": info.st_size,
            "sha256": sha256_file(file_path),
        })
    return inventory


def github_release(version: str, repo: str) -> dict[str, Any]:
    process = subprocess.run(
        ["gh", "api", f"repos/{repo}/releases/tags/v{version}"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=60,
        check=False,
    )
    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "").strip()
        raise WatcherReleasePromotionError(
            f"cannot read public Watcher release v{version}: {detail}"
        )
    try:
        payload = json.loads(process.stdout)
    except Exception as exc:
        raise WatcherReleasePromotionError(
            "public Watcher release returned invalid JSON"
        ) from exc
    if (
        not isinstance(payload, dict)
        or payload.get("tag_name") != f"v{version}"
        or payload.get("draft") is True
        or payload.get("prerelease") is True
        or not isinstance(payload.get("assets"), list)
    ):
        raise WatcherReleasePromotionError(
            "public Watcher release identity is invalid"
        )
    return payload


def prove_public_release(
    inventory: list[dict[str, Any]],
    release: dict[str, Any],
) -> dict[str, Any]:
    asset_digests: dict[str, list[str]] = {}
    for asset in release["assets"]:
        if not isinstance(asset, dict):
            continue
        digest = str(asset.get("digest") or "")
        if not digest.startswith("sha256:"):
            continue
        value = digest.removeprefix("sha256:")
        if not re.fullmatch(r"[0-9a-f]{64}", value):
            continue
        asset_digests.setdefault(value, []).append(
            str(asset.get("name") or "")
        )

    missing = [
        row["name"]
        for row in inventory
        if row["sha256"] not in asset_digests
    ]
    if missing:
        raise WatcherReleasePromotionError(
            "certified local bundle does not match public GitHub "
            "release asset digests: " + ", ".join(missing)
        )
    return {
        "release_id": release.get("id"),
        "tag_name": release.get("tag_name"),
        "published_at": release.get("published_at"),
        "asset_count": len(release["assets"]),
        "digest_matched_files": len(inventory),
    }


def package_version(watcher_repo: Path = WATCHER_REPO) -> str:
    try:
        payload = json.loads(
            (watcher_repo / "package.json").read_text(encoding="utf-8")
        )
    except Exception as exc:
        raise WatcherReleasePromotionError(
            f"cannot read Watcher package version: {exc}"
        ) from exc
    version = str(payload.get("version") or "")
    if not VERSION_RE.fullmatch(version):
        raise WatcherReleasePromotionError(
            f"invalid Watcher package version: {version!r}"
        )
    return version


def build_plan(
    source: Path,
    version: str,
    policy: dict[str, Any],
) -> dict[str, Any]:
    validate_policy(policy)
    inventory = validate_bundle(source, version)
    public = prove_public_release(
        inventory,
        github_release(version, policy["github_repo"]),
    )
    binding = {
        "schema": 1,
        "kind": "aoe2war-watcher-release-promotion-plan",
        "version": version,
        "files": inventory,
        "public_release": public,
        "download_root": policy["download_root"],
        "staging_root": policy["staging_root"],
        "promotion_order": promotion_order(version),
        "wolo_mutation_allowed": False,
    }
    return {
        **binding,
        "generated_at": utc_now(),
        "bundle_digest_sha256": sha256_bytes(canonical_json(binding)),
    }


def verify_plan(plan: dict[str, Any]) -> None:
    version = str(plan.get("version") or "")
    if not VERSION_RE.fullmatch(version):
        raise WatcherReleasePromotionError(
            "promotion plan version is invalid"
        )
    expected_names = all_release_files(version)
    rows = plan.get("files")
    if (
        not isinstance(rows, list)
        or [row.get("name") for row in rows] != expected_names
    ):
        raise WatcherReleasePromotionError(
            "promotion plan inventory is invalid"
        )
    for row in rows:
        if (
            not isinstance(row.get("bytes"), int)
            or int(row["bytes"]) < 0
            or not re.fullmatch(
                r"[0-9a-f]{64}", str(row.get("sha256") or "")
            )
        ):
            raise WatcherReleasePromotionError(
                f"promotion plan file evidence is invalid: {row.get('name')}"
            )
    binding = {
        key: plan[key]
        for key in (
            "schema",
            "kind",
            "version",
            "files",
            "public_release",
            "download_root",
            "staging_root",
            "promotion_order",
            "wolo_mutation_allowed",
        )
    }
    actual = sha256_bytes(canonical_json(binding))
    expected = str(plan.get("bundle_digest_sha256") or "")
    if not hmac.compare_digest(actual, expected):
        raise WatcherReleasePromotionError(
            "promotion plan digest is invalid"
        )
    if plan["promotion_order"] != promotion_order(version):
        raise WatcherReleasePromotionError(
            "promotion plan order is invalid"
        )


def stage_path(policy: dict[str, Any], plan: dict[str, Any]) -> str:
    return (
        f"{policy['staging_root']}/"
        f"promote-{plan['version']}-{plan['bundle_digest_sha256'][:12]}"
    )


def run_checked(
    args: list[str],
    *,
    timeout: int = 60,
    input_text: str | None = None,
) -> str:
    process = subprocess.run(
        args,
        input=input_text,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "").strip()
        raise WatcherReleasePromotionError(
            f"{shlex.join(args)} failed with exit "
            f"{process.returncode}: {detail}"
        )
    return process.stdout.strip()


def create_remote_stage(
    policy: dict[str, Any],
    remote_stage: str,
) -> None:
    script = (
        "set -e\n"
        f"root={shlex.quote(policy['staging_root'])}\n"
        f"stage={shlex.quote(remote_stage)}\n"
        'test -d "$root"\n'
        'test ! -L "$root"\n'
        'case "$stage" in "$root"/promote-*) ;; *) exit 70 ;; esac\n'
        'if [ -e "$stage" ]; then exit 71; fi\n'
        'mkdir -m 0750 "$stage"\n'
        'mkdir -m 0750 "$stage/bundle"\n'
    )
    run_checked(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            policy["apply_host"],
            "bash",
            "-s",
        ],
        timeout=30,
        input_text=script,
    )


def transfer_bundle(
    source: Path,
    version: str,
    policy: dict[str, Any],
    remote_stage: str,
) -> None:
    files = [str(source / name) for name in all_release_files(version)]
    process = subprocess.run(
        [
            "rsync",
            "-a",
            "--protect-args",
            "--",
            *files,
            f"{policy['apply_host']}:{remote_stage}/bundle/",
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=1800,
        check=False,
    )
    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "").strip()
        raise WatcherReleasePromotionError(
            f"Watcher release transfer failed: {detail}"
        )


def remote_policy_for_staging(
    policy: dict[str, Any],
) -> dict[str, Any]:
    return {
        "production_host": staging.CANONICAL_HOST,
        "apply_host": staging.CANONICAL_APPLY_HOST,
        "production_repo": policy["production_repo"],
        "service": policy["service"],
        "volume_mount": policy["volume_mount"],
        "download_root": policy["download_root"],
        "staging_roots": list(staging.CANONICAL_STAGING_ROOTS),
        "receipt_root": staging.CANONICAL_RECEIPT_ROOT,
        "lock_path": staging.CANONICAL_LOCK_PATH,
        "wolo_ports": policy["wolo_ports"],
    }


def collect_remote_runtime(
    policy: dict[str, Any],
) -> dict[str, Any]:
    source = Path(staging.__file__).read_text(encoding="utf-8")
    remote_policy = remote_policy_for_staging(policy)
    command = [
        "python3",
        "-",
        "--remote-worker",
        "--policy-b64",
        staging.encode_policy(remote_policy),
    ]
    output = run_checked(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            policy["preview_host"],
            shlex.join(command),
        ],
        timeout=900,
        input_text=source,
    )
    try:
        payload = json.loads(output)
    except Exception as exc:
        raise WatcherReleasePromotionError(
            "remote runtime proof returned invalid JSON"
        ) from exc
    runtime = payload.get("runtime_before")
    if not isinstance(runtime, dict):
        raise WatcherReleasePromotionError(
            "remote runtime proof is unavailable"
        )
    return runtime


def validate_remote_environment(policy: dict[str, Any]) -> None:
    volume = Path(policy["volume_mount"])
    volume_info = staging.require_direct_directory(
        volume, "canonical volume"
    )
    if not os.path.ismount(volume):
        raise WatcherReleasePromotionError(
            "canonical volume is not mounted"
        )
    for key, label in (
        ("download_root", "Watcher download vault"),
        ("staging_root", "Watcher release staging root"),
    ):
        info = staging.require_direct_directory(
            Path(policy[key]), label
        )
        if info.st_dev != volume_info.st_dev:
            raise WatcherReleasePromotionError(
                f"{label} is not on the canonical volume"
            )
    staging.require_direct_directory(
        Path(policy["production_repo"]), "production repository"
    )
    parent = Path(policy["receipt_root"]).parent
    if staging.require_direct_directory(
        parent, "AoE2WAR control store"
    ).st_dev != volume_info.st_dev:
        raise WatcherReleasePromotionError(
            "promotion receipt root parent is not on canonical volume"
        )


def validate_staged_bundle(
    bundle: Path,
    plan: dict[str, Any],
) -> None:
    version = plan["version"]
    rows = validate_bundle(bundle, version)
    expected = {
        row["name"]: (row["bytes"], row["sha256"])
        for row in plan["files"]
    }
    actual = {
        row["name"]: (row["bytes"], row["sha256"])
        for row in rows
    }
    if actual != expected:
        raise WatcherReleasePromotionError(
            "remote staged bundle differs from promotion plan"
        )


def target_inventory(
    download: Path,
    plan: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in plan["files"]:
        name = row["name"]
        path = download / name
        if not os.path.lexists(path):
            result[name] = {"status": "MISSING"}
            continue
        info = require_regular_file(path, f"download target {name}")
        digest = sha256_file(path)
        result[name] = {
            "status": (
                "MATCH" if (
                    info.st_size == row["bytes"]
                    and digest == row["sha256"]
                ) else "DIFFERENT"
            ),
            "bytes": info.st_size,
            "sha256": digest,
        }
    return result


def fsync_directory(path: Path) -> None:
    descriptor = os.open(
        path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    )
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def ensure_receipt_root(policy: dict[str, Any]) -> Path:
    root = Path(policy["receipt_root"])
    if not os.path.lexists(root):
        os.mkdir(root, 0o750)
        fsync_directory(root.parent)
    staging.require_direct_directory(
        root, "Watcher release promotion receipt root"
    )
    return root


@contextmanager
def promotion_lock(
    policy: dict[str, Any],
) -> Iterator[None]:
    lock_path = Path(policy["lock_path"])
    parent = staging.require_direct_directory(
        lock_path.parent, "AoE2WAR lock root"
    )
    volume = staging.require_direct_directory(
        Path(policy["volume_mount"]), "canonical volume"
    )
    if parent.st_dev != volume.st_dev:
        raise WatcherReleasePromotionError(
            "Watcher release promotion lock is not on canonical volume"
        )
    descriptor = os.open(
        lock_path,
        os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0),
        0o640,
    )
    with os.fdopen(descriptor, "r+", encoding="utf-8") as handle:
        try:
            fcntl.flock(
                handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB
            )
        except BlockingIOError as exc:
            raise WatcherReleasePromotionError(
                "another Watcher release promotion is active"
            ) from exc
        handle.seek(0)
        handle.truncate()
        handle.write(
            f"pid={os.getpid()}\nstarted_at={utc_now()}\n"
        )
        handle.flush()
        os.fsync(handle.fileno())
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def durable_write_json(path: Path, payload: dict[str, Any]) -> str:
    return staging.durable_write_json(path, payload)


def rollback_journal(
    download: Path,
    backup: Path,
    journal: list[dict[str, Any]],
) -> None:
    errors: list[str] = []
    for item in reversed(journal):
        name = item["name"]
        target = download / name
        previous = backup / name
        try:
            if os.path.lexists(target):
                require_regular_file(target, f"rollback target {name}")
                target.unlink()
            if item["had_existing"]:
                require_regular_file(previous, f"rollback backup {name}")
                os.replace(previous, target)
            fsync_directory(download)
        except Exception as exc:
            errors.append(f"{name}: {exc}")
    if errors:
        raise WatcherReleasePromotionError(
            "Watcher release rollback failed: " + "; ".join(errors)
        )


def promote_transaction(
    policy: dict[str, Any],
    plan: dict[str, Any],
    remote_stage: Path,
) -> dict[str, Any]:
    verify_plan(plan)
    validate_remote_environment(policy)
    stage_root = Path(policy["staging_root"])
    if remote_stage.parent != stage_root:
        raise WatcherReleasePromotionError(
            "promotion stage escaped canonical staging root"
        )
    staging.require_direct_directory(
        remote_stage, "Watcher release promotion stage"
    )
    bundle = remote_stage / "bundle"
    staging.require_direct_directory(
        bundle, "Watcher release promotion bundle"
    )
    validate_staged_bundle(bundle, plan)

    download = Path(policy["download_root"])
    before = target_inventory(download, plan)
    runtime_before = staging.collect_runtime(
        remote_policy_for_staging(policy)
    )

    receipt_root = ensure_receipt_root(policy)
    receipt_dir = receipt_root / (
        f"watcher-release-{receipt_timestamp()}-"
        f"{plan['version']}-{plan['bundle_digest_sha256'][:12]}"
    )
    os.mkdir(receipt_dir, 0o750)
    fsync_directory(receipt_root)
    plan_path = receipt_dir / "plan.json"
    plan_sha = durable_write_json(plan_path, {
        **plan,
        "runtime_before": runtime_before,
        "target_before": before,
        "receipt_phase": "BEFORE_MUTATION",
    })

    if all(row["status"] == "MATCH" for row in before.values()):
        runtime_after = staging.collect_runtime(
            remote_policy_for_staging(policy)
        )
        drift = staging.runtime_differences(
            runtime_before, runtime_after
        )
        result = {
            "schema": 1,
            "kind": "aoe2war-watcher-release-promotion-result",
            "generated_at": utc_now(),
            "status": "NOOP",
            "version": plan["version"],
            "bundle_digest_sha256": plan["bundle_digest_sha256"],
            "plan_receipt_path": str(plan_path),
            "plan_receipt_sha256": plan_sha,
            "runtime_before": runtime_before,
            "runtime_after": runtime_after,
            "runtime_identity_unchanged": not drift,
            "wolo_mutation_allowed": False,
            "errors": drift,
        }
        result_path = receipt_dir / "result.json"
        result["result_receipt_path"] = str(result_path)
        result["result_receipt_sha256"] = durable_write_json(
            result_path, {
                key: value
                for key, value in result.items()
                if key != "result_receipt_sha256"
            }
        )
        if drift:
            result["status"] = "FAILED"
        return result

    backup = remote_stage / "backup"
    if os.path.lexists(backup):
        raise WatcherReleasePromotionError(
            "promotion stage already contains backup state"
        )
    os.mkdir(backup, 0o750)
    fsync_directory(remote_stage)

    journal: list[dict[str, Any]] = []
    errors: list[str] = []
    mutation_started = False
    try:
        for name in plan["promotion_order"]:
            row = next(
                item for item in plan["files"]
                if item["name"] == name
            )
            target = download / name
            staged_file = bundle / name
            require_regular_file(staged_file, f"staged file {name}")
            if os.path.lexists(target):
                info = require_regular_file(
                    target, f"download target {name}"
                )
                if (
                    info.st_size == row["bytes"]
                    and sha256_file(target) == row["sha256"]
                ):
                    continue
                had_existing = True
            else:
                had_existing = False

            backup_path = backup / name
            item = {
                "name": name,
                "had_existing": had_existing,
            }
            journal.append(item)
            durable_write_json(
                receipt_dir / "transaction-state.json",
                {
                    "status": "IN_PROGRESS",
                    "version": plan["version"],
                    "bundle_digest_sha256": (
                        plan["bundle_digest_sha256"]
                    ),
                    "journal": journal,
                },
            )

            if had_existing:
                os.replace(target, backup_path)
                fsync_directory(download)
                fsync_directory(backup)

            temporary = download / (
                f".watcher-promote-{os.getpid()}-{name}"
            )
            if os.path.lexists(temporary):
                raise WatcherReleasePromotionError(
                    f"promotion temp already exists: {temporary}"
                )
            os.link(staged_file, temporary)
            mutation_started = True
            os.replace(temporary, target)
            fsync_directory(download)

            info = require_regular_file(
                target, f"promoted target {name}"
            )
            if (
                info.st_size != row["bytes"]
                or sha256_file(target) != row["sha256"]
            ):
                raise WatcherReleasePromotionError(
                    f"promoted Watcher file failed verification: {name}"
                )

        after = target_inventory(download, plan)
        if not all(
            row["status"] == "MATCH" for row in after.values()
        ):
            raise WatcherReleasePromotionError(
                "not every Watcher release file matches after promotion"
            )
    except Exception as exc:
        errors.append(str(exc))
        try:
            rollback_journal(download, backup, journal)
        except Exception as rollback_exc:
            errors.append(str(rollback_exc))

    runtime_after = None
    try:
        runtime_after = staging.collect_runtime(
            remote_policy_for_staging(policy)
        )
        drift = staging.runtime_differences(
            runtime_before, runtime_after
        )
        if drift:
            errors.append(
                "production identity changed during Watcher release "
                "promotion: " + "; ".join(drift)
            )
    except Exception as exc:
        errors.append(
            f"post-promotion runtime proof failed: {exc}"
        )

    status = "PROMOTED" if not errors else "FAILED"
    durable_write_json(
        receipt_dir / "transaction-state.json",
        {
            "status": status,
            "version": plan["version"],
            "bundle_digest_sha256": plan["bundle_digest_sha256"],
            "journal": journal,
        },
    )
    result = {
        "schema": 1,
        "kind": "aoe2war-watcher-release-promotion-result",
        "generated_at": utc_now(),
        "status": status,
        "version": plan["version"],
        "bundle_digest_sha256": plan["bundle_digest_sha256"],
        "plan_receipt_path": str(plan_path),
        "plan_receipt_sha256": plan_sha,
        "mutation_started": mutation_started,
        "runtime_before": runtime_before,
        "runtime_after": runtime_after,
        "runtime_identity_unchanged": (
            runtime_after is not None
            and not staging.runtime_differences(
                runtime_before, runtime_after
            )
        ),
        "wolo_listener_counts_unchanged": (
            runtime_after is not None
            and runtime_before["wolo_listener_counts"]
            == runtime_after["wolo_listener_counts"]
        ),
        "wolo_mutation_allowed": False,
        "target_after": target_inventory(download, plan),
        "errors": errors,
    }
    result_path = receipt_dir / "result.json"
    result["result_receipt_path"] = str(result_path)
    result["result_receipt_sha256"] = durable_write_json(
        result_path, {
            key: value
            for key, value in result.items()
            if key != "result_receipt_sha256"
        }
    )
    return result


def invoke_remote(
    policy: dict[str, Any],
    plan: dict[str, Any],
    remote_stage: str,
    *,
    apply: bool,
) -> dict[str, Any]:
    source = Path(__file__).read_text(encoding="utf-8")
    command = [
        "python3",
        "-",
        "--remote-worker",
        "--policy-b64",
        encode_payload(policy),
        "--plan-b64",
        encode_payload(plan),
        "--remote-stage",
        remote_stage,
    ]
    if apply:
        command.append("--apply")
    host = policy["apply_host"] if apply else policy["preview_host"]
    output = run_checked(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            host,
            shlex.join(command),
        ],
        timeout=1800 if apply else 900,
        input_text=source,
    )
    try:
        payload = json.loads(output)
    except Exception as exc:
        raise WatcherReleasePromotionError(
            "Watcher release remote worker returned invalid JSON"
        ) from exc
    if not isinstance(payload, dict):
        raise WatcherReleasePromotionError(
            "Watcher release remote worker returned a non-object"
        )
    return payload


def remote_preview(
    policy: dict[str, Any],
    plan: dict[str, Any],
) -> dict[str, Any]:
    validate_remote_environment(policy)
    runtime = staging.collect_runtime(
        remote_policy_for_staging(policy)
    )
    inventory = target_inventory(
        Path(policy["download_root"]), plan
    )
    match_count = sum(
        1 for row in inventory.values()
        if row["status"] == "MATCH"
    )
    return {
        "schema": 1,
        "kind": "aoe2war-watcher-release-promotion-preview",
        "generated_at": utc_now(),
        "status": (
            "NOOP"
            if match_count == len(plan["files"])
            else "READY"
        ),
        "version": plan["version"],
        "bundle_digest_sha256": plan["bundle_digest_sha256"],
        "runtime_before": runtime,
        "match_count": match_count,
        "file_count": len(plan["files"]),
        "target_inventory": inventory,
        "wolo_mutation_allowed": False,
    }


def execute_remote(
    policy: dict[str, Any],
    plan: dict[str, Any],
    remote_stage: str,
    *,
    apply: bool,
) -> dict[str, Any]:
    validate_policy(policy)
    verify_plan(plan)
    expected_stage = stage_path(policy, plan)
    if remote_stage != expected_stage:
        raise WatcherReleasePromotionError(
            "remote promotion stage path does not match plan"
        )
    if not apply:
        return remote_preview(policy, plan)
    with promotion_lock(policy):
        return promote_transaction(
            policy, plan, Path(remote_stage)
        )


def cleanup_failed_stage(
    policy: dict[str, Any],
    remote_stage: str,
) -> None:
    script = (
        "set -e\n"
        f"root={shlex.quote(policy['staging_root'])}\n"
        f"stage={shlex.quote(remote_stage)}\n"
        'case "$stage" in "$root"/promote-*) ;; *) exit 70 ;; esac\n'
        'if [ -d "$stage" ]; then rm -rf --one-file-system "$stage"; fi\n'
    )
    try:
        run_checked(
            [
                "ssh",
                "-o",
                "BatchMode=yes",
                "-o",
                "ConnectTimeout=8",
                policy["apply_host"],
                "bash",
                "-s",
            ],
            timeout=60,
            input_text=script,
        )
    except Exception:
        pass


def print_human(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR WATCHER RELEASE PROMOTION")
    print(f"Status:      {payload.get('status', 'ERROR')}")
    if payload.get("error"):
        print(f"STOP: {payload['error']}")
        return
    print(f"Version:     {payload.get('version', 'unknown')}")
    print(
        "Bundle:      "
        + str(payload.get("bundle_digest_sha256", "unknown"))
    )
    if payload.get("kind", "").endswith("-preview"):
        print(
            f"Vault:       {payload.get('match_count', 0)}/"
            f"{payload.get('file_count', 0)} exact"
        )
        if payload.get("status") == "READY":
            print(
                "READ ONLY: apply with "
                "aoe2war watcher-release --apply."
            )
        return
    print(
        "Runtime:     "
        + (
            "UNCHANGED"
            if payload.get("runtime_identity_unchanged")
            else "FAILED"
        )
    )
    print(
        "Wolo:        "
        + (
            "UNCHANGED"
            if payload.get("wolo_listener_counts_unchanged")
            else "FAILED"
        )
    )
    print(
        "Receipt:     "
        + str(payload.get("result_receipt_path", "unavailable"))
    )
    for error in payload.get("errors") or []:
        print(f"  - {error}")


def error_payload(message: str, *, apply: bool) -> dict[str, Any]:
    return {
        "schema": 1,
        "kind": "aoe2war-watcher-release-promotion-error",
        "generated_at": utc_now(),
        "mode": "APPLY" if apply else "PREVIEW",
        "status": "ERROR",
        "error": message,
    }


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(
        description=(
            "Prove and promote one certified public Watcher release "
            "into the canonical production download vault."
        )
    )
    value.add_argument("--apply", action="store_true")
    value.add_argument("--json", action="store_true")
    value.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="certified Watcher dist directory",
    )
    value.add_argument("--version")
    value.add_argument(
        "--remote-worker",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    value.add_argument("--policy-b64", help=argparse.SUPPRESS)
    value.add_argument("--plan-b64", help=argparse.SUPPRESS)
    value.add_argument("--remote-stage", help=argparse.SUPPRESS)
    return value


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)

    if args.remote_worker:
        try:
            if (
                not args.policy_b64
                or not args.plan_b64
                or not args.remote_stage
            ):
                raise WatcherReleasePromotionError(
                    "remote worker payload is incomplete"
                )
            payload = execute_remote(
                decode_payload(args.policy_b64),
                decode_payload(args.plan_b64),
                args.remote_stage,
                apply=args.apply,
            )
        except Exception as exc:
            payload = error_payload(str(exc), apply=args.apply)
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    try:
        if args.policy_b64 or args.plan_b64 or args.remote_stage:
            raise WatcherReleasePromotionError(
                "remote-worker options are reserved"
            )
        policy = policy_from_contract(load_contract())
        source = args.source.expanduser().resolve()
        version = args.version or package_version()
        if not VERSION_RE.fullmatch(version):
            raise WatcherReleasePromotionError(
                f"invalid Watcher version: {version!r}"
            )
        plan = build_plan(source, version, policy)
        remote_stage = stage_path(policy, plan)

        if not args.apply:
            payload = invoke_remote(
                policy, plan, remote_stage, apply=False
            )
        else:
            import aoe2_release

            with aoe2_release.global_release_lease():
                try:
                    create_remote_stage(policy, remote_stage)
                    transfer_bundle(
                        source, version, policy, remote_stage
                    )
                    payload = invoke_remote(
                        policy, plan, remote_stage, apply=True
                    )
                except Exception:
                    cleanup_failed_stage(policy, remote_stage)
                    raise
    except Exception as exc:
        payload = error_payload(str(exc), apply=args.apply)

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print_human(payload)

    if payload.get("status") in {"READY", "NOOP", "PROMOTED"}:
        return 0
    return 1 if payload.get("mutation_started") else 2


if __name__ == "__main__":
    raise SystemExit(main())
