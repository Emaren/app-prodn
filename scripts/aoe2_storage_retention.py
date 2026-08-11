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
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "config" / "aoe2war-operations.json"

CANONICAL_PRODUCTION_HOST = "hel1"
CANONICAL_PRODUCTION_REPO = "/var/www/AoE2HDBets/app-prodn"
CANONICAL_SERVICE = "aoe2hdbets-web.service"
CANONICAL_VOLUME_MOUNT = "/mnt/HC_Volume_105319120"
CANONICAL_ROLLBACK_ROOT = "/mnt/HC_Volume_105319120/aoe2war/rollbacks"
CANONICAL_RECEIPT_ROOT = (
    "/mnt/HC_Volume_105319120/aoe2war/os-control/storage-retention-receipts"
)
CANONICAL_LOCK_PATH = (
    "/mnt/HC_Volume_105319120/aoe2war/os-control/locks/storage-retention.lock"
)
CANONICAL_CACHE_RELATIVE_PATH = "next/cache"
SOURCE_CACHE_RELATIVE_PATH = ".next/cache"
ACTIVATION_PREFIX = "activate-"
GENERATION_RE = re.compile(r"^activate-\d{8}T\d{6}Z-[0-9a-f]{12}$")
BUILD_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,256}$")
PROTECTED_WOLO_PORTS = (8092, 8093)


class RetentionError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def receipt_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")


