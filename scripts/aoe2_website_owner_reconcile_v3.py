#!/usr/bin/env python3
"""READ-ONLY reconciliation of a consumed solo-owner website v3 activation.

This tool NEVER calls stage, activate, finish_request, consume_request, issues a
nonce, writes the owner journal or certifies financial solvency. It compares the
durable single-use authorization, preserved protected-engine receipt and a
fresh authenticated runtime observation. A historical HOLD is never rewritten.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sqlite3
import stat
import subprocess
import tempfile
from pathlib import Path

import aoe2_website_owner_release_v3 as owner
from aoe2_website_owner_observer_v3 import observe, validate_observation
from aoe2_website_release_v2 import Hold, canonical, require

RECEIPT_DIRECTORY = Path(".aoe2war-release/activation-receipts")
STAGE_DIRECTORY = Path(".aoe2war-release/stage-receipts")


def _private_readonly_journal(state_root: Path, *, allow_test_root=False):
    require(state_root.is_absolute() and state_root.is_dir() and not state_root.is_symlink(),
            "owner journal directory unavailable/linked")
    info = state_root.stat()
    require(info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o700,
            "owner journal directory must be owner-private 0700")
    parent = state_root.parent.stat()
    require(allow_test_root or parent.st_uid == 0 and not parent.st_mode & 0o022,
            "owner journal parent not root protected")
    path = state_root / "owner-v3.sqlite3"
    require(path.is_file() and not path.is_symlink(), "owner journal unavailable/linked")
    info = path.stat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and
            stat.S_IMODE(info.st_mode) == 0o600, "owner journal not owner-only 0600")
    # mode=ro is important: no schema creation, nonce consumption, journal
    # initialization, PRAGMA journal_mode or fullfsync mutation in a recovery run.
    return sqlite3.connect("file:" + str(path) + "?mode=ro", uri=True, timeout=5)


def _read_canonical(path: Path, directory: Path) -> tuple[dict, str]:
    require(path.is_absolute() and not path.is_symlink() and path.is_file(),
            "receipt missing/linked/nonabsolute")
    require(not directory.is_symlink() and path.resolve(strict=True).parent ==
            directory.resolve(strict=True), "receipt outside canonical operator directory")
    require(path.stat().st_size <= 512 * 1024, "receipt exceeds bounded size")
    raw = path.read_bytes()
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise Hold("invalid protected JSON receipt") from exc
    require(type(value) is dict, "protected receipt must be a JSON object")
    return value, hashlib.sha256(raw).hexdigest()


def _verify_consumed_owner_signature(packet: dict, public_key: Path, *, allow_test_root=False):
    """Cryptographically verify archived packets even after their expiry.

    Signature expiry is an issue/dispatch deadline, not a prohibition against
    historical forensic verification after successful consumption.
    """
    payload = packet.get("payload")
    require(type(payload) is dict and packet.get("schema") == 3 and
            packet.get("policy") == owner.POLICY_ID and
            set(packet) == {"schema", "policy", "payload", "signature"},
            "unrecognized owner signature packet")
    require(owner.load_owner_key(public_key, allow_test_root=allow_test_root) ==
            payload.get("owner_key_sha256"), "owner key fingerprint mismatch")
    try:
        signature = base64.b64decode(packet["signature"], validate=True)
    except (ValueError, TypeError) as exc:
        raise Hold("malformed archived owner signature") from exc
    require(32 <= len(signature) <= 8192, "archived owner signature invalid length")
    with tempfile.TemporaryDirectory(prefix="aoe2-owner-v3-forensic-") as tmp:
        message, signed = Path(tmp) / "message", Path(tmp) / "sig"
        message.write_bytes(canonical(payload))
        signed.write_bytes(signature)
        proc = subprocess.run(
            ["openssl", "dgst", "-sha256", "-verify", str(public_key),
             "-signature", str(signed), str(message)],
            capture_output=True, timeout=10, check=False)
    require(proc.returncode == 0, "archived owner signature does not verify")


def reconcile(*, candidate_repo: Path, packet_path: Path, stage_receipt: Path,
              activation_receipt: Path, state_root: Path = owner.STATE_ROOT,
              public_key: Path = owner.PUBLIC_KEY, observer=observe,
              allow_test_root=False, observation_now=None) -> dict:
    require(not candidate_repo.is_symlink(), "linked candidate root")
    repo = candidate_repo.resolve(strict=True)
    require(packet_path.is_absolute() and packet_path.is_file() and
            not packet_path.is_symlink() and packet_path.stat().st_size <= 512 * 1024,
            "signed packet unavailable/linked/oversized")
    try:
        packet = json.loads(packet_path.read_bytes())
    except (UnicodeError, ValueError) as exc:
        raise Hold("signed packet is malformed") from exc
    require(type(packet) is dict and type(packet.get("payload")) is dict,
            "invalid archived owner packet")
    p, ctx = packet["payload"], packet["payload"].get("context")
    require(p.get("phase") == "PRE_ACTIVATE" and type(ctx) is dict,
            "not a PRE_ACTIVATE owner packet")
    owner.check_context(ctx, "PRE_ACTIVATE")
    require(p.get("financial_release_authorized") is False and
            p.get("custody_authorized") is False and p.get("wolo_source_p1_open") is True and
            p.get("same_owner_observation_not_independent") is True,
            "archived owner packet asserts unauthorized financial authority")
    require(ctx["rollback"]["build_id"] == ctx["runtime_observation"]["website"]["build_id"],
            "archive rollback BUILD_ID not tied to signed live origin")
    _verify_consumed_owner_signature(packet, public_key, allow_test_root=allow_test_root)

    with _private_readonly_journal(state_root, allow_test_root=allow_test_root) as db:
        rows = db.execute(
            "SELECT phase,state,payload,packet_sha,result FROM requests_v3 "
            "WHERE attempt_id=? ORDER BY phase", (p["attempt_id"],)).fetchall()
    require(len(rows) == 2 and {r[0] for r in rows} == {"PRE_STAGE", "PRE_ACTIVATE"},
            "stage/activation phase lineage missing")
    by_phase = {r[0]: r for r in rows}
    stage_row, activation_row = by_phase["PRE_STAGE"], by_phase["PRE_ACTIVATE"]
    require(stage_row[1] == "COMPLETE" and stage_row[4] is not None,
            "original stage is not COMPLETE")
    require(activation_row[1] == "CONSUMED" and activation_row[4] is None,
            "not a historically consumed, incomplete activation")
    require(json.loads(activation_row[2]) == p and
            activation_row[3] == owner.digest(packet),
            "durable owner authorization packet identity mismatch")

    stage, stage_sha = _read_canonical(stage_receipt, repo / STAGE_DIRECTORY)
    certified, certified_sha = _read_canonical(activation_receipt, repo / RECEIPT_DIRECTORY)
    require(stage_receipt.name ==
            ctx["candidate_sha"] + "-" + ctx["artifact_sha256"][:12] + ".json" and
            activation_receipt.name == stage_receipt.name,
            "activation/stage receipt naming differs from exact artifact")
    require(stage_sha == ctx["stage_receipt_sha256"] and
            stage.get("status") == "STAGED" and stage.get("release_sha") == ctx["candidate_sha"] and
            stage.get("artifact_sha256") == ctx["artifact_sha256"] and
            stage.get("staged_build_id") == ctx["build_id"] and
            stage.get("previous_production_sha") == ctx["previous_production_sha"] and
            stage.get("wolo_mutated") is False and stage.get("live_runtime_mutated") is False,
            "stage evidence disagrees with consumed signed authority")
    prior_result = json.loads(stage_row[4])
    require(prior_result.get("status") == "STAGED" and
            prior_result.get("artifact_sha256") == ctx["artifact_sha256"] and
            prior_result.get("staged_build_id") == ctx["build_id"] and
            prior_result.get("local_receipt_sha256") == stage_sha,
            "durable COMPLETE stage result disagrees with real artifact")
    require(certified.get("schema") == 1 and
            certified.get("kind") == "aoe2war-activation-result" and
            certified.get("status") == "CERTIFIED" and
            certified.get("release_sha") == ctx["candidate_sha"] and
            certified.get("previous_production_sha") == ctx["previous_production_sha"] and
            certified.get("stage_receipt_sha256") == stage_sha and
            certified.get("artifact_sha256") == ctx["artifact_sha256"] and
            certified.get("active_build_id") == ctx["build_id"] and
            certified.get("previous_build_id") == ctx["rollback"]["build_id"] and
            certified.get("manifest_sha256") == ctx["manifest_sha256"] and
            certified.get("gate_sha256") == ctx["gate_sha256"] and
            certified.get("wolo_mutated") is False and
            type(certified.get("soak_samples")) is int and certified["soak_samples"] > 0,
            "protected CERTIFIED artifact receipt does not match signed authority")

    current = observer()
    validate_observation(current, now=observation_now)
    current_identity = owner.stable_financial_runtime_identity(current["immutable"])
    approved_identity = owner.stable_financial_runtime_identity(ctx["runtime_observation"]["immutable"])
    changed = current_identity != approved_identity
    live = current["website"]
    require(live.get("source_sha") == ctx["candidate_sha"] and
            live.get("build_id") == ctx["build_id"],
            "live website does not match certified activated candidate")
    require(not changed, "financial/Wolo runtime boundary differs from approved PRE_ACTIVATE state")

    return {
        "schema": 1, "policy": owner.POLICY_ID,
        "status": "LIVE_PROTECTED_CERTIFIED_OUTER_OWNER_HOLD_PRESERVED",
        "owner_journal": {"PRE_STAGE": "COMPLETE", "PRE_ACTIVATE": "CONSUMED"},
        "archive_owner_signature_verified": True, "live_observer_independent": False,
        "candidate_sha": ctx["candidate_sha"], "build_id": ctx["build_id"],
        "staged_artifact_sha256": ctx["artifact_sha256"],
        "activation_receipt_sha256": certified_sha,
        "runtime_financial_boundary_matches_signed_reference_now": True,
        "historical_postactivation_drift_explained": False,
        "nonce_journal_modified": False, "website_mutated": False,
        "wolo_mutated_by_reconciliation": False,
        "financial_release_authorized": False, "custody_authorized": False,
        "wolo_source_p1_open": True,
        "next_action": "Preserve original controller HOLD; examine read-only timed one-shot/Wolo journal evidence. No retry or journal state rewrite."
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--candidate-repo", type=Path, required=True)
    ap.add_argument("--packet", type=Path, required=True)
    ap.add_argument("--stage-receipt", type=Path, required=True)
    ap.add_argument("--activation-receipt", type=Path, required=True)
    args = ap.parse_args()
    try:
        result = reconcile(candidate_repo=args.candidate_repo, packet_path=args.packet,
                           stage_receipt=args.stage_receipt, activation_receipt=args.activation_receipt)
    except (Hold, OSError, ValueError, KeyError, TypeError, sqlite3.Error,
            subprocess.SubprocessError) as exc:
        result = {"status": "HOLD", "reason": str(exc),
                  "nonce_journal_modified": False, "website_mutated": False,
                  "financial_release_authorized": False, "custody_authorized": False}
        print(json.dumps(result, indent=2, sort_keys=True))
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
