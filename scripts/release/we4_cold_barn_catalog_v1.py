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

SCHEMA = "aoe2war.we4.intel-cold-barn.catalog.v1"
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
    "build_id", "archive_date_utc", "archive_sha256_receipt_claim",
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
            if isinstance(source, str) and HEX64.fullmatch(source):
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
                    str(pr.get("independent_restore", "")).startswith("PASS_") and
                    pr.get("independent_age_decrypt_exit") == 0 and
                    pr.get("ciphertext_readback_sha_verified") is True]
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
        record = {
            "object_id": identifier, "namespace": ns,
            "origin_machine": "HEL1" if ns == "HEL1-RECOVERY" else "M1",
            "application": archive_application(name, ns),
            "source_sha": source, "build_id": build,
            "archive_date_utc": receipt.get("observed_at") or receipt.get("observed_utc") if receipt else None,
            "archive_sha256_receipt_claim": cipher_sha if ack_evidenced else None,
            "receiver_receipt_sha256": receipt_digest if receipt else None,
            "receiver_status_claim": receipt.get("status") if receipt else None,
            "restore_proof_sha256": proof.get("proof_sha256") if proof else None,
            "restore_status": "HISTORICAL_PROOF_ASSERTS_FULL_RESTORE" if proof else "NOT_PROVEN",
            "source_original_sha256": proof.get("restored_original_zip_sha256") if proof else None,
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
 application TEXT, source_sha TEXT, build_id TEXT, archive_date_utc TEXT,
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
