"""Original Factory birth registration: T5/T8/T10 proven source, UNKNOWN=HOLD.

No host, ssh, root, V6, deletion or actual Factory release in test cases.
"""
from __future__ import annotations
import copy
import datetime
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import aoe2_factory_retention_post_t10 as M

SOURCE="d"*40
PREV="e"*40
BUILD="Original_T10_Build001"
PREV_BUILD="Original_T8_Build001"
SHA="a"*64


def object_record(kind, *, identity=True, expected=True, proof=True):
    phase = "T5" if kind in M.BIRTH_CLASS["T5"] else (
        "T8" if kind in M.BIRTH_CLASS["T8"] else "T10")
    remote=kind.startswith("HEL1_")
    suffix=kind.lower().replace("_","-")
    path=("/var/lib/aoe2war-web-prod-"+PREV[:12] if kind=="HEL1_ROLLBACK_GENERATION"
          else "/var/lib/aoe2war-web-prod-"+SOURCE[:12]
          if kind=="HEL1_LIVE_GENERATION"
          else "/home/tony/.aoe2war-b-os-"+SOURCE[:12]+"-run-101/runtime.tar.gz"
          if kind=="HEL1_TRANSPORT_TAR"
          else "/Users/tonyblum/.aoe2war-product-releases/"+suffix+".json")
    f={"device":16777234,"inode":23233,"logical_bytes":20000,
       "allocated_bytes":20480,"uid":501,"mode":0o600,
       "nlink":1,"mtime_ns":1795350000000000000} if identity else None
    return {
        "kind":kind,"path":path,"identity":f,
        "expected_sha256":SHA if expected else None,
        "verified_source_sha256":SHA if proof else None,
        "observed_at_utc":"2026-11-22T17:49:00Z" if identity else None,
        "generation_source_sha":PREV if phase=="T8" else SOURCE,
        "generation_build_id":PREV_BUILD if phase=="T8" else BUILD,
    }


def certificate(phase="T5",**overrides):
    data={"source_sha":SOURCE,"build_id":BUILD,"github_run_id":101,
          "phase":phase,"evidence_sha256":SHA,
          "records":[object_record(k,identity=k.startswith("M1_"),
                                   proof=k.startswith("M1_"))
                     for k in sorted(M.BIRTH_CLASS[phase])]}
    data.update(overrides)
    return M.object_birth_certificate(**data)


