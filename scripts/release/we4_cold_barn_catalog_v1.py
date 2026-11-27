#!/usr/bin/env python3
"""WE4 Intel Cold Barn: OFFLINE searchable evidence index and guarded hot-tier planner.

Reads already captured owner-private observation JSON. Never SSH, scan, transfer,
decrypt, delete, reconfigure Factory, certify a signature or grant authority.
Only the existing domain-owner signer, receiver, expiry and L4 human controller
can perform those operations. A metadata hit is never a restore-proof claim.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
from typing import Any

SCHEMA = "aoe2war.we4.intel-cold-barn.catalog.v2"
PLAN = "aoe2war.we4.factory-hot-demotion.plan-only.v1"
HEX64 = re.compile(r"^[0-9a-f]{64}$")
HEX40 = re.compile(r"^[0-9a-f]{40}$")
SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,240}$")
MAX_OBJECTS = 256
ACTIVE = {
    "web": "aoe2hdbets-web-prod.service",
    "appearance": "aoe2war-appearance-writer.service",
    "social": "aoe2war-social-writer.service",
}
SAFE_FIELDS = (
    "object_id", "namespace", "origin_machine", "application", "source_sha",
    "build_id", "generation", "source_filesystem", "receiver_object_id",
    "receiver_ack_state", "restored_at_utc", "original_source_bytes",
    "archive_date_utc", "archive_sha256_receipt_claim",
    "receiver_receipt_sha256", "receiver_status_claim", "restore_proof_sha256",
    "restore_status", "source_original_sha256", "logical_bytes",
    "allocated_bytes", "inode", "historical_source_identity_match",
    "current_digest_reverified", "source_class", "protection", "current_presence",
)

def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def canonical(x: Any) -> bytes:
    return json.dumps(x, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

def read_json(path: Path, max_bytes: int = 2_000_000) -> dict:
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_size > max_bytes or st.st_size <= 0:
        raise ValueError("unsafe/unbounded input")
    data = json.loads(path.read_bytes())
    if not isinstance(data, dict):
        raise ValueError("invalid input root")
    return data

def archive_application(name: str, namespace: str) -> str:
    if namespace == "HEL1-RECOVERY":
        return "HEL1_APP_DB" if "APP_DB" in name else "HEL1_RELEASE_CONFIG"
    if "MobileSync" in name:
        return "M1_MOBILESYNC"
    if name.startswith(("WE2", "PILOT")):
        return "M1_FACTORY_RECOVERY"
    if "Suno" in name or "Stern" in name:
        return "M1_MEDIA"
    return "M1_OTHER_CIPHERTEXT"

def historical_full_factory_proof(pr: dict, expected_cipher_sha: str | None) -> bool:
    """Accept only exact known positive restoration schema; never synthetic tests."""
    if not expected_cipher_sha:
        return False
    supplied = pr.get("ciphertext_sha256")
    if supplied is not None and supplied != expected_cipher_sha:
        return False
    if (str(pr.get("independent_restore", "")).startswith("PASS_") and
            pr.get("independent_age_decrypt_exit") == 0 and
            pr.get("ciphertext_readback_sha_verified") is True):
        return True
    if pr.get("schema") == "aoe2war.we2.intel-v2-independent-factory-restore.v1":
        return (supplied == expected_cipher_sha and
                pr.get("independent_decrypt") is True and
                pr.get("receiver_hmac_verified") is True and
                pr.get("three_member_parity") is True and
                pr.get("signed_sender_commit") is True)
    if pr.get("schema") == "aoe2war.we2.intel-v2-restored-large-factory.v1":
        return (supplied == expected_cipher_sha and
                pr.get("intel_independent_age_decrypt_pass") is True and
                pr.get("intel_independent_ciphertext_full_reread") is True and
                pr.get("intel_independent_original_zip_sha_parity") is True and
                pr.get("all_three_member_sha_parity") is True and
                pr.get("intel_v2_receipt_hmac_verified") is True)
    return False


def build_catalog(native: dict, historical: dict, runtimes: dict | None = None) -> dict:
    if native.get("schema") != "we4.intel.cold-barn.native-readonly.v1":
        raise ValueError("native source schema mismatch")
    if historical.get("schema") != "aoe2war.storage-intel.signed-envelope.v1":
        # The signed envelope's *payload* schema is checked below, not verified cryptographically.
        if not isinstance(historical.get("payload"), dict):
            raise ValueError("historical signed source missing")
    payload = historical.get("payload")
    if not isinstance(payload, dict) or payload.get("schema") != "aoe2war.storage-intel.source-observation.v1":
        raise ValueError("bad historical payload")
    items = native.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= MAX_OBJECTS:
        raise ValueError("native items missing or unbounded")
    claimed = payload.get("items")
    if not isinstance(claimed, list) or len(claimed) > MAX_OBJECTS:
        raise ValueError("historical items unbounded")
    signed_by_inode = {}
    for old in claimed:
        key = (str(old.get("namespace", "")).replace("_", "-"),
               old.get("dev"), old.get("inode"))
        if key in signed_by_inode:
            raise ValueError("duplicate historical inode")
        signed_by_inode[key] = old

    receipts = native.get("receipts", [])
    proofs = native.get("proofs", [])
    if not isinstance(receipts, list) or len(receipts) > 256 or not isinstance(proofs, list) or len(proofs) > 256:
        raise ValueError("unbounded metadata receipts")
    by_name: dict[tuple[str, str], dict] = {}
    for x in receipts:
        label = x.get("receipt_basename", "")
        if label.endswith(".age.receipt.json"):
            obj = label[:-len(".receipt.json")]
        elif label.endswith(".json"):
            obj = label[:-len(".json")] + ".age"
        else:
            continue
        key = (x.get("namespace"), obj)
        if key in by_name:
            raise ValueError("duplicate receipt for archive")
        by_name[key] = x

    runtime_src: dict[str, dict] = {}
    if runtimes is not None:
        if runtimes.get("schema") != "we4.hel1.actual-runtime-inventory.v1":
            raise ValueError("invalid runtime source")
        for gen in runtimes.get("rows", []):
            source = gen.get("source_sha")
            if isinstance(source, str) and HEX40.fullmatch(source):
                runtime_src[source] = gen
    result = []
    seen = set()
    for now in items:
        ns, name = now.get("namespace"), now.get("basename")
        if ns not in ("M1-ARCHIVE", "HEL1-RECOVERY") or not isinstance(name, str) or not SAFE_ID.fullmatch(name) or not name.endswith(".age"):
            raise ValueError("unsafe object identity")
        identifier = ns + "/" + name
        if identifier in seen:
            raise ValueError("duplicate object identity")
        seen.add(identifier)
        for field in ("inode", "dev", "logical_bytes", "allocated_bytes"):
            if type(now.get(field)) is not int or now[field] < 0:
                raise ValueError("unsafe object metadata")
        legacy = signed_by_inode.get((ns, now["dev"], now["inode"]))
        matches = bool(legacy and legacy.get("logical_bytes") == now["logical_bytes"] and
                       legacy.get("mtime_ns") == now.get("mtime_ns") and
                       legacy.get("links") == now.get("links"))
        receipt = by_name.get((ns, name))
        cipher_sha = receipt.get("ciphertext_sha256") if receipt else None
        if not isinstance(cipher_sha, str) or not HEX64.fullmatch(cipher_sha):
            cipher_sha = None
        readback = receipt.get("readback_sha256") if receipt else None
        ack_evidenced = bool(cipher_sha and readback == cipher_sha and
                            receipt.get("ciphertext_bytes") == now["logical_bytes"])
        campaign = name.split("-")[0]
        eligible_proofs = []
        if receipt:
            for proof in proofs:
                if proof.get("namespace") != ns:
                    continue
                proof_sha = proof.get("ciphertext_sha256")
                proof_id = proof.get("campaign_id") or ""
                proof_file = proof.get("proof_basename") or ""
                exact_digest = bool(cipher_sha and proof_sha == cipher_sha)
                exact_campaign = bool(proof_id == campaign and campaign) or proof_file.startswith(campaign + "-")
                if exact_digest or exact_campaign:
                    eligible_proofs.append(proof)
        # Require independently asserted full parity, age decrypt and ciphertext readback.
        verified = [pr for pr in eligible_proofs if
                    ack_evidenced and historical_full_factory_proof(pr, cipher_sha)]
        proof = sorted(verified, key=lambda x: x.get("observed_utc", ""))[-1] if verified else None
        source = proof.get("source_commit") or proof.get("source_sha256") if proof else None
        if not isinstance(source, str) or not HEX40.fullmatch(source):
            source = None
        build = proof.get("build_id") if proof else None
        if not isinstance(build, str) or len(build) > 100:
            build = None
        if source and source in runtime_src and runtime_src[source].get("build_id") != build:
            # A proof/runtime conflict is a HOLD, not an opportunity to repair a source identity by guessing.
            build = None
            source = None
        receipt_digest = receipt.get("receipt_sha256") if receipt else None
        exact_runtime = runtime_src.get(source) if source else None
        generation = (exact_runtime["generation"] if exact_runtime and
                      exact_runtime.get("build_id") == build else None)
        # An archive namespace reveals its owner, NOT its original filesystem.
        # Current historical receipts do not independently attest a source UUID.
        source_filesystem = None
        known_hmac = bool(proof and (
            proof.get("receiver_receipt_HMAC_verified") is True or
            proof.get("intel_v2_receipt_hmac_verified") is True or
            proof.get("receiver_hmac_verified") is True))
        ack_state = ("HISTORICAL_HMAC_VERIFIED" if ack_evidenced and known_hmac else
                     "RECEIVER_READBACK_RECEIPT_CLAIM" if ack_evidenced else "NO_AUTHENTICATED_RECEIVER_ACK")
        source_bytes = (proof.get("restored_original_zip_bytes") if proof and
                        type(proof.get("restored_original_zip_bytes")) is int and
                        proof["restored_original_zip_bytes"] > 0 else None)
        record = {
            "object_id": identifier, "namespace": ns,
            "origin_machine": "HEL1" if ns == "HEL1-RECOVERY" else "M1",
            "application": archive_application(name, ns),
            "source_sha": source, "build_id": build,
            "generation": generation, "source_filesystem": source_filesystem,
            "receiver_object_id": identifier,
            "receiver_ack_state": ack_state,
            "restored_at_utc": proof.get("observed_utc") if proof else None,
            "original_source_bytes": source_bytes,
            "archive_date_utc": receipt.get("observed_at") or receipt.get("observed_utc") if receipt else None,
            "archive_sha256_receipt_claim": cipher_sha if ack_evidenced else None,
            "receiver_receipt_sha256": receipt_digest if receipt else None,
            "receiver_status_claim": receipt.get("status") if receipt else None,
            "restore_proof_sha256": proof.get("proof_sha256") if proof else None,
            "restore_status": "HISTORICAL_PROOF_ASSERTS_FULL_RESTORE" if proof else "NOT_PROVEN",
            "source_original_sha256": (proof.get("restored_original_zip_sha256") or
                (proof.get("source_sha256") if proof and
                 isinstance(proof.get("source_sha256"), str) and
                 HEX64.fullmatch(proof["source_sha256"]) else None)) if proof else None,
            "logical_bytes": now["logical_bytes"], "allocated_bytes": now["allocated_bytes"],
            "inode": now["inode"], "historical_source_identity_match": matches,
            "current_digest_reverified": False,
            "source_class": receipt.get("class_id") if receipt else None,
            "protection": "L5_HOLD" if ns == "HEL1-RECOVERY" else "L4_CONSERVATIVE_HOLD",
            "current_presence": "FILE_METADATA_OBSERVED",
        }
        if record["archive_sha256_receipt_claim"] and not HEX64.fullmatch(record["archive_sha256_receipt_claim"]):
            raise ValueError("bad digest")
        result.append(record)
    result.sort(key=lambda x: (x["origin_machine"], x["application"], x["object_id"]))
    report = {
        "schema": SCHEMA, "status": "READ_ONLY_OWNER_PRIVATE_NOT_PRODUCTION_SIGNED",
        "native_observation_utc": native.get("observed_utc"),
        "historical_signed_source_observation_utc": payload.get("observed_at_utc"),
        "cryptographic_signature_rechecked_by_this_script": False,
        "current_ciphertext_content_rehashed": False,
        "entries": result, "current_object_count": len(result),
        "historical_identity_matches": sum(x["historical_source_identity_match"] for x in result),
        "historical_restore_proof_assertions": sum(x["restore_status"].startswith("HISTORICAL") for x in result),
        "current_full_restore_validated": False,
        "all_copy_and_retirement_authority": "HOLD",
    }
    report["index_digest_sha256"] = sha(canonical(report))
    return report

SQL_SCHEMA = """CREATE TABLE archives (
 object_id TEXT PRIMARY KEY, namespace TEXT NOT NULL, origin_machine TEXT,
 application TEXT, source_sha TEXT, build_id TEXT, generation TEXT,
 source_filesystem TEXT, receiver_object_id TEXT, receiver_ack_state TEXT,
 restored_at_utc TEXT, original_source_bytes INTEGER, archive_date_utc TEXT,
 archive_sha256_receipt_claim TEXT, receiver_receipt_sha256 TEXT,
 receiver_status_claim TEXT, restore_proof_sha256 TEXT, restore_status TEXT,
 source_original_sha256 TEXT, logical_bytes INTEGER, allocated_bytes INTEGER,
 inode INTEGER, historical_source_identity_match INTEGER,
 current_digest_reverified INTEGER, source_class TEXT, protection TEXT, current_presence TEXT);
