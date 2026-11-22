#!/usr/bin/env python3
"""WE4 Intel conveyor v4: index existing proof, never transport, delete or permit.

Merges owner-private, previously measured 23 Intel ciphertext entries with exact
16 Factory ZIP digests and 26 HEL1 runtime metadata observations. The v3 archive
database is copied transactionally into a NEW 0600 database, never overwritten.
Missing creation dates, source proofs and fresh restores remain NULL / false.
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

SCHEMA = "aoe2war.we4.intel-cold-conveyor-index.v4"
ZIP_SCHEMA = "aoe2war.we4.m1-full-16-zip-factory-disposition.v1"
ROOT_SCHEMA = "we4.hel1.actual-runtime-inventory.v1"
COLD_SCHEMA = "aoe2war.we4.intel-cold-barn.catalog.v2"
SOURCE_FS_UUID = "2B7670BF-6C76-4EC1-B874-31E1CE660EB4"
ROOT_FS_UUID = "64f6fb02-4fed-4836-a33b-86e8993afdfa"
HEX64 = re.compile(r"^[0-9a-f]{64}$")
HEX40 = re.compile(r"^[0-9a-f]{40}$")

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def safe_read(path: Path, max_bytes: int = 5_000_000) -> tuple[dict, str]:
    st = path.lstat()
    if (not stat.S_ISREG(st.st_mode) or st.st_size < 2
            or st.st_size > max_bytes or path.is_symlink()):
        raise ValueError("HOLD_UNTRUSTED_INDEX_INPUT")
    content = path.read_bytes()
    if len(content) != st.st_size:
        raise ValueError("HOLD_INPUT_DRIFT")
    obj = json.loads(content)
    if not isinstance(obj, dict):
        raise ValueError("HOLD_INPUT_NOT_OBJECT")
    return obj, sha(content)

def mtime_string(ns: int) -> str | None:
    if type(ns) is not int or ns <= 0:
        return None
    return dt.datetime.fromtimestamp(ns / 1e9, dt.timezone.utc).isoformat()

def compile_sources(factory: dict, runtime: dict, cold: dict) -> tuple[list[dict], list[dict]]:
    if (factory.get("schema") != ZIP_SCHEMA or factory.get("zip_count") != 16
            or factory.get("source_root_dev") != 16777234
            or factory.get("source_full_sha256_reread_for_each_zip") is not True
            or factory.get("source_sha_build_id_crosschecked_per_artifact_and_linux_build_receipt") is not True
            or not isinstance(factory.get("rows"), list) or len(factory["rows"]) != 16):
        raise ValueError("HOLD_INCOMPLETE_FACTORY_SOURCE_CENSUS")
    if (runtime.get("schema") != ROOT_SCHEMA or runtime.get("count") != 26
            or runtime.get("measured_count") != 26
            or runtime.get("mount_dev") != 2049
            or not isinstance(runtime.get("rows"), list) or len(runtime["rows"]) != 26):
        raise ValueError("HOLD_INCOMPLETE_HEL1_ROOT_SOURCE")
    if (cold.get("schema") != COLD_SCHEMA or cold.get("current_object_count") != 23
            or cold.get("historical_restore_proof_assertions") != 6
            or not isinstance(cold.get("entries"), list) or len(cold["entries"]) != 23):
        raise ValueError("HOLD_COLD_CATALOG_SOURCE_DRIFT")
    by_original: dict[str, dict] = {}
    for a in cold["entries"]:
        key = a.get("source_original_sha256")
        if key is not None:
            if not isinstance(key, str) or not HEX64.fullmatch(key) or key in by_original:
                raise ValueError("HOLD_DUPLICATE_OR_INVALID_COLD_SOURCE")
            by_original[key] = a
    factory_rows = []
    seen = set()
    for row in factory["rows"]:
        key = row.get("archive_sha256_full_reread")
        source = row.get("source_sha")
        build = row.get("build_id")
        if (not isinstance(key, str) or not HEX64.fullmatch(key) or key in seen
                or row.get("zip_basename") != key + ".zip"
                or row.get("zip_artifact_digest_matches_exact_filename") is not True
                or row.get("linux_receipt_source_and_manifest_verified") is not True
                or not isinstance(source, str) or not HEX40.fullmatch(source)
                or not isinstance(build, str) or not build
                or row.get("source_dev") != 16777234
                or type(row.get("source_allocated_blocks_bytes")) is not int
                or row["source_allocated_blocks_bytes"] <= 0):
            raise ValueError("HOLD_FACTORY_ZIP_SOURCE_DRIFT")
        seen.add(key)
        a = by_original.get(key)
        restored = row.get("prior_historical_independent_restoration_asserted")
        if restored is True and (a is None or a.get("restore_status") != "HISTORICAL_PROOF_ASSERTS_FULL_RESTORE"):
            raise ValueError("HOLD_HISTORICAL_RESTORE_JOIN_MISSING")
        if restored is not True and a is not None:
            raise ValueError("HOLD_UNEXPLAINED_INTEL_EQUIVALENT")
        if (restored is True and row.get("prior_original_retirement_allowed") is not False):
            raise ValueError("HOLD_PRIOR_L4_DENIAL_MISSING")
        decision = row.get("decision")
        if decision not in ("KEEP_ACTIVE_OR_HOT",
                            "RESTORED_HISTORICALLY_BUT_RETIREMENT_PERMIT_DENIED",
                            "COLD_COPY_CANDIDATE_WITH_REQUIRED_NEW_AUTH"):
            raise ValueError("HOLD_FACTORY_CLASS_UNKNOWN")
        factory_rows.append({
            "zip_sha256": key, "source_sha": source, "build_id": build,
            "origin_machine": "M1",
            "origin_fs_uuid": SOURCE_FS_UUID,
            "origin_fs_kind": "APFS Data /dev/disk3s5 native observed (not source-signed)",
            "creation_date_utc": None,  # mtime is NOT creation.
            "source_mtime_utc": mtime_string(row.get("source_mtime_ns")),
            "native_source_inode": row.get("source_ino"),
            "source_allocated_bytes_gross": row["source_allocated_blocks_bytes"],
            "decision": decision,
            "retirement_permit": "DENIED_L4" if restored is True else "NONE",
            "intel_receiver_object_id": a.get("receiver_object_id") if a else None,
            "intel_ciphertext_sha256_claim": a.get("archive_sha256_receipt_claim") if a else None,
            "intel_archive_date_utc": a.get("archive_date_utc") if a else None,
            "receiver_ack_state": a.get("receiver_ack_state") if a else None,
            "receiver_receipt_sha256": a.get("receiver_receipt_sha256") if a else None,
            "historical_restore_proof_sha256": a.get("restore_proof_sha256") if a else None,
            "independent_restore_status": a.get("restore_status") if a else "NOT_PROVEN",
            "current_ciphertext_full_hash_verified": False,
            "current_restored_plaintext_hash_verified": False,
            "fresh_independent_restore_this_catalog": False,
            "source_original_exclusion": "NOT_PROVEN",
            "unique_reclaimable_bytes": None,
            "eligible_to_delete": False,
        })
    if sum(x["source_allocated_bytes_gross"] for x in factory_rows) != 9868439552:
        raise ValueError("HOLD_FACTORY_GROSS_SUM_DRIFT")
    if sum(x["decision"] == "KEEP_ACTIVE_OR_HOT" for x in factory_rows) != 5 or sum(
        x["decision"] == "RESTORED_HISTORICALLY_BUT_RETIREMENT_PERMIT_DENIED"
        for x in factory_rows) != 5:
        raise ValueError("HOLD_FACTORY_PROTECTION_COUNTS_CHANGED")
    root_rows = []
    generations = set()
    for row in runtime["rows"]:
        gen, source, build = row.get("generation"), row.get("source_sha"), row.get("build_id")
        if (not isinstance(gen, str) or not re.fullmatch(r"[0-9a-f]{12}", gen)
                or gen in generations or not isinstance(source, str)
                or not HEX40.fullmatch(source) or not source.startswith(gen)
                or not isinstance(build, str) or not build
                or row.get("device") != 2049
                or row.get("allocation_status") != "MEASURED_SELECTED_TREE"):
            raise ValueError("HOLD_RUNTIME_SOURCE_IDENTITY")
        generations.add(gen)
        role = ("CURRENT_WEB_PROTECTED" if gen == "9cf670724c82"
                else "HOT_ROLLBACK_CANDIDATE_PROTECTED" if gen in ("50b943a44a2e","dbceb5df20f9")
                else "ACTIVE_WRITER_PROTECTED" if gen in ("f50ead889c61","da0bee282e52")
                else "HISTORICAL_SOURCE_REVIEW_HOLD")
        root_rows.append({
            "generation": gen, "source_sha": source, "build_id": build,
            "origin_machine": "HEL1", "origin_fs_uuid": ROOT_FS_UUID,
            "origin_fs_kind": "ext4 /dev/sda1 source observed",
            "creation_date_utc": None, "source_mtime_utc": mtime_string(row.get("mtime_ns")),
            "native_source_inode": row.get("inode"),
            "source_allocated_bytes_gross": row.get("allocated_bytes"),
            "protection": role, "source_full_content_verified":
                gen == "4c14cbc7c518",
            "intel_receiver_object_id": None,
            "archive_sha256": None, "receiver_ack_state": None,
            "independent_restore_status": "NOT_PROVEN",
            "one_use_copy_permit": "NOT_ADMITTED",
            "retirement_permit": "NOT_GRANTED",
            "eligible_to_delete": False,
        })
    if "4c14cbc7c518" not in generations:
        raise ValueError("HOLD_NAMED_HEL1_ORIGINAL_MISSING")
    return factory_rows, root_rows

FACTORY_FIELDS = (
    "zip_sha256","source_sha","build_id","origin_machine","origin_fs_uuid",
    "creation_date_utc","source_mtime_utc","native_source_inode",
    "source_allocated_bytes_gross","decision","retirement_permit",
    "intel_receiver_object_id","intel_ciphertext_sha256_claim","intel_archive_date_utc",
    "receiver_ack_state","receiver_receipt_sha256","historical_restore_proof_sha256",
    "independent_restore_status","current_ciphertext_full_hash_verified",
    "current_restored_plaintext_hash_verified","fresh_independent_restore_this_catalog",
    "source_original_exclusion","unique_reclaimable_bytes","eligible_to_delete",
)
ROOT_FIELDS = (
    "generation","source_sha","build_id","origin_machine","origin_fs_uuid",
    "creation_date_utc","source_mtime_utc","native_source_inode",
    "source_allocated_bytes_gross","protection","source_full_content_verified",
    "intel_receiver_object_id","archive_sha256","receiver_ack_state",
    "independent_restore_status","one_use_copy_permit","retirement_permit",
    "eligible_to_delete",
)

def output_conveyor(old_database: Path, index: dict, json_out: Path, sqlite_out: Path) -> None:
    if (json_out.exists() or sqlite_out.exists() or json_out.is_symlink()
            or sqlite_out.is_symlink() or json_out.parent != sqlite_out.parent
            or json_out.parent.is_symlink()):
        raise ValueError("HOLD_OUTPUT_OVERWRITE_OR_UNSAFE_DIRECTORY")
    p = old_database.lstat()
    if not stat.S_ISREG(p.st_mode) or old_database.is_symlink():
        raise ValueError("HOLD_ORIGINAL_SQLITE_SOURCE_UNSAFE")
    old_umask = os.umask(0o077)
    try:
        newfd = os.open(sqlite_out, os.O_EXCL | os.O_CREAT | os.O_WRONLY, 0o600)
        os.close(newfd)
        with sqlite3.connect("file:" + str(old_database.resolve()) + "?mode=ro", uri=True) as old:
            if old.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("HOLD_ORIGINAL_DATABASE_CORRUPT")
            if old.execute("SELECT COUNT(*) FROM archives").fetchone()[0] != 23:
                raise ValueError("HOLD_ORIGINAL_ARCHIVE_COVERAGE")
            with sqlite3.connect(str(sqlite_out)) as new:
                old.backup(new)
                new.execute("CREATE TABLE factory_zips (" + ",".join(
                    f"{f} INTEGER" if f in ("native_source_inode","source_allocated_bytes_gross",
                    "current_ciphertext_full_hash_verified","current_restored_plaintext_hash_verified",
                    "fresh_independent_restore_this_catalog","eligible_to_delete")
                    else f"{f} TEXT" for f in FACTORY_FIELDS) + ")")
                new.execute("CREATE TABLE hel1_generations (" + ",".join(
                    f"{f} INTEGER" if f in ("native_source_inode","source_allocated_bytes_gross",
                    "source_full_content_verified","eligible_to_delete") else f"{f} TEXT"
                    for f in ROOT_FIELDS) + ")")
                new.executemany("INSERT INTO factory_zips VALUES (" +
                    ",".join("?" for _ in FACTORY_FIELDS) + ")",
                    [[int(row[f]) if type(row[f]) is bool else row[f] for f in FACTORY_FIELDS]
                     for row in index["factory_zips"]])
                new.executemany("INSERT INTO hel1_generations VALUES (" +
                    ",".join("?" for _ in ROOT_FIELDS) + ")",
                    [[int(row[f]) if type(row[f]) is bool else row[f] for f in ROOT_FIELDS]
                     for row in index["hel1_generations"]])
                for table, fields in (("factory_zips",("zip_sha256","source_sha","build_id",
                                           "origin_fs_uuid","decision","intel_receiver_object_id")),
                                      ("hel1_generations",("generation","source_sha",
                                           "build_id","origin_fs_uuid","protection"))):
                    for field in fields:
                        new.execute(f"CREATE INDEX idx_{table}_{field} ON {table}({field})")
                new.execute("PRAGMA user_version=4")
                if new.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("HOLD_CONVEYOR_DB_INTEGRITY")
        body=(json.dumps(index,indent=2,sort_keys=True,allow_nan=False)+"\n").encode()
        fd=os.open(json_out, os.O_EXCL | os.O_CREAT | os.O_WRONLY, 0o600)
        with os.fdopen(fd,"wb") as file:
            file.write(body);file.flush();os.fsync(file.fileno())
        if stat.S_IMODE(sqlite_out.stat().st_mode) != 0o600:
            raise ValueError("HOLD_NEW_DB_PERMISSIONS")
    finally:
        os.umask(old_umask)

def main() -> None:
    p=argparse.ArgumentParser()
    p.add_argument("--original-index-json",type=Path,required=True)
    p.add_argument("--original-index-sqlite",type=Path,required=True)
    p.add_argument("--factory-evidence",type=Path,required=True)
    p.add_argument("--hel1-evidence",type=Path,required=True)
    p.add_argument("--output-json",type=Path,required=True)
    p.add_argument("--output-sqlite",type=Path,required=True)
    a=p.parse_args()
    old,old_sha=safe_read(a.original_index_json)
    fac,fac_sha=safe_read(a.factory_evidence)
    root,root_sha=safe_read(a.hel1_evidence)
    factory_rows,root_rows=compile_sources(fac,root,old)
    index={"schema":SCHEMA,"generated_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
           "original_23_archive_records":old["entries"],
           "factory_zips":factory_rows,"hel1_generations":root_rows,
           "source_sha256":{"cold_json_v3":old_sha,"factory_fullsha_16":fac_sha,
                            "hel1_26_native_source":root_sha},
           "coverage":{"historical_intel_objects":23,"factory_zips":16,
                       "factory_historically_restored":5,"factory_unarchived":6,
                       "factory_active_or_hot_protected":5,"hel1_generations":26},
           "trust":{"intel_observation_utc":old.get("native_observation_utc"),
                    "factory_observation_utc":fac.get("observed_utc"),
                    "hel1_observation_utc":root.get("observed_utc"),
                    "fresh_ciphertext_rehash_by_this_script":False,
                    "fresh_isolated_restore_by_this_script":False,
                    "read_only_indexing_only":True,"new_transfers":0,
                    "new_deletions":0,"authorized_retirements":0}}
    output_conveyor(a.original_index_sqlite,index,a.output_json,a.output_sqlite)
    print(json.dumps({"status":"PASS_IMMUTABLE_COLD_CONVEYOR_INDEX",
        "sqlite":str(a.output_sqlite),"json":str(a.output_json),
        "json_sha256":sha(a.output_json.read_bytes()),"archives":23,
        "factory":16,"hel1":26,"new_copies":0,"new_retires":0},sort_keys=True))

if __name__=="__main__":
    main()
