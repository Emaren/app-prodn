#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def discover_tests(root: Path = ROOT) -> list[str]:
    return sorted(
        path.relative_to(root).as_posix()
        for path in (root / "tests").glob("test_*.py")
        if path.is_file()
    )



def contract_environment(environ=None):
    """Test children must never inherit the caller's Git repository authority."""
    parent = os.environ if environ is None else environ
    return {
        key: value for key, value in parent.items()
        if not key.upper().startswith("GIT_")
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the complete tracked AoE2WAR Python contract suite."
    )
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()

    tests = discover_tests()
    if not tests:
        print("PYTHON TEST CONTRACT ERROR: no tests/test_*.py files discovered", file=sys.stderr)
        return 2

    if args.list:
        print(f"Python tests: {len(tests)} contract files")
        for path in tests:
            print(f"  {path}")
        return 0

    print(f"Running {len(tests)} Python contract files.", flush=True)
    process = subprocess.run(
        [
            sys.executable,
            "-m",
            "unittest",
            "discover",
            "-s",
            "tests",
            "-p",
            "test_*.py",
        ],
        cwd=ROOT,
        env=contract_environment(),
        check=False,
    )
    return process.returncode


if __name__ == "__main__":
    raise SystemExit(main())
