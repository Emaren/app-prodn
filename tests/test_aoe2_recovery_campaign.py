import hashlib
import io
import tarfile
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

    def test_cms_encrypt_command_requires_streaming_for_large_payloads(self):
        command = campaign.cms_encrypt_command(
            Path("/tmp/recipient.pem"),
            Path("/tmp/output.cms.partial"),
        )
        self.assertIn("-stream", command)
        self.assertIn("-binary", command)
        self.assertIn("-aes256", command)
        self.assertEqual(command[0:3], ["openssl", "cms", "-encrypt"])
        self.assertEqual(command[-2:], ["-out", "/tmp/output.cms.partial"])

    def test_recovery_cms_chunk_ceiling_stays_well_below_multigib_limit(self):
        self.assertLessEqual(
            campaign.CMS_CHUNK_PLAINTEXT_BYTES,
            512 * 1024 * 1024,
        )
        self.assertGreater(campaign.CMS_CHUNK_PLAINTEXT_BYTES, 0)

    def test_cms_decrypt_command_binds_certificate_and_private_key(self):
        command = campaign.cms_decrypt_command(
            Path("/tmp/recipient.pem"),
            Path("/tmp/private.pem"),
            Path("/tmp/chunk.cms"),
        )
        self.assertEqual(command[0:3], ["openssl", "cms", "-decrypt"])
        self.assertIn("-binary", command)
        self.assertIn("-inform", command)
        self.assertIn("DER", command)
        self.assertEqual(command[-4:], [
            "-recip",
            "/tmp/recipient.pem",
            "-inkey",
            "/tmp/private.pem",
        ])

    @unittest.skipUnless(
        campaign.shutil.which("openssl") and campaign.shutil.which("tar"),
        "OpenSSL and tar are required for the chunked CMS integration test",
    )
    def test_chunked_cms_round_trip_reconstructs_tar_across_multiple_chunks(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            cert = root / "recipient.pem"
            key = root / "private.pem"
            campaign.subprocess.run(
                [
                    "openssl",
                    "req",
                    "-x509",
                    "-newkey",
                    "rsa:2048",
                    "-keyout",
                    str(key),
                    "-out",
                    str(cert),
                    "-nodes",
                    "-subj",
                    "/CN=AoE2WAR Recovery Test",
                    "-days",
                    "1",
                ],
                stdout=campaign.subprocess.DEVNULL,
                stderr=campaign.subprocess.DEVNULL,
                check=True,
            )

            payload = b"AOE2WAR-RECOVERY-" * 24000
            tar_buffer = io.BytesIO()
            with tarfile.open(fileobj=tar_buffer, mode="w") as archive:
                info = tarfile.TarInfo("payload.bin")
                info.size = len(payload)
                archive.addfile(info, io.BytesIO(payload))
            tar_bytes = tar_buffer.getvalue()

            chunk_root = root / "chunks"
            chunk_root.mkdir()
            source = io.BytesIO(tar_bytes)
            whole = hashlib.sha256()
            receipts = []

            with patch.object(
                campaign,
                "CMS_CHUNK_PLAINTEXT_BYTES",
                64 * 1024,
            ):
                while True:
                    receipt = campaign._capture_new_chunk(
                        source=source,
                        root=chunk_root,
                        index=len(receipts),
                        recipient_cert=cert,
                        private_key=key,
                        recipient_fingerprint="A" * 64,
                        whole_digest=whole,
                    )
                    if receipt is None:
                        break
                    receipts.append(receipt)

                restored_bytes, restored_sha = (
                    campaign._verify_chunked_tar_restore(
                        chunk_root,
                        receipts,
                        recipient_cert=cert,
                        private_key=key,
                    )
                )

            self.assertGreater(len(receipts), 1)
            self.assertEqual(restored_bytes, len(tar_bytes))
            self.assertEqual(
                restored_sha,
                hashlib.sha256(tar_bytes).hexdigest(),
            )
            self.assertEqual(whole.hexdigest(), restored_sha)

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

    def test_pause_marker_survives_stale_controller_state_write(self):
        with tempfile.TemporaryDirectory() as temporary:
            campaign_dir = Path(temporary)
            campaign_id = "pause-race"
            state = {
                "schema": 1,
                "kind": "aoe2war-recovery-campaign",
                "campaign_id": campaign_id,
                "status": "RUNNING_CAPTURE",
                "pid": None,
                "pause_requested": False,
                "pause_requested_at": None,
            }
            with patch.object(campaign, "CAMPAIGN_DIR", campaign_dir):
                campaign.save_state(state)
                requested = campaign.request_pause(campaign_id)
                self.assertTrue(requested["pause_requested"])
                self.assertTrue(campaign.pause_path(campaign_id).is_file())

                # Simulate the live controller holding a stale in-memory state
                # and saving it after a class completes.
                stale = dict(state)
                stale["pause_requested"] = False
                stale["pause_requested_at"] = None
                campaign.save_state(stale)

                marker = campaign.pause_marker(campaign_id)
                self.assertIsNotNone(marker)
                status = campaign.status_payload(campaign_id)
                self.assertTrue(status["pause_requested"])
                self.assertEqual(
                    status["pause_requested_at"],
                    marker["requested_at"],
                )

    def test_resume_clears_durable_pause_marker(self):
        with tempfile.TemporaryDirectory() as temporary:
            campaign_dir = Path(temporary)
            campaign_id = "resume-pause"
            state = {
                "schema": 1,
                "kind": "aoe2war-recovery-campaign",
                "campaign_id": campaign_id,
                "status": "PAUSED",
                "pid": None,
                "current_class": None,
                "pause_requested": True,
                "pause_requested_at": "2026-09-07T00:00:00+00:00",
            }
            with (
                patch.object(campaign, "CAMPAIGN_DIR", campaign_dir),
                patch.object(campaign, "validate_campaign_source"),
                patch.object(campaign, "spawn", return_value=12345),
            ):
                campaign.save_state(state)
                campaign.write_pause_marker(campaign_id)
                result = campaign.resume(campaign_id)

                self.assertFalse(campaign.pause_path(campaign_id).exists())
                self.assertFalse(result["pause_requested"])
                self.assertIsNone(result["pause_requested_at"])

    def test_resume_fails_closed_when_interrupted_inside_legacy_class(self):
        state = {
            "status": "FAILED",
            "current_class": "raw_replay_archive",
            "pid": None,
        }
        with (
            patch.object(campaign, "load_state", return_value=state),
            patch.object(campaign, "chunk_capture_has_checkpoint", return_value=False),
        ):
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "partial evidence",
            ):
                campaign.resume("test-campaign")

    def test_resume_allows_sealed_chunk_checkpoint(self):
        state = {
            "schema": 1,
            "kind": "aoe2war-recovery-campaign",
            "campaign_id": "chunk-resume",
            "status": "FAILED",
            "current_class": "parser_evidence_corpus",
            "pid": None,
            "pause_requested": False,
            "pause_requested_at": None,
        }
        with (
            patch.object(campaign, "load_state", return_value=state),
            patch.object(campaign, "chunk_capture_has_checkpoint", return_value=True),
            patch.object(campaign, "validate_campaign_source"),
            patch.object(campaign, "clear_pause_marker"),
            patch.object(campaign, "save_state"),
            patch.object(campaign, "spawn", return_value=24680),
        ):
            result = campaign.resume("chunk-resume")
        self.assertEqual(result["spawned_pid"], 24680)
        self.assertEqual(state["status"], "RESUME_REQUESTED")


if __name__ == "__main__":
    unittest.main()
