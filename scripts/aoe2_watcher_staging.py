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
CANONICAL_HOST = "hel1"
CANONICAL_APPLY_HOST = "root@hel1"
CANONICAL_REPO = "/var/www/AoE2HDBets/app-prodn"
CANONICAL_SERVICE = "aoe2hdbets-web.service"
CANONICAL_VOLUME = "/mnt/HC_Volume_105319120"
CANONICAL_DOWNLOAD_ROOT = "/mnt/HC_Volume_105319120/aoe2-downloads"
CANONICAL_STAGING_ROOTS = (
    "/mnt/HC_Volume_105319120/aoe2war/watcher-release-staging",
    "/mnt/HC_Volume_105319120/aoe2war/watcher-staging",
)
CANONICAL_RECEIPT_ROOT = (
    "/mnt/HC_Volume_105319120/aoe2war/os-control/watcher-staging-retention-receipts"
)
CANONICAL_LOCK_PATH = (
    "/mnt/HC_Volume_105319120/aoe2war/os-control/locks/watcher-staging-retention.lock"
)
PROTECTED_WOLO_PORTS = (8092, 8093)


class WatcherStagingError(RuntimeError):
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


def load_contract(path: Path = CONTRACT_PATH) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise WatcherStagingError(
            f"cannot read operations contract {path}: {exc}"
        ) from exc
    if not isinstance(payload, dict) or payload.get("schema") != 1:
        raise WatcherStagingError("unsupported operations contract")
    return payload


def policy_from_contract(contract: dict[str, Any]) -> dict[str, Any]:
    canonical = contract.get("canonical")
    protected = contract.get("protected")
    raw = contract.get("watcher_staging_retention")
    rollback_archive = contract.get("rollback_archive")
    if not isinstance(canonical, dict) or not isinstance(protected, dict):
        raise WatcherStagingError(
            "operations contract is missing canonical/protected authority"
        )
    if not isinstance(raw, dict):
        raise WatcherStagingError(
            "operations contract has no watcher_staging_retention block"
        )
    if not isinstance(rollback_archive, dict):
        raise WatcherStagingError(
            "operations contract has no rollback_archive authority"
        )
    if rollback_archive.get("root_maintenance_host") != CANONICAL_APPLY_HOST:
        raise WatcherStagingError(
            "rollback_archive.root_maintenance_host must be exactly "
            f"{CANONICAL_APPLY_HOST!r}"
        )

    for key, expected in {
        "production_host": CANONICAL_HOST,
        "production_repo": CANONICAL_REPO,
        "service": CANONICAL_SERVICE,
        "volume_mount": CANONICAL_VOLUME,
    }.items():
        if canonical.get(key) != expected:
            raise WatcherStagingError(
                f"canonical.{key} must be exactly {expected!r}"
            )

    for key, expected in {
        "default_mode": "preview-read-only",
        "download_root": CANONICAL_DOWNLOAD_ROOT,
        "staging_roots": list(CANONICAL_STAGING_ROOTS),
        "receipt_root": CANONICAL_RECEIPT_ROOT,
        "lock_path": CANONICAL_LOCK_PATH,
        "delete_only_exact_canonical_duplicates": True,
        "require_plan_digest_recheck": True,
        "require_runtime_identity_recheck": True,
    }.items():
        if raw.get(key) != expected:
            raise WatcherStagingError(
                f"watcher_staging_retention.{key} must be exactly {expected!r}"
            )
    if protected.get("wolo_listener_ports") != list(PROTECTED_WOLO_PORTS):
        raise WatcherStagingError(
            "protected Wolo listener ports must remain exactly [8092, 8093]"
        )

    policy = {
        "production_host": CANONICAL_HOST,
        "apply_host": CANONICAL_APPLY_HOST,
        "production_repo": CANONICAL_REPO,
        "service": CANONICAL_SERVICE,
        "volume_mount": CANONICAL_VOLUME,
        "download_root": CANONICAL_DOWNLOAD_ROOT,
        "staging_roots": list(CANONICAL_STAGING_ROOTS),
        "receipt_root": CANONICAL_RECEIPT_ROOT,
        "lock_path": CANONICAL_LOCK_PATH,
        "wolo_ports": list(PROTECTED_WOLO_PORTS),
    }
    validate_policy(policy)
    return policy