def canonical_json(payload: Any) -> bytes:
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_contract(path: Path = CONTRACT_PATH) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RetentionError(f"cannot read operations contract {path}: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("schema") != 1:
        raise RetentionError(f"unsupported operations contract: {path}")
    return payload


def policy_from_contract(contract: dict[str, Any]) -> dict[str, Any]:
    canonical = contract.get("canonical")
    storage = contract.get("storage_retention")
    protected = contract.get("protected")
    if not isinstance(canonical, dict):
        raise RetentionError("operations contract has no canonical block")
    if not isinstance(storage, dict):
        raise RetentionError("operations contract has no storage_retention block")
    if not isinstance(protected, dict):
        raise RetentionError("operations contract has no protected block")

    exact_values = {
        "production_host": CANONICAL_PRODUCTION_HOST,
        "production_repo": CANONICAL_PRODUCTION_REPO,
        "service": CANONICAL_SERVICE,
        "volume_mount": CANONICAL_VOLUME_MOUNT,
    }
    for key, expected in exact_values.items():
        if canonical.get(key) != expected:
            raise RetentionError(
                f"canonical.{key} must be exactly {expected!r}; "
                f"got {canonical.get(key)!r}"
            )

    storage_exact = {
        "durable_rollback_root": CANONICAL_ROLLBACK_ROOT,
        "receipt_root": CANONICAL_RECEIPT_ROOT,
        "lock_path": CANONICAL_LOCK_PATH,
        "activation_generation_prefix": ACTIVATION_PREFIX,
        "durable_cache_relative_path": CANONICAL_CACHE_RELATIVE_PATH,
        "source_cache_relative_path": SOURCE_CACHE_RELATIVE_PATH,
        "default_mode": "preview-read-only",
    }
    for key, expected in storage_exact.items():
        if storage.get(key) != expected:
            raise RetentionError(
                f"storage_retention.{key} must be exactly {expected!r}; "
                f"got {storage.get(key)!r}"
            )

    keep = storage.get("protect_newest_activation_generations")
    if not isinstance(keep, int) or isinstance(keep, bool) or keep < 2 or keep > 10:
        raise RetentionError(
            "storage_retention.protect_newest_activation_generations "
            "must be an integer from 2 through 10"
        )
    if storage.get("delete_generation_directories") is not False:
        raise RetentionError(
            "storage retention must explicitly forbid generation deletion"
        )
    if storage.get("require_plan_digest_recheck") is not True:
        raise RetentionError("storage retention must require a plan digest recheck")
    if storage.get("require_runtime_identity_recheck") is not True:
        raise RetentionError("storage retention must require runtime identity recheck")

    ports = protected.get("wolo_listener_ports")
    if ports != list(PROTECTED_WOLO_PORTS):
        raise RetentionError(
            "protected.wolo_listener_ports must remain exactly [8092, 8093]"
        )

    policy = {
        "production_host": CANONICAL_PRODUCTION_HOST,
        "production_repo": CANONICAL_PRODUCTION_REPO,
        "service": CANONICAL_SERVICE,
        "volume_mount": CANONICAL_VOLUME_MOUNT,
        "rollback_root": CANONICAL_ROLLBACK_ROOT,
        "receipt_root": CANONICAL_RECEIPT_ROOT,
        "lock_path": CANONICAL_LOCK_PATH,
        "activation_prefix": ACTIVATION_PREFIX,
        "cache_relative_path": CANONICAL_CACHE_RELATIVE_PATH,
        "source_cache_relative_path": SOURCE_CACHE_RELATIVE_PATH,
        "protected_newest": keep,
        "wolo_ports": list(PROTECTED_WOLO_PORTS),
    }
    validate_policy_payload(policy)
    return policy


def validate_policy_payload(policy: dict[str, Any]) -> None:
    expected = {
        "production_host": CANONICAL_PRODUCTION_HOST,
        "production_repo": CANONICAL_PRODUCTION_REPO,
        "service": CANONICAL_SERVICE,
        "volume_mount": CANONICAL_VOLUME_MOUNT,
        "rollback_root": CANONICAL_ROLLBACK_ROOT,
        "receipt_root": CANONICAL_RECEIPT_ROOT,
        "lock_path": CANONICAL_LOCK_PATH,
        "activation_prefix": ACTIVATION_PREFIX,
        "cache_relative_path": CANONICAL_CACHE_RELATIVE_PATH,
        "source_cache_relative_path": SOURCE_CACHE_RELATIVE_PATH,
        "wolo_ports": list(PROTECTED_WOLO_PORTS),
    }
    if not isinstance(policy, dict):
        raise RetentionError("storage retention policy is not an object")
    allowed_keys = set(expected) | {"protected_newest"}
    if set(policy) != allowed_keys:
        raise RetentionError(
            "storage retention policy fields are incomplete or unexpected"
        )
    for key, required in expected.items():
        if policy.get(key) != required:
            raise RetentionError(
                f"storage retention policy {key} must be exactly {required!r}"
            )
    keep = policy.get("protected_newest")
    if not isinstance(keep, int) or isinstance(keep, bool) or keep < 2 or keep > 10:
        raise RetentionError(
            "storage retention policy must protect 2 through 10 generations"
        )


def _lstat(path: Path, label: str) -> os.stat_result:
    try:
        return os.lstat(path)
    except OSError as exc:
        raise RetentionError(f"cannot inspect {label} {path}: {exc}") from exc


def require_direct_directory(path: Path, label: str) -> os.stat_result:
    if not path.is_absolute():
        raise RetentionError(f"{label} must be an absolute path: {path}")
    info = _lstat(path, label)
    if stat.S_ISLNK(info.st_mode):
        raise RetentionError(f"{label} must not be a symlink: {path}")
    if not stat.S_ISDIR(info.st_mode):
        raise RetentionError(f"{label} is not a directory: {path}")
    try:
        resolved = path.resolve(strict=True)
    except OSError as exc:
        raise RetentionError(f"cannot resolve {label} {path}: {exc}") from exc
    if resolved != path:
        raise RetentionError(
            f"{label} does not resolve to its exact canonical path: "
            f"{path} -> {resolved}"
        )
    return info


def validate_generation_name(name: str) -> None:
    if not GENERATION_RE.fullmatch(name):
        raise RetentionError(
            f"activation rollback generation has an unsafe name: {name!r}"
        )


def exact_cache_path(rollback_root: Path, generation_name: str) -> Path:
    validate_generation_name(generation_name)
    return rollback_root / generation_name / "next" / "cache"


def validate_cache_target(
    cache_path: Path,
    rollback_root: Path,
    generation_name: str,
    *,
    require_exists: bool = True,
) -> Path:
    """Prove a target is the direct cache child of one exact activation copy."""
    if not rollback_root.is_absolute() or not cache_path.is_absolute():
        raise RetentionError("rollback root and cache target must be absolute")
    expected = exact_cache_path(rollback_root, generation_name)
    if cache_path != expected:
        raise RetentionError(
            f"cache target escapes the exact durable cache path: "
            f"expected {expected}, got {cache_path}"
        )

    require_direct_directory(rollback_root, "rollback root")
    generation = rollback_root / generation_name
    require_direct_directory(generation, "activation rollback generation")
    next_dir = generation / "next"
    require_direct_directory(next_dir, "durable Next.js runtime")

    if not os.path.lexists(cache_path):
        if require_exists:
            raise RetentionError(f"planned cache target disappeared: {cache_path}")
        return cache_path
    require_direct_directory(cache_path, "durable Next.js cache")
    return cache_path


def read_build_id(generation: Path) -> str | None:
    next_dir = generation / "next"
    if not os.path.lexists(next_dir):
        return None
    require_direct_directory(next_dir, "durable Next.js runtime")
    path = next_dir / "BUILD_ID"
    if not os.path.lexists(path):
        return None
    info = _lstat(path, "durable BUILD_ID")
    if stat.S_ISLNK(info.st_mode):
        raise RetentionError(f"durable BUILD_ID must not be a symlink: {path}")
    if not stat.S_ISREG(info.st_mode) or info.st_size > 512:
        raise RetentionError(f"durable BUILD_ID is not a bounded regular file: {path}")
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise RetentionError(f"cannot read durable BUILD_ID {path}: {exc}") from exc
    return value if BUILD_ID_RE.fullmatch(value) else None


def cache_tree_metadata(
    cache_path: Path,
    rollback_root: Path,
    generation_name: str,
) -> dict[str, Any]:
    validate_cache_target(cache_path, rollback_root, generation_name)
    digest = hashlib.sha256()
    logical_bytes = 0
    allocated_bytes = 0
    entry_count = 0
    seen_allocated: set[tuple[int, int]] = set()

    def record(path: Path, relative: str, info: os.stat_result, kind: str) -> None:
        nonlocal logical_bytes, allocated_bytes, entry_count
        entry_count += 1
        if stat.S_ISREG(info.st_mode):
            logical_bytes += info.st_size
        inode = (info.st_dev, info.st_ino)
        if inode not in seen_allocated:
            seen_allocated.add(inode)
            allocated_bytes += int(getattr(info, "st_blocks", 0)) * 512
        digest.update(kind.encode("ascii"))
        digest.update(b"\0")
        digest.update(relative.encode("utf-8", "surrogateescape"))
        digest.update(b"\0")
        digest.update(str(info.st_size).encode("ascii"))
        digest.update(b"\0")
        digest.update(str(info.st_mtime_ns).encode("ascii"))
        digest.update(b"\0")
        digest.update(str(stat.S_IMODE(info.st_mode)).encode("ascii"))
        digest.update(b"\0")

    def visit(directory: Path, relative: str) -> None:
        directory_info = _lstat(directory, "cache directory")
        if stat.S_ISLNK(directory_info.st_mode) or not stat.S_ISDIR(
            directory_info.st_mode
        ):
            raise RetentionError(f"cache directory changed type: {directory}")
        record(directory, relative, directory_info, "D")
        try:
            entries = sorted(os.scandir(directory), key=lambda item: item.name)
        except OSError as exc:
            raise RetentionError(
                f"cannot enumerate cache directory {directory}: {exc}"
            ) from exc
        for entry in entries:
            child = Path(entry.path)
            child_relative = f"{relative}/{entry.name}" if relative else entry.name
            try:
                info = entry.stat(follow_symlinks=False)
            except OSError as exc:
                raise RetentionError(
                    f"cannot inspect cache entry {child}: {exc}"
                ) from exc
            if stat.S_ISLNK(info.st_mode):
                raise RetentionError(
                    f"cache retention refuses trees containing symlinks: {child}"
                )
            if stat.S_ISDIR(info.st_mode):
                visit(child, child_relative)
            elif stat.S_ISREG(info.st_mode):
                record(child, child_relative, info, "F")
            else:
                raise RetentionError(
                    f"cache retention refuses special filesystem entries: {child}"
                )

    visit(cache_path, ".")
    return {
        "logical_bytes": logical_bytes,
        "allocated_bytes": allocated_bytes,
        "entry_count": entry_count,
        "metadata_sha256": digest.hexdigest(),
    }


def activation_generation_names(rollback_root: Path) -> list[str]:
    require_direct_directory(rollback_root, "rollback root")
    names: list[str] = []
    try:
        children = sorted(os.scandir(rollback_root), key=lambda item: item.name)
    except OSError as exc:
        raise RetentionError(
            f"cannot enumerate rollback root {rollback_root}: {exc}"
        ) from exc
    for child in children:
        if not child.name.startswith(ACTIVATION_PREFIX):
            continue
        validate_generation_name(child.name)
        try:
            info = child.stat(follow_symlinks=False)
        except OSError as exc:
            raise RetentionError(
                f"cannot inspect rollback generation {child.path}: {exc}"
            ) from exc
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            raise RetentionError(
                f"activation rollback generation is not a direct directory: {child.path}"
            )
        require_direct_directory(Path(child.path), "activation rollback generation")
        names.append(child.name)
    return sorted(names, reverse=True)


def discover_generations(
    rollback_root: Path,
    protected_newest: int,
) -> list[dict[str, Any]]:
    if protected_newest < 2:
        raise RetentionError("at least the newest two generations must be protected")
    generations: list[dict[str, Any]] = []
    for index, name in enumerate(activation_generation_names(rollback_root)):
        generation = rollback_root / name
        info = _lstat(generation, "activation rollback generation")
        build_id = read_build_id(generation)
        cache_path = exact_cache_path(rollback_root, name)
        cache = None
        if os.path.lexists(cache_path):
            cache = cache_tree_metadata(cache_path, rollback_root, name)

        if index < protected_newest:
            action = "PROTECT_NEWEST"
            reason = "newest activation rollback generation"
        elif cache is None:
            action = "KEEP_NO_CACHE"
            reason = "no regenerable cache subtree exists"
        elif build_id is None:
            action = "KEEP_UNVERIFIED"
            reason = "BUILD_ID is missing or invalid"
        else:
            action = "DELETE_CACHE"
            reason = "older activation generation with verified BUILD_ID"

        generations.append(
            {
                "generation": name,
                "generation_path": str(generation),
                "generation_mtime_ns": info.st_mtime_ns,
                "build_id": build_id,
                "cache_path": str(cache_path),
                "source_artifact": SOURCE_CACHE_RELATIVE_PATH,
                "durable_artifact": CANONICAL_CACHE_RELATIVE_PATH,
                "cache": cache,
                "action": action,
                "reason": reason,
            }
        )
    return generations


def run_checked(args: list[str], *, timeout: int = 30) -> str:
    try:
        process = subprocess.run(
            args,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except Exception as exc:
        raise RetentionError(f"cannot run {shlex.join(args)}: {exc}") from exc
    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "").strip()
        raise RetentionError(
            f"{shlex.join(args)} failed with exit {process.returncode}: {detail}"
        )
    return process.stdout.strip()


def wolo_listener_count(port: int) -> int:
    output = run_checked(
        ["ss", "-ltnH", "sport", "=", f":{port}"],
        timeout=10,
    )
    return sum(1 for line in output.splitlines() if line.strip())


def collect_runtime(policy: dict[str, Any]) -> dict[str, Any]:
    repo = Path(policy["production_repo"])
    require_direct_directory(repo, "production repository")
    next_dir = repo / ".next"
    require_direct_directory(next_dir, "active production runtime")
    build_file = next_dir / "BUILD_ID"
    info = _lstat(build_file, "active BUILD_ID")
    if (
        stat.S_ISLNK(info.st_mode)
        or not stat.S_ISREG(info.st_mode)
        or info.st_size > 512
    ):
        raise RetentionError(
            f"active BUILD_ID is not a bounded regular file: {build_file}"
        )
    build_id = build_file.read_text(encoding="utf-8").strip()
    if not BUILD_ID_RE.fullmatch(build_id):
        raise RetentionError("active production BUILD_ID is invalid")

    source_sha = run_checked(["git", "-C", str(repo), "rev-parse", "HEAD"])
    dirty = run_checked(
        [
            "git",
            "--no-optional-locks",
            "-C",
            str(repo),
            "status",
            "--porcelain",
            "--untracked-files=all",
        ]
    )
    service = run_checked(
        ["systemctl", "is-active", policy["service"]],
        timeout=15,
    )
    wolo = {str(port): wolo_listener_count(port) for port in policy["wolo_ports"]}
    return {
        "source_sha": source_sha,
        "source_dirty_count": len([line for line in dirty.splitlines() if line]),
        "active_build_id": build_id,
        "active_runtime_path": str(next_dir),
        "active_cache_path": str(next_dir / "cache"),
        "service": service,
        "wolo_listener_counts": wolo,
    }


def validate_runtime(runtime: dict[str, Any], policy: dict[str, Any]) -> None:
    source = runtime.get("source_sha")
    if not isinstance(source, str) or not re.fullmatch(r"[0-9a-f]{40}", source):
        raise RetentionError("production source SHA is unavailable or invalid")
    if runtime.get("source_dirty_count") != 0:
        raise RetentionError("production source worktree is not clean")
    if runtime.get("service") != "active":
        raise RetentionError("AoE2WAR production service is not active")
    if not BUILD_ID_RE.fullmatch(str(runtime.get("active_build_id") or "")):
        raise RetentionError("production BUILD_ID is unavailable or invalid")
    counts = runtime.get("wolo_listener_counts")
    if not isinstance(counts, dict):
        raise RetentionError("protected WOLO listener counts are unavailable")
    for port in policy["wolo_ports"]:
        count = counts.get(str(port))
        if count != 1:
            raise RetentionError(
                f"protected WOLO listener {port} count must be exactly 1; got {count!r}"
            )


def runtime_differences(
    before: dict[str, Any],
    after: dict[str, Any],
) -> list[str]:
    keys = (
        "source_sha",
        "source_dirty_count",
        "active_build_id",
        "active_runtime_path",
        "service",
        "wolo_listener_counts",
    )
    return [
        f"{key}: {before.get(key)!r} -> {after.get(key)!r}"
        for key in keys
        if before.get(key) != after.get(key)
    ]


def capacity_snapshot(volume_mount: Path) -> dict[str, Any]:
    require_direct_directory(volume_mount, "volume mount")
    try:
        value = os.statvfs(volume_mount)
    except OSError as exc:
        raise RetentionError(
            f"cannot inspect capacity for {volume_mount}: {exc}"
        ) from exc
    block = value.f_frsize or value.f_bsize
    total = value.f_blocks * block
    free = value.f_bfree * block
    available = value.f_bavail * block
    used = max(0, total - free)
    denominator = used + available
    used_percent = (used * 100.0 / denominator) if denominator else 100.0
    return {
        "path": str(volume_mount),
        "total_bytes": total,
        "used_bytes": used,
        "free_bytes": free,
        "available_bytes": available,
        "used_percent": round(used_percent, 2),
    }


def plan_binding(plan: dict[str, Any]) -> dict[str, Any]:
    runtime = plan["runtime_before"]
    generations = []
    for item in plan["generations"]:
        cache = item.get("cache")
        generations.append(
            {
                "generation": item["generation"],
                "generation_path": item["generation_path"],
                "generation_mtime_ns": item["generation_mtime_ns"],
                "build_id": item.get("build_id"),
                "cache_path": item["cache_path"],
                "cache": cache,
                "action": item["action"],
            }
        )
    return {
        "schema": 1,
        "policy": plan["policy"],
        "runtime_before": {
            "source_sha": runtime["source_sha"],
            "source_dirty_count": runtime["source_dirty_count"],
            "active_build_id": runtime["active_build_id"],
            "active_runtime_path": runtime["active_runtime_path"],
            "service": runtime["service"],
            "wolo_listener_counts": runtime["wolo_listener_counts"],
        },
        "generations": generations,
    }


def plan_digest(plan: dict[str, Any]) -> str:
    return sha256_bytes(canonical_json(plan_binding(plan)))


def verify_plan_digest(plan: dict[str, Any], expected: str) -> None:
    actual = plan_digest(plan)
    if not re.fullmatch(r"[0-9a-f]{64}", expected or ""):
        raise RetentionError("expected plan digest is invalid")
    if not hmac.compare_digest(actual, expected):
        raise RetentionError(
            f"retention plan digest changed: expected {expected}, got {actual}"
        )


def build_plan(
    policy: dict[str, Any],
    runtime: dict[str, Any],
    capacity: dict[str, Any],
) -> dict[str, Any]:
    generations = discover_generations(
        Path(policy["rollback_root"]),
        int(policy["protected_newest"]),
    )
    candidates = [item for item in generations if item["action"] == "DELETE_CACHE"]
    protected = [item for item in generations if item["action"] == "PROTECT_NEWEST"]
    eligible_logical = sum(item["cache"]["logical_bytes"] for item in candidates)
    eligible_allocated = sum(item["cache"]["allocated_bytes"] for item in candidates)
    projected_used = max(0, int(capacity["used_bytes"]) - eligible_allocated)
    projected_available = int(capacity["available_bytes"]) + eligible_allocated
    denominator = projected_used + projected_available
    projected_percent = projected_used * 100.0 / denominator if denominator else 100.0

    plan = {
        "schema": 1,
        "kind": "aoe2war-storage-retention-plan",
        "generated_at": utc_now(),
        "status": "READY" if candidates else "NOOP",
        "policy": {
            "rollback_root": policy["rollback_root"],
            "receipt_root": policy["receipt_root"],
            "cache_relative_path": policy["cache_relative_path"],
            "source_cache_relative_path": policy["source_cache_relative_path"],
            "activation_generation_prefix": policy["activation_prefix"],
            "protected_newest_activation_generations": policy["protected_newest"],
            "delete_generation_directories": False,
            "wolo_mutation_allowed": False,
        },
        "runtime_before": runtime,
        "capacity_before": capacity,
        "projected_capacity_after": {
            "used_bytes": projected_used,
            "available_bytes": projected_available,
            "used_percent": round(projected_percent, 2),
        },
        "generation_count": len(generations),
        "protected_generation_count": len(protected),
        "candidate_count": len(candidates),
        "eligible_cache_logical_bytes": eligible_logical,
        "eligible_cache_allocated_bytes": eligible_allocated,
        "generations": generations,
    }
    plan["plan_digest_sha256"] = plan_digest(plan)
    return plan


def require_canonical_environment(
    policy: dict[str, Any],
    *,
    receipt_root_required: bool,
) -> None:
    volume = Path(policy["volume_mount"])
    if str(volume) != CANONICAL_VOLUME_MOUNT:
        raise RetentionError("volume mount is not the exact canonical path")
    volume_info = require_direct_directory(volume, "volume mount")
    if not os.path.ismount(volume):
        raise RetentionError(
            f"canonical volume is not mounted; refusing root-filesystem fallback: {volume}"
        )

    rollback = Path(policy["rollback_root"])
    if str(rollback) != CANONICAL_ROLLBACK_ROOT:
        raise RetentionError("rollback root is not the exact canonical path")
    rollback_info = require_direct_directory(rollback, "rollback root")
    if rollback_info.st_dev != volume_info.st_dev:
        raise RetentionError("rollback root is not on the canonical mounted volume")

    repo = Path(policy["production_repo"])
    if str(repo) != CANONICAL_PRODUCTION_REPO:
        raise RetentionError("production repository is not the exact canonical path")
    require_direct_directory(repo, "production repository")

    if receipt_root_required:
        receipt_root = Path(policy["receipt_root"])
        if str(receipt_root) != CANONICAL_RECEIPT_ROOT:
            raise RetentionError("receipt root is not the exact canonical path")
        parent = receipt_root.parent
        parent_info = require_direct_directory(parent, "AoE2WAR durable root")
        if parent_info.st_dev != volume_info.st_dev:
            raise RetentionError(
                "durable receipt parent is not on the canonical volume"
            )


def make_receipt_root(policy: dict[str, Any]) -> Path:
    root = Path(policy["receipt_root"])
    created = False
    if not os.path.lexists(root):
        try:
            os.mkdir(root, 0o750)
            created = True
        except OSError as exc:
            raise RetentionError(
                f"cannot create durable receipt root {root}: {exc}"
            ) from exc
    info = require_direct_directory(root, "storage retention receipt root")
    volume_info = _lstat(Path(policy["volume_mount"]), "volume mount")
    if info.st_dev != volume_info.st_dev:
        raise RetentionError(
            "storage retention receipts are not on the canonical volume"
        )
    if created:
        fsync_directory(root.parent)
    return root


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def durable_write_json(path: Path, payload: dict[str, Any]) -> str:
    temporary = path.with_name(path.name + ".tmp")
    data = json.dumps(payload, indent=2, sort_keys=True).encode("utf-8") + b"\n"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    flags |= getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(temporary, flags, 0o640)
        try:
            with os.fdopen(descriptor, "wb", closefd=True) as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
            fsync_directory(path.parent)
        except Exception:
            try:
                temporary.unlink()
            except OSError:
                pass
            raise
    except OSError as exc:
        raise RetentionError(f"cannot persist durable receipt {path}: {exc}") from exc
    return sha256_file(path)


def create_receipt_directory(
    policy: dict[str, Any],
    digest: str,
) -> Path:
    root = make_receipt_root(policy)
    path = root / f"retention-{receipt_timestamp()}-{digest[:12]}"
    try:
        os.mkdir(path, 0o750)
    except OSError as exc:
        raise RetentionError(
            f"cannot create durable retention receipt {path}: {exc}"
        ) from exc
    require_direct_directory(path, "storage retention receipt")
    fsync_directory(root)
    return path


@contextmanager
def retention_lock(policy: dict[str, Any]) -> Iterator[None]:
    path = Path(policy["lock_path"])
    if str(path) != CANONICAL_LOCK_PATH:
        raise RetentionError("retention lock is not the exact canonical path")
    parent = require_direct_directory(path.parent, "AoE2WAR durable root")
    volume = _lstat(Path(policy["volume_mount"]), "volume mount")
    if parent.st_dev != volume.st_dev:
        raise RetentionError("retention lock is not on the canonical volume")
    flags = os.O_RDWR | os.O_CREAT
    flags |= getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags, 0o640)
    except OSError as exc:
        raise RetentionError(
            f"cannot open storage retention lock {path}: {exc}"
        ) from exc
    with os.fdopen(descriptor, "r+", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RetentionError("another storage retention command is active") from exc
        handle.seek(0)
        handle.truncate()
        handle.write(f"pid={os.getpid()}\nstarted_at={utc_now()}\n")
        handle.flush()
        os.fsync(handle.fileno())
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def plan_once(policy: dict[str, Any]) -> dict[str, Any]:
    require_canonical_environment(policy, receipt_root_required=False)
    runtime = collect_runtime(policy)
    validate_runtime(runtime, policy)
    capacity = capacity_snapshot(Path(policy["volume_mount"]))
    return build_plan(policy, runtime, capacity)


def planned_generation_names(plan: dict[str, Any]) -> list[str]:
    return [item["generation"] for item in plan["generations"]]


def target_still_safe(
    target: dict[str, Any],
    plan: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    rollback_root = Path(policy["rollback_root"])
    current_names = activation_generation_names(rollback_root)
    if current_names != planned_generation_names(plan):
        raise RetentionError(
            "activation rollback generation set/order changed after planning"
        )
    protected = set(current_names[: int(policy["protected_newest"])])
    if target["generation"] in protected:
        raise RetentionError(
            f"planned target became a protected newest generation: {target['generation']}"
        )
    cache_path = Path(target["cache_path"])
    current = cache_tree_metadata(
        cache_path,
        rollback_root,
        target["generation"],
    )
    if current != target.get("cache"):
        raise RetentionError(f"cache metadata changed after planning: {cache_path}")
    current_build_id = read_build_id(rollback_root / target["generation"])
    if current_build_id != target.get("build_id"):
        raise RetentionError(f"BUILD_ID changed after planning: {target['generation']}")
    return current


def apply_plan(plan: dict[str, Any], policy: dict[str, Any]) -> dict[str, Any]:
    expected_digest = plan["plan_digest_sha256"]
    receipt_dir = create_receipt_directory(policy, expected_digest)
    plan_receipt = dict(plan)
    plan_receipt["mode"] = "APPLY"
    plan_receipt["receipt_phase"] = "BEFORE_MUTATION"
    plan_path = receipt_dir / "plan.json"
    plan_receipt_sha = durable_write_json(plan_path, plan_receipt)

    deleted: list[dict[str, Any]] = []
    errors: list[str] = []
    mutation_started = False
    fresh_plan: dict[str, Any] | None = None

    try:
        fresh_plan = plan_once(policy)
        verify_plan_digest(fresh_plan, expected_digest)
        if not getattr(shutil.rmtree, "avoids_symlink_attacks", False):
            raise RetentionError(
                "this Python runtime cannot prove symlink-safe directory removal"
            )

        for target in (
            item for item in plan["generations"] if item["action"] == "DELETE_CACHE"
        ):
            current_runtime = collect_runtime(policy)
            validate_runtime(current_runtime, policy)
            drift = runtime_differences(plan["runtime_before"], current_runtime)
            if drift:
                raise RetentionError(
                    "production identity changed before cache removal: "
                    + "; ".join(drift)
                )
            metadata = target_still_safe(target, plan, policy)
            cache_path = Path(target["cache_path"])
            mutation_started = True
            shutil.rmtree(cache_path)
            if os.path.lexists(cache_path):
                raise RetentionError(
                    f"cache target still exists after removal: {cache_path}"
                )
            deleted.append(
                {
                    "generation": target["generation"],
                    "build_id": target["build_id"],
                    "cache_path": str(cache_path),
                    "logical_bytes": metadata["logical_bytes"],
                    "allocated_bytes": metadata["allocated_bytes"],
                    "entry_count": metadata["entry_count"],
                    "metadata_sha256": metadata["metadata_sha256"],
                }
            )
    except Exception as exc:
        errors.append(str(exc))

    runtime_after: dict[str, Any] | None = None
    capacity_after: dict[str, Any] | None = None
    try:
        runtime_after = collect_runtime(policy)
        validate_runtime(runtime_after, policy)
        drift = runtime_differences(plan["runtime_before"], runtime_after)
        if drift:
            errors.append(
                "post-retention production identity changed: " + "; ".join(drift)
            )
    except Exception as exc:
        errors.append(f"post-retention runtime proof failed: {exc}")
    try:
        capacity_after = capacity_snapshot(Path(policy["volume_mount"]))
    except Exception as exc:
        errors.append(f"post-retention capacity proof failed: {exc}")

    candidate_count = int(plan["candidate_count"])
    if errors:
        status = "FAILED"
    elif candidate_count == 0:
        status = "NOOP"
    elif len(deleted) == candidate_count:
        status = "APPLIED"
    else:
        status = "FAILED"
        errors.append("not every digest-bound cache candidate was removed")

    deleted_logical = sum(item["logical_bytes"] for item in deleted)
    deleted_allocated = sum(item["allocated_bytes"] for item in deleted)
    capacity_delta = None
    if capacity_after is not None:
        capacity_delta = int(plan["capacity_before"]["used_bytes"]) - int(
            capacity_after["used_bytes"]
        )
    result = {
        "schema": 1,
        "kind": "aoe2war-storage-retention-result",
        "generated_at": utc_now(),
        "mode": "APPLY",
        "status": status,
        "plan_digest_sha256": expected_digest,
        "plan_receipt_path": str(plan_path),
        "plan_receipt_sha256": plan_receipt_sha,
        "mutation_started": mutation_started,
        "candidate_count": candidate_count,
        "deleted_count": len(deleted),
        "deleted_cache_logical_bytes": deleted_logical,
        "deleted_cache_allocated_bytes": deleted_allocated,
        "filesystem_used_bytes_delta": capacity_delta,
        "bytes_reclaimed": max(0, capacity_delta)
        if capacity_delta is not None
        else None,
        "capacity_before": plan["capacity_before"],
        "capacity_after": capacity_after,
        "runtime_before": plan["runtime_before"],
        "runtime_after": runtime_after,
        "runtime_identity_unchanged": runtime_after is not None
        and not runtime_differences(plan["runtime_before"], runtime_after),
        "wolo_listener_counts_unchanged": runtime_after is not None
        and plan["runtime_before"].get("wolo_listener_counts")
        == runtime_after.get("wolo_listener_counts"),
        "wolo_mutation_allowed": False,
        "generation_directories_deleted": 0,
        "deleted": deleted,
        "errors": errors,
    }
    result_path = receipt_dir / "result.json"
    result_receipt_sha = durable_write_json(result_path, result)
    result["result_receipt_path"] = str(result_path)
    result["result_receipt_sha256"] = result_receipt_sha
    result["plan"] = plan
    if fresh_plan is not None:
        result["rechecked_plan_digest_sha256"] = fresh_plan["plan_digest_sha256"]
    return result


def execute(policy: dict[str, Any], *, apply: bool) -> dict[str, Any]:
    validate_policy_payload(policy)
    if not apply:
        plan = plan_once(policy)
        plan["mode"] = "PREVIEW"
        plan["read_only"] = True
        return plan

    require_canonical_environment(policy, receipt_root_required=True)
    with retention_lock(policy):
        plan = plan_once(policy)
        return apply_plan(plan, policy)


def encode_policy(policy: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(canonical_json(policy)).decode("ascii")


def decode_policy(value: str) -> dict[str, Any]:
    try:
        payload = json.loads(base64.urlsafe_b64decode(value.encode("ascii")))
    except Exception as exc:
        raise RetentionError(f"invalid remote storage policy: {exc}") from exc
    if not isinstance(payload, dict):
        raise RetentionError("remote storage policy is not an object")
    validate_policy_payload(payload)
    expected = (
        policy_from_contract(load_contract()) if Path(CONTRACT_PATH).is_file() else None
    )
    if expected is not None and payload != expected:
        raise RetentionError(
            "remote policy does not match the checked-out operations contract"
        )
    return payload


def invoke_remote(
    policy: dict[str, Any],
    *,
    apply: bool,
) -> dict[str, Any]:
    try:
        source = Path(__file__).read_text(encoding="utf-8")
    except OSError as exc:
        raise RetentionError(
            f"cannot read storage retention worker source: {exc}"
        ) from exc
    command = [
        "python3",
        "-",
        "--remote-worker",
        "--policy-b64",
        encode_policy(policy),
    ]
    if apply:
        command.append("--apply")
    ssh_command = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        policy["production_host"],
        shlex.join(command),
    ]
    try:
        process = subprocess.run(
            ssh_command,
            input=source,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=1800 if apply else 600,
            check=False,
        )
    except Exception as exc:
        raise RetentionError(f"storage retention SSH failed: {exc}") from exc
    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "").strip()
        raise RetentionError(
            f"storage retention worker exited {process.returncode}: {detail}"
        )
    try:
        payload = json.loads(process.stdout)
    except Exception as exc:
        raise RetentionError(
            "storage retention worker returned invalid JSON: "
            + (process.stdout or process.stderr or "").strip()[-1000:]
        ) from exc
    if not isinstance(payload, dict):
        raise RetentionError("storage retention worker returned a non-object result")
    return payload


def format_bytes(value: int | None) -> str:
    if value is None:
        return "unknown"
    amount = float(value)
    units = ("B", "KiB", "MiB", "GiB", "TiB")
    for unit in units:
        if abs(amount) < 1024.0 or unit == units[-1]:
            return f"{amount:.1f} {unit}" if unit != "B" else f"{int(amount)} B"
        amount /= 1024.0
    return f"{amount:.1f} TiB"


def print_human(payload: dict[str, Any]) -> None:
    mode = payload.get("mode", "UNKNOWN")
    status = payload.get("status", "ERROR")
    print(f"⚔️  AOE2WAR STORAGE RETENTION — {mode}")
    if status in {"ERROR", "BLOCKED"}:
        print(f"Status:          {status}")
        if payload.get("error"):
            print(f"STOP: {payload['error']}")
        for error in payload.get("errors") or []:
            print(f"  - {error}")
        return

    plan = (
        payload.get("plan") if payload.get("kind", "").endswith("result") else payload
    )
    runtime = plan.get("runtime_before") or {}
    capacity = plan.get("capacity_before") or {}
    print(f"Status:          {status}")
    print(f"Source:          {runtime.get('source_sha', 'unknown')}")
    print(f"Active BUILD_ID: {runtime.get('active_build_id', 'unknown')}")
    print(f"Service:         {runtime.get('service', 'unknown')}")
    counts = runtime.get("wolo_listener_counts") or {}
    print(
        "Wolo listeners:  "
        f"8092={counts.get('8092', 'unknown')}  "
        f"8093={counts.get('8093', 'unknown')}"
    )
    print(
        "Volume:          "
        f"{capacity.get('used_percent', 'unknown')}% used  "
        f"{format_bytes(capacity.get('available_bytes'))} available"
    )
    print(
        "Generations:     "
        f"{plan.get('generation_count', 0)} total  "
        f"{plan.get('protected_generation_count', 0)} protected  "
        f"{plan.get('candidate_count', 0)} cache candidates"
    )
    print(
        "Eligible cache:  "
        f"{format_bytes(plan.get('eligible_cache_allocated_bytes'))} allocated  "
        f"({format_bytes(plan.get('eligible_cache_logical_bytes'))} logical)"
    )
    print(f"Plan SHA256:     {plan.get('plan_digest_sha256', 'unknown')}")
    print()
    for item in plan.get("generations") or []:
        cache = item.get("cache") or {}
        size = format_bytes(cache.get("allocated_bytes")) if cache else "no cache"
        build = item.get("build_id") or "BUILD_ID unavailable"
        print(
            f"{item.get('action', 'UNKNOWN'):16} {size:>10}  "
            f"BUILD_ID={build}  {item.get('generation', 'unknown')}"
        )

    if mode == "PREVIEW":
        print()
        print("READ ONLY: no production path or receipt was changed.")
        if int(plan.get("candidate_count") or 0):
            print(
                "Apply this exact bounded policy with: aoe2war storage-retention --apply"
            )
        return

    print()
    print(
        "Deleted cache:   "
        f"{payload.get('deleted_count', 0)} directories  "
        f"{format_bytes(payload.get('deleted_cache_allocated_bytes'))} allocated"
    )
    print(
        "Net reclaimed:   "
        f"{format_bytes(payload.get('bytes_reclaimed'))} by filesystem capacity"
    )
    after = payload.get("capacity_after") or {}
    print(
        "Volume after:    "
        f"{after.get('used_percent', 'unknown')}% used  "
        f"{format_bytes(after.get('available_bytes'))} available"
    )
    print(
        "Runtime proof:   "
        + ("UNCHANGED" if payload.get("runtime_identity_unchanged") else "FAILED")
    )
    print(
        "Wolo proof:      "
        + ("UNCHANGED" if payload.get("wolo_listener_counts_unchanged") else "FAILED")
    )
    print(f"Plan receipt:    {payload.get('plan_receipt_path', 'unavailable')}")
    print(f"Result receipt:  {payload.get('result_receipt_path', 'unavailable')}")
    for error in payload.get("errors") or []:
        print(f"  - {error}")


def error_payload(message: str, *, apply: bool) -> dict[str, Any]:
    return {
        "schema": 1,
        "kind": "aoe2war-storage-retention-error",
        "generated_at": utc_now(),
        "mode": "APPLY" if apply else "PREVIEW",
        "status": "ERROR",
        "error": message,
    }


def exit_code(payload: dict[str, Any]) -> int:
    status = payload.get("status")
    if status in {"READY", "NOOP", "APPLIED"}:
        return 0
    if status == "FAILED" and payload.get("mutation_started"):
        return 1
    return 2


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(
        description=(
            "Preview or apply receipt-bound cleanup of only regenerable cache "
            "inside older durable activation rollback generations."
        )
    )
    value.add_argument(
        "--apply",
        action="store_true",
        help="persist a bound plan, recheck its digest, then remove eligible cache",
    )
    value.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    value.add_argument("--remote-worker", action="store_true", help=argparse.SUPPRESS)
    value.add_argument("--policy-b64", help=argparse.SUPPRESS)
    return value


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.remote_worker:
        try:
            if not args.policy_b64:
                raise RetentionError("remote worker policy is missing")
            policy = decode_policy(args.policy_b64)
            payload = execute(policy, apply=args.apply)
        except Exception as exc:
            payload = error_payload(str(exc), apply=args.apply)
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    try:
        if args.policy_b64:
            raise RetentionError("--policy-b64 is reserved for the remote worker")
        policy = policy_from_contract(load_contract())
        if args.apply:
            import aoe2_release

            with aoe2_release.global_release_lease():
                if str(ROOT) == policy["production_repo"]:
                    payload = execute(policy, apply=True)
                else:
                    payload = invoke_remote(policy, apply=True)
        elif str(ROOT) == policy["production_repo"]:
            payload = execute(policy, apply=False)
        else:
            payload = invoke_remote(policy, apply=False)
    except Exception as exc:
        payload = error_payload(str(exc), apply=args.apply)

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print_human(payload)
    return exit_code(payload)


if __name__ == "__main__":
    raise SystemExit(main())
