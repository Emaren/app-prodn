#!/usr/bin/env python3
"""Create an exact F/C R22 one-use HEL1 root-helper INSTALL permit.

Must execute on the existing, separate owner-key custody machine. The private
key never leaves this machine. Output is short-lived signed *authorization*,
not a key, but should be pasted directly into the owner HEL1 terminal, never
published. No key generation, no SSH, no host changes.
"""
import argparse
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile

FP = "3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"
CTRL = "18052e01a191b15525664c1a058de80d7a8bc150"
MANIFEST = "874a27ecac946360e492420390fceb7e8b2409047033a0be641003c0da3408dc"
DOM = b"AOE2WAR.SOLO_OWNER.ROOT_HELPER_INSTALL.V2\n"

def canon(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("ascii")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--owner-rsa-private-key", required=True, help="existing owner-controlled private PEM path; never upload")
    a = parser.parse_args()
    p = Path(a.owner_rsa_private_key).expanduser().absolute()
    if not p.is_file() or p.is_symlink():
        raise ValueError("HOLD: OWNER_PRIVATE_KEY_PATH_MISSING_OR_LINKED")
    st = p.stat()
    if st.st_uid != os.getuid() or stat.S_IMODE(st.st_mode) & 0o077:
        raise ValueError("HOLD: OWNER_PRIVATE_KEY_NOT_OWNED_PRIVATE_0600")
    # OpenSSL parses original owner private key, emits ONLY public DER for pinning.
    # No key bytes emitted or copied into signed envelope.
    # The bootstrap arrives via a shell heredoc, so inherited stdin is EOF.
    # Explicitly route OpenSSL encrypted-key passphrase prompts to the
    # genuine local terminal. Never pass passphrases via args, env or logs.
    with open("/dev/tty", "rb", buffering=0) as owner_tty:
        public = subprocess.run(["openssl", "pkey", "-in", str(p), "-pubout", "-outform", "DER"],
                                stdin=owner_tty, stdout=subprocess.PIPE,
                                check=True, timeout=45).stdout
    if hashlib.sha256(public).hexdigest() != FP:
        raise ValueError("HOLD: OWNER_RSA_SPKI_SHA256_NOT_PINNED_OWNER")
    now = datetime.now(timezone.utc)
    def iso(t): return t.isoformat(timespec="seconds").replace("+00:00", "Z")
    body = {"operation": "install", "manifest_sha256": MANIFEST,
            "controller_commit": CTRL, "issued_at": iso(now),
            "expires_at": iso(now + timedelta(minutes=10))}
    with tempfile.TemporaryDirectory(prefix="r22-install-permit-") as tmp:
        msg = Path(tmp) / "owner-intent.bin"
        msg.write_bytes(DOM + canon(body))
        with open("/dev/tty", "rb", buffering=0) as owner_tty:
            sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(p), str(msg)],
                                 stdin=owner_tty, stdout=subprocess.PIPE,
                                 check=True, timeout=45).stdout
    envelope = {"schema": "aoe2war.hel1.root-install.permit.v2",
                "payload": body, "signature_base64": base64.b64encode(sig).decode("ascii")}
    print("PASS: REAL_EXISTING_OWNER_RSA_SPKI_MATCH; INSTALL PERMIT EXPIRES " + body["expires_at"], file=sys.stderr)
    print("R22_INSTALL_PERMIT_BASE64=" + base64.b64encode(canon(envelope)).decode("ascii"))

if __name__ == "__main__":
    try: main()
    except Exception as e:
        print("HOLD:" + str(e), file=sys.stderr)
        sys.exit(2)
