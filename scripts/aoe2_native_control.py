#!/usr/bin/env python3
"""Local adapter for the API-owned, candidate-only native replay control."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
API_SCRIPT = Path("scripts/replay_engine_native_control.py")
RUN_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,47}\Z")


class NativeControlAdapterError(RuntimeError):
    pass


def git_path(repository: Path, *arguments: str) -> Path:
    try:
        value = subprocess.check_output(
            ["git", "rev-parse", *arguments],
            cwd=repository,
            text=True,
            stderr=subprocess.PIPE,
            timeout=10,
        ).strip()
    except (OSError, subprocess.SubprocessError) as exc:
        raise NativeControlAdapterError(
            f"Governed Git checkout unavailable: {repository}"
        ) from exc
    result = Path(value)
    if not result.is_absolute():
        result = repository / result
    return result.resolve()


def resolve_api_source(api_source: Path | None = None) -> Path:
    """An override selects a worktree of the canonical sibling, never a new repo."""
    app_common = git_path(ROOT, "--git-common-dir")
    canonical_api = app_common.parent.parent / "api-prodn"
    expected_common = git_path(canonical_api, "--git-common-dir")
    source = canonical_api if api_source is None else api_source.expanduser().absolute()
    if source.is_symlink():
        raise NativeControlAdapterError("Symlinked API source checkout rejected.")
    source = source.resolve()
    if git_path(source, "--show-toplevel") != source:
        raise NativeControlAdapterError("API source must be an exact Git checkout root.")
    if git_path(source, "--git-common-dir") != expected_common:
        raise NativeControlAdapterError("API source is not a worktree of the canonical sibling.")
    script = source / API_SCRIPT
    if not script.is_file() or script.is_symlink() or script.parent.is_symlink():
        raise NativeControlAdapterError("Governed native-control API primitive is unavailable.")
    return source


def command_for_control(args: argparse.Namespace) -> tuple[list[str], Path]:
    if RUN_ID.fullmatch(args.run_id) is None:
        raise NativeControlAdapterError("run-id must be 1–48 lowercase ASCII letters, digits or hyphens, beginning with a letter or digit.")
    source = resolve_api_source(args.api_source)
    command = [
        sys.executable,
        str(source / API_SCRIPT),
        args.mode,
        "--run-id",
        args.run_id,
        "--app-source",
        str(ROOT),
    ]
    if args.mode == "prepare":
        for option, value in (("--clang", args.clang), ("--lld-link", args.lld_link)):
            if value is not None:
                command.extend([option, str(value)])
    return command, source


def invoke_control(args: argparse.Namespace) -> int:
    """Shared operator-host entry point; the API owns locks, receipts and verdicts."""
    command, source = command_for_control(args)
    return subprocess.run(command, cwd=source, check=False).returncode


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="aoe2war truth native-control", description=__doc__)
    modes = result.add_subparsers(dest="mode", required=True)
    for name in ("prepare", "run", "verify", "calibrate"):
        mode = modes.add_parser(name)
        mode.add_argument("--run-id", required=True)
        mode.add_argument(
            "--api-source", type=Path,
            help="canonical sibling API checkout or its governed worktree",
        )
        if name == "prepare":
            mode.add_argument("--clang", type=Path)
            mode.add_argument("--lld-link", type=Path)
    return result


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        return invoke_control(args)
    except (NativeControlAdapterError, OSError, subprocess.SubprocessError) as exc:
        print(json.dumps({
            "schema": "aoe2war.native_control.adapter_rejection.v1",
            "status": "REJECT",
            "candidateOnly": True,
            "authority": {
                "result": False, "promotion": False, "production": False,
                "betting": False, "settlement": False, "wolo": False,
            },
            "error": str(exc),
        }, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
