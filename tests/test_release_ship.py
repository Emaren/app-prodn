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
        "sshcmd": (
            "ssh -i /root/.ssh/github_app_prodn_write_ed25519 "
            "-o IdentitiesOnly=yes -o BatchMode=yes"
        ),
        "remote_main": release,
    }
    return data, manifest, transport


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


if __name__ == "__main__":
    unittest.main()
