#!/usr/bin/env python3
"""Mac-only owner-v5 Ed25519 RETIRE_STAGE_ONLY signer. No SSH or APPLY.

Inputs: actual root HEL1 --preview captured over authenticated, host-pinned SSH;
owner's existing private key, independently accepted owner-SPKI and controller
SHA-256. Never uploads the private key or auto-installs a signed permit.
"""
from __future__ import annotations

import argparse
import base64
import getpass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile

TARGET = "ade91ac70bbab9866012a1a05b6a842bb5c0b515"
APP = "/var/www/AoE2HDBets/app-prodn"
ARCHIVE = "/var/www/AoE2HDBets/.aoe2war-preserved-stages"
LOCK = "/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock"
DOMAIN = b"AOE2WAR.RETIRE_STAGE_ONLY.V1\n"
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
EVIDENCE_KEYS = frozenset({
    "old_source_sha", "old_build_id", "old_artifact_sha256",
    "old_dependency_sha256", "stage_status_sha256", "manifest_sha256",
    "gate_sha256", "stage_receipt_sha256", "stage_receipt_dir",
    "live_source_sha", "live_build_id", "machine_id_sha256",
})


def check(ok, message):
    if not ok:
        raise ValueError(message)


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        check(key not in result, "duplicate JSON field")
        result[key] = value
    return result


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def owner_public_identity(private_key, *, passphrase=None):
    args = ["openssl", "pkey", "-in", str(private_key), "-pubout", "-outform", "DER"]
    if passphrase is not None:
        args += ["-passin", "fd:0"]
    p = subprocess.run(
        args, input=None if passphrase is None else (passphrase + "\n").encode(),
        capture_output=True, timeout=15, check=False,
    )
    check(p.returncode == 0 and bool(p.stdout), "owner private key unusable")
    return hashlib.sha256(p.stdout).hexdigest()


def sign_preview(preview, *, private_key, expected_owner_spki, expected_controller,
                 now=None, nonce=None, passphrase=None):
    check(isinstance(preview, dict) and preview.get("status") == "PREVIEW_ONLY" and
          preview.get("authorization") == "HOLD_NOT_CONSUMED",
          "not an actual nonmutating HEL1 root preview")
    check(preview.get("approved_target_sha") == TARGET, "unapproved website target")
    check(HEX64.fullmatch(expected_owner_spki) is not None and
          preview.get("owner_spki_sha256") == expected_owner_spki,
          "preview owner key does not match independently approved SPKI")
    check(HEX64.fullmatch(expected_controller) is not None and
          preview.get("controller_sha256") == expected_controller,
          "HEL1 installed controller is not source-pinned")
    evidence = preview.get("evidence")
    check(isinstance(evidence, dict) and set(evidence) == EVIDENCE_KEYS,
          "incomplete/extra stage evidence")
    check(evidence.get("old_source_sha") ==
          "14ce71045150fcad4a25f0e3c3858c1c3cc7aab6" and
          evidence.get("old_build_id") == "u842UVpDjLRLz-paxPv2U" and
          evidence.get("old_artifact_sha256") ==
          "b3d2705478f35b5e247ae7e2f55e6588bd24654e6a4248e9f68abc712a7ce25a" and
          evidence.get("old_dependency_sha256") ==
          "cb143d07fffdb7e0a73cf0d3916e1e7cf09607556ae24c613d7ed032b5076aff",
          "old stage evidence changed")
    check(owner_public_identity(private_key, passphrase=passphrase) == expected_owner_spki,
          "owner private key does not match independently approved public key")
    moment = now or datetime.now(timezone.utc)
    check(moment.tzinfo is not None and moment.utcoffset().total_seconds() == 0,
          "signer time must be UTC")
    token = nonce or secrets.token_urlsafe(32)
    check(re.fullmatch(r"[A-Za-z0-9_-]{32,96}", token) is not None,
          "invalid fresh nonce")
    payload = {
        "kind": "aoe2war.retire-stage-only.v1",
        "action": "PARK_ONLY",
        "nonce": token,
        "controller_sha256": expected_controller,
        "no_publish_stage_activate": True,
        "funded_wolo_authorized": False,
        "intended_release_sha": TARGET,
        "source_stage_path": APP + "/.next-release",
        "dependency_stage_path": APP + "/.node_modules-release",
        "archive_root": ARCHIVE,
        "global_lock_path": LOCK,
        "issued_at": moment.isoformat().replace("+00:00", "Z"),
        "expires_at": (moment + timedelta(minutes=10)).isoformat().replace("+00:00", "Z"),
        **evidence,
    }
    with tempfile.TemporaryDirectory(prefix="aoe2war-owner-sign-") as tmp:
        msg, signature = Path(tmp) / "message", Path(tmp) / "signature"
        msg.write_bytes(DOMAIN + canonical(payload))
        cmd = ["openssl", "pkeyutl", "-sign", "-rawin",
               "-inkey", str(private_key), "-in", str(msg), "-out", str(signature)]
        if passphrase is not None:
            cmd += ["-passin", "fd:0"]
        p = subprocess.run(cmd,
                           input=None if passphrase is None else (passphrase + "\n").encode(),
                           capture_output=True, timeout=15, check=False)
        check(p.returncode == 0, "Ed25519 signing failed")
        sig = signature.read_bytes()
        check(len(sig) == 64, "unexpected Ed25519 signature length")
    return {"payload": payload, "signature_base64": base64.b64encode(sig).decode("ascii")}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--preview-file", type=Path, required=True)
    ap.add_argument("--owner-private", type=Path, required=True)
    ap.add_argument("--approved-owner-spki-sha256", required=True)
    ap.add_argument("--installed-controller-sha256", required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    check(args.owner_private.is_file() and not args.owner_private.is_symlink(),
          "owner private key file missing or linked")
    with args.owner_private.open("rb") as key:
        header = key.readline().strip()
    check(header in (b"-----BEGIN ENCRYPTED PRIVATE KEY-----",
                     b"-----BEGIN PRIVATE KEY-----"),
          "unsupported private key format")
    preview = json.loads(args.preview_file.read_text(), object_pairs_hook=unique_pairs)
    passphrase = None
    if header == b"-----BEGIN ENCRYPTED PRIVATE KEY-----":
        passphrase = getpass.getpass("Owner-v5 private-key passphrase (Mac only): ")
        check(len(passphrase) > 0, "empty owner-v5 passphrase")
    packet = sign_preview(
        preview, private_key=args.owner_private,
        expected_owner_spki=args.approved_owner_spki_sha256,
        expected_controller=args.installed_controller_sha256,
        passphrase=passphrase,
    )
    # Exclusive local creation; never overwrite, print the signature, or upload.
    fd = os.open(args.out, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as out:
        out.write(canonical(packet) + b"\n")
        out.flush()
        os.fsync(out.fileno())
    print("PASS: signed fresh RETIRE_STAGE_ONLY permit saved privately:", args.out)
    print("Nonce:", packet["payload"]["nonce"])


if __name__ == "__main__":
    main()
