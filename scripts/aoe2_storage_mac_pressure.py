#!/usr/bin/env python3
"""Read-only Mac disk pressure census for the canonical AoE2WAR Storage OS.

Measure real allocated bytes at bounded named paths; no deletion or authority
promotion. Reports worktree-generated content separately from protected data.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
from pathlib import Path
import subprocess
import sys
import time

HOME_BUCKETS = (
    ("recovery_vault", "aoe2war-recovery", "PROTECTED_RECOVERY"),
    ("mobile_backups", "Library/Application Support/MobileSync/Backup", "PROTECTED_IOS"),
    ("mac_documents", "Documents", "PROTECTED_USER"),
    ("mac_downloads", "Downloads", "REVIEW_USER"),
    ("mac_movies", "Movies", "PROTECTED_USER"),
    ("mac_desktop", "Desktop", "PROTECTED_USER"),
    ("npm_other", ".npm", "REVIEW_GENERATED"),
    ("generic_cache", ".cache", "REVIEW_GENERATED"),
    ("cargo_registry", ".cargo/registry", "REVIEW_DEV"),
    ("go_modules", "go/pkg/mod", "REVIEW_DEV"),
    ("xcode_derived_data", "Library/Developer/Xcode/DerivedData", "REVIEW_DEV"),
    ("xcode_archives", "Library/Developer/Xcode/Archives", "PROTECTED_DEV_ARCHIVES"),
    ("homebrew", "Library/Homebrew", "REVIEW_TOOLCHAIN"),
    ("python_pyenv", ".pyenv", "REVIEW_TOOLCHAIN"),
    ("electron_binary_cache", "Library/Caches/electron", "REVIEW_REGENERABLE_OPT_IN_ONLY"),
    ("electron_builder_cache", "Library/Caches/electron-builder", "REVIEW_REGENERABLE_OPT_IN_ONLY"),
    ("chrome_browser_cache", "Library/Caches/Google", "REVIEW_BROWSER_UI_MANAGED"),
    ("docker_virtual_disks", "Library/Containers/com.docker.docker/Data/vms", "PROTECTED_ACTIVE_DOCKER_VM"),
    ("codex_worktrees", ".codex/worktrees", "PROTECTED_DIRTY_WORKTREES"),
    ("codex_runtimes", ".cache/codex-runtimes", "PROTECTED_ACTIVE_RUNTIME_UNKNOWN"),
    ("crossover", "Library/Application Support/CrossOver", "PROTECTED_REPLAY_ENGINE"),
)
GENERATED_NAMES = (".next", "node_modules", ".direnv", ".turbo", "dist", "build", ".yarn-cache")

# Exact, read-only focus on cache subdirectories only; user downloads are not
# enumerated here. None of these classes grants cache-deletion authority.
FOCUS_ROOTS = {
    "generic_cache": ".cache",
}
FOCUS_PROTECTED_CHILDREN = {
    "generic_cache": {"codex-runtimes"},
}
FOCUS_MAX_ENTRIES = 64
FOCUS_MAX_SECONDS = 65.0



def allocated(path: Path, timeout: int = 45) -> tuple[int, bool]:
    if path.is_symlink() or not path.exists():
        return 0, not path.is_symlink()
    try:
        p = subprocess.run(["du", "-skx", str(path)], capture_output=True, text=True,
                           timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return 0, False
    if p.returncode != 0:
        return 0, False
    try:
        return int(p.stdout.split()[0]) * 1024, True
    except (ValueError, IndexError):
        return 0, False


def named_measurement(path: Path, home: Path, timeout: int = 45) -> dict:
    """Exact named-path evidence: never convert an unknown to zero allocation."""
    def row(reason, size=None, st=None):
        proof = [str(path), reason, str(size)]
        if st:
            proof.extend(map(str, (st.st_dev, st.st_ino, st.st_mode,
                                   st.st_mtime_ns, st.st_size)))
        return dict(allocated_bytes=size, complete=reason in ("MEASURED", "ABSENT"),
                    measurement_reason=reason, exists=st is not None,
                    symlink=bool(st and stat.S_ISLNK(st.st_mode)),
                    metadata_fingerprint_sha256=hashlib.sha256(
                        "|".join(proof).encode("utf-8", "surrogateescape")).hexdigest(),
                    fingerprint_is_not_content_hash=True,
                    next_readonly_action=(
                        "NONE_ABSENT" if reason == "ABSENT" else
                        "REVIEW_LINK_OR_MOUNT" if "SYMLINK" in reason or
                        "MOUNT" in reason else "RECHECK_NAMED_PATH"),
                    next_readonly_command="aoe2war storage local-pressure --limit 1024 --json",
                    mutation_allowed=False)
    try:
        home_dev = os.lstat(home).st_dev
    except OSError:
        return row("HOME_STAT_FAILED")
    for ancestor in reversed(path.parents):
        try:
            s = os.lstat(ancestor)
        except FileNotFoundError:
            return row("ABSENT", 0)
        except PermissionError:
            return row("PERMISSION_DENIED")
        except OSError:
            return row("ANCESTOR_STAT_FAILED")
        if stat.S_ISLNK(s.st_mode):
            return row("SYMLINK_ANCESTOR")
        if not stat.S_ISDIR(s.st_mode):
            return row("NONDIRECTORY_ANCESTOR")
    try:
        before = os.lstat(path)
    except FileNotFoundError:
        return row("ABSENT", 0)
    except PermissionError:
        return row("PERMISSION_DENIED")
    except OSError:
        return row("TARGET_STAT_FAILED")
    if stat.S_ISLNK(before.st_mode):
        return row("SYMLINK_TARGET", st=before)
    if before.st_dev != home_dev:
        return row("OTHER_MOUNT", st=before)
    if not (stat.S_ISDIR(before.st_mode) or stat.S_ISREG(before.st_mode)):
        return row("NONREGULAR", st=before)
    try:
        p = subprocess.run(["du", "-skx", str(path)], capture_output=True,
                           text=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        return row("DU_TIMEOUT", st=before)
    except OSError:
        return row("DU_UNAVAILABLE", st=before)
    try:
        after = os.lstat(path)
    except FileNotFoundError:
        return row("VANISHED_DURING_DU", st=before)
    except PermissionError:
        return row("PERMISSION_DENIED_AFTER_DU", st=before)
    except OSError:
        return row("TARGET_STAT_FAILED_AFTER_DU", st=before)
    identity = lambda s: (s.st_dev, s.st_ino, s.st_mode, s.st_mtime_ns, s.st_size)
    if identity(before) != identity(after):
        return row("DRIFT_DURING_DU", st=before)
    if p.returncode:
        return row("DU_PERMISSION_DENIED" if
                   ("permission denied" in p.stderr.lower() or
                    "operation not permitted" in p.stderr.lower())
                   else "DU_NONZERO", st=before)
    try:
        kb = int(p.stdout.split()[0])
        if kb < 0:
            raise ValueError
    except (ValueError, IndexError):
        return row("DU_MALFORMED", st=before)
    return row("MEASURED", kb * 1024, before)


def worktrees(root: Path) -> list[Path]:
    if not root.is_dir() or root.is_symlink():
        return []
    p = subprocess.run(["git", "-C", str(root), "worktree", "list", "--porcelain"],
                       capture_output=True, text=True, check=False, timeout=20)
    if p.returncode:
        return []
    result = []
    for line in p.stdout.splitlines():
        if line.startswith("worktree "):
            path = Path(line[len("worktree "):])
            if path.is_absolute() and path.is_dir() and not path.is_symlink():
                result.append(path)
    return result


def census(home: Path, project: Path, *, limit: int = 30) -> dict:
    rows = []
    def add(name: str, path: Path, classification: str) -> None:
        rows.append({"name": name, "path": str(path),
                     "classification": classification,
                     **named_measurement(path, home)})
    for name, relative, classification in HOME_BUCKETS:
        add(name, home / relative, classification)
    incomplete_reasons = []
    if project.is_dir() and not project.is_symlink():
        dirs = sorted(
            [p for p in project.iterdir() if p.is_dir() and not p.is_symlink()],
            key=lambda p: p.name,
        )
        for path in dirs[:120]:
            add("project:" + path.name, path, "PROJECT_REVIEW_NEVER_AUTO_DELETE")
            # One-level, fixed-basename probes only; never recurse into source
            # or enumerate personal directories. Include only extant outputs,
            # so 120 sibling projects do not manufacture 840 absent rows.
            for basename in GENERATED_NAMES:
                output = path / basename
                try:
                    os.lstat(output)  # no-follow existence check
                except FileNotFoundError:
                    continue
                except OSError:
                    # Unreadable outputs must be reported as UNKNOWN, not lost.
                    pass
                add("project_generated:" + path.name + ":" + basename, output,
                    "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED")
        if len(dirs) > 120:
            incomplete_reasons.append("PROJECT_DIRECTORY_LIMIT_120")
            rows.append({"name": "PROJECT_CENSUS_INCOMPLETE",
                         "complete": False, "remaining_projects": len(dirs) - 120,
                         "mutation_allowed": False})
        # Discover declared worktrees from the canonical web Git repository,
        # rather than globbing inside arbitrary private user directories.
        primary = project / "app-prodn"
        declared_worktrees = worktrees(primary)
        if len(declared_worktrees) > 60:
            incomplete_reasons.append("WORKTREE_LIMIT_60")
        for repo in declared_worktrees[:60]:
            for name in GENERATED_NAMES:
                add("worktree_generated:" + repo.name + ":" + name,
                    repo / name, "REBUILDABLE_REVIEW_PROTECTED_UNTIL_AUTHORIZED")
    rows.sort(key=lambda r: (-(r.get("allocated_bytes") or 0), r["name"]))
    if len(rows) > limit:
        incomplete_reasons.append("DISPLAY_ROW_LIMIT")
    gaps = [{"name": r["name"], "path": r.get("path"),
             "classification": r.get("classification"),
             "reason": r.get("measurement_reason", "CENSUS_BOUND"),
             "allocated_bytes": None,
             "metadata_fingerprint_sha256": r.get("metadata_fingerprint_sha256"),
             "next_readonly_action": r.get("next_readonly_action", "REVIEW_CENSUS_BOUND"),
             "next_readonly_command": r.get(
                 "next_readonly_command",
                 "aoe2war storage local-pressure --limit 512 --json"),
             "mutation_allowed": False}
            for r in rows if r.get("complete") is not True]
    if gaps:
        incomplete_reasons.append("NAMED_PATH_MEASUREMENT_INCOMPLETE")
    incomplete_reasons = sorted(set(incomplete_reasons))
    try:
        v = os.statvfs(home)
        available = v.f_bavail * v.f_frsize
    except OSError:
        available = None
        incomplete_reasons.append("APFS_STATVFS_UNAVAILABLE")
    return {"schema": 1, "status": "READ_ONLY", "mac_home": str(home),
            "project_root": str(project), "measured": rows[:limit],
            "measurement_gaps": sorted(gaps, key=lambda r: r["name"]),
            "measurement_gap_count": len(gaps),
            "apfs_accounting": {
                "ordinary_available_bytes": available, "snapshots_bytes": None,
                "unique_clone_bytes": None, "purgeable_bytes": None,
                "verified_reclaimed_bytes": None,
                "du_allocation_is_not_unique_reclaim": True,
            },
            "observed_path_count": len(rows), "displayed_path_count": min(len(rows), limit),
            "named_census_complete": not incomplete_reasons,
            "incomplete_reasons": incomplete_reasons,
            "coverage": "NAMED_PATHS_ONLY_NOT_WHOLE_DISK",
            "mutation_allowed": False,
            "note": "Rows overlap (project vs generated); never sum them. Protection is not deletion authorization."}



def focused_census(home: Path, focus: str) -> dict:
    """Bounded one-level triage; unknown/protected files are never reclaimable."""
    if focus not in FOCUS_ROOTS:
        raise ValueError("UNSUPPORTED_FOCUS")
    root = home / FOCUS_ROOTS[focus]
    result = {
        "schema": 1, "kind": "aoe2war-local-storage-focus",
        "status": "UNKNOWN", "focus": focus, "root": str(root),
        "coverage": "ONE_LEVEL_NAMED_CACHE_CHILDREN_ONLY",
        "complete": False, "incomplete_reasons": [],
        "children": [], "auto_delete_permitted": False,
        "protected_data_never_selected": True,
    }
    if root.is_symlink():
        result["incomplete_reasons"].append("FOCUS_ROOT_SYMLINK")
        return result
    if not root.exists():
        result.update(status="ABSENT", complete=True)
        return result
    if not root.is_dir():
        result["incomplete_reasons"].append("FOCUS_ROOT_NOT_DIRECTORY")
        return result
    try:
        # Scandir is bounded; no recursive user-content reading, no globbing.
        with os.scandir(root) as scan:
            entries = []
            for child in scan:
                entries.append(child.name)
                if len(entries) > FOCUS_MAX_ENTRIES:
                    break
    except OSError:
        result["incomplete_reasons"].append("FOCUS_ENUMERATION_UNAVAILABLE")
        return result
    if len(entries) > FOCUS_MAX_ENTRIES:
        result["incomplete_reasons"].append("FOCUS_CHILD_LIMIT")
    # Sorted order is deterministic, but capped enumeration is incomplete.
    candidates = sorted(entries[:FOCUS_MAX_ENTRIES])
    deadline = time.monotonic() + FOCUS_MAX_SECONDS
    for name in candidates:
        if time.monotonic() >= deadline:
            result["incomplete_reasons"].append("FOCUS_TIME_BUDGET")
            break
        child = root / name
        protected = name in FOCUS_PROTECTED_CHILDREN.get(focus, set())
        classification = (
            "PROTECTED_ACTIVE_RUNTIME_UNKNOWN" if protected
            else "REVIEW_CACHE_CHILD_NEEDS_AUTHORITY")
        if child.is_symlink():
            row = {"name": name, "classification": classification,
                   "allocated_bytes": None, "complete": False,
                   "reason": "SYMLINK_NOT_FOLLOWED", "auto_delete_permitted": False}
            result["incomplete_reasons"].append("FOCUS_CHILD_SYMLINK")
        elif not (child.is_dir() or child.is_file()):
            row = {"name": name, "classification": classification,
                   "allocated_bytes": None, "complete": False,
                   "reason": "NON_REGULAR_CHILD", "auto_delete_permitted": False}
            result["incomplete_reasons"].append("FOCUS_NON_REGULAR_CHILD")
        else:
            remaining = max(1, min(8, int(deadline-time.monotonic())))
            bytes_used, ok = allocated(child, timeout=remaining)
            row = {"name": name, "classification": classification,
                   "allocated_bytes": bytes_used if ok else None,
                   "complete": ok, "auto_delete_permitted": False}
            if not ok:
                result["incomplete_reasons"].append("FOCUS_CHILD_MEASUREMENT_UNAVAILABLE")
        result["children"].append(row)
    result["children"].sort(key=lambda r: (
        -r["allocated_bytes"] if isinstance(r["allocated_bytes"], int) else 1, r["name"]
    ))
    result["complete"] = (not result["incomplete_reasons"] and
                          len(result["children"]) == len(entries))
    result["status"] = "READ_ONLY" if result["complete"] else "INCOMPLETE"
    result["incomplete_reasons"] = sorted(set(result["incomplete_reasons"]))
    return result



def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--focus", choices=sorted(FOCUS_ROOTS),
                        help="read-only, one-level cache-child review; never an apply mode")
    args = parser.parse_args()
    if not 5 <= args.limit <= 1024:
        parser.error("--limit must be 5..1024")
    home = Path.home()
    root = home / "projects/AoE2HDBets"
    data = focused_census(home, args.focus) if args.focus else census(home, root, limit=args.limit)
    if args.json:
        print(json.dumps(data, indent=2, sort_keys=True))
    elif args.focus:
        print("AOE2WAR MAC FOCUSED CACHE CENSUS — READ ONLY")
        print("Focus:", data["focus"], "State:", data["status"])
        print("Complete:", data["complete"], "Reasons:", ",".join(data["incomplete_reasons"]))
        for row in data["children"]:
            amount = (f"{row['allocated_bytes'] / 1024**3:.3f} GiB"
                      if isinstance(row["allocated_bytes"], int) else "UNKNOWN")
            print(amount, row["classification"], row["name"])
        print("NO DELETION AUTHORITY. This is a one-level named cache review.")
    else:
        print("AOE2WAR MAC LARGE-ARTIFACT CENSUS — READ ONLY")
        print("Targets measured:", data["observed_path_count"])
        print("Displayed:", data["displayed_path_count"],
              "Named coverage complete:", data["named_census_complete"])
        print("Incomplete reasons:", ",".join(data["incomplete_reasons"]))
        print("Named measurement gaps:", data["measurement_gap_count"])
        for r in data["measurement_gaps"]:
            print(" HOLD:", r["name"], r["reason"], r["next_readonly_action"])
        print("GiB       Classification                       Path")
        for row in data["measured"]:
            if row.get("allocated_bytes", 0):
                gb = row["allocated_bytes"] / (1024 ** 3)
                status = row["classification"] if row["complete"] else "UNKNOWN"
                print(f"{gb:8.2f}  {status:36s} {row['path']}")
        print("NO FILES DELETED. Rows overlap; do NOT sum bytes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
