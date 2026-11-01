#!/usr/bin/env python3
"""Read-only Git/GitHub discovery, not an alternative release registry.

No fetch, checkout, reset, prune, force push, cleanup or source writes.
UNKNOWN is an intentional admission status. Run against each owning repo.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys

READ_ENV = dict(os.environ, GIT_OPTIONAL_LOCKS="0")


def command(argv, cwd=None, timeout=12):
    try:
        proc = subprocess.run(argv, cwd=cwd, env=READ_ENV, capture_output=True,
                              text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return proc.stdout.strip() if proc.returncode == 0 else None


def parse_worktrees(text):
    rows = []
    for block in text.split("\n\n"):
        values = {}
        for line in block.splitlines():
            key, _, value = line.partition(" ")
            if key in ("worktree", "HEAD", "branch"):
                values[key] = value
            elif key in ("detached", "locked", "prunable"):
                values[key] = True
        if values.get("worktree"):
            rows.append(values)
    return rows


def pr_index(items):
    index = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        branch = item.get("headRefName")
        if isinstance(branch, str) and branch:
            index.setdefault(branch, []).append(item)
    return index


def pr_record(item):
    if item is None:
        return {"status": "UNKNOWN"}
    checks = item.get("statusCheckRollup")
    statuses = []
    if isinstance(checks, list):
        for c in checks:
            if isinstance(c, dict):
                statuses.append({"name": c.get("name") or c.get("context") or "UNKNOWN",
                                 "status": c.get("conclusion") or c.get("state") or c.get("status") or "UNKNOWN"})
    return {"number": item.get("number"), "state": item.get("state", "UNKNOWN"),
            "draft": item.get("isDraft", "UNKNOWN"), "base": item.get("baseRefName"),
            "url": item.get("url"), "updated_at": item.get("updatedAt"),
            "merged_at": item.get("mergedAt"),
            "issue_reference_candidates": sorted(set(re.findall(r"(?<![\w/])#\d+", item.get("body") or ""))),
            "ci_observed": statuses or "UNKNOWN",
            "source_qualified": "UNKNOWN_REQUIRES_EXACT_HEAD_REVIEW"}


def measure(repo, sha, target_sha, branch, worktree_path, prs):
    result = {"branch": branch or "DETACHED_OR_UNKNOWN", "worktree": worktree_path,
              "head": sha or "UNKNOWN", "tracking": "UNKNOWN",
              "dirty": "UNKNOWN", "dirty_entries": "UNKNOWN", "ahead": "UNKNOWN",
              "behind": "UNKNOWN", "last_commit_utc": "UNKNOWN",
              "unique_commits_vs_target": "UNKNOWN", "ancestor_of_target": "UNKNOWN",
              "release_gate": "UNKNOWN", "disposition": "UNKNOWN",
              "production_state": "NOT_VERIFIED", "prs": [pr_record(p) for p in prs]}
    loc = worktree_path or str(repo)
    if sha and target_sha:
        ahead = command(["git", "rev-list", "--count", f"{target_sha}..{sha}"], cwd=repo)
        result["unique_commits_vs_target"] = int(ahead) if ahead and ahead.isdigit() else "UNKNOWN"
        result["ancestor_of_target"] = (result["unique_commits_vs_target"] == 0
                                        if isinstance(result["unique_commits_vs_target"], int) else "UNKNOWN")
    if sha:
        result["last_commit_utc"] = command(["git", "show", "-s", "--format=%cI", sha], cwd=repo) or "UNKNOWN"
    if worktree_path and Path(worktree_path).is_dir():
        status = command(["git", "status", "--porcelain=v1", "--untracked-files=normal"], cwd=loc)
        if status is not None:
            result["dirty_entries"] = len(status.splitlines()) if status else 0
            result["dirty"] = bool(status)
        if branch:
            upstream = command(["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], cwd=loc)
            if upstream:
                result["tracking"] = upstream
                counts = command(["git", "rev-list", "--left-right", "--count", f"{upstream}...{sha}"], cwd=loc)
                if counts and len(counts.split()) == 2 and all(x.isdigit() for x in counts.split()):
                    result["behind"], result["ahead"] = map(int, counts.split())
    # No inference from branch age or "closed": unique untracked changes remain preserved.
    if result["dirty"] is True:
        result["disposition"] = "PRESERVE_UNCOMMITTED_WORK"
    elif result["prs"] and any(p.get("state") == "OPEN" for p in result["prs"]):
        result["disposition"] = "ACTIVE_PR_REVIEW_REQUIRED"
    elif result["prs"] and any(p.get("state") == "MERGED" for p in result["prs"]):
        result["disposition"] = ("INTEGRATED_BY_ANCESTRY"
                                 if result["ancestor_of_target"] is True else "MERGED_PR_TARGET_RELATION_UNKNOWN")
    return result


def collect(repo, target, limit):
    root = command(["git", "rev-parse", "--show-toplevel"], cwd=repo)
    target_sha = command(["git", "rev-parse", "--verify", f"{target}^{{commit}}"], cwd=repo)
    worktrees_raw = command(["git", "worktree", "list", "--porcelain"], cwd=repo)
    if not root or not target_sha or worktrees_raw is None:
        raise RuntimeError("UNVERIFIED_REPOSITORY_OR_TARGET")
    slug = command(["gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], cwd=repo)
    raw = command(["gh", "pr", "list", "--repo", slug, "--state", "all", "--limit", "1000", "--json",
                   "number,state,isDraft,headRefName,baseRefName,url,updatedAt,mergedAt,statusCheckRollup,body"],
                  cwd=repo, timeout=30) if slug else None
    try:
        prs = pr_index(json.loads(raw)) if raw else {}
    except (ValueError, TypeError):
        prs = {}
    worktrees = []
    checkout_branches = set()
    for info in parse_worktrees(worktrees_raw):
        name = info.get("branch", "").removeprefix("refs/heads/")
        if name:
            checkout_branches.add(name)
        worktrees.append(measure(repo, info.get("HEAD"), target_sha, name,
                                 info["worktree"], prs.get(name, [])))
    remote_raw = command(["git", "for-each-ref", "--format=%(refname:short)|%(objectname)",
                          "refs/remotes/origin"], cwd=repo) or ""
    remote = []
    total_remote = 0
    for line in remote_raw.splitlines():
        name, sep, sha = line.partition("|")
        if not sep or name == "origin/HEAD":
            continue
        total_remote += 1
        if len(remote) >= limit:
            continue
        short = name.removeprefix("origin/")
        if short in checkout_branches:
            continue
        remote.append(measure(repo, sha, target_sha, short, None, prs.get(short, [])))
    return {"repo": slug or "UNKNOWN", "repo_path": root, "target": target,
            "target_sha": target_sha, "observed_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "remote_tracking_is_cached": True, "github_pr_inventory": "OBSERVED" if raw else "UNKNOWN",
            "worktree_count": len(worktrees), "remote_refs_seen": total_remote,
            "remote_output_limit": limit, "worktrees": worktrees, "remote_only": remote,
            "disclaimer": "Read-only discovery; UNKNOWN is not abandoned. No source, CI, runtime or funded acceptance granted."}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--repo", type=Path, default=Path("."))
    p.add_argument("--target", default="origin/main")
    p.add_argument("--remote-limit", type=int, default=300)
    a = p.parse_args()
    if a.remote_limit < 0 or a.remote_limit > 2000:
        p.error("--remote-limit must be between 0 and 2000")
    try:
        print(json.dumps(collect(a.repo.resolve(), a.target, a.remote_limit), indent=2, sort_keys=True))
    except RuntimeError as err:
        print("HOLD_SOURCE_INVENTORY: " + str(err), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
