#!/usr/bin/env python3
"""Root-only HEL1 stage-park controller and owner PUBLIC-key installer.

Inputs MUST be separately SHA-pinned on the Mac before authorized authenticated
sudo execution. This tool enrolls no private key and never parks/stages/activates.
The owner must independently approve the DER-SPKI SHA-256 used as trust anchor.
"""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

CONTROLLER = Path("/usr/local/libexec/aoe2war/aoe2_release_retire_stage.py")
TRUST = Path("/etc/aoe2war/website-owner-v4")
OWNER_PUBLIC = TRUST / "owner-public.pem"
OWNER_PIN = TRUST / "owner-public.spki.sha256"
ARCHIVE = Path("/var/www/AoE2HDBets/.aoe2war-preserved-stages")
STATE = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/stage-park-v1")
PERMITS = Path("/etc/aoe2war/retire-permits")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")


def check(ok, why):
    if not ok:
        raise RuntimeError("HOLD: " + why)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_regular(path, limit=100000):
    s = os.lstat(path)
    check(stat.S_ISREG(s.st_mode) and 0 < s.st_size < limit,
          "input must be a bounded regular file, never a symlink")
    return path.read_bytes()


def spki_digest(public_bytes):
    check(b"PUBLIC KEY" in public_bytes and b"PRIVATE" not in public_bytes,
          "owner input must be PUBLIC key only")
    with tempfile.TemporaryDirectory(prefix="owner-public-check-") as temp:
        key = Path(temp) / "public.pem"
        key.write_bytes(public_bytes)
        p = subprocess.run(["openssl", "pkey", "-pubin", "-in", str(key),
                            "-pubout", "-outform", "DER"], capture_output=True,
                           timeout=15, check=False)
    check(p.returncode == 0 and len(p.stdout) > 0, "invalid owner public key")
    return digest(p.stdout)


def ensure_private_dir(path, mode=0o700):
    check(path.parent.is_dir() and not path.parent.is_symlink(),
          "untrusted installation ancestor")
    try:
        path.mkdir(mode=mode)
    except FileExistsError:
        pass
    s = os.lstat(path)
    check(stat.S_ISDIR(s.st_mode) and s.st_uid == 0 and
          (s.st_mode & 0o077) == 0, "operator directory is not root-owned private")


def ensure_public_dir(path):
    check(path.parent.is_dir() and not path.parent.is_symlink(),
          "untrusted installation ancestor")
    try:
        path.mkdir(mode=0o755)
    except FileExistsError:
        pass
    s = os.lstat(path)
    check(stat.S_ISDIR(s.st_mode) and s.st_uid == 0 and
          (s.st_mode & 0o022) == 0, "controller/trust directory untrusted")


def install_once(dest, data, mode):
    if dest.exists() or dest.is_symlink():
        s = os.lstat(dest)
        check(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and
              (s.st_mode & 0o022) == 0 and dest.read_bytes() == data,
              "immutable existing installation conflicts with approved input")
        return
    fd = os.open(dest, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
    except BaseException:
        # Do not clear or overwrite uncertain installed material.
        raise
    fd = os.open(dest.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("--controller-source", type=Path, required=True)
    args.add_argument("--owner-public-source", type=Path, required=True)
    args.add_argument("--approved-controller-sha256", required=True)
    args.add_argument("--approved-owner-spki-sha256", required=True)
    opts = args.parse_args()
    check(os.geteuid() == 0, "authenticated sudo/root required")
    check(HEX64.fullmatch(opts.approved_controller_sha256) is not None and
          HEX64.fullmatch(opts.approved_owner_spki_sha256) is not None,
          "two approved SHA256 digests required")
    body = read_regular(opts.controller_source)
    public = read_regular(opts.owner_public_source, 8192)
    check(digest(body) == opts.approved_controller_sha256,
          "unreviewed controller source bytes")
    check(spki_digest(public) == opts.approved_owner_spki_sha256,
          "unapproved owner-v4 public-key identity")
    # Install-only: never touch historical stage, website runtime or finance.
    ensure_public_dir(CONTROLLER.parent.parent)
    ensure_public_dir(CONTROLLER.parent)
    ensure_public_dir(TRUST.parent)
    ensure_public_dir(TRUST)
    ensure_private_dir(PERMITS)
    ensure_private_dir(ARCHIVE)
    ensure_private_dir(STATE)
    ensure_private_dir(STATE / "nonces")
    ensure_private_dir(STATE / "receipts")
    install_once(CONTROLLER, body, 0o500)
    install_once(OWNER_PUBLIC, public, 0o444)
    install_once(OWNER_PIN, (opts.approved_owner_spki_sha256 + "\n").encode(), 0o444)
    check(digest(read_regular(CONTROLLER)) == opts.approved_controller_sha256 and
          spki_digest(read_regular(OWNER_PUBLIC, 8192)) ==
          opts.approved_owner_spki_sha256 and
          OWNER_PIN.read_text().strip() == opts.approved_owner_spki_sha256,
          "installed trust/controller proof failed")
    print("PASS: source-pinned controller and independently approved owner public key installed")
    print("Controller SHA256:", opts.approved_controller_sha256)
    print("Owner DER/SPKI SHA256:", opts.approved_owner_spki_sha256)
    print("Finance/website runtime untouched; no stage moved")


if __name__ == "__main__":
    main()
