#!/usr/bin/env python3
"""Owner-Mac exact three obsolete Next.js build outputs; guarded, auditable reclaim.

No globbing, no project source deletion, no automatic Codex runtime removal.
PREVIEW is read-only. APPLY requires exact owner approval; stops on drift.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import uuid

PROJECT = Path.home() / "projects/AoE2HDBets"
CANONICAL = PROJECT / "app-prodn"
RECEIPTS = CANONICAL / ".aoe2war-release/storage-local-receipts"
TARGETS = (
    (".worktrees/codex-authenticated-satchel-deposit", "blonE7yFq5o1cHzYKgxU7"),
    (".worktrees/codex-satchel-complete-financial-paths", "knIrFoqHX9wcagyb6VeOv"),
    (".aoe2war-workspaces/app-prodn/update-independent-docs-context-20261015", "umMYGufkqoA0nkvTGXIo2"),
)
APPROVAL = "RECLAIM THREE VERIFIED HISTORICAL NEXT BUILDS"


def require(ok: bool, code: str) -> None:
    if not ok:
        raise RuntimeError("HOLD: " + code)


def command(argv: list[str], timeout: int = 30) -> bytes:
    p = subprocess.run(argv, capture_output=True, timeout=timeout, check=False)
    require(p.returncode == 0, "COMMAND_FAILED " + argv[0] + " " +
            p.stderr.decode(errors="replace")[-400:])
    return p.stdout


def assert_no_symlink_ancestors(path: Path) -> None:
    require(path.is_absolute(), "RELATIVE_PATH")
    current = path
    while True:
        st = os.lstat(current)
        require(stat.S_ISDIR(st.st_mode), "SYMLINK_OR_NONDIRECTORY " + str(current))
        if current == Path("/"):
            return
        current = current.parent


def dir_stats(build: Path) -> tuple[int, int]:
    """Never follow symlinks. Reject shared hardlinked regular files."""
    bytes_allocated = 0
    entries = 0
    base_dev = os.lstat(build).st_dev
    for root, dirs, files in os.walk(build, topdown=True, followlinks=False):
        for name in [*dirs, *files]:
            p = Path(root) / name
            st = os.lstat(p)
            require(st.st_dev == base_dev, "NESTED_MOUNT " + str(p))
            if stat.S_ISREG(st.st_mode):
                require(st.st_nlink == 1, "SHARED_HARDLINK " + str(p))
                require(st.st_uid == os.getuid(), "NONOWNER_FILE " + str(p))
            elif stat.S_ISDIR(st.st_mode):
                require(st.st_uid == os.getuid(), "NONOWNER_DIRECTORY " + str(p))
            else:
                # Symlinks and nonregular data are not needed for Next build
                # cache deletion. Stop rather than following a possible link.
                require(False, "NONREGULAR_OR_SYMLINK_ENTRY " + str(p))
            bytes_allocated += st.st_blocks * 512
            entries += 1
    return bytes_allocated, entries


def current_process_references(paths: list[Path]) -> None:
    """Any active process command or open path beneath a candidate is a hold."""
    # A worktree-wide process (e.g., Next dev server with cwd=repo)
    # also protects its .next build output, even when no .next FD is open.
    names = sorted({str(path) for build in paths for path in (build, build.parent)})
    process_list = command(["ps", "-axo", "command="], timeout=20).decode(errors="replace")
    for line in process_list.splitlines():
        if any(path in line for path in names):
            # The current invocation may include script source, but never
            # candidate paths as command line arguments.
            raise RuntimeError("HOLD: PROCESS_REFERENCES_BUILD_OUTPUT")
    # lsof reads real process file descriptors/cwd, not a grep over names.
    # Failure to inspect is not permission to delete.
    open_files = command(["lsof", "-nP", "-F", "n"], timeout=90).decode(errors="replace")
    for line in open_files.splitlines():
        if not line.startswith("n"):
            continue
        name = line[1:]
        if any(name == path or name.startswith(path + os.sep) for path in names):
            raise RuntimeError("HOLD: OPEN_FILE_IN_BUILD_OUTPUT")


def candidate(repo: Path, build_id: str) -> dict:
    require(repo.is_relative_to(PROJECT), "OUTSIDE_PROJECT")
    assert_no_symlink_ancestors(repo)
    require(repo.is_dir(), "WORKTREE_MISSING")
    build = repo / ".next"
    assert_no_symlink_ancestors(build)
    need = (build / "BUILD_ID")
    require(need.is_file() and not need.is_symlink(), "BUILD_ID_MISSING_OR_LINKED")
    require(need.read_text().strip() == build_id, "BUILD_ID_DRIFT")
    top = command(["git", "-C", str(repo), "rev-parse", "--show-toplevel"]).decode().strip()
    require(top == str(repo), "NOT_EXACT_WORKTREE")
    require(not command(["git", "-C", str(repo), "ls-files", "--", ".next"]).strip(),
            "TRACKED_BUILD_FILES")
    # Entire tracked source must be clean. Untracked source is still left intact.
    require(not command(["git", "-C", str(repo), "status", "--porcelain",
                         "--untracked-files=no"]).strip(), "WORKTREE_DIRTY")
    size, count = dir_stats(build)
    require(size > 1024 ** 3 and count > 100, "BUILD_SIZE_OR_SHAPE_DRIFT")
    return {"path": str(build), "build_id": build_id,
            "allocated_bytes": size, "entries": count,
            "directory_dev": os.lstat(build).st_dev,
            "directory_inode": os.lstat(build).st_ino,
            "git_head": command(["git", "-C", str(repo), "rev-parse", "HEAD"]).decode().strip()}


def fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def receipt(path: Path, obj: dict) -> None:
    data = (json.dumps(obj, sort_keys=True, indent=2) + "\n").encode()
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    fsync_dir(path.parent)


def free_bytes() -> int:
    st = os.statvfs(Path.home())
    return st.f_bavail * st.f_frsize


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    require(sys.platform == "darwin" and os.geteuid() == os.getuid(),
            "OWNER_MAC_NOT_VERIFIED")
    require(CANONICAL.is_dir() and not CANONICAL.is_symlink(),
            "CANONICAL_REPO_MISSING")
    plan = [candidate(PROJECT / name, buildid) for name, buildid in TARGETS]
    paths = [Path(p["path"]) for p in plan]
    current_process_references(paths)
    planned_bytes = sum(row["allocated_bytes"] for row in plan)
    print("AOE2WAR EXACT THREE HISTORICAL NEXT.JS BUILDS")
    print("SCOPE: only three untracked, source-clean, BUILD_ID-pinned .next directories")
    print("NEVER: Codex runtime cache, recovery, financial files, Downloads, E5 seal")
    print("PLAN_GIB:", round(planned_bytes / 1024**3, 3))
    for row in plan:
        print("BUILD:", row["path"], row["build_id"],
              "ALLOC_GIB:", round(row["allocated_bytes"] / 1024**3, 3))
    if not args.apply:
        print("PREVIEW_ONLY: no files changed; invoke --apply to authorize")
        return 0
    with open("/dev/tty", "r") as fin, open("/dev/tty", "w") as fout:
        fout.write("Type exactly " + APPROVAL + " to reclaim these three build directories: ")
        fout.flush()
        require(fin.readline().strip() == APPROVAL, "OWNER_DECLINED")
    require(RECEIPTS.is_dir() and not RECEIPTS.is_symlink(), "RECEIPT_DIRECTORY_UNTRUSTED")
    lock_path = RECEIPTS / ".mac-three-build-reclaim.lock"
    lock_fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, "rb+") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Recheck unchanged paths, inodes, heads, exact allocation, and live
        # processes *under the lock*, just before first mutation.
        require([candidate(PROJECT / name, buildid) for name, buildid in TARGETS] == plan,
                "BUILD_CANDIDATE_DRIFT")
        current_process_references(paths)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        ident = stamp + "-" + uuid.uuid4().hex[:12]
        before = free_bytes()
        intent = RECEIPTS / (ident + "-three-next-intent.json")
        receipt(intent, {"status": "AUTHORIZED", "before_available_bytes": before,
                         "plan": plan, "owner_uid": os.getuid(),
                         "scope": "exact-three-historical-next-builds",
                         "financial_mutation": False,
                         "source_mutation": False})
        completed = []
        try:
            for row in plan:
                path = Path(row["path"])
                st = os.lstat(path)
                require((st.st_dev, st.st_ino) == (row["directory_dev"], row["directory_inode"]),
                        "BUILD_INODE_SWAPPED")
                require(shutil.rmtree.avoids_symlink_attacks,
                        "RMTREE_SYMLINK_ATTACK_GUARD_UNAVAILABLE")
                shutil.rmtree(path)
                completed.append(row["path"])
                receipt(RECEIPTS / (ident + "-removed-" + str(len(completed)) + ".json"),
                        {"status": "REMOVED_EXACT_BUILD_OUTPUT", "path": row["path"],
                         "build_id": row["build_id"], "financial_mutation": False})
            after = free_bytes()
            final = RECEIPTS / (ident + "-three-next-final.json")
            receipt(final, {"status": "PASS_THREE_BUILD_OUTPUTS_REMOVED",
                            "plan": plan, "removed_paths": completed,
                            "before_available_bytes": before,
                            "after_available_bytes": after,
                            "measured_recovered_bytes": after - before,
                            "source_mutation": False, "financial_mutation": False})
            print("PASS_THREE_BUILD_OUTPUTS_REMOVED")
            print("MEASURED_GAIN_GIB:", round((after-before) / 1024**3, 3))
            print("FINAL_RECEIPT:", final)
        except BaseException:
            print("HOLD: PARTIAL_OR_UNKNOWN_RECLAIM. Inspect individual receipts; never blind retry.",
                  file=sys.stderr)
            raise
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(2)
