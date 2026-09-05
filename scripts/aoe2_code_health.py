#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".aoe2war-release"
RECEIPT_DIR = STATE / "code-health-receipts"

SOURCE_ROOTS = ("app", "components", "lib", "scripts", "tests")
SOURCE_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts",
    ".py", ".sh", ".bash",
}
EXCLUDED_PARTS = {
    ".git", ".next", "node_modules", ".yarn", "coverage",
    ".aoe2war-release",
}

LARGE_LINE_THRESHOLD = 1500
GIANT_LINE_THRESHOLD = 2500
DUPLICATE_MIN_BYTES = 512
STALE_BRANCH_DAYS = 45


class CodeHealthError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def run_git(*args: str) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        raise CodeHealthError(
            f"git {' '.join(args)} failed: {proc.stderr.strip() or proc.stdout.strip()}"
        )
    return proc.stdout.strip()


def source_files() -> list[Path]:
    rows: list[Path] = []
    for root_name in SOURCE_ROOTS:
        base = ROOT / root_name
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in SOURCE_SUFFIXES:
                continue
            rel_parts = path.relative_to(ROOT).parts
            if any(part in EXCLUDED_PARTS for part in rel_parts):
                continue
            rows.append(path)
    return sorted(rows)


def analyze_file(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    text = raw.decode("utf-8", errors="replace")
    lines = text.splitlines()
    rel = path.relative_to(ROOT).as_posix()
    return {
        "path": rel,
        "bytes": len(raw),
        "lines": len(lines),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "todos": sum(text.count(token) for token in ("TODO", "FIXME", "HACK", "XXX")),
    }


def duplicate_groups(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if int(row["bytes"]) >= DUPLICATE_MIN_BYTES:
            grouped[str(row["sha256"])].append(row)

    result: list[dict[str, Any]] = []
    for digest, members in grouped.items():
        if len(members) < 2:
            continue
        size = int(members[0]["bytes"])
        result.append(
            {
                "sha256": digest,
                "copies": len(members),
                "bytes_each": size,
                "avoidable_bytes": size * (len(members) - 1),
                "paths": [str(row["path"]) for row in members],
            }
        )
    result.sort(key=lambda row: int(row["avoidable_bytes"]), reverse=True)
    return result


def branch_inventory() -> dict[str, Any]:
    main_ref = "HEAD"
    main = run_git("rev-parse", "HEAD")
    for candidate in ("origin/main", "main"):
        try:
            main = run_git("rev-parse", candidate)
            main_ref = candidate
            break
        except CodeHealthError:
            continue

    refs_raw = run_git(
        "for-each-ref",
        "--format=%(refname:short)|%(committerdate:unix)",
        "refs/remotes/origin",
    )
    now = datetime.now(timezone.utc).timestamp()
    rows: list[dict[str, Any]] = []

    for line in refs_raw.splitlines():
        ref, sep, epoch_raw = line.partition("|")
        if not sep or ref in {"origin/HEAD", "origin/main"}:
            continue
        try:
            epoch = int(epoch_raw)
        except ValueError:
            epoch = 0
        counts = run_git("rev-list", "--left-right", "--count", f"{main_ref}...{ref}")
        left_raw, right_raw = counts.split()
        behind = int(left_raw)
        ahead = int(right_raw)
        age_days = round(max(0.0, (now - epoch) / 86400.0), 1) if epoch else None
        rows.append(
            {
                "branch": ref.removeprefix("origin/"),
                "ahead_of_main": ahead,
                "behind_main": behind,
                "contained_in_main": ahead == 0,
                "age_days": age_days,
                "stale": bool(age_days is not None and age_days >= STALE_BRANCH_DAYS),
            }
        )

    rows.sort(
        key=lambda row: (
            0 if int(row["ahead_of_main"]) > 0 else 1,
            -int(row["ahead_of_main"]),
            str(row["branch"]),
        )
    )
    return {
        "main_sha": main,
        "remote_branch_count": len(rows),
        "contained_count": sum(1 for row in rows if row["contained_in_main"]),
        "unique_count": sum(1 for row in rows if not row["contained_in_main"]),
        "stale_count": sum(1 for row in rows if row["stale"]),
        "branches": rows,
    }


def snapshot() -> dict[str, Any]:
    files = [analyze_file(path) for path in source_files()]
    duplicates = duplicate_groups(files)
    by_lines = sorted(files, key=lambda row: int(row["lines"]), reverse=True)
    by_bytes = sorted(files, key=lambda row: int(row["bytes"]), reverse=True)
    dirty = run_git("status", "--porcelain", "--untracked-files=all").splitlines()

    large = [row for row in files if int(row["lines"]) >= LARGE_LINE_THRESHOLD]
    giant = [row for row in files if int(row["lines"]) >= GIANT_LINE_THRESHOLD]

    return {
        "schema": 1,
        "kind": "aoe2war-code-health-census",
        "generated_at": utc_now(),
        "git": {
            "head": run_git("rev-parse", "HEAD"),
            "branch": run_git("branch", "--show-current") or "detached",
            "dirty_paths": dirty,
            "clean": not dirty,
        },
        "source": {
            "roots": list(SOURCE_ROOTS),
            "file_count": len(files),
            "total_bytes": sum(int(row["bytes"]) for row in files),
            "total_lines": sum(int(row["lines"]) for row in files),
            "todo_markers": sum(int(row["todos"]) for row in files),
            "large_file_count": len(large),
            "giant_file_count": len(giant),
            "largest_by_lines": by_lines[:30],
            "largest_by_bytes": by_bytes[:30],
        },
        "duplicates": {
            "group_count": len(duplicates),
            "avoidable_bytes": sum(int(row["avoidable_bytes"]) for row in duplicates),
            "groups": duplicates[:30],
        },
        "branches": branch_inventory(),
        "policy": {
            "large_line_threshold": LARGE_LINE_THRESHOLD,
            "giant_line_threshold": GIANT_LINE_THRESHOLD,
            "duplicate_min_bytes": DUPLICATE_MIN_BYTES,
            "stale_branch_days": STALE_BRANCH_DAYS,
            "refactor_rule": (
                "Refactor structural hotspots only behind behavior-preserving tests; "
                "file size is prioritization evidence, never deletion authority."
            ),
        },
    }


def human_bytes(value: int) -> str:
    amount = float(max(0, value))
    for unit in ("B", "KiB", "MiB", "GiB"):
        if amount < 1024.0 or unit == "GiB":
            return f"{amount:.1f} {unit}" if unit != "B" else f"{int(amount)} B"
        amount /= 1024.0
    return f"{value} B"


def write_receipt(payload: dict[str, Any]) -> Path:
    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = RECEIPT_DIR / f"{stamp}.json"
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def print_status(payload: dict[str, Any], receipt: Path | None) -> None:
    source = payload["source"]
    branches = payload["branches"]
    duplicates = payload["duplicates"]
    git = payload["git"]

    print("⚔️  AOE2WAR CODE HEALTH OS")
    print()
    print(f"Git branch:         {git['branch']}")
    print(f"Git HEAD:           {git['head'][:12]}")
    print(f"Worktree:           {'CLEAN' if git['clean'] else 'DIRTY'}")
    print()
    print(f"Source files:       {source['file_count']}")
    print(f"Source lines:       {source['total_lines']:,}")
    print(f"Source bytes:       {human_bytes(int(source['total_bytes']))}")
    print(f"Large files:        {source['large_file_count']} (>= {LARGE_LINE_THRESHOLD:,} lines)")
    print(f"Giant files:        {source['giant_file_count']} (>= {GIANT_LINE_THRESHOLD:,} lines)")
    print(f"TODO/FIXME markers: {source['todo_markers']}")
    print(f"Exact duplicates:   {duplicates['group_count']} groups · {human_bytes(int(duplicates['avoidable_bytes']))} avoidable")
    print()
    print(f"Remote branches:    {branches['remote_branch_count']}")
    print(f"Contained in main:  {branches['contained_count']}")
    print(f"Unique branches:    {branches['unique_count']}")
    print(f"Stale branches:     {branches['stale_count']} (>= {STALE_BRANCH_DAYS} days)")
    print()
    print("Top refactor candidates:")
    for row in source["largest_by_lines"][:12]:
        print(f"  {int(row['lines']):>6,} lines  {human_bytes(int(row['bytes'])):>10}  {row['path']}")

    unique = [row for row in branches["branches"] if not row["contained_in_main"]]
    if unique:
        print()
        print("Branches with commits not in main:")
        for row in unique[:20]:
            age = f"{row['age_days']}d" if row["age_days"] is not None else "?"
            print(
                f"  +{row['ahead_of_main']:<3} -{row['behind_main']:<4} age={age:<7} {row['branch']}"
            )

    if receipt:
        print()
        print(f"Receipt: {receipt}")


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="aoe2war code-health",
        description=(
            "Read-only structural census for refactor hotspots, exact duplicate source, "
            "working-tree cleanliness and branch authority."
        ),
    )
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--no-receipt", action="store_true")
    parser.add_argument(
        "--require-clean-worktree",
        action="store_true",
        help="return nonzero when tracked or untracked working-tree changes exist",
    )
    args = parser.parse_args()

    try:
        payload = snapshot()
        receipt = None if args.no_receipt else write_receipt(payload)
        if args.json:
            print(
                json.dumps(
                    {"receipt": str(receipt) if receipt else None, "payload": payload},
                    indent=2,
                    sort_keys=True,
                )
            )
        else:
            print_status(payload, receipt)

        if args.require_clean_worktree and not payload["git"]["clean"]:
            return 1
        return 0
    except (OSError, ValueError, CodeHealthError) as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