def validate_policy(policy: dict[str, Any]) -> None:
    exact = {
        "production_host": CANONICAL_HOST,
        "apply_host": CANONICAL_APPLY_HOST,
        "production_repo": CANONICAL_REPO,
        "service": CANONICAL_SERVICE,
        "volume_mount": CANONICAL_VOLUME,
        "download_root": CANONICAL_DOWNLOAD_ROOT,
        "staging_roots": list(CANONICAL_STAGING_ROOTS),
        "receipt_root": CANONICAL_RECEIPT_ROOT,
        "lock_path": CANONICAL_LOCK_PATH,
        "wolo_ports": list(PROTECTED_WOLO_PORTS),
    }
    if set(policy) != set(exact):
        raise WatcherStagingError(
            "watcher staging policy fields are incomplete or unexpected"
        )
    for key, expected in exact.items():
        if policy.get(key) != expected:
            raise WatcherStagingError(
                f"watcher staging policy {key} must be exactly {expected!r}"
            )


def encode_policy(policy: dict[str, Any]) -> str:
    validate_policy(policy)
    return base64.urlsafe_b64encode(canonical_json(policy)).decode("ascii")


def decode_policy(value: str) -> dict[str, Any]:
    try:
        policy = json.loads(
            base64.urlsafe_b64decode(value.encode("ascii")).decode("utf-8")
        )
    except Exception as exc:
        raise WatcherStagingError(
            f"cannot decode remote policy: {exc}"
        ) from exc
    validate_policy(policy)
    return policy


def _lstat(path: Path, label: str) -> os.stat_result:
    try:
        return os.lstat(path)
    except OSError as exc:
        raise WatcherStagingError(
            f"cannot inspect {label} {path}: {exc}"
        ) from exc


def require_direct_directory(path: Path, label: str) -> os.stat_result:
    if not path.is_absolute():
        raise WatcherStagingError(f"{label} must be absolute: {path}")
    info = _lstat(path, label)
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise WatcherStagingError(
            f"{label} must be a direct directory: {path}"
        )
    if path.resolve(strict=True) != path:
        raise WatcherStagingError(
            f"{label} is not its exact canonical path: {path}"
        )
    return info


def run_checked(args: list[str], *, timeout: int = 30) -> str:
    process = subprocess.run(
        args,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "").strip()
        raise WatcherStagingError(
            f"{shlex.join(args)} failed with exit "
            f"{process.returncode}: {detail}"
        )
    return process.stdout.strip()


def wolo_listener_count(port: int) -> int:
    output = run_checked(
        ["ss", "-ltnH", "sport", "=", f":{port}"], timeout=10
    )
    return sum(1 for line in output.splitlines() if line.strip())


def collect_runtime(policy: dict[str, Any]) -> dict[str, Any]:
    repo = Path(policy["production_repo"])
    require_direct_directory(repo, "production repository")
    source_sha = run_checked(["git", "-C", str(repo), "rev-parse", "HEAD"])
    dirty = run_checked([
        "git",
        "--no-optional-locks",
        "-C",
        str(repo),
        "status",
        "--porcelain",
        "--untracked-files=all",
    ])
    service = run_checked(
        ["systemctl", "is-active", policy["service"]], timeout=15
    )
    build = repo / ".next" / "BUILD_ID"
    info = _lstat(build, "active BUILD_ID")
    if (
        stat.S_ISLNK(info.st_mode)
        or not stat.S_ISREG(info.st_mode)
        or info.st_size > 512
    ):
        raise WatcherStagingError(
            "active BUILD_ID is not a bounded regular file"
        )
    build_id = build.read_text(encoding="utf-8").strip()
    runtime = {
        "source_sha": source_sha,
        "source_dirty_count": len(
            [line for line in dirty.splitlines() if line]
        ),
        "active_build_id": build_id,
        "service": service,
        "wolo_listener_counts": {
            str(port): wolo_listener_count(port)
            for port in policy["wolo_ports"]
        },
    }
    validate_runtime(runtime, policy)
    return runtime


