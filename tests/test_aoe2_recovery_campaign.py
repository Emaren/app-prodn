import hashlib
import io
import json
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import scripts.aoe2_recovery_campaign as campaign


def build_chunked_restore_fixture(
    root: Path,
    *,
    campaign_id: str = "chunked-restore",
    class_name: str = "managed_user_media",
):
    cert = root / "recipient.pem"
    key = root / "private.pem"
    campaign.subprocess.run(
        [
            "openssl", "req", "-x509", "-newkey", "rsa:2048",
            "-keyout", str(key), "-out", str(cert), "-nodes",
            "-subj", "/CN=AoE2WAR Chunked Restore Test", "-days", "1",
        ],
        stdout=campaign.subprocess.DEVNULL,
        stderr=campaign.subprocess.DEVNULL,
        check=True,
    )
    fingerprint = "A" * 64
    payload = b"AOE2WAR-CHUNKED-RESTORE-" * 12000
    tar_buffer = io.BytesIO()
    with tarfile.open(fileobj=tar_buffer, mode="w") as archive:
        info = tarfile.TarInfo("payload.bin")
        info.size = len(payload)
        archive.addfile(info, io.BytesIO(payload))
    tar_bytes = tar_buffer.getvalue()

    chunk_root = root / f"{class_name}.cms.chunks"
    chunk_root.mkdir(parents=True)
    source = io.BytesIO(tar_bytes)
    whole = hashlib.sha256()
    receipts = []
    with patch.object(campaign, "CMS_CHUNK_PLAINTEXT_BYTES", 64 * 1024):
        while True:
            receipt = campaign._capture_new_chunk(
                source=source,
                root=chunk_root,
                index=len(receipts),
                recipient_cert=cert,
                private_key=key,
                recipient_fingerprint=fingerprint,
                whole_digest=whole,
            )
            if receipt is None:
                break
            receipts.append(receipt)

    manifest = {
        "schema": 1,
        "kind": "aoe2war-recovery-cms-chunk-manifest",
        "format": campaign.CMS_CHUNK_FORMAT,
        "campaign_id": campaign_id,
        "class": class_name,
        "created_at": campaign.utc_now(),
        "chunk_plaintext_limit_bytes": 64 * 1024,
        "chunk_count": len(receipts),
        "plaintext_tar_bytes": len(tar_bytes),
        "plaintext_tar_sha256": hashlib.sha256(tar_bytes).hexdigest(),
        "ciphertext_bytes": sum(int(item["ciphertext_bytes"]) for item in receipts),
        "recipient_certificate_fingerprint": fingerprint,
        "chunks": [
            {
                "index": index,
                "directory": f"chunk-{index:06d}",
                "plaintext_bytes": int(item["plaintext_bytes"]),
                "plaintext_sha256": item["plaintext_sha256"],
                "ciphertext_bytes": int(item["ciphertext_bytes"]),
                "ciphertext_sha256": item["ciphertext_sha256"],
            }
            for index, item in enumerate(receipts)
        ],
        "streamed_tar_restore_test": "PASS",
    }
    manifest_path = chunk_root / "manifest.json"
    manifest_sha = campaign.write_json_with_sidecar(manifest_path, manifest)
    proof = {
        "schema": 1,
        "kind": "aoe2war-recovery-capture-proof",
        "campaign_id": campaign_id,
        "class": class_name,
        "status": "CAPTURED_PENDING_RESTORE",
        "created_at": campaign.utc_now(),
        "artifact_format": campaign.CMS_CHUNK_FORMAT,
        "chunk_count": len(receipts),
        "chunk_manifest_file": str(manifest_path.relative_to(root)),
        "chunk_manifest_sha256": manifest_sha,
        "plaintext_tar_bytes": len(tar_bytes),
        "plaintext_tar_sha256": hashlib.sha256(tar_bytes).hexdigest(),
        "ciphertext_bytes": manifest["ciphertext_bytes"],
        "cms_streaming": True,
        "recipient_certificate_fingerprint": fingerprint,
    }
    proof_path = root / "proofs" / f"{class_name}.json"
    campaign.write_json_with_sidecar(proof_path, proof)
    return {
        "campaign_id": campaign_id,
        "class_name": class_name,
        "cert": cert,
        "key": key,
        "tar_bytes": tar_bytes,
        "proof_path": proof_path,
        "manifest_path": manifest_path,
        "receipts": receipts,
    }


