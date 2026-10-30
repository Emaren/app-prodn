#!/usr/bin/env python3
"""Versioned solo-owner website admission verifier. NO deployment wiring.

This is a review-only cryptographic/policy primitive. It never issues a key,
challenges, authorization, nonce-consumption receipt, or stage/activation.
Host observations MUST come from a separately reviewed authenticated HEL1
transport, not an operator-supplied JSON or an admin browser.
"""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import stat
import subprocess
import tempfile

POLICY = "aoe2war.solo-owner.website.admission.v1"
DOMAIN = b"AOE2WAR.SOLO_OWNER.WEBSITE.ADMISSION.V1\n"
W1 = "b46a51f1592c9f296839924ae55e722618b10d35"
POST_W1 = "fa5c350b35cba7ace8d4515a7ad52ba4e1534295"
OLD = "33e0f42b3d34d324b6cbab6c0347d4f5aff6fb8a"
TRAINS = {"W1": (W1, OLD), "POST_W1": (POST_W1, W1)}
OWNER_PUBLIC = Path("/private/etc/aoe2war/website-owner-v4/owner.pem")
OWNER_SPKI_SHA256 = "3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"
OPENSSL = "/opt/homebrew/opt/openssl@3/bin/openssl"
HEX64 = re.compile(r"[a-f0-9]{64}\Z")
BUILD = re.compile(r"[A-Za-z0-9_-]{8,128}\Z")
CLASSES = sorted(("APP_DB", "TRAFFIC_SQLITE_WAL", "WOLO_CONSENSUS_FINANCE",
                  "LOOP4_FINANCIAL", "WATCHER_REPLAY_MEDIA", "RELEASE_ROLLBACK_CONFIG"))
FIELDS = {
    "phase", "train", "candidate_sha", "previous_sha", "attempt_id",
    "nonce", "lease_id", "issued_at", "expires_at",
    "manifest_sha256", "gate_sha256", "scope_sha256",
    "active_build_id", "rollback_build_id", "host_observation_sha256",
    "finance_fingerprint_sha256", "financial_movement_authorized",
    "custody_authorized", "migration_paths", "stage_receipt_sha256",
    "staged_build_id", "pre_stage_packet_sha256",
}


class Hold(Exception):
    pass


def check(ok, reason):
    if not ok:
        raise Hold("SOLO_WEBSITE_HOLD: " + reason)


def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def _unique(pairs):
    result = {}
    for key, value in pairs:
        check(key not in result, "duplicate JSON property")
        result[key] = value
    return result


def parse(raw):
    check(0 < len(raw) <= 262144, "bad JSON length")
    try:
        obj = json.loads(raw, object_pairs_hook=_unique,
                         parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError, UnicodeError, TypeError) as exc:
        raise Hold("SOLO_WEBSITE_HOLD: malformed JSON") from exc
    check(type(obj) is dict, "JSON must be object")
    return obj


def moment(value):
    check(type(value) is str and value.endswith("Z"), "UTC timestamp missing")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise Hold("SOLO_WEBSITE_HOLD: malformed timestamp") from exc
    check(result.utcoffset() == timedelta(0), "timestamp not UTC")
    return result


