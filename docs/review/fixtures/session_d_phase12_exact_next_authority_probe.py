#!/usr/bin/env python3
"""Session D P0: bounded READ-ONLY authority review of exactly one Mac .next.

Never deletes, renames, follows release-state symlinks, or writes a receipt.
A zero-match result is NOT a deletion authorization: external cold retention
and independently restorable/rebuild proof must still be certified.
"""
from __future__ import annotations

import hashlib
import json
import os
import shlex
from pathlib import Path
import stat
import subprocess
import sys

PROJECT = Path.home() / "projects" / "AoE2HDBets"
REPO = PROJECT / "app-prodn"
WORKTREE = (PROJECT / ".aoe2war-workspaces/app-prodn"
            / "update-independent-docs-context-20261015")
NEXT = WORKTREE / ".next"
SOURCE_HEAD = "99c406f57d759b672fd9fe91d3c3355c4d527705"
EXPECTED_BRANCH = "fix/update-independent-docs-context-20261015"
BUILD_ID_FILE_SHA256 = (
    "3c93c1857e4ac0cadcb594e9914113ce2bd36c659be1576e5ae2e2c6da92a522"
)
YARN_LOCK_GIT_BLOB = "13dfb80133e3caa887ceb5ba08354dd4f62e4f60"
EXPECTED_SOURCE_CLI_BLOBS = {
    "bin/aoe2war": "35bc824386bf6a31b907d94f0a323e8bb2a0e339",
    "scripts/aoe2_release.py": "89e687e62cab68da625bc7b0ec9f5ade67de0629",
}


def run(args: list[str], timeout: int = 40) -> subprocess.CompletedProcess[str] | None:
    try:
        return subprocess.run(
            args, text=True, capture_output=True, check=False, timeout=timeout,
            env={**os.environ, "GIT_OPTIONAL_LOCKS": "0",
                 "PYTHONDONTWRITEBYTECODE": "1"},
        )
    except (OSError, subprocess.TimeoutExpired):
        return None


def regular_file(path: Path, max_bytes: int | None = None) -> bool:
    try:
        info = path.lstat()
    except OSError:
        return False
    return stat.S_ISREG(info.st_mode) and (
        max_bytes is None or info.st_size <= max_bytes
    )


def plain_directory(path: Path) -> bool:
    try:
        return stat.S_ISDIR(path.lstat().st_mode)
    except OSError:
        return False


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def valid_ancestry(path: Path) -> bool:
    # Disallow any symlink in the named candidate ancestors, even if resolving
    # to what looks like an equivalent path. Never follow it to classify.
    for node in (PROJECT, REPO, WORKTREE.parent.parent, WORKTREE.parent,
                 WORKTREE, NEXT):
        if not plain_directory(node):
            return False
    return True


def source_checks(gates: dict) -> None:
    gates["target_and_ancestor_types"] = valid_ancestry(NEXT)
    if not gates["target_and_ancestor_types"]:
        return
    head = run(["/usr/bin/git", "-C", str(WORKTREE), "rev-parse", "HEAD"], 15)
    branch = run(["/usr/bin/git", "-C", str(WORKTREE),
                  "symbolic-ref", "--short", "-q", "HEAD"], 15)
    status = run(["/usr/bin/git", "--no-optional-locks", "-C", str(WORKTREE),
                  "status", "--porcelain=v1", "--untracked-files=normal"], 30)
    registered = run(["/usr/bin/git", "-C", str(REPO),
                      "worktree", "list", "--porcelain"], 25)
    gates["source_head_pinned"] = bool(
        head and head.returncode == 0 and head.stdout.strip() == SOURCE_HEAD
    )
    gates["source_branch_pinned"] = bool(
        branch and branch.returncode == 0
        and branch.stdout.strip() == EXPECTED_BRANCH
    )
    gates["git_clean_normal_scope"] = bool(
        status and status.returncode == 0 and not status.stdout.strip()
    )
    gates["exact_attached_worktree"] = bool(
        registered and registered.returncode == 0
        and "worktree " + str(WORKTREE) in registered.stdout.splitlines()
    )
    lock = run(["/usr/bin/git", "hash-object", str(WORKTREE / "yarn.lock")], 15)
    gates["pinned_yarn_lock_blob"] = bool(
        regular_file(WORKTREE / "yarn.lock")
        and lock and lock.returncode == 0
        and lock.stdout.strip() == YARN_LOCK_GIT_BLOB
    )
    gates["pinned_next_build_id_file"] = bool(
        regular_file(NEXT / "BUILD_ID", 512)
        and sha256(NEXT / "BUILD_ID") == BUILD_ID_FILE_SHA256
    )
    for name, value in EXPECTED_SOURCE_CLI_BLOBS.items():
        item = REPO / name
        actual = run(["/usr/bin/git", "hash-object", str(item)], 15)
        gates["trusted_release_cli_" + name.replace("/", "_")] = bool(
            regular_file(item) and actual and actual.returncode == 0
            and actual.stdout.strip() == value
        )


