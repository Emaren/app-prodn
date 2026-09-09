import hashlib
import io
import shutil
import subprocess
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

    def test_preflight_uses_ordinary_capacity_even_when_full_campaign_is_not_ready(self):
        plan = {
            "capacity_ready": False,
            "authority": "Mac encrypted survival vault",
            "operator_free_bytes": 1000,
            "stages": [
                {
                    "class": name,
                    "state": "READY_TO_CAPTURE",
                    "estimated_bytes": 100,
                }
                for name in campaign.ORDINARY_CLASSES
            ] + [
                {
                    "class": "wolo_consensus_recovery",
                    "state": "AUTHORIZATION_REQUIRED",
                    "estimated_bytes": 800,
                }
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
        self.assertEqual(result["ordinary_payload_bytes"], 500)
        self.assertEqual(result["headroom_after_ordinary_bytes"], 500)
        self.assertEqual(
            result["ordinary_stage_estimates"],
            {name: 100 for name in campaign.ORDINARY_CLASSES},
        )
        self.assertFalse(result["full_campaign_capacity_ready"])

    def test_preflight_fails_when_ordinary_capture_itself_does_not_fit(self):
        plan = {
            "capacity_ready": False,
            "authority": "Mac encrypted survival vault",
            "operator_free_bytes": 499,
            "stages": [
                {
                    "class": name,
                    "state": "READY_TO_CAPTURE",
                    "estimated_bytes": 100,
                }
                for name in campaign.ORDINARY_CLASSES
            ],
        }
        with (
            patch.object(campaign, "require_tools"),
            patch.object(campaign.recovery, "campaign_plan", return_value=plan),
        ):
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "ordinary-capture capacity is not ready",
            ):
                campaign.preflight(None)

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

    def test_live_capture_progress_refines_class_checkpoint_without_writes(self):
        with tempfile.TemporaryDirectory() as temporary:
            bundle = Path(temporary)
            chunk_root = (
                bundle
                / "raw_replay_archive.cms.chunks"
            )
            chunk_root.mkdir(parents=True)

            state = {
                "current_class": "raw_replay_archive",
                "bundle_root": str(bundle),
                "completed_classes": [
                    "managed_user_media",
                    "legacy_direct_message_attachments",
                    "radio_wolo_private_media",
                    "parser_evidence_corpus",
                ],
                "ordinary_classes": list(campaign.ORDINARY_CLASSES),
                "ordinary_stage_estimates": {
                    "raw_replay_archive": 200,
                },
                "current_class_started_at": "2026-09-07T20:00:00+00:00",
            }

            receipts = [
                {
                    "plaintext_bytes": 100,
                    "created_at": "2026-09-07T20:00:10+00:00",
                }
            ]

            with patch.object(
                campaign,
                "_load_existing_chunk_receipts",
                return_value=receipts,
            ):
                progress = campaign._live_capture_progress(state)

        self.assertIsNotNone(progress)
        assert progress is not None
        self.assertEqual(progress["sealed_chunks"], 1)
        self.assertEqual(progress["observed_bytes"], 100)
        self.assertEqual(progress["expected_bytes"], 200)
        self.assertEqual(progress["class_percent"], 50.0)
        self.assertEqual(progress["overall_percent"], 90.0)
        self.assertEqual(
            progress["progress_basis"],
            "sealed + active encrypted chunk bytes",
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


    def test_cms_decrypt_command_uses_local_private_key_and_der_input(self):
        command = campaign.cms_stream_restore_decrypt_command(
            Path("/tmp/archive.cms"),
            Path("/tmp/recipient.pem"),
            Path("/tmp/private.pem"),
        )
        self.assertEqual(command[0:3], ["openssl", "cms", "-decrypt"])
        self.assertIn("-binary", command)
        self.assertEqual(
            command[command.index("-inform") + 1],
            "DER",
        )
        self.assertEqual(
            command[command.index("-inkey") + 1],
            "/tmp/private.pem",
        )

    def test_stream_tar_inspection_hashes_full_archive_and_restores_representative(self):
        payload = b"recovery proof payload\n"
        raw = io.BytesIO()
        with tarfile.open(fileobj=raw, mode="w") as archive:
            info = tarfile.TarInfo("safe/example.txt")
            info.size = len(payload)
            info.mode = 0o640
            archive.addfile(info, io.BytesIO(payload))
        data = raw.getvalue()

        result = campaign.inspect_plaintext_tar(
            io.BytesIO(data),
            representative_max_bytes=1024,
        )

        self.assertEqual(result["plaintext_tar_bytes"], len(data))
        self.assertEqual(
            result["plaintext_tar_sha256"],
            hashlib.sha256(data).hexdigest(),
        )
        self.assertEqual(result["tar_structure"], "PASS")
        self.assertEqual(result["member_count"], 1)
        self.assertEqual(
            result["representative_restore"]["status"],
            "PASS",
        )
        self.assertEqual(
            result["representative_restore"]["sha256"],
            hashlib.sha256(payload).hexdigest(),
        )
        self.assertTrue(
            result["representative_restore"]["workspace_removed_after_drill"]
        )

    @unittest.skipUnless(shutil.which("openssl"), "OpenSSL is required")
    def test_streamed_cms_round_trip_restores_hash_exact_tar(self):
        payload = b"AoE2WAR streamed restore integration test\n"
        raw = io.BytesIO()
        with tarfile.open(fileobj=raw, mode="w") as archive:
            info = tarfile.TarInfo("evidence/sample.txt")
            info.size = len(payload)
            info.mode = 0o600
            archive.addfile(info, io.BytesIO(payload))
        tar_bytes = raw.getvalue()

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            key = root / "private.pem"
            cert = root / "recipient.pem"
            encrypted = root / "archive.cms"

            subprocess.run(
                [
                    "openssl",
                    "req",
                    "-x509",
                    "-newkey",
                    "rsa:2048",
                    "-nodes",
                    "-subj",
                    "/CN=AoE2WAR Recovery Test",
                    "-keyout",
                    str(key),
                    "-out",
                    str(cert),
                    "-days",
                    "1",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True,
            )

            encrypted_proc = subprocess.run(
                campaign.cms_encrypt_command(cert, encrypted),
                input=tar_bytes,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                check=False,
            )
            self.assertEqual(
                encrypted_proc.returncode,
                0,
                encrypted_proc.stderr.decode(errors="replace"),
            )

            decrypt = subprocess.Popen(
                campaign.cms_stream_restore_decrypt_command(encrypted, cert, key),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            self.assertIsNotNone(decrypt.stdout)
            result = campaign.inspect_plaintext_tar(decrypt.stdout)
            decrypt.stdout.close()
            stderr = decrypt.stderr.read() if decrypt.stderr else b""
            if decrypt.stderr is not None:
                decrypt.stderr.close()
            self.assertEqual(
                decrypt.wait(),
                0,
                stderr.decode(errors="replace"),
            )

        self.assertEqual(result["plaintext_tar_bytes"], len(tar_bytes))
        self.assertEqual(
            result["plaintext_tar_sha256"],
            hashlib.sha256(tar_bytes).hexdigest(),
        )
        self.assertEqual(
            result["representative_restore"]["status"],
            "PASS",
        )

    def test_restore_state_requires_explicit_authorization(self):
        with self.assertRaisesRegex(
            campaign.CampaignError,
            "--authorize-ordinary-restore-drill",
        ):
            campaign.create_restore_state(
                "test-campaign",
                authorize_ordinary_restore_drill=False,
            )

    def test_restore_pause_marker_survives_stale_state_write(self):
        with tempfile.TemporaryDirectory() as temporary:
            restore_dir = Path(temporary)
            campaign_id = "restore-pause-race"
            state = {
                "schema": 1,
                "kind": "aoe2war-recovery-ordinary-restore-drill",
                "campaign_id": campaign_id,
                "status": "RUNNING_RESTORE",
                "pid": None,
                "pause_requested": False,
                "pause_requested_at": None,
                "ordinary_classes": list(campaign.ORDINARY_CLASSES),
                "completed_classes": [],
                "bundle_root": temporary,
            }
            with patch.object(campaign, "RESTORE_DIR", restore_dir):
                campaign.save_restore_state(state)
                requested = campaign.request_restore_pause(campaign_id)
                self.assertTrue(requested["pause_requested"])
                self.assertTrue(
                    campaign.restore_pause_path(campaign_id).is_file()
                )

                stale = dict(state)
                stale["pause_requested"] = False
                stale["pause_requested_at"] = None
                campaign.save_restore_state(stale)

                marker = campaign.restore_pause_marker(campaign_id)
                self.assertIsNotNone(marker)
                status = campaign.restore_status_payload(campaign_id)
                self.assertTrue(status["pause_requested"])
                self.assertEqual(
                    status["pause_requested_at"],
                    marker["requested_at"],
                )

    def test_restore_resume_clears_marker_at_clean_boundary(self):
        with tempfile.TemporaryDirectory() as temporary:
            restore_dir = Path(temporary) / "restore"
            bundle = Path(temporary) / "bundle"
            bundle.mkdir()
            campaign_id = "restore-resume"
            state = {
                "schema": 1,
                "kind": "aoe2war-recovery-ordinary-restore-drill",
                "campaign_id": campaign_id,
                "status": "PAUSED",
                "pid": None,
                "current_class": None,
                "current_class_started_at": None,
                "pause_requested": True,
                "pause_requested_at": "2026-09-07T00:00:00+00:00",
                "ordinary_classes": list(campaign.ORDINARY_CLASSES),
                "completed_classes": [],
                "bundle_root": str(bundle),
            }
            with (
                patch.object(campaign, "RESTORE_DIR", restore_dir),
                patch.object(campaign, "validate_restore_source"),
                patch.object(campaign, "spawn_restore", return_value=54321),
            ):
                campaign.save_restore_state(state)
                campaign.write_restore_pause_marker(campaign_id)
                result = campaign.resume_restore(campaign_id)

                self.assertFalse(
                    campaign.restore_pause_path(campaign_id).exists()
                )
                self.assertFalse(result["pause_requested"])
                self.assertIsNone(result["pause_requested_at"])

    def test_resume_fails_closed_when_interrupted_inside_class(self):
        state = {
            "status": "FAILED",
            "current_class": "raw_replay_archive",
            "pid": None,
        }
        with patch.object(campaign, "load_state", return_value=state):
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "partial evidence",
            ):
                campaign.resume("test-campaign")


if __name__ == "__main__":
    unittest.main()
