#!/usr/bin/env python3
"""Read-only high-confidence secret scan of every commit's added text.
This supplements the current-tree scanner; not equivalent to GitGuardian.
Exit 2 when source ancestry or Git patch parsing cannot be established.
Never print the credential value or include it in generated artifacts.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from scan_tracked_secrets import CONTENT_PATTERNS, sensitive_path

ROOT = Path(__file__).resolve().parents[1]
SHA = re.compile(r"^[a-f0-9]{40}$")
MAX_COMMITS = 10000
MAX_PATCH_BYTES = 16000000


@dataclass(frozen=True)
class Finding:
    commit: str
    path: str
    kind: str


def git(*args: str) -> bytes:
    result = subprocess.run(
        ["git", "-c", "core.quotePath=false", *args],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode:
        raise RuntimeError("git operation failed (no credential content emitted)")
    return result.stdout


def parse_patch(commit: str, patch: str) -> list[Finding]:
    """Inspect only '+' hunk lines; scan newly introduced sensitive paths."""
    findings: list[Finding] = []
    current = ""
    in_hunk = False
    for line in patch.splitlines():
        if line.startswith("diff --git "):
            current = ""
            in_hunk = False
        elif line.startswith("+++ b/"):
            current = line[6:]
            in_hunk = False
            if sensitive_path(current):
                findings.append(Finding(commit[:12], current, "sensitive-file-path"))
        elif line.startswith("@@ "):
            in_hunk = True
        elif line.startswith(("GIT binary patch", "Binary files ")):
            in_hunk = False
        elif in_hunk and line.startswith("+") and not line.startswith("+++"):
            for kind, pattern in CONTENT_PATTERNS:
                if pattern.search(line[1:]):
                    findings.append(Finding(commit[:12], current, kind))
    return findings


def scan_history(base: str, head: str = "HEAD") -> tuple[list[Finding], int]:
    if not SHA.fullmatch(base):
        raise ValueError("base must be an exact 40-character Git SHA")
    git("cat-file", "-e", base + "^{commit}")
    git("merge-base", "--is-ancestor", base, head)
    commits = git("rev-list", "--reverse", base + ".." + head).decode("ascii").splitlines()
    if not commits or len(commits) > MAX_COMMITS:
        raise ValueError("empty or excessively large commit range")
    findings: list[Finding] = []
    for sha in commits:
        if not SHA.fullmatch(sha):
            raise ValueError("invalid commit identity")
        # Compare against every parent: merge resolutions can otherwise hide
        # added credentials when a no-merges log silently skips the merge.
        parents = git("rev-list", "--parents", "-n", "1", sha).decode("ascii").split()
        if not parents or parents[0] != sha or len(parents) < 2:
            raise ValueError("unexpected parentless commit within review range")
        for parent in parents[1:]:
            patch = git("diff", "--no-ext-diff", "--no-renames", "--unified=0", parent, sha, "--")
            if len(patch) > MAX_PATCH_BYTES:
                raise ValueError("commit patch exceeds bounded scan size")
            findings.extend(parse_patch(sha, patch.decode("utf-8", "replace")))
    return findings, len(commits)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=os.environ.get("PR_BASE_SHA", ""))
    args = parser.parse_args()
    try:
        findings, count = scan_history(args.base)
    except (ValueError, RuntimeError, UnicodeError) as exc:
        print("HISTORICAL SECRET SCAN: INDETERMINATE (" + str(exc) + ")", file=sys.stderr)
        return 2
    if findings:
        print("HISTORICAL SECRET SCAN: FAILED — no secret values printed")
        for finding in findings[:100]:
            print(f"  {finding.commit} {finding.path} [{finding.kind}]")
        if len(findings) > 100:
            print(f"  ... {len(findings) - 100} additional findings suppressed")
        return 1
    print(f"HISTORICAL SECRET SCAN: PASS high-confidence patterns, {count} commits; NOT full credential certification")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