def validate_runtime(
    runtime: dict[str, Any], policy: dict[str, Any]
) -> None:
    if not re.fullmatch(
        r"[0-9a-f]{40}", str(runtime.get("source_sha") or "")
    ):
        raise WatcherStagingError("production source SHA is invalid")
    if runtime.get("source_dirty_count") != 0:
        raise WatcherStagingError("production worktree is dirty")
    if runtime.get("service") != "active":
        raise WatcherStagingError("production web service is not active")
    if not str(runtime.get("active_build_id") or ""):
        raise WatcherStagingError("active BUILD_ID is unavailable")
    counts = runtime.get("wolo_listener_counts")
    if not isinstance(counts, dict):
        raise WatcherStagingError("Wolo listener counts are unavailable")
    for port in policy["wolo_ports"]:
        if counts.get(str(port)) != 1:
            raise WatcherStagingError(
                f"Wolo listener {port} must have exactly one listener"
            )


def runtime_differences(
    before: dict[str, Any], after: dict[str, Any]
) -> list[str]:
    keys = (
        "source_sha",
        "source_dirty_count",
        "active_build_id",
        "service",
        "wolo_listener_counts",
    )
    return [
        f"{key}: {before.get(key)!r} -> {after.get(key)!r}"
        for key in keys
        if before.get(key) != after.get(key)
    ]


def require_regular_tree(root: Path, label: str) -> list[Path]:
    require_direct_directory(root, label)
    files: list[Path] = []
    stack = [root]
    while stack:
        directory = stack.pop()
        for entry in sorted(
            os.scandir(directory), key=lambda item: item.name
        ):
            path = Path(entry.path)
            info = entry.stat(follow_symlinks=False)
            if stat.S_ISLNK(info.st_mode):
                raise WatcherStagingError(
                    f"{label} contains a symlink: {path}"
                )
            if stat.S_ISDIR(info.st_mode):
                stack.append(path)
            elif stat.S_ISREG(info.st_mode):
                files.append(path)
            else:
                raise WatcherStagingError(
                    f"{label} contains a special entry: {path}"
                )
    return sorted(files)


def canonical_hash_index(
    download_root: Path,
) -> tuple[dict[str, list[str]], str]:
    files = require_regular_tree(
        download_root, "canonical Watcher download vault"
    )
    index: dict[str, list[str]] = {}
    binding: list[dict[str, Any]] = []
    for path in files:
        relative = path.relative_to(download_root).as_posix()
        digest = sha256_file(path)
        index.setdefault(digest, []).append(relative)
        binding.append({
            "path": relative,
            "size": path.stat().st_size,
            "sha256": digest,
        })
    return index, sha256_bytes(canonical_json(binding))


def subtree_inventory(
    path: Path, canonical: dict[str, list[str]]
) -> dict[str, Any]:
    files = require_regular_tree(path, "Watcher staging subtree")
    rows: list[dict[str, Any]] = []
    logical = 0
    allocated = 0
    seen: set[tuple[int, int]] = set()
    for file in files:
        info = _lstat(file, "Watcher staging file")
        digest = sha256_file(file)
        inode = (info.st_dev, info.st_ino)
        if inode not in seen:
            seen.add(inode)
            allocated += int(getattr(info, "st_blocks", 0)) * 512
        logical += info.st_size
        rows.append({
            "path": file.relative_to(path).as_posix(),
            "size": info.st_size,
            "sha256": digest,
            "canonical_matches": canonical.get(digest, []),
        })
    tree_sha = sha256_bytes(canonical_json([
        {
            "path": row["path"],
            "size": row["size"],
            "sha256": row["sha256"],
        }
        for row in rows
    ]))
    unmatched = [row for row in rows if not row["canonical_matches"]]
    return {
        "file_count": len(rows),
        "logical_bytes": logical,
        "allocated_bytes": allocated,
        "tree_sha256": tree_sha,
        "files": rows,
        "unmatched_count": len(unmatched),
        "unmatched": [
            {"path": row["path"], "sha256": row["sha256"]}
            for row in unmatched
        ],
    }


