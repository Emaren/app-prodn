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

# Explicit one-pass, read-only APFS geometry. No recurring collector.
CAPACITY_SLICE_TIMEOUT = 110
CAPACITY_MAX_OUTPUT = 1024 * 1024

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
    scope_bounds = {
        "direct_project_roots_total": None, "direct_project_roots_observed": 0,
        "direct_project_roots_omitted": None, "canonical_git_worktrees_total": None,
        "canonical_git_worktrees_observed": 0, "canonical_git_worktrees_omitted": None,
        "nested_project_build_roots_in_scope": False,
        "projects_outside_aoe2hdbets_in_scope": False,
    }
    if project.is_dir() and not project.is_symlink():
        dirs = sorted(
            [p for p in project.iterdir() if p.is_dir() and not p.is_symlink()],
            key=lambda p: p.name,
        )
        scope_bounds.update(
            direct_project_roots_total=len(dirs),
            direct_project_roots_observed=min(len(dirs), 120),
            direct_project_roots_omitted=max(0, len(dirs)-120))
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
        scope_bounds.update(
            canonical_git_worktrees_total=len(declared_worktrees),
            canonical_git_worktrees_observed=min(len(declared_worktrees), 60),
            canonical_git_worktrees_omitted=max(0, len(declared_worktrees)-60))
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
            "scope_bounds": scope_bounds,
            "named_census_complete": not incomplete_reasons,
            "incomplete_reasons": incomplete_reasons,
            "coverage": "NAMED_PATHS_ONLY_NOT_WHOLE_DISK",
            "mutation_allowed": False,
            "note": "Rows overlap (project vs generated); never sum them. Protection is not deletion authorization."}




# Post-W1 owner-opt-in metadata receipt. This intentionally does not call du,
# named_measurement, a recursive traversal, a scan of protected worktrees,
# or any mutating Storage OS controller.
PROVENANCE_PROJECT_ENTRY_CAP = 121
PROVENANCE_PROJECT_ROOT_CAP = 120
PROVENANCE_WORKTREE_CAP = 60
PROVENANCE_GIT_MAX_BYTES = 65536
PROVENANCE_MAC_FREE_FLOOR = 25 * 1024**3


def _protected_worktree_source(path: Path) -> bool:
    parts = [p.lower() for p in path.parts]
    return (".codex" in parts or "app-prodn-e5-seal" in parts
            or any(part in (".worktrees", ".aoe2war-workspaces")
                   and any(x.startswith("codex-") for x in parts[i + 1:])
                   for i, part in enumerate(parts)))


