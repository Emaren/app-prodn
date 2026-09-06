import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import scripts.aoe2_recovery_campaign as campaign


class RecoveryCampaignTests(unittest.TestCase):
    def test_ordinary_stage_set_excludes_wolo_authorization_classes(self):
        stages = [
            {"class": name, "state": "READY_TO_CAPTURE"}
            for name in campaign.ORDINARY_CLASSES
        ] + [
            {"class": "wolo_settlement_state", "state": "AUTHORIZATION_REQUIRED"},
            {"class": "wolo_consensus_recovery", "state": "AUTHORIZATION_REQUIRED"},
            {"class": "wolo_key_custody", "state": "SEPARATE_AUTHORIZATION_REQUIRED"},
        ]
        result = campaign.ordinary_stages({"stages": stages})
        self.assertEqual(
            [item["class"] for item in result],
            list(campaign.ORDINARY_CLASSES),
        )

    def test_parser_tar_command_preserves_selected_roots_only(self):
        plan = {
            "inventory": {
                "classes": {
                    "parser_evidence_corpus": {
                        "path": "/mnt/HC_Volume_105319120/aoe2-parser-engine"
                    }
                }
            }
        }
        stage = {
            "class": "parser_evidence_corpus",
            "include_top_level": [
                "backups",
                "cold-archives",
                "evidence",
                "golden-fixtures",
                "jobs",
                "promotions",
                "reports",
            ],
        }
        command = campaign.remote_tar_command(plan, stage)
        self.assertEqual(command[:4], ["tar", "--numeric-owner", "-C", "/mnt/HC_Volume_105319120/aoe2-parser-engine"])
        self.assertNotIn("tmp", command)
        self.assertIn("cold-archives", command)
        self.assertIn("jobs", command)

    def test_create_state_requires_explicit_ordinary_capture_authorization(self):
        with self.assertRaisesRegex(
            campaign.CampaignError,
            "--authorize-ordinary-capture",
        ):
            campaign.create_state(
                recipient_cert=None,
                authorize_ordinary_capture=False,
            )

    def test_preflight_keeps_all_wolo_mutation_unauthorized(self):
        plan = {
            "capacity_ready": True,
            "authority": "Mac encrypted survival vault",
            "operator_free_bytes": 1000,
            "stages": [
                {
                    "class": name,
                    "state": "READY_TO_CAPTURE",
                    "estimated_bytes": 10,
                }
                for name in campaign.ORDINARY_CLASSES
            ],
        }
        pilot = {
            "status": "PILOT_VERIFIED",
            "recipient_certificate_fingerprint": "sha256 Fingerprint=AA:BB",
        }
        with tempfile.TemporaryDirectory() as temporary:
            cert = Path(temporary) / "recipient.crt"
            cert.write_text("certificate placeholder")
            with (
                patch.object(campaign, "require_tools"),
                patch.object(campaign.recovery, "campaign_plan", return_value=plan),
                patch.object(
                    campaign.recovery,
                    "evaluate",
                    return_value={"pilot": pilot},
                ),
                patch.object(
                    campaign,
                    "resolve_recipient_certificate",
                    return_value=(cert, "AABB"),
                ),
                patch.object(
                    campaign,
                    "verify_canonical_private_key",
                    return_value={
                        "path": "/private/recovery-v1-private.pem",
                        "mode": "600",
                        "certificate_match": True,
                    },
                ),
                patch.object(campaign, "source_identity", return_value="a" * 40),
            ):
                result = campaign.preflight(None)

        self.assertEqual(result["status"], "READY")
        self.assertFalse(result["wolo_mutation_authorized"])
        self.assertFalse(result["settlement_mutation_authorized"])
        self.assertFalse(result["key_material_in_general_vault"])


    def test_canonical_certificate_is_preferred_when_fingerprint_matches(self):
        pilot = {
            "recipient_certificate_fingerprint": "AA:BB",
        }
        with tempfile.TemporaryDirectory() as temporary:
            cert = Path(temporary) / "recovery-v1-recipient.pem"
            cert.write_text("certificate placeholder")
            with (
                patch.object(
                    campaign,
                    "CANONICAL_RECOVERY_CERTIFICATE",
                    cert,
                ),
                patch.object(
                    campaign,
                    "certificate_fingerprint",
                    return_value="AABB",
                ),
            ):
                resolved, fingerprint = campaign.resolve_recipient_certificate(
                    None,
                    pilot,
                )
        self.assertEqual(resolved, cert.resolve())
        self.assertEqual(fingerprint, "AABB")

    def test_private_key_verification_requires_0600_and_key_match(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            private_key = root / "recovery-v1-private.pem"
            certificate = root / "recovery-v1-recipient.pem"
            private_key.write_text("private placeholder")
            certificate.write_text("certificate placeholder")
            private_key.chmod(0o600)

            with (
                patch.object(
                    campaign,
                    "CANONICAL_RECOVERY_PRIVATE_KEY",
                    private_key,
                ),
                patch.object(
                    campaign,
                    "private_key_matches_certificate",
                    return_value=True,
                ),
            ):
                result = campaign.verify_canonical_private_key(certificate)

            self.assertEqual(result["mode"], "600")
            self.assertTrue(result["certificate_match"])

            private_key.chmod(0o644)
            with (
                patch.object(
                    campaign,
                    "CANONICAL_RECOVERY_PRIVATE_KEY",
                    private_key,
                ),
                self.assertRaisesRegex(
                    campaign.CampaignError,
                    "mode 0600",
                ),
            ):
                campaign.verify_canonical_private_key(certificate)

    def test_resume_fails_closed_when_interrupted_inside_class(self):
        state = {
            "status": "FAILED",
            "current_class": "raw_replay_archive",
            "pid": None,
        }
        with patch.object(campaign, "load_state", return_value=state):
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "partial artifact",
            ):
                campaign.resume("test-campaign")


if __name__ == "__main__":
    unittest.main()