def wolo_snapshot_fixture(campaign_id: str = "ordinary-test") -> dict:
    remote_stage = (
        f"{campaign.WOLO_REMOTE_STAGING_ROOT}/"
        f"{campaign_id}-wolo-20260910T010000Z-aaaaaaaaaaaa"
    )
    remote = {
        "schema": 1,
        "kind": "aoe2war-recovery-wolo-staged-snapshot",
        "status": campaign.WOLO_SNAPSHOT_STATUS,
        "snapshot_id": "snapshot-test",
        "tool_source": "a" * 40,
        "remote_stage": remote_stage,
        "service_restarted": True,
        "static_source_sealed_after_restart": True,
        "general_vault_secret_contents_included": False,
        "wolo_chain_data_mutated": False,
        "settlement_state_mutated": False,
        "staged_priv_validator_height": 123,
        "post_restart_height": 125,
        "static_tar_identities": {
            "wolo_settlement_state": {
                "members": [
                    "settlement-state",
                    "founder-rewards-settlement-state",
                ],
                "tar_bytes": 10240,
                "tar_sha256": "1" * 64,
                "tar_sort": "name",
                "numeric_owner": True,
            },
            "wolo_consensus_recovery": {
                "members": ["consensus"],
                "tar_bytes": 20480,
                "tar_sha256": "2" * 64,
                "tar_sort": "name",
                "numeric_owner": True,
            },
        },
    }
    return {
        "schema": 1,
        "kind": "aoe2war-recovery-wolo-snapshot-state",
        "campaign_id": campaign_id,
        "snapshot_id": "snapshot-test",
        "status": campaign.WOLO_SNAPSHOT_STATUS,
        "tool_source": "a" * 40,
        "remote_stage": remote_stage,
        "requires_operator_reconciliation": False,
        "remote": remote,
        "proof_path": "/tmp/wolo-snapshot.json",
        "proof_sha256": "3" * 64,
    }




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


    def _wolo_inventory(self):
        home = campaign.WOLO_MAINNET_HOME
        return {
            "schema": 1,
            "classes": {
                "wolo_settlement_state": {
                    "exists": True,
                    "path": "/mnt/wolo/settlement-state",
                    "bytes": 3_000,
                },
                "wolo_founder_rewards_settlement_state": {
                    "exists": True,
                    "path": "/mnt/wolo/founder-rewards-settlement-state",
                    "bytes": 1_000,
                },
            },
            "listeners": [
                "LISTEN 0 4096 127.0.0.1:8092 0.0.0.0:*",
                "LISTEN 0 4096 127.0.0.1:8093 0.0.0.0:*",
            ],
            "wolo": {
                "service": campaign.WOLO_MAINNET_SERVICE,
                "active": "active",
                "main_pid": 987,
                "home": home,
                "home_identity": {"exists": True, "path": home, "bytes": 6_000},
                "data_identity": {"exists": True, "path": home + "/data", "bytes": 5_000},
                "config_identity": {"exists": True, "path": home + "/config", "bytes": 500},
                "services": {
                    campaign.WOLO_MAINNET_SERVICE: {
                        "id": campaign.WOLO_MAINNET_SERVICE,
                        "active": "active",
                        "sub_state": "running",
                        "main_pid": 987,
                        "requires": ["system.slice"],
                        "after": ["network-online.target"],
                    },
                    campaign.WOLO_SETTLEMENT_SERVICE: {
                        "id": campaign.WOLO_SETTLEMENT_SERVICE,
                        "active": "active",
                        "sub_state": "running",
                        "main_pid": 994,
                        "requires": [campaign.WOLO_MAINNET_SERVICE],
                        "after": [campaign.WOLO_MAINNET_SERVICE],
                    },
                    campaign.WOLO_FOUNDER_REWARDS_SERVICE: {
                        "id": campaign.WOLO_FOUNDER_REWARDS_SERVICE,
                        "active": "active",
                        "sub_state": "running",
                        "main_pid": 992,
                        "requires": [campaign.WOLO_MAINNET_SERVICE],
                        "after": [campaign.WOLO_MAINNET_SERVICE],
                    },
                },
                "key_custody_metadata": [
                    {
                        "path": home + "/config/priv_validator_key.json",
                        "exists": True,
                        "bytes": 345,
                        "mode": "600",
                        "owner": "root:root",
                    },
                    {
                        "path": home + "/config/node_key.json",
                        "exists": True,
                        "bytes": 148,
                        "mode": "600",
                        "owner": "root:root",
                    },
                    {
                        "path": home + "/keyring-file",
                        "exists": True,
                        "bytes": 2712,
                        "mode": "700",
                        "owner": "root:root",
                    },
                ],
            },
        }

    def test_wolo_preflight_ready_is_observational_and_unauthorized(self):
        result = campaign.build_wolo_preflight(
            self._wolo_inventory(),
            20_000,
            tool_source="a" * 40,
            tool_branch="feature/recovery-preflight",
            tool_dirty=False,
        )

        self.assertEqual(result["status"], "READY")
        self.assertEqual(result["blockers"], [])
        self.assertEqual(result["wolo"]["listener_counts"], {"8092": 1, "8093": 1})

        self.assertEqual(
            set(result["wolo"]["services"]),
            {
                campaign.WOLO_MAINNET_SERVICE,
                campaign.WOLO_SETTLEMENT_SERVICE,
                campaign.WOLO_FOUNDER_REWARDS_SERVICE,
            },
        )
        self.assertEqual(result["proposed_quiesce_order"], list(campaign.WOLO_QUIESCE_ORDER))
        self.assertEqual(result["proposed_restart_order"], list(campaign.WOLO_RESTART_ORDER))
        self.assertEqual(result["settlement_state_bytes"], 4_000)
        self.assertEqual(result["consensus_estimated_bytes"], 6_000)
        self.assertEqual(result["estimated_encrypted_payload_bytes"], 10_000)
        self.assertEqual(result["headroom_after_estimated_payload_bytes"], 10_000)
        self.assertTrue(result["capacity_ready"])
        self.assertFalse(result["key_custody"]["secret_contents_read"])
        self.assertFalse(result["key_custody"]["general_vault_payload"])
        self.assertTrue(result["key_custody"]["separate_custody_required"])
        self.assertEqual(
            result["authorization"],
            {
                "settlement_capture": False,
                "wolo_quiesce": False,
                "consensus_capture": False,
                "key_custody": False,
            },
        )
        self.assertFalse(result["production_mutated"])
        self.assertFalse(result["wolo_mutated"])

    def test_wolo_preflight_blocks_duplicate_protected_listener(self):
        inventory = self._wolo_inventory()
        inventory["listeners"].append(
            "LISTEN 0 4096 127.0.0.1:8092 0.0.0.0:*"
        )
        result = campaign.build_wolo_preflight(
            inventory,
            20_000,
            tool_source="a" * 40,
            tool_branch="main",
            tool_dirty=False,
        )

        self.assertEqual(result["status"], "BLOCKED")
        self.assertIn(
            "protected Wolo listener 8092 count must be exactly 1, got 2",
            result["blockers"],
        )
        self.assertFalse(result["authorization"]["wolo_quiesce"])

    def test_wolo_preflight_blocks_weak_or_missing_key_custody_metadata(self):
        inventory = self._wolo_inventory()
        metadata = inventory["wolo"]["key_custody_metadata"]
        metadata[0]["mode"] = "644"
        metadata[:] = [
            item
            for item in metadata
            if not str(item["path"]).endswith("/keyring-file")
        ]
        result = campaign.build_wolo_preflight(
            inventory,
            20_000,
            tool_source="a" * 40,
            tool_branch="main",
            tool_dirty=False,
        )

        self.assertEqual(result["status"], "BLOCKED")
        self.assertTrue(
            any("priv_validator_key.json" in item and "mode mismatch" in item for item in result["blockers"])
        )
        self.assertTrue(
            any("keyring-file" in item and "missing" in item for item in result["blockers"])
        )
        self.assertFalse(result["key_custody"]["secret_contents_read"])

    def test_wolo_preflight_blocks_settlement_service_dependency_drift(self):
        inventory = self._wolo_inventory()
        inventory["wolo"]["services"][campaign.WOLO_SETTLEMENT_SERVICE]["requires"] = []
        result = campaign.build_wolo_preflight(
            inventory,
            20_000,
            tool_source="a" * 40,
            tool_branch="main",
            tool_dirty=False,
        )

        self.assertEqual(result["status"], "BLOCKED")
        self.assertTrue(
            any(
                campaign.WOLO_SETTLEMENT_SERVICE in item
                and "does not require" in item
                for item in result["blockers"]
            )
        )
        self.assertEqual(
            result["proposed_quiesce_order"],
            list(campaign.WOLO_QUIESCE_ORDER),
        )
        self.assertEqual(
            result["proposed_restart_order"],
            list(campaign.WOLO_RESTART_ORDER),
        )

    def test_wolo_preflight_blocks_insufficient_mac_capacity(self):
        result = campaign.build_wolo_preflight(
            self._wolo_inventory(),
            9_999,
            tool_source="a" * 40,
            tool_branch="main",
            tool_dirty=False,
        )

        self.assertEqual(result["status"], "BLOCKED")
        self.assertFalse(result["capacity_ready"])
        self.assertTrue(
            any("capacity is insufficient" in item for item in result["blockers"])
        )

    def test_parser_exposes_wolo_preflight(self):
        args = campaign.parser().parse_args(["wolo-preflight", "--json"])
        self.assertEqual(args.command, "wolo-preflight")
        self.assertTrue(args.json)


    def test_wolo_snapshot_plan_requires_remote_staging_headroom(self):
        preflight = {
            "status": "READY",
            "blockers": [],
            "estimated_encrypted_payload_bytes": 1_000,
        }
        ready = campaign.build_wolo_snapshot_plan(
            preflight,
            remote_volume_free_bytes=(
                campaign.WOLO_REMOTE_MIN_HEADROOM_BYTES + 1_001
            ),
        )
        blocked = campaign.build_wolo_snapshot_plan(
            preflight,
            remote_volume_free_bytes=(
                campaign.WOLO_REMOTE_MIN_HEADROOM_BYTES + 999
            ),
        )

        self.assertEqual(ready["status"], "READY")
        self.assertEqual(
            ready["remote_headroom_after_estimate_bytes"],
            campaign.WOLO_REMOTE_MIN_HEADROOM_BYTES + 1,
        )
        self.assertFalse(ready["wolo_service_mutation_authorized"])
        self.assertFalse(ready["wolo_data_mutation_authorized"])
        self.assertFalse(ready["recovery_class_proven_after_staging"])
        self.assertEqual(blocked["status"], "BLOCKED")
        self.assertTrue(
            any(
                "insufficient HC-volume headroom" in item
                for item in blocked["blockers"]
            )
        )

    def test_wolo_snapshot_remote_script_is_whitelist_and_fail_safe(self):
        script = campaign.wolo_snapshot_remote_script(
            snapshot_id="campaign-wolo-test",
            tool_source="a" * 40,
        )

        self.assertIn('"$WOLO_HOME/data/"', script)
        self.assertIn('"$WOLO_HOME/config/"', script)
        self.assertIn("--exclude='priv_validator_key.json'", script)
        self.assertIn("--exclude='node_key.json'", script)
        self.assertNotIn(
            'live_rsync -a --delete "$WOLO_HOME/"',
            script,
        )
        self.assertNotIn(
            'rsync -a --checksum --delete "$WOLO_HOME/"',
            script,
        )
        self.assertIn("rsync -a --checksum --delete", script)
        self.assertIn("sync -f \"$STAGE\"", script)
        self.assertIn(
            '[ ! -e "$STAGE/keyring-file" ]',
            script,
        )
        self.assertIn(
            '[ ! -e "$STAGE/keyring-test" ]',
            script,
        )
        self.assertIn(
            '[ ! -e "$STAGE/.wolochain" ]',
            script,
        )

        phase = script.index("# Phase 2:")
        trap_index = script.index(
            "trap emergency_restart EXIT HUP INT TERM"
        )
        armed = script.index("QUIESCED=1", phase)
        stop_founder = script.index(
            'systemctl stop "$FOUNDER_UNIT"',
            armed,
        )
        stop_settle = script.index(
            'systemctl stop "$SETTLE"',
            stop_founder,
        )
        stop_node = script.index(
            'systemctl stop "$NODE"',
            stop_settle,
        )
        helper_start_node = script.index(
            'systemctl start "$NODE"',
        )
        helper_start_settle = script.index(
            'systemctl start "$SETTLE"',
            helper_start_node,
        )
        helper_start_founder = script.index(
            'systemctl start "$FOUNDER_UNIT"',
            helper_start_settle,
        )
        checksum = script.index("sync_final_checksum", phase)
        flush = script.index('sync -f "$STAGE"', checksum)
        normal_restart = script.index(
            'restart_all || fail "dependency-safe Wolo restart failed"',
            flush,
        )

        self.assertLess(trap_index, phase)
        self.assertLess(helper_start_node, helper_start_settle)
        self.assertLess(helper_start_settle, helper_start_founder)
        self.assertLess(armed, stop_founder)
        self.assertLess(stop_founder, stop_settle)
        self.assertLess(stop_settle, stop_node)
        self.assertLess(stop_node, checksum)
        self.assertLess(checksum, flush)
        self.assertLess(flush, normal_restart)
        self.assertIn(campaign.WOLO_RPC_STATUS_URL, script)
        self.assertIn(campaign.WOLO_REST_NODE_INFO_URL, script)
        self.assertIn(
            'require_listener_owner 8092 "$SETTLE"',
            script,
        )
        self.assertIn(
            'require_listener_owner 8093 "$FOUNDER_UNIT"',
            script,
        )
        self.assertIn("STAGED_VALIDATOR_HEIGHT", script)
        self.assertIn(
            '"staged_priv_validator_height": int(staged_validator_height)',
            script,
        )
        self.assertIn(
            '[ "$HEIGHT" -ge "$STAGED_VALIDATOR_HEIGHT" ]',
            script,
        )
        self.assertIn('"wolo_chain_data_mutated": False', script)
        self.assertIn('"settlement_state_mutated": False', script)
        self.assertIn(
            '"general_vault_secret_contents_included": False',
            script,
        )

    @unittest.skipUnless(
        campaign.shutil.which("bash"),
        "bash is required for generated controller syntax validation",
    )
    def test_wolo_snapshot_remote_script_is_valid_bash(self):
        script = campaign.wolo_snapshot_remote_script(
            snapshot_id="campaign-wolo-syntax",
            tool_source="a" * 40,
        )
        result = subprocess.run(
            ["bash", "-n"],
            input=script,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_wolo_snapshot_script_seals_deterministic_static_tar_identities(self):
        script = campaign.wolo_snapshot_remote_script(
            snapshot_id="campaign-wolo-static-seal",
            tool_source="a" * 40,
        )

        self.assertIn("export LC_ALL=C", script)
        self.assertIn("tar --sort=name --numeric-owner", script)
        self.assertIn("SETTLEMENT_TAR_BYTES", script)
        self.assertIn("SETTLEMENT_TAR_SHA", script)
        self.assertIn("CONSENSUS_TAR_BYTES", script)
        self.assertIn("CONSENSUS_TAR_SHA", script)
        self.assertIn('"static_tar_identities"', script)
        self.assertIn('"static_source_sealed_after_restart": True', script)

    def test_remote_tar_command_supports_static_wolo_stage_source(self):
        stage = {
            "class": "wolo_settlement_state",
            "source_root": "/mnt/recovery/wolo/snapshot-1",
            "include_top_level": [
                "settlement-state",
                "founder-rewards-settlement-state",
            ],
            "tar_sort": "name",
        }
        command = campaign.remote_tar_command({"inventory": {}}, stage)

        self.assertEqual(
            command,
            [
                "tar",
                "--numeric-owner",
                "--sort=name",
                "-C",
                "/mnt/recovery/wolo/snapshot-1",
                "-cf",
                "-",
                "--",
                "settlement-state",
                "founder-rewards-settlement-state",
            ],
        )

    def test_expected_tar_identity_accepts_exact_and_rejects_drift(self):
        stage = {
            "expected_plaintext_tar_bytes": 12345,
            "expected_plaintext_tar_sha256": "a" * 64,
        }
        exact = {
            "plaintext_tar_bytes": 12345,
            "plaintext_tar_sha256": "a" * 64,
        }
        campaign.assert_expected_tar_identity(stage, exact)

        with self.assertRaisesRegex(
            campaign.CampaignError,
            "does not match the sealed staged snapshot",
        ):
            campaign.assert_expected_tar_identity(
                stage,
                {
                    "plaintext_tar_bytes": 12346,
                    "plaintext_tar_sha256": "a" * 64,
                },
            )
        with self.assertRaisesRegex(
            campaign.CampaignError,
            "does not match the sealed staged snapshot",
        ):
            campaign.assert_expected_tar_identity(
                stage,
                {
                    "plaintext_tar_bytes": 12345,
                    "plaintext_tar_sha256": "b" * 64,
                },
            )

    def test_expected_tar_identity_rejects_incomplete_expectation(self):
        with self.assertRaisesRegex(
            campaign.CampaignError,
            "expected staged tar identity is incomplete or invalid",
        ):
            campaign.assert_expected_tar_identity(
                {"expected_plaintext_tar_bytes": 12345},
                {
                    "plaintext_tar_bytes": 12345,
                    "plaintext_tar_sha256": "a" * 64,
                },
            )

    def test_validated_wolo_snapshot_requires_post_restart_static_seal(self):
        value = wolo_snapshot_fixture()
        with patch.object(campaign, "wolo_snapshot_status", return_value=value):
            result = campaign._validated_wolo_snapshot("ordinary-test")
        self.assertEqual(result["snapshot_id"], "snapshot-test")

        broken = wolo_snapshot_fixture()
        broken["remote"]["static_source_sealed_after_restart"] = False
        with patch.object(campaign, "wolo_snapshot_status", return_value=broken):
            with self.assertRaisesRegex(campaign.CampaignError, "post-restart static seal"):
                campaign._validated_wolo_snapshot("ordinary-test")

    def test_validated_wolo_snapshot_rejects_non_hex_tar_identity(self):
        broken = wolo_snapshot_fixture()
        broken["remote"]["static_tar_identities"]["wolo_consensus_recovery"]["tar_sha256"] = "Z" * 64
        with patch.object(campaign, "wolo_snapshot_status", return_value=broken):
            with self.assertRaisesRegex(campaign.CampaignError, "SHA identity invalid"):
                campaign._validated_wolo_snapshot("ordinary-test")

    def test_wolo_offhost_stage_map_is_exact_and_non_secret(self):
        snapshot = wolo_snapshot_fixture()
        stages = campaign.build_wolo_offhost_stages(snapshot)
        self.assertEqual([item["class"] for item in stages], list(campaign.WOLO_OFFHOST_CLASSES))
        settlement, consensus = stages
        self.assertEqual(
            settlement["include_top_level"],
            ["settlement-state", "founder-rewards-settlement-state"],
        )
        self.assertEqual(consensus["include_top_level"], ["consensus"])
        self.assertEqual(settlement["source_root"], snapshot["remote_stage"])
        self.assertEqual(consensus["source_root"], snapshot["remote_stage"])
        self.assertNotIn("priv_validator_key.json", repr(stages))
        self.assertNotIn("keyring", repr(stages).lower())

    def test_wolo_offhost_start_requires_explicit_authorization(self):
        with patch.object(campaign, "wolo_offhost_preflight") as preflight:
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "--authorize-wolo-offhost-capture",
            ):
                campaign.create_wolo_offhost_state(
                    "ordinary-test",
                    authorize_wolo_offhost_capture=False,
                )
        preflight.assert_not_called()

    def test_remote_wolo_stage_receipt_must_match_local_sealed_state(self):
        snapshot = wolo_snapshot_fixture()
        changed = dict(snapshot["remote"])
        changed["post_restart_height"] = 999
        completed = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=json.dumps(changed),
            stderr="",
        )
        with patch.object(campaign.subprocess, "run", return_value=completed):
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "no longer matches local sealed state",
            ):
                campaign.verify_remote_wolo_stage_receipt(snapshot)

    def test_existing_wolo_capture_rejects_different_snapshot_evidence(self):
        stage = campaign.build_wolo_offhost_stages(wolo_snapshot_fixture())[0]
        capture = {
            "plaintext_tar_bytes": stage["expected_plaintext_tar_bytes"],
            "plaintext_tar_sha256": stage["expected_plaintext_tar_sha256"],
            "source_evidence": {"snapshot_id": "other-snapshot"},
        }
        with patch.object(campaign, "_capture_proof", return_value=(capture, "a" * 64, {})):
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "different snapshot evidence",
            ):
                campaign.validate_existing_wolo_capture(
                    Path("/tmp/bundle"),
                    "ordinary-test",
                    "wolo_settlement_state",
                    stage,
                )

    def test_wolo_offhost_detached_start_does_not_clobber_child_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            state_dir = Path(temporary) / "offhost"
            initial = {
                "schema": 1,
                "kind": "aoe2war-recovery-wolo-offhost-state",
                "campaign_id": "ordinary-test",
                "status": "CREATED",
                "pid": None,
            }

            def create(*args, **kwargs):
                campaign.atomic_write(state_dir / "ordinary-test.json", dict(initial))
                return dict(initial)

            def spawn(_campaign_id):
                child = dict(initial)
                child["status"] = campaign.WOLO_OFFHOST_RUNNING_STATUS
                child["pid"] = 777
                campaign.atomic_write(state_dir / "ordinary-test.json", child)
                return 777

            with (
                patch.object(campaign, "WOLO_OFFHOST_STATE_DIR", state_dir),
                patch.object(campaign, "create_wolo_offhost_state", side_effect=create),
                patch.object(campaign, "spawn_wolo_offhost", side_effect=spawn),
            ):
                result = campaign.start_wolo_offhost(
                    "ordinary-test",
                    authorize_wolo_offhost_capture=True,
                )

        self.assertEqual(result["status"], campaign.WOLO_OFFHOST_RUNNING_STATUS)
        self.assertEqual(result["pid"], 777)
        self.assertEqual(result["spawned_pid"], 777)

    def test_wolo_offhost_run_writes_two_class_verified_summary(self):
        snapshot = wolo_snapshot_fixture()
        stages = campaign.build_wolo_offhost_stages(snapshot)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            state_dir = root / "state"
            bundle = root / "bundle"
            bundle.mkdir()
            cert = root / "recipient.pem"
            cert.write_text("test-cert", encoding="utf-8")
            key = root / "private.pem"
            key.write_text("test-key", encoding="utf-8")
            state = {
                "schema": 1,
                "kind": "aoe2war-recovery-wolo-offhost-state",
                "campaign_id": "ordinary-test",
                "status": "CREATED",
                "tool_source": "a" * 40,
                "bundle_root": str(bundle),
                "recipient_certificate": str(cert),
                "recipient_certificate_fingerprint": "A" * 64,
                "snapshot_id": snapshot["snapshot_id"],
                "snapshot_state_sha256": snapshot["proof_sha256"],
                "remote_stage": snapshot["remote_stage"],
                "classes": list(campaign.WOLO_OFFHOST_CLASSES),
                "stages": stages,
                "completed_classes": [],
                "history": [],
                "current_class": None,
                "pid": None,
                "last_error": None,
                "completion_reason": None,
            }

            def restore(**kwargs):
                class_name = kwargs["class_name"]
                stage = next(item for item in stages if item["class"] == class_name)
                proof_path = bundle / "restore-proofs" / f"{class_name}.json"
                proof = {
                    "schema": 1,
                    "kind": kwargs["proof_kind"],
                    "status": "PASS",
                    "campaign_id": "ordinary-test",
                    "class": class_name,
                    "plaintext_tar_bytes": stage["expected_plaintext_tar_bytes"],
                    "plaintext_tar_sha256": stage["expected_plaintext_tar_sha256"],
                    "completed_at": campaign.utc_now(),
                    "elapsed_seconds": 0.1,
                    "representative_restore": {"status": "PASS"},
                }
                digest = campaign.write_json_with_sidecar(proof_path, proof)
                return {
                    "class": class_name,
                    "proof_path": str(proof_path),
                    "proof_file": str(proof_path.relative_to(bundle)),
                    "proof_sha256": digest,
                    "completed_at": proof["completed_at"],
                    "elapsed_seconds": 0.1,
                    "representative_restore": proof["representative_restore"],
                }

            with (
                patch.object(campaign, "WOLO_OFFHOST_STATE_DIR", state_dir),
                patch.object(campaign, "WOLO_OFFHOST_LOCK_PATH", state_dir / "capture.lock"),
                patch.object(campaign, "source_identity", return_value="a" * 40),
                patch.object(campaign, "_validated_wolo_snapshot", return_value=snapshot),
                patch.object(campaign, "verify_remote_wolo_stage_receipt", return_value=snapshot["remote"]),
                patch.object(
                    campaign,
                    "verify_canonical_private_key",
                    return_value={"path": str(key), "mode": "600", "certificate_match": True},
                ),
                patch.object(campaign, "capture_stage") as capture,
                patch.object(campaign, "restore_stage", side_effect=restore) as restore_mock,
            ):
                campaign.save_wolo_offhost_state(state)
                rc = campaign.run_wolo_offhost("ordinary-test")
                final = campaign.load_wolo_offhost_state("ordinary-test")

            self.assertEqual(rc, 0)
            self.assertEqual(final["status"], "COMPLETE")
            self.assertEqual(final["completion_reason"], campaign.WOLO_OFFHOST_COMPLETE_STATUS)
            self.assertEqual(final["completed_classes"], list(campaign.WOLO_OFFHOST_CLASSES))
            self.assertEqual(capture.call_count, 2)
            self.assertEqual(restore_mock.call_count, 2)
            summary = campaign.recovery.verify_wolo_offhost_summary(
                bundle / "wolo-offhost-summary.json"
            )
            self.assertEqual(summary["status"], "VERIFIED")
            self.assertEqual(summary["blockers"], [])

    def test_wolo_snapshot_lock_contention_refuses_second_transaction(self):
        with tempfile.TemporaryDirectory() as temporary:
            snapshot_dir = Path(temporary) / "states"
            with (
                patch.object(
                    campaign,
                    "WOLO_SNAPSHOT_STATE_DIR",
                    snapshot_dir,
                ),
                patch.object(
                    campaign.fcntl,
                    "flock",
                    side_effect=BlockingIOError,
                ),
                patch.object(
                    campaign,
                    "execute_wolo_snapshot_remote",
                ) as execute,
            ):
                with self.assertRaisesRegex(
                    campaign.CampaignError,
                    "another Wolo Recovery snapshot transaction is active",
                ):
                    campaign.start_wolo_snapshot(
                        "ordinary-test",
                        authorize_wolo_quiesced_snapshot=True,
                    )
        execute.assert_not_called()

    def test_wolo_snapshot_start_requires_explicit_authorization(self):
        with patch.object(
            campaign,
            "execute_wolo_snapshot_remote",
        ) as execute:
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "--authorize-wolo-quiesced-snapshot",
            ):
                campaign.start_wolo_snapshot(
                    "ordinary-test",
                    authorize_wolo_quiesced_snapshot=False,
                )
        execute.assert_not_called()

    def test_wolo_snapshot_start_requires_real_capture_and_restore_closure(self):
        with (
            patch.object(
                campaign,
                "source_identity",
                return_value="a" * 40,
            ),
            patch.object(
                campaign,
                "load_state",
                return_value={
                    "status": "COMPLETE",
                    "completion_reason": "WRONG_REASON",
                },
            ),
            patch.object(
                campaign,
                "execute_wolo_snapshot_remote",
            ) as execute,
        ):
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "completed ordinary capture",
            ):
                campaign.start_wolo_snapshot(
                    "ordinary-test",
                    authorize_wolo_quiesced_snapshot=True,
                )
        execute.assert_not_called()

        with (
            patch.object(
                campaign,
                "source_identity",
                return_value="a" * 40,
            ),
            patch.object(
                campaign,
                "load_state",
                return_value={
                    "status": "COMPLETE",
                    "completion_reason": (
                        "ORDINARY_CAPTURE_COMPLETE_WOLO_AUTHORIZATION_REQUIRED"
                    ),
                },
            ),
            patch.object(
                campaign,
                "restore_status_payload",
                return_value={
                    "status": "COMPLETE",
                    "completion_reason": "WRONG_REASON",
                },
            ),
            patch.object(
                campaign,
                "execute_wolo_snapshot_remote",
            ) as execute,
        ):
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "ORDINARY_RESTORE_VERIFIED",
            ):
                campaign.start_wolo_snapshot(
                    "ordinary-test",
                    authorize_wolo_quiesced_snapshot=True,
                )
        execute.assert_not_called()

    def test_wolo_snapshot_success_seals_pending_receipt_without_promotion(self):
        remote = {
            "schema": 1,
            "kind": "aoe2war-recovery-wolo-staged-snapshot",
            "status": campaign.WOLO_SNAPSHOT_STATUS,
            "snapshot_id": "remote-id",
            "service_restarted": True,
            "wolo_chain_data_mutated": False,
            "settlement_state_mutated": False,
        }
        with tempfile.TemporaryDirectory() as temporary:
            snapshot_dir = Path(temporary) / "states"
            with (
                patch.object(
                    campaign,
                    "WOLO_SNAPSHOT_STATE_DIR",
                    snapshot_dir,
                ),
                patch.object(
                    campaign,
                    "source_identity",
                    return_value="a" * 40,
                ),
                patch.object(
                    campaign,
                    "load_state",
                    return_value={
                        "status": "COMPLETE",
                        "completion_reason": (
                            "ORDINARY_CAPTURE_COMPLETE_WOLO_AUTHORIZATION_REQUIRED"
                        ),
                    },
                ),
                patch.object(
                    campaign,
                    "restore_status_payload",
                    return_value={
                        "status": "COMPLETE",
                        "completion_reason": (
                            "ORDINARY_RESTORE_VERIFIED_WOLO_AUTHORIZATION_REQUIRED"
                        ),
                    },
                ),
                patch.object(
                    campaign,
                    "wolo_snapshot_plan",
                    return_value={
                        "status": "READY",
                        "blockers": [],
                    },
                ),
                patch.object(
                    campaign,
                    "execute_wolo_snapshot_remote",
                    return_value=remote,
                ) as execute,
                patch.object(
                    campaign,
                    "stamp",
                    return_value="20260910T000000Z",
                ),
            ):
                result = campaign.start_wolo_snapshot(
                    "ordinary-test",
                    authorize_wolo_quiesced_snapshot=True,
                )
                status = campaign.wolo_snapshot_status(
                    "ordinary-test"
                )

        execute.assert_called_once()
        self.assertEqual(
            result["status"],
            campaign.WOLO_SNAPSHOT_STATUS,
        )
        self.assertFalse(result["encrypted_capture_complete"])
        self.assertFalse(result["recovery_class_proven"])
        self.assertFalse(result["wolo_chain_data_mutated"])
        self.assertFalse(result["settlement_state_mutated"])
        self.assertEqual(status["status"], campaign.WOLO_SNAPSHOT_STATUS)
        self.assertEqual(len(status["proof_sha256"]), 64)

    def test_wolo_snapshot_remote_failure_seals_uncertain_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            snapshot_dir = Path(temporary) / "states"
            with (
                patch.object(
                    campaign,
                    "WOLO_SNAPSHOT_STATE_DIR",
                    snapshot_dir,
                ),
                patch.object(
                    campaign,
                    "source_identity",
                    return_value="a" * 40,
                ),
                patch.object(
                    campaign,
                    "load_state",
                    return_value={
                        "status": "COMPLETE",
                        "completion_reason": (
                            "ORDINARY_CAPTURE_COMPLETE_WOLO_AUTHORIZATION_REQUIRED"
                        ),
                    },
                ),
                patch.object(
                    campaign,
                    "restore_status_payload",
                    return_value={
                        "status": "COMPLETE",
                        "completion_reason": (
                            "ORDINARY_RESTORE_VERIFIED_WOLO_AUTHORIZATION_REQUIRED"
                        ),
                    },
                ),
                patch.object(
                    campaign,
                    "wolo_snapshot_plan",
                    return_value={
                        "status": "READY",
                        "blockers": [],
                    },
                ),
                patch.object(
                    campaign,
                    "execute_wolo_snapshot_remote",
                    side_effect=campaign.CampaignError("transport lost"),
                ),
                patch.object(
                    campaign,
                    "stamp",
                    return_value="20260910T000000Z",
                ),
            ):
                with self.assertRaisesRegex(
                    campaign.CampaignError,
                    "transport lost",
                ):
                    campaign.start_wolo_snapshot(
                        "ordinary-test",
                        authorize_wolo_quiesced_snapshot=True,
                    )
                status = campaign.wolo_snapshot_status(
                    "ordinary-test"
                )

        self.assertEqual(
            status["status"],
            campaign.WOLO_SNAPSHOT_UNCERTAIN_STATUS,
        )
        self.assertTrue(status["requires_operator_reconciliation"])
        self.assertEqual(status["last_error"], "transport lost")
        self.assertFalse(status["encrypted_capture_complete"])
        self.assertFalse(status["recovery_class_proven"])
        self.assertFalse(status["wolo_chain_data_mutated"])
        self.assertFalse(status["settlement_state_mutated"])
        self.assertEqual(len(status["proof_sha256"]), 64)

    def test_parser_exposes_wolo_snapshot_commands(self):
        plan = campaign.parser().parse_args(
            ["wolo-snapshot-plan", "--json"]
        )
        start = campaign.parser().parse_args(
            [
                "wolo-snapshot-start",
                "ordinary-test",
                "--authorize-wolo-quiesced-snapshot",
                "--json",
            ]
        )
        status = campaign.parser().parse_args(
            [
                "wolo-snapshot-status",
                "ordinary-test",
                "--json",
            ]
        )
        self.assertEqual(plan.command, "wolo-snapshot-plan")
        self.assertEqual(start.command, "wolo-snapshot-start")
        self.assertTrue(start.authorize_wolo_quiesced_snapshot)
        self.assertEqual(status.command, "wolo-snapshot-status")


    def test_parser_exposes_wolo_offhost_commands(self):
        preflight = campaign.parser().parse_args(
            ["wolo-offhost-preflight", "ordinary-test", "--json"]
        )
        start = campaign.parser().parse_args(
            [
                "wolo-offhost-start",
                "ordinary-test",
                "--authorize-wolo-offhost-capture",
                "--json",
            ]
        )
        status = campaign.parser().parse_args(
            ["wolo-offhost-status", "ordinary-test", "--json"]
        )
        resume = campaign.parser().parse_args(
            ["wolo-offhost-resume", "ordinary-test", "--json"]
        )
        self.assertEqual(preflight.command, "wolo-offhost-preflight")
        self.assertEqual(start.command, "wolo-offhost-start")
        self.assertTrue(start.authorize_wolo_offhost_capture)
        self.assertEqual(status.command, "wolo-offhost-status")
        self.assertEqual(resume.command, "wolo-offhost-resume")

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



    @unittest.skipUnless(
        campaign.shutil.which("openssl") and campaign.shutil.which("tar"),
        "OpenSSL and tar are required for chunked restore tests",
    )
    def test_chunked_capture_source_restores_exact_tar_without_full_staging(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = build_chunked_restore_fixture(root)
            capture, proof_sha, source = campaign._capture_proof(
                root,
                fixture["campaign_id"],
                fixture["class_name"],
                verify_ciphertext=True,
            )
            inspection = campaign.inspect_capture_source(
                source,
                class_name=fixture["class_name"],
                recipient_cert=fixture["cert"],
                private_key=fixture["key"],
            )

        self.assertEqual(source["format"], campaign.CMS_CHUNK_FORMAT)
        self.assertEqual(len(source["receipts"]), len(fixture["receipts"]))
        self.assertEqual(len(proof_sha), 64)
        self.assertEqual(inspection["plaintext_tar_bytes"], len(fixture["tar_bytes"]))
        self.assertEqual(
            inspection["plaintext_tar_sha256"],
            hashlib.sha256(fixture["tar_bytes"]).hexdigest(),
        )
        self.assertEqual(inspection["representative_restore"]["status"], "PASS")
        self.assertEqual(capture["plaintext_tar_sha256"], inspection["plaintext_tar_sha256"])

    @unittest.skipUnless(
        campaign.shutil.which("openssl") and campaign.shutil.which("tar"),
        "OpenSSL and tar are required for chunked restore tests",
    )
    def test_chunked_capture_rejects_manifest_sha_drift(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = build_chunked_restore_fixture(root)
            proof = json.loads(fixture["proof_path"].read_text(encoding="utf-8"))
            proof["chunk_manifest_sha256"] = "B" * 64
            campaign.write_json_with_sidecar(fixture["proof_path"], proof)
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "manifest SHA-256 does not match capture proof",
            ):
                campaign._capture_proof(
                    root,
                    fixture["campaign_id"],
                    fixture["class_name"],
                    verify_ciphertext=False,
                )

    @unittest.skipUnless(
        campaign.shutil.which("openssl") and campaign.shutil.which("tar"),
        "OpenSSL and tar are required for chunked restore tests",
    )
    def test_restore_stage_writes_chunked_immutable_proof(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = build_chunked_restore_fixture(root)
            receipt = campaign.restore_stage(
                campaign_id=fixture["campaign_id"],
                bundle_root=root,
                class_name=fixture["class_name"],
                recipient_cert=fixture["cert"],
                private_key=fixture["key"],
                capture_tool_source="capture-source",
                restore_tool_source="restore-source",
            )
            proof_path = Path(receipt["proof_path"])
            proof = json.loads(proof_path.read_text(encoding="utf-8"))

        self.assertEqual(proof["status"], "PASS")
        self.assertEqual(proof["artifact_format"], campaign.CMS_CHUNK_FORMAT)
        self.assertEqual(proof["chunk_count"], len(fixture["receipts"]))
        self.assertEqual(
            proof["chunk_manifest_file"],
            f"{fixture['class_name']}.cms.chunks/manifest.json",
        )
        self.assertTrue(proof["ciphertext_hash_verified_before_decryption"])
        self.assertTrue(proof["plaintext_matches_capture"])
        self.assertFalse(proof["full_plaintext_archive_staged"])
        self.assertFalse(proof["production_mutated"])
        self.assertFalse(proof["wolo_mutated"])
        self.assertEqual(len(receipt["proof_sha256"]), 64)

    @unittest.skipUnless(
        campaign.shutil.which("openssl") and campaign.shutil.which("tar"),
        "OpenSSL and tar are required for chunked restore tests",
    )
    def test_restore_stage_writes_dedicated_wolo_proof_kind(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fixture = build_chunked_restore_fixture(
                root,
                class_name="wolo_settlement_state",
            )
            receipt = campaign.restore_stage(
                campaign_id=fixture["campaign_id"],
                bundle_root=root,
                class_name=fixture["class_name"],
                recipient_cert=fixture["cert"],
                private_key=fixture["key"],
                capture_tool_source="capture-source",
                restore_tool_source="restore-source",
                proof_kind="aoe2war-recovery-wolo-restore-class-proof",
            )
            proof = json.loads(
                Path(receipt["proof_path"]).read_text(encoding="utf-8")
            )

        self.assertEqual(
            proof["kind"],
            "aoe2war-recovery-wolo-restore-class-proof",
        )
        self.assertEqual(proof["class"], "wolo_settlement_state")
        self.assertEqual(proof["status"], "PASS")
        self.assertTrue(proof["plaintext_matches_capture"])
        self.assertFalse(proof["full_plaintext_archive_staged"])
        self.assertFalse(
            proof["secrets_policy"]["private_recovery_key_transmitted_to_vps"]
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
