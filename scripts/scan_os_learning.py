#!/usr/bin/env python3
"""Bounded, unprivileged Scan OS V2 observation and learning engine.

Called ONLY by the existing scripts/scan_os.py source-owned catalog.
Never runs registered external scanner commands. No delete, network,
git process, recursive traversal, signing, or host privilege changes.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import resource
import secrets
import stat
import sys
import time

MAX_INPUT = 131072
MAX_SOURCE_BYTES = 4 * 1024 * 1024
STALE_SECONDS = 86400
PROFILES = ("HOT", "INCREMENTAL", "DEEP")


class ObservationHold(ValueError):
    pass


def require(ok, code):
    if not ok:
        raise ObservationHold("SCAN_OS_V2_HOLD_" + code)


def canonical(obj):
    return (json.dumps(obj, sort_keys=True, separators=(",", ":")) + "\n").encode()


def owned_private(directory):
    p = Path(directory)
    require(p.is_absolute() and p.resolve(strict=True) == p and
            not p.is_symlink(), "PRIVATE_DIR_PATH")
    s = p.lstat()
    require(stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid()
            and stat.S_IMODE(s.st_mode) == 0o700, "PRIVATE_DIR_OWNER_MODE")
    return p


def safe_read(file):
    p = Path(file)
    s = p.lstat()
    require(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid()
            and s.st_nlink == 1 and stat.S_IMODE(s.st_mode) == 0o600,
            "RECEIPT_OWNER_MODE")
    require(0 < s.st_size <= MAX_INPUT, "RECEIPT_SIZE")
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        require((before.st_dev, before.st_ino, before.st_size) ==
                (s.st_dev, s.st_ino, s.st_size), "RECEIPT_FD_RACE")
        data = os.read(fd, MAX_INPUT + 1)
        after = os.fstat(fd)
        require((after.st_ino, after.st_size, after.st_mtime_ns) ==
                (before.st_ino, before.st_size, before.st_mtime_ns),
                "RECEIPT_CHANGED")
        def unique(pairs):
            out = {}
            for k, v in pairs:
                require(k not in out, "DUPLICATE_RECEIPT_FIELD")
                out[k] = v
            return out
        return json.loads(data, object_pairs_hook=unique)
    finally:
        os.close(fd)


def seal(path, obj):
    content = canonical(obj)
    require(len(content) <= MAX_INPUT, "RECEIPT_OUTPUT_TOO_LARGE")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as out:
            out.write(content)
            out.flush()
        os.fsync(fd)
    finally:
        os.close(fd)
    fsync_directory(path.parent)
    return hashlib.sha256(content).hexdigest()


def fsync_directory(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def replace_state(path, obj):
    temp = path.with_name(path.name + "." + secrets.token_hex(12) + ".partial")
    seal(temp, obj)
    require(not path.is_symlink(), "STATE_SYMLINK_SWAP")
    if path.exists():
        safe_read(path)
    os.replace(temp, path)
    fsync_directory(path.parent)


def source_identity(path, root):
    """Never follow symlinks, even at a parent of a registered catalog source."""
    require(path.is_absolute() and path.is_relative_to(root), "SOURCE_ESCAPE")
    parent = root
    for part in path.relative_to(root).parts[:-1]:
        require(part not in ("", ".", ".."), "SOURCE_COMPONENT")
        parent = parent / part
        s = parent.lstat()
        require(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode),
                "SOURCE_PARENT_SYMLINK")
    s = path.lstat()
    require(stat.S_ISREG(s.st_mode) and not stat.S_ISLNK(s.st_mode)
            and s.st_nlink == 1 and s.st_uid == os.getuid(),
            "SOURCE_NOT_OWNED_REGULAR")
    return {"dev": s.st_dev, "inode": s.st_ino, "size": s.st_size,
            "mtime_ns": s.st_mtime_ns, "ctime_ns": s.st_ctime_ns,
            "mode": stat.S_IMODE(s.st_mode)}


def hash_owned_source(path, identity):
    require(identity["size"] <= MAX_SOURCE_BYTES, "SOURCE_TOO_LARGE")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        require(before.st_dev == identity["dev"] and
                before.st_ino == identity["inode"] and
                before.st_size == identity["size"] and
                before.st_mtime_ns == identity["mtime_ns"] and
                before.st_ctime_ns == identity["ctime_ns"], "SOURCE_CHANGED_BEFORE_READ")
        h = hashlib.sha256()
        read = 0
        while True:
            block = os.read(fd, 65536)
            if not block:
                break
            h.update(block)
            read += len(block)
        after = os.fstat(fd)
        require((after.st_dev, after.st_ino, after.st_mtime_ns, after.st_ctime_ns,
                 after.st_size) ==
                (before.st_dev, before.st_ino, before.st_mtime_ns, before.st_ctime_ns,
                 before.st_size), "SOURCE_CHANGED_DURING_READ")
        return h.hexdigest(), read
    finally:
        os.close(fd)


def select_local(catalog, goal):
    # Existing Scan OS catalog remains the source of producer IDs and budgets.
    from scan_os import validate_catalog
    c = validate_catalog(catalog)
    require(goal == "release", "NO_CROSS_HOST_SCAN_CLAIM")
    selected = [s for s in c["scans"] if s["goal"] == goal]
    require(len(selected) == 2 and
            all(s["repo"] == "Emaren/app-prodn" and
                s["scope"] == "SOURCE_CI" and
                s["source_path"].startswith("scripts/") for s in selected),
            "UNADMITTED_LOCAL_PRODUCER")
    return selected


def perform(catalog, *, goal, profile, source_root, state_dir, reason=""):
    require(profile in PROFILES, "PROFILE")
    source_root = Path(source_root)
    require(source_root.is_absolute() and
            source_root.resolve(strict=True) == source_root and
            not source_root.is_symlink(), "SOURCE_ROOT")
    rootstat = source_root.lstat()
    require(stat.S_ISDIR(rootstat.st_mode) and
            rootstat.st_uid == os.getuid(), "SOURCE_ROOT_OWNER")
    selected = select_local(catalog, goal)
    if profile == "DEEP":
        require(type(reason) is str and 12 <= len(reason) <= 300 and
                "all-disks" not in reason.lower(), "DEEP_REQUIRES_BOUNDED_JUSTIFICATION")
    else:
        require(not reason, "REASON_ONLY_FOR_DEEP")
    directory = owned_private(state_dir)
    receipts = directory / "receipts"
    if not receipts.exists():
        receipts.mkdir(mode=0o700)
        fsync_directory(directory)
    owned_private(receipts)
    state_path = directory / ("scan-" + goal + ".json")
    previous = safe_read(state_path) if state_path.exists() or state_path.is_symlink() else None
    scope_identity = {"device": rootstat.st_dev, "inode": rootstat.st_ino,
                      "path": str(source_root)}
    if previous is not None:
        require(type(previous) is dict and
                previous.get("schema") == "aoe2war.scan-os.source-snapshot.v2" and
                previous.get("goal") == goal and
                previous.get("scope_identity") == scope_identity,
                "STATE_SCOPE_DRIFT")
    start_wall = time.perf_counter_ns()
    start_cpu = time.process_time_ns()
    start_usage = resource.getrusage(resource.RUSAGE_SELF)
    now = dt.datetime.now(dt.timezone.utc)
    capacity = os.statvfs(source_root)
    capacity_free = capacity.f_bavail * capacity.f_frsize
    original_rows = previous.get("items", {}) if previous is not None else {}
    rows = dict(original_rows)
    visited = hashed = reused = read_bytes = 0
    missing = []
    changed = []
    if profile != "HOT":
        rows = {}
        for item in selected:
            name = item["source_path"]
            require(name not in rows, "DUPLICATE_SOURCE")
            target = source_root / name
            try:
                identity = source_identity(target, source_root)
            except (OSError, ObservationHold):
                missing.append(name)
                rows[name] = {"state": "UNKNOWN_NOT_VERIFIED",
                              "identity": None, "sha256": None}
                continue
            visited += 1
            older = original_rows.get(name, {})
            old_id = older.get("identity")
            unchanged = (old_id == identity and
                         older.get("state") == "HASHED_LOCAL_NOT_SIGNED" and
                         type(older.get("sha256")) is str and
                         len(older["sha256"]) == 64 and previous is not None and
                         0 <= (now - dt.datetime.fromisoformat(
                             previous["at_utc"].replace("Z", "+00:00"))).total_seconds()
                         <= STALE_SECONDS)
            if profile == "INCREMENTAL" and unchanged:
                digest = older["sha256"]
                reused += 1
            else:
                digest, count = hash_owned_source(target, identity)
                hashed += 1
                read_bytes += count
                changed.append(name)
            rows[name] = {"state": "HASHED_LOCAL_NOT_SIGNED",
                          "identity": identity, "sha256": digest}
    else:
        # HOT does not even stat the registered files; no claim of fresh coverage.
        require(previous is None or
                set(original_rows).issubset({s["source_path"] for s in selected}),
                "HOT_UNRECOGNIZED_CACHED_SOURCE")
        reused = len([v for v in original_rows.values()
                      if v.get("state") == "HASHED_LOCAL_NOT_SIGNED"])
    cpu_ns = time.process_time_ns() - start_cpu
    wall_ns = time.perf_counter_ns() - start_wall
    end_usage = resource.getrusage(resource.RUSAGE_SELF)
    peak_rss_bytes = end_usage.ru_maxrss * (1024 if sys.platform.startswith("linux") else 1)
    if profile != "HOT":
        snapshot = {
            "schema": "aoe2war.scan-os.source-snapshot.v2",
            "goal": goal, "scope_identity": scope_identity,
            "at_utc": now.isoformat().replace("+00:00", "Z"),
            "items": rows, "authority": "LOCAL_UNTRUSTED_SNAPSHOT_NOT_SIGNED",
        }
        replace_state(state_path, snapshot)
    receipt = {
        "schema": "aoe2war.scan-os.learning-receipt.v2",
        "authority": "UNSIGNED_LOCAL_READ_ONLY_NOT_PRODUCTION_CERTIFIED",
        "profile": profile, "goal": goal, "scope_identity": scope_identity,
        "source_producers": sorted(s["id"] for s in selected),
        "at_utc": now.isoformat().replace("+00:00", "Z"),
        "wall_ns": wall_ns, "cpu_ns": cpu_ns,
        "peak_process_rss_bytes": peak_rss_bytes,
        "os_inblock_operations_delta": end_usage.ru_inblock - start_usage.ru_inblock,
        "os_oublock_operations_delta": end_usage.ru_oublock - start_usage.ru_oublock,
        "content_bytes_read": read_bytes, "physical_io_bytes_read": None,
        "files_metadata_visited": visited, "files_hashed": hashed,
        "cached_hashes_reused": reused, "missing_sources": missing,
        "changed_sources": changed,
        "source_coverage_fraction": None if profile == "HOT"
                                    else (len(selected) - len(missing)) / len(selected),
        "native_f_bavail_bytes": capacity_free,
        "false_positives_reviewed": None, "false_positives_confirmed": None,
        "decisions_enabled": ["SOURCE_CHANGE_REVIEW_REQUIRED"] if changed
                             else ["MISSING_SOURCE_INVESTIGATION_REQUIRED"] if missing
                             else ["NO_MUTATION_DECISION"],
        "status": ("CACHED_UNVERIFIED" if profile == "HOT" else
                   "PARTIAL_SOURCE_UNKNOWN" if missing else
                   "BOUNDED_LOCAL_SOURCE_MEASURED_NOT_SIGNED"),
        "deep_reason": reason if profile == "DEEP" else None,
        "mutation_authorized": False,
        "original_source_crypto_verified": False,
        "scope_is_whole_drive": False,
    }
    receipt_file = receipts / ("run-" + secrets.token_hex(16) + ".json")
    receipt_sha = seal(receipt_file, receipt)
    return {**receipt, "receipt_sha256": receipt_sha,
            "receipt_path": str(receipt_file)}


def percentile(values, p):
    ordered = sorted(values)
    if not ordered:
        return None
    ix = (len(ordered) - 1) * p
    low = int(ix)
    high = min(low + 1, len(ordered) - 1)
    return round(ordered[low] + (ordered[high] - ordered[low]) * (ix - low), 3)


def learning_summary(state_dir):
    directory = owned_private(state_dir)
    receipt_dir = owned_private(directory / "receipts")
    paths = sorted(receipt_dir.iterdir())
    require(len(paths) <= 512 and all(p.name.startswith("run-") and
                                     p.name.endswith(".json") for p in paths),
            "RECEIPT_CENSUS_BOUND")
    profiles = {}
    for p in paths:
        item = safe_read(p)
        require(type(item) is dict and
                item.get("schema") == "aoe2war.scan-os.learning-receipt.v2" and
                item.get("mutation_authorized") is False and
                item.get("authority") == "UNSIGNED_LOCAL_READ_ONLY_NOT_PRODUCTION_CERTIFIED",
                "UNTRUSTED_LEARNING_RECEIPT")
        z = profiles.setdefault(item["profile"], [])
        require(item["profile"] in PROFILES and type(item["wall_ns"]) is int
                and type(item["cpu_ns"]) is int
                and type(item["content_bytes_read"]) is int, "METRIC_TYPES")
        z.append(item)
    # Runs from distinct roots or producer lists cannot share percentiles.
    all_rows = [r for rs in profiles.values() for r in rs]
    if all_rows:
        first = all_rows[0]
        require(all(r.get("scope_identity") == first.get("scope_identity") and
                    r.get("goal") == first.get("goal") and
                    r.get("source_producers") == first.get("source_producers")
                    for r in all_rows), "BENCHMARK_SCOPE_DRIFT")
    summary = {}
    for profile, rows in sorted(profiles.items()):
        summary[profile] = {
            "runs": len(rows),
            "wall_ms_p50": percentile([r["wall_ns"] / 1e6 for r in rows], .5),
            "wall_ms_p95": percentile([r["wall_ns"] / 1e6 for r in rows], .95),
            "cpu_ms_p50": percentile([r["cpu_ns"] / 1e6 for r in rows], .5),
            "content_bytes_p50": percentile([r["content_bytes_read"] for r in rows], .5),
            "bounded_deep_runs": sum(
                r["profile"] == "DEEP" and
                type(r.get("deep_reason")) is str and
                len(r["deep_reason"]) >= 12 and
                r.get("scope_is_whole_drive") is False for r in rows),
            "hashed_files_total": sum(r["files_hashed"] for r in rows),
            "reused_hashes_total": sum(r["cached_hashes_reused"] for r in rows),
            "physical_io_bytes_known": False,
            "false_positive_rate": None,
            "statistical_robustness": "LOW_SAMPLE" if len(rows) < 5 else "LOCAL_ONLY",
        }
    return {"schema": "aoe2war.scan-os.learning-baseline.v2",
            "authority": "LOCAL_UNSIGNED_BENCHMARK_NOT_PRODUCTION_CERTIFIED",
            "profiles": summary, "receipts_count": len(paths),
            "mutation_authorized": False}
