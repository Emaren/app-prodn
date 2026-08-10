import importlib.util
import json
import pathlib
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_release_rollback.py"
SPEC = importlib.util.spec_from_file_location("aoe2_release_rollback", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ReleaseRollbackTests(unittest.TestCase):
    def plan(self):
        return {
            "current_release_sha": "b" * 40,
            "current_build_id": "build-current",
            "current_build_version": "version-current",
            "target_release_sha": "a" * 40,
            "target_build_id": "build-target",
            "target_build_version": "version-target",
            "fast_rollback": ".next-rollback-activate-20260810T000000Z",
            "durable_rollback": "/mnt/HC_Volume_105319120/aoe2war/rollbacks/activate-test",
            "wolo_8092_count": 1,
            "wolo_8093_count": 1,
        }

    def test_remote_script_is_fail_closed_and_preserves_current_runtime(self):
        script = MODULE.remote_rollback_script(
            self.plan(),
            dry_run=False,
            receipt_dir="/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/rollback-test",
        )
        self.assertIn('cp -a .next "$RECEIPT/current-next"', script)
        self.assertIn('git reset --hard "$TARGET"', script)
        self.assertIn('rollback_failure()', script)
        self.assertIn('git reset --hard "$CURRENT"', script)
        self.assertIn('test "$after_wolo8092" = "$EXPECTED_WOLO8092"', script)
        self.assertIn('critical_get "$PUBLIC/api/deployment-version"', script)

    def test_dry_run_script_does_not_enter_mutation_block(self):
        script = MODULE.remote_rollback_script(
            self.plan(),
            dry_run=True,
            receipt_dir="/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/rollback-test",
        )
        self.assertIn('if [ "$MODE" = "DRY_RUN" ]; then', script)
        self.assertIn("exit 0", script)

    def test_validate_remote_result_requires_exact_target(self):
        plan = self.plan()
        result = {
            "status": "ROLLED_BACK",
            "from_release_sha": plan["current_release_sha"],
            "to_release_sha": plan["target_release_sha"],
            "from_build_id": plan["current_build_id"],
            "to_build_id": plan["target_build_id"],
            "to_build_version": plan["target_build_version"],
            "source_kind": "fast",
            "forward_fast_rollback": ".next-rollback-manual-test",
            "wolo8092": "1",
            "wolo8093": "1",
            "receipt_dir": "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/rollback-test",
        }
        self.assertEqual(MODULE.validate_remote_result(result, plan), [])
        result["to_build_id"] = "wrong"
        self.assertTrue(MODULE.validate_remote_result(result, plan))

    def test_find_target_certification_matches_exact_identity(self):
        original = MODULE.ACTIVATION_RECEIPT_DIR
        state = MODULE.ROOT / ".aoe2war-release"
        state.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=state) as temp:
            receipt_dir = pathlib.Path(temp)
            MODULE.ACTIVATION_RECEIPT_DIR = receipt_dir
            try:
                evidence = {}
                for name in ("stage", "manifest", "gate"):
                    path = receipt_dir / f"{name}.json"
                    path.write_text(json.dumps({"kind": name}), encoding="utf-8")
                    evidence[f"{name}_receipt_path" if name == "stage" else f"{name}_path"] = str(path.relative_to(MODULE.ROOT))
                    evidence[f"{name}_receipt_sha256" if name == "stage" else f"{name}_sha256"] = MODULE.sha256_file(path)
                payload = {
                    "schema": 1,
                    "kind": "aoe2war-activation-result",
                    "status": "CERTIFIED",
                    "wolo_mutated": False,
                    "release_sha": "a" * 40,
                    "active_build_id": "build-target",
                    "candidate_build_version": "version-target",
                    **evidence,
                }
                path = MODULE.ACTIVATION_RECEIPT_DIR / "target.json"
                path.write_text(json.dumps(payload), encoding="utf-8")
                found = MODULE.find_target_certification(
                    "a" * 40, "build-target", "version-target"
                )
                self.assertIsNotNone(found)
                missing = MODULE.find_target_certification(
                    "a" * 40, "wrong", "version-target"
                )
                self.assertIsNone(missing)
            finally:
                MODULE.ACTIVATION_RECEIPT_DIR = original

    def test_local_receipt_has_real_newline(self):
        original = MODULE.ROLLBACK_RECEIPT_DIR
        with tempfile.TemporaryDirectory() as temp:
            MODULE.ROLLBACK_RECEIPT_DIR = pathlib.Path(temp)
            try:
                payload = {
                    "from_release_sha": "b" * 40,
                    "to_release_sha": "a" * 40,
                }
                path = MODULE.write_local_receipt(payload)
                raw = path.read_bytes()
            finally:
                MODULE.ROLLBACK_RECEIPT_DIR = original
        self.assertTrue(raw.endswith(b"\n"))
        self.assertFalse(raw.endswith(b"\\n"))


if __name__ == "__main__":
    unittest.main()