def root_provenance_only(home: Path, project: Path, *,
                         platform: str | None = None) -> dict:
    """A bounded native root-identity witness; never a storage scan or L1 permit.

    Project directory entries: <=121, only 120 roots represented. Git worktree
    declarations: <=61, only 60 represented. Overflow remains UNKNOWN.
    Protected worktrees receive NO child walk or lstat at all. No APFS unique
    extent can be calculated from these root-level inode identities.
    """
    receipt = {
        "schema": "aoe2war.mac-l1-root-provenance.v1",
        "status": "HOLD", "scope": "ONE_LEVEL_PROJECT_AND_DECLARED_GIT_ROOTS_ONLY",
        "project_root": str(project), "project_roots": [], "worktree_roots": [],
        "project_entry_cap": PROVENANCE_PROJECT_ENTRY_CAP,
        "project_root_cap": PROVENANCE_PROJECT_ROOT_CAP,
        "worktree_cap": PROVENANCE_WORKTREE_CAP,
        "project_entries_seen": None, "project_directory_roots_seen": None,
        "project_entry_overflow_unknown": None, "worktrees_declared_seen": None,
        "worktree_overflow_unknown": None, "protected_worktrees_skipped": None,
        "cross_namespace_aliases": [], "holds": [],
        "ordinary_free_bytes": None,
        "minimum_free_bytes_for_owner_review": PROVENANCE_MAC_FREE_FLOOR,
        "free_floor_observed_pass": False, "floor_is_not_an_owner_permit": True,
        "git_worktree_source": "LOCAL_CANONICAL_APP_PRODN_PORCELAIN",
        "git_worktree_mutation_allowed": False,
        "path_contents_read": False, "recursive_walk": False,
        "du_executed": False, "spotlight_modified": False,
        "protected_l5_inventoried": False,
        "all_source_roots_certified": False,
        "native_l1_gate_three_accepted": False,
        "policy_scope_complete": False, "owner_approval": None,
        "eligible_l1_candidates": None,
        "gross_allocated_bytes": None,
        "unique_apfs_recoverable_bytes": None,
        "clone_hardlink_snapshot_unique_extents": None,
        "physical_before_after_transaction_receipt": None,
        "l1_policy_exhaustion_decision": "L1_POLICY_EXHAUSTED_NO",
        "mutation_authority": "NONE",
    }
    if (platform or sys.platform) != "darwin":
        receipt["holds"].append("NOT_NATIVE_MAC")
        return receipt
    if project != home / "projects" / "AoE2HDBets":
        receipt["holds"].append("UNEXPECTED_PROJECT_ROOT")
        return receipt
    try:
        st_home = os.lstat(home)
        if not stat.S_ISDIR(st_home.st_mode) or stat.S_ISLNK(st_home.st_mode):
            receipt["holds"].append("HOME_NOT_PHYSICAL_DIRECTORY")
            return receipt
        for ancestor in (home / "projects", project):
            s = os.lstat(ancestor)
            if (not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode)
                    or s.st_dev != st_home.st_dev):
                receipt["holds"].append("SYMLINK_OR_FOREIGN_MOUNT_ANCESTOR")
                return receipt
        v = os.statvfs(home)
        size = v.f_frsize or v.f_bsize
        if size <= 0 or v.f_bavail < 0:
            receipt["holds"].append("STATVFS_INCOHERENT")
            return receipt
        receipt["ordinary_free_bytes"] = v.f_bavail * size
        receipt["free_floor_observed_pass"] = (
            receipt["ordinary_free_bytes"] >= PROVENANCE_MAC_FREE_FLOOR)
        if not receipt["free_floor_observed_pass"]:
            receipt["holds"].append("MAC_BELOW_25_GIB_LOW_IO_ADMISSION_FLOOR")
            return receipt
        entries = []
        with os.scandir(project) as iterator:
            for entry in iterator:
                entries.append(entry.name)
                if len(entries) >= PROVENANCE_PROJECT_ENTRY_CAP:
                    break
        receipt["project_entries_seen"] = len(entries)
        receipt["project_entry_overflow_unknown"] = (
            len(entries) == PROVENANCE_PROJECT_ENTRY_CAP)
        if receipt["project_entry_overflow_unknown"]:
            receipt["holds"].append("DIRECT_PROJECT_ENTRY_CAP")
        physical_roots = set()
        directory_count = 0
        for name in sorted(entries[:PROVENANCE_PROJECT_ROOT_CAP]):
            root = project / name
            try:
                s = os.lstat(root)
            except OSError:
                receipt["holds"].append("PROJECT_ROOT_STAT_UNKNOWN")
                continue
            if stat.S_ISLNK(s.st_mode):
                receipt["holds"].append("PROJECT_SYMLINK_NOT_FOLLOWED")
                continue
            if not stat.S_ISDIR(s.st_mode):
                continue
            directory_count += 1
            identity = {
                "path": str(root), "device": s.st_dev, "inode": s.st_ino,
                "owner_uid": s.st_uid, "identity_is_not_unique_apfs_extent": True,
                "class": ("PROTECTED_ACTIVE_OR_OWNER_DATA_NO_CHILD_SCAN"
                          if name.lower() in ("app-prodn", "api-prodn", "wolo",
                                              "app-prodn-e5-seal")
                          else "UNQUALIFIED_PROJECT_ROOT_NO_CHILD_SCAN"),
            }
            if s.st_dev != st_home.st_dev:
                identity["class"] = "FOREIGN_MOUNT_HOLD"
                receipt["holds"].append("PROJECT_ROOT_FOREIGN_MOUNT")
            receipt["project_roots"].append(identity)
            physical_roots.add(str(root))
        receipt["project_directory_roots_seen"] = directory_count
        primary = project / "app-prodn"
        s = os.lstat(primary)
        if (not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode)
                or s.st_dev != st_home.st_dev):
            receipt["holds"].append("CANONICAL_GIT_ROOT_UNVERIFIED")
            return receipt
        p = subprocess.run(
            ["git", "-C", str(primary), "worktree", "list", "--porcelain"],
            capture_output=True, text=True, check=False, timeout=12,
            env={**os.environ, "GIT_OPTIONAL_LOCKS": "0",
                 "GIT_TERMINAL_PROMPT": "0"})
        if p.returncode or len(p.stdout.encode("utf-8", "surrogateescape")) > PROVENANCE_GIT_MAX_BYTES:
            receipt["holds"].append("GIT_WORKTREE_SOURCE_UNKNOWN")
            return receipt
        declared = [line[9:] for line in p.stdout.splitlines()
                    if line.startswith("worktree ")]
        if not declared or len(declared) != len(set(declared)):
            receipt["holds"].append("GIT_WORKTREE_DECLARATIONS_MISSING_OR_DUPLICATE")
            return receipt
        receipt["worktrees_declared_seen"] = min(len(declared), PROVENANCE_WORKTREE_CAP+1)
        receipt["worktree_overflow_unknown"] = len(declared) > PROVENANCE_WORKTREE_CAP
        if receipt["worktree_overflow_unknown"]:
            receipt["holds"].append("GIT_WORKTREE_DECLARATIONS_OVER_CAP")
        skipped = 0
        for text_path in declared[:PROVENANCE_WORKTREE_CAP]:
            root = Path(text_path)
            if (not root.is_absolute() or ".." in root.parts
                    or any(ord(c) < 32 for c in text_path)):
                receipt["holds"].append("GIT_WORKTREE_PATH_AMBIGUOUS")
                continue
            if _protected_worktree_source(root):
                skipped += 1
                receipt["worktree_roots"].append({
                    "path": text_path, "class": "PROTECTED_WORKTREE_NO_STAT_OR_TRAVERSAL",
                    "identity": None, "mutation_authority": "NONE"})
                continue
            try:
                s = os.lstat(root)
            except OSError:
                receipt["holds"].append("DECLARED_WORKTREE_ROOT_STAT_UNKNOWN")
                continue
            row = {"path": text_path, "device": s.st_dev, "inode": s.st_ino,
                   "identity_is_not_unique_apfs_extent": True,
                   "class": "UNQUALIFIED_DECLARED_WORKTREE_NO_CHILD_SCAN"}
            if (not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode)
                    or s.st_dev != st_home.st_dev):
                row["class"] = "WORKTREE_SYMLINK_MOUNT_OR_TYPE_HOLD"
                receipt["holds"].append("WORKTREE_ROOT_UNSAFE")
            if text_path in physical_roots:
                receipt["cross_namespace_aliases"].append(text_path)
                receipt["holds"].append("PROJECT_WORKTREE_ALIAS_NO_DOUBLE_COUNT")
            receipt["worktree_roots"].append(row)
        receipt["protected_worktrees_skipped"] = skipped
        if not receipt["holds"]:
            receipt["status"] = "BOUNDED_ROOT_IDENTITIES_OBSERVED_NOT_L1_CERTIFIED"
    except (OSError, subprocess.TimeoutExpired, UnicodeError):
        receipt["holds"].append("ROOT_OR_WORKTREE_SOURCE_UNAVAILABLE")
    receipt["holds"] = sorted(set(receipt["holds"]))
    return receipt



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



