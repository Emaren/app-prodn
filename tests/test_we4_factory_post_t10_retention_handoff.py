#!/usr/bin/env python3
"""WE2 Factory source-owned post-T10 read-only retention handoff contract."""
import sys
from pathlib import Path
import unittest

HERE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(HERE/"scripts"))
import aoe2_product_release as product

def fixture():
    approval={"sourceSha":"a"*40,"buildId":"SOURCE_BUILD_01",
        "artifactSha256":"b"*64,"proofArtifactSha256":"c"*64}
    seal={"schema":"aoe2war.product.release-seal.v1",
         "sourceSha":approval["sourceSha"],"buildId":approval["buildId"],
         "financialAuthorized":False,"ledgerSha256":"d"*64,
         "summarySha256":"e"*64,"lastEventHash":"f"*64}
    event={"event":"T10","state":"pass","eventHash":"f"*64}
    return approval,seal,event

class FactoryPostT10RetentionTests(unittest.TestCase):
    def test_valid_t10_is_review_only_no_mutation(self):
        a,s,e=fixture()
        r=product.post_t10_factory_retention_handoff(a,s,e)
        self.assertEqual(r["schema"],product.FACTORY_RETENTION_HANDOFF_SCHEMA)
        self.assertEqual(r["status"],"HOLD_SOURCE_ADMITTED_HOT_COLD_AND_EXACT_ORIGINAL_AUTHORITY")
        self.assertEqual(r["current_source_sha"],a["sourceSha"])
        self.assertEqual(r["immutable_artifact_zip_sha256"],a["artifactSha256"])
        self.assertTrue(r["KEEP_3030_3033_appearance_social_and_originals"])
        self.assertTrue(r["KEEP_two_source_admitted_hot_generations"])
        self.assertTrue(r["KEEP_three_independently_restored_cold_checkpoints"])
        self.assertFalse(r["apply"])
        self.assertEqual((r["new_factory_zips"],r["new_transfers"],r["new_deletions"]),(0,0,0))
        self.assertEqual(r["exact_original_L4_decision"],"NOT_GRANTED")

    def test_missing_t10_or_tampered_ledger_refused(self):
        a,s,e=fixture()
        for event in ("T9","T8","T10"):
            other=dict(e,event=event,state="fail")
            with self.assertRaisesRegex(RuntimeError,"RETENTION_LAST_EVENT_MUST_BE_T10"):
                product.post_t10_factory_retention_handoff(a,s,other)
        e["event"]="T9"
        with self.assertRaisesRegex(RuntimeError,"RETENTION_LAST_EVENT_MUST_BE_T10"):
            product.post_t10_factory_retention_handoff(a,s,e)
        e["event"]="T10";s["lastEventHash"]="0"*64
        with self.assertRaisesRegex(RuntimeError,"RETENTION_LAST_EVENT_MUST_BE_T10"):
            product.post_t10_factory_retention_handoff(a,s,e)

    def test_financial_or_cross_source_cannot_promote_review(self):
        a,s,e=fixture()
        s["financialAuthorized"]=True
        with self.assertRaisesRegex(RuntimeError,"RETENTION_T10_ROOT_SEAL"):
            product.post_t10_factory_retention_handoff(a,s,e)
        s["financialAuthorized"]=False
        s["sourceSha"]="b"*40
        with self.assertRaisesRegex(RuntimeError,"RETENTION_T10_ROOT_SEAL"):
            product.post_t10_factory_retention_handoff(a,s,e)

    def test_fake_hot_permit_field_does_not_create_authority(self):
        a,s,e=fixture()
        a["ownerApproved"]=True
        s["permittedHotPinset"]=["9cf670724c82","50b943a44a2e","dbceb5df20f9"]
        e["oneUseCopyPermit"]="YES"
        r=product.post_t10_factory_retention_handoff(a,s,e)
        self.assertFalse(r["apply"])
        self.assertEqual(r["one_item_copy_authority"],"NOT_VALIDATED")
        self.assertEqual(r["retention_nomination_status"],"NOT_AUTHORIZED_WITHOUT_SIGNED_SOURCE_PINS")

if __name__=="__main__":
    unittest.main()
