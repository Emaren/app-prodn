#!/usr/bin/env python3
"""A05 owner-run protected-state daemon-reload diagnostic, never a START.

One permitted systemd daemon-reload under the original release lock.
No SQL/write grant, service start/stop, Nginx or chain changes. Prints
ONLY field paths and digest equality (no protected secrets/command values).
"""
from __future__ import annotations
import fcntl
import hashlib
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys
import types

HOST = "ubuntu-4gb-hel1-11"
NATIVE = Path("/var/lib/aoe2war-runtime-artifacts/5869b4ab08702be4b33860f7dda7d97b5de79424/source-qualified-extractor-3e451ecf.py")
NATIVE_SHA = "3e451ecfa4c4a2f0b4419250908aca6b2fcb16cf165be8226bd024a071f0ef26"
PUBLIC_BUILD = "20261028134227-6c0f6d7531"
OWNER_FAILED = Path("/var/lib/aoe2war-app-production-v1/profile-upgrades/final-3032-7404ed100dc0dfcc0ec8f7ec46984f3f")
CONTROLLED = (
    (Path("/etc/systemd/system/aoe2hdbets-web-prod.service"), "unit.before"),
    (Path("/etc/aoe2war/web-prod-v1/approved-profile.json"), "policy.before"),
    (Path("/usr/local/lib/aoe2war-web-prod/r25_c_start_root.py"), "controller.before"),
)


class Hold(RuntimeError):
    pass


def need(ok, reason):
    if not ok:
        raise Hold(reason)


def sha(value: bytes):
    return hashlib.sha256(value).hexdigest()


def diff(a, b, path="protected"):
    """Output field paths, never values or sensitive command lines."""
    if isinstance(a, dict) and isinstance(b, dict):
        out = []
        for name in sorted(set(a) | set(b)):
            k = path + "." + str(name)
            if name not in a or name not in b:
                out.append(k + ":KEY_PRESENCE_CHANGED")
            else:
                out.extend(diff(a[name], b[name], k))
        return out
    if a != b:
        return [path]
    return []


def check(c):
    need(c.unit_state("aoe2hdbets-web.service")["properties"]["ActiveState"] == "active",
         "PUBLIC_3030_NOT_ACTIVE")
    need(c.unit_state("aoe2hdbets-web-prod.service")["properties"]["ActiveState"] == "inactive"
         and c.unit_state("aoe2hdbets-web-prod.service")["properties"]["MainPID"] == "0",
         "ISOLATED_3032_NOT_STOPPED")
    for live, saved in CONTROLLED:
        need(live.read_bytes() == (OWNER_FAILED / saved).read_bytes(),
             "PRIOR_FAILED_OWNER_ROLLBACK_SOURCE_NOT_RESTORED:" + saved)
    need(c.sha(c.root_file(Path("/etc/nginx/sites-available/aoe2war.com"), 65536, 0o644))
         == c.PROD_NGINX_PREIMAGE,
         "PUBLIC_NGINX_PREIMAGE_CHANGED")


def main():
    need(os.geteuid() == 0 and socket.gethostname().split(".")[0] == HOST,
         "EXACT_HEL1_ROOT_REQUIRED")
    raw = NATIVE.read_bytes()
    need(sha(raw) == NATIVE_SHA, "REVIEWED_SNAPSHOT_SOURCE_HASH_CHANGED")
    c = types.ModuleType("a05_owner_diagnostic_snapshot")
    c.__file__ = str(NATIVE)
    exec(compile(raw, str(NATIVE), "exec"), c.__dict__)
    st = c.LOCK.lstat()
    need(stat.S_ISREG(st.st_mode)
         and (st.st_dev, st.st_ino, st.st_uid, stat.S_IMODE(st.st_mode)) == c.LOCK_ID,
         "EXACT_NATIVE_RELEASE_LOCK_DRIFT")
    fd = os.open(c.LOCK, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        check(c)
        print("PASS: LOCK AND ORIGINAL HOST PREIMAGE", flush=True)
        before = c.production_protected()
        before_sha = sha(c.canonical(before))
        print("BEFORE_SHA:", before_sha, flush=True)
        # The owner explicitly authorizes this nonservice-changing
        # systemd reload. It can naturally reserialize loaded metadata;
        # the following exact native comparison makes that drift visible.
        subprocess.run(["/usr/bin/systemctl", "daemon-reload"],
                       check=True, timeout=45, stdout=subprocess.DEVNULL)
        print("PASS: SYSTEMD CONFIGURATION RELOADED", flush=True)
        after = c.production_protected()
        after_sha = sha(c.canonical(after))
        changes = diff(before, after)
        print("AFTER_SHA:", after_sha, flush=True)
        print("RELOAD_CHANGED_FIELD_COUNT:", len(changes), flush=True)
        for entry in changes[:65]:
            print("CHANGED_FIELD_PATH:", entry, flush=True)
        check(c)
        if changes:
            print("HOLD: PROTECTED_SNAPSHOT_CHANGED_AFTER_RELOAD", flush=True)
            return 2
        print("PASS: EXACT_PROTECTED_IDENTITY_STABLE_AFTER_RELOAD", flush=True)
        return 0
    finally:
        os.close(fd)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (Hold, OSError, ValueError, subprocess.SubprocessError) as exc:
        print("HOLD:" + str(exc)[:180], file=sys.stderr)
        raise SystemExit(2)
