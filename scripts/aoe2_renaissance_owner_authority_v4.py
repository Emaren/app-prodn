#!/usr/bin/env python3
"""Owner-v4 two-phase cryptographic REVIEW protocol.

NOT a stage/activate CLI. This isolated protocol cannot start a website
deployment, issue a financial waiver, sign using private material, or infer
owner consent. External protected runtime dispatch is NOT wired here.
Never reuse v3 public trust path or nonce ledger.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets
import sqlite3
import stat
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from aoe2_renaissance_v4_scope import (
    FROZEN_BASE, FROZEN_TARGET, Hold, require,
)

POLICY = "aoe2war.solo-owner.renaissance.website.v4"
TRUST_PUBLIC = Path("/etc/aoe2war/website-owner-v4/owner.pem")
STATE_ROOT = Path("/var/lib/aoe2war-website-owner-v4")
SCHEMA = 4
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
NONCE = re.compile(r"[A-Za-z0-9_-]{24,96}\Z")
CONTEXT_KEYS = {
    "candidate_sha", "previous_production_sha", "inventory_sha256",
    "controller_commit_sha", "controller_code_sha256", "gate_sha256",
    "manifest_sha256", "observed_financial_runtime_sha256",
    "rollback_source_sha", "rollback_build_id", "artifact_sha256",
    "stage_receipt_sha256", "staged_next_build_id",
}


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=True,
                      allow_nan=False, separators=(",", ":")).encode("ascii")


def digest(value) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def timestamp(now) -> str:
    return now.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def moment(now=None):
    return datetime.now(timezone.utc) if now is None else now


def read_moment(raw):
    require(type(raw) is str and raw.endswith("Z"), "UTC time required")
    try:
        t = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise Hold("invalid UTC timestamp") from exc
    require(t.utcoffset() == timedelta(0), "non-UTC timestamp")
    return t


def check_context(ctx, phase):
    require(type(ctx) is dict and set(ctx) == CONTEXT_KEYS, "unreviewed context keys")
    require(ctx["candidate_sha"] == FROZEN_TARGET and
            ctx["previous_production_sha"] == FROZEN_BASE and
            ctx["rollback_source_sha"] == FROZEN_BASE, "wrong frozen website source/rollback")
    require(type(ctx["controller_commit_sha"]) is str and
            HEX40.fullmatch(ctx["controller_commit_sha"]) is not None,
            "controller commit missing")
    for key in ("inventory_sha256", "controller_code_sha256",
                "gate_sha256", "manifest_sha256",
                "observed_financial_runtime_sha256"):
        require(type(ctx[key]) is str and HEX64.fullmatch(ctx[key]) is not None and
                ctx[key] != "0" * 64, "invalid required review digest: " + key)
    require(type(ctx["rollback_build_id"]) is str and
            8 <= len(ctx["rollback_build_id"]) <= 128, "rollback BUILD_ID missing")
    if phase == "PRE_STAGE":
        require(all(ctx[key] is None for key in (
            "artifact_sha256", "stage_receipt_sha256", "staged_next_build_id")),
            "stage request invented future artifact")
    elif phase == "PRE_ACTIVATE":
        require(type(ctx["artifact_sha256"]) is str and
                HEX64.fullmatch(ctx["artifact_sha256"]) is not None and
                type(ctx["stage_receipt_sha256"]) is str and
                HEX64.fullmatch(ctx["stage_receipt_sha256"]) is not None and
                type(ctx["staged_next_build_id"]) is str and
                8 <= len(ctx["staged_next_build_id"]) <= 128,
                "activation requires actual bound artifact, receipt and BUILD_ID")
    else:
        raise Hold("unknown owner signature phase")


def public_fingerprint(key: Path, *, allow_test=False):
    require(key.is_absolute() and key.is_file() and not key.is_symlink() and
            not key.parent.is_symlink(), "v4 owner public key not enrolled")
    for entry in (key.parent, key):
        st = entry.stat()
        require(not st.st_mode & 0o022, "owner trust is group/world writable")
        require(allow_test or st.st_uid == 0, "owner trust must be root administered")
    data = key.read_bytes()
    require(b"PUBLIC KEY" in data and b"PRIVATE KEY" not in data and
            0 < len(data) <= 8192, "v4 trust not a bounded public key")
    normalized = subprocess.run(["openssl", "pkey", "-pubin", "-in", str(key),
                                 "-pubout", "-outform", "DER"],
                                capture_output=True, timeout=10, check=False)
    require(normalized.returncode == 0 and normalized.stdout, "invalid v4 owner public key")
    strength = subprocess.run(["openssl", "rsa", "-pubin", "-in", str(key),
                               "-text", "-noout"],
                              capture_output=True, timeout=10, check=False)
    match = re.search(rb"\((\d+) bit\)", strength.stdout)
    require(strength.returncode == 0 and match and int(match[1]) >= 2048,
            "minimum RSA 2048 v4 owner key")
    return hashlib.sha256(normalized.stdout).hexdigest()


def open_ledger(root: Path, *, allow_test=False):
    require(root.is_absolute() and root.is_dir() and not root.is_symlink() and
            root != Path("/var/lib/aoe2war-website-owner-v3"), "separate v4 ledger required")
    st = root.stat()
    require(st.st_uid == os.geteuid() and stat.S_IMODE(st.st_mode) == 0o700,
            "v4 ledger must be operator-owned 0700")
    parent = root.parent.stat()
    require(allow_test or (parent.st_uid == 0 and not parent.st_mode & 0o022),
            "v4 ledger parent not root protected")
    path = root / "owner-v4.sqlite3"
    require(not path.is_symlink(), "linked owner journal")
    if not path.exists():
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(fd)
    mode = path.stat()
    require(stat.S_ISREG(mode.st_mode) and mode.st_uid == os.geteuid() and
            stat.S_IMODE(mode.st_mode) == 0o600, "v4 journal must be private 0600")
    cx = sqlite3.connect(str(path), isolation_level=None, timeout=5)
    try:
        require(cx.execute("PRAGMA journal_mode=DELETE").fetchone()[0].lower() == "delete",
                "durable rollback journal required")
        cx.execute("PRAGMA synchronous=EXTRA")
        cx.execute("PRAGMA fullfsync=ON")
        require(cx.execute("PRAGMA synchronous").fetchone()[0] == 3 and
                cx.execute("PRAGMA fullfsync").fetchone()[0] == 1, "fsync durability absent")
        cx.execute("""CREATE TABLE IF NOT EXISTS requests_v4(
           attempt_id TEXT NOT NULL, phase TEXT NOT NULL, nonce TEXT UNIQUE NOT NULL,
           payload TEXT NOT NULL, state TEXT NOT NULL, packet_sha TEXT,
           protected_stage_result TEXT, PRIMARY KEY(attempt_id,phase))""")
    except BaseException:
        cx.close()
        raise
    return cx


def issue(ctx, phase, *, state_root=STATE_ROOT, public_key=TRUST_PUBLIC,
          now=None, attempt_id=None, allow_test=False):
    check_context(ctx, phase)
    current = moment(now)
    require(current.utcoffset() == timedelta(0), "UTC issuing clock required")
    identity = attempt_id or secrets.token_urlsafe(32)
    require(type(identity) is str and NONCE.fullmatch(identity) is not None,
            "invalid attempt identifier")
    require(phase != "PRE_STAGE" or attempt_id is None,
            "new PRE_STAGE requires new attempt")
    fp = public_fingerprint(public_key, allow_test=allow_test)
    cx = open_ledger(state_root, allow_test=allow_test)
    payload = {
        "kind": POLICY, "phase": phase, "attempt_id": identity,
        "nonce": secrets.token_urlsafe(32), "issued_at": timestamp(current),
        "expires_at": timestamp(current + timedelta(minutes=20)),
        "owner_pubkey_der_sha256": fp, "context": ctx,
        "source_scope_review_only": True, "dispatch_enabled": False,
        "financial_release_authorized": False, "custody_authorized": False,
        "wolo_source_p1_open": True,
    }
    try:
        cx.execute("BEGIN IMMEDIATE")
        if phase == "PRE_ACTIVATE":
            row = cx.execute("""SELECT state,protected_stage_result,payload
                               FROM requests_v4 WHERE attempt_id=? AND phase='PRE_STAGE'""",
                             (identity,)).fetchone()
            require(row is not None and row[0] == "PROTECTED_STAGE_COMPLETE" and row[1],
                    "no proven protected stage, cannot request activation")
            staged = json.loads(row[1])
            prev = json.loads(row[2])["context"]
            require(staged.get("status") == "STAGED" and
                    staged.get("artifact_sha256") == ctx["artifact_sha256"] and
                    staged.get("stage_receipt_sha256") == ctx["stage_receipt_sha256"] and
                    staged.get("staged_next_build_id") == ctx["staged_next_build_id"],
                    "stage artifact/receipt/build mismatch")
            for key in CONTEXT_KEYS - {"artifact_sha256", "stage_receipt_sha256",
                                        "staged_next_build_id"}:
                require(ctx[key] == prev[key], "source/observer/rollback changed after stage")
        cx.execute("""INSERT INTO requests_v4
                     (attempt_id,phase,nonce,payload,state)
                     VALUES (?,?,?,?, 'ISSUED')""",
                   (identity, phase, payload["nonce"], canonical(payload).decode("ascii")))
        cx.commit()
    except BaseException:
        cx.rollback()
        raise
    finally:
        cx.close()
    return payload


def verify_packet(packet, original, *, public_key=TRUST_PUBLIC, now=None, allow_test=False):
    require(type(packet) is dict and set(packet) == {"schema", "policy", "payload", "signature"} and
            type(packet["schema"]) is int and packet["schema"] == SCHEMA and
            packet["policy"] == POLICY and packet["payload"] == original,
            "wrong signature schema/payload/phase")
    p = original
    require(type(p) is dict and p.get("kind") == POLICY and
            p.get("dispatch_enabled") is False and
            p.get("source_scope_review_only") is True and
            p.get("financial_release_authorized") is False and
            p.get("custody_authorized") is False and
            p.get("wolo_source_p1_open") is True, "unauthorized role escalation")
    check_context(p["context"], p["phase"])
    current = moment(now)
    issued, expiry = read_moment(p["issued_at"]), read_moment(p["expires_at"])
    require(issued <= current < expiry and
            timedelta(0) < expiry - issued <= timedelta(minutes=20),
            "expired/future/overlong signature")
    require(public_fingerprint(public_key, allow_test=allow_test) ==
            p["owner_pubkey_der_sha256"], "wrong enrolled v4 owner")
    try:
        signature = base64.b64decode(packet["signature"], validate=True)
    except (ValueError, TypeError) as exc:
        raise Hold("signature encoding invalid") from exc
    require(32 <= len(signature) <= 8192, "bounded signature required")
    with tempfile.TemporaryDirectory(prefix="aoe2-v4-signature-verify-") as temp:
        raw, sig = Path(temp) / "payload", Path(temp) / "sig"
        raw.write_bytes(canonical(p))
        sig.write_bytes(signature)
        answer = subprocess.run(["openssl", "dgst", "-sha256", "-verify",
                                 str(public_key), "-signature", str(sig), str(raw)],
                                capture_output=True, timeout=10, check=False)
    require(answer.returncode == 0, "owner v4 signature invalid")
    return {"status": "OWNER_SIGNATURE_VALID_FOR_REVIEW_ONLY",
            "release_authorized": False, "dispatch_enabled": False}


def consume_review(packet, *, state_root=STATE_ROOT, public_key=TRUST_PUBLIC,
                   now=None, allow_test=False):
    """Durably consume signed REVIEW only; NEVER stage or activate."""
    p = packet.get("payload") if type(packet) is dict else None
    require(type(p) is dict and
            type(p.get("attempt_id")) is str and type(p.get("phase")) is str,
            "missing signed review identity")
    cx = open_ledger(state_root, allow_test=allow_test)
    try:
        cx.execute("BEGIN IMMEDIATE")
        row = cx.execute("SELECT state,payload FROM requests_v4 WHERE attempt_id=? AND phase=?",
                         (p["attempt_id"], p["phase"])).fetchone()
        require(row is not None and row[0] == "ISSUED",
                "already consumed/unknown v4 nonce — no retry")
        original = json.loads(row[1])
        verify_packet(packet, original, public_key=public_key, now=now,
                      allow_test=allow_test)
        packet_sha = digest(packet)
        require(cx.execute("""UPDATE requests_v4 SET state='REVIEW_CONSUMED',packet_sha=?
                              WHERE attempt_id=? AND phase=? AND state='ISSUED'""",
                           (packet_sha, p["attempt_id"], p["phase"])).rowcount == 1,
                "nonce consumption race")
        cx.commit()
    except BaseException:
        cx.rollback()
        raise
    finally:
        cx.close()
    return {"schema": SCHEMA, "policy": POLICY,
            "status": "SIGNED_REVIEW_CONSUMED_NOT_DISPATCHED",
            "owner_packet_sha256": packet_sha,
            "website_stage_performed": False, "website_activated": False,
            "financial_release_authorized": False}


def mark_protected_stage_complete(*args, **kwargs):
    """No public/manual completion path; protected v4 dispatcher not integrated."""
    raise Hold("v4 protected stage dispatcher and trusted completion receipt NOT WIRED")


def deploy(*args, **kwargs):
    raise Hold("v4 owner proof alone is NOT release authority; protected dispatch is HOLD")
