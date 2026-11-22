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
    def test_generation_only_from_exact_verified_source_and_build(self):
        a,b,r=fixtures()
        row=mod.build_catalog(a,b,r)["entries"][0]
        self.assertEqual(row["generation"],"aaaaaaaaaaaa")
        self.assertIsNone(row["source_filesystem"])
        self.assertEqual(row["receiver_object_id"],row["object_id"])
        self.assertEqual(row["receiver_ack_state"],"RECEIVER_READBACK_RECEIPT_CLAIM")
        self.assertIsNone(row["original_source_bytes"])
        self.assertFalse(row["current_digest_reverified"])
        r["rows"][0]["build_id"]="NOT-THE-RESTORED-BUILD"
        row=mod.build_catalog(a,b,r)["entries"][0]
        self.assertIsNone(row["generation"])
        self.assertIsNone(row["source_sha"])

    def test_receiver_ack_not_inferred_from_file_presence(self):
        a,b,r=fixtures()
        a["receipts"]=[]
        row=mod.build_catalog(a,b,r)["entries"][0]
        self.assertEqual(row["receiver_ack_state"],"NO_AUTHENTICATED_RECEIVER_ACK")
        self.assertIsNone(row["archive_sha256_receipt_claim"])
        self.assertIsNone(row["source_filesystem"])

    def test_receiver_hmac_separate_from_restoration_and_current_readback(self):
        a,b,r=fixtures()
        a["proofs"][0]["receiver_receipt_HMAC_verified"]=True
        row=mod.build_catalog(a,b,r)["entries"][0]
        self.assertEqual(row["receiver_ack_state"],"HISTORICAL_HMAC_VERIFIED")
        self.assertFalse(row["current_digest_reverified"])
        self.assertIsNone(row["source_filesystem"])

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
    def test_cold_nomination_requires_exact_source_owner_hot_pins(self):
        a,b,r=fixtures()
        r["count"]=len(r["rows"])
        r["measured_count"]=len(r["rows"])
        for x in r["rows"]:
            x["allocation_status"]="MEASURED_SELECTED_TREE"
            x["mtime_ns"]=100
        result=mod.nominate_one_cold_copy_on_promotion(
            r,live_service_generations={"web":"aaaaaaaaaaaa",
              "appearance":"bbbbbbbbbbbb","social":"cccccccccccc"},
            source_attested_hot_rollback_generations=None)
        self.assertEqual(result["status"],"HOLD_EXACT_TWO_HOT_PINS_NOT_ADMITTED")
        self.assertIsNone(result["candidate"])
        self.assertFalse(result["apply"])

    def test_one_nominated_unpinned_generation_never_implies_copy(self):
        a,b,r=fixtures()
        r["rows"].append({"generation":"dddddddddddd","source_sha":"d"*40,
             "build_id":"BUILD-4","allocated_bytes":12345,
             "allocation_status":"MEASURED_SELECTED_TREE","mtime_ns":1})
        r["count"]=4;r["measured_count"]=4
        for x in r["rows"][:3]:
            x["allocation_status"]="MEASURED_SELECTED_TREE"
            x["mtime_ns"]=300
        roots={"web":"aaaaaaaaaaaa","appearance":"bbbbbbbbbbbb","social":"cccccccccccc"}
        q=mod.nominate_one_cold_copy_on_promotion(
            r,live_service_generations=roots,
            source_attested_hot_rollback_generations=["aaaaaaaaaaaa","bbbbbbbbbbbb"])
        self.assertEqual(q["candidate"]["generation"],"dddddddddddd")
        self.assertFalse(q["apply"])
        self.assertEqual(q["new_copies"],0)
        self.assertEqual(q["new_deletions"],0)
        self.assertEqual(q["exact_copy_permission"],"NOT_VALIDATED")
        protected=mod.nominate_one_cold_copy_on_promotion(
            r,live_service_generations=roots,
            source_attested_hot_rollback_generations=["aaaaaaaaaaaa","bbbbbbbbbbbb"],
            protected_original_generations=["dddddddddddd"])
        self.assertIsNone(protected["candidate"])

    def test_three_cold_proof_pins_fail_closed(self):
        a,b,r=fixtures()
        z=mod.plan_hot_runtime(r,active_roles={"web":"aaaaaaaaaaaa"},
            exact_hot_rollback_ids=["bbbbbbbbbbbb","cccccccccccc"],catalog=mod.build_catalog(a,b,r))
        self.assertTrue(all("THREE_SOURCE_ADMITTED_COLD_CHECKPOINTS_NOT_PROVEN" in row["missing_evidence"]
                            for row in z["actions"]))
        with self.assertRaises(ValueError):
            mod.plan_hot_runtime(r,active_roles={},exact_proven_cold_checkpoint_ids=["a"*40,"b"*40])
        with self.assertRaises(ValueError):
            mod.plan_hot_runtime(r,active_roles={},exact_proven_cold_checkpoint_ids=["a"*40]*3)

    def test_more_than_two_hot_pins_rejected(self):
        a,b,r=fixtures()
        with self.assertRaises(ValueError):
            mod.plan_hot_runtime(r,active_roles={},exact_hot_rollback_ids=["a"*12,"b"*12,"c"*12])

    def factory_zip_synthetic_census(self):
        entries = []
        for n in range(16):
            digest = f"{n+1:064x}"
            entries.append({
                "zip_basename": digest + ".zip",
                "archive_sha256_full_reread": digest,
                "zip_artifact_digest_matches_exact_filename": True,
                "source_sha": f"{n+1:040x}",
                "build_id": "ACTUAL-BUILD-" + str(n),
                "source_ino": 200 + n,
                "source_dev": 16777234, "source_nlink": 1,
                "source_allocated_blocks_bytes": 615378944,
                "linux_receipt_source_and_manifest_verified": True,
                "known_runtime_service_or_rollback_role":
                    "NO_DIRECT_ACTIVE_WEB_APPEARANCE_SOCIAL_OR_TWO_HOT_MATCH_IN_KNOWN_SET",
                "prior_historical_independent_restoration_asserted": False,
                "prior_original_retirement_allowed": None,
            })
        return {"schema": mod.FACTORY_ZIP_INVENTORY,
                "zip_count":16, "source_root_dev":16777234,
                "source_full_sha256_reread_for_each_zip":True,
                "source_sha_build_id_crosschecked_per_artifact_and_linux_build_receipt":True,
                "rows":entries}

    def test_factory_zip_full_16_receipts_historical_no_delete(self):
        census=self.factory_zip_synthetic_census()
        row=census["rows"][0]
        row["prior_historical_independent_restoration_asserted"]=True
        row["prior_original_retirement_allowed"]=False
        q=mod.review_exact_factory_zip_for_retention(census,row["archive_sha256_full_reread"])
        self.assertEqual(q["status"],"HOLD_EXPLICIT_HISTORICAL_L4_RETIREMENT_DENIAL")
        self.assertFalse(q["apply"])
        self.assertEqual(q["new_deletions"],0)
        self.assertEqual(q["new_archives"],0)
        self.assertIsNone(q["expected_unique_APFS_gain_bytes"])
        self.assertEqual(q["candidate"]["source_ino"],200)
        self.assertFalse(q["producer_policy"]["automatic_age_expiry"])

    def test_factory_zip_live_and_hot_roles_protected(self):
        census=self.factory_zip_synthetic_census()
        for role in ("LIVE_SOCIAL_WRITER_KEEP","CANDIDATE_HOT_ROLLBACK_1_KEEP"):
            census["rows"][0]["known_runtime_service_or_rollback_role"]=role
            q=mod.review_exact_factory_zip_for_retention(
                census,census["rows"][0]["archive_sha256_full_reread"])
            self.assertEqual(q["status"],"HOLD_PROTECTED_OR_UNADMITTED_HOT_ROLE")
            self.assertFalse(q["apply"])

    def test_factory_zip_no_cold_copy_never_auto_transfers(self):
        census=self.factory_zip_synthetic_census()
        q=mod.review_exact_factory_zip_for_retention(
            census,census["rows"][2]["archive_sha256_full_reread"])
        self.assertEqual(q["status"],"HOLD_SOURCE_CLASS_COPY_AND_INDEPENDENT_RESTORE_MISSING")
        self.assertFalse(q["apply"])
        self.assertEqual(q["new_archives"],0)

    def test_factory_zip_incomplete_duplicate_or_mismatched_digest_holds(self):
        census=self.factory_zip_synthetic_census()
        target=census["rows"][1]["archive_sha256_full_reread"]
        census["source_full_sha256_reread_for_each_zip"]=False
        self.assertEqual(mod.review_exact_factory_zip_for_retention(census,target)["status"],
                         "HOLD_INCOMPLETE_OR_UNVERIFIED_ZIP_CENSUS")
        census["source_full_sha256_reread_for_each_zip"]=True
        census["rows"][1]["archive_sha256_full_reread"]=census["rows"][0]["archive_sha256_full_reread"]
        self.assertEqual(mod.review_exact_factory_zip_for_retention(census,target)["status"],
                         "HOLD_SOURCE_METADATA_OR_DUPLICATE_IDENTITY")

    def test_factory_zip_exact_review_not_a_retirement_permit(self):
        census=self.factory_zip_synthetic_census()
        census["signed_owner_permit"]="YES"
        census["rows"][0]["existing_exact_item_retirement_permit_validated"]=True
        q=mod.review_exact_factory_zip_for_retention(
            census,census["rows"][0]["archive_sha256_full_reread"])
        self.assertEqual(q["exact_one_item_L4_retirement_permission"],"NOT_VALIDATED")
        self.assertFalse(q["apply"])
        self.assertEqual(q["new_deletions"],0)


    def exact_hel1_owner_nomination_fixture(self):
        _, _, r = fixtures()
        for row in r["rows"]:
            row.update(device=2049, inode=100 + len(row["generation"]),
                       allocation_status="MEASURED_SELECTED_TREE", mtime_ns=123)
        r["count"] = len(r["rows"])
        r["measured_count"] = len(r["rows"])
        r["mount_dev"] = 2049
        r["rows"].append({
            "generation":"4c14cbc7c518",
            "source_sha":"4c14cbc7c518f9b28e1d84b5f88a022a82f7d2e7",
            "build_id":"w-tDoD2iUw6P2P4oTw3Ti",
            "device":2049,"inode":4493824,"allocated_bytes":1584885760,
            "allocation_status":"MEASURED_SELECTED_TREE","mtime_ns":200,
        })
        r["count"]=r["measured_count"]=len(r["rows"])
        target={
            "generation":"4c14cbc7c518",
            "source_sha":"4c14cbc7c518f9b28e1d84b5f88a022a82f7d2e7",
            "build_id":"w-tDoD2iUw6P2P4oTw3Ti",
            "host":"HEL1", "fs":"/dev/sda1", "root_dev":2049,
            "root_inode":4493824,
            "fs_uuid":"64f6fb02-4fed-4836-a33b-86e8993afdfa",
            "file_content_manifest_sha256":"6"*64,
            "regular_files_hashed":45036,"entries":51438,
            "gross_allocated_bytes":1584885760,
        }
        # Bind synthetic current + hot source to fixture without granting them authority.
        hot={"schema":"aoe2war.we2.factory-current-two-hot-source-dossier.v1",
             "active":{k:r["rows"][0][k] for k in ("generation","source_sha","build_id")},
             "hot_rollback_candidates":[
                 {k:r["rows"][i][k] for k in ("generation","source_sha","build_id")}
                 for i in (1,2)],
             "hot_pinset_admitted":False,
             "owner_admission":"PENDING_EXACT_DECISION"}
        docket={"schema":"aoe2war.we4.first-generation-copy-admission-docket.v1",
                "target":target}
        return r,docket,hot

    def test_explicit_4c14_nomination_is_not_automatic_31a(self):
        r,d,h=self.exact_hel1_owner_nomination_fixture()
        r["rows"].append({
            "generation":"31a70ba2dd4d","source_sha":"31a70ba2dd4d"+"a"*28,
            "build_id":"OLD-BUILD-31A","device":2049,"inode":2072202,
            "allocated_bytes":1580572672,"allocation_status":"MEASURED_SELECTED_TREE",
            "mtime_ns":1})
        r["count"]=r["measured_count"]=len(r["rows"])
        x=mod.review_explicit_hel1_owner_copy_nomination(
            r,d,h,owner_selected_generation="4c14cbc7c518")
        self.assertEqual(x["candidate"]["generation"],"4c14cbc7c518")
        self.assertEqual(x["candidate"]["root_inode"],4493824)
        self.assertEqual(x["status"],"HOLD_CURRENT_TWO_HOT_OWNER_ADMISSION")
        self.assertFalse(x["automatic_oldest_candidate_override"])
        self.assertFalse(x["apply"])
        self.assertEqual(x["new_copies"],0)
        self.assertEqual(x["new_deletions"],0)

    def test_explicit_nomination_wrong_requested_generation_is_held(self):
        r,d,h=self.exact_hel1_owner_nomination_fixture()
        x=mod.review_explicit_hel1_owner_copy_nomination(
            r,d,h,owner_selected_generation="31a70ba2dd4d")
        self.assertEqual(x["status"],"HOLD_EXACT_ROOT_IDENTITY_MISMATCH")
        self.assertIsNone(x["candidate"])

    def test_explicit_nomination_catches_inode_uuid_build_manifest_drift(self):
        r,d,h=self.exact_hel1_owner_nomination_fixture()
        for key,value in (("root_inode",11),("build_id","NOT-WRONG-BUILD"),
                          ("source_sha","f"*40),("gross_allocated_bytes",1)):
            changed=dict(d["target"],**{key:value})
            out=mod.review_explicit_hel1_owner_copy_nomination(
                r,{"schema":d["schema"],"target":changed},h,
                owner_selected_generation="4c14cbc7c518")
            self.assertIn("HOLD_",out["status"])
            self.assertNotEqual(out["status"],"HOLD_CURRENT_TWO_HOT_OWNER_ADMISSION")
            self.assertFalse(out["apply"])
        changed=dict(d["target"],fs_uuid="not-an-original-fs")
        out=mod.review_explicit_hel1_owner_copy_nomination(
            r,{"schema":d["schema"],"target":changed},h,
            owner_selected_generation="4c14cbc7c518")
        self.assertEqual(out["status"],"HOLD_EXACT_ROOT_IDENTITY_MISMATCH")
        changed=dict(d["target"],file_content_manifest_sha256="notsha")
        out=mod.review_explicit_hel1_owner_copy_nomination(
            r,{"schema":d["schema"],"target":changed},h,
            owner_selected_generation="4c14cbc7c518")
        self.assertEqual(out["status"],"HOLD_EXACT_ROOT_IDENTITY_MISMATCH")

    def test_explicit_nomination_fake_hot_admission_cannot_grant_copy(self):
        r,d,h=self.exact_hel1_owner_nomination_fixture()
        h["owner_admission"]="ADMITTED"
        h["hot_pinset_admitted"]=True
        h["independent_approval_signature"]="FAKE"
        x=mod.review_explicit_hel1_owner_copy_nomination(
            r,d,h,owner_selected_generation="4c14cbc7c518")
        self.assertEqual(x["status"],"HOLD_EXTERNAL_OWNER_SIGNATURE_AND_COPY_CLASS_VERIFIER")
        self.assertFalse(x["hot_pinset_source_dossier_checked_as_signature"])
        self.assertFalse(x["one_use_copy_permission_validated"])
        self.assertEqual(x["new_archives"],0)

    def test_explicit_nomination_protected_live_hot_conflict(self):
        r,d,h=self.exact_hel1_owner_nomination_fixture()
        h["hot_rollback_candidates"][0]={
            "generation":"4c14cbc7c518",
            "source_sha":d["target"]["source_sha"],
            "build_id":d["target"]["build_id"]}
        x=mod.review_explicit_hel1_owner_copy_nomination(
            r,d,h,owner_selected_generation="4c14cbc7c518")
        self.assertEqual(x["status"],"HOLD_CURRENT_OR_HOT_PIN_SOURCE_CONFLICT")
        self.assertFalse(x["apply"])

    def test_original_preserved_tar_stage_remains_keep(self):
        good={"schema":"aoe2war.we2.factory-historical-transport-retention-receipt.v1",
              "items":[{"sourceRemovedAfterVerifiedPreservation":True,"sha256":"a"*64}]}
        self.assertEqual(mod.stage_retention_gate(good)["status"],"PRESERVED_RECOVERY_ORIGINALS_KEEP")
        self.assertFalse(mod.stage_retention_gate(good)["new_retirement_permission"])
        good["items"][0]["sourceRemovedAfterVerifiedPreservation"]=False
        with self.assertRaises(ValueError):mod.stage_retention_gate(good)

if __name__ == "__main__":
    unittest.main()