def discover_entries(
    staging_roots: list[Path], download_root: Path
) -> tuple[list[dict[str, Any]], str]:
    canonical, canonical_index_sha = canonical_hash_index(download_root)
    rows: list[dict[str, Any]] = []
    for staging_root in staging_roots:
        require_direct_directory(staging_root, "Watcher staging root")
        for entry in sorted(
            os.scandir(staging_root), key=lambda item: item.name
        ):
            path = Path(entry.path)
            info = entry.stat(follow_symlinks=False)
            if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(
                info.st_mode
            ):
                rows.append({
                    "root": str(staging_root),
                    "name": entry.name,
                    "path": str(path),
                    "action": "KEEP_UNVERIFIED",
                    "reason": (
                        "top-level staging entry is not a direct directory"
                    ),
                })
                continue
            if path.parent != staging_root:
                raise WatcherStagingError(
                    f"staging entry escaped root: {path}"
                )
            inventory = subtree_inventory(path, canonical)
            exact_duplicate = (
                inventory["file_count"] > 0
                and inventory["unmatched_count"] == 0
            )
            rows.append({
                "root": str(staging_root),
                "name": entry.name,
                "path": str(path),
                "mtime_ns": info.st_mtime_ns,
                "action": (
                    "DELETE_EXACT_DUPLICATE"
                    if exact_duplicate
                    else "KEEP_UNIQUE_EVIDENCE"
                ),
                "reason": (
                    "every staged file already exists byte-for-byte "
                    "in canonical download vault"
                    if exact_duplicate
                    else "one or more staged files have no "
                    "canonical byte-identical copy"
                ),
                "inventory": inventory,
            })
    return rows, canonical_index_sha


def plan_binding(plan: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": 1,
        "policy": plan["policy"],
        "runtime_before": plan["runtime_before"],
        "canonical_download_index_sha256": (
            plan["canonical_download_index_sha256"]
        ),
        "entries": plan["entries"],
    }


def plan_digest(plan: dict[str, Any]) -> str:
    return sha256_bytes(canonical_json(plan_binding(plan)))


def build_plan(
    policy: dict[str, Any], runtime: dict[str, Any]
) -> dict[str, Any]:
    entries, canonical_index_sha = discover_entries(
        [Path(value) for value in policy["staging_roots"]],
        Path(policy["download_root"]),
    )
    candidates = [
        row
        for row in entries
        if row.get("action") == "DELETE_EXACT_DUPLICATE"
    ]
    preserved = [
        row
        for row in entries
        if str(row.get("action", "")).startswith("KEEP_")
    ]
    plan = {
        "schema": 1,
        "kind": "aoe2war-watcher-staging-retention-plan",
        "generated_at": utc_now(),
        "status": "READY" if candidates else "NOOP",
        "policy": {
            "download_root": policy["download_root"],
            "staging_roots": policy["staging_roots"],
            "receipt_root": policy["receipt_root"],
            "delete_only_exact_canonical_duplicates": True,
            "wolo_mutation_allowed": False,
        },
        "runtime_before": runtime,
        "canonical_download_index_sha256": canonical_index_sha,
        "entry_count": len(entries),
        "candidate_count": len(candidates),
        "preserved_count": len(preserved),
        "eligible_allocated_bytes": sum(
            int(row["inventory"]["allocated_bytes"])
            for row in candidates
        ),
        "entries": entries,
    }
    plan["plan_digest_sha256"] = plan_digest(plan)
    return plan


def verify_plan_digest(
    plan: dict[str, Any], expected: str
) -> None:
    actual = plan_digest(plan)
    if not re.fullmatch(r"[0-9a-f]{64}", str(expected or "")):
        raise WatcherStagingError("expected plan digest is invalid")
    if not hmac.compare_digest(actual, expected):
        raise WatcherStagingError(
            "Watcher staging plan digest changed: "
            f"expected {expected}, got {actual}"
        )


