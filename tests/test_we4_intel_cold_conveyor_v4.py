#!/usr/bin/env python3
"""Fail-closed Intel conveyor v4 source contract tests; no receiver/network."""
import importlib.util
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

HERE=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
    "conveyor",HERE/"scripts/release/we4_intel_cold_conveyor_v4.py")
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def fixture():
    fac=[]
    for i in range(16):
        digest=f"{i+1:064x}"
        kind=("KEEP_ACTIVE_OR_HOT" if i < 5 else
              "RESTORED_HISTORICALLY_BUT_RETIREMENT_PERMIT_DENIED" if i < 10 else
              "COLD_COPY_CANDIDATE_WITH_REQUIRED_NEW_AUTH")
        fac.append({"archive_sha256_full_reread":digest,"source_sha":f"{i+1:040x}",
            "zip_basename":digest+".zip","build_id":"BUILD_1234_"+str(i),
            "zip_artifact_digest_matches_exact_filename":True,
            "linux_receipt_source_and_manifest_verified":True,
            "source_dev":16777234,"source_ino":i+11,"source_mtime_ns":1795000000000000000,
            "source_allocated_blocks_bytes":9868439552//16+(9868439552%16 if i==0 else 0),
            "prior_historical_independent_restoration_asserted":5<=i<10,
            "prior_original_retirement_allowed":False if 5<=i<10 else None,
            "decision":kind})
    factory={"schema":m.ZIP_SCHEMA,"zip_count":16,"source_root_dev":16777234,
      "source_full_sha256_reread_for_each_zip":True,
      "source_sha_build_id_crosschecked_per_artifact_and_linux_build_receipt":True,
      "rows":fac}
    rows=[]
    for i in range(26):
        gen="4c14cbc7c518" if i==20 else f"{i+1:012x}"
        rows.append({"generation":gen,"source_sha":gen+"f"*28,
         "build_id":"RUNTIME_BUILD_"+str(i),"device":2049,"inode":100+i,
         "allocated_bytes":1584885760,"mtime_ns":1795000000000000000,
         "allocation_status":"MEASURED_SELECTED_TREE"})
    runtime={"schema":m.ROOT_SCHEMA,"mount_dev":2049,"count":26,
             "measured_count":26,"rows":rows}
    coldrows=[]
    for i in range(23):
        x={"object_id":"ARCHIVE_"+str(i),"source_original_sha256":
            fac[i]["archive_sha256_full_reread"] if 5<=i<10 else None,
            "restore_status":"HISTORICAL_PROOF_ASSERTS_FULL_RESTORE" if 5<=i<10 else "NOT_PROVEN",
            "receiver_object_id":"ARCHIVE_"+str(i),
            "archive_sha256_receipt_claim":f"{i+60:064x}",
            "archive_date_utc":"2026-11-19T01:02:03Z",
            "receiver_ack_state":"RECEIVER_READBACK_RECEIPT_CLAIM",
            "receiver_receipt_sha256":f"{i+80:064x}",
            "restore_proof_sha256":f"{i+90:064x}" if 5<=i<10 else None}
        coldrows.append(x)
    cold={"schema":m.COLD_SCHEMA,"current_object_count":23,
          "historical_restore_proof_assertions":6,"entries":coldrows}
    return factory,runtime,cold

