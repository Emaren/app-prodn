#!/usr/bin/env python3
"""Owner-Mac-only R23 v6 public-candidate enrollment via existing root SSH.

No key generation, no private-key transfer, no original owner-RSA impersonation.
Only use AFTER independent F review/DocsV2 CI and explicit owner approval.
"""
import argparse
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import tempfile

EXPECTED_HOST = "ubuntu-4gb-hel1-11"
ORIGINAL_RSA_FP = "3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"
ORIGINAL_CONTROLLER = "18052e01a191b15525664c1a058de80d7a8bc150"
ORIGINAL_WEBSITE = "0cee3c836c4b0760478280c145e02e81e470ce0e"
DOMAIN = b"AOE2WAR.OWNER_ROOTSSH_TRUST_RECOVERY.V6\n"
SCHEMA = "aoe2war.owner-rootssh-trust-recovery.v6"

def canon(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True,
                      allow_nan=False).encode("ascii")

def hold(message):
    raise RuntimeError("HOLD:R23_V6_MAC:" + message)

def read_private(p):
    p = Path(p).expanduser().absolute()
    info = p.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        hold("OWNER_PRIVATE_KEY_NOT_0600_OR_OWNER")
    return p

def checked_runner(p, expected):
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        hold("F_PINNED_RUNNER_SHA256_REQUIRED")
    p = Path(p).expanduser().absolute()
    info = p.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o022:
        hold("RUNNER_FILE_NOT_OWNER_CONTROLLED")
    raw = p.read_bytes()
    if len(raw) > 100000 or hashlib.sha256(raw).hexdigest() != expected:
        hold("F_RUNNER_SOURCE_BYTES_NOT_APPROVED")
    return raw

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewed-runner", required=True)
    parser.add_argument("--reviewed-runner-sha256", required=True)
    parser.add_argument("--f-reviewed-c-source-sha", required=True)
    parser.add_argument("--new-rsa-public", required=True)
    parser.add_argument("--new-rsa-private", required=True)
    a = parser.parse_args()
    if sys.platform != "darwin":
        hold("ORIGINAL_OWNER_MAC_ONLY")
    runner = checked_runner(a.reviewed_runner, a.reviewed_runner_sha256)
    if not re.fullmatch(r"[0-9a-f]{40}", a.f_reviewed_c_source_sha):
        hold("F_REVIEWED_C_COMMIT_REQUIRED")
    # Explicitly refuse a source that still has its F approval seal empty.
    expected_source_literal = ('F_REVIEWED_C_SOURCE_SHA = "' + a.f_reviewed_c_source_sha + '"').encode()
    if expected_source_literal not in runner:
        hold("F_GOVERNED_APPROVAL_SEAL_NOT_IN_REVIEWED_SOURCE")
    private = read_private(a.new_rsa_private)
    pubpath = Path(a.new_rsa_public).expanduser().absolute()
    if pubpath.is_symlink() or not pubpath.is_file():
        hold("NEW_PUBLIC_KEY_MISSING_OR_LINKED")
    pub = pubpath.read_bytes()
    if not 200 <= len(pub) <= 4096:
        hold("PUBLIC_PEM_SIZE")
    with tempfile.TemporaryDirectory(prefix="r23-v6-owner-local-") as td:
        tmp = Path(td)
        key = tmp / "newpub.pem"
        key.write_bytes(pub)
        der = subprocess.run(["/usr/bin/openssl", "pkey", "-pubin", "-in", str(key),
                              "-outform", "DER"], capture_output=True, timeout=15, check=True).stdout
        fp = hashlib.sha256(der).hexdigest()
        if fp == ORIGINAL_RSA_FP:
            hold("ORIGINAL_RSA_MUST_NOT_BE_REUSED_OR_IMPERSONATED")
        with open("/dev/tty", "rb", buffering=0) as tty:
            check = subprocess.run(["/usr/bin/openssl", "pkey", "-in", str(private),
                                    "-pubout", "-outform", "DER"], stdin=tty,
                                   stdout=subprocess.PIPE, timeout=90, check=True).stdout
        if hashlib.sha256(check).hexdigest() != fp:
            hold("PRIVATE_KEY_DOES_NOT_MATCH_NEW_PUBLIC")
        issued = datetime.now(timezone.utc)
        def iso(v):
            return v.isoformat(timespec="seconds").replace("+00:00", "Z")
        intent = {
            "operation": "candidate_enroll", "version": 6,
            "nonce": os.urandom(16).hex(), "issued_at": iso(issued),
            "expires_at": iso(issued + timedelta(minutes=10)),
            "original_rsa_spki_sha256": ORIGINAL_RSA_FP, "new_rsa_spki_sha256": fp,
            "original_controller": ORIGINAL_CONTROLLER, "original_website": ORIGINAL_WEBSITE,
            "f_reviewed_c_source_sha": a.f_reviewed_c_source_sha,
            "scope": "PUBLIC_CANDIDATE_ONLY_NO_CONTROLLER_SWITCH",
        }
        message = tmp / "new-owner-intent.bin"
        message.write_bytes(DOMAIN + canon(intent))
        with open("/dev/tty", "rb", buffering=0) as tty:
            signature = subprocess.run(["/usr/bin/openssl", "dgst", "-sha256",
                                        "-sign", str(private), str(message)],
                                       stdin=tty, stdout=subprocess.PIPE,
                                       timeout=90, check=True).stdout
        envelope = {
            "schema": SCHEMA,
            "intent": intent,
            "new_public_pem_base64": base64.b64encode(pub).decode("ascii"),
            "signature_base64": base64.b64encode(signature).decode("ascii"),
        }
        payload = base64.b64encode(canon(envelope)).decode("ascii")
        phrase = "AUTHORIZE HEL1 R23 V6 PUBLIC CANDIDATE " + intent["nonce"]
        print("This is NEW public trust CANDIDATE ONLY; original controller/owner RSA stay untouched.")
        print("F reviewed C source: " + a.f_reviewed_c_source_sha)
        print("New RSA SPKI SHA256: " + fp)
        print("Type exactly: " + phrase)
        with open("/dev/tty", "r") as owner:
            if owner.readline().rstrip("\r\n") != phrase:
                hold("EXPLICIT_OWNER_CONSENT_NOT_GIVEN")
        cmd = ["/usr/bin/ssh", "-T", "-o", "BatchMode=yes", "-o",
               "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", "-o",
               "ConnectionAttempts=1", "-o", "NumberOfPasswordPrompts=0",
               "root@hel1", "/usr/bin/python3 -I -B - apply " + shlex.quote(payload)]
        # Exact reviewed source sent only through existing authenticated root SSH.
        # The signing private PEM and passphrase NEVER enter stdin/argv of SSH.
        proc = subprocess.run(cmd, input=runner, timeout=90, check=False)
        if proc.returncode:
            hold("ROOT_TRUST_CANDIDATE_NOT_VERIFIED_RC_" + str(proc.returncode))
        print("PASS:R23_V6_CANDIDATE_ENROLLMENT_SOURCE_PINNED; NO_INSTALL_NO_ACTIVATE")

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(2)
