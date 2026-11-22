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


if __name__=="__main__":
    unittest.main()
