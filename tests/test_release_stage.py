import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_release_stage.py"
SPEC = importlib.util.spec_from_file_location("aoe2_release_stage", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def sample():
    release = "b" * 40
    previous = "a" * 40
    data = {
        "production": {
            "active_build_id": "old-build",
            "internal_build_version": "old-version",
            "wolo_8092_count": 1,
            "wolo_8093_count": 1,
        }
    }
    manifest = {
        "release_sha": release,
        "previous_production_sha": previous,
    }
    result = {
        "status": "STAGED",
        "release_sha": release,
        "previous_sha": previous,
        "source_sha": release,
        "active_build_id": "old-build",
        "staged_build_id": "candidate-build",
        "live_build_version": "old-version",
        "candidate_build_version": "candidate-version",
        "artifact_sha256": "a" * 64,
        "service": "active",
        "wolo8092": "1",
        "wolo8093": "1",
        "receipt_dir": "/mnt/receipt",
    }
    return data, manifest, result


class StageTests(unittest.TestCase):
    def test_valid_stage_result(self):
        data, manifest, result = sample()
        self.assertEqual(
            MODULE.validate_stage_result(data, manifest, result),
            [],
        )

    def test_active_runtime_change_blocks_result(self):
        data, manifest, result = sample()
        result["active_build_id"] = "changed"
        self.assertIn(
            "active runtime BUILD_ID changed during staging",
            MODULE.validate_stage_result(data, manifest, result),
        )

    def test_live_version_change_blocks_result(self):
        data, manifest, result = sample()
        result["live_build_version"] = "changed"
        self.assertIn(
            "live build version changed during staging",
            MODULE.validate_stage_result(data, manifest, result),
        )

    def test_wolo_change_blocks_result(self):
        data, manifest, result = sample()
        result["wolo8092"] = "2"
        self.assertIn(
            "WOLO 8092 listener count changed during staging",
            MODULE.validate_stage_result(data, manifest, result),
        )

    def test_artifact_sha_must_be_sha256(self):
        data, manifest, result = sample()
        result["artifact_sha256"] = "not-a-sha"
        self.assertIn(
            "candidate artifact SHA-256 is invalid",
            MODULE.validate_stage_result(data, manifest, result),
        )

    def test_stage_script_builds_beside_live(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        self.assertIn("NEXT_DIST_DIR=.next-release", script)
        self.assertIn("sudo -n -u tony", script)
        self.assertIn("test ! -e .next-release", script)

    def test_stage_script_persists_bound_release_evidence_before_source_advance(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
            manifest_text="manifest-bytes\n",
            gate_text="gate-bytes\n",
        )
        manifest_write = script.index("release-manifest.json")
        gate_write = script.index("gate-receipt.json")
        source_advance = script.index('git reset --hard "$RELEASE"')
        self.assertLess(manifest_write, source_advance)
        self.assertLess(gate_write, source_advance)
        self.assertIn('= "$MANIFEST_SHA"', script)
        self.assertIn('= "$GATE_SHA"', script)

    def test_stage_receipt_uses_narrow_passwordless_install(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        self.assertIn(
            "sudo -n /usr/bin/install -d -o tony -g tony -m 0750",
            script,
        )
        self.assertNotIn("mkdir -p", script)

    def test_stage_recovery_trap_precedes_mutation(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        trap_pos = script.index("trap restore_stage_failure EXIT")
        mutation_pos = script.index("mutation_started=1")
        reset_pos = script.index('git reset --hard "$RELEASE"')
        self.assertLess(trap_pos, mutation_pos)
        self.assertLess(mutation_pos, reset_pos)
        self.assertIn("NOT_REQUIRED", script)
        self.assertIn("RESTORED", script)

    def test_stage_script_never_stops_or_restarts_services(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        self.assertNotIn("systemctl stop", script)
        self.assertNotIn("systemctl start", script)
        self.assertNotIn("systemctl restart", script)

    def test_stage_script_has_automatic_source_restore(self):
        previous = "a" * 40
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha=previous,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        self.assertIn('git reset --hard "$PREVIOUS"', script)
        self.assertIn("rm -rf .next-release", script)
        self.assertIn("trap restore_stage_failure EXIT", script)

    def test_stage_script_only_observes_wolo_ports(self):
        script = MODULE.remote_stage_script(
            release_sha="b" * 40,
            previous_sha="a" * 40,
            manifest_sha="c" * 64,
            gate_sha="d" * 64,
            receipt_dir="/mnt/receipt",
        )
        self.assertIn(":8092", script)
        self.assertIn(":8093", script)
        self.assertNotIn("systemctl restart wolo", script.lower())
        self.assertNotIn("kill", script.lower())


if __name__ == "__main__":
    unittest.main()
