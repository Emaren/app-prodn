#!/usr/bin/env python3
"""Non-deleting HEL1 historical website stage parking; source-owned Mac operator.

PREVIEW runs installed root controller read-only. APPLY requires owner phrase,
signs with local encrypted Ed25519 v5 key and runs installed root PARK_ONLY.
No private key sent to HEL1; no website activation or WOLO transaction.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys

from aoe2_release_retire_permit_mac import (
    TARGET, canonical, sign_preview, unique_pairs,
)

ROOT = Path(__file__).resolve().parents[1]
CONTROLLER = "/usr/local/libexec/aoe2war/aoe2_release_retire_stage.py"
EXPECTED_CONTROLLER = "44a897e07d6999a15042885cfe8f0773c4645771a33011c700ef1c58293e2be4"
EXPECTED_OWNER = "3730382540cbb93672fa03b9c4f236a895500c30e22ccca8b884946b9308001c"
PRIVATE = Path.home() / ".config/aoe2war/website-owner-v5/owner-private.pem"
LOCAL_RECEIPTS = ROOT / ".aoe2war-release/stage-park-v5"
ROOT_PERMITS = "/etc/aoe2war/retire-permits"
APPROVAL = "SIGN AND PARK VERIFIED HISTORICAL STAGE"

# Execute this code on authenticated root@hel1; stdin consists exclusively
# of the signed public permit, NOT the private signing key or passphrase.
ROOT_IMPORT_AND_APPLY = r"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

CTRL = Path("/usr/local/libexec/aoe2war/aoe2_release_retire_stage.py")
EXPECTED_SHA = "44a897e07d6999a15042885cfe8f0773c4645771a33011c700ef1c58293e2be4"
PERMITS = Path("/etc/aoe2war/retire-permits")

def require(value, reason):
    if not value:
        raise RuntimeError("HOLD: " + reason)

def pairs(entries):
    obj = {}
    for key, value in entries:
        require(key not in obj, "duplicate permit JSON field")
        obj[key] = value
    return obj

def check_private_root_directory(path):
    current = path
    while True:
        s = os.lstat(current)
        require(stat.S_ISDIR(s.st_mode) and s.st_uid == 0 and
                not (s.st_mode & 0o022),
                "untrusted private permit directory or ancestor")
        if current == Path("/"):
            return
        current = current.parent

def main():
    require(os.geteuid() == 0, "root is required")
    require(hashlib.sha256(CTRL.read_bytes()).hexdigest() == EXPECTED_SHA,
            "installed stage parker source mismatch")
    check_private_root_directory(PERMITS)
    require(stat.S_IMODE(os.lstat(PERMITS).st_mode) == 0o700,
            "root permit folder not mode 0700")
    packet_bytes = sys.stdin.buffer.read(131073)
    require(0 < len(packet_bytes) <= 131072, "signed permit size invalid")
    packet = json.loads(packet_bytes, object_pairs_hook=pairs)
    require(type(packet) is dict and
            set(packet) == {"payload", "signature_base64"},
            "permit envelope shape invalid")
    payload = packet["payload"]
    require(type(payload) is dict and
            payload.get("kind") == "aoe2war.retire-stage-only.v1" and
            payload.get("action") == "PARK_ONLY" and
            payload.get("no_publish_stage_activate") is True and
            payload.get("funded_wolo_authorized") is False,
            "permit requests forbidden action")
    nonce = payload.get("nonce")
    require(type(nonce) is str and
            re.fullmatch(r"[A-Za-z0-9_-]{32,96}", nonce) is not None,
            "bad permit nonce")
    dest = PERMITS / ("owner-v5-" + nonce + ".json")
    fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                 os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(packet_bytes)
        f.flush()
        os.fsync(f.fileno())
    dirfd = os.open(PERMITS, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(dirfd)
    finally:
        os.close(dirfd)
    print("ROOT_SIGNED_PERMIT_IMPORTED: " + str(dest), flush=True)
    p = subprocess.run(["python3", str(CTRL), "--apply", "--permit", str(dest)],
                       capture_output=True, text=True, timeout=420, check=False)
    require(p.returncode == 0,
            "installed PARK_ONLY rejected/unknown: " + p.stderr[-800:])
    result = json.loads(p.stdout, object_pairs_hook=pairs)
    require(result.get("status") == "PARKED_NO_DELETE" and
            result.get("nonce") == nonce and
            result.get("stage_collision_cleared") is True,
            "installed controller returned unexpected result")
    print(json.dumps(result, sort_keys=True), flush=True)
    print("PARKED_NO_DELETE", flush=True)

try:
    main()
except BaseException as exc:
    print("HOLD_OR_UNKNOWN_NO_REPLAY: " + str(exc), file=sys.stderr)
    sys.exit(2)
"""


