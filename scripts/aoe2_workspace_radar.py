#!/usr/bin/env python3
"""Bounded read-only Git worktree radar. NEVER cleans, stashes, prunes or fetches.

Inspect explicitly supplied roots (defaults: ~/projects and ~/.codex/worktrees).
No changed filenames or secret file contents are included in the JSON receipt.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path

SKIP_DIRS = frozenset({'.git', 'node_modules', '.next', '.venv', 'venv', 'dist', 'build', '__pycache__', '.cache'})
MAX_OUTPUT = 2_000_000


def git(path: Path, *args: str) -> str | None:
    try:
        p = subprocess.run(['git', '-C', str(path), *args], capture_output=True, timeout=8,
                           check=False, env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0', 'GIT_NO_REPLACE_OBJECTS': '1'})
        if p.returncode or len(p.stdout) > MAX_OUTPUT:
            return None
        return p.stdout.decode('utf-8')
    except (OSError, subprocess.TimeoutExpired, UnicodeDecodeError):
        return None


def discover(roots: list[Path], depth: int, budget: int) -> tuple[list[Path], bool]:
    seen: set[Path] = set()
    found: set[Path] = set()
    examined = 0
    incomplete = False
    for root in roots:
        if root.is_symlink() or not root.is_dir():
            incomplete = True
            continue
        stack = [(root.resolve(), 0)]
        while stack:
            path, level = stack.pop()
            if path in seen:
                continue
            seen.add(path)
            examined += 1
            if examined > budget:
                incomplete = True
                break
            dotgit = path / '.git'
            if dotgit.exists() or dotgit.is_symlink():
                if not dotgit.is_symlink() and (dotgit.is_file() or dotgit.is_dir()):
                    found.add(path)
                else:
                    incomplete = True
                continue
            if level >= depth:
                # Cannot attest absent deeper repositories; refuse completeness.
                incomplete = True
                continue
            try:
                with os.scandir(path) as it:
                    children = sorted((Path(e.path) for e in it if e.is_dir(follow_symlinks=False)
                                       and e.name not in SKIP_DIRS), reverse=True)
            except OSError:
                incomplete = True
                continue
            stack.extend((child, level+1) for child in children)
    return sorted(found), incomplete


def worktrees(path: Path) -> list[str] | None:
    raw = git(path, 'worktree', 'list', '--porcelain')
    if raw is None:
        return None
    return sorted(line[9:] for line in raw.splitlines() if line.startswith('worktree '))


def inspect_repository(path: Path) -> dict:
    head = git(path, 'rev-parse', 'HEAD')
    branch = git(path, 'symbolic-ref', '--quiet', '--short', 'HEAD')
    status = git(path, 'status', '--porcelain=v1', '-z', '--untracked-files=all')
    stashes = git(path, 'stash', 'list', '--format=%gd')
    linked = worktrees(path)
    if head is None or status is None or stashes is None or linked is None:
        return {'path': str(path), 'status': 'UNKNOWN', 'head': head.strip() if head else None,
                'branch': branch.strip() if branch else None,
                'detached': branch is None, 'changed_entries': None,
                'untracked_entries': None, 'stash_entries_shared': None,
                'linked_worktrees': linked}
    # The -z format emits a second pathname for rename/copy. Only count status
    # records; never echo any path/name, as untracked filenames may be private.
    records = status.split('\x00')
    entries = 0
    untracked = 0
    idx = 0
    while idx < len(records):
        item = records[idx]
        idx += 1
        if not item:
            continue
        entries += 1
        if item.startswith('??'):
            untracked += 1
        if len(item) >= 2 and ('R' in item[:2] or 'C' in item[:2]):
            idx += 1
    return {
        'path': str(path), 'status': 'DIRTY' if entries else 'CLEAN',
        'head': head.strip(), 'branch': branch.strip() if branch else None,
        'detached': branch is None, 'changed_entries': entries,
        'untracked_entries': untracked,
        'stash_entries_shared': len([x for x in stashes.splitlines() if x]),
        'linked_worktrees': linked,
    }


def inspect(roots: list[Path], depth: int = 7, budget: int = 12000) -> dict:
    roots = [Path(x).expanduser() for x in roots]
    repos, truncated = discover(roots, depth, budget)
    observations = [inspect_repository(repo) for repo in repos]
    unknown = sum(x['status'] == 'UNKNOWN' for x in observations)
    dirty = sum(x['status'] == 'DIRTY' for x in observations)
    detached = sum(bool(x['detached']) for x in observations)
    known_paths = {str(x) for x in repos}
    external_links = sorted({link for x in observations for link in (x['linked_worktrees'] or [])
                             if link not in known_paths})
    return {
        'schema': 'aoe2war.git_workspace_radar.v1', 'classification': 'READ_ONLY_OBSERVATION',
        'status': 'INCOMPLETE' if truncated or unknown else 'DIRTY_PRESENT' if dirty else 'OBSERVED_CLEAN',
        'root_paths': [str(x) for x in roots], 'repos_inspected': len(repos),
        'dirty_repos': dirty, 'unknown_repos': unknown, 'detached_heads': detached,
        'uninspected_linked_worktrees': external_links, 'scan_truncated': truncated,
        'safe_to_clean_or_prune': False, 'safe_to_deploy': False,
        'notes': ['Stash count is shared by worktrees, not unique per checkout',
                  'Untracked content/filenames omitted; UNKNOWN requires manual inspection',
                  'Read-only sampling is not a race-free snapshot; preserve changes before cleanup',
                  'No GitHub branch, production, signer or WoloChain financial authority implied'],
        'repos': observations,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, action='append',
                        help='directory to scan, repeatable; else ~/projects and ~/.codex/worktrees')
    parser.add_argument('--max-depth', type=int, default=7)
    parser.add_argument('--max-directories', type=int, default=12000)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--check-clean', action='store_true', help='exit 2 if incomplete OR anything dirty')
    args = parser.parse_args()
    if not (1 <= args.max_depth <= 15 and 1 <= args.max_directories <= 100000):
        parser.error('bounded depth and directory count required')
    roots = args.root or [Path('~/projects'), Path('~/.codex/worktrees')]
    report = inspect(roots, args.max_depth, args.max_directories)
    content = json.dumps(report, sort_keys=True, indent=2) + '\n'
    if args.output:
        args.output.write_text(content)
    print(content, end='')
    return 2 if args.check_clean and report['status'] != 'OBSERVED_CLEAN' else 0


if __name__ == '__main__':
    raise SystemExit(main())
