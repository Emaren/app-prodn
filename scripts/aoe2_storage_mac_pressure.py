#!/usr/bin/env python3
"""Read-only Mac disk pressure census for the canonical AoE2WAR Storage OS.

Measure real allocated bytes at bounded named paths; no deletion or authority
promotion. Reports worktree-generated content separately from protected data.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

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
    ("electron_binary_cache", "Library/Caches/electron", "REGENERABLE_EXPLICIT_OPT_IN_ONLY"),
    ("electron_builder_cache", "Library/Caches/electron-builder", "REGENERABLE_EXPLICIT_OPT_IN_ONLY"),
    ("chrome_browser_cache", "Library/Caches/Google", "BROWSER_UI_MANAGED_REVIEW"),
    ("docker_virtual_disks", "Library/Containers/com.docker.docker/Data/vms", "ACTIVE_DOCKER_VM_PROTECTED_REVIEW"),
    ("codex_worktrees", ".codex/worktrees", "PROTECTED_DIRTY_WORKTREES"),
    ("codex_runtimes", ".cache/codex-runtimes", "PROTECTED_ACTIVE_RUNTIME_UNKNOWN"),
    ("crossover", "Library/Application Support/CrossOver", "PROTECTED_REPLAY_ENGINE"),
)
GENERATED_NAMES = (".next", "node_modules", ".direnv", ".turbo", "dist", "build", ".yarn-cache")


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
        size, complete = allocated(path)
        rows.append({
            "name": name, "path": str(path), "classification": classification,
            "allocated_bytes": size, "complete": complete,
            "exists": path.exists(), "symlink": path.is_symlink(),
            "mutation_allowed": False,
        })
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
    rows.sort(key=lambda r: (-r.get("allocated_bytes", 0), r["name"]))
    if len(rows) > limit:
        incomplete_reasons.append("DISPLAY_ROW_LIMIT")
    if any(row.get("complete") is not True for row in rows):
        incomplete_reasons.append("NAMED_PATH_MEASUREMENT_INCOMPLETE")
    incomplete_reasons = sorted(set(incomplete_reasons))
    return {"schema": 1, "status": "READ_ONLY", "mac_home": str(home),
            "project_root": str(project), "measured": rows[:limit],
            "observed_path_count": len(rows), "displayed_path_count": min(len(rows), limit),
            "named_census_complete": not incomplete_reasons,
            "incomplete_reasons": incomplete_reasons,
            "coverage": "NAMED_PATHS_ONLY_NOT_WHOLE_DISK",
            "mutation_allowed": False,
            "note": "Rows overlap (project vs generated); never sum them. Protection is not deletion authorization."}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--limit", type=int, default=30)
    args = parser.parse_args()
    if not 5 <= args.limit <= 300:
        parser.error("--limit must be 5..300")
    home = Path.home()
    root = home / "projects/AoE2HDBets"
    data = census(home, root, limit=args.limit)
    if args.json:
        print(json.dumps(data, indent=2, sort_keys=True))
    else:
        print("AOE2WAR MAC LARGE-ARTIFACT CENSUS — READ ONLY")
        print("Targets measured:", data["observed_path_count"])
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
