import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_release_ship.py"
SPEC = importlib.util.spec_from_file_location("aoe2_release_ship", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def sample():
    release = "b" * 40
    previous = "a" * 40
    data = {
        "local": {
            "head": release,
            "dirty_count": 0,
        },
        "github": {
            "main_sha": release,
        },
        "documentation": {
            "implementation_baseline": "c" * 40,
            "baseline_is_ancestor_of_local": True,
        },
        "production": {
            "reachable": True,
            "dirty_count": 0,
            "source_sha": previous,
            "service": "active",
            "active_build_id": "old-build",
            "staged_build_id": None,
            "internal_build_version": "old-version",
            "public_build_version": "old-version",
            "version_parity": True,
            "wolo_8092_count": 1,
            "wolo_8093_count": 1,
        },
    }
    manifest = {
        "release_sha": release,
        "implementation_sha": "c" * 40,
        "documentation_baseline": "c" * 40,
        "previous_production_sha": previous,
        "risk_class": "INFRASTRUCTURE",
        "migration_paths": [],
        "scope_sha256": "scope",
    }
    transport = {
        "origin": MODULE.EXPECTED_ORIGIN,
        "protocol": MODULE.EXPECTED_PROTOCOL,
        "executor": MODULE.EXPECTED_PROD_USER,
        "git_foreign_entries": "0",
        "git_unwritable_dirs": "0",
        "deploy_key_readable": "1",
        "deploy_key_owner": (
            f"{MODULE.EXPECTED_PROD_USER}:{MODULE.EXPECTED_PROD_USER}"
        ),
        "deploy_key_mode": "600",
        "deploy_key_fingerprint": MODULE.EXPECTED_DEPLOY_KEY_FINGERPRINT,
        "sshcmd": (
            f"ssh -F /dev/null -i {MODULE.EXPECTED_DEPLOY_KEY} "
            "-o IdentitiesOnly=yes -o BatchMode=yes "
            "-o StrictHostKeyChecking=yes "
            f"-o UserKnownHostsFile={MODULE.EXPECTED_KNOWN_HOSTS}"
        ),
        "remote_main": release,
    }
    return data, manifest, transport


def activation_sample():
    data, manifest, transport = sample()
    release = manifest["release_sha"]
    data["local"]["head"] = "d" * 40
    data["github"]["main_sha"] = "d" * 40
    data["production"]["source_sha"] = release
    data["production"]["staged_build_id"] = "candidate-build"
    receipt = {
        "release_sha": release,
        "active_build_id": "old-build",
        "staged_build_id": "candidate-build",
        "live_build_version": "old-version",
        "candidate_build_version": "candidate-version",
        "artifact_sha256": "e" * 64,
        "wolo_8092_count": 1,
        "wolo_8093_count": 1,
    }
    transport["remote_main"] = data["github"]["main_sha"]
    return data, receipt, transport


class ShipTests(unittest.TestCase):
    def test_valid_preflight(self):
        data, manifest, transport = sample()
        self.assertEqual(
            MODULE.validation_errors(data, manifest, transport),
            [],
        )

    def test_previous_production_drift_blocks(self):
        data, manifest, transport = sample()
        data["production"]["source_sha"] = "d" * 40
        self.assertIn(
            "production source no longer equals manifest previous production",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_staged_build_blocks(self):
        data, manifest, transport = sample()
        data["production"]["staged_build_id"] = "candidate"
        self.assertIn(
            "a staged .next-release build already exists",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_wolo_missing_blocks(self):
        data, manifest, transport = sample()
        data["production"]["wolo_8093_count"] = 0
        self.assertIn(
            "protected WOLO listener 8093 is missing",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_migrations_block_automated_ship(self):
        data, manifest, transport = sample()
        manifest["migration_paths"] = ["prisma/migrations/x/migration.sql"]
        errors = MODULE.validation_errors(data, manifest, transport)
        self.assertTrue(any("does not support migrations yet" in e for e in errors))

    def test_transport_origin_blocks(self):
        data, manifest, transport = sample()
        transport["origin"] = "git@example.invalid:wrong/repo.git"
        self.assertIn(
            "production Git origin does not match canonical origin",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_foreign_git_ownership_blocks(self):
        data, manifest, transport = sample()
        transport["git_foreign_entries"] = "1"
        self.assertIn(
            "production .git contains entries not owned by the deploy user",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_unwritable_git_directory_blocks(self):
        data, manifest, transport = sample()
        transport["git_unwritable_dirs"] = "1"
        self.assertIn(
            "production .git contains directories not writable by the deploy user",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_unreadable_or_wrong_deploy_key_blocks(self):
        data, manifest, transport = sample()
        transport["deploy_key_readable"] = "0"
        transport["deploy_key_fingerprint"] = "SHA256:wrong"
        errors = MODULE.validation_errors(data, manifest, transport)
        self.assertIn(
            "production dedicated deploy key is not readable by the deploy user",
            errors,
        )
        self.assertIn(
            "production dedicated deploy key fingerprint does not match",
            errors,
        )

    def test_ssh_config_fallback_blocks(self):
        data, manifest, transport = sample()
        transport["sshcmd"] = transport["sshcmd"].replace("-F /dev/null ", "")
        self.assertIn(
            "production core.sshCommand does not disable SSH config fallback",
            MODULE.validation_errors(data, manifest, transport),
        )

    def test_plan_never_allows_wolo_mutation(self):
        data, manifest, _ = sample()
        gate_path = MODULE.ROOT / ".aoe2war-release" / "gates" / "gate.json"
        plan = MODULE.build_plan(
            data,
            manifest,
            "manifest-sha",
            gate_path,
            "gate-sha",
        )
        self.assertFalse(
            plan["protected_services"]["wolo_8092_mutation_allowed"]
        )
        self.assertFalse(
            plan["protected_services"]["wolo_8093_mutation_allowed"]
        )


    def test_activation_valid_preflight_allows_tooling_head_after_candidate(self):
        data, receipt, transport = activation_sample()
        self.assertEqual(MODULE.activation_validation_errors(data, receipt, transport), [])

    def test_activation_source_drift_blocks(self):
        data, receipt, transport = activation_sample()
        data["production"]["source_sha"] = "f" * 40
        self.assertIn(
            "production source does not equal staged release SHA",
            MODULE.activation_validation_errors(data, receipt, transport),
        )

    def test_activation_staged_build_drift_blocks(self):
        data, receipt, transport = activation_sample()
        data["production"]["staged_build_id"] = "wrong-candidate"
        self.assertIn(
            "staged BUILD_ID drifted from stage receipt",
            MODULE.activation_validation_errors(data, receipt, transport),
        )

    def test_activation_tooling_remote_main_must_match_current_github(self):
        data, receipt, transport = activation_sample()
        transport["remote_main"] = "0" * 40
        self.assertIn(
            "production origin main does not equal current GitHub main",
            MODULE.activation_validation_errors(data, receipt, transport),
        )

    def test_activation_wolo_drift_blocks(self):
        data, receipt, transport = activation_sample()
        data["production"]["wolo_8092_count"] = 0
        self.assertIn(
            "protected WOLO listener 8092 drifted from stage receipt",
            MODULE.activation_validation_errors(data, receipt, transport),
        )

    def test_activation_result_requires_exact_candidate_identity(self):
        _, receipt, _ = activation_sample()
        result = {
            "status": "CERTIFIED",
            "release_sha": receipt["release_sha"],
            "source_sha": receipt["release_sha"],
            "previous_build_id": receipt["active_build_id"],
            "active_build_id": receipt["staged_build_id"],
            "candidate_build_version": receipt["candidate_build_version"],
            "artifact_sha256": receipt["artifact_sha256"],
            "wolo8092": "1",
            "wolo8093": "1",
            "receipt_dir": "/mnt/receipt",
            "durable_rollback": "/mnt/rollback",
        }
        self.assertEqual(MODULE.validate_activation_result(result, receipt), [])
        result["artifact_sha256"] = "0" * 64
        self.assertIn(
            "active artifact SHA-256 does not equal staged artifact",
            MODULE.validate_activation_result(result, receipt),
        )


if __name__ == "__main__":
    unittest.main()