CREATE INDEX by_origin_app ON archives(origin_machine,application);
CREATE INDEX by_revision ON archives(source_sha);
CREATE INDEX by_build_id ON archives(build_id);
CREATE INDEX by_digest ON archives(archive_sha256_receipt_claim);
CREATE INDEX by_restore ON archives(restore_status);
CREATE INDEX by_date ON archives(archive_date_utc);
CREATE INDEX by_generation ON archives(generation);
CREATE INDEX by_original_filesystem ON archives(source_filesystem);
CREATE INDEX by_receiver_ack ON archives(receiver_ack_state);
CREATE INDEX by_receiver_object ON archives(receiver_object_id);
"""

def output_index(index: dict, json_path: Path, sqlite_path: Path) -> None:
    if json_path.exists() or sqlite_path.exists() or json_path.is_symlink() or sqlite_path.is_symlink():
        raise ValueError("refuse overwrite of owner index")
    if json_path.parent != sqlite_path.parent or json_path.parent.is_symlink():
        raise ValueError("index destinations must share safe directory")
    body = (json.dumps(index, indent=2, sort_keys=True, allow_nan=False) + "\n").encode()
    old_umask = os.umask(0o077)
    try:
        fd = os.open(json_path, os.O_EXCL | os.O_CREAT | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(body); f.flush(); os.fsync(f.fileno())
        fd = os.open(sqlite_path, os.O_EXCL | os.O_CREAT | os.O_WRONLY, 0o600)
        os.close(fd)
        with sqlite3.connect(str(sqlite_path)) as db:
            db.executescript(SQL_SCHEMA)
            db.executemany(
                "INSERT INTO archives (" + ",".join(SAFE_FIELDS) + ") VALUES (" + ",".join("?" for _ in SAFE_FIELDS) + ")",
                [[int(row[x]) if type(row[x]) is bool else row[x] for x in SAFE_FIELDS] for row in index["entries"]]
            )
            db.execute("PRAGMA user_version=1")
        if stat.S_IMODE(sqlite_path.stat().st_mode) != 0o600:
            raise ValueError("index database permissions invalid")
    finally:
        os.umask(old_umask)

def query(db_path: Path, field: str, value: str) -> list[dict]:
    accepted = {"object_id","origin_machine","application","source_sha","build_id",
                "generation","source_filesystem","receiver_object_id","receiver_ack_state",
                "archive_sha256_receipt_claim","restore_status","source_class"}
    if field not in accepted or not 1 <= len(value) <= 250:
        raise ValueError("unsafe query")
    uri = "file:" + str(db_path.resolve()) + "?mode=ro"
    with sqlite3.connect(uri, uri=True) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute("SELECT " + ",".join(SAFE_FIELDS) + " FROM archives WHERE " + field
                          + " LIKE ? LIMIT 128", (value+"%",)).fetchall()
        return [dict(row) for row in rows]

def plan_hot_runtime(runtimes: dict, *, active_roles: dict[str, str],
                     exact_hot_rollback_ids: list[str] | None = None,
                     exact_proven_cold_checkpoint_ids: list[str] | None = None,
                     catalog: dict | None = None) -> dict:
    if runtimes.get("schema") != "we4.hel1.actual-runtime-inventory.v1":
        raise ValueError("runtime schema mismatch")
    rows = runtimes.get("rows", [])
    if not isinstance(rows, list) or len(rows) > 128:
        raise ValueError("runtime size invalid")
    pins = set(exact_hot_rollback_ids or [])
    if len(pins) > 2:
        raise ValueError("more than two hot rollback pins")
    if len(set(active_roles.values())) != len(active_roles):
        raise ValueError("duplicate active runtime role")
    if exact_proven_cold_checkpoint_ids is not None and (
            len(exact_proven_cold_checkpoint_ids) != 3 or
            len(set(exact_proven_cold_checkpoint_ids)) != 3 or
            any(not isinstance(x,str) or not HEX40.fullmatch(x) for x in exact_proven_cold_checkpoint_ids)):
        raise ValueError("three exact verified cold checkpoint sources required")
    if catalog is not None and catalog.get("schema") != SCHEMA:
        raise ValueError("unqualified catalog")
    archive_pairs = {(x["source_sha"],x["build_id"]) for x in (catalog or {}).get("entries", [])
                     if x.get("restore_status") == "HISTORICAL_PROOF_ASSERTS_FULL_RESTORE"
                     and x.get("historical_source_identity_match") is True}
    actions = []
    for r in rows:
        gen = r.get("generation")
        if not isinstance(gen,str) or not re.fullmatch(r"[0-9a-f]{12}",gen):
            raise ValueError("unsafe generation")
        roles = [name for name,value in active_roles.items() if value == gen]
        reasons = []
        if roles:reasons.append("LIVE_SERVICE_" + "_".join(roles).upper())
        if gen in pins:reasons.append("HOT_ROLLBACK_PIN")
        if exact_hot_rollback_ids is None:reasons.append("FACTORY_ROLLBACK_PINS_NOT_ADMITTED")
        if exact_proven_cold_checkpoint_ids is None:
            reasons.append("THREE_SOURCE_ADMITTED_COLD_CHECKPOINTS_NOT_PROVEN")
        if not re.fullmatch(r"[0-9a-f]{40}", r.get("source_sha") or "") or not r.get("build_id"):
            reasons.append("SOURCE_OR_BUILD_ID_UNVERIFIED")
        if (r.get("source_sha"),r.get("build_id")) not in archive_pairs:
            reasons.append("EXACT_GENERATION_INTEL_RESTORE_NOT_PROVEN")
        reasons += ["CURRENT_ROLLBACK_AND_CONSUMER_NEGATIVE_PROOF_REQUIRED",
                    "EXACT_HUMAN_L4_RETIREMENT_PERMIT_REQUIRED"]
        actions.append({"generation":gen,"source_sha":r.get("source_sha"),"build_id":r.get("build_id"),
                        "allocated_gross_bytes":r.get("allocated_bytes"),"action":"KEEP_HOLD",
                        "missing_evidence":reasons,"unique_reclaimable_bytes":None})
    return {"schema":PLAN, "target_hot_limit_per_family":3, "active_plus_two_rollbacks":True,
            "target_is_not_deletion_quota":True,"observed_runtime_count":len(actions),
            "actions":actions,"new_copies":0,"new_deletions":0,"new_reclaimed_bytes":0,
            "factory_source_owner_integration_required":True,"execution":"PLAN_ONLY_NO_EXECUTION"}

def nominate_one_cold_copy_on_promotion(
    runtimes: dict, *, live_service_generations: dict[str, str],
    source_attested_hot_rollback_generations: list[str] | None,
    protected_original_generations: list[str] | None = None,
) -> dict:
    """Select one review item, never a copy or an expiry.

    The producing Factory must supply genuine 2-hot pins. mtime only orders
    *already-unpinned* sources for one review; age is never retirement proof.
    This function does not validate a native owner COPY or deletion signature.
    """
    status = {
        "schema": "aoe2war.we4.one-cold-copy-nomination.plan-only.v1",
        "status": "HOLD",
        "candidate": None,
        "source_owner_admission": "REQUIRED",
        "exact_copy_permission": "NOT_VALIDATED",
        "recovery_and_rollback_exclusion": "NOT_PROVEN",
        "retirement_authority": "NONE",
        "apply": False, "new_copies": 0, "new_deletions": 0,
    }
    rows = runtimes.get("rows")
    if (runtimes.get("schema") != "we4.hel1.actual-runtime-inventory.v1" or
            not isinstance(rows, list) or len(rows) > 128 or
            runtimes.get("count") != len(rows) or
            runtimes.get("measured_count") != len(rows)):
        return {**status, "status": "HOLD_SOURCE_COVERAGE"}
    pins = source_attested_hot_rollback_generations
    if (not isinstance(pins, list) or len(pins) != 2 or len(set(pins)) != 2 or
            not all(isinstance(g, str) and re.fullmatch(r"[0-9a-f]{12}", g) for g in pins)):
        return {**status, "status": "HOLD_EXACT_TWO_HOT_PINS_NOT_ADMITTED"}
    if (not isinstance(live_service_generations, dict) or
            set(live_service_generations) != set(ACTIVE) or
            not all(isinstance(g, str) and re.fullmatch(r"[0-9a-f]{12}", g)
                    for g in live_service_generations.values())):
        return {**status, "status": "HOLD_SERVICE_ROOTS_NOT_AUTHENTICATED"}
    originals = protected_original_generations or []
    if (not isinstance(originals, list) or
            not all(isinstance(g, str) and re.fullmatch(r"[0-9a-f]{12}", g)
                    for g in originals)):
        return {**status, "status": "HOLD_ORIGINAL_PROTECTION_UNVERIFIED"}
    all_ids = {x.get("generation") for x in rows}
    if (len(all_ids) != len(rows) or
            not set(pins).issubset(all_ids) or
            not set(live_service_generations.values()).issubset(all_ids)):
        return {**status, "status": "HOLD_REQUIRED_RUNTIME_MISSING"}
    forbidden = set(pins) | set(live_service_generations.values()) | set(originals)
    candidates = []
    for entry in rows:
        gen, source, build = (entry.get("generation"), entry.get("source_sha"),
                              entry.get("build_id"))
        if gen in forbidden:
            continue
        if (not isinstance(gen, str) or not re.fullmatch(r"[0-9a-f]{12}", gen) or
                not isinstance(source, str) or
                not re.fullmatch(r"[0-9a-f]{40}", source) or
                not source.startswith(gen) or not isinstance(build, str) or
                not build or type(entry.get("allocated_bytes")) is not int or
                entry.get("allocation_status") != "MEASURED_SELECTED_TREE" or
                type(entry.get("mtime_ns")) is not int):
            continue
        candidates.append(entry)
    if not candidates:
        return {**status, "status": "HOLD_NO_UNPINNED_SOURCE_VERIFIED_CANDIDATE"}
    chosen = min(candidates, key=lambda x: (x["mtime_ns"], x["generation"]))
    return {**status, "status": "ONE_NOMINATION_FOR_SOURCE_OWNER_QUALIFICATION_ONLY",
            "candidate": {
                "generation": chosen["generation"],
                "source_sha": chosen["source_sha"],
                "build_id": chosen["build_id"],
                "gross_allocated_bytes": chosen["allocated_bytes"],
            },
            "must_recheck_before_copy": [
                "exact original Factory generation role and protection ledger",
                "current service and independent rollback consumer negative evidence",
                "admitted source/destination class and exact item COPY permit",
                "existing receiver durable ACK, full readback, and isolated restore",
            ]}



FACTORY_ZIP_INVENTORY = "aoe2war.we4.m1-full-16-zip-factory-disposition.v1"

def review_exact_factory_zip_for_retention(inventory: dict, sha256: str) -> dict:
    """Source-owned, non-mutating one-ZIP decision for the original Factory producer.

    A verified digest and historic cold copy do not grant an L4 delete.
    Called on one complete source-receipt manifest; never infers the state of
    the other files, imports signer authority or turns gross bytes into APFS gain.
    The original Factory must source-admit actual hot pins and expiry separately.
    """
    result = {
        "schema": "aoe2war.we4.factory-one-zip-retention.plan-only.v1",
        "status": "HOLD_UNVERIFIED_INVENTORY",
        "zip_sha256": sha256,
        "candidate": None,
        "owner_source": "WE2_FACTORY_ORIGINAL_PRODUCER_REVIEW_REQUIRED",
        "original_or_copy_status": "UNDETERMINED",
        "exact_one_item_copy_permission": "NOT_VALIDATED",
        "exact_one_item_L4_retirement_permission": "NOT_VALIDATED",
        "independent_fresh_restore": False,
        "expected_unique_APFS_gain_bytes": None,
        "apply": False, "new_archives": 0, "new_deletions": 0,
        "producer_policy": {
            "identity": ["source_sha", "build_id", "archive_sha256_full_reread"],
            "verified_duplicate": "REUSE_EXISTING_CONTENT_ADDRESSED_ZIP",
            "after_T10": "NOMINATE_ONE_UNPINNED_SOURCE_ONLY_AFTER_SIGNED_HOT_COLD_PROOFS",
            "automatic_age_expiry": False,
        },
    }
    if not isinstance(sha256, str) or HEX64.fullmatch(sha256) is None:
        return {**result, "status": "HOLD_INVALID_ZIP_IDENTITY"}
    if not isinstance(inventory, dict) or inventory.get("schema") != FACTORY_ZIP_INVENTORY:
        return result
    rows = inventory.get("rows")
    if (not isinstance(rows, list) or len(rows) != 16 or inventory.get("zip_count") != 16
            or inventory.get("source_full_sha256_reread_for_each_zip") is not True
            or inventory.get("source_sha_build_id_crosschecked_per_artifact_and_linux_build_receipt") is not True
            or inventory.get("source_root_dev") != 16777234):
        return {**result, "status": "HOLD_INCOMPLETE_OR_UNVERIFIED_ZIP_CENSUS"}
    ids = set()
    for item in rows:
        if not isinstance(item, dict):
            return result
        digest, source, build = (item.get("archive_sha256_full_reread"),
                                 item.get("source_sha"), item.get("build_id"))
        if (not isinstance(digest, str) or HEX64.fullmatch(digest) is None
                or digest in ids or item.get("zip_basename") != digest + ".zip"
                or item.get("zip_artifact_digest_matches_exact_filename") is not True
                or item.get("linux_receipt_source_and_manifest_verified") is not True
                or not isinstance(source, str) or HEX40.fullmatch(source) is None
                or not isinstance(build, str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", build)
                or item.get("source_dev") != 16777234
                or item.get("source_nlink") != 1
                or type(item.get("source_allocated_blocks_bytes")) is not int
                or item["source_allocated_blocks_bytes"] <= 0):
            return {**result, "status": "HOLD_SOURCE_METADATA_OR_DUPLICATE_IDENTITY"}
        ids.add(digest)
    matches = [item for item in rows if item["archive_sha256_full_reread"] == sha256]
    if len(matches) != 1:
        return {**result, "status": "HOLD_EXACT_ZIP_NOT_FOUND"}
    item = matches[0]
    candidate = {k: item[k] for k in (
        "zip_basename", "archive_sha256_full_reread", "source_sha", "build_id",
        "source_ino", "source_dev", "source_allocated_blocks_bytes")}
    result = {**result, "candidate": candidate}
    role = item.get("known_runtime_service_or_rollback_role")
    if role != "NO_DIRECT_ACTIVE_WEB_APPEARANCE_SOCIAL_OR_TWO_HOT_MATCH_IN_KNOWN_SET":
        return {**result, "status": "HOLD_PROTECTED_OR_UNADMITTED_HOT_ROLE"}
    if item.get("prior_historical_independent_restoration_asserted") is True:
        if item.get("prior_original_retirement_allowed") is False:
            return {**result, "status": "HOLD_EXPLICIT_HISTORICAL_L4_RETIREMENT_DENIAL",
                    "original_or_copy_status": "HISTORICAL_COLD_COPY_RESTORED_ORIGINAL_PRESERVED",
                    "required_next_proof": [
                        "fresh current original-vs-copy and rollback dependency exclusion",
                        "current receiver full ciphertext readback and independent isolated restore",
                        "separate exact human source L4 retirement permission",
                        "same APFS pre/post free-space measurement",
                    ]}
        return {**result, "status": "HOLD_EXACT_OWNER_PERMISSION_UNVERIFIED"}
    return {**result, "status": "HOLD_SOURCE_CLASS_COPY_AND_INDEPENDENT_RESTORE_MISSING",
            "required_next_proof": [
                "original source and current rollback/source dependencies",
                "approved original M1 Factory ZIP source class and exact owner COPY grant",
                "durable receiver nonce ACK, full ciphertext hash, isolated original restore",
                "separate human source L4 retirement permission",
            ]}



def review_explicit_hel1_owner_copy_nomination(
    runtimes: dict, source_docket: dict, two_hot_dossier: dict, *,
    owner_selected_generation: str,
) -> dict:
    """Bind exactly one named HEL1 COPY candidate; NEVER select by old mtime.

    The source dossier and invocation are review inputs, not signed permits.
    The one real owner/signer enrollment is external to this pure function.
    A caller cannot set a boolean that causes a copy, restore or L4 retirement.
    """
    result = {
        "schema": "aoe2war.we4.hel1-exact-owner-nomination.review-only.v1",
        "status": "HOLD_EXACT_SOURCE_REVIEW_REQUIRED",
        "selection_mode": "EXPLICIT_OWNER_NAMED_ONE_OBJECT_NOT_AUTOMATIC",
        "owner_selected_generation": owner_selected_generation,
        "candidate": None,
        "automatic_oldest_candidate_override": False,
        "hot_pinset_source_dossier_checked_as_signature": False,
        "owner_nomination_signature_validated": False,
        "receiver_source_class_admitted": False,
        "one_use_copy_permission_validated": False,
        "independent_restoration_this_action": False,
        "independent_rollback_exclusion": False,
        "human_L4_retirement_permission": False,
        "apply": False, "new_archives": 0, "new_copies": 0,
        "new_deletions": 0, "measured_reclaimed_bytes": 0,
    }
    if (not isinstance(owner_selected_generation, str) or
            re.fullmatch(r"[0-9a-f]{12}", owner_selected_generation) is None):
        return {**result, "status": "HOLD_INVALID_EXACT_OWNER_SELECTION"}
    if (not isinstance(runtimes, dict) or
            runtimes.get("schema") != "we4.hel1.actual-runtime-inventory.v1" or
            not isinstance(runtimes.get("rows"), list) or
            runtimes.get("count") != len(runtimes["rows"]) or
            runtimes.get("measured_count") != len(runtimes["rows"]) or
            len(runtimes["rows"]) > 128):
        return {**result, "status": "HOLD_INCOMPLETE_SOURCE_INVENTORY"}
    if (not isinstance(source_docket, dict) or
            source_docket.get("schema") !=
                "aoe2war.we4.first-generation-copy-admission-docket.v1" or
            not isinstance(source_docket.get("target"), dict)):
        return {**result, "status": "HOLD_ORIGINAL_SOURCE_DOCKET_MISSING"}
    target = source_docket["target"]
    required = ("generation", "source_sha", "build_id", "root_dev",
                "root_inode", "fs_uuid", "file_content_manifest_sha256",
                "regular_files_hashed", "entries", "gross_allocated_bytes")
    if any(key not in target for key in required):
        return {**result, "status": "HOLD_EXACT_SOURCE_FINGERPRINT_INCOMPLETE"}
    if (target["generation"] != owner_selected_generation or
            target.get("host") != "HEL1" or target.get("fs") != "/dev/sda1" or
            not isinstance(target.get("source_sha"), str) or
            HEX40.fullmatch(target["source_sha"]) is None or
            not target["source_sha"].startswith(owner_selected_generation) or
            not isinstance(target["build_id"], str) or
            re.fullmatch(r"[A-Za-z0-9_-]{8,64}", target["build_id"]) is None or
            not isinstance(target["fs_uuid"], str) or
            re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
                         target["fs_uuid"]) is None or
            not isinstance(target["file_content_manifest_sha256"], str) or
            HEX64.fullmatch(target["file_content_manifest_sha256"]) is None or
            any(type(target[k]) is not int or target[k] <= 0 for k in
                ("root_dev", "root_inode", "regular_files_hashed", "entries",
                 "gross_allocated_bytes"))):
        return {**result, "status": "HOLD_EXACT_ROOT_IDENTITY_MISMATCH"}
    matches = [row for row in runtimes["rows"]
               if isinstance(row, dict) and
               row.get("generation") == owner_selected_generation]
    if len(matches) != 1:
        return {**result, "status": "HOLD_EXACT_GENERATION_MISSING_OR_DUPLICATE"}
    row = matches[0]
    if (row.get("source_sha") != target["source_sha"] or
            row.get("build_id") != target["build_id"] or
            row.get("device") != target["root_dev"] or
            row.get("inode") != target["root_inode"] or
            row.get("allocated_bytes") != target["gross_allocated_bytes"] or
            row.get("allocation_status") != "MEASURED_SELECTED_TREE" or
            runtimes.get("mount_dev") != target["root_dev"]):
        return {**result, "status": "HOLD_NATIVE_SOURCE_VERSUS_FULL_DOCKET_DRIFT"}
    candidate = {key: target[key] for key in required}
    result = {**result, "candidate": candidate}
    if (not isinstance(two_hot_dossier, dict) or
            two_hot_dossier.get("schema") !=
                "aoe2war.we2.factory-current-two-hot-source-dossier.v1" or
            not isinstance(two_hot_dossier.get("active"), dict) or
            not isinstance(two_hot_dossier.get("hot_rollback_candidates"), list) or
            len(two_hot_dossier["hot_rollback_candidates"]) != 2):
        return {**result, "status": "HOLD_WE2_NATIVE_TWO_HOT_DOSSIER_MISSING"}
    hot_rows = [two_hot_dossier["active"], *two_hot_dossier["hot_rollback_candidates"]]
    hot_generations = [entry.get("generation") for entry in hot_rows
                       if isinstance(entry, dict)]
    if (len(hot_generations) != 3 or len(set(hot_generations)) != 3 or
            owner_selected_generation in hot_generations or
            not all(any(r.get("generation") == gen and
                        r.get("source_sha") == entry.get("source_sha") and
                        r.get("build_id") == entry.get("build_id")
                        for r in runtimes["rows"] if isinstance(r, dict))
                    for gen, entry in zip(hot_generations, hot_rows))):
        return {**result, "status": "HOLD_CURRENT_OR_HOT_PIN_SOURCE_CONFLICT"}
    if (two_hot_dossier.get("hot_pinset_admitted") is not True or
            two_hot_dossier.get("owner_admission") != "ADMITTED"):
        return {**result, "status": "HOLD_CURRENT_TWO_HOT_OWNER_ADMISSION",
                "native_source_two_hot_candidates": hot_generations}
    # Even an 'ADMITTED' field is only a claim; this offline script never
    # authenticates an owner signature or receiver class. Cannot promote it.
    return {**result, "status": "HOLD_EXTERNAL_OWNER_SIGNATURE_AND_COPY_CLASS_VERIFIER",
            "native_source_two_hot_candidates": hot_generations}




# This is a review fingerprint of the single owner-selected object, NOT a
# cryptographic host/source admission. Owner signed COPY approval is external.
OWNER_FIRST_HEL1_4C14_FINGERPRINT = {
    "generation": "4c14cbc7c518",
    "source_sha": "4c14cbc7c518f9b28e1d84b5f88a022a82f7d2e7",
    "build_id": "w-tDoD2iUw6P2P4oTw3Ti",
    "fs_uuid": "64f6fb02-4fed-4836-a33b-86e8993afdfa",
    "root_dev": 2049,
    "root_inode": 4493824,
    "gross_allocated_bytes": 1584885760,
    "regular_files_hashed": 45036,
    "entries": 51438,
    "file_content_manifest_sha256":
        "60ba8c3561bed95b8f72dcb97f805516a55c5963a0f6c182ea94536c4f6f6647",
}
OWNER_FIRST_HEL1_4C14_PRIVATE_MANIFEST_SHA256 = (
    "d96aa4edf0dcf2a117b2cb46a1e4ee4a69da8bdcf22db779610adff5043c50bc"
)


def review_owner_pinned_first_4c14_copy_only(
    runtimes: dict, source_docket: dict, two_hot_dossier: dict,
) -> dict:
    """Strict single-owner exception; no generic oldest-generation fallback.

    An exact match only reaches non-executable source qualification. It cannot
    authenticate a one-use nonce, owner hot pins, a receiver or an L4 permit.
    """
    denied = {
        "schema": "aoe2war.we4.first-4c14-exact-copy-only.review.v1",
        "status": "HOLD_OWNER_PINNED_SOURCE_FINGERPRINT_DRIFT",
        "requested_generation": "4c14cbc7c518",
        "candidate": None,
        "copy_only_class": "HEL1_HISTORICAL_FACTORY_RUNTIME/COPY_ONLY_NO_RETIRE",
        "owner_hot_pinset_authentication": False,
        "existing_receiver_copy_class_authorized": False,
        "one_use_owner_COPY_permit_verified": False,
        "retirement_permission": False,
        "apply": False, "new_copies": 0, "new_deletions": 0,
    }
    if not isinstance(source_docket, dict):
        return denied
    target = source_docket.get("target")
    evidence = source_docket.get("source_evidence")
    if not isinstance(target, dict) or not isinstance(evidence, dict):
        return denied
    if (any(type(target.get(k)) is not type(value) or target.get(k) != value
            for k, value in OWNER_FIRST_HEL1_4C14_FINGERPRINT.items()) or
            target.get("host") != "HEL1" or target.get("fs") != "/dev/sda1" or
            evidence.get("integrity_manifest_sha256") !=
                OWNER_FIRST_HEL1_4C14_PRIVATE_MANIFEST_SHA256):
        return denied
    result = review_explicit_hel1_owner_copy_nomination(
        runtimes, source_docket, two_hot_dossier,
        owner_selected_generation=OWNER_FIRST_HEL1_4C14_FINGERPRINT["generation"],
    )
    return {**denied, "status": result["status"],
            "candidate": result["candidate"],
            "original_source_review": result,
            "owner_signed_copy_authority": "NOT_VALIDATED",
            "exact_source_fingerprint_matches_review_pin": result["candidate"] is not None}


def stage_retention_gate(receipt: dict) -> dict:
    if not isinstance(receipt, dict) or receipt.get("schema") != "aoe2war.we2.factory-historical-transport-retention-receipt.v1":
        raise ValueError("untrusted factory receipt")
    items = receipt.get("items")
    if not isinstance(items,list) or not items or len(items) > 128:
        raise ValueError("receipt items unbounded")
    for item in items:
        if item.get("sourceRemovedAfterVerifiedPreservation") is not True or not HEX64.fullmatch(str(item.get("sha256",""))):
            raise ValueError("missing preserved-original proof")
    return {"status":"PRESERVED_RECOVERY_ORIGINALS_KEEP",
            "retention_receipt_source_verified_by_this_function":False,
            "distinct_cold_copy_and_restore_required":True,
            "expiry_by_age_allowed":False,"producer_change":"Factory exact SHA/receipt idempotent staging; no duplicate or age-only TTL",
            "new_retirement_permission":False}

def main() -> int:
    ap = argparse.ArgumentParser(description="Read-only WE4 owner cold-barn index and hot-tier plan")
    sub=ap.add_subparsers(dest="cmd",required=True)
    b=sub.add_parser("build")
    for name in ("native","historical","runtime","output-json","output-sqlite"):
        b.add_argument("--"+name,required=(name!="runtime"))
    q=sub.add_parser("query")
    q.add_argument("--sqlite",required=True)
    q.add_argument("--field",required=True)
    q.add_argument("--prefix",required=True)
    p=sub.add_parser("plan")
    p.add_argument("--runtime",required=True)
    p.add_argument("--catalog",required=True)
    p.add_argument("--hot-pins",help="Previously source-admitted Factory 0–2 rollback IDs (not guessed)")
    for n in ("web","appearance","social"):p.add_argument("--"+n,required=True)
    args=ap.parse_args()
    if args.cmd=="build":
        index=build_catalog(read_json(Path(args.native)),read_json(Path(args.historical)),
                            read_json(Path(args.runtime)) if args.runtime else None)
        output_index(index,Path(args.output_json),Path(args.output_sqlite))
        print(json.dumps({"status":"OWNER_PRIVATE_INDEX_CREATED","objects":len(index["entries"]),
                          "historical_restore_proof_assertions":index["historical_restore_proof_assertions"],
                          "source_match_count":index["historical_identity_matches"],
                          "index_digest_sha256":index["index_digest_sha256"],"signed_now":False},sort_keys=True))
    elif args.cmd=="query":
        print(json.dumps(query(Path(args.sqlite),args.field,args.prefix),sort_keys=True))
    else:
        pins=read_json(Path(args.hot_pins)).get("exact_hot_rollback_ids") if args.hot_pins else None
        result=plan_hot_runtime(read_json(Path(args.runtime)),
            active_roles={k:getattr(args,k) for k in ("web","appearance","social")},
            exact_hot_rollback_ids=pins,catalog=read_json(Path(args.catalog)))
        print(json.dumps(result,sort_keys=True))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
