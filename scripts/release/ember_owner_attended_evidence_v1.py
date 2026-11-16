#!/usr/bin/env python3
"""Inert, offline evidence-shape checker. NOT an owner permit or root executor."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys

PINNED = {
    "schema": "aoe2war.ember.owner-attended-evidence.v1",
    "purpose": "NOVEMBER_NONFINANCIAL_RELEASE_ONLY",
    "authority_kind": "OWNER_ATTENDED_ROOT_MANUAL_EXCEPTION",
    "authority_state": "UNSIGNED_NOT_A_PERMIT",
    "actor": "owner-present-root-tty",
    "host": "ubuntu-4gb-hel1-11",
    "database": "aoe2hd_db",
    "source_commit": "f50ead889c6101115aaf678ebdfa70650b691552",
    "build_id": "eyhY43hMRs2EZknN3Cht3",
    "sql_apply_sha256": "3adf4296436fcb4d20a2261c7a12f0894b4df8aceadcb6e0e5d6f3a967c151e3",
    "sql_inverse_sha256": "65270456e8fd957019a84b617e5a86de901b1e69e61369272e260151358068ed",
    "writer_unit_sha256": "d231c8d0e3401717ea37991e93a63ec8394bfb6c4c8e56cd807c20fc1ed5e7b9",
    "runtime_archive_sha256": "3701674709ed759113445eb574882c00d41eeba79f5892f9f3bb0842feab53af",
    "independent_proof_sha256": "0811a74e190d1d9dfc0df848eb1e167bf8d33f3622d10d6847c634bb0678b8f3",
    "previous_web_root": "/var/lib/aoe2war-web-prod-e31e1c053a3b",
}
FORBIDDEN_AUTHORITY = (
    "financial_authorized", "funding_authorized",
    "factory_permit_claimed", "cryptographic_signature_claimed",
)
STATES = {"NOT_STARTED", "STAGED_NOT_EXECUTED", "PASS", "HOLD", "FAILED"}
STATUS_KEYS = ("sql_stage_status", "service_status", "factory_status")
REQUIRED = frozenset(PINNED) | frozenset(FORBIDDEN_AUTHORITY) | frozenset(STATUS_KEYS) | {
    "observed_utc", "evidence_sha256"
}

def unique(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError("DUPLICATE_JSON_FIELD")
        out[key] = value
    return out

def inspect(record):
    """Validate diagnostics only; result cannot be used as admission authority."""
    if type(record) is not dict or set(record) != REQUIRED:
        raise ValueError("HOLD_EXACT_FIELDS")
    for key, expected in PINNED.items():
        if record[key] != expected:
            raise ValueError("HOLD_PIN_" + key.upper())
    for key in FORBIDDEN_AUTHORITY:
        if record[key] is not False:
            raise ValueError("HOLD_FORBIDDEN_CLAIM_" + key.upper())
    for key in STATUS_KEYS:
        if type(record[key]) is not str or record[key] not in STATES:
            raise ValueError("HOLD_INVALID_STATUS_" + key.upper())
    if type(record["evidence_sha256"]) is not str or not re.fullmatch(r"[0-9a-f]{64}", record["evidence_sha256"]):
        raise ValueError("HOLD_EVIDENCE_DIGEST")
    try:
        stamp = datetime.fromisoformat(record["observed_utc"])
    except (TypeError, ValueError):
        raise ValueError("HOLD_TIMESTAMP") from None
    if stamp.tzinfo is None or stamp.utcoffset() is None:
        raise ValueError("HOLD_TIMESTAMP_TZ")
    if stamp.astimezone(timezone.utc).date().isoformat() != "2026-11-16":
        raise ValueError("HOLD_TIMESTAMP_DATE")
    return {
        "contract": "VALID_EVIDENCE_SHAPE_NOT_RELEASE_AUTHORITY",
        "source": PINNED["source_commit"],
        **{key: record[key] for key in STATUS_KEYS},
    }

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args(argv)
    path = args.evidence
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 16_384:
        print("HOLD_INVALID_FILE", file=sys.stderr)
        return 2
    try:
        raw = path.read_bytes()
        record = json.loads(raw, object_pairs_hook=unique)
        result = inspect(record)
    except (ValueError, UnicodeError) as exc:
        print("HOLD_" + str(exc), file=sys.stderr)
        return 2
    result["input_sha256"] = hashlib.sha256(raw).hexdigest()
    print(json.dumps(result, sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
