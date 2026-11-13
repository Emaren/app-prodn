#!/usr/bin/env python3
"""PRODUCT source/output authorization. Policy control, NOT an OS/DB/network sandbox.

No task payload is executed by this module. No directory or artifact is created.
The CLI checks the exact checked-out source and changed paths before CI continues.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys

ORIGINS = {
    "Emaren/app-prodn": {
        "https://github.com/Emaren/app-prodn",
        "https://github.com/Emaren/app-prodn.git",
        "git@github.com:Emaren/app-prodn.git",
    },
    "Emaren/kingdom-traders": {
        "https://github.com/Emaren/kingdom-traders",
        "https://github.com/Emaren/kingdom-traders.git",
        "git@github.com:Emaren/kingdom-traders.git",
    },
}
APPROVED_SOURCE = {
    "scripts/product_boundary_guard.py",
    "scripts/product_signed_promotion_gate.py",
    "tests/test_product_boundary_guard.py",
    ".github/workflows/product-boundary.yml",
}
# Single independently inspectable executable-source admission; this is NOT a
# wildcard scripts/ allowance. Future source bytes/base require new review.
EXACT_REVIEWED_SCRIPT = "scripts/kingdom_index_source_audit.mjs"
EXACT_REVIEWED_BASE = "3933f695ec48d4e2cab68e93194b745fab2e4b7d"
EXACT_REVIEWED_SHA256 = "185defe7f93ea39bf1829b7a8eaf4a48f050b50d40ad1438c9be9ca468326a01"
# Existing source history stays admitted ONLY at its former exact base/hash.
# Factory V1 adds one source-reviewed inventory entry, no script wildcard.
EXACT_REVIEWED_FACTORY_BASE = "9f7b56f536ba51b4678ac43baebfae140ada6479"
EXACT_REVIEWED_FACTORY_SHA256 = "bb613ddbd9203f5ad5f2f19be8521db2dc64e03e36e7e4872da0f2b01c1beab8"
# Next dynamic route segments are deliberately NOT admitted by the general
# path grammar. This is one reviewed, immutable route blob and one exact base.
EXACT_REVIEWED_DYNAMIC_ROUTE = "app/api/media-assets/[kind]/[target]/route.ts"
EXACT_REVIEWED_DYNAMIC_BASE = "753c3631a12483c70e1538ccc3b087839677ff9d"
EXACT_REVIEWED_DYNAMIC_SHA256 = "bb1433119e955fd4e7bf9c6d2ecdcb64b0566ed01eef203d9fc224e1b5ba7243"
OUTPUT_PREFIXES = ("artifacts/product-boundary/", "reports/product-boundary/")
DENIED_NAMES = {
    "financial", "finance", "custody", "wallet_signing", "wallet-signing",
    "secrets", "credentials", "private_keys", "signer", "reviewer",
    "payout", "payouts", "settlement", "native_finance", "native-finance",
    "live_orders", "real_orders", "recovery", "owner-private-recovery",
    "financial.sql", "dockerfile", "sudoers",
}
DENIED_SUFFIXES = {".sql", ".sh", ".bash", ".zsh", ".command", ".pem", ".key", ".p12"}
DENIED_DIRS = {"prisma", "systemd", "infra", "ops", ".ssh", ".aws", ".kube"}
DENIED_TEXT = ("execute-shell", "run-arbitrary-command", "8092", "8093", "8094", "8095")
ALLOWED_TASK_ARGV = (
    ("python3", "-I", "-B", "scripts/product_boundary_guard.py", "--check"),
    ("python3", "-I", "-B", "-m", "unittest", "discover", "-s", "tests",
     "-p", "test_product_boundary_guard.py", "-v"),
)
SHA = re.compile(r"^[a-f0-9]{40}$")
BRANCH = re.compile(r"^(?:session-c/[a-zA-Z0-9._/-]+|main)$")
REPO = re.compile(r"^Emaren/(?:app-prodn|kingdom-traders)$")
SAFE_COMPONENT = re.compile(r"^[A-Za-z0-9._+-]+$")


class BoundaryHold(ValueError):
    pass


def relative_path(raw: str) -> PurePosixPath:
    if not isinstance(raw, str) or not raw or "\x00" in raw:
        raise BoundaryHold("EMPTY_OR_NUL_PATH")
    if raw.startswith(("/", "~", "\\", "$")) or re.match(r"^[a-zA-Z]:", raw):
        raise BoundaryHold("ABSOLUTE_OR_EXPANDING_PATH")
    if "\\" in raw or "//" in raw:
        raise BoundaryHold("NONCANONICAL_SEPARATOR")
    pieces = raw.split("/")
    if any(x in {"", ".", ".."} or not SAFE_COMPONENT.fullmatch(x) for x in pieces):
        raise BoundaryHold("TRAVERSAL_OR_UNSAFE_COMPONENT")
    if any(x == ".git" for x in pieces):
        raise BoundaryHold("GIT_METADATA_FORBIDDEN")
    return PurePosixPath(raw)


def authorize_source(raw: str) -> str:
    path = relative_path(raw)
    parts = tuple(x.lower() for x in path.parts)
    if any(x in DENIED_DIRS or x in DENIED_NAMES for x in parts):
        raise BoundaryHold("PROTECTED_SOURCE_NAMESPACE")
    if any(x in str(path).lower() for x in DENIED_TEXT):
        raise BoundaryHold("PROTECTED_NATIVE_OR_EXEC_SURFACE")
    if path.suffix.lower() in DENIED_SUFFIXES:
        raise BoundaryHold("PROTECTED_FILE_TYPE")
    if parts[0] in {"scripts", ".github"} and str(path) not in APPROVED_SOURCE:
        # General nonfinancial tests are allowed, but scripts/workflows are
        # restricted execution surfaces requiring a separate reviewed change.
        raise BoundaryHold("UNREVIEWED_EXECUTABLE_SURFACE")
    return str(path)


def authorize_changed_source(checkout: Path, base: str, raw: str) -> str:
    """No dynamic-route wildcard: admit one independently reviewable route."""
    if raw == EXACT_REVIEWED_DYNAMIC_ROUTE:
        if base != EXACT_REVIEWED_DYNAMIC_BASE:
            raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_WRONG_BASE")
        # Bound every component by this literal constant; never resolve a
        # caller-provided path with arbitrary bracket or traversal segments.
        parent = checkout
        for part in ("app", "api", "media-assets", "[kind]", "[target]"):
            parent = parent / part
            if parent.is_symlink():
                raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_SYMLINK_ANCESTOR")
        path = parent / "route.ts"
        st = path.lstat()
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_size <= 0 or st.st_size > 2_000_000:
            raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_REGULAR_FILE_REQUIRED")
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(path, flags)
        try:
            live = os.fstat(descriptor)
            if (live.st_dev, live.st_ino, live.st_size) != (st.st_dev, st.st_ino, st.st_size):
                raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_INODE_CHANGED")
            content = os.read(descriptor, 2_000_001)
        finally:
            os.close(descriptor)
        if len(content) != st.st_size or hashlib.sha256(content).hexdigest() != EXACT_REVIEWED_DYNAMIC_SHA256:
            raise BoundaryHold("REVIEWED_DYNAMIC_ROUTE_EXACT_SHA_MISMATCH")
        return raw
    relative = relative_path(raw)
    name = str(relative)
    if name != EXACT_REVIEWED_SCRIPT:
        return authorize_source(name)
    if base == EXACT_REVIEWED_BASE:
        expected_sha = EXACT_REVIEWED_SHA256
    elif base == EXACT_REVIEWED_FACTORY_BASE:
        expected_sha = EXACT_REVIEWED_FACTORY_SHA256
    else:
        raise BoundaryHold("REVIEWED_EXECUTABLE_WRONG_BASE")
    path = checkout / relative
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_size < 1 or st.st_size > 500_000:
        raise BoundaryHold("REVIEWED_EXECUTABLE_NOT_SINGLE_REGULAR_FILE")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        live = os.fstat(descriptor)
        if (live.st_dev, live.st_ino, live.st_size) != (st.st_dev, st.st_ino, st.st_size):
            raise BoundaryHold("REVIEWED_EXECUTABLE_CHANGED_INODE")
        content = os.read(descriptor, 500_001)
    finally:
        os.close(descriptor)
    if len(content) != st.st_size or hashlib.sha256(content).hexdigest() != expected_sha:
        raise BoundaryHold("REVIEWED_EXECUTABLE_EXACT_SHA_MISMATCH")
    return name


def authorize_output(raw: str, checkout: Path, product_root: Path) -> Path:
    relative = relative_path(raw)
    value = str(relative)
    if not any(value.startswith(prefix) for prefix in OUTPUT_PREFIXES):
        raise BoundaryHold("UNAPPROVED_ARTIFACT_DESTINATION")
    checkout = checkout.resolve(strict=True)
    product_root = product_root.resolve(strict=True)
    if not checkout.is_relative_to(product_root):
        raise BoundaryHold("CHECKOUT_OUTSIDE_PRODUCT")
    candidate = checkout
    for part in relative.parts:
        candidate = candidate / part
        if candidate.is_symlink():
            raise BoundaryHold("SYMLINK_DESTINATION")
        # Paths must not redirect to another filesystem, including bind mounts.
        if candidate.exists() and candidate.stat().st_dev != checkout.stat().st_dev:
            raise BoundaryHold("MOUNT_ESCAPE")
    if not candidate.resolve(strict=False).is_relative_to(checkout):
        raise BoundaryHold("DESTINATION_ESCAPE")
    return candidate


def authorize_task(payload: dict) -> tuple[str, ...]:
    if not isinstance(payload, dict) or set(payload) != {"argv", "cwd", "output"}:
        raise BoundaryHold("UNREVIEWED_TASK_FIELDS")
    argv = payload["argv"]
    if not isinstance(argv, list) or any(not isinstance(s, str) for s in argv):
        raise BoundaryHold("TASK_ARGV_REQUIRED")
    if tuple(argv) not in ALLOWED_TASK_ARGV:
        raise BoundaryHold("UNAUTHORIZED_COMMAND")
    if payload["cwd"] != "." or payload["output"] is not None:
        raise BoundaryHold("TASK_CWD_OR_OUTPUT_NOT_APPROVED")
    return tuple(argv)


def validate_git_pointer(checkout: Path, product_root: Path, repo_name: str) -> None:
    marker = checkout / ".git"
    if marker.is_symlink():
        raise BoundaryHold("SYMLINK_GIT_MARKER")
    if marker.is_dir():
        if marker.resolve(strict=True) != checkout.resolve(strict=True) / ".git":
            raise BoundaryHold("GIT_DIRECTORY_ESCAPE")
        return
    if not marker.is_file():
        raise BoundaryHold("MISSING_GIT_MARKER")
    data = marker.read_text(encoding="utf-8")
    if len(data) > 512 or not data.startswith("gitdir: ") or len(data.splitlines()) != 1:
        raise BoundaryHold("INVALID_GIT_POINTER")
    pointer = data.removeprefix("gitdir: ").strip()
    p = Path(pointer)
    if not p.is_absolute() or ".." in p.parts or p.is_symlink():
        raise BoundaryHold("UNSAFE_GIT_POINTER")
    try:
        actual = p.resolve(strict=True)
    except OSError as exc:
        raise BoundaryHold("UNRESOLVED_GIT_POINTER") from exc
    expected_bases = (
        product_root / ("app-prodn" if repo_name.endswith("app-prodn") else "kingdom-traders") / ".git" / "worktrees",
        product_root / "session-b-app-c02" / ".git" / "worktrees",
    )
    if not any(actual.is_relative_to(b.resolve(strict=False)) for b in expected_bases):
        raise BoundaryHold("GIT_POINTER_OUTSIDE_APPROVED_PRODUCT_ADMIN")
    if actual.stat().st_uid != checkout.stat().st_uid:
        raise BoundaryHold("GIT_POINTER_OWNER_MISMATCH")


def git(checkout: Path, *args: str) -> str:
    env = {**os.environ, "GIT_OPTIONAL_LOCKS": "0", "GIT_TERMINAL_PROMPT": "0"}
    result = subprocess.run(["git", "-C", str(checkout), *args],
                            capture_output=True, text=True, timeout=25, env=env,
                            check=False)
    if result.returncode:
        raise BoundaryHold("GIT_COMMAND_FAILED:" + args[0])
    return result.stdout.strip()


def check_checkout(checkout: Path, repo_name: str, expected_sha: str,
                   expected_branch: str, product_root: Path,
                   *, ci: bool) -> dict:
    if not REPO.fullmatch(repo_name) or not SHA.fullmatch(expected_sha):
        raise BoundaryHold("BAD_PIN_OR_REPO")
    if not BRANCH.fullmatch(expected_branch) or "//" in expected_branch or ".." in expected_branch:
        raise BoundaryHold("BAD_BRANCH")
    if ci:
        if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_REPOSITORY") != repo_name:
            raise BoundaryHold("UNTRUSTED_CI_IDENTITY")
        if checkout.resolve(strict=True) != Path(os.environ.get("GITHUB_WORKSPACE", "/nonexistent")).resolve(strict=True):
            raise BoundaryHold("CI_CHECKOUT_MISMATCH")
    else:
        if not checkout.resolve(strict=True).is_relative_to(product_root.resolve(strict=True)):
            raise BoundaryHold("CHECKOUT_OUTSIDE_PRODUCT")
        if checkout.stat().st_uid != os.geteuid():
            raise BoundaryHold("SOURCE_OWNER_MISMATCH")
    if checkout.is_symlink() or checkout.stat().st_uid != (checkout / ".git").stat().st_uid:
        raise BoundaryHold("CHECKOUT_OWNER_OR_LINK_MISMATCH")
    validate_git_pointer(checkout, product_root, repo_name) if not ci else None
    if Path(git(checkout, "rev-parse", "--show-toplevel")).resolve(strict=True) != checkout.resolve(strict=True):
        raise BoundaryHold("WORKTREE_ROOT_MISMATCH")
    origin = git(checkout, "remote", "get-url", "origin")
    if origin not in ORIGINS[repo_name]:
        raise BoundaryHold("REMOTE_ORIGIN_MISMATCH")
    if git(checkout, "rev-parse", "HEAD") != expected_sha:
        raise BoundaryHold("SOURCE_SHA_MISMATCH")
    if not ci and git(checkout, "branch", "--show-current") != expected_branch:
        raise BoundaryHold("SOURCE_BRANCH_MISMATCH")
    if git(checkout, "status", "--porcelain=v1", "--untracked-files=normal"):
        raise BoundaryHold("DIRTY_SOURCE")
    return {"repo": repo_name, "sha": expected_sha, "branch": expected_branch, "origin": origin}


def changed_source(checkout: Path, base: str) -> list[str]:
    if not SHA.fullmatch(base):
        raise BoundaryHold("UNPINNED_BASE_SHA")
    names = git(checkout, "diff", "--name-only", "--diff-filter=ACMRTUXB",
                base, "HEAD", "--")
    changes = names.splitlines() if names else []
    for name in changes:
        authorize_changed_source(checkout, base, name)
        mode = git(checkout, "ls-files", "--stage", "--", name)
        if mode.startswith("120000 "):
            raise BoundaryHold("SYMLINK_SOURCE_CHANGE")
    return changes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", required=True)
    args = parser.parse_args()
    try:
        ci = os.environ.get("GITHUB_ACTIONS") == "true"
        repo_name = os.environ["BOUNDARY_REPOSITORY"]
        sha = os.environ["BOUNDARY_HEAD_SHA"]
        branch = os.environ["BOUNDARY_BRANCH"]
        base = os.environ["BOUNDARY_BASE_SHA"]
        checkout = Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve(strict=True)
        product_root = Path(os.environ.get("PRODUCT_BOUNDARY_ROOT", str(Path.home() / "projects" / "AoE2WAR-LANES" / "PRODUCT")))
        receipt = check_checkout(checkout, repo_name, sha, branch, product_root, ci=ci)
        receipt["changed_files"] = changed_source(checkout, base)
        receipt.update(status="PASS_SOURCE_POLICY_ONLY", os_denial_proven=False)
        print(json.dumps(receipt, sort_keys=True))
        return 0
    except (BoundaryHold, KeyError, OSError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({"status": "HOLD_PRODUCT_BOUNDARY", "reason": str(exc)}), file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
