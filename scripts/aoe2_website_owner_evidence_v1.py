#!/usr/bin/env python3
"""Private append-only observations and NONAUTHORIZING website reconciliation.

This module never dispatches, signs, consumes, completes or repairs an owner
request. The historical nonce ledger remains the sole authorization history.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import stat

from aoe2_website_release_v2 import Hold, canonical, require, utc_time

MAX_BYTES = 4 * 1024 * 1024
EVENTS = frozenset({"before-dispatch", "dispatch-starting", "dispatch-returned",
                    "dispatch-uncertain", "dispatch-refused", "after-dispatch", "verification-held", "verification-passed"})


def differences(before, after, path=""):
    """Deterministic JSON-pointer differences over the already validated scope."""
    if type(before) is dict and type(after) is dict:
        rows = []
        for key in sorted(set(before) | set(after)):
            pointer = path + "/" + key.replace("~", "~0").replace("/", "~1")
            if key not in before or key not in after:
                rows.append({"path": pointer, "before_present": key in before, "after_present": key in after,
                             "before": before.get(key), "after": after.get(key)})
            else:
                rows.extend(differences(before[key], after[key], pointer))
        return rows
    if type(before) is not type(after) or before != after:
        return [{"path": path or "/", "before": before, "after": after}]
    return []


def _sync(fd):
    os.fsync(fd)
    if os.sys.platform == "darwin":
        import fcntl
        # F_FULLFSYNC also asks macOS to flush the device's volatile cache.
        fcntl.fcntl(fd, 51)


def _private_dir(fd):
    info = os.fstat(fd)
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid() and
            stat.S_IMODE(info.st_mode) == 0o700, "evidence directory must be private operator-owned 0700")


def append_event(state_root: Path, attempt_id: str, phase: str, event: str, data: dict, *, source_sha: str):
    """Durable no-replace publication; repeated identical events are idempotent.

    Only observations/digests/protected results belong here, never environment
    contents, credentials or signing material. A full/unwritable disk HOLDS
    before dispatch; after dispatch the consumed nonce still prevents replay.
    """
    require(type(attempt_id) is str and re.fullmatch(r"[A-Za-z0-9_-]{16,96}", attempt_id) is not None and
            phase in {"PRE_STAGE", "PRE_ACTIVATE"} and event in EVENTS and
            type(source_sha) is str and re.fullmatch(r"[0-9a-f]{40}", source_sha) is not None,
            "invalid evidence event identity")
    require(state_root.is_absolute() and not state_root.is_symlink() and not state_root.parent.is_symlink(),
            "linked evidence root")
    raw = canonical({"schema": 1, "kind": "aoe2war-owner-operation-evidence-v1",
                     "controller_source_sha": source_sha,
                     "evidence_code_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                     "attempt_id": attempt_id, "phase": phase, "event": event, "data": data,
                     "financial_release_authorized": False, "observation_independent": False})
    require(len(raw) <= MAX_BYTES, "evidence event exceeds size limit")
    fd = os.open(state_root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        _private_dir(fd)
        for name in ("evidence-v1", attempt_id, phase):
            try:
                os.mkdir(name, 0o700, dir_fd=fd)
                os.fsync(fd)
            except FileExistsError:
                pass
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
            _private_dir(fd)
        name = "event-" + event + "-" + hashlib.sha256(raw).hexdigest() + ".json"
        temp = ".pending-" + secrets.token_hex(16)
        out = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
        try:
            with os.fdopen(out, "wb") as stream:
                stream.write(raw)
                stream.flush()
                _sync(stream.fileno())
            try:
                os.link(temp, name, src_dir_fd=fd, dst_dir_fd=fd, follow_symlinks=False)
            except FileExistsError:
                existing = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd)
                with os.fdopen(existing, "rb") as stream:
                    info = os.fstat(stream.fileno())
                    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and
                            stat.S_IMODE(info.st_mode) == 0o600 and stream.read(MAX_BYTES + 1) == raw,
                            "immutable evidence event differs")
            os.fsync(fd)
        finally:
            os.unlink(temp, dir_fd=fd)
            os.fsync(fd)
        return {"event": event, "sha256": hashlib.sha256(raw).hexdigest(), "filename": name}
    finally:
        os.close(fd)


def read_bounded_json(path: Path):
    require(path.is_absolute() and not path.is_symlink() and not path.parent.is_symlink(), "linked evidence file")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        require(stat.S_ISREG(os.fstat(stream.fileno()).st_mode), "evidence must be a regular file")
        raw = stream.read(MAX_BYTES + 1)
    require(0 < len(raw) <= MAX_BYTES, "evidence file exceeds size limit")
    from aoe2_website_protected_release_v2 import strict_json_bytes
    return strict_json_bytes(raw), hashlib.sha256(raw).hexdigest()


def reconcile(packet: dict, receipt_path: Path | None, receipt_sha256: str | None,
              current: dict, *, state_root: Path, public_key: Path, now=None, allow_test_root=False):
    """Read-only consistency assessment, including expired HISTORICAL signatures.

    The archived signature is checked at its signed issuance time solely to
    authenticate the already-consumed journal entry. It grants no new permit.
    Current runtime evidence must separately pass the normal fresh observer.
    """
    import aoe2_website_owner_release_v3 as auth
    from aoe2_website_owner_observer_v3 import validate_observation
    require(type(packet) is dict and type(packet.get("payload")) is dict and type(current) is dict,
            "malformed reconciliation packet/observation")
    p = packet["payload"]
    require(p.get("phase") == "PRE_ACTIVATE", "reconciliation requires the historical activation packet")
    db = state_root / "owner-v3.sqlite3"
    require(db.is_absolute() and not db.is_symlink() and not state_root.is_symlink(), "linked nonce ledger")
    info = db.stat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and
            stat.S_IMODE(info.st_mode) == 0o600, "nonce ledger must remain private operator-owned 0600")
    # Do not call auth._connection: it creates tables and changes durability
    # pragmas. mode=ro and query_only prohibit ledger updates even on errors.
    cx = sqlite3.connect(db.as_uri() + "?mode=ro", uri=True, timeout=5)
    try:
        cx.execute("PRAGMA query_only=ON")
        row = cx.execute("SELECT payload,state,packet_sha,result FROM requests_v3 WHERE attempt_id=? AND phase=?",
                         (p.get("attempt_id"), "PRE_ACTIVATE")).fetchone()
    finally:
        cx.close()
    require(row is not None and row[1] in {"CONSUMED", "COMPLETE"} and row[2] == auth.digest(packet),
            "unknown, unconsumed or different historical owner packet")
    auth.verify_packet(packet, public_key=public_key, issued_payload=json.loads(row[0]),
                       now=utc_time(p["issued_at"]), allow_test_root=allow_test_root)
    context = p["context"]
    reference = context["runtime_observation"]
    validate_observation(reference, now=utc_time(reference["observed_at"]))
    receipt = None
    if receipt_path is not None:
        receipt, actual = read_bounded_json(receipt_path)
        require(auth.hex_value(receipt_sha256) and actual == receipt_sha256, "protected receipt checksum mismatch")
        require(receipt.get("kind") == "aoe2war-activation-result" and receipt.get("status") == "CERTIFIED" and
                receipt.get("release_sha") == context["candidate_sha"] and receipt.get("wolo_mutated") is False and
                receipt.get("active_build_id") == context["build_id"] and
                receipt.get("artifact_sha256") == context["artifact_sha256"] and
                receipt.get("manifest_sha256") == context["manifest_sha256"] and
                receipt.get("gate_sha256") == context["gate_sha256"] and
                receipt.get("stage_receipt_sha256") == context["stage_receipt_sha256"] and
                receipt.get("previous_production_sha") == context["previous_production_sha"] and
                receipt.get("previous_build_id") == context["rollback"]["build_id"],
                "protected receipt differs from the consumed owner context")
    comparison, diff, runtime, error = "UNKNOWN", None, "UNKNOWN", None
    try:
        validate_observation(current, now=now)
        diff = differences(auth.stable_financial_runtime_identity(reference["immutable"]),
                           auth.stable_financial_runtime_identity(current["immutable"]))
        comparison = "PASS" if not diff else "FAIL"
        site = current["website"]
        if site["source_sha"] == context["candidate_sha"] and site["build_id"] == context["build_id"]:
            runtime = "EXPECTED_PRODUCT_ACTIVE"
        elif site["source_sha"] == context["rollback"]["source_sha"] and site["build_id"] == context["rollback"]["build_id"]:
            runtime = "ROLLBACK_ACTIVE"
    except (Hold, KeyError, TypeError, ValueError) as exc:
        error = str(exc)
    return {"schema": 1, "kind": "aoe2war-owner-readonly-reconciliation-v1",
            "attempt_id": p["attempt_id"], "owner_packet_sha256": row[2],
            "historical_controller_source_sha": context["controller_commit_sha"],
            "reconciler_source_sha": auth.git(auth.ROOT, "rev-parse", "HEAD"),
            "reconciler_code_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "observed_at_utc": current.get("observed_at"),
            "protected_receipt_sha256": receipt_sha256 if receipt else None,
            "WEBSITE_PROTECTED_CERTIFIED": "PASS" if receipt else "UNKNOWN",
            "OWNER_FINAL_VERIFICATION_HELD_HISTORICALLY": "HELD" if row[1] == "CONSUMED" else "COMPLETE_IN_ORIGINAL_JOURNAL",
            "CURRENT_SAME_OWNER_BOUNDARY_MATCH": comparison, "current_website": runtime,
            "FINANCIAL_MAINNET_NOT_AUTHORIZED": True,
            "original_nonce_state": row[1], "original_nonce_result_present": row[3] is not None,
            "differences": diff, "current_observation_error": error,
            "current_observation_sha256": auth.digest(current), "reference_observation_sha256": auth.digest(reference),
            "historical_failure_time_boundary": "UNKNOWN_UNLESS_SEPARATE_FAILURE_TIME_OBSERVATIONS_EXIST",
            "original_journal_unchanged": True, "redispatch_permitted": False,
            "observation_independent": False, "financial_release_authorized": False, "custody_authorized": False}


def main():
    import aoe2_website_owner_release_v3 as auth
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--packet", type=Path, required=True)
    ap.add_argument("--receipt", type=Path)
    ap.add_argument("--receipt-sha256")
    # Current observation is obtained through server-owned SSH, never caller JSON.
    args = ap.parse_args()
    try:
        from aoe2_website_owner_observer_v3 import observe
        packet, _ = read_bounded_json(args.packet)
        output = reconcile(packet, args.receipt, args.receipt_sha256, observe(),
                           state_root=auth.STATE_ROOT, public_key=auth.PUBLIC_KEY)
    except (Hold, OSError, ValueError, sqlite3.Error) as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc), "redispatch_permitted": False,
                          "financial_release_authorized": False})); return 2
    print(json.dumps(output, indent=2, sort_keys=True)); return 0


if __name__ == "__main__":
    raise SystemExit(main())