def readers_and_size(gates: dict, results: dict) -> None:
    if not gates.get("target_and_ancestor_types"):
        return
    p = run(["/usr/bin/du", "-skx", str(NEXT)], 50)
    fields = p.stdout.split() if p and p.returncode == 0 else []
    results["allocated_kib"] = int(fields[0]) if fields and fields[0].isdigit() else None
    gates["allocation_probe"] = results["allocated_kib"] is not None
    p = run(["/usr/sbin/lsof", "-nP", "-Fpn"], 60)
    if not p or p.returncode != 0 or p.stderr.strip():
        gates["open_file_probe_complete"] = False
        return
    gates["open_file_probe_complete"] = True
    prefix = str(NEXT) + os.sep
    matches = set()
    pid = None
    for line in p.stdout.splitlines():
        if line.startswith("p") and line[1:].isdigit():
            pid = int(line[1:])
        elif line.startswith("n") and pid is not None:
            path = line[1:]
            if path == str(NEXT) or path.startswith(prefix):
                matches.add(pid)
    results["observed_next_fd_consumer_count"] = len(matches)
    gates["no_observed_open_file_consumers_at_sample"] = not matches


def release_evidence(gates: dict, results: dict) -> None:
    release = WORKTREE / ".aoe2war-release"
    gates["protected_release_root_unchanged_type"] = plain_directory(release)
    if not gates["protected_release_root_unchanged_type"]:
        return
    summary = {}
    for name in ("federation-validation", "recovery-campaigns", "storage-handoffs"):
        folder = release / name
        if not plain_directory(folder):
            summary[name] = "HOLD_DIRECTORY"
            continue
        counts = {"dirs": 0, "files": 0, "symlinks": 0}
        for root, dirs, files in os.walk(folder, followlinks=False):
            for entry in dirs + files:
                path = Path(root) / entry
                try:
                    mode = path.lstat().st_mode
                except OSError:
                    summary[name] = "HOLD_STAT"
                    break
                if stat.S_ISLNK(mode):
                    counts["symlinks"] += 1
                elif stat.S_ISDIR(mode):
                    counts["dirs"] += 1
                elif stat.S_ISREG(mode):
                    counts["files"] += 1
        if name not in summary:
            summary[name] = counts
    results["protected_release_entry_counts"] = summary
    gates["release_subtrees_type_count_match"] = (
        summary.get("federation-validation") == {"dirs": 1, "files": 0, "symlinks": 3}
        and summary.get("recovery-campaigns") == {"dirs": 1, "files": 1, "symlinks": 0}
        and summary.get("storage-handoffs") == {"dirs": 0, "files": 1, "symlinks": 0}
    )


def release_status(gates: dict, results: dict) -> None:
    if not all(gates.get("trusted_release_cli_" + n.replace("/", "_"))
               for n in EXPECTED_SOURCE_CLI_BLOBS):
        return
    if not gates.get("pinned_next_build_id_file"):
        return
    try:
        build_id = (NEXT / "BUILD_ID").read_bytes().strip().decode("ascii")
    except (OSError, UnicodeError):
        return
    if not build_id:
        return
    p = run([str(REPO / "bin/aoe2war"), "status", "--json"], 90)
    h = run([str(REPO / "bin/aoe2war"), "releases", "--limit", "1000", "--json"], 90)
    try:
        data = json.loads(p.stdout) if p and p.returncode == 0 else None
        history = json.loads(h.stdout) if h and h.returncode == 0 else None
    except (ValueError, TypeError):
        data = history = None
    prod = (data or {}).get("production") or {}
    cert = (data or {}).get("certification") or {}
    entries = (history or {}).get("releases")
    if not isinstance(entries, list):
        return
    results["local_certified_receipt_count"] = len(entries)
    results["local_certified_id_match_count"] = sum(
        isinstance(row, dict) and row.get("active_build_id") == build_id
        for row in entries
    )
    results["production_rollback_count"] = prod.get("rollback_count")
    results["current_certification_status"] = cert.get("status")
    gates["production_reachable"] = prod.get("reachable") is True
    gates["active_and_staged_other_builds"] = (
        bool(prod.get("active_build_id"))
        and prod.get("active_build_id") != build_id
        and prod.get("staged_build_id") != build_id
    )
    gates["local_certified_1000_history_nonmatch"] = (
        len(entries) < 1000 and results["local_certified_id_match_count"] == 0
    )
    gates["current_certification_valid"] = (
        cert.get("status") == "CERTIFIED"
    )
    gates["current_certification_different"] = (
        bool(cert.get("active_build_id"))
        and cert.get("active_build_id") != build_id
    )