def require_canonical_environment(
    policy: dict[str, Any], *, receipts: bool
) -> None:
    volume = Path(policy["volume_mount"])
    volume_info = require_direct_directory(
        volume, "canonical volume"
    )
    if not os.path.ismount(volume):
        raise WatcherStagingError("canonical volume is not mounted")
    download = Path(policy["download_root"])
    if require_direct_directory(
        download, "canonical Watcher download vault"
    ).st_dev != volume_info.st_dev:
        raise WatcherStagingError(
            "Watcher download vault is not on canonical volume"
        )
    for value in policy["staging_roots"]:
        if require_direct_directory(
            Path(value), "Watcher staging root"
        ).st_dev != volume_info.st_dev:
            raise WatcherStagingError(
                "Watcher staging root is not on canonical volume"
            )
    require_direct_directory(
        Path(policy["production_repo"]), "production repository"
    )
    if receipts:
        parent = Path(policy["receipt_root"]).parent
        if require_direct_directory(
            parent, "AoE2WAR control store"
        ).st_dev != volume_info.st_dev:
            raise WatcherStagingError(
                "Watcher staging receipt parent is not on canonical volume"
            )


def fsync_directory(path: Path) -> None:
    descriptor = os.open(
        path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    )
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def durable_write_json(
    path: Path, payload: dict[str, Any]
) -> str:
    temporary = path.with_name(path.name + ".tmp")
    data = (
        json.dumps(payload, indent=2, sort_keys=True).encode("utf-8")
        + b"\n"
    )
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_NOFOLLOW", 0)
    )
    descriptor = os.open(temporary, flags, 0o640)
    try:
        with os.fdopen(
            descriptor, "wb", closefd=True
        ) as handle:
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
    return sha256_file(path)


def make_receipt_dir(
    policy: dict[str, Any], digest: str
) -> Path:
    root = Path(policy["receipt_root"])
    if not os.path.lexists(root):
        os.mkdir(root, 0o750)
        fsync_directory(root.parent)
    require_direct_directory(
        root, "Watcher staging receipt root"
    )
    path = root / (
        f"watcher-staging-{receipt_timestamp()}-{digest[:12]}"
    )
    os.mkdir(path, 0o750)
    fsync_directory(root)
    return path


