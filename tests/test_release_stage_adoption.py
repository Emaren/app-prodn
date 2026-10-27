"""Two-root website stage adoption refusals; no deployment or signatures."""
import sys
import tempfile
from pathlib import Path
import unittest
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import aoe2_release_stage_adoption as adoption


class StageAdoptionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.product = Path(self.tmp.name) / "product"
        self.controller = Path(self.tmp.name) / "controller"
        self.product.mkdir()
        self.controller.mkdir()
        self.path = (self.product / ".aoe2war-release" / "stage-receipts"
                     / adoption.STAGE_NAME)
        self.path.parent.mkdir(parents=True)
        self.path.write_text("{}")

    def loader_values(self):
        receipt = {
            "release_sha": adoption.SOURCE_SHA,
            "artifact_sha256": adoption.ARTIFACT_SHA,
            "staged_build_id": adoption.BUILD_ID,
            "previous_production_sha": adoption.PREVIOUS_SHA,
        }
        manifest = {
            "release_sha": adoption.SOURCE_SHA,
            "previous_production_sha": adoption.PREVIOUS_SHA,
            "migration_paths": [],
        }
        return (
            self.path, receipt, adoption.STAGE_SHA,
            self.product / "manifest", manifest, adoption.MANIFEST_SHA,
            self.product / "gate", adoption.GATE_SHA,
        )

    def test_distinct_roots_and_explicit_product_stage_binding(self):
        with mock.patch.object(adoption, "trusted_checkout",
                               side_effect=[adoption.SOURCE_SHA, "f" * 40]):
            with mock.patch.object(adoption.ship, "load_stage_receipt",
                                   return_value=self.loader_values()) as read:
                facts = adoption.stage_identity(self.product, self.controller)
        self.assertEqual(read.call_args.kwargs["source_root"], self.product)
        self.assertEqual(facts["controller_source_sha"], "f" * 40)
        self.assertFalse(facts["historical_pre_stage_approval_proven"])

    def test_same_root_refused_before_loading_receipt(self):
        with mock.patch.object(adoption, "trusted_checkout") as check:
            with self.assertRaisesRegex(adoption.Hold, "NOT_INDEPENDENT"):
                adoption.stage_identity(self.product, self.product)
            check.assert_not_called()

    def test_missing_receipt_never_falls_back_to_controller(self):
        self.path.unlink()
        with mock.patch.object(adoption, "trusted_checkout",
                               side_effect=[adoption.SOURCE_SHA, "f" * 40]):
            with mock.patch.object(adoption.ship, "load_stage_receipt") as read:
                with self.assertRaisesRegex(adoption.Hold, "NOT_PRESENT"):
                    adoption.stage_identity(self.product, self.controller)
                read.assert_not_called()

    def test_wrong_stage_hash_refused(self):
        values = list(self.loader_values())
        values[2] = "9" * 64
        with mock.patch.object(adoption, "trusted_checkout",
                               side_effect=[adoption.SOURCE_SHA, "f" * 40]):
            with mock.patch.object(adoption.ship, "load_stage_receipt",
                                   return_value=tuple(values)):
                with self.assertRaisesRegex(adoption.Hold, "HASH_CHANGED"):
                    adoption.stage_identity(self.product, self.controller)

    def test_missing_git_metadata_is_not_a_clean_checkout(self):
        with self.assertRaisesRegex(adoption.Hold, "GIT_SOURCE_PROVENANCE"):
            adoption.trusted_checkout(self.controller)

    def test_even_valid_source_facts_do_not_authorize_release(self):
        facts = {
            "product_source_sha": adoption.SOURCE_SHA,
            "controller_source_sha": "f" * 40,
            "historical_pre_stage_approval_proven": False,
        }
        with mock.patch.object(adoption, "stage_identity",
                               return_value=facts):
            observed = adoption.inspect(self.product, self.controller)
        self.assertFalse(observed["release_authorized"])
        self.assertFalse(observed["deploy_performed"])
        self.assertFalse(observed["financial_release_authorized"])
        self.assertIn("HOLD", observed["status"])

    def test_wrong_owner_packet_domain_rejected(self):
        with self.assertRaisesRegex(adoption.Hold, "SIGNATURE_DOMAIN"):
            adoption.verify_signed_adoption_review(
                {"schema": 1, "policy": "different", "payload": {},
                 "signature": ""}, {}
            )

    def test_owner_packet_financial_escalation_rejected(self):
        facts = {
            "product_source_sha": adoption.SOURCE_SHA,
            "controller_source_sha": "f" * 40,
            "previous_production_sha": adoption.PREVIOUS_SHA,
            "artifact_sha256": adoption.ARTIFACT_SHA,
            "stage_receipt_sha256": adoption.STAGE_SHA,
            "manifest_sha256": adoption.MANIFEST_SHA,
            "gate_sha256": adoption.GATE_SHA,
            "build_id": adoption.BUILD_ID,
            "historical_pre_stage_approval_proven": False,
        }
        payload = {
            "kind": adoption.POLICY,
            "phase": "ADOPT_ALREADY_STAGED",
            "nonce": "n" * 32,
            "issued_at": "2026-10-27T03:00:00Z",
            "expires_at": "2026-10-27T03:10:00Z",
            "owner_pubkey_der_sha256": "f" * 64,
            **facts,
            "wolo_runtime_witness_sha256": "1" * 64,
            "financial_noninterference_sha256": "2" * 64,
            "financial_release_authorized": True,
            "custody_authorized": False,
        }
        packet = {"schema": 1, "policy": adoption.POLICY,
                  "payload": payload, "signature": "unsigned"}
        with self.assertRaisesRegex(adoption.Hold, "FINANCIAL_ESCALATION"):
            adoption.verify_signed_adoption_review(packet, facts)

    def test_duplicate_owner_packet_keys_rejected(self):
        p = Path(self.tmp.name) / "owner-packet"
        p.write_text('{"schema":1,"schema":1}')
        with self.assertRaisesRegex(adoption.Hold, "INVALID_OWNER_PACKET"):
            adoption.read_packet(p)


if __name__ == "__main__":
    unittest.main()
