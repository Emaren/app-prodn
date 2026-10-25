#!/usr/bin/env python3
"""READ ONLY: inspect independently provisioned PUBLIC website release trust anchors.

This never creates keys, issues reviewer approval, signs a packet, provisions a
witness, accesses a wallet, or certifies real-world human independence.
Exit 2 on absent or unsafe material. Human identity remains an external review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import subprocess
import sys
from pathlib import Path

ROLES = (
    "owner", "chain_reviewer", "finance_reviewer",
    "release_operator", "source_reviewer", "runtime_witness",
)
ROOT = Path("/etc/aoe2war/website-release-authority-v2")
LEDGER = Path("/var/lib/aoe2war-website-authority-v2")
WITNESS = Path("/usr/local/libexec/aoe2war-website-witness-v2")


def inspected(path: Path, *, directory=False, owner=0, private=False) -> bool:
    if path.is_symlink():
        return False
    try:
        info = path.stat()
    except OSError:
        return False
    if info.st_uid != owner:
        return False
    if directory != stat.S_ISDIR(info.st_mode):
        return False
    if info.st_mode & 0o022:
        return False
    if private and info.st_mode & 0o077:
        return False
    return True


def public_fingerprint(path: Path) -> str | None:
    if not inspected(path):
        return None
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    if (not 0 < len(raw) < 8192 or b"PUBLIC KEY" not in raw
            or b"PRIVATE KEY" in raw):
        return None
    result = subprocess.run(
        ["openssl", "pkey", "-pubin", "-in", str(path),
         "-pubout", "-outform", "DER"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        timeout=10, check=False,
    )
    if result.returncode or not result.stdout:
        return None
    return hashlib.sha256(result.stdout).hexdigest()


def verify(*, trust_root=ROOT, ledger=LEDGER, witness=WITNESS,
           operator_uid=None) -> dict:
    uid = os.geteuid() if operator_uid is None else operator_uid
    status = {"kind": "aoe2war-public-release-trust-inspection-v1",
              "status": "HOLD", "approvals_issued": False,
              "reviewers_authenticated_as_real_humans": False,
              "funded_authorized": False, "wolo_p1_open": True,
              "trusted": {}, "problems": []}
    fail = status["problems"]
    if not inspected(trust_root, directory=True):
        fail.append("untrusted_or_missing_root_public_trust_directory")
    seen = set()
    for role in ROLES:
        fingerprint = public_fingerprint(trust_root / (role + ".pem"))
        if fingerprint is None:
            fail.append("missing_or_untrusted_public_key:" + role)
        elif fingerprint in seen:
            fail.append("reused_public_key_identity:" + role)
        else:
            seen.add(fingerprint)
            status["trusted"][role] = fingerprint
    if not inspected(ledger.parent, directory=True):
        fail.append("nonce_ledger_parent_not_root_owned_and_protected")
    if not inspected(ledger, directory=True, owner=uid, private=True):
        fail.append("nonce_ledger_missing_or_not_private_operator_owned")
    db = ledger / "authority.sqlite3"
    if db.exists() and (not inspected(db, owner=uid, private=True)
                        or stat.S_IMODE(db.stat().st_mode) != 0o600):
        fail.append("unsafe_or_shared_nonce_ledger_database")
    if not inspected(witness):
        fail.append("witness_executable_missing_or_not_root_protected")
    elif not os.access(witness, os.X_OK):
        fail.append("witness_executable_not_executable")
    status["mathematical_key_uniqueness_passed"] = len(seen) == 6
    status["trust_material_present"] = not fail
    if not fail:
        status["status"] = "PUBLIC_TRUST_MATERIAL_PRESENT_NONAUTHORIZING"
    return status


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--trust-root", type=Path, default=ROOT)
    ap.add_argument("--ledger", type=Path, default=LEDGER)
    ap.add_argument("--witness", type=Path, default=WITNESS)
    args = ap.parse_args()
    report = verify(trust_root=args.trust_root, ledger=args.ledger,
                    witness=args.witness)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["trust_material_present"] else 2


if __name__ == "__main__":
    sys.exit(main())
