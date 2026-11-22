"""Post-T10 Factory intent: adversarial source, role and non-execution checks."""
from __future__ import annotations
import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import aoe2_factory_retention_post_t10 as R

CURRENT="890d9dcc22d081ff1c662f33c98a8da795f3d3e9"
PRIOR="9cf670724c82e29861e539c03c4d3165893da8f3"
BUILD="0NEGtfP0ieSzETh1JHGhE"
def raw(x):
    return (json.dumps(x,sort_keys=True,separators=(",",":"))+"\n").encode()
def inputs(*,current=CURRENT,previous=PRIOR):
    events=raw({"event":"T10","state":"pass","eventHash":"a"*64,"sourceSha":current})
    seal=raw({"schema":"aoe2war.product.release-seal.v1","sourceSha":current,
      "buildId":BUILD,"financialAuthorized":False,
      "ledgerSha256":hashlib.sha256(events).hexdigest(),
      "lastEventHash":"a"*64,"summarySha256":"b"*64})
    t8=raw({"schema":"test.original.witness.v1","sourceSha":previous,
       "buildId":"fvPCvEd_aFucA_X3hSfn9"})
    return {"source_sha":current,"build_id":BUILD,"seal_raw":seal,
      "ledger_raw":events,"t8_raw":t8}
class PostT10Retention(unittest.TestCase):
    def test_source_exact_first_owner_nominee(self):
        x=R.plan_only_after_exact_t10(**inputs())
        self.assertEqual(x["first_owner_selected_cold_review"]["generation"],"4c14cbc7c518")
        self.assertEqual(x["two_hot_pinset"],"HOLD_OWNER_ED25519_FACTORY_LEDGER_ABSENT")
        self.assertFalse(x["retirement_authorized"])
        self.assertFalse(x["copy_permission_validated"])
        self.assertFalse(x["delete_or_prune_allowed"])
        self.assertEqual(x["operation"],"PLAN_ONLY_NO_EXECUTION")
    def test_protected_fallback_and_writers(self):
        x=R.plan_only_after_exact_t10(**inputs())["protected_ancillary"]
        self.assertIn("3030",x["fallback_3030"]);self.assertIn("3033",x["emergency_3033"])
        self.assertEqual(x["appearance"],"f50ead889c61")
        self.assertEqual(x["social"],"da0bee282e52")
    def test_no_inferred_cold_proof(self):
        x=R.plan_only_after_exact_t10(**inputs())
        self.assertFalse(x["third_hot_identity_inferred_from_ancestry"])
        self.assertEqual(x["three_cold_checkpoints"],"HOLD_INDEPENDENT_ENCRYPTED_RESTORE_PROOF_REQUIRED")
    def test_different_accepted_t10_does_not_select_4c14(self):
        x=inputs(current="c"*40)
        self.assertIsNone(R.plan_only_after_exact_t10(**x)["first_owner_selected_cold_review"])
    def test_wrong_rollback_build_never_nominates_4c14(self):
        x=inputs()
        t8=json.loads(x["t8_raw"])
        t8["buildId"]="eZR1BHZQglplgTfeWp_q5"
        x["t8_raw"]=raw(t8)
        self.assertIsNone(R.plan_only_after_exact_t10(**x)["first_owner_selected_cold_review"])
    def test_stale_9cf_current_never_nominates_4c14(self):
        x=inputs(current="9cf670724c82e29861e539c03c4d3165893da8f3",previous="50b943a44a2e89deaee7b12acaf87d8567898b3f")
        self.assertIsNone(R.plan_only_after_exact_t10(**x)["first_owner_selected_cold_review"])
    def test_wrong_previous_not_exact_first(self):
        x=inputs(previous="d"*40)
        self.assertIsNone(R.plan_only_after_exact_t10(**x)["first_owner_selected_cold_review"])
    def test_broken_t10_ledger_sha(self):
        x=inputs();x["ledger_raw"]+=b"\n"
        with self.assertRaises(R.RetentionHold):R.plan_only_after_exact_t10(**x)
    def test_bad_seal_source(self):
        x=inputs();j=json.loads(x["seal_raw"]);j["sourceSha"]="c"*40;x["seal_raw"]=raw(j)
        with self.assertRaises(R.RetentionHold):R.plan_only_after_exact_t10(**x)
    def test_bad_seal_build(self):
        x=inputs();j=json.loads(x["seal_raw"]);j["buildId"]="mismatch";x["seal_raw"]=raw(j)
        with self.assertRaises(R.RetentionHold):R.plan_only_after_exact_t10(**x)
    def test_financial_authorization_never_allowed(self):
        x=inputs();j=json.loads(x["seal_raw"]);j["financialAuthorized"]=True;x["seal_raw"]=raw(j)
        with self.assertRaises(R.RetentionHold):R.plan_only_after_exact_t10(**x)
    def test_source_t10_not_full_commit(self):
        x=inputs();j=json.loads(x["ledger_raw"]);j["event"]="T9";x["ledger_raw"]=raw(j)
        s=json.loads(x["seal_raw"]);s["ledgerSha256"]=R.sha(x["ledger_raw"]);x["seal_raw"]=raw(s)
        with self.assertRaises(R.RetentionHold):R.plan_only_after_exact_t10(**x)
    def test_source_t10_event_hash_seal_mismatch(self):
        x=inputs();j=json.loads(x["ledger_raw"]);j["eventHash"]="c"*64;x["ledger_raw"]=raw(j)
        s=json.loads(x["seal_raw"]);s["ledgerSha256"]=R.sha(x["ledger_raw"]);x["seal_raw"]=raw(s)
        with self.assertRaises(R.RetentionHold):R.plan_only_after_exact_t10(**x)
    def test_t8_must_be_source_distinct(self):
        x=inputs(previous=CURRENT)
        with self.assertRaises(R.RetentionHold):R.plan_only_after_exact_t10(**x)
    def test_t8_source_must_be_full_sha(self):
        x=inputs(previous="50b")
        with self.assertRaises(R.RetentionHold):R.plan_only_after_exact_t10(**x)
    def test_reject_unbounded_t10_ledger(self):
        x=inputs();x["ledger_raw"]=b"x"*2_000_001
        with self.assertRaises(R.RetentionHold):R.plan_only_after_exact_t10(**x)
    def test_reject_bad_seal_input(self):
        x=inputs();x["seal_raw"]=b"NOT JSON"
        with self.assertRaises(R.RetentionHold):R.plan_only_after_exact_t10(**x)
    def test_canonical_digest_consistent(self):
        x=R.plan_only_after_exact_t10(**inputs())
        claim=x.pop("canonical_sha256")
        self.assertEqual(claim,hashlib.sha256(R.canonical(x)).hexdigest())
    def test_no_hidden_mutator(self):
        text=Path(R.__file__).read_text()
        for banned in ("os.unlink(","os.remove(","shutil.rmtree(","subprocess.","ssh ","--apply","systemctl restart","pkeyutl -sign"):
            self.assertNotIn(banned,text)