@contextmanager
def staging_lock(
    policy: dict[str, Any]
) -> Iterator[None]:
    path = Path(policy["lock_path"])
    parent = require_direct_directory(
        path.parent, "AoE2WAR lock root"
    )
    if parent.st_dev != _lstat(
        Path(policy["volume_mount"]), "canonical volume"
    ).st_dev:
        raise WatcherStagingError(
            "Watcher staging lock is not on canonical volume"
        )
    flags = (
        os.O_RDWR
        | os.O_CREAT
        | getattr(os, "O_NOFOLLOW", 0)
    )
    descriptor = os.open(path, flags, 0o640)
    with os.fdopen(
        descriptor, "r+", encoding="utf-8"
    ) as handle:
        try:
            fcntl.flock(
                handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB
            )
        except BlockingIOError as exc:
            raise WatcherStagingError(
                "another Watcher staging retention command is active"
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


def plan_once(policy: dict[str, Any]) -> dict[str, Any]:
    require_canonical_environment(policy, receipts=False)
    return build_plan(policy, collect_runtime(policy))


def target_still_safe(
    target: dict[str, Any], fresh: dict[str, Any]
) -> dict[str, Any]:
    matches = [
        row
        for row in fresh["entries"]
        if (
            row.get("root") == target.get("root")
            and row.get("name") == target.get("name")
        )
    ]
    if len(matches) != 1:
        raise WatcherStagingError(
            "planned Watcher staging target disappeared "
            "or became ambiguous"
        )
    current = matches[0]
    if current.get("action") != "DELETE_EXACT_DUPLICATE":
        raise WatcherStagingError(
            "planned target is no longer an exact canonical duplicate"
        )
    if current.get("inventory") != target.get("inventory"):
        raise WatcherStagingError(
            "Watcher staging target changed after planning"
        )
    return current


def apply_plan(
    plan: dict[str, Any], policy: dict[str, Any]
) -> dict[str, Any]:
    expected = plan["plan_digest_sha256"]
    receipt_dir = make_receipt_dir(policy, expected)
    plan_path = receipt_dir / "plan.json"
    plan_sha = durable_write_json(
        plan_path,
        {
            **plan,
            "mode": "APPLY",
            "receipt_phase": "BEFORE_MUTATION",
        },
    )

    deleted: list[dict[str, Any]] = []
    errors: list[str] = []
    mutation_started = False
    try:
        fresh = plan_once(policy)
        verify_plan_digest(fresh, expected)
        if not getattr(
            shutil.rmtree, "avoids_symlink_attacks", False
        ):
            raise WatcherStagingError(
                "Python runtime cannot prove symlink-safe removal"
            )
        for target in plan["entries"]:
            if target.get("action") != "DELETE_EXACT_DUPLICATE":
                continue
            current_runtime = collect_runtime(policy)
            drift = runtime_differences(
                plan["runtime_before"], current_runtime
            )
            if drift:
                raise WatcherStagingError(
                    "production identity changed before staging cleanup: "
                    + "; ".join(drift)
                )
            current_fresh = plan_once(policy)
            target_still_safe(target, current_fresh)
            path = Path(target["path"])
            if path.parent not in {
                Path(value) for value in policy["staging_roots"]
            }:
                raise WatcherStagingError(
                    f"staging target escaped allowed roots: {path}"
                )
            mutation_started = True
            shutil.rmtree(path)
            if os.path.lexists(path):
                raise WatcherStagingError(
                    f"staging target remains after removal: {path}"
                )
            deleted.append({
                "root": target["root"],
                "name": target["name"],
                "path": target["path"],
                "file_count": target["inventory"]["file_count"],
                "allocated_bytes": (
                    target["inventory"]["allocated_bytes"]
                ),
                "tree_sha256": target["inventory"]["tree_sha256"],
            })
    except Exception as exc:
        errors.append(str(exc))

    runtime_after = None
    try:
        runtime_after = collect_runtime(policy)
        drift = runtime_differences(
            plan["runtime_before"], runtime_after
        )
        if drift:
            errors.append(
                "post-cleanup production identity changed: "
                + "; ".join(drift)
            )
    except Exception as exc:
        errors.append(
            f"post-cleanup runtime proof failed: {exc}"
        )

    candidate_count = int(plan["candidate_count"])
    if errors:
        status = "FAILED"
    elif len(deleted) == candidate_count:
        status = "APPLIED" if candidate_count else "NOOP"
    else:
        status = "FAILED"
        errors.append(
            "not every digest-bound exact duplicate was retired"
        )

    result = {
        "schema": 1,
        "kind": "aoe2war-watcher-staging-retention-result",
        "generated_at": utc_now(),
        "mode": "APPLY",
        "status": status,
        "plan_digest_sha256": expected,
        "plan_receipt_path": str(plan_path),
        "plan_receipt_sha256": plan_sha,
        "mutation_started": mutation_started,
        "candidate_count": candidate_count,
        "deleted_count": len(deleted),
        "deleted_allocated_bytes": sum(
            int(row["allocated_bytes"]) for row in deleted
        ),
        "runtime_before": plan["runtime_before"],
        "runtime_after": runtime_after,
        "runtime_identity_unchanged": (
            runtime_after is not None
            and not runtime_differences(
                plan["runtime_before"], runtime_after
            )
        ),
        "wolo_listener_counts_unchanged": (
            runtime_after is not None
            and plan["runtime_before"]["wolo_listener_counts"]
            == runtime_after["wolo_listener_counts"]
        ),
        "wolo_mutation_allowed": False,
        "deleted": deleted,
        "errors": errors,
    }
    result_path = receipt_dir / "result.json"
    result["result_receipt_path"] = str(result_path)
    result["result_receipt_sha256"] = durable_write_json(
        result_path,
        {
            key: value
            for key, value in result.items()
            if key != "result_receipt_sha256"
        },
    )
    return result


def execute(
    policy: dict[str, Any], *, apply: bool
) -> dict[str, Any]:
    validate_policy(policy)
    require_canonical_environment(policy, receipts=apply)
    if not apply:
        plan = plan_once(policy)
        plan["mode"] = "PREVIEW"
        return plan
    with staging_lock(policy):
        return apply_plan(plan_once(policy), policy)


def invoke_remote(
    policy: dict[str, Any], *, apply: bool
) -> dict[str, Any]:
    source = Path(__file__).read_text(encoding="utf-8")
    command = [
        "python3",
        "-",
        "--remote-worker",
        "--policy-b64",
        encode_policy(policy),
    ]
    if apply:
        command.append("--apply")
    remote_host = (
        policy["apply_host"] if apply else policy["production_host"]
    )
    ssh = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        remote_host,
        shlex.join(command),
    ]
    process = subprocess.run(
        ssh,
        input=source,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=1800 if apply else 900,
        check=False,
    )
    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "").strip()
        raise WatcherStagingError(
            "Watcher staging remote worker exited "
            f"{process.returncode}: {detail}"
        )
    try:
        payload = json.loads(process.stdout)
    except Exception as exc:
        raise WatcherStagingError(
            "Watcher staging remote worker returned invalid JSON: "
            + (process.stdout or process.stderr or "")[-1200:]
        ) from exc
    if not isinstance(payload, dict):
        raise WatcherStagingError(
            "Watcher staging remote worker returned a non-object"
        )
    return payload