def remote_hot_rollback_refs(gates: dict, results: dict) -> None:
    """Read only named hot rollback BUILD_ID files on the source-owned host.

    Does NOT enumerate volume cold archives or private activation receipts.
    No remote paths, BUILD_ID values, credentials or receipt bodies printed.
    """
    if not gates.get("pinned_next_build_id_file"):
        return
    host = os.environ.get("AOE2_RELEASE_HOST", "hel1")
    prod_root = os.environ.get(
        "AOE2_RELEASE_PROD_REPO", "/var/www/AoE2HDBets/app-prodn"
    )
    if not host or not prod_root.startswith("/") or "\n" in prod_root:
        return
    remote_code = """
import hashlib, json, pathlib, stat, sys
root = pathlib.Path(sys.argv[1])
expected = sys.argv[2]
roots = [root / ".next", root / ".next-release"]
try:
    roots.extend(sorted(root.glob(".next-rollback*")))
except OSError:
    print(json.dumps({"status":"HOLD_GLOB"}))
    raise SystemExit(0)
if len(roots) > 104:
    print(json.dumps({"status":"HOLD_TOO_MANY_GENERATIONS"}))
    raise SystemExit(0)
checked = 0
matches = 0
unknown = 0
for folder in roots:
    try:
        mode = folder.lstat().st_mode
        if not stat.S_ISDIR(mode):
            unknown += 1
            continue
        f = folder / "BUILD_ID"
        mode = f.lstat().st_mode
        if not stat.S_ISREG(mode) or f.stat().st_size > 512:
            unknown += 1
            continue
        with f.open("rb") as handle:
            raw = handle.read(513)
        checked += 1
        matches += hashlib.sha256(raw).hexdigest() == expected
    except FileNotFoundError:
        if folder.exists() or folder.is_symlink():
            unknown += 1
    except OSError:
        unknown += 1
print(json.dumps({
  "status":"PASS" if unknown == 0 else "HOLD_UNKNOWN_READERS",
  "entries_checked":checked, "exact_build_file_sha_matches":matches,
  "unclassified_entries":unknown
},sort_keys=True))
"""
    command = "python3 -c " + shlex.quote(remote_code) + " " + (
        shlex.quote(prod_root) + " " + shlex.quote(BUILD_ID_FILE_SHA256)
    )
    p = run([
        "/usr/bin/ssh", "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=8", host, command,
    ], 40)
    try:
        report = json.loads(p.stdout) if p and p.returncode == 0 else None
    except (ValueError, TypeError):
        report = None
    if not isinstance(report, dict):
        gates["remote_hot_rollback_scan_complete"] = False
        return
    gates["remote_hot_rollback_scan_complete"] = (
        report.get("status") == "PASS"
    )
    results["remote_hot_rollback_build_id_files_checked"] = (
        report.get("entries_checked")
    )
    results["remote_hot_rollback_matches"] = (
        report.get("exact_build_file_sha_matches")
    )
    results["remote_hot_rollback_unknown"] = (
        report.get("unclassified_entries")
    )
    gates["remote_hot_rollback_no_exact_build_id_match"] = (
        gates["remote_hot_rollback_scan_complete"]
        and report.get("exact_build_file_sha_matches") == 0
    )


def main() -> int:
    gates: dict[str, bool] = {}
    results: dict = {
        "schema": 1,
        "kind": "session-d-docs-exact-next-authority-probe",
        "deletion_authorized": False,
        "mode": "READ_ONLY",
        "target_label": "attached-docs-context/.next",
        "gates": gates,
    }
    source_checks(gates)
    readers_and_size(gates, results)
    release_evidence(gates, results)
    release_status(gates, results)
    remote_hot_rollback_refs(gates, results)
    # Separate records are necessary for cold rollback, off-Data restore, and
    # current/previous build users. Neither CI success nor empty FD scans prove
    # these domains, so ALWAYS HOLD these gates until independently audited.
    gates["remote_cold_archive_and_noncertified_authority"] = False
    gates["independent_off_data_restore_or_native_rebuild"] = False
    gates["future_build_controller_user_refs"] = False
    results["required_followup"] = (
        "Remote cold archive / noncertified rollback / exact Mac build consumers; "
        "restore-tested independent off-Data copy or isolated native rebuild; "
        "then existing-authority exact-one-path transaction"
    )
    print(json.dumps(results, indent=2, sort_keys=True))
    return 0 if all(gates.values()) else 2


if __name__ == "__main__":
    sys.exit(main())
