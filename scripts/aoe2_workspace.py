#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT.parent
RECEIPT_DIR = ROOT / ".aoe2war-release" / "workspace-receipts"


def run(args: list[str], cwd: Path = ROOT) -> tuple[int, str]:
    proc = subprocess.run(
        args,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return proc.returncode, proc.stdout.strip()


def git(*args: str, cwd: Path = ROOT) -> str:
    rc, out = run(["git", *args], cwd=cwd)
    if rc != 0:
        raise RuntimeError(f"git {' '.join(args)} failed in {cwd}: {out}")
    return out


def classify(*, main: bool, dirty: bool, merged: bool, detached: bool) -> str:
    if main:
        return "MAIN"
    if dirty:
        return "PRESERVE_DIRTY_REVIEW"
    if not merged:
        return "ACTIVE_UNMERGED"
    if detached:
        return "CLEANUP_CANDIDATE_DETACHED"
    return "CLEANUP_CANDIDATE"


def snapshot() -> dict[str, Any]:
    main_head = git("rev-parse", "main")
    raw = git("worktree", "list", "--porcelain")
    blocks = [item for item in raw.split("\\n\\n") if item.strip()]
    items: list[dict[str, Any]] = []
    registered: set[str] = set()

    for block in blocks:
        fields: dict[str, Any] = {}
        for line in block.splitlines():
            if " " in line:
                key, value = line.split(" ", 1)
                fields[key] = value
            else:
                fields[line] = True
        path = Path(str(fields["worktree"]))
        registered.add(str(path.resolve()))
        head = str(fields.get("HEAD") or "")
        branch_raw = fields.get("branch")
        detached = branch_raw is None
        branch = str(branch_raw).replace("refs/heads/", "") if branch_raw else "DETACHED"
        rc, dirty_out = run(
            ["git", "status", "--porcelain", "--untracked-files=all"],
            cwd=path,
        )
        dirty = rc != 0 or bool(dirty_out.strip())
        merged = False
        if head:
            merged = (
                subprocess.run(
                    ["git", "merge-base", "--is-ancestor", head, main_head],
                    cwd=ROOT,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                ).returncode == 0
            )
        is_main = path.resolve() == ROOT.resolve()
        items.append(
            {
                "path": str(path),
                "head": head,
                "branch": branch,
                "detached": detached,
                "dirty": dirty,
                "merged_into_main": merged,
                "classification": classify(
                    main=is_main,
                    dirty=dirty,
                    merged=merged,
                    detached=detached,
                ),
            }
        )

    orphans = [
        str(path)
        for path in sorted(PARENT.glob("app-prodn-*"))
        if str(path.resolve()) not in registered
    ]
    cleanup = [
        item
        for item in items
        if item["classification"].startswith("CLEANUP_CANDIDATE")
    ]
    return {
        "schema": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "main_head": main_head,
        "worktrees": items,
        "cleanup_candidates": cleanup,
        "dirty_count": sum(
            bool(item["dirty"])
            for item in items
            if item["classification"] != "MAIN"
        ),
        "unmerged_count": sum(
            item["classification"] == "ACTIVE_UNMERGED"
            for item in items
        ),
        "orphans": orphans,
    }


def print_status(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR WORKSPACE OS")
    print()
    print(f"Registered:         {len(payload['worktrees'])}")
    print(f"Cleanup candidates: {len(payload['cleanup_candidates'])}")
    print(f"Dirty preserved:    {payload['dirty_count']}")
    print(f"Unmerged active:    {payload['unmerged_count']}")
    print(f"Unregistered dirs:  {len(payload['orphans'])}")
    print()
    for item in payload["worktrees"]:
        print(
            f"{item['classification']:<28} "
            f"{item['branch']:<48} {item['head'][:12]}  {item['path']}"
        )
    for path in payload["orphans"]:
        print(f"{'ORPHAN_REVIEW':<28} {'—':<48} {'—':<12}  {path}")


def clean(*, apply: bool) -> dict[str, Any]:
    before = snapshot()
    candidates = before["cleanup_candidates"]
    result = {
        "schema": 1,
        "kind": "aoe2war-workspace-clean",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "apply": apply,
        "candidates": candidates,
        "removed": [],
        "failed": [],
        "orphans_untouched": before["orphans"],
    }
    if apply:
        for item in candidates:
            path = Path(item["path"])
            rc, out = run(["git", "worktree", "remove", str(path)])
            if rc == 0:
                result["removed"].append(item)
            else:
                result["failed"].append({**item, "error": out})
        RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        receipt = RECEIPT_DIR / f"{stamp}.json"
        result["receipt_path"] = str(receipt)
        receipt.write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    return result


def main() -> int:
    parser = argparse.ArgumentParser(prog="aoe2war workspace")
    sub = parser.add_subparsers(dest="command")
    for name in ("status", "plan"):
        q = sub.add_parser(name)
        q.add_argument("--json", action="store_true")
    q = sub.add_parser("clean")
    q.add_argument("--apply", action="store_true")
    q.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if args.command in (None, "status", "plan"):
        payload = snapshot()
        if getattr(args, "json", False):
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_status(payload)
            if args.command == "plan":
                print()
                print("PLAN: only clean + merged registered worktrees are eligible.")
                print(
                    "Dirty, unmerged, main, and unregistered directories are never automatic."
                )
        return 0

    if args.command == "clean":
        payload = clean(apply=args.apply)
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print("⚔️  AOE2WAR WORKSPACE CLEAN")
            print()
            print(f"Mode:       {'APPLY' if args.apply else 'PREVIEW'}")
            print(f"Candidates: {len(payload['candidates'])}")
            print(f"Removed:    {len(payload['removed'])}")
            print(f"Failed:     {len(payload['failed'])}")
            print(f"Orphans:    {len(payload['orphans_untouched'])} untouched")
            if not args.apply:
                print(
                    "READ ONLY: pass --apply to remove only clean merged registered worktrees."
                )
            elif payload.get("receipt_path"):
                print(f"Receipt:    {payload['receipt_path']}")
        return 1 if payload["failed"] else 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
