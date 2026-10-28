#!/usr/bin/env python3
"""HEL1 owner-v5 public trust enrollment via proven root SSH, not sudo.

One bounded release-lock transaction; old PUBLIC trust is archived, old private
key never read. No stage park, deployment, website restart or WOLO mutation.
"""
from __future__ import annotations

import argparse
import base64
import fcntl
import hashlib
import json
import os
import pwd
from pathlib import Path
import re
import stat
import subprocess
import sys

EXPECTED_OLD = "3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"
EXPECTED_NEW = "3730382540cbb93672fa03b9c4f236a895500c30e22ccca8b884946b9308001c"
EXPECTED_PEM = "a60623079218c934295502350f0cbedcbcf9e42559f0d07469b0d703f59cb13b"
CONTROLLER_SHA = "44a897e07d6999a15042885cfe8f0773c4645771a33011c700ef1c58293e2be4"
PUBLIC_MAC = Path.home() / ".config/aoe2war/website-owner-v5/owner-public.pem"
TRUST = Path("/etc/aoe2war/website-owner-v4")
PUB = TRUST / "owner-public.pem"
PIN = TRUST / "owner-public.spki.sha256"
CONTROLLER = Path("/usr/local/libexec/aoe2war/aoe2_release_retire_stage.py")
LEASE = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
AUDIT_PARENT = Path("/var/lib/aoe2war-owner-rotations")
AUDIT = AUDIT_PARENT / "v5-20261028-3730382540cb"


def need(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError("HOLD: " + message)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run(args: list[str], *, data: bytes | None = None, timeout: int = 40) -> bytes:
    r = subprocess.run(args, input=data, capture_output=True, timeout=timeout, check=False)
    if r.returncode:
        raise RuntimeError("HOLD: " + args[0] + " failed: " +
                           r.stderr.decode(errors="replace")[-1600:])
    return r.stdout


def spki(public: bytes) -> str:
    """Parse a public PEM via OpenSSL without putting secret material in argv."""
    import tempfile
    with tempfile.TemporaryDirectory(prefix="aoe2war-verify-public-") as tmp:
        p = Path(tmp) / "public.pem"
        p.write_bytes(public)
        desc = run(["openssl", "pkey", "-pubin", "-in", str(p),
                    "-text_pub", "-noout"]).decode()
        need("ED25519" in desc.upper(), "new PEM is not Ed25519")
        der = run(["openssl", "pkey", "-pubin", "-in", str(p),
                   "-pubout", "-outform", "DER"])
    need(len(der) == 44, "Ed25519 SPKI DER should be 44 bytes")
    return sha(der)


def old_spki(public: bytes) -> str:
    import tempfile
    with tempfile.TemporaryDirectory(prefix="aoe2war-verify-old-public-") as tmp:
        p = Path(tmp) / "public.pem"
        p.write_bytes(public)
        der = run(["openssl", "pkey", "-pubin", "-in", str(p),
                   "-pubout", "-outform", "DER"])
    return sha(der)


def protected_dir(path: Path) -> None:
    current = path
    while True:
        st = os.lstat(current)
        need(stat.S_ISDIR(st.st_mode), "unsafe directory/symlink: " + str(current))
        need(st.st_uid == 0 and not st.st_mode & 0o022,
             "directory writable/unowned: " + str(current))
        if current == Path("/"):
            break
        current = current.parent


def shared_release_lock_shape(*, operator_uid: int) -> tuple[int, int, int]:
    """Validate HEL1's existing tony-owned shared release lock.

    Exact observed modes: os-control 0750, locks 0755, release.lock 0664.
    Preserve all directory ownership and modes; only the one lock file will
    be tightened to 0644 under flock, meeting stage controller's requirement.
    """
    current = LEASE.parent
    while True:
        st = os.lstat(current)
        need(stat.S_ISDIR(st.st_mode), "shared lock ancestor is linked/non-directory")
        if current == Path("/"):
            break
        current = current.parent
    for path, mode in ((LEASE.parent.parent, 0o750), (LEASE.parent, 0o755)):
        st = os.lstat(path)
        need(st.st_uid == operator_uid and stat.S_IMODE(st.st_mode) == mode,
             "shared release directory ownership/mode drift: " + str(path))
    st = os.lstat(LEASE)
    need(stat.S_ISREG(st.st_mode) and st.st_uid == operator_uid and
         stat.S_IMODE(st.st_mode) == 0o664 and st.st_size == 0,
         "shared release lock not observed tony-owned 0664 empty file")
    return (st.st_dev, st.st_ino, st.st_mode)


def protected_file(path: Path) -> bytes:
    protected_dir(path.parent)
    st = os.lstat(path)
    need(stat.S_ISREG(st.st_mode) and st.st_uid == 0 and not st.st_mode & 0o022,
         "untrusted protected file: " + str(path))
    need(0 < st.st_size < 100000, "unexpected protected file size")
    return path.read_bytes()


def durable_new(path: Path, body: bytes, mode: int = 0o400) -> None:
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, "wb") as f:
        f.write(body)
        f.flush()
        os.fsync(f.fileno())


def fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def rotate_root(encoded: str) -> int:
    need(os.geteuid() == 0, "root SSH required")
    public = base64.b64decode(encoded, validate=True)
    need(len(public) <= 2048 and sha(public) == EXPECTED_PEM,
         "unapproved exact owner-v5 public PEM")
    need(spki(public) == EXPECTED_NEW, "unapproved Ed25519 identity")
    need(sha(protected_file(CONTROLLER)) == CONTROLLER_SHA,
         "installed controller SHA drifted")
    need(not AUDIT.exists() and not AUDIT.is_symlink(),
         "previous or unknown owner-v5 rotation audit exists; do not replay")
    need(AUDIT_PARENT.parent.is_dir(), "audit ancestry missing")
    protected_dir(AUDIT_PARENT.parent)
    if not AUDIT_PARENT.exists():
        AUDIT_PARENT.mkdir(mode=0o700)
    protected_dir(AUDIT_PARENT)
    protected_dir(TRUST)
    operator_uid = pwd.getpwnam("tony").pw_uid
    lock_dev, lock_ino, lock_mode = shared_release_lock_shape(operator_uid=operator_uid)
    old_public = protected_file(PUB)
    old_pin = protected_file(PIN)
    need(old_pin.decode("ascii").strip() == EXPECTED_OLD and
         old_spki(old_public) == EXPECTED_OLD,
         "old owner identity changed; inspect root audit")
    lease_fd = os.open(LEASE, os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC)
    with os.fdopen(lease_fd, "r+b") as lease:
        fst = os.fstat(lease.fileno())
        need((fst.st_dev, fst.st_ino, fst.st_mode) ==
             (lock_dev, lock_ino, lock_mode) and fst.st_uid == operator_uid,
             "shared release lease inode/mode drift")
        fcntl.flock(lease.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        path_stat = os.lstat(LEASE)
        need((path_stat.st_dev, path_stat.st_ino, path_stat.st_mode) ==
             (lock_dev, lock_ino, lock_mode), "shared lock path replaced after flock")
        need(sha(protected_file(CONTROLLER)) == CONTROLLER_SHA,
             "controller changed after lease")
        need(old_spki(protected_file(PUB)) == EXPECTED_OLD and
             protected_file(PIN) == old_pin,
             "old public trust drifted after lease")
        # Deliberately snapshot only old PUBLIC material and pins.
        AUDIT.mkdir(mode=0o700)
        durable_new(AUDIT / "old-owner-public.pem", old_public)
        durable_new(AUDIT / "old-owner-public.spki.sha256", old_pin)
        durable_new(AUDIT / "intent.json", (json.dumps({
            "status": "INTENT",
            "scope": "owner_public_authority_only",
            "old_spki_sha256": EXPECTED_OLD,
            "new_spki_sha256": EXPECTED_NEW,
            "old_pem_sha256": sha(old_public),
            "new_pem_sha256": EXPECTED_PEM,
            "shared_lock_path": str(LEASE),
            "shared_lock_owner_uid": operator_uid,
            "shared_lock_mode_before": "0664",
            "shared_lock_mode_after": "0644",
            "controller_sha256": CONTROLLER_SHA,
            "stage_parked": False,
            "website_activated": False,
            "finance_mutated": False,
        }, sort_keys=True) + "\n").encode())
        fsync_dir(AUDIT)
        fsync_dir(AUDIT_PARENT)

        # The installed stage parker already rejects the original mode 0664.
        # Tighten only the exact observed shared file to 0644 without changing
        # tony ownership, directories, file contents or inode.
        os.fchmod(lease.fileno(), 0o644)
        os.fsync(lease.fileno())
        after_fd = os.fstat(lease.fileno())
        after_path = os.lstat(LEASE)
        need((after_fd.st_dev, after_fd.st_ino, after_fd.st_uid,
              stat.S_IMODE(after_fd.st_mode)) ==
             (lock_dev, lock_ino, operator_uid, 0o644) and
             (after_path.st_dev, after_path.st_ino) ==
             (lock_dev, lock_ino), "shared release lock mode repair failed")

        # Two file replacements under a canonical release lock. A crash or
        # post-switch preview failure is UNKNOWN; do not blindly rerun.
        durable_new(TRUST / "owner-public.pem.v5-pending", public, 0o444)
        durable_new(TRUST / "owner-public.spki.sha256.v5-pending",
                    (EXPECTED_NEW + "\n").encode(), 0o444)
        os.replace(TRUST / "owner-public.pem.v5-pending", PUB)
        os.replace(TRUST / "owner-public.spki.sha256.v5-pending", PIN)
        fsync_dir(TRUST)
        need(spki(protected_file(PUB)) == EXPECTED_NEW and
             protected_file(PIN).decode().strip() == EXPECTED_NEW,
             "new root trust not consistent")
        preview = json.loads(run(["python3", str(CONTROLLER), "--preview"],
                                 timeout=480).decode())
        need(preview.get("status") == "PREVIEW_ONLY" and
             preview.get("owner_spki_sha256") == EXPECTED_NEW and
             preview.get("controller_sha256") == CONTROLLER_SHA,
             "post-rotation controller preview failed")
        durable_new(AUDIT / "complete.json", (json.dumps({
            "status": "OWNER_V5_ENROLLED_PREVIEW_PASS",
            "old_spki_sha256": EXPECTED_OLD,
            "new_spki_sha256": EXPECTED_NEW,
            "controller_sha256": CONTROLLER_SHA,
            "stage_parked": False,
            "website_activated": False,
            "finance_mutated": False,
            "shared_release_lock_mode_before": "0664",
            "shared_release_lock_mode_after": "0644",
            "shared_release_lock_owner_preserved": True,
            "preview": preview,
        }, sort_keys=True) + "\n").encode())
        fsync_dir(AUDIT)
    print("OWNER_V5_ENROLLED_PREVIEW_PASS")
    print("AUDIT:", AUDIT / "complete.json")
    print("OWNER_SPKI_SHA256:", EXPECTED_NEW)
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--apply", action="store_true")
    p.add_argument("--root-mode", action="store_true")
    p.add_argument("--public-b64")
    args = p.parse_args()
    if args.root_mode:
        need(args.public_b64 is not None, "root-mode public material required")
        return rotate_root(args.public_b64)
    need(args.apply, "apply explicitly required")
    need(not PUBLIC_MAC.is_symlink() and PUBLIC_MAC.is_file(),
         "Mac owner-v5 public PEM missing or symlink")
    public = PUBLIC_MAC.read_bytes()
    need(sha(public) == EXPECTED_PEM and spki(public) == EXPECTED_NEW,
         "Mac owner-v5 public key mismatch")
    # Source runs from canonical Git and is transferred in-memory. No installer.
    here = Path(__file__).resolve()
    root = here.parents[1]
    need(run(["git", "-C", str(root), "branch", "--show-current"]).strip() == b"main",
         "canonical main required")
    need(not run(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=no"]),
         "canonical tracked worktree must be clean")
    print("=== SOURCE-OWNED OWNER-V5 ROOT SSH ENROLLMENT ===", flush=True)
    print("TARGET:", EXPECTED_NEW, flush=True)
    print("SCOPE: owner-v5 PUBLIC trust + exact shared release.lock mode 0664->0644; no stage, activation or WOLO", flush=True)
    with open("/dev/tty", "r") as fin, open("/dev/tty", "w") as fout:
        fout.write("Type ENROLL OWNER V5 AND TIGHTEN RELEASE LOCK to authorize: ")
        fout.flush()
        need(fin.readline().strip() == "ENROLL OWNER V5 AND TIGHTEN RELEASE LOCK",
             "owner did not authorize")
    cmd = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
           "-o", "ConnectTimeout=12", "root@hel1", "python3", "-",
           "--root-mode", "--public-b64", base64.b64encode(public).decode()]
    # No sudo, no remote persistent installer, no private key over SSH.
    output = run(cmd, data=here.read_bytes(), timeout=650)
    print(output.decode(errors="replace"), end="")
    need(b"OWNER_V5_ENROLLED_PREVIEW_PASS" in output,
         "no root post-rotation preview pass")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print("HOLD:", str(exc), file=sys.stderr)
        print("Never replay after an uncertain root transaction; inspect audit.", file=sys.stderr)
        sys.exit(2)
