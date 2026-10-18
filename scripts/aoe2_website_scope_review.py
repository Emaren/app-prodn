#!/usr/bin/env python3
"""Fail-closed, NONAUTHORIZING preflight for future website-only release work.

Reports candidate-impact diagnostics only. Never grants Finish, financial,
custody or source-runtime authority. Renames, unusual Git paths and local index
flags are security-relevant even where Git porcelain appears clean.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import selectors
import subprocess
import time
from pathlib import Path

import aoe2_release_gate

SHA = re.compile(r"^[0-9a-f]{40}$")
REPO = Path(__file__).resolve().parents[1]
MAX_GIT_OUTPUT_BYTES = 4 * 1024 * 1024
MAX_PATHS = 4096
MAX_PATH_BYTES = 4096
GIT_TIMEOUT_SECONDS = 30.0
FINANCIAL_PATH_TOKENS = (
    "bet", "bettor", "wolo", "satchel", "escrow", "payout", "settlement",
    "staking", "treasury", "wallet", "challenge", "trophy", "champion",
    "payment", "deposit", "withdraw", "token", "ledger", "prisma",
)
CROSS_CUTTING_EXACT = {
    "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "next.config.js", "next.config.ts", "tsconfig.json", "middleware.ts",
    "server.js", "prisma.config.ts", "app/layout.tsx", "app/globals.css",
    "app/appshell.tsx", "components/headermenu.tsx",
}
CROSS_CUTTING_PREFIXES = (
    "app/api/", "app/admin/", "lib/", "context/", "contexts/", "hooks/",
    "middleware/", "prisma/", "scripts/", "deploy/", ".github/",
    "config/", "app/api/internal/", "app/api/admin/",
)


def inspect_paths(paths: list[str]) -> dict:
    """Return diagnostics, never release admission or an authorization token."""
    if len(paths) > MAX_PATHS:
        raise ValueError("Too many changed paths for bounded inspection")
    unique = sorted(set(paths))
    risky: list[dict] = []
    for raw in unique:
        if not isinstance(raw, str):
            raise ValueError("Nontext path in Git output")
        if (
            not raw or "\x00" in raw or raw.startswith("/") or "\\" in raw
            or len(raw.encode("utf-8")) > MAX_PATH_BYTES
        ):
            risky.append({"path": raw[:200], "reason": "invalid path"})
            continue
        pieces = Path(raw).parts
        if any(part in {"..", "."} for part in pieces):
            risky.append({"path": raw[:200], "reason": "path traversal"})
            continue
        lower = raw.lower()
        original_risk = aoe2_release_gate.path_risk(raw)
        reasons: list[str] = []
        if original_risk in {"FINANCIAL", "DATABASE", "INFRASTRUCTURE", "WATCHER", "REPLAY_TRUTH"}:
            reasons.append("protected release risk: " + original_risk)
        if any(token in lower for token in FINANCIAL_PATH_TOKENS):
            reasons.append("possible financial or championship dependency")
        if lower in CROSS_CUTTING_EXACT or lower.startswith(CROSS_CUTTING_PREFIXES):
            reasons.append("shared code or deployment authority")
        if lower.endswith((".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".css", ".scss")):
            reasons.append("unreviewed executable or presentation dependency")
        if lower.startswith("public/") and lower.endswith((".png", ".jpg", ".jpeg", ".svg", ".webp")):
            reasons.append("asset use/context not independently reviewed")
        if reasons:
            risky.append({"path": raw, "reason": "; ".join(sorted(set(reasons)))})
    return {
        "schema": "aoe2war.website-scope-preflight.v1",
        "changed_files": unique,
        "risks": risky,
        "source_diff_reviewed": False,
        "transitive_dependencies_proven": False,
        "financial_scope_admitted": False,
        "website_release_authorized": False,
        "finance_release_authorized": False,
        "status": "FINANCIAL_OR_SHARED_SCOPE_UNPROVEN" if risky else "SCOPE_UNPROVEN",
        "explanation": (
            "Read-only preliminary diagnostics. No source/bundle/config/runtime "
            "admission, signed receipt, Wolo evidence or release permission."
        ),
    }


def _git(*args: str) -> bytes:
    """Bound output, duration and environment; preserve NUL-delimited path bytes.

    Never capture unbounded stdout with subprocess.run(...capture_output=True).
    stderr is suppressed to avoid leaking repository or operator paths.
    """
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env["GIT_CONFIG_NOSYSTEM"] = "1"
    env["GIT_CONFIG_GLOBAL"] = os.devnull
    proc = subprocess.Popen(
        ["git", *args], cwd=REPO, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env,
    )
    deadline = time.monotonic() + GIT_TIMEOUT_SECONDS
    received = bytearray()
    try:
        if proc.stdout is None:
            raise RuntimeError("Git stdout not available")
        with selectors.DefaultSelector() as selector:
            selector.register(proc.stdout, selectors.EVENT_READ)
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise RuntimeError("Git source inspection timed out")
                events = selector.select(remaining)
                if not events:
                    raise RuntimeError("Git source inspection timed out")
                block = os.read(proc.stdout.fileno(), min(65536, MAX_GIT_OUTPUT_BYTES + 1 - len(received)))
                if not block:
                    break
                received.extend(block)
                if len(received) > MAX_GIT_OUTPUT_BYTES:
                    raise RuntimeError("Git source inspection exceeded output limit")
        proc.wait(timeout=max(0.001, deadline - time.monotonic()))
        if proc.returncode:
            raise RuntimeError("Cannot establish exact Git source ancestry")
        return bytes(received)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Git source inspection timed out") from exc
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()


def _decode(raw: bytes) -> str:
    try:
        return raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise ValueError("Non-UTF8 Git path or revision output") from exc


def _paths_from_nul(raw: bytes) -> list[str]:
    if not raw:
        return []
    if not raw.endswith(b"\x00"):
        raise ValueError("Truncated Git NUL-delimited path output")
    entries = raw[:-1].split(b"\x00")
    if len(entries) > MAX_PATHS:
        raise ValueError("Too many changed paths for bounded inspection")
    return [_decode(entry) for entry in entries]


def _check_index_flags(raw: bytes) -> None:
    """Git -v tags lowercase assume-unchanged; S denotes skip-worktree."""
    if raw and not raw.endswith(b"\x00"):
        raise ValueError("Truncated Git index output")
    entries = raw[:-1].split(b"\x00") if raw else []
    for entry in entries:
        if len(entry) < 3 or entry[1:2] != b" ":
            raise ValueError("Unrecognized index entry; cannot verify worktree")
        tag = entry[0]
        if tag == ord("S") or 97 <= tag <= 122:
            raise ValueError("Assume-unchanged/skip-worktree index flags; source unproven")


def inspect_commits(base: str, candidate: str) -> dict:
    if not SHA.fullmatch(base) or not SHA.fullmatch(candidate):
        raise ValueError("Exact 40-character commit SHAs required")
    _git("cat-file", "-e", base + "^{commit}")
    _git("cat-file", "-e", candidate + "^{commit}")
    _git("merge-base", "--is-ancestor", base, candidate)
    if _decode(_git("rev-parse", "HEAD")).strip() != candidate:
        raise ValueError("Checked-out source is not the exact candidate")
    _check_index_flags(_git("ls-files", "-v", "-z"))
    if _git("status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=none"):
        raise ValueError("Worktree dirty; scope unproven")
    # NO rename similarity detection: source and destination must both enter
    # impact analysis, even for a byte-identical move into a benign directory.
    paths = _paths_from_nul(_git(
        "diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--name-only",
        "--diff-filter=ACDMRTUXB", "-z", base, candidate, "--",
    ))
    report = inspect_paths(paths)
    report.update({"base_commit": base, "candidate_commit": candidate})
    if base == candidate:
        report["status"] = "NO_CHANGE_NOT_DEPLOYMENT_AUTHORITY"
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True)
    parser.add_argument("--candidate", required=True)
    args = parser.parse_args()
    try:
        report = inspect_commits(args.base, args.candidate)
    except (ValueError, RuntimeError, OSError) as exc:
        report = {
            "status": "UNPROVEN",
            "error": str(exc)[:200],
            "website_release_authorized": False,
            "finance_release_authorized": False,
        }
    print(json.dumps(report, indent=2, sort_keys=True))
    # Diagnostic utility has NO successful authorization exit code.
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
