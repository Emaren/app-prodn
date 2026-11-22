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

CURRENT="9cf670724c82e29861e539c03c4d3165893da8f3"
PRIOR="50b943a44a2e89deaee7b12acaf87d8567898b3f"
BUILD="fvPCvEd_aFucA_X3hSfn9"
def raw(x):
    return (json.dumps(x,sort_keys=True,separators=(",",":"))+"\n").encode()
def inputs(*,current=CURRENT,previous=PRIOR):
    events=raw({"event":"T10","state":"pass","eventHash":"a"*64,"sourceSha":current})
    seal=raw({"schema":"aoe2war.product.release-seal.v1","sourceSha":current,
      "buildId":BUILD,"financialAuthorized":False,
      "ledgerSha256":hashlib.sha256(events).hexdigest(),
      "lastEventHash":"a"*64,"summarySha256":"b"*64})
    t8=raw({"schema":"test.original.witness.v1","sourceSha":previous,
       "buildId":"eZR1BHZQglplgTfeWp_q5"})
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
