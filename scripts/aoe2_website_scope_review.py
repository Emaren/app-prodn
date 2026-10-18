#!/usr/bin/env python3
"""Fail-closed, NONAUTHORIZING preflight for future website-only release work.

Provides candidate-impact diagnostics, *never* a Finish override. In particular,
an app/ route or CSS filename cannot independently prove safe transitive runtime
behavior, including the financial semantics of shared components and imports.

Financial-source drift, live holds and signed WOLO operations remain protected.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path

import aoe2_release_gate

SHA = re.compile(r"^[0-9a-f]{40}$")
REPO = Path(__file__).resolve().parents[1]
# Even if the normal release gate calls a file presentation-only, these
# boundaries require an independent financial/dependency review.
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
    """Return diagnostics, not acceptance; no predicate can authorize Finish."""
    unique = sorted(set(paths))
    risky: list[dict] = []
    for raw in unique:
        if not raw or "\\0" in raw or raw.startswith("/") or "\\" in raw:
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
        # All executable web modules remain unproven without a closed-world
        # dependency/bundle analysis. Module CSS is not automatically safe.
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


def _git(*args: str) -> str:
    p = subprocess.run(
        ["git", *args], cwd=REPO, capture_output=True, text=True,
        check=False, timeout=30,
        env={k: v for k, v in os.environ.items() if not k.startswith("GIT_")},
    )
    if p.returncode:
        raise RuntimeError("Cannot establish exact Git source ancestry")
    return p.stdout.strip()


def inspect_commits(base: str, candidate: str) -> dict:
    if not SHA.fullmatch(base) or not SHA.fullmatch(candidate):
        raise ValueError("Exact 40-character commit SHAs required")
    _git("cat-file", "-e", base + "^{commit}")
    _git("cat-file", "-e", candidate + "^{commit}")
    _git("merge-base", "--is-ancestor", base, candidate)
    # Fail closed on staged/untracked material; no local state is modified.
    if _git("status", "--porcelain=v1", "--untracked-files=all"):
        raise ValueError("Worktree dirty; scope unproven")
    if _git("rev-parse", "HEAD") != candidate:
        raise ValueError("Checked-out source is not the exact candidate")
    path_data = _git("diff", "--name-only", "--diff-filter=ACDMRTUXB", base, candidate)
    report = inspect_paths(path_data.splitlines() if path_data else [])
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
    except (ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        report = {
            "status": "UNPROVEN",
            "error": str(exc)[:200],
            "website_release_authorized": False,
            "finance_release_authorized": False,
        }
    print(json.dumps(report, indent=2, sort_keys=True))
    # There is deliberately no successful authorized exit status.
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