def require(ok: bool, why: str) -> None:
    if not ok:
        raise RuntimeError("HOLD: " + why)


def ssh(*remote: str, payload: bytes | None = None, timeout: int = 300) -> bytes:
    cmd = ["ssh", "-T", "-o", "BatchMode=yes", "-o",
           "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=12",
           "root@hel1", shlex.join(remote)]
    result = subprocess.run(cmd, input=payload, capture_output=True,
                            timeout=timeout, check=False)
    require(result.returncode == 0,
            "root SSH transaction failed/unknown; inspect HEL1 before replay: " +
            result.stderr.decode(errors="replace")[-1100:])
    return result.stdout


def private_local_directory(path: Path) -> None:
    if not path.exists():
        path.mkdir(mode=0o700, parents=True)
    st = os.lstat(path)
    require(stat.S_ISDIR(st.st_mode) and st.st_uid == os.getuid() and
            not (st.st_mode & 0o077),
            "local signed-permit directory is not owner private")


def save_signed_packet(packet: dict) -> Path:
    private_local_directory(LOCAL_RECEIPTS)
    nonce = packet["payload"]["nonce"]
    require(re.fullmatch(r"[A-Za-z0-9_-]{32,96}", nonce) is not None,
            "invalid local permit nonce")
    target = LOCAL_RECEIPTS / ("owner-v5-" + nonce + ".json")
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(canonical(packet) + b"\n")
        stream.flush()
        os.fsync(stream.fileno())
    return target


def preview() -> dict:
    stdout = ssh("python3", CONTROLLER, "--preview", timeout=300)
    result = json.loads(stdout, object_pairs_hook=unique_pairs)
    require(result.get("status") == "PREVIEW_ONLY" and
            result.get("authorization") == "HOLD_NOT_CONSUMED" and
            result.get("owner_spki_sha256") == EXPECTED_OWNER and
            result.get("controller_sha256") == EXPECTED_CONTROLLER and
            result.get("approved_target_sha") == TARGET,
            "root stage evidence/owner/target drift")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="sign + apply one historical stage park")
    args = parser.parse_args()
    require(sys.platform == "darwin", "owner Mac required")
    require(PRIVATE.is_file() and not PRIVATE.is_symlink(),
            "encrypted Mac owner-v5 key missing")
    require(subprocess.run(["git", "-C", str(ROOT), "branch", "--show-current"],
                           capture_output=True, text=True).stdout.strip() == "main",
            "run canonical main only")
    require(not subprocess.run(["git", "-C", str(ROOT),
                               "status", "--porcelain", "--untracked-files=no"],
                               capture_output=True).stdout,
            "dirty tracked canonical worktree")
    evidence = preview()
    print("PASS: HEL1_ROOT_STAGE_PREVIEW_ONLY")
    print("OWNER_SPKI_SHA256:", EXPECTED_OWNER)
    print("HISTORICAL_BUILD_ID:", evidence["evidence"]["old_build_id"])
    print("NEW_WEBSITE_TARGET:", TARGET)
    print("NO WEBSITE ACTIVATION OR WOLO FINANCIAL CHANGE")
    if not args.apply:
        return 0

    with open("/dev/tty", "r") as tty_in, open("/dev/tty", "w", buffering=1) as tty_out:
        tty_out.write("Type " + APPROVAL + " to sign and park the old stage: ")
        tty_out.flush()
        require(tty_in.readline().strip() == APPROVAL, "owner approval not given")

    import getpass
    from aoe2_release_retire_permit_mac import owner_public_identity
    password = getpass.getpass("Owner-v5 Ed25519 passphrase (Mac only): ")
    require(len(password) > 0, "empty owner-v5 passphrase")
    try:
        packet = sign_preview(evidence, private_key=PRIVATE,
                              expected_owner_spki=EXPECTED_OWNER,
                              expected_controller=EXPECTED_CONTROLLER,
                              passphrase=password)
    finally:
        del password

    path = save_signed_packet(packet)
    print("PASS: MAC_V5_SIGNED_PARK_PERMIT_SAVED:", path, flush=True)
    print("REMOTE: one signed PARK_ONLY root transaction; no blind retry", flush=True)
    output = ssh("python3", "-c", ROOT_IMPORT_AND_APPLY,
                 payload=path.read_bytes(), timeout=540)
    print(output.decode(errors="replace"), end="")
    require(b"PARKED_NO_DELETE" in output, "remote park completion missing")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, ValueError, OSError, subprocess.TimeoutExpired) as exc:
        print(str(exc), file=sys.stderr)
        print("If signed/imported permit may exist, inspect root receipts; NEVER blind retry.",
              file=sys.stderr)
        sys.exit(2)
