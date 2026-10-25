#!/usr/bin/env python3
"""Read-only verifier for exact Renaissance website source scope (NOT an owner authority).

This tool never signs, stages, restarts, publishes, deploys, cleans or mutates
production. It validates Git object identity against one reviewed-inventory
candidate. It cannot substitute for a protected v4 release controller.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "config/renaissance-website-v4-frozen-scope.json"
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
SAFE_PATH = re.compile(r"(?:[A-Za-z0-9_.\[\]-]+/)*[A-Za-z0-9_.\[\]-]+\Z")
KEYS = {"schema", "kind", "approval", "baseline_production_sha",
        "candidate_source_sha", "baseline_tree_sha1", "candidate_tree_sha1",
        "counts", "source_diff_method", "release_authorized",
        "financial_release_authorized", "owner_signed", "scope_notes", "files"}
FILE_KEYS = {"path", "status", "blob_sha1", "mode"}
COUNTS = {"paths": 128, "added": 63, "modified": 65, "deleted": 0}
FROZEN_BASE = "6be434c00469afa4acb0623715c3bcf724f927f4"
FROZEN_TARGET = "6d2a78224e5a5c647345d6b5ffc91bf94dc84b59"
FROZEN_BASE_TREE = "d0568f80e290242898c8ddfb37ccb07b457e57ac"
FROZEN_TARGET_TREE = "2b8232c950ec58a8f0d16ea0c625528948b6b206"


class Hold(ValueError):
    """Evidence missing or incompatible; never proceed to deployment."""


def require(ok: bool, reason: str) -> None:
    if not ok:
        raise Hold(reason)


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate JSON key")
        result[key] = value
    return result


def read_inventory(path: Path) -> dict:
    require(path.is_file() and not path.is_symlink(), "inventory missing or symlinked")
    require(path.stat().st_size <= 200_000, "oversized source inventory")
    with path.open(encoding="utf-8") as stream:
        data = json.load(stream, object_pairs_hook=no_duplicates)
    require(type(data) is dict and set(data) == KEYS, "incomplete/unexpected inventory")
    require(data["schema"] == 1 and type(data["schema"]) is int and
            data["kind"] == "aoe2war.renaissance.website-source-inventory.v4" and
            data["approval"] == "REVIEW_ONLY_NOT_RELEASE_AUTHORIZATION",
            "wrong scope inventory policy")
    require(data["release_authorized"] is False and
            data["financial_release_authorized"] is False and
            data["owner_signed"] is False, "source inventory claimed release authority")
    for key in ("baseline_production_sha", "candidate_source_sha",
                "baseline_tree_sha1", "candidate_tree_sha1"):
        require(type(data[key]) is str and HEX40.fullmatch(data[key]) is not None,
                "invalid Git identity: " + key)
    require(data["baseline_production_sha"] == FROZEN_BASE and
            data["candidate_source_sha"] == FROZEN_TARGET and
            data["baseline_tree_sha1"] == FROZEN_BASE_TREE and
            data["candidate_tree_sha1"] == FROZEN_TARGET_TREE,
            "unreviewed source/tree policy retagging")
    require(data["counts"] == COUNTS and
            type(data["counts"]) is dict, "unexpected inventory count")
    require(type(data["source_diff_method"]) is str and
            "git diff" in data["source_diff_method"], "unknown inventory method")
    require(type(data["scope_notes"]) is list and data["scope_notes"] and
            all(type(note) is str and 0 < len(note) < 500 for note in data["scope_notes"]),
            "source limitations missing")
    rows = data["files"]
    require(type(rows) is list and len(rows) == COUNTS["paths"],
            "expected exactly 128 candidate paths")
    names = []
    count_added = 0
    count_modified = 0
    for item in rows:
        require(type(item) is dict and set(item) == FILE_KEYS, "bad source row")
        name = item["path"]
        require(type(name) is str and 0 < len(name) <= 320 and
                SAFE_PATH.fullmatch(name) is not None and
                all(segment not in (".", "..") for segment in name.split("/")),
                "unsafe/unreviewed path")
        require(item["status"] in ("A", "M") and type(item["status"]) is str,
                "unexpected deletion/rename in review scope")
        require(type(item["blob_sha1"]) is str and
                HEX40.fullmatch(item["blob_sha1"]) is not None and
                item["mode"] == "100644", "unreviewed executable/symlink/blob")
        names.append(name)
        count_added += item["status"] == "A"
        count_modified += item["status"] == "M"
    require(names == sorted(names) and len(set(names)) == len(names),
            "duplicate/out-of-order source inventory")
    require(count_added == 63 and count_modified == 65, "unexpected source counts")
    require(not any(name.startswith(("prisma/", "wallet/", "wolochain/")) or
                    name in ("package.json", "server.js", "next.config.js")
                    for name in names), "protected startup/financial/schema path entered inventory")
    return data


def git(repo: Path, *args: str) -> bytes:
    command = ["git", "-C", str(repo), *args]
    try:
        process = subprocess.run(command, capture_output=True, timeout=35, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Hold("Git source inspection unavailable: " + type(exc).__name__) from exc
    require(process.returncode == 0,
            "Git inspection failed: " + " ".join(args[:2]))
    return process.stdout


def text_git(repo: Path, *args: str) -> str:
    return git(repo, *args).decode("ascii", "strict").strip()


def git_tree(repo: Path, commit: str) -> dict[str, tuple[str, str]]:
    tree: dict[str, tuple[str, str]] = {}
    for raw in git(repo, "ls-tree", "-r", "-z", commit).split(b"\x00"):
        if not raw:
            continue
        require(b"\t" in raw, "invalid Git tree entry")
        meta, path = raw.split(b"\t", 1)
        bits = meta.split(b" ")
        require(len(bits) == 3 and bits[1] == b"blob", "submodule/tree in source inventory")
        name = path.decode("utf-8", "strict")
        require(name not in tree, "duplicate tree path")
        tree[name] = (bits[0].decode("ascii"), bits[2].decode("ascii"))
    return tree


def diff_rows(repo: Path, baseline: str, candidate: str) -> dict[str, str]:
    raw = git(repo, "diff", "--no-renames", "--name-status", "-z", baseline, candidate)
    fields = raw.split(b"\x00")
    if fields[-1] == b"":
        fields.pop()
    require(len(fields) % 2 == 0, "malformed NUL-separated diff")
    output: dict[str, str] = {}
    for index in range(0, len(fields), 2):
        status = fields[index].decode("ascii", "strict")
        path = fields[index + 1].decode("utf-8", "strict")
        require(status in ("A", "M") and path not in output,
                "unreviewed file deletion/rename or duplicate")
        output[path] = status
    return output


def verify_scope(repo: Path, inventory: dict, *, require_clean=True) -> dict:
    """Check exact HEAD, complete diff, Git trees, modes and all blob bytes."""
    require(repo.is_absolute() and repo.is_dir() and not repo.is_symlink(),
            "candidate directory missing/linked")
    base = inventory["baseline_production_sha"]
    target = inventory["candidate_source_sha"]
    require(text_git(repo, "rev-parse", "HEAD") == target,
            "wrong candidate HEAD: refusing scope rebind")
    require(text_git(repo, "merge-base", base, target) == base,
            "baseline is not the expected release ancestor")
    if require_clean:
        require(not git(repo, "status", "--porcelain", "--untracked-files=all",
                        "--ignore-submodules=none"),
                "candidate checkout is dirty")
        # Hidden index flags can conceal worktree changes from porcelain.
        flags = git(repo, "ls-files", "-v", "-z")
        require(flags.endswith(b"\\x00"), "truncated Git index flag inventory")
        for entry in flags[:-1].split(b"\\x00"):
            require(len(entry) >= 3 and entry[:2] == b"H ",
                    "candidate contains assume-unchanged/skip-worktree Git index flags")
    require(text_git(repo, "show", "-s", "--format=%T", base) ==
            inventory["baseline_tree_sha1"], "wrong baseline tree")
    require(text_git(repo, "show", "-s", "--format=%T", target) ==
            inventory["candidate_tree_sha1"], "wrong candidate tree")
    source = diff_rows(repo, base, target)
    expected = {item["path"]: item["status"] for item in inventory["files"]}
    require(source == expected, "changed-path/source-status drift")
    before = git_tree(repo, base)
    after = git_tree(repo, target)
    for item in inventory["files"]:
        path, status, oid, mode = (item["path"], item["status"],
                                  item["blob_sha1"], item["mode"])
        require(after.get(path) == (mode, oid),
                "source blob/file-mode drift: " + path)
        require((path not in before) if status == "A" else
                (path in before and before[path] != after[path]),
                "added/modified baseline mismatch: " + path)
    return {"schema": 1, "kind": "aoe2war.renaissance.v4.scope-verification",
            "status": "SOURCE_INVENTORY_MATCH_REVIEW_ONLY",
            "candidate_sha": target, "candidate_tree_sha1": inventory["candidate_tree_sha1"],
            "base_sha": base, "paths": len(source),
            "owner_signature_verified": False, "release_authorized": False,
            "financial_release_authorized": False,
            "allowed_next_action": "SOURCE_REVIEW_ONLY_NEEDS_OWNER_V4"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate-repo", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = verify_scope(args.candidate_repo, read_inventory(INVENTORY))
        print(json.dumps(result, sort_keys=True, indent=2))
        return 0
    except (Hold, ValueError, UnicodeError, OSError) as exc:
        print(json.dumps({"kind": "aoe2war.renaissance.v4.scope-verification",
                          "status": "HOLD", "reason": str(exc),
                          "owner_signature_verified": False,
                          "release_authorized": False,
                          "financial_release_authorized": False}, sort_keys=True, indent=2))
        return 2


if __name__ == "__main__":
    sys.exit(main())