class ConveyorTests(unittest.TestCase):
    def test_all_three_collections_and_unknown_date_provenance(self):
        fac,root,cold=fixture()
        z,r=m.compile_sources(fac,root,cold)
        self.assertEqual((len(z),len(r)),(16,26))
        self.assertEqual(sum(x["source_allocated_bytes_gross"] for x in z),9868439552)
        self.assertEqual(sum(x["intel_receiver_object_id"] is not None for x in z),5)
        self.assertEqual(sum(x["decision"]=="KEEP_ACTIVE_OR_HOT" for x in z),5)
        self.assertEqual(sum(x["intel_receiver_object_id"] is None for x in z),11)
        self.assertEqual(sum(x["decision"]=="COLD_COPY_CANDIDATE_WITH_REQUIRED_NEW_AUTH" for x in z),6)
        self.assertEqual(sum(x["historical_full_content_proof_present"] for x in r),0)
        self.assertTrue(all(x["creation_date_utc"] is None for x in z+r))
        self.assertTrue(all(x["eligible_to_delete"] is False for x in z+r))
        self.assertTrue(all(x["fresh_independent_restore_this_catalog"] is False for x in z))
        self.assertEqual(z[5]["origin_fs_uuid"],m.SOURCE_FS_UUID)
        self.assertEqual(r[20]["origin_fs_uuid"],m.ROOT_FS_UUID)

    def test_historical_full_root_needs_separate_exact_docket(self):
        f,r,c=fixture()
        row=r["rows"][20]
        row["source_sha"]="4c14cbc7c518f9b28e1d84b5f88a022a82f7d2e7"
        row["build_id"]="w-tDoD2iUw6P2P4oTw3Ti"
        row["inode"]=4493824
        docket={"schema":"aoe2war.we4.first-generation-copy-admission-docket.v1",
          "target":{
            "generation":"4c14cbc7c518",
            "source_sha":"4c14cbc7c518f9b28e1d84b5f88a022a82f7d2e7",
            "build_id":"w-tDoD2iUw6P2P4oTw3Ti",
            "fs_uuid":m.ROOT_FS_UUID,
            "root_dev":2049,"root_inode":4493824,
            "regular_files_hashed":45036,
            "file_content_manifest_sha256":
              "60ba8c3561bed95b8f72dcb97f805516a55c5963a0f6c182ea94536c4f6f6647"},
          "source_evidence":{"integrity_manifest_sha256":
            "d96aa4edf0dcf2a117b2cb46a1e4ee4a69da8bdcf22db779610adff5043c50bc"}}
        z,roots=m.compile_sources(f,r,c,full_root_docket=docket)
        self.assertEqual(sum(x["historical_full_content_proof_present"] for x in roots),1)
        self.assertFalse(any(x["eligible_to_delete"] for x in roots))
        docket["target"]["fs_uuid"]="17f6fb02-4fed-4836-a33b-86e8993afdfa"
        with self.assertRaisesRegex(ValueError,"UNBOUND_HISTORICAL_ROOT"):
            m.compile_sources(f,r,c,full_root_docket=docket)

    def test_missing_or_dishonest_cold_proof_fails(self):
        f,r,c=fixture()
        c["entries"][5]["restore_status"]="NOT_PROVEN"
        with self.assertRaisesRegex(ValueError,"RESTORE_JOIN"):
            m.compile_sources(f,r,c)
        f,r,c=fixture()
        c["entries"][6]["source_original_sha256"]=c["entries"][5]["source_original_sha256"]
        with self.assertRaisesRegex(ValueError,"DUPLICATE"):
            m.compile_sources(f,r,c)

    def test_active_or_hot_and_l4_denial_are_never_downgraded(self):
        f,r,c=fixture()
        f["rows"][5]["prior_original_retirement_allowed"]=True
        with self.assertRaisesRegex(ValueError,"L4_DENIAL"):
            m.compile_sources(f,r,c)
        f,r,c=fixture()
        f["rows"][0]["decision"]="RESTORED_HISTORICALLY_BUT_RETIREMENT_PERMIT_DENIED"
        with self.assertRaisesRegex(ValueError,"PROTECTION_COUNTS"):
            m.compile_sources(f,r,c)

    def test_exact_total_and_runtime_coverage_fail_closed(self):
        f,r,c=fixture()
        f["rows"][0]["source_allocated_blocks_bytes"]+=512
        with self.assertRaisesRegex(ValueError,"GROSS_SUM"):
            m.compile_sources(f,r,c)
        f,r,c=fixture()
        r["rows"][20]["generation"]="31a70ba2dd4d"
        r["rows"][20]["source_sha"]="31a70ba2dd4d"+"f"*28
        with self.assertRaisesRegex(ValueError,"NAMED_HEL1"):
            m.compile_sources(f,r,c)

    def test_new_0600_sqlite_preserves_original_23_and_refuses_overwrite(self):
        f,r,c=fixture()
        z,roots=m.compile_sources(f,r,c)
        with tempfile.TemporaryDirectory() as d:
            base=Path(d)
            original=base/"original.sqlite"
            with sqlite3.connect(original) as db:
                db.execute("CREATE TABLE archives (object_id TEXT)")
                db.executemany("INSERT INTO archives VALUES (?)",
                               [(str(i),) for i in range(23)])
            out={"factory_zips":z,"hel1_generations":roots}
            jp,sp=base/"conveyor.json",base/"conveyor.sqlite"
            m.output_conveyor(original,out,jp,sp)
            self.assertEqual(jp.stat().st_mode & 0o777,0o600)
            self.assertEqual(sp.stat().st_mode & 0o777,0o600)
            with sqlite3.connect(sp) as db:
                self.assertEqual([db.execute("SELECT count(*) FROM "+t).fetchone()[0]
                  for t in ("archives","factory_zips","hel1_generations")],[23,16,26])
                self.assertEqual(db.execute("pragma integrity_check").fetchone()[0],"ok")
            with self.assertRaisesRegex(ValueError,"OVERWRITE"):
                m.output_conveyor(original,out,jp,sp)
            with sqlite3.connect(original) as db:
                self.assertEqual(db.execute("SELECT count(*) FROM archives").fetchone()[0],23)

if __name__=="__main__":
    unittest.main()
