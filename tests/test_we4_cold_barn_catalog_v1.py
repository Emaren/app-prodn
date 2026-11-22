"""WE4 Cold Barn: source-owned evidence separation and non-mutating retention guards."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SRC=Path(__file__).resolve().parents[1]/"scripts/release/we4_cold_barn_catalog_v1.py"
spec=importlib.util.spec_from_file_location("we4_cold_barn",SRC)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

SOURCE="a"*40
CIPHER="c"*64
def fixtures():
    native={"schema":"we4.intel.cold-barn.native-readonly.v1","observed_utc":"2026-11-22T04:21:23Z",
        "items":[{"namespace":"M1-ARCHIVE","basename":"WE2R3-M1_COLD-example.age","inode":42,
                  "dev":7,"logical_bytes":124,"allocated_bytes":4096,"mtime_ns":111,"links":1}],
        "receipts":[{"namespace":"M1-ARCHIVE","receipt_basename":"WE2R3-M1_COLD-example.json",
                     "ciphertext_bytes":124,"ciphertext_sha256":CIPHER,"readback_sha256":CIPHER,
                     "status":"CIPHERTEXT_LOCAL_READBACK_VERIFIED","observed_at":"2026-11-20T01:00:00Z",
                     "class_id":"M1_COLD","receipt_sha256":"d"*64}],
        "proofs":[{"namespace":"M1-ARCHIVE","campaign_id":"WE2R3",
                    "independent_restore":"PASS_FULL_ORIGINAL_AND_MEMBER_SHA256_PARITY",
                    "independent_age_decrypt_exit":0,"ciphertext_readback_sha_verified":True,
                    "source_commit":SOURCE,"build_id":"BUILD-1","restored_original_zip_sha256":"e"*64,
                    "proof_sha256":"f"*64,"observed_utc":"2026-11-20T02:00:00Z"}]}
    history={"schema":"aoe2war.storage-intel.signed-envelope.v1",
        "payload":{"schema":"aoe2war.storage-intel.source-observation.v1",
                   "observed_at_utc":"2026-11-20T01:00:00Z",
                   "items":[{"namespace":"M1_ARCHIVE","dev":7,"inode":42,
                             "logical_bytes":124,"mtime_ns":111,"links":1}]}}
    runtime={"schema":"we4.hel1.actual-runtime-inventory.v1","rows":[
        {"generation":"aaaaaaaaaaaa","source_sha":SOURCE,"build_id":"BUILD-1","allocated_bytes":1000},
        {"generation":"bbbbbbbbbbbb","source_sha":"b"*40,"build_id":"BUILD-2","allocated_bytes":1000},
        {"generation":"cccccccccccc","source_sha":"c"*40,"build_id":"BUILD-3","allocated_bytes":1000},
    ]}
    return native,history,runtime

class CatalogTests(unittest.TestCase):
    def test_positive_prior_proof_is_historical_only(self):
        a,b,r=fixtures()
        q=mod.build_catalog(a,b,r)
        self.assertEqual(q["current_object_count"],1)
        self.assertEqual(q["historical_identity_matches"],1)
        self.assertEqual(q["historical_restore_proof_assertions"],1)
        row=q["entries"][0]
        self.assertEqual(row["source_sha"],SOURCE)
        self.assertEqual(row["build_id"],"BUILD-1")
        self.assertEqual(row["archive_sha256_receipt_claim"],CIPHER)
        self.assertFalse(row["current_digest_reverified"])
        self.assertFalse(q["current_full_restore_validated"])
        self.assertEqual(q["all_copy_and_retirement_authority"],"HOLD")
    def test_no_restoration_from_receiver_receipt_alone(self):
        a,b,r=fixtures();a["proofs"]=[]
        q=mod.build_catalog(a,b,r)
        self.assertEqual(q["entries"][0]["restore_status"],"NOT_PROVEN")
        self.assertIsNone(q["entries"][0]["source_sha"])
    def test_failed_decrypt_is_not_success(self):
        a,b,r=fixtures();a["proofs"][0]["independent_age_decrypt_exit"]=1
        self.assertEqual(mod.build_catalog(a,b,r)["entries"][0]["restore_status"],"NOT_PROVEN")
    def test_mismatching_inode_identity_not_historical(self):
        a,b,r=fixtures();a["items"][0]["inode"]=43
        self.assertFalse(mod.build_catalog(a,b,r)["entries"][0]["historical_source_identity_match"])
    def test_mismatching_receipt_readback_withholds_digest(self):
        a,b,r=fixtures();a["receipts"][0]["readback_sha256"]="f"*64
        self.assertIsNone(mod.build_catalog(a,b,r)["entries"][0]["archive_sha256_receipt_claim"])
    def test_conflicting_runtime_build_holds_source_lineage(self):
        a,b,r=fixtures();r["rows"][0]["build_id"]="DIFFERENT"
        q=mod.build_catalog(a,b,r)
        self.assertIsNone(q["entries"][0]["source_sha"])
    def test_duplicate_native_objects_rejected(self):
        a,b,r=fixtures();a["items"].append(dict(a["items"][0]))
        with self.assertRaises(ValueError):mod.build_catalog(a,b,r)
    def test_invalid_object_name_rejected(self):
        a,b,r=fixtures();a["items"][0]["basename"]="../secret.age"
        with self.assertRaises(ValueError):mod.build_catalog(a,b,r)
    def test_source_owned_v2_factory_restore_proof_format(self):
        a,b,r=fixtures()
        a["proofs"]=[{"namespace":"M1-ARCHIVE","proof_basename":"WE2R3-independent-restore-proof.json",
            "schema":"aoe2war.we2.intel-v2-independent-factory-restore.v1",
            "ciphertext_sha256":CIPHER,"independent_decrypt":True,
            "receiver_hmac_verified":True,"three_member_parity":True,
            "signed_sender_commit":True,"source_sha256":"e"*64,"proof_sha256":"f"*64}]
        q=mod.build_catalog(a,b,r)
        self.assertEqual(q["historical_restore_proof_assertions"],1)
        self.assertEqual(q["entries"][0]["source_original_sha256"],"e"*64)
        a["proofs"][0]["receiver_hmac_verified"]=False
        self.assertEqual(mod.build_catalog(a,b,r)["historical_restore_proof_assertions"],0)

    def test_large_factory_full_ciphertext_reread_schema(self):
        a,b,r=fixtures()
        a["proofs"]=[{"namespace":"M1-ARCHIVE","proof_basename":"WE2R3-independent-restore-proof.json",
            "schema":"aoe2war.we2.intel-v2-restored-large-factory.v1",
            "ciphertext_sha256":CIPHER,"intel_independent_age_decrypt_pass":True,
            "intel_independent_ciphertext_full_reread":True,
            "intel_independent_original_zip_sha_parity":True,
            "all_three_member_sha_parity":True,
            "intel_v2_receipt_hmac_verified":True,"proof_sha256":"f"*64}]
        self.assertEqual(mod.build_catalog(a,b,r)["historical_restore_proof_assertions"],1)
        a["proofs"][0]["ciphertext_sha256"]="d"*64
        self.assertEqual(mod.build_catalog(a,b,r)["historical_restore_proof_assertions"],0)

    def test_synthetic_receipt_never_full_factory_restore(self):
        a,b,r=fixtures()
        a["proofs"]=[{"namespace":"M1-ARCHIVE","campaign_id":"WE2R3",
            "schema":"aoe2war.we2.intel-synthetic-independent-restore.v1",
            "intel_ciphertext_full_reread_verified":True,
            "intel_receipt_hmac_verified":True,
            "synthetic_data_only":True}]
        self.assertEqual(mod.build_catalog(a,b,r)["historical_restore_proof_assertions"],0)

    def test_searchable_owner_only_sqlite_and_no_overwrite(self):
        a,b,r=fixtures();idx=mod.build_catalog(a,b,r)
        with tempfile.TemporaryDirectory() as temp:
            jp=Path(temp)/"catalog.json";sp=Path(temp)/"catalog.sqlite"
            mod.output_index(idx,jp,sp)
            self.assertEqual(len(mod.query(sp,"application","M1_FACTORY")),1)
            self.assertEqual(len(mod.query(sp,"build_id","BUILD-1")),1)
            with self.assertRaises(ValueError):mod.query(sp,"source; DROP TABLE","x")
            with self.assertRaises(ValueError):mod.output_index(idx,jp,sp)
    def test_active_and_two_hot_pins_always_keep(self):
        a,b,r=fixtures();idx=mod.build_catalog(a,b,r)
        result=mod.plan_hot_runtime(r,active_roles={"web":"aaaaaaaaaaaa",
                "appearance":"bbbbbbbbbbbb","social":"cccccccccccc"},
                exact_hot_rollback_ids=["bbbbbbbbbbbb","cccccccccccc"],catalog=idx)
        self.assertEqual(result["target_hot_limit_per_family"],3)
        self.assertEqual(result["new_deletions"],0)
        self.assertTrue(all(x["action"]=="KEEP_HOLD" for x in result["actions"]))
        self.assertTrue(all(x["unique_reclaimable_bytes"] is None for x in result["actions"]))
    def test_no_authenticated_hot_pins_holds_all(self):
        a,b,r=fixtures()
        result=mod.plan_hot_runtime(r,active_roles={"web":"aaaaaaaaaaaa",
           "appearance":"bbbbbbbbbbbb","social":"cccccccccccc"})
        self.assertTrue(all("FACTORY_ROLLBACK_PINS_NOT_ADMITTED" in x["missing_evidence"] for x in result["actions"]))
    def test_more_than_two_hot_pins_rejected(self):
        a,b,r=fixtures()
        with self.assertRaises(ValueError):
            mod.plan_hot_runtime(r,active_roles={},exact_hot_rollback_ids=["a"*12,"b"*12,"c"*12])
    def test_original_preserved_tar_stage_remains_keep(self):
        good={"schema":"aoe2war.we2.factory-historical-transport-retention-receipt.v1",
              "items":[{"sourceRemovedAfterVerifiedPreservation":True,"sha256":"a"*64}]}
        self.assertEqual(mod.stage_retention_gate(good)["status"],"PRESERVED_RECOVERY_ORIGINALS_KEEP")
        self.assertFalse(mod.stage_retention_gate(good)["new_retirement_permission"])
        good["items"][0]["sourceRemovedAfterVerifiedPreservation"]=False
        with self.assertRaises(ValueError):mod.stage_retention_gate(good)

if __name__ == "__main__":
    unittest.main()
