"""WE1 source-only BAE/T5 owner-session policy negatives; never deletes or signs."""
from __future__ import annotations

import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
POLICY = ROOT / "config/storage-owner-session-retirement.v1.json"
BASELINE = ROOT / "config/storage-disposition-policy.v1.json"

class OwnerSessionAndFormerHot(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.p = json.loads(POLICY.read_text())
        cls.b = json.loads(BASELINE.read_text())

    def test_no_existing_authority_overridden(self):
        p = self.p
        self.assertEqual(p["status"], "DESIGN_AND_CLASSIFICATION_NO_AUTONOMOUS_MUTATION")
        self.assertEqual(p["authority"], "WE1_SOURCE_ONLY_NOT_A_ROOT_PERMIT")
        self.assertEqual(p["precedence"][0], "ORIGINAL_HOST_CONTROLLER_SOURCE")
        self.assertTrue(all(p["global_guard"].values()))
        self.assertEqual(self.b["mode"], "REVIEW_ONLY_NO_NEW_EXECUTION_AUTHORITY")
        self.assertIn("dbceb5df20f9", self.b["protected_exclusions"]["always_keep_generations"])

    def test_owner_login_cannot_issue_signature_by_itself(self):
        s = self.p["owner_session"]
        self.assertEqual(s["uid"], 501)
        self.assertFalse(s["session_is_permit"])
        self.assertEqual(s["issuer_state"], "NOT_ENROLLED")
        self.assertFalse(s["encrypted_v6_private_key_automatically_unlocked"])
        self.assertFalse(s["private_key_export"])
        self.assertTrue(s["use_existing_trust_only"])
        self.assertIn("MISSING_CRYPTO_SIGNATURE_OR_ORIGINAL_TRUST", s["capability"]["negative"])
        self.assertIn("ISSUER_NOT_ENROLLED", s["capability"]["negative"])

    def test_one_use_nonce_expiry_revocation_and_nonsense_denied(self):
        s = self.p["owner_session"]
        c = s["capability"]
        self.assertTrue(c["one_use"])
        self.assertLessEqual(c["ttl_seconds_max"], 900)
        self.assertGreaterEqual(c["nonce_bytes_min"], 24)
        for bad in ("EXPIRED_TTL", "REPLAY_NONCE", "REVOKED_SESSION",
                    "DIFFERENT_DEVICE_INODE_SIZE_OR_MOUNT", "ACTIVE_FD_OR_SERVICE",
                    "HISTORICAL_L4_OR_L5", "UNKNOWN_SOURCE_OR_RECOVERY",
                    "FINANCIAL_OR_CUSTODY", "NO_ROOT_LEDGER_PROTECTION"):
            self.assertIn(bad, c["negative"])
        self.assertTrue(s["original_ledger"].startswith("ROOT_OWNED_APPEND_ONLY"))
        self.assertIn("REVOKE_SESSION", s["owner_pause"])

    def test_source_qualified_no_manual_sha_transcription(self):
        c = self.p["owner_session"]["capability"]
        self.assertFalse(c["owner_manual_sha_entry_required"])
        self.assertFalse(c["owner_phrase_per_object_required"])
        self.assertIn("ACCEPTED_PROTECTED_SOURCE_SHA", c["derived_from"])
        self.assertIn("ARTIFACT_SHA_AND_INDEPENDENT_PROOF", c["derived_from"])
        self.assertIn("CURRENT_BUILD_ID", c["derived_from"])
        self.assertIn("ROOT_PROTECTION_LEDGER_SHA", c["scope_required"])
        self.assertIn("OBJECT_INODE", c["scope_required"])
        self.assertIn("NONCE", c["scope_required"])

    def test_actions_separated_no_automatic_l4_l5(self):
        operations = self.p["owner_session"]["operations"]
        self.assertIn("READ_ONLY", operations["scan"])
        self.assertIn("ENROLLED_STANDING_L1", operations["l1_prune"])
        self.assertIn("SEPARATE", operations["cold_copy"])
        self.assertIn("NEVER_INFER", operations["post_copy_retire"])
        self.assertIn("T7_T10", operations["website_release"])
        self.assertIn("HUMAN_ONLY", operations["l4_retire"])
        self.assertEqual(operations["l5_delete"], "DENIED")

    def test_dbceb_exact_identity_only(self):
        c = self.p["exact_candidate"]
        self.assertEqual(c["path"], "/home/tony/.aoe2war-b-os-dbceb5df20f9-run-44817082206/runtime.tar.gz")
        self.assertEqual(c["fs_uuid"], "64f6fb02-4fed-4836-a33b-86e8993afdfa")
        self.assertEqual((c["device"], c["inode"], c["uid"], c["mode"]),
                         (2049, 259509, 1000, "0600"))
        self.assertEqual(c["source_sha"], "dbceb5df20f98ff783a2af1a83d79cf17abae035")
        self.assertEqual(c["archive_sha256"],
                         "9fa90bc87cf4d44f0c0c6bb3ea17946b82b80b48d05f70758a26aaeea9eba152")
        self.assertEqual(c["logical_bytes"], 618538997)
        self.assertEqual(c["gross_stage_allocated_bytes"], 618553344)
        self.assertTrue(re.fullmatch("[0-9a-f]{64}", c["archive_sha256"]))

    def test_dbceb_no_retirement_without_off_root_recovery(self):
        c = self.p["exact_candidate"]
        self.assertEqual(c["disposition"], "PROTECTED")
        self.assertEqual(c["source_retention_status"], "NOT_ELIGIBLE_FOR_UNLINK")
        self.assertEqual(c["strongest_historical_level"], "UNKNOWN_DO_NOT_DOWNGRADE")
        self.assertFalse(c["original_data_retention_object_present_at_observation"])
        self.assertFalse(c["original_data_retention_receipt_present_at_observation"])
        self.assertFalse(c["original_owner_signed_bae_pinset_admitted"])
        self.assertFalse(c["original_root_retention_pins_fresh_and_approved"])
        self.assertTrue(c["copy_review_eligible"])
        self.assertEqual(c["physical_reclaimed_bytes"], 0)
        self.assertIn("APPROVED_ORIGINAL_RETIREMENT_CLASS_NOT_ONLY_COPY",
                      c["requires_before_retire"])
        self.assertIn("EXACT_DATA_ARCHIVE_COPY_SHA256_AND_IMMUTABLE_RECEIPT",
                      c["requires_before_retire"])
        self.assertIn("manual_unlink", c["forbidden_executor"])
        self.assertIn("sentry_safe_profile", c["forbidden_executor"])
        self.assertIn("future_generated_l1_class", c["forbidden_executor"])

    def test_original_hot_chain_and_t8_dependent_cold(self):
        c = self.p["exact_candidate"]
        self.assertEqual(c["current_chain"],
                         ["890d9dcc22d0","9cf670724c82","50b943a44a2e"])
        self.assertEqual(c["hot2_t8_previous_source"],
                         "dbceb5df20f98ff783a2af1a83d79cf17abae035")
        self.assertNotIn("dbceb5df20f9", c["current_chain"])
        self.assertIn("PRESERVE_T8_PREDECESSOR_RECOVERY_FLOOR",
                      c["requires_before_retire"])
        self.assertIn("GENUINE_CURRENT_BAE_890D_9CF_50B_OWNER_LEDGER_ADMISSION",
                      c["requires_before_retire"])

    def test_no_mutator_or_private_signer_in_policy(self):
        content = POLICY.read_text()
        for prohibited in ('"private_key_pem"', '"owner_signature_base64"',
                           '"automatic_retirement_authorized": true',
                           '"delete_or_prune_allowed": true',
                           '"fake_signature"', "shutil.rmtree("):
            self.assertNotIn(prohibited, content)

if __name__ == "__main__":
    unittest.main()
