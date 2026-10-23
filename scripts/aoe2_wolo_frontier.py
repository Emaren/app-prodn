#!/usr/bin/env python3
"""Safely route the pinned, read-only Wolo release frontier to the actual VPS.

No Wolo checkout update, local worktree mutation, remote file write, systemd
mutation, signed transaction or financial release authority. The exact reviewed
cockpit source comes from an already merged, CI-qualified Git commit rather
than the mutable Mac worktree or older deployed Wolo checkout.
"""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import subprocess
import sys

# Wolo operational PR #91: reviewed cockpit source and adversarial tests.
REVIEWED_OPS_COMMIT = "98f781d61fa6b35d2cc09b48f84605a617efc2c4"
EXPECTED_COCKPIT_SHA256 = "4b480c66b13da3c9c8b33a65d78188610861f1306176e61a0b8c8556f4a76e64"
COCKPIT_PATH = "scripts/mainnet-release-cockpit.py"
REMOTE = "root@hel1"
MAX_SOURCE_BYTES = 128 * 1024
REMOTE_TIMEOUT_SECONDS = 120


def reviewed_cockpit(repo: Path, run=subprocess.run) -> bytes | None:
    """Read one immutable Git blob, never the dirty checkout's Python file."""
    if not repo.is_dir():
        return None
    try:
        result = run(
            ["git", "--no-replace-objects", "-C", str(repo), "--no-optional-locks", "show",
             f"{REVIEWED_OPS_COMMIT}:{COCKPIT_PATH}"],
            capture_output=True, timeout=15, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    source = result.stdout
    if (result.returncode != 0 or not isinstance(source, bytes)
            or len(source) > MAX_SOURCE_BYTES
            or not source.startswith(b"#!/usr/bin/env python3\n")
            or b"FINANCIAL_HARD_HOLD" not in source
            or b"def render_brief(" not in source
            or hashlib.sha256(source).hexdigest() != EXPECTED_COCKPIT_SHA256):
        return None
    return source


def run_frontier(argv: list[str] | None = None, *,
                 home: Path | None = None, run=subprocess.run) -> int:
    parser = argparse.ArgumentParser(
        description="Read-only VPS Wolo release frontier (never a financial permit)"
    )
    parser.add_argument("command", choices=["brief"])
    args = parser.parse_args(argv)
    if args.command != "brief":
        return 4

    repository = (home if home is not None else Path.home()) / "projects" / "WoloChain-wolo-1"
    code = reviewed_cockpit(repository, run=run)
    if code is None:
        print(
            "STOP: reviewed Wolo cockpit Git object is unavailable locally. "
            "No VPS action occurred. Ask Codex to fetch the operational branch "
            f"containing commit {REVIEWED_OPS_COMMIT}; preserve dirty worktrees.",
            file=sys.stderr,
        )
        return 4

    # SSH stdin is immutable reviewed Python code; no user-supplied shell text
    # or CLI options reach the remote host. Python -I isolates imports.
    ssh = [
        "ssh", "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
        "-o", "ServerAliveInterval=10", "-o", "ServerAliveCountMax=2",
        REMOTE, "python3", "-I", "-", "--brief",
    ]
    try:
        result = run(ssh, input=code, capture_output=True, timeout=REMOTE_TIMEOUT_SECONDS,
                     check=False)
    except (OSError, subprocess.TimeoutExpired):
        print("STOP: bounded read-only VPS inspection unavailable; no release action.", file=sys.stderr)
        return 4

    output = result.stdout.decode("utf-8", errors="replace") if isinstance(result.stdout, bytes) else ""
    error = result.stderr.decode("utf-8", errors="replace") if isinstance(result.stderr, bytes) else ""
    # The cockpit intentionally returns 3 on a successful *observation*. Do
    # not normalize that to release success or treat SSH exit 0 as approval.
    if result.returncode == 3 and (
        "FINANCIAL_HARD_HOLD" in output and "NO RELEASE AUTHORITY" in output
    ):
        print(output, end="")
        print("REPORT_ONLY: Wolo financial release remains held.", file=sys.stderr)
        return 3

    print("STOP: no authenticated cockpit HOLD report received; never infer release approval.",
          file=sys.stderr)
    if error:
        # SSH stderr can expose host internals: forward only an allowlisted
        # classification, never raw text, paths, keys or credentials.
        print("SSH_REMOTE_OR_COCKPIT_ERROR", file=sys.stderr)
    return 4


if __name__ == "__main__":
    sys.exit(run_frontier())