class FactoryBirthContract(unittest.TestCase):
    def test_source_generated_partial_is_only_possible_not_claimed_present(self):
        p=M.generated_child_certificate(
            source_sha=SOURCE,build_id=BUILD,github_run_id=101,
            kind="RSYNC_PARTIAL_POSSIBLE",name="runtime.tar.gz",
            expected_sha256=SHA)
        self.assertEqual(p["schema"],M.GENERATED_CHILD_SCHEMA)
        self.assertEqual(p["state"],"UNCLASSIFIED_HOLD_POSSIBLE_PARTIAL_NOT_PROVEN_PRESENT")
        self.assertEqual(p["path"],
            "/home/tony/.aoe2war-b-os-"+SOURCE[:12]+"-run-101/.rsync-partial/runtime.tar.gz")
        self.assertIsNone(p["allocated_bytes"])
        self.assertIsNone(p["file_identity"])
        self.assertFalse(p["exists_on_root_certified"])
        self.assertFalse(p["copy_authorized"])
        self.assertFalse(p["retire_authorized"])
        self.assertIsNone(p["independent_restore_receipt_sha256"])
        self.assertEqual(p["canonical_sha256"],
            hashlib.sha256(M.canonical({k:v for k,v in p.items()
                                        if k!="canonical_sha256"})).hexdigest())

    def test_generated_root_receipt_ack_not_false_identity_or_restore(self):
        p=M.generated_child_certificate(
            source_sha=SOURCE,build_id=BUILD,github_run_id=101,
            kind="ROOT_RECEIPT",name="release-seal-v1.json",
            expected_sha256=SHA,verified_source_sha256=SHA,
            acknowledged_bytes=2048)
        self.assertEqual(p["path"],
            "/var/lib/aoe2war-product-release-v1/"+SOURCE[:12]+"/release-seal-v1.json")
        self.assertEqual(p["acknowledged_logical_bytes"],2048)
        self.assertEqual(p["verified_source_sha256"],SHA)
        self.assertEqual(p["state"],"UNCLASSIFIED_HOLD_ROOT_ACK_NO_FILE_IDENTITY_OR_RESTORE")
        for key in ("file_identity","allocated_bytes","observed_at_utc",
                    "independent_restore_receipt_sha256","measured_physically_reclaimed_bytes"):
            self.assertIsNone(p[key])
        self.assertFalse(p["copy_authorized"])
        self.assertFalse(p["retire_authorized"])

    def test_generated_source_strict_negative_classes(self):
        base={"source_sha":SOURCE,"build_id":BUILD,"github_run_id":101,
              "kind":"RSYNC_PARTIAL_POSSIBLE","name":"runtime.tar.gz",
              "expected_sha256":SHA}
        for field,bad,code in (
            ("name","../../private","BIRTH_PARTIAL_NO_PHYSICAL_PROOF"),
            ("name","retire-root.tar.gz","BIRTH_PARTIAL_NO_PHYSICAL_PROOF"),
            ("verified_source_sha256",SHA,"BIRTH_PARTIAL_NO_PHYSICAL_PROOF"),
            ("acknowledged_bytes",100,"BIRTH_PARTIAL_NO_PHYSICAL_PROOF"),
            ("kind","UNBOUNDED_ROOT_FILE","BIRTH_GENERATED_KIND_DENIED"),
            ("source_sha","bad","BIRTH_GENERATED_ORIGINAL_SCOPE"),
            ("github_run_id",0,"BIRTH_GENERATED_ORIGINAL_SCOPE"),
            ("expected_sha256","bad","BIRTH_GENERATED_ORIGINAL_SCOPE"),
        ):
            with self.subTest(field=field,bad=bad),self.assertRaisesRegex(
                    M.RetentionHold,code):
                M.generated_child_certificate(**(base|{field:bad}))
        accepted=base|{"kind":"ROOT_RECEIPT","name":"release-seal-v1.json",
                       "verified_source_sha256":SHA,"acknowledged_bytes":100}
        for field,bad in (
            ("name","../../private"),
            ("name","arbitrary-finance.json"),
            ("verified_source_sha256","b"*64),
            ("acknowledged_bytes",None),
            ("acknowledged_bytes",0),
        ):
            with self.subTest(root_field=field),self.assertRaisesRegex(
                    M.RetentionHold,"BIRTH_ROOT_RECEIPT_ACK_SCOPE"):
                M.generated_child_certificate(**(accepted|{field:bad}))

    def test_original_factory_generated_child_seal_is_idempotent_and_hold(self):
        import aoe2_product_release as R
        with tempfile.TemporaryDirectory() as td:
            work=Path(td)
            approval={"sourceSha":SOURCE,"buildId":BUILD,"runId":101}
            report=R.record_factory_generated_birth(
                approval,work,kind="RSYNC_PARTIAL_POSSIBLE",
                name="runtime.tar.gz",expected_sha256=SHA)
            receipt=work/"factory-birth-generated-rsync_partial_possible-runtime_tar_gz-v1.json"
            self.assertEqual(json.loads(receipt.read_text()),report)
            original=receipt.read_bytes()
            self.assertTrue(original.endswith(b"\n"))
            R.record_factory_generated_birth(
                approval,work,kind="RSYNC_PARTIAL_POSSIBLE",
                name="runtime.tar.gz",expected_sha256=SHA)
            self.assertEqual(receipt.read_bytes(),original)
            self.assertFalse(report["exists_on_root_certified"])
            self.assertFalse(report["copy_authorized"])
            self.assertFalse(report["retire_authorized"])

    def test_existing_factory_call_sites_register_generated_children_only(self):
        text=(Path(M.__file__).parent/"aoe2_product_release.py").read_text()
        self.assertIn('kind="RSYNC_PARTIAL_POSSIBLE"',text)
        self.assertIn('kind="ROOT_RECEIPT"',text)
        self.assertIn('birth_context=(approval, work)',text)
        self.assertNotIn("birth_register_daemon",text)
        self.assertNotIn("owner_private_key",text)
        self.assertFalse(hasattr(M,"transfer_generated_children"))

    def test_phase_source_classes_exact(self):
        for phase in M.BIRTH_PHASES:
            with self.subTest(phase=phase):
                r=certificate(phase)
                self.assertEqual(r["schema"],M.BIRTH_SCHEMA)
                self.assertEqual(r["original_factory_stage"],phase)
                self.assertEqual(r["classified"],2)
                self.assertEqual(r["unknown_holds"],1)
                self.assertFalse(r["retirement_authorized"])
                self.assertFalse(r["storage_mutation_authorized"])
                self.assertEqual(
                    hashlib.sha256(M.canonical({k:v for k,v in r.items()
                         if k!="canonical_sha256"})).hexdigest(),
                    r["canonical_sha256"])
    def test_every_record_has_all_original_birth_fields(self):
        r=certificate()
        for e in r["records"]:
            self.assertEqual(e["source_producer"],"ORIGINAL_FACTORY_T5_T8_T10")
            self.assertEqual(e["source_owner"],"AOE2WAR_FACTORY")
            self.assertIsNone(e["retention_deadline_utc"])
            self.assertIsNone(e["review_due_utc"])
            self.assertIsNone(e["independent_restore_receipt_sha256"])
            self.assertIn("INTEL_COLD_REVIEW",e["cold_destination"])
            self.assertTrue(e["recovery_requirements"])
            self.assertTrue(e["why_kept"])
            self.assertTrue(e["consumer"])
            self.assertFalse(e["copy_authorized"])
            self.assertFalse(e["retire_authorized"])
            self.assertIsNone(e["measured_physically_reclaimed_bytes"])
            self.assertEqual(len(e["object_id"]),64)
            self.assertEqual(len(e["copy_id"]),64)
    def test_native_local_file_identity_is_exact(self):
        e=next(x for x in certificate()["records"] if x["kind"]=="M1_STAGED_TAR")
        self.assertEqual(e["file_identity"]["allocated_bytes"],20480)
        self.assertEqual(e["file_identity"]["device"],16777234)
        self.assertEqual(e["state"],"VERIFIED_LOCAL_FILE_HOLD_RECOVERY")
    def test_remote_missing_identity_is_a_visible_hold(self):
        e=next(x for x in certificate()["records"] if x["kind"]=="HEL1_TRANSPORT_TAR")
        self.assertEqual(e["state"],"UNCLASSIFIED_HOLD_MISSING_FILE_OR_RESTORE_EVIDENCE")
        self.assertIsNone(e["file_identity"])
        self.assertIn("MISSING_FILE_IDENTITY",e["next_action"])
    def test_t8_previous_object_source_separate(self):
        r=certificate("T8")
        for e in r["records"]:
            self.assertEqual(e["generation_source_sha"],PREV)
            self.assertEqual(e["generation_build_id"],PREV_BUILD)
            self.assertEqual(e["source_sha"],SOURCE)
            self.assertEqual(e["build_id"],BUILD)
    def test_t10_current_remains_protected(self):
        r=certificate("T10")
        e=next(x for x in r["records"] if x["kind"]=="HEL1_LIVE_GENERATION")
        self.assertEqual(e["retention_floor"],"KEEP_LIVE_RUNTIME")
        self.assertFalse(e["retire_authorized"])
    def test_sorted_order_deterministic(self):
        x=certificate()
        r=[object_record(k,identity=k.startswith("M1_"),
                         proof=k.startswith("M1_"))
           for k in reversed(sorted(M.BIRTH_CLASS["T5"]))]
        self.assertEqual(x["canonical_sha256"],certificate(records=r)["canonical_sha256"])
    def test_changed_identity_generates_new_copy_id(self):
        a=certificate()
        records=[object_record(k,identity=k.startswith("M1_"),
                               proof=k.startswith("M1_"))
                 for k in sorted(M.BIRTH_CLASS["T5"])]
        records[1]["identity"]["inode"] += 1
        b=certificate(records=records)
        self.assertNotEqual(a["canonical_sha256"],b["canonical_sha256"])
    def test_wrong_factory_class_is_denied(self):
        rows=[object_record(k) for k in M.BIRTH_CLASS["T5"]]
        rows[0]["kind"]="FACTORY_UNKNOWN_AUTO_DELETE"
        with self.assertRaisesRegex(M.RetentionHold,"BIRTH_EXACT_FACTORY_PHASE_CLASSES"):
            certificate(records=rows)
    def test_missing_class_denied(self):
        with self.assertRaisesRegex(M.RetentionHold,"BIRTH_BOUNDED_TWO_ORIGINAL_OBJECTS"):
            certificate(records=[object_record("M1_STAGED_TAR")])
    def test_duplicate_class_denied(self):
        r=object_record("M1_STAGED_TAR")
        with self.assertRaisesRegex(M.RetentionHold,"BIRTH_EXACT_FACTORY_PHASE_CLASSES"):
            certificate(records=[r,copy.deepcopy(r)])
    def test_path_traversal_denied(self):
        rows=[object_record(k) for k in sorted(M.BIRTH_CLASS["T5"])]
        rows[0]["path"]="/home/tony/../root/private"
        with self.assertRaisesRegex(M.RetentionHold,"BIRTH_ORIGINAL_PATH"):
            certificate(records=rows)
    def test_wrong_surface_denied(self):
        rows=[object_record(k) for k in sorted(M.BIRTH_CLASS["T5"])]
        rows[0]["path"]="/Users/tonyblum/evil"
        with self.assertRaisesRegex(M.RetentionHold,"BIRTH_ORIGINAL_SURFACE"):
            certificate(records=rows)
    def test_mismatched_original_digest_denied(self):
        rows=[object_record(k) for k in sorted(M.BIRTH_CLASS["T5"])]
        rows[1]["verified_source_sha256"]="c"*64
        with self.assertRaisesRegex(M.RetentionHold,"BIRTH_PROOF_MISMATCH"):
            certificate(records=rows)
    def test_source_build_and_run_identity_denied(self):
        for field,val in (("source_sha","d"*12),
                          ("build_id","bad build"),
                          ("github_run_id",0),
                          ("evidence_sha256","hello")):
            with self.subTest(field=field),self.assertRaisesRegex(
                    M.RetentionHold,"BIRTH_ORIGINAL_PRODUCER_IDENTITY"):
                certificate(**{field:val})
    def test_hardlinked_inode_denied(self):
        rows=[object_record(k) for k in sorted(M.BIRTH_CLASS["T5"])]
        rows[1]["identity"]["nlink"]=2
        with self.assertRaisesRegex(M.RetentionHold,"BIRTH_FILE_IDENTITY"):
            certificate(records=rows)
    def test_untrusted_file_mode_denied(self):
        rows=[object_record(k) for k in sorted(M.BIRTH_CLASS["T5"])]
        rows[1]["identity"]["mode"]=0o666
        with self.assertRaisesRegex(M.RetentionHold,"BIRTH_FILE_IDENTITY"):
            certificate(records=rows)
    def test_unverified_local_digest_is_hold(self):
        rows=[object_record(k,identity=k.startswith("M1_"),
                            proof=k.startswith("M1_"))
              for k in sorted(M.BIRTH_CLASS["T5"])]
        rows[1]["verified_source_sha256"]=None
        r=certificate(records=rows)
        self.assertEqual(r["unknown_holds"],2)
    def test_pure_standard_never_mutates_release(self):
        source=Path(M.__file__).read_text()
        for dangerous in ("os.unlink(","subprocess.run(","ssh(","--apply",
                          "shutil.rmtree(","systemctl restart"):
            self.assertNotIn(dangerous,source)
    def test_existing_original_plan_preserved(self):
        self.assertTrue(callable(M.plan_only_after_exact_t10))
        self.assertEqual(M.SCHEMA,"aoe2war.factory.post-t10-retention-intent.v1")
    def test_factory_original_call_sites_all_three(self):
        s=(Path(M.__file__).parent/"aoe2_product_release.py").read_text()
        self.assertIn('record_factory_birth(approval, Path(log).parent, "T5"',s)
        self.assertIn('record_factory_birth(approval, work, "T8"',s)
        self.assertIn('record_factory_birth(approval, work, "T10"',s)
        self.assertIn('seal_once(receipt, canonical(report) + b"\\n")',s)
        self.assertNotIn('birth_register_daemon',s)
    def test_unknown_producer_scope_is_not_accepted(self):
        rows=[object_record(k) for k in M.BIRTH_CLASS["T5"]]
        rows[0]["kind"]="HEL1_ROOT_ANY"
        with self.assertRaisesRegex(M.RetentionHold,"BIRTH_EXACT_FACTORY_PHASE_CLASSES"):
            certificate(records=rows)


    def test_invalid_original_birth_seals_honest_hold_and_same_bytes(self):
        import aoe2_product_release as R
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            a={"sourceSha":SOURCE,"buildId":BUILD,"runId":101}
            rows=[object_record(k,identity=k.startswith("M1_"),
                                proof=k.startswith("M1_"))
                  for k in sorted(M.BIRTH_CLASS["T8"])]
            rows[1]["path"]="/tmp/unit-fixture-is-not-original-m1"
            report=R.record_factory_birth(a,root,"T8",SHA,rows)
            self.assertEqual(report["status"],
                 "UNCLASSIFIED_HOLD_ORIGINAL_SOURCE_METADATA_NOT_ADMITTED")
            self.assertEqual(report["unknown_holds"],2)
            self.assertFalse(report["copy_authorized"])
            self.assertFalse(report["retire_authorized"])
            destination=root/"factory-birth-T8-HOLD-v1.json"
            receipt=destination.read_bytes()
            self.assertEqual(json.loads(receipt)["schema"],
                             "aoe2war.factory.object-birth-hold.v1")
            R.record_factory_birth(a,root,"T8",SHA,rows)
            self.assertEqual(destination.read_bytes(),receipt)
            self.assertFalse((root/"factory-birth-T8-v1.json").exists())


if __name__=="__main__":
    unittest.main()
