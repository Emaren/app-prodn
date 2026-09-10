import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import scripts.aoe2_recovery as recovery


class RecoveryTests(unittest.TestCase):
    def test_campaign_start_flags_are_forwarded_verbatim(self):
        completed = type("Completed", (), {"returncode": 0})()
        with patch.object(recovery.subprocess, "run", return_value=completed) as run:
            rc = recovery.forward_campaign_cli(
                [
                    "campaign",
                    "start",
                    "--authorize-ordinary-capture",
                    "--json",
                ]
            )

        self.assertEqual(rc, 0)
        command = run.call_args.args[0]
        self.assertEqual(command[0], recovery.sys.executable)
        self.assertEqual(
            command[1],
            str(recovery.ROOT / "scripts" / "aoe2_recovery_campaign.py"),
        )
        self.assertEqual(
            command[2:],
            ["start", "--authorize-ordinary-capture", "--json"],
        )

    def test_campaign_wolo_preflight_is_forwarded_verbatim(self):
        completed = type("Completed", (), {"returncode": 0})()
        with patch.object(recovery.subprocess, "run", return_value=completed) as run:
            rc = recovery.forward_campaign_cli(
                ["campaign", "wolo-preflight", "--json"]
            )

        self.assertEqual(rc, 0)
        self.assertEqual(
            run.call_args.args[0][2:],
            ["wolo-preflight", "--json"],
        )

    def test_campaign_wolo_snapshot_start_is_forwarded_verbatim(self):
        completed = type("Completed", (), {"returncode": 0})()
        with patch.object(
            recovery.subprocess,
            "run",
            return_value=completed,
        ) as run:
            rc = recovery.forward_campaign_cli(
                [
                    "campaign",
                    "wolo-snapshot-start",
                    "ordinary-test",
                    "--authorize-wolo-quiesced-snapshot",
                    "--json",
                ]
            )

        self.assertEqual(rc, 0)
        self.assertEqual(
            run.call_args.args[0][2:],
            [
                "wolo-snapshot-start",
                "ordinary-test",
                "--authorize-wolo-quiesced-snapshot",
                "--json",
            ],
        )

    def test_campaign_plan_is_not_intercepted_by_forwarder(self):
        self.assertIsNone(
            recovery.forward_campaign_cli(["campaign", "plan", "--json"])
        )

    def test_current_contract_shape_is_evaluable(self):
        payload = recovery.evaluate()
        self.assertIn(payload["status"], {"VERIFIED", "NOT_VERIFIED"})
        self.assertIn("blockers", payload)
        self.assertIn("operator_free_gib", payload)
        self.assertEqual(payload["schema"], 2)

    def _write_json_with_sidecar(self, target: Path, payload: dict) -> str:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        target.with_name(target.name + ".sha256").write_text(
            f"{digest}  {target.name}\n"
        )
        return digest

    def _full_proof(self, bundle: Path, authority: str) -> Path:
        coverage: dict[str, dict[str, str]] = {}
        for class_name in recovery.REQUIRED_RECOVERY_CLASSES:
            evidence = bundle / "proofs" / f"{class_name}.json"
            self._write_json_with_sidecar(
                evidence,
                {"class": class_name, "status": "PASS"},
            )
            coverage[class_name] = {
                "status": "PASS",
                "proof_file": str(evidence.relative_to(bundle)),
                "proof_sha256": hashlib.sha256(evidence.read_bytes()).hexdigest(),
            }

        drill = bundle / "proofs" / "restore-drill.json"
        self._write_json_with_sidecar(drill, {"status": "PASS"})
        proof = bundle / "restore-proof.json"
        self._write_json_with_sidecar(
            proof,
            {
                "schema": recovery.FULL_PROOF_SCHEMA,
                "kind": recovery.FULL_PROOF_KIND,
                "status": recovery.FULL_PROOF_STATUS,
                "authority": authority,
                "bundle_id": bundle.name,
                "created_at": "2026-09-06T00:00:00+00:00",
                "coverage": coverage,
                "restore_drill": {
                    "status": "PASS",
                    "proof_file": str(drill.relative_to(bundle)),
                    "proof_sha256": hashlib.sha256(drill.read_bytes()).hexdigest(),
                },
                "remaining_before_full_recovery_verification": [],
                "secrets_policy": {
                    key: False
                    for key in recovery.REQUIRED_FALSE_SECRET_FLAGS
                },
            },
        )
        return proof

    def _ordinary_restore_summary(self, bundle: Path) -> Path:
        coverage: dict[str, dict[str, str]] = {}
        for class_name in recovery.ORDINARY_RECOVERY_CLASSES:
            evidence = bundle / "restore-proofs" / f"{class_name}.json"
            self._write_json_with_sidecar(
                evidence,
                {"class": class_name, "status": "PASS"},
            )
            coverage[class_name] = {
                "status": "PASS",
                "proof_file": str(evidence.relative_to(bundle)),
                "proof_sha256": hashlib.sha256(evidence.read_bytes()).hexdigest(),
            }

        summary = bundle / "ordinary-restore-summary.json"
        self._write_json_with_sidecar(
            summary,
            {
                "schema": recovery.ORDINARY_RESTORE_SUMMARY_SCHEMA,
                "kind": recovery.ORDINARY_RESTORE_SUMMARY_KIND,
                "status": recovery.ORDINARY_RESTORE_SUMMARY_STATUS,
                "campaign_id": bundle.name,
                "created_at": "2026-09-09T23:08:40+00:00",
                "coverage": coverage,
                "representative_restores": len(recovery.ORDINARY_RECOVERY_CLASSES),
                "production_mutated": False,
                "wolo_mutated": False,
                "full_plaintext_archive_staged": False,
                "remaining_before_full_recovery_verification": [
                    "wolo_settlement_state",
                    "wolo_consensus_recovery",
                    "wolo_key_custody",
                    "full_schema2_restore_proof",
                ],
                "secrets_policy": {
                    key: False
                    for key in recovery.REQUIRED_FALSE_SECRET_FLAGS
                },
            },
        )
        return summary

    def test_hashed_ordinary_restore_summary_verifies_five_classes(self):
        with tempfile.TemporaryDirectory() as temporary:
            bundle = Path(temporary) / "ordinary"
            summary = self._ordinary_restore_summary(bundle)
            result = recovery.verify_ordinary_restore_summary(summary)

        self.assertEqual(result["status"], "VERIFIED")
        self.assertEqual(result["blockers"], [])
        self.assertEqual(len(result["proof_sha256"]), 64)

    def test_tampered_ordinary_restore_class_fails_partial_verification(self):
        with tempfile.TemporaryDirectory() as temporary:
            bundle = Path(temporary) / "ordinary"
            summary = self._ordinary_restore_summary(bundle)
            target = bundle / "restore-proofs" / "raw_replay_archive.json"
            target.write_text('{\"status\":\"TAMPERED\"}\n', encoding="utf-8")
            result = recovery.verify_ordinary_restore_summary(summary)

        self.assertEqual(result["status"], "NOT_VERIFIED")
        self.assertTrue(
            any(
                "raw_replay_archive proof_file SHA-256 mismatch" in item
                for item in result["blockers"]
            )
        )

    def test_partial_progress_reduces_remaining_scope_to_wolo_classes(self):
        pilot = {"status": "PILOT_VERIFIED"}
        ordinary = {
            "status": recovery.ORDINARY_RESTORE_SUMMARY_STATUS,
            "verification_status": "VERIFIED",
        }
        progress = recovery.recovery_progress(pilot, ordinary)

        self.assertEqual(progress["status"], "PARTIAL_VERIFIED")
        self.assertEqual(progress["proven_count"], 7)
        self.assertEqual(
            progress["remaining_classes"],
            [
                "wolo_settlement_state",
                "wolo_consensus_recovery",
                "wolo_key_custody",
            ],
        )
        self.assertTrue(progress["final_schema2_proof_required"])

    def test_campaign_plan_is_read_only_and_capacity_aware(self):
        inventory = {
            "classes": {
                "raw_replay_archive": {"bytes": 21_000},
                "parser_evidence_corpus": {"bytes": 8_000},
                "managed_user_media": {"bytes": 500},
                "radio_wolo_private_media": {"bytes": 1_700},
                "legacy_direct_message_attachments": {"bytes": 90},
                "wolo_settlement_state": {"bytes": 3},
                "wolo_founder_rewards_settlement_state": {"bytes": 1},
            },
            "parser_top_level": {
                "cold-archives": {"bytes": 5_000},
                "jobs": {"bytes": 2_600},
                "reports": {"bytes": 240},
                "evidence": {"bytes": 220},
                "golden-fixtures": {"bytes": 20},
                "promotions": {"bytes": 1},
                "tmp": {"bytes": 2},
            },
            "wolo": {
                "active": "active",
                "home": "/var/lib/wolochaind-mainnet",
                "home_identity": {"bytes": 6_100},
                "key_custody_metadata": [
                    {
                        "path": "/var/lib/wolochaind-mainnet/config/priv_validator_key.json",
                        "exists": True,
                        "bytes": 345,
                        "mode": "600",
                        "owner": "root:root",
                    }
                ],
            },
            "listeners": ["8092", "8093"],
        }
        pilot = {"proof_path": "/tmp/pilot/restore-proof.json"}

        with patch.object(recovery, "_bundle_file_bytes", return_value=400):
            plan = recovery.build_campaign_plan(
                inventory,
                pilot,
                operator_free_bytes=40_000,
            )

        self.assertEqual(plan["write_actions"], "NONE")
        self.assertTrue(plan["capacity_ready"])
        parser = next(
            item
            for item in plan["stages"]
            if item["class"] == "parser_evidence_corpus"
        )
        self.assertIn("cold-archives", parser["include_top_level"])
        self.assertIn("jobs", parser["include_top_level"])
        self.assertEqual(parser["exclude_top_level"], ["tmp"])
        self.assertEqual(parser["estimated_bytes"], 8_081)

        consensus = next(
            item
            for item in plan["stages"]
            if item["class"] == "wolo_consensus_recovery"
        )
        self.assertEqual(consensus["state"], "AUTHORIZATION_REQUIRED")
        self.assertEqual(
            consensus["payload_whitelist"],
            ["data/", "config/"],
        )
        self.assertIn(
            "config/priv_validator_key.json",
            consensus["secret_exclusions"],
        )
        self.assertIn(
            "keyring-test/",
            consensus["secret_exclusions"],
        )
        self.assertIn(
            ".wolochain/",
            consensus["secret_exclusions"],
        )

        custody = next(
            item
            for item in plan["stages"]
            if item["class"] == "wolo_key_custody"
        )
        self.assertFalse(custody["general_vault_payload"])
        self.assertEqual(
            custody["strategy"],
            "SEPARATE_SECRET_CUSTODY_ATTESTATION",
        )

    def test_campaign_plan_reuses_verified_ordinary_restore(self):
        inventory = {
            "classes": {
                "raw_replay_archive": {"bytes": 21_000},
                "parser_evidence_corpus": {"bytes": 8_000},
                "managed_user_media": {"bytes": 500},
                "radio_wolo_private_media": {"bytes": 1_700},
                "legacy_direct_message_attachments": {"bytes": 90},
                "wolo_settlement_state": {"bytes": 3},
                "wolo_founder_rewards_settlement_state": {"bytes": 1},
            },
            "parser_top_level": {
                "evidence": {"bytes": 8_000},
            },
            "wolo": {
                "home": "/var/lib/wolochaind-mainnet",
                "home_identity": {"bytes": 6_100},
                "key_custody_metadata": [],
            },
            "listeners": ["8092", "8093"],
        }
        ordinary = {
            "status": recovery.ORDINARY_RESTORE_SUMMARY_STATUS,
            "verification_status": "VERIFIED",
        }

        with patch.object(recovery, "_bundle_file_bytes", return_value=400):
            plan = recovery.build_campaign_plan(
                inventory,
                {"proof_path": "/tmp/pilot/restore-proof.json"},
                operator_free_bytes=40_000,
                ordinary_restore=ordinary,
            )

        ordinary_stages = {
            stage["class"]: stage
            for stage in plan["stages"]
            if stage["class"] in recovery.ORDINARY_RECOVERY_CLASSES
        }
        self.assertEqual(set(ordinary_stages), set(recovery.ORDINARY_RECOVERY_CLASSES))
        for stage in ordinary_stages.values():
            self.assertEqual(stage["state"], "PROVEN")
            self.assertEqual(
                stage["strategy"],
                "REUSE_VERIFIED_ORDINARY_RESTORE",
            )
            self.assertEqual(stage["estimated_bytes"], 0)

        self.assertEqual(plan["new_payload_bytes"], 6_104)
        restore = next(
            stage
            for stage in plan["stages"]
            if stage["class"] == "restore_drill"
        )
        self.assertEqual(restore["state"], "WAITING_FOR_WOLO_COVERAGE")

    def test_campaign_plan_requires_streaming_when_final_headroom_is_small(self):
        inventory = {
            "classes": {
                "raw_replay_archive": {"bytes": 20_000},
                "parser_evidence_corpus": {"bytes": 0},
                "managed_user_media": {"bytes": 0},
                "radio_wolo_private_media": {"bytes": 0},
                "legacy_direct_message_attachments": {"bytes": 0},
                "wolo_settlement_state": {"bytes": 0},
                "wolo_founder_rewards_settlement_state": {"bytes": 0},
            },
            "parser_top_level": {},
            "wolo": {
                "home": "/var/lib/wolochaind-mainnet",
                "home_identity": {"bytes": 5_000},
                "key_custody_metadata": [],
            },
            "listeners": ["8092", "8093"],
        }
        with patch.object(recovery, "_bundle_file_bytes", return_value=0):
            plan = recovery.build_campaign_plan(
                inventory,
                None,
                operator_free_bytes=30_000,
            )
        self.assertTrue(plan["capacity_ready"])
        self.assertTrue(plan["streaming_restore_required"])

    def test_config_strings_cannot_promote_pilot_to_verified(self):
        with tempfile.TemporaryDirectory() as temporary:
            vault = Path(temporary) / "vault"
            bundle = vault / "pilot"
            proof = bundle / "restore-proof.json"
            self._write_json_with_sidecar(
                proof,
                {
                    "schema": 1,
                    "kind": "aoe2war-recovery-pilot-proof",
                    "status": "PILOT_VERIFIED",
                    "authority": "Mac encrypted survival vault",
                },
            )
            evidence = {
                "enabled": True,
                "authority": "Mac encrypted survival vault",
                "restore_proof": str(proof),
            }
            with patch.object(recovery, "RECOVERY_VAULT_ROOT", vault):
                result = recovery.verify_configured_recovery(evidence)
            self.assertEqual(result["status"], "NOT_VERIFIED")
            self.assertTrue(
                any("schema must be" in item for item in result["blockers"])
            )
            self.assertTrue(
                any("status must be" in item for item in result["blockers"])
            )

    def test_schema2_hashed_coverage_and_restore_drill_can_verify(self):
        with tempfile.TemporaryDirectory() as temporary:
            vault = Path(temporary) / "vault"
            bundle = vault / "full"
            authority = "Mac encrypted survival vault"
            proof = self._full_proof(bundle, authority)
            evidence = {
                "enabled": True,
                "authority": authority,
                "restore_proof": str(proof),
            }
            with patch.object(recovery, "RECOVERY_VAULT_ROOT", vault):
                result = recovery.verify_configured_recovery(evidence)
            self.assertEqual(result["status"], "VERIFIED")
            self.assertEqual(result["blockers"], [])

    def test_tampered_coverage_file_fails_verification(self):
        with tempfile.TemporaryDirectory() as temporary:
            vault = Path(temporary) / "vault"
            bundle = vault / "full"
            authority = "Mac encrypted survival vault"
            proof = self._full_proof(bundle, authority)
            tampered = bundle / "proofs" / "raw_replay_archive.json"
            tampered.write_text('{"status":"TAMPERED"}\n')
            evidence = {
                "enabled": True,
                "authority": authority,
                "restore_proof": str(proof),
            }
            with patch.object(recovery, "RECOVERY_VAULT_ROOT", vault):
                result = recovery.verify_configured_recovery(evidence)
            self.assertEqual(result["status"], "NOT_VERIFIED")
            self.assertTrue(
                any(
                    "raw_replay_archive proof_file SHA-256 mismatch" in item
                    for item in result["blockers"]
                )
            )


if __name__ == "__main__":
    unittest.main()