if __name__=="__main__":unittest.main()



class ThreeHotFactoryIntegration(unittest.TestCase):
    def test_original_post_t10_seals_bounded_over_three_review(self):
        from unittest import mock
        import tempfile
        import aoe2_product_release as F
        with tempfile.TemporaryDirectory() as td:
            work=Path(td)
            fields=inputs()
            for name,key in (
                ("release-seal-v1.json","seal_raw"),
                ("release-events-v1.jsonl","ledger_raw"),
                ("public-evidence-T8-v1.json","t8_raw")):
                (work/name).write_bytes(fields[key])
            census="\n".join([
                "aoe2war-web-prod-"+CURRENT[:12],
                "aoe2war-web-prod-"+PRIOR[:12],
                "aoe2war-web-prod-50b943a44a2e",
                "aoe2war-web-prod-f50ead889c61",
                "aoe2war-web-prod-da0bee282e52",
                "aoe2war-web-prod-f9d82fe9169d"])+"\n"
            with mock.patch.object(F.transport,"checked_file",
                                   side_effect=lambda path: path.lstat()), \
                 mock.patch.object(F,"ssh",return_value=census) as remote:
                F.record_post_t10_retention_intent(
                    {"sourceSha":CURRENT,"buildId":BUILD},work)
            self.assertEqual(remote.call_count,1)
            self.assertTrue(remote.call_args.kwargs["root"])
            output=json.loads((work/"post-t10-retention-intent-v1.json").read_text())
            review=output["three_hot_cold_review"]
            self.assertEqual(review["all_runtime_directory_count"],6)
            self.assertEqual(review["website_generation_candidates"],4)
            self.assertTrue(review["cold_review_required"])
            self.assertFalse(review["retirement_authorized"])
            self.assertFalse(output["retirement_authorized"])
            self.assertFalse(output["delete_or_prune_allowed"])

    def test_remote_untrusted_inventory_never_creates_permit(self):
        from unittest import mock
        import tempfile
        import aoe2_product_release as F
        with tempfile.TemporaryDirectory() as td:
            work=Path(td)
            fields=inputs()
            for name,key in (
                ("release-seal-v1.json","seal_raw"),
                ("release-events-v1.jsonl","ledger_raw"),
                ("public-evidence-T8-v1.json","t8_raw")):
                (work/name).write_bytes(fields[key])
            with mock.patch.object(F.transport,"checked_file",
                                   side_effect=lambda path: path.lstat()), \
                 mock.patch.object(F,"ssh",return_value="../secrets\n"):
                F.record_post_t10_retention_intent(
                    {"sourceSha":CURRENT,"buildId":BUILD},work)
            self.assertFalse((work/"post-t10-retention-intent-v1.json").exists())

