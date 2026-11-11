#!/usr/bin/env python3
"""Owner-Terminal-only, metadata-only attestation of an EXISTING private denial parent.

NOT a recovery-key viewer, runner installer, financial controller or admission
to execute the previously approved UID650 pilot. No path is sent in argv,
stdout, GitHub, environment, or an owner-readable PRODUCT manifest. The path
is entered with terminal echo disabled and stored only in a root-0600 receipt.

A second explicitly owner-approved installation packet must check this receipt
and redo its inode/ACL preflight; merely having a receipt proves no UID denial.
"""
from __future__ import annotations

import argparse
import datetime as dt
import getpass
import hashlib
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess
import sys
import time

SCHEMA = "aoe2war.product.owner-private-denial-parent.v1"
RECEIPT = Path("/private/var/root/.aoe2war_product_denial_parent_attest_v1.json")
MAX_AGE_SECONDS = 3600
EXPECTED_OWNER_UID = 501
CONFIRM_PHRASE = "APPROVE PRIVATE DENIAL ONLY"


class Hold(RuntimeError):
    pass


def _within(candidate: str, boundary: str) -> bool:
    return candidate == boundary or candidate.startswith(boundary.rstrip("/") + "/")


def _owner_home() -> str:
    return pwd.getpwuid(EXPECTED_OWNER_UID).pw_dir


def _inspect(raw: str, owner_home: str) -> dict:
    """Metadata-only. Never open, enumerate, read or descend into children."""
    if not raw or "\x00" in raw or "\n" in raw or "\r" in raw:
        raise Hold("INVALID_OWNER_PRIVATE_SELECTION")
    if not raw.startswith("/") or os.path.normpath(raw) != raw or (
            raw != "/" and raw.endswith("/")):
        raise Hold("NONCANONICAL_OWNER_PRIVATE_SELECTION")
    workspace = os.path.join(owner_home, "projects", "AoE2WAR-LANES")
    product = os.path.join(workspace, "PRODUCT")
    financial = os.path.join(workspace, "FINANCIAL")
    forbidden_exact = ("/", "/private", "/private/var", owner_home, workspace)
    forbidden_subtrees = ("/private/var/root", product, financial,
                          os.path.join(owner_home, "Downloads"))
    if raw in forbidden_exact or any(
            _within(raw, item) for item in forbidden_subtrees):
        raise Hold("FORBIDDEN_DENIAL_SCOPE")
    # Never follow an alias into FINANCIAL, PRODUCT, root or some other
    # potentially protected directory. Inspect only lexical ancestors and
    # selected directory metadata, never content or directory listings.
    pieces = Path(raw).parts
    current = Path("/")
    for piece in pieces[1:]:
        current = current / piece
        meta = os.lstat(current)
        if stat.S_ISLNK(meta.st_mode):
            raise Hold("SYMLINKED_DENIAL_SCOPE")
    if os.path.realpath(raw) != raw:
        raise Hold("ALIAS_DENIAL_SCOPE")
    meta = os.lstat(raw)
    if not stat.S_ISDIR(meta.st_mode) or meta.st_uid not in (0, EXPECTED_OWNER_UID):
        raise Hold("NOT_OWNER_OR_ROOT_PRIVATE_DIRECTORY")
    if meta.st_mode & 0o077:
        raise Hold("DENIAL_PARENT_GROUP_OR_WORLD_PERMISSIONS")
    if meta.st_nlink < 1:
        raise Hold("INVALID_DENIAL_PARENT_LINK_COUNT")
    # macOS ACL may grant access independently of mode; capture the
    # exact ACL fingerprint privately and re-check before real denial.
    # Pass only "." as subprocess argument; the selected private path is
    # supplied as cwd, never exposed via /bin/ls argv or printable output.
    acl = subprocess.run(
        ["/bin/ls", "-lde", "."], cwd=raw, capture_output=True,
        check=False, timeout=5, env={"PATH": "/usr/bin:/bin", "LANG": "C"},
    )
    if acl.returncode or not acl.stdout:
        raise Hold("DENIAL_PARENT_ACL_UNREADABLE")
    return {"private_path": raw, "device": meta.st_dev, "inode": meta.st_ino,
            "owner_uid": meta.st_uid, "group_gid": meta.st_gid,
            "mode": stat.S_IMODE(meta.st_mode), "link_count": meta.st_nlink,
            "acl_sha256": hashlib.sha256(acl.stdout).hexdigest()}


def _require_physical_owner_terminal() -> None:
    # This script must be installed independently as exact-SHA root-owned
    # code, then executed ONLY from the owner's physical Terminal via sudo.
    if os.geteuid() != 0 or os.environ.get("SUDO_UID") != str(EXPECTED_OWNER_UID):
        raise Hold("ROOT_VIA_OWNER_SUDO_REQUIRED")
    if os.environ.get("SUDO_USER") != pwd.getpwuid(EXPECTED_OWNER_UID).pw_name:
        raise Hold("WRONG_OWNER_IDENTITY")
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        raise Hold("PHYSICAL_INTERACTIVE_OWNER_TERMINAL_REQUIRED")


