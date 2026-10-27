#!/usr/bin/env python3
"""Session D Phase 11: bounded READ-ONLY Mac build review, not a cleanup controller."""
import argparse
import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()
PROJECT = HOME / "projects" / "AoE2HDBets"
KINDS = (".next", "node_modules", ".turbo")
LIMIT_WORKTREES = 80

def execute(argv, timeout=35):
    try:
        p = subprocess.run(argv, text=True, capture_output=True, timeout=timeout,
                           env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"})
        return p.returncode, p.stdout, p.stderr
    except (OSError, subprocess.TimeoutExpired):
        return -1, "", "HOLD_COMMAND_UNAVAILABLE"

def is_inside(item, directory):
    return item == directory or directory in item.parents

def sha_file(item, max_bytes=16777216):
    try:
        if item.is_symlink() or not item.is_file() or item.stat().st_size > max_bytes:
            return None
        h = hashlib.sha256()
        with item.open("rb") as stream:
            while True:
                part = stream.read(65536)
                if not part:
                    break
                h.update(part)
        return h.hexdigest()
    except OSError:
        return None

def worktrees(repository):
    if not repository.is_dir() or repository.is_symlink():
        return [], "HOLD_REPO_PATH"
    rc, out, err = execute(["/usr/bin/git", "-C", str(repository),
                            "worktree", "list", "--porcelain"])
    if rc != 0:
        return [], "HOLD_GIT_WORKTREE"
    paths = []
    for line in out.splitlines():
        if line.startswith("worktree "):
            candidate = Path(line[len("worktree "):])
            if candidate.is_absolute() and is_inside(candidate, PROJECT):
                paths.append(candidate)
    if len(paths) > LIMIT_WORKTREES:
        return [], "HOLD_WORKTREE_LIMIT"
    return paths, "PASS"

def git_identity(root):
    rc, head, _ = execute(["/usr/bin/git", "-C", str(root), "rev-parse", "HEAD"], timeout=12)
    rcb, branch, _ = execute(["/usr/bin/git", "-C", str(root),
                              "symbolic-ref", "--short", "-q", "HEAD"], timeout=12)
    rcs, dirty, _ = execute(["/usr/bin/git", "--no-optional-locks", "-C",
                             str(root), "status", "--porcelain=v1",
                             "--untracked-files=normal"], timeout=25)
    return {
        "head": head.strip() if rc == 0 and re.fullmatch("[0-9a-f]{40}", head.strip()) else None,
        "branch": branch.strip() if rcb == 0 else None,
        "git_clean_normal_scope": dirty.strip() == "" if rcs == 0 else None,
        "ignored_generated_files_scanned": False,
    }

def allocated_kib(item):
    if item.is_symlink() or not item.is_dir():
        return None, "HOLD_MISSING_OR_SYMLINK"
    rc, out, _ = execute(["/usr/bin/du", "-sk", str(item)], timeout=45)
    value = re.match(r"^([0-9]+)\s", out)
    return (int(value.group(1)), "PASS") if rc == 0 and value else (None, "HOLD_DU")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if not PROJECT.is_dir() or PROJECT.is_symlink():
        print("HOLD_PROJECT_ROOT")
        return 2
    rc, fd_output, err = execute(["/usr/sbin/lsof", "-nP", "-Fpn"], timeout=50)
    fd_status = "PASS_POINT_IN_TIME" if rc == 0 and not err.strip() else "HOLD_FD_VISIBILITY"
    names = [line[1:] for line in fd_output.splitlines() if line.startswith("n")] if fd_status.startswith("PASS") else []
    rows = []
    source_cache = {}
    worktree_state = {}

    def add(label, root, candidate, priority, category):
        key = str(root)
        if key not in source_cache:
            source_cache[key] = git_identity(root)
        source = source_cache[key]
        size, size_status = allocated_kib(candidate)
        age_days = None
        try:
            if size_status == "PASS":
                age_days = round((datetime.now(timezone.utc).timestamp()
                                  - candidate.stat().st_mtime) / 86400, 1)
        except OSError:
            pass
        fd_count = None
        if fd_status.startswith("PASS"):
            prefix = str(candidate) + os.sep
            fd_count = sum(value == str(candidate) or value.startswith(prefix)
                           for value in names)
        lock = {}
        for name in ("yarn.lock", "package-lock.json", "pnpm-lock.yaml"):
            digest = sha_file(root / name)
            if digest:
                lock[name] = digest
        evidence = (root / ".aoe2war-release").exists() or (root / ".aoe2war-release").is_symlink()
        rows.append({
            "id": label, "priority": priority, "category": category,
            "allocated_kib": size, "allocated_status": size_status,
            "directory_mtime_age_days": age_days,
            "source_sha": source.get("head"), "branch": source.get("branch"),
            "git_clean_normal_scope": source.get("git_clean_normal_scope"),
            "lockfile_sha256": lock,
            "build_id_file_sha256": sha_file(candidate / "BUILD_ID", 512) if candidate.name == ".next" else None,
            "release_sibling_protected": evidence,
            "observable_open_fd_count": fd_count, "fd_status": fd_status,
            "reproducibility_proven": False,
            "classification": "HOLD_RELEASE_ADJACENT" if evidence else
               "HOLD_SIGNED_DISTRIBUTION" if label == "watcher/dist" else
               "HOLD_ACTIVE_PROJECT" if category == "active" else "HOLD_UNKNOWN_RUNTIME",
            "deletion_allowed": False,
        })

    for repo_name in ("app-prodn", "api-prodn"):
        root = PROJECT / repo_name
        attached, result = worktrees(root)
        worktree_state[repo_name] = result
        for workspace in attached:
            if workspace == root:
                continue
            for name in KINDS:
                candidate = workspace / name
                if candidate.exists() or candidate.is_symlink():
                    add(repo_name + "/" + workspace.name + "/" + name, workspace,
                        candidate, 1 if name == ".next" else 3, "attached")

    for slug, repo_name, dirname, priority in (
        ("app/.next", "app-prodn", ".next", 2),
        ("app/node_modules", "app-prodn", "node_modules", 3),
        ("api/node_modules", "api-prodn", "node_modules", 3),
        ("watcher/node_modules", "aoe2-watcher", "node_modules", 3),
        ("watcher/dist", "aoe2-watcher", "dist", 9),
    ):
        root = PROJECT / repo_name
        if (root / dirname).exists() or (root / dirname).is_symlink():
            add(slug, root, root / dirname, priority, "active")

    for slug, relative in (
        ("yarn_cache", "Library/Caches/Yarn"),
        ("go_build_cache", "Library/Caches/go-build"),
        ("pnpm_cache", "Library/Caches/pnpm"),
        ("core_simulator_cache", "Library/Developer/CoreSimulator/Caches"),
    ):
        path = HOME / relative
        if not path.exists() and not path.is_symlink():
            continue
        size, state = allocated_kib(path)
        rows.append({"id": slug, "priority": 2, "category": "existing_four_path_allowlist",
                     "allocated_kib": size, "allocated_status": state,
                     "classification": "PREVIEW_ONLY_APPLY_IS_ALL_FOUR_PATHS",
                     "deletion_allowed": False})

    rows.sort(key=lambda row: (row["priority"], -int(row["allocated_kib"] or 0), row["id"]))
    alerts = [row["id"] for row in rows if row["category"] == "attached"
              and row["id"].endswith("/.next") and row.get("allocated_kib") is not None
              and row["allocated_kib"] >= 1048576
              and row.get("directory_mtime_age_days") is not None
              and row["directory_mtime_age_days"] >= 7]
    result = {
        "schema": 1, "kind": "phase11_review_only_mac_generated_inventory",
        "worktree_probe": worktree_state, "fd_status": fd_status,
        "rows": rows, "advisory_old_large_next": alerts,
        "alert_rule": "at least 1 GiB and directory mtime at least 7 days; not a deletion rule",
        "historical_rollback_consumer_graph_proven": False,
        "new_reclaimed_bytes": 0, "mutation_allowed": False
    }
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print("PHASE 11 RANKED MAC GENERATED OUTPUT — READ ONLY")
        print("Workspace probes:", worktree_state, "FD:", fd_status)
        for row in rows:
            gib = "UNKNOWN" if row.get("allocated_kib") is None else str(round(row["allocated_kib"] / 1048576, 3))
            print(row["id"], gib + " GiB", row["classification"])
        print("ALERT_LARGE_STALE_NEXT_COUNT:", len(alerts))
        print("NO_MUTATION / NEW_RECLAIMED=0")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
