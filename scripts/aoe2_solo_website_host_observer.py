#!/usr/bin/env python3
"""Pinned HEL1 read-only observer transport for solo-owner website review.

NO mutating verbs. Does NOT issue a root challenge, consume a nonce, or
assert that the future trusted HEL1 collector is installed/approved.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

HOST = "157.180.114.124"
EXPECTED_HOST_FINGERPRINT = "SHA256:8L7ZF+xPA/YXe6uY1+yVPZFdY58JxYvHjC5S/U+I1Og"
CONFIG_ROOT = Path("/private/etc/aoe2war/solo-owner-website-v1")
KNOWN_HOSTS = CONFIG_ROOT / "hel1-known-hosts"
SSH_IDENTITY = CONFIG_ROOT / "hel1-observer-identity"
REMOTE_HASH = CONFIG_ROOT / "hel1-readonly-observer.sha256"
REMOTE_PROGRAM = "/usr/local/libexec/aoe2war/solo-v1-readonly-observer"
MAX_BYTES = 131072
HEX64 = re.compile(r"[a-f0-9]{64}\Z")


class ObserverHold(Exception):
    pass


def check(ok, message):
    if not ok:
        raise ObserverHold("HEL1_AUTHENTICATED_OBSERVER_HOLD: " + message)


def protected_file(path, *, private=False):
    check(path.is_absolute(), "relative trust path")
    try:
        for item in (path, *path.parents):
            check(not item.is_symlink(), "trusted symlink")
            s = item.stat()
            check(s.st_uid == 0 and not (s.st_mode & 0o022),
                  "trust ancestor not root-owned and protected")
        s = path.stat()
    except OSError as exc:
        raise ObserverHold("HEL1_AUTHENTICATED_OBSERVER_HOLD: trust absent") from exc
    check(stat.S_ISREG(s.st_mode) and s.st_size <= MAX_BYTES,
          "trust file invalid")
    check(not private or (s.st_mode & 0o077) == 0, "private SSH identity exposed")


def host_fingerprint():
    protected_file(KNOWN_HOSTS)
    # Only the exact IP's ED25519 host key may be trusted for this observer.
    lines = KNOWN_HOSTS.read_text().splitlines()
    check(len(lines) == 1 and lines[0].startswith(HOST + " ssh-ed25519 "),
          "non-canonical HEL1 host pin")
    p = subprocess.run(["/usr/bin/ssh-keygen", "-lf", str(KNOWN_HOSTS),
                        "-E", "sha256"], capture_output=True, timeout=8)
    check(p.returncode == 0 and
          EXPECTED_HOST_FINGERPRINT in p.stdout.decode("utf-8", "replace"),
          "HEL1 ED25519 out-of-band fingerprint mismatch")


def read_authenticated_hel1():
    """Get root-bound observation + an already issued durable challenge.

    The separately approved remote program must be installed and hash-pinned.
    It must emit read-only observed bytes, not fixture or owner-pasted values.
    """
    host_fingerprint()
    protected_file(SSH_IDENTITY, private=True)
    protected_file(REMOTE_HASH)
    approved_digest = REMOTE_HASH.read_text().strip()
    check(bool(HEX64.fullmatch(approved_digest)), "bad approved collector digest")
    # Pinned remote path, no user-controlled command interpolation or permits.
    remote = ("sha256sum " + REMOTE_PROGRAM + " && " +
              REMOTE_PROGRAM + " --read-only-json")
    cmd = ["/usr/bin/ssh", "-T", "-n", "-o", "BatchMode=yes",
           "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes",
           "-o", "GlobalKnownHostsFile=/dev/null",
           "-o", "UserKnownHostsFile=" + str(KNOWN_HOSTS),
           "-o", "HostKeyAlgorithms=ssh-ed25519",
           "-o", "ConnectTimeout=8", "-i", str(SSH_IDENTITY),
           "root@" + HOST, remote]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ObserverHold("HEL1_AUTHENTICATED_OBSERVER_HOLD: SSH unavailable") from exc
    check(result.returncode == 0 and 0 < len(result.stdout) < MAX_BYTES,
          "host observer failed or produced invalid output")
    lines = result.stdout.splitlines()
    check(len(lines) == 2 and
          lines[0].decode("ascii", "replace").split(" ", 1)[0] ==
          approved_digest and
          lines[0].decode("ascii", "replace").split(" ", 1)[-1].strip() ==
          REMOTE_PROGRAM, "wrong installed host collector")
    try:
        payload = json.loads(lines[1], parse_constant=lambda _: 1 / 0)
    except (ValueError, UnicodeError, TypeError, ZeroDivisionError) as exc:
        raise ObserverHold("HEL1_AUTHENTICATED_OBSERVER_HOLD: malformed host output") from exc
    check(type(payload) is dict and
          set(payload) == {"schema", "observation", "challenge"} and
          payload["schema"] == 1 and
          type(payload["observation"]) is dict and
          type(payload["challenge"]) is dict, "host output schema")
    return payload["observation"], payload["challenge"]