class ThreeHotColdReview(unittest.TestCase):
    def setUp(self):
        self.current = CURRENT
        self.previous = PRIOR
        self.names = [
            "aoe2war-web-prod-" + CURRENT[:12],
            "aoe2war-web-prod-" + PRIOR[:12],
            "aoe2war-web-prod-50b943a44a2e",
            "aoe2war-web-prod-f50ead889c61",
            "aoe2war-web-prod-da0bee282e52",
        ]

    def review(self, names=None):
        return R.plan_three_hot_cold_review(
            runtime_names=self.names if names is None else names,
            current_source_sha=self.current,
            previous_source_sha=self.previous,
        )

    def test_original_three_plus_two_ancillary_not_age_off(self):
        x = self.review()
        self.assertEqual(x["website_generation_candidates"], 3)
        self.assertEqual(x["all_runtime_directory_count"], 5)
        self.assertEqual(len(x["independent_ancillary_keep"]), 2)
        self.assertFalse(x["cold_review_required"])
        self.assertFalse(x["third_hot_owner_ledger_admitted"])
        self.assertIsNone(x["third_hot_identity"])
        self.assertFalse(x["retirement_authorized"])
        self.assertFalse(x["may_remove_source"])

    def test_fourth_generation_triggers_cold_review_only(self):
        x = self.review(self.names+["aoe2war-web-prod-f9d82fe9169d"])
        self.assertTrue(x["cold_review_required"])
        self.assertEqual(x["candidate_over_three"], 1)
        self.assertIn("COLD_REVIEW_REQUIRED_HOLD", x["review_state"])
        self.assertFalse(x["copy_authorized"])
        self.assertFalse(x["retirement_authorized"])
        self.assertFalse(x["run_automated_retirement"])

    def test_missing_parent_or_active_holds(self):
        for missing in (self.current[:12], self.previous[:12]):
            with self.subTest(missing=missing), self.assertRaisesRegex(
                R.RetentionHold,"THREE_HOT_REQUIRED_RUNTIME_MISSING"
            ):
                self.review([n for n in self.names if not n.endswith(missing)])

    def test_bad_paths_duplicates_and_unbounded_inventory_hold(self):
        for names in ([self.names[0]]*2, self.names+["../private"],
                      self.names+["aoe2war-web-prod-QQQQQQQQQQQQ"],
                      self.names*30, []):
            with self.subTest(names=len(names)), self.assertRaisesRegex(
                R.RetentionHold,"THREE_HOT_RUNTIME_INVENTORY_INVALID"
            ):
                self.review(names)

    def test_deterministic_and_not_owner_retire_authority(self):
        a=self.review(self.names+["aoe2war-web-prod-f9d82fe9169d"])
        b=self.review(list(reversed(self.names))+
                      ["aoe2war-web-prod-f9d82fe9169d"])
        self.assertEqual(a["canonical_sha256"],b["canonical_sha256"])
        self.assertFalse(a["may_remove_source"])
        self.assertEqual(len(a["canonical_sha256"]),64)

    def test_original_factory_calls_readonly_collector_after_t10(self):
        text=(Path(R.__file__).parent/"aoe2_product_release.py").read_text()
        self.assertIn("plan_three_hot_cold_review(",text)
        self.assertIn("find /var/lib -mindepth 1 -maxdepth 1 -type d",text)
        self.assertIn("root=True, timeout=20",text)
        self.assertIn("retirementAuthorized",text)
