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
import selectors
import shlex
import time

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
    # One root-owned inode is opened, hash-verified, then executed from
    # those SAME bytes; never hash path A then race to exec replaced path B.
    remote_code = r"""
import hashlib,os,pathlib,stat,sys
p=pathlib.Path(sys.argv[1]);expected=sys.argv[2]
if p.is_symlink() or any(q.is_symlink()for q in p.parents):
 raise SystemExit(9)
for q in (p,*p.parents):
 st=q.stat()
 if st.st_uid!=0 or st.st_mode & 0o022:raise SystemExit(9)
fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
try:
 st=os.fstat(fd)
 if not stat.S_ISREG(st.st_mode)or not 0<st.st_size<=131072:
  raise SystemExit(9)
 b=b''
 while True:
  x=os.read(fd,8192)
  if not x:break
  b+=x
  if len(b)>131072:raise SystemExit(9)
 h=hashlib.sha256(b).hexdigest()
 if h!=expected:raise SystemExit(9)
 print(h+'  '+str(p),flush=True)
 sys.argv=[str(p),'--read-only-json']
 exec(compile(b,str(p),'exec'),{'__name__':'__main__','__file__':str(p)})
finally:os.close(fd)
"""
    remote=("python3 -c "+shlex.quote(remote_code)+" "+
            shlex.quote(REMOTE_PROGRAM)+" "+shlex.quote(approved_digest))
    # Only the root-owned M1 SSH identity can access HEL1's review-only
    # observer. The interactive owner must explicitly refresh sudo first;
    # no password prompt is requested inside an automated release phase.
    cmd = ["/usr/bin/sudo", "-n", "/usr/bin/ssh", "-T", "-n", "-o", "BatchMode=yes",
           "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes",
           "-o", "GlobalKnownHostsFile=/dev/null",
           "-o", "UserKnownHostsFile=" + str(KNOWN_HOSTS),
           "-o", "HostKeyAlgorithms=ssh-ed25519",
           "-o", "ConnectTimeout=8", "-i", str(SSH_IDENTITY),
           "root@" + HOST, remote]
    # A bounded selector prevents a malicious/buggy SSH collector from
    # growing output unboundedly before subprocess.run(timeout) returns.
    try:
        proc=subprocess.Popen(cmd,stdin=subprocess.DEVNULL,
                              stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        output,errors=bytearray(),bytearray()
        deadline=time.monotonic()+20
        with selectors.DefaultSelector() as selector:
            for pipe in (proc.stdout,proc.stderr):
                os.set_blocking(pipe.fileno(),False)
                selector.register(pipe,selectors.EVENT_READ)
            while selector.get_map():
                remaining=deadline-time.monotonic()
                check(remaining>0,"HEL1 observer timed out")
                events=selector.select(min(remaining,0.25))
                for key,_ in events:
                    block=os.read(key.fileobj.fileno(),8192)
                    if not block:
                        selector.unregister(key.fileobj)
                        continue
                    dest=output if key.fileobj is proc.stdout else errors
                    limit=MAX_BYTES if dest is output else 8192
                    check(len(dest)+len(block)<=limit,
                          "HEL1 observer exceeded output bound")
                    dest.extend(block)
        check(proc.wait(timeout=max(0.1,deadline-time.monotonic()))==0,
              "HEL1 observer returned nonzero")
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ObserverHold("HEL1_AUTHENTICATED_OBSERVER_HOLD: SSH unavailable") from exc
    finally:
        if 'proc' in locals():
            if proc.poll() is None:
                proc.kill()
                proc.wait()
            for pipe in (proc.stdout,proc.stderr):
                if pipe:pipe.close()
    check(0<len(output)<MAX_BYTES,"invalid empty/large observer")
    lines=bytes(output).splitlines()
    check(len(lines) == 2 and
          lines[0].decode("ascii", "replace").split(" ", 1)[0] ==
          approved_digest and
          lines[0].decode("ascii", "replace").split(" ", 1)[-1].strip() ==
          REMOTE_PROGRAM, "wrong installed host collector")
    def unique(pairs):
        result={}
        for key,value in pairs:
            check(key not in result,"duplicate host evidence property")
            result[key]=value
        return result
    try:
        payload = json.loads(lines[1], object_pairs_hook=unique,
                             parse_constant=lambda _: 1 / 0)
    except (ValueError, UnicodeError, TypeError, ZeroDivisionError) as exc:
        raise ObserverHold("HEL1_AUTHENTICATED_OBSERVER_HOLD: malformed host output") from exc
    check(type(payload) is dict and
          set(payload) == {"schema", "observation", "challenge"} and
          payload["schema"] == 1 and
          type(payload["observation"]) is dict and
          type(payload["challenge"]) is dict, "host output schema")
    return payload["observation"], payload["challenge"]