def capacity_depth_one(root: Path, device: int, *, timeout: int = CAPACITY_SLICE_TIMEOUT) -> dict:
    """One metadata-only du traversal per boundary; no file contents read.

    Each depth-1 row is disjoint *within its own boundary only*.
    Nested boundary results overlap and must NEVER be summed together.
    """
    report = {"root": str(root), "status": "HOLD", "allocated_bytes": None,
              "direct_children": [], "unmeasured": [], "direct_file_count": 0,
              "gross_not_unique_apfs_bytes": True, "mutation_allowed": False}
    try:
        st = os.lstat(root)
        if stat.S_ISLNK(st.st_mode) or not stat.S_ISDIR(st.st_mode):
            report["reason"] = "ROOT_SYMLINK_OR_NON_DIRECTORY"
            return report
        if st.st_dev != device:
            report["reason"] = "CROSSES_DATA_DEVICE"
            return report
        entries = []
        with os.scandir(root) as listing:
            for entry in listing:
                # Direct children only; no content inspection or recursion here.
                entries.append(entry.name)
                if len(entries) > 8192:
                    report["reason"] = "DIRECT_ENTRY_BOUND_EXCEEDED"
                    return report
    except PermissionError:
        report["reason"] = "ENUMERATION_PERMISSION_DENIED"
        return report
    except OSError:
        report["reason"] = "ROOT_OR_ENUMERATION_UNAVAILABLE"
        return report
    try:
        p = subprocess.run(
            ["du", "-k", "-x", "-d", "1", str(root)], capture_output=True,
            text=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        report["reason"] = "DU_TIME_BUDGET_EXCEEDED"
        return report
    except OSError:
        report["reason"] = "DU_NOT_AVAILABLE"
        return report
    if p.returncode != 0:
        report["reason"] = "DU_ERROR_OR_PERMISSION_DENIED"
        return report
    if len(p.stdout.encode("utf-8", "surrogateescape")) > CAPACITY_MAX_OUTPUT:
        report["reason"] = "DU_OUTPUT_LIMIT"
        return report
    values = {}
    try:
        for line in p.stdout.splitlines():
            # Reject embedded newlines or tab-ambiguous names rather than
            # assigning their allocations to a different path.
            amount, name = line.split("\t", 1)
            if not amount.isdecimal() or name in values:
                raise ValueError("bad du")
            target = Path(name)
            if target != root and target.parent != root:
                raise ValueError("unexpected du depth")
            values[name] = int(amount) * 1024
    except (ValueError, OverflowError):
        report["reason"] = "DU_MALFORMED_OR_AMBIGUOUS"
        return report
    if str(root) not in values:
        report["reason"] = "DU_ROOT_SUMMARY_MISSING"
        return report
    for name in sorted(entries):
        child = root / name
        try:
            s = os.lstat(child)
        except OSError:
            report["unmeasured"].append({"path": str(child), "reason": "CHILD_STAT_FAILED"})
            continue
        if stat.S_ISLNK(s.st_mode):
            report["unmeasured"].append({"path": str(child), "reason": "SYMLINK_NOT_FOLLOWED"})
        elif s.st_dev != device:
            report["unmeasured"].append({"path": str(child), "reason": "OTHER_MOUNT"})
        elif stat.S_ISDIR(s.st_mode):
            if str(child) not in values:
                report["unmeasured"].append({"path": str(child), "reason": "MISSING_DU_CHILD"})
            else:
                report["direct_children"].append({
                    "path": str(child), "allocated_bytes": values[str(child)],
                    "scope": "SHALLOW_DIRECTORY_GROSS_NOT_UNIQUE",
                    "mutation_allowed": False})
        else:
            # Single files are in the root du total, not independently
            # classified. They are a residual, not free/reclaimable bytes.
            report["direct_file_count"] += 1
    report["allocated_bytes"] = values[str(root)]
    directory_sum = sum(r["allocated_bytes"] for r in report["direct_children"])
    report["root_files_links_and_metadata_gross_residual_bytes"] = (
        max(0, report["allocated_bytes"] - directory_sum)
        if not report["unmeasured"] and directory_sum <= report["allocated_bytes"] else None)
    report["reason"] = "COMPLETE_SHALLOW_METADATA" if not report["unmeasured"] else "UNMEASURED_DIRECT_CHILDREN"
    report["status"] = "OBSERVED_SHALLOW" if not report["unmeasured"] else "HOLD"
    return report


def capacity_accounting(home: Path, *, data_root: Path = Path("/System/Volumes/Data"),
                        platform: str | None = None) -> dict:
    """Opt-in 500-GB accounting, never a completeness or physical-reclaim claim."""
    result = {
        "schema": "aoe2war.mac-l1-capacity-accounting.v1",
        "status": "HOLD", "scope": "APFS_DATA_ROOT_AND_HOME_SHALLOW_METADATA",
        "mount_identity": None, "apfs_capacity": None, "data_top_level": None,
        "home_top_level": None, "unexplained_physical_bytes": None,
        "apfs_snapshots_bytes": None, "clones_shared_bytes": None,
        "purgeable_bytes": None, "other_apfs_volumes_bytes": None,
        "full_container_coverage_certified": False,
        "private_file_contents_read": False, "mutation_allowed": False,
    }
    if (platform or sys.platform) != "darwin":
        result["reason"] = "NOT_NATIVE_MAC"
        return result
    try:
        home_stat = os.lstat(home)
        data_stat = os.lstat(data_root)
        if (not stat.S_ISDIR(home_stat.st_mode) or stat.S_ISLNK(home_stat.st_mode)
                or not stat.S_ISDIR(data_stat.st_mode) or stat.S_ISLNK(data_stat.st_mode)
                or home_stat.st_dev != data_stat.st_dev):
            result["reason"] = "DATA_HOME_MOUNT_IDENTITY_MISMATCH"
            return result
        before = os.statvfs(data_root)
        block = before.f_frsize or before.f_bsize
        if (block <= 0 or before.f_blocks <= 0
                or before.f_bavail < 0 or before.f_bfree < before.f_bavail):
            result["reason"] = "STATVFS_INCOHERENT"
            return result
        # Reuse the existing source-owned authenticated-identity probe.
        probe = Path(__file__).resolve().parent / "aoe2_storage_probe.py"
        identity_proc = subprocess.run(
            [sys.executable, str(probe), "--plane", "mac"],
            capture_output=True, text=True, check=False, timeout=12)
        payload = json.loads(identity_proc.stdout) if identity_proc.returncode == 0 else {}
        identity = payload.get("filesystem") if isinstance(payload, dict) else None
        if not (isinstance(identity, dict) and identity.get("fs_type") == "apfs"
                and identity.get("uuid") and identity.get("mount_source")):
            result["reason"] = "APFS_IDENTITY_UNVERIFIED"
            return result
        result["mount_identity"] = identity
        result["apfs_capacity"] = {
            "statvfs_shared_total_bytes": before.f_blocks * block,
            "ordinary_available_bytes_before": before.f_bavail * block,
            "free_blocks_bytes_before": before.f_bfree * block,
            "container_capacity_from_diskutil_bytes": None,
            "statvfs_not_independent_container_extent_proof": True,
        }
        result["data_top_level"] = capacity_depth_one(data_root, data_stat.st_dev)
        result["home_top_level"] = capacity_depth_one(home, home_stat.st_dev)
        after = os.statvfs(data_root)
        result["apfs_capacity"]["ordinary_available_bytes_after"] = (
            after.f_bavail * (after.f_frsize or after.f_bsize))
        if (result["data_top_level"]["status"] != "OBSERVED_SHALLOW"
                or result["home_top_level"]["status"] != "OBSERVED_SHALLOW"):
            result["reason"] = "SHALLOW_CAPACITY_METADATA_INCOMPLETE"
        else:
            result["reason"] = "APFS_SHARED_METADATA_AND_PHYSICAL_EXTENTS_UNPROVEN"
        if (result["data_top_level"]["status"] == "OBSERVED_SHALLOW"
                and result["home_top_level"]["status"] == "OBSERVED_SHALLOW"):
            result["status"] = "OBSERVED_SHALLOW"
        # Missing metadata/clone/snapshot/OS volume measurements are UNKNOWN.
        # du gross, APFS used and root residual are deliberately not subtracted
        # into a false unique/extents or free-space recovery claim.
    except (OSError, ValueError, json.JSONDecodeError, subprocess.TimeoutExpired):
        result["reason"] = "CAPACITY_SOURCE_UNAVAILABLE"
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--focus", choices=sorted(FOCUS_ROOTS),
                        help="read-only, one-level cache-child review; never an apply mode")
    parser.add_argument("--root-provenance-only", action="store_true",
                        help="bounded root lstat+Git metadata only; no du, no deletion")
    parser.add_argument("--capacity-only", action="store_true",
                        help="one opt-in, read-only mount-aware shallow Data + home accounting")
    args = parser.parse_args()
    if not 5 <= args.limit <= 1024:
        parser.error("--limit must be 5..1024")
    home = Path.home()
    root = home / "projects/AoE2HDBets"
    if args.root_provenance_only and (args.capacity_only or args.focus):
        parser.error("--root-provenance-only cannot combine with capacity or focus")
    data = (root_provenance_only(home, root) if args.root_provenance_only
            else capacity_accounting(home) if args.capacity_only
            else focused_census(home, args.focus) if args.focus
            else census(home, root, limit=args.limit))
    if args.json:
        print(json.dumps(data, indent=2, sort_keys=True))
    elif args.root_provenance_only:
        print("AOE2WAR MAC BOUNDED ROOT PROVENANCE — READ ONLY")
        print("Status:", data["status"], "Holds:", ",".join(data["holds"]))
        print("Project roots:", len(data["project_roots"]),
              "declared worktrees:", len(data["worktree_roots"]))
        print("L1 exhaustion: NO; APFS unique gain UNKNOWN; NO mutation authority")
    elif args.capacity_only:
        print("AOE2WAR MAC SHALLOW APFS CAPACITY — READ ONLY")
        print("Status:", data["status"], "Reason:", data.get("reason"))
        print("Physical unique gain: UNKNOWN; full container proof: NO; no mutation")
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