def _receipt_preflight() -> None:
    parent = RECEIPT.parent
    s = os.lstat(parent)
    if (not stat.S_ISDIR(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o077):
        raise Hold("ROOT_PRIVATE_RECEIPT_PARENT_INVALID")
    if os.path.realpath(parent) != str(parent):
        raise Hold("ROOT_PRIVATE_RECEIPT_PARENT_ALIAS")


def _store_attestation(snapshot: dict) -> None:
    _receipt_preflight()
    now = int(time.time())
    receipt = {"schema": SCHEMA, **snapshot,
               "attested_at_unix": now, "expires_at_unix": now + MAX_AGE_SECONDS,
               "scope": "OWNER_SELECTS_EXISTING_REAL_DIRECTORY_DENIAL_ONLY",
               "uid650_installed": False, "kernel_denial_proven": False,
               "runner_execution_isolated": False, "pilot_install_authorized": False}
    payload = (json.dumps(receipt, sort_keys=True, separators=(",", ":")) + "\n").encode()
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(RECEIPT, flags, 0o600)
    with os.fdopen(fd, "wb") as out:
        out.write(payload)
        out.flush()
        os.fsync(out.fileno())
    directory_fd = os.open(RECEIPT.parent, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def _load_and_validate() -> None:
    _receipt_preflight()
    s = os.lstat(RECEIPT)
    if (not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or
            stat.S_IMODE(s.st_mode) != 0o600 or s.st_nlink != 1):
        raise Hold("ROOT_PRIVATE_RECEIPT_MODE_CHANGED")
    with RECEIPT.open("rb") as file:
        raw = file.read(4097)
    if len(raw) > 4096:
        raise Hold("ROOT_PRIVATE_RECEIPT_TOO_LARGE")
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise Hold("ROOT_PRIVATE_RECEIPT_DUPLICATE_KEY")
            result[key] = value
        return result
    receipt = json.loads(raw, object_pairs_hook=unique_pairs)
    if not isinstance(receipt, dict):
        raise Hold("ROOT_PRIVATE_RECEIPT_NOT_OBJECT")
    if receipt.get("schema") != SCHEMA or receipt.get("scope") != (
            "OWNER_SELECTS_EXISTING_REAL_DIRECTORY_DENIAL_ONLY"):
        raise Hold("ROOT_PRIVATE_RECEIPT_SCHEMA_INVALID")
    now = int(time.time())
    if (type(receipt.get("attested_at_unix")) is not int or
            type(receipt.get("expires_at_unix")) is not int or
            not (now - MAX_AGE_SECONDS <= receipt["attested_at_unix"] <= now) or
            not (now < receipt["expires_at_unix"] <=
                 receipt["attested_at_unix"] + MAX_AGE_SECONDS)):
        raise Hold("ROOT_PRIVATE_ATTESTATION_EXPIRED")
    expected = _inspect(receipt["private_path"], _owner_home())
    for key, value in expected.items():
        if receipt.get(key) != value:
            raise Hold("OWNER_PRIVATE_METADATA_CHANGED")
    for field in ("uid650_installed", "kernel_denial_proven",
                  "runner_execution_isolated", "pilot_install_authorized"):
        if receipt.get(field) is not False:
            raise Hold("ATTESTATION_CANNOT_ASSERT_INSTALL_OR_DENIAL")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="No recovery path or metadata printed")
    parser.add_argument("command", choices=("attest", "verify"))
    args = parser.parse_args(argv)
    try:
        _require_physical_owner_terminal()
        if args.command == "attest":
            # Never interpolate private selection into logs, commands, URL,
            # shell history, subprocess argument vectors or error messages.
            selected = getpass.getpass(
                "Enter EXISTING owner-selected private denial-parent directory (hidden): ")
            snapshot = _inspect(selected, _owner_home())
            print("An existing privately owned directory has a private mode and fingerprint.")
            print("This authorizes ONLY a private metadata receipt, NOT the UID650 pilot.")
            answer = getpass.getpass(
                "Type APPROVE PRIVATE DENIAL ONLY to attest this exact directory (hidden): ")
            if answer != CONFIRM_PHRASE:
                raise Hold("OWNER_PRIVATE_ATTESTATION_NOT_APPROVED")
            _store_attestation(snapshot)
        else:
            _load_and_validate()
        print("PASS: PRIVATE OWNER DENIAL-PARENT METADATA ONLY; INSTALL AND KERNEL DENIAL HOLD")
        return 0
    except (Hold, OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        print("HOLD: PRIVATE ATTESTATION FAILED OR UNAVAILABLE; NO RUNNER/ACL MUTATION")
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
