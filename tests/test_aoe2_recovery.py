import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import scripts.aoe2_recovery as recovery


class RecoveryTests(unittest.TestCase):
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