def trusted_owner_public(key=OWNER_PUBLIC):
    """Reuse legitimate owner-v4 RSA public identity, not its used permits."""
    check(key.is_absolute(), "relative trust key")
    try:
        for part in (key, *key.parents):
            check(not part.is_symlink(), "trusted symlink")
            s = part.stat()
            check(s.st_uid == 0 and not (s.st_mode & 0o022),
                  "trust not root administered")
        s = key.stat()
        check(stat.S_ISREG(s.st_mode) and 0 < s.st_size <= 16384, "bad PEM")
        result = subprocess.run(
            [OPENSSL, "pkey", "-pubin", "-in", str(key), "-outform", "DER"],
            capture_output=True, timeout=10, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Hold("SOLO_WEBSITE_HOLD: owner trust unavailable") from exc
    check(result.returncode == 0 and bool(result.stdout), "owner PEM invalid")
    check(digest(result.stdout) == OWNER_SPKI_SHA256, "owner key mismatch")


def verify_owner_signature(signed, *, key=OWNER_PUBLIC):
    check(type(signed) is dict and
          set(signed) == {"schema", "policy", "payload", "signature_base64"} and
          type(signed["schema"]) is int and signed["schema"] == 1 and
          signed["policy"] == POLICY and type(signed["payload"]) is dict,
          "invalid owner envelope")
    try:
        sig = base64.b64decode(signed["signature_base64"], validate=True)
    except (ValueError, TypeError, KeyError) as exc:
        raise Hold("SOLO_WEBSITE_HOLD: owner signature missing") from exc
    check(64 <= len(sig) <= 8192, "signature length")
    trusted_owner_public(key)
    with tempfile.TemporaryDirectory(prefix="solo-website-verify-") as temp:
        data, signature = Path(temp) / "data", Path(temp) / "sig"
        data.write_bytes(DOMAIN + canonical(signed["payload"]))
        signature.write_bytes(sig)
        result = subprocess.run(
            [OPENSSL, "dgst", "-sha256", "-verify", str(key),
             "-signature", str(signature), str(data)],
            capture_output=True, timeout=10, check=False)
    check(result.returncode == 0, "owner signature verification failed")


def verify_inputs(signed, manifest_raw, gate_raw, observe_hel1, *,
                  previous_stage=None, stage_receipt=None, now=None):
    """Only a trusted controller may supply observe_hel1 (live SSH/lease reader).

    Returns NOT_AUTHORIZED. It does NOT consume nonce or alter any service.
    A reviewed controller must also verify the true gate verdict, host
    observation source, immutable stage receipt and atomic lease.
    """
    check(type(signed) is dict and type(signed.get("payload")) is dict,
          "signed intent absent")
    p = signed["payload"]
    check(set(p) == FIELDS and p.get("phase") in ("PRE_STAGE", "PRE_ACTIVATE")
          and p.get("train") in TRAINS, "intent schema or phase")
    target, previous = TRAINS[p["train"]]
    check(p["candidate_sha"] == target and p["previous_sha"] == previous,
          "candidate not exact accepted release")
    check(all(type(p[k]) is str and HEX64.fullmatch(p[k]) for k in (
          "attempt_id", "nonce", "lease_id", "manifest_sha256",
          "gate_sha256", "scope_sha256", "host_observation_sha256",
          "finance_fingerprint_sha256")), "digest or nonce missing")
    check(all(type(p[k]) is str and BUILD.fullmatch(p[k]) for k in
              ("active_build_id", "rollback_build_id")), "BUILD_ID missing")
    check(p["financial_movement_authorized"] is False and
          p["custody_authorized"] is False and p["migration_paths"] == [],
          "finance or migrations not website-only")
    now = now or datetime.now(timezone.utc)
    issued, expires = moment(p["issued_at"]), moment(p["expires_at"])
    check(now.utcoffset() == timedelta(0) and
          timedelta(0) < expires - issued <= timedelta(minutes=10) and
          issued <= now <= expires, "expired or future owner approval")
    manifest = parse(manifest_raw)
    check(digest(manifest_raw) == p["manifest_sha256"] and
          digest(gate_raw) == p["gate_sha256"] and len(gate_raw) > 0,
          "unbound manifest or gate")
    check(manifest.get("release_sha") == target and
          manifest.get("previous_production_sha") == previous and
          manifest.get("scope_sha256") == p["scope_sha256"] and
          manifest.get("migration_paths") == [] and
          type(manifest.get("changed_files")) is list and
          all(type(f) is str and not f.startswith("prisma/")
              for f in manifest["changed_files"]), "unknown source or migration")
    check(callable(observe_hel1), "authenticated HEL1 observer absent")
    h, challenge = observe_hel1()
    check(type(h) is dict and type(challenge) is dict, "no HEL1 receipt")
    check(digest(canonical(h)) == p["host_observation_sha256"] and
          challenge.get("policy") == POLICY and
          challenge.get("phase") == p["phase"] and
          challenge.get("attempt_id") == p["attempt_id"] and
          challenge.get("nonce") == p["nonce"] and
          challenge.get("lease_id") == p["lease_id"] and
          challenge.get("candidate_sha") == target,
          "host receipt or root challenge substitution")
    check(h.get("origin") == "AUTHENTICATED_HEL1_ROOT_SSH" and
          h.get("host") == "ubuntu-4gb-hel1-11" and
          h.get("source_sha") == previous and
          h.get("build_id") == p["active_build_id"] and
          h.get("rollback_build_id") == p["rollback_build_id"] and
          h.get("rollback_available") is True and
          h.get("web_service") == "active", "host/source/rollback mismatch")
    check(timedelta(0) <= now - moment(h.get("observed_at")) <=
          timedelta(seconds=120), "host reading stale")
    check(type(h.get("free_bytes")) is int and h["free_bytes"] >= 30 * 2**30 and
          type(h.get("effective_used_pct")) in (int, float) and
          h["effective_used_pct"] <= 88 and
          type(h.get("finish_used_pct")) in (int, float) and
          h["finish_used_pct"] < 92, "HEL1 physical capacity HOLD")
    check(h.get("doctor_p0") == 0 and h.get("doctor_p1") == 0 and
          h.get("doctor_signed") is True and
          h.get("recovery_verified_classes") == CLASSES and
          h.get("independent_restore_verdict") == "PHYSICALLY_ACCEPTED",
          "Doctor or six independently restored classes HOLD")
    check(h.get("wolo_finance_p1") == "HOLD" and
          h.get("financial_movement_authorized") is False and
          h.get("finance_fingerprint_sha256") == p["finance_fingerprint_sha256"] and
          type(h.get("protected_8092_pid")) is int and
          h["protected_8092_pid"] > 1 and
          type(h.get("protected_8093_pid")) is int and
          h["protected_8093_pid"] > 1, "protected finance witness HOLD")
    if p["phase"] == "PRE_STAGE":
        check(previous_stage is None and stage_receipt is None and
              all(p[k] is None for k in (
                  "stage_receipt_sha256", "staged_build_id",
                  "pre_stage_packet_sha256")), "pre-stage invents artifact")
    else:
        check(type(previous_stage) is dict and type(stage_receipt) is dict,
              "activation missing actual stage")
        prior = previous_stage.get("payload")
        check(type(prior) is dict and
              prior.get("phase") == "PRE_STAGE" and
              prior.get("attempt_id") == p["attempt_id"] and
              prior.get("train") == p["train"] and
              prior.get("nonce") != p["nonce"] and
              prior.get("lease_id") == p["lease_id"] and
              prior.get("finance_fingerprint_sha256") ==
              p["finance_fingerprint_sha256"], "phase chain mismatch")
        check(type(p["stage_receipt_sha256"]) is str and
              digest(canonical(stage_receipt)) == p["stage_receipt_sha256"] and
              p["staged_build_id"] == stage_receipt.get("staged_build_id") and
              p["staged_build_id"] == h.get("staged_build_id") and
              p["pre_stage_packet_sha256"] == digest(canonical(previous_stage)),
              "stage receipt/artifact/BUILD_ID mismatch")
    verify_owner_signature(signed)
    return {"status": "INPUTS_VERIFIED_ONLY_NOT_AUTHORIZED",
            "phase": p["phase"], "train": p["train"],
            "candidate_sha": target, "owner_nonce": p["nonce"],
            "host_lease_and_nonce_consumed": False,
            "financial_release_authorized": False}