def format_bytes(value: int | None) -> str:
    if value is None:
        return "unknown"
    amount = float(value)
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if abs(amount) < 1024 or unit == "TiB":
            if unit == "B":
                return f"{int(amount)} B"
            return f"{amount:.1f} {unit}"
        amount /= 1024
    return f"{amount:.1f} TiB"


def print_human(payload: dict[str, Any]) -> None:
    print(
        "⚔️  AOE2WAR WATCHER STAGING — "
        + str(payload.get("mode", "UNKNOWN"))
    )
    print(f"Status:      {payload.get('status', 'ERROR')}")
    if payload.get("error"):
        print(f"STOP: {payload['error']}")
        return
    if payload.get("kind") == (
        "aoe2war-watcher-staging-retention-plan"
    ):
        print(f"Entries:     {payload.get('entry_count', 0)}")
        print(
            f"Candidates:  {payload.get('candidate_count', 0)} "
            "exact duplicate subtree(s)"
        )
        print(
            f"Preserved:   {payload.get('preserved_count', 0)} "
            "unique/unverified subtree(s)"
        )
        print(
            "Eligible:    "
            + format_bytes(payload.get("eligible_allocated_bytes"))
        )
        print(
            "Plan SHA256: "
            + str(payload.get("plan_digest_sha256", "unknown"))
        )
        for row in payload.get("entries") or []:
            inventory = row.get("inventory") or {}
            print(
                f"{row.get('action','UNKNOWN'):24} "
                f"{format_bytes(inventory.get('allocated_bytes')):>10} "
                f"{row.get('name','?')}"
            )
        print(
            "READ ONLY: apply with "
            "aoe2war watcher-staging --apply."
        )
        return
    print(
        f"Deleted:     {payload.get('deleted_count', 0)} subtree(s)"
    )
    print(
        "Reclaimed:   "
        + format_bytes(payload.get("deleted_allocated_bytes"))
    )
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


def error_payload(
    message: str, *, apply: bool
) -> dict[str, Any]:
    return {
        "schema": 1,
        "kind": "aoe2war-watcher-staging-retention-error",
        "generated_at": utc_now(),
        "mode": "APPLY" if apply else "PREVIEW",
        "status": "ERROR",
        "error": message,
    }


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(
        description=(
            "Preview or retire only Watcher staging subtrees "
            "proven byte-identical to the canonical download vault."
        )
    )
    value.add_argument("--apply", action="store_true")
    value.add_argument("--json", action="store_true")
    value.add_argument(
        "--remote-worker",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    value.add_argument("--policy-b64", help=argparse.SUPPRESS)
    return value


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.remote_worker:
        try:
            if not args.policy_b64:
                raise WatcherStagingError(
                    "remote worker policy is missing"
                )
            payload = execute(
                decode_policy(args.policy_b64),
                apply=args.apply,
            )
        except Exception as exc:
            payload = error_payload(str(exc), apply=args.apply)
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    try:
        if args.policy_b64:
            raise WatcherStagingError(
                "--policy-b64 is reserved for the remote worker"
            )
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
    if payload.get("status") in {"READY", "NOOP", "APPLIED"}:
        return 0
    return 1 if payload.get("mutation_started") else 2


if __name__ == "__main__":
    raise SystemExit(main())
