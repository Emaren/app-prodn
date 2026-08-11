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
            "fast_rollback_modules": ".node_modules-rollback-activate-20260810T000000Z",
            "current_node_modules_sha256": "c" * 64,
            "target_node_modules_sha256": "d" * 64,
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


    def test_manual_rollback_swaps_dependency_tree_with_runtime_while_stopped(self):
        script = MODULE.remote_rollback_script(
            self.plan(),
            dry_run=False,
            receipt_dir=(
                "/mnt/HC_Volume_105319120/aoe2war/"
                "deploy-receipts/rollback-test"
            ),
        )

        # Durable forward rescue must preserve the dependency tree too.
        self.assertIn(
            'cp -a node_modules "$RECEIPT/current-node_modules"',
            script,
        )

        # Fast forward rescue and target materialization are paired.
        self.assertIn(
            'FORWARD_FAST_MODULES=".node_modules-rollback-manual-$STAMP"',
            script,
        )
        self.assertIn(
            'TARGET_MODULES_TMP=".node_modules-rollback-target-$STAMP"',
            script,
        )

        stopped = script.index(
            'sudo -n /usr/bin/systemctl stop "$SERVICE"'
        )
        old_runtime = script.index(
            'mv .next "$FORWARD_FAST"',
            stopped,
        )
        old_modules = script.index(
            'mv node_modules "$FORWARD_FAST_MODULES"',
            old_runtime,
        )
        target_modules = script.index(
            'mv "$TARGET_MODULES_TMP" node_modules',
            old_modules,
        )
        target_runtime = script.index(
            'mv "$TARGET_TMP" .next',
            target_modules,
        )
        started = script.index(
            'sudo -n /usr/bin/systemctl start "$SERVICE"',
            target_runtime,
        )

        self.assertLess(stopped, old_runtime)
        self.assertLess(old_runtime, old_modules)
        self.assertLess(old_modules, target_modules)
        self.assertLess(target_modules, target_runtime)
        self.assertLess(target_runtime, started)

        # Failure recovery must restore both halves before restart.
        self.assertIn(
            'mv "$FORWARD_FAST_MODULES" node_modules',
            script,
        )

    def test_manual_rollback_requires_certified_dependency_identity(self):
        script = MODULE.remote_rollback_script(
            self.plan(),
            dry_run=False,
            receipt_dir=(
                "/mnt/HC_Volume_105319120/aoe2war/"
                "deploy-receipts/rollback-test"
            ),
        )

        # Certified dependency identities must enter the remote contract.
        self.assertIn(
            "CURRENT_DEPENDENCY_SHA=",
            script,
        )
        self.assertIn(
            "TARGET_DEPENDENCY_SHA=",
            script,
        )
        self.assertIn(
            "FAST_TARGET_MODULES=",
            script,
        )

        # Hashing must use the same deterministic artifact contract as ship.
        self.assertIn(
            "artifact_hash()",
            script,
        )

        # Before mutation, prove both the currently-active dependency tree
        # and the selected rollback dependency source.
        self.assertIn(
            'test "$(artifact_hash node_modules)" = "$CURRENT_DEPENDENCY_SHA"',
            script,
        )
        self.assertIn(
            'test "$(artifact_hash "$SOURCE_MODULES_PATH")" = "$TARGET_DEPENDENCY_SHA"',
            script,
        )

        # After rollback, prove the dependency tree that became live.
        self.assertIn(
            'test "$(artifact_hash node_modules)" = "$TARGET_DEPENDENCY_SHA"',
            script,
        )

        # Failure recovery must likewise prove restoration of current deps
        # before it may claim RESTORED_CURRENT.
        self.assertIn(
            'rb_dependency="$(artifact_hash node_modules',
            script,
        )
        self.assertIn(
            '[ "$rb_dependency" = "$CURRENT_DEPENDENCY_SHA" ]',
            script,
        )

    def test_manual_rollback_preflights_evidence_and_root_space_before_copy(self):
        script = MODULE.remote_rollback_script(
            self.plan(),
            dry_run=False,
            receipt_dir=(
                "/mnt/HC_Volume_105319120/aoe2war/"
                "deploy-receipts/rollback-test"
            ),
        )

        # Evidence must have room for a durable rescue of the currently
        # certified runtime pair before either rescue copy begins.
        self.assertIn(
            'current_next_kb="$(du -sk .next',
            script,
        )
        self.assertIn(
            'current_dependency_kb="$(du -sk node_modules',
            script,
        )
        self.assertIn(
            'evidence_available_kb="$(df -Pk "$RECEIPT"',
            script,
        )
        self.assertIn(
            'evidence_required_kb=$((current_next_kb + current_dependency_kb + 1048576))',
            script,
        )
        self.assertIn(
            'test "$evidence_available_kb" -ge "$evidence_required_kb"',
            script,
        )

        evidence_preflight = script.index("evidence_available_kb=")
        rescue_next = script.index(
            'cp -a .next "$RECEIPT/current-next"'
        )
        rescue_modules = script.index(
            'cp -a node_modules "$RECEIPT/current-node_modules"'
        )

        self.assertLess(evidence_preflight, rescue_next)
        self.assertLess(evidence_preflight, rescue_modules)

        # Root must have room to materialize the selected rollback target
        # pair before either temporary target copy begins.
        self.assertIn(
            'target_next_kb="$(du -sk "$SOURCE_PATH"',
            script,
        )
        self.assertIn(
            'target_dependency_kb="$(du -sk "$SOURCE_MODULES_PATH"',
            script,
        )
        self.assertIn(
            'root_available_kb="$(df -Pk .',
            script,
        )
        self.assertIn(
            'root_required_kb=$((target_next_kb + target_dependency_kb + 1048576))',
            script,
        )
        self.assertIn(
            'test "$root_available_kb" -ge "$root_required_kb"',
            script,
        )
        self.assertIn(
            '> "$RECEIPT/disk-preflight.txt"',
            script,
        )

        root_preflight = script.index("root_available_kb=")
        target_next = script.index(
            'cp -a "$SOURCE_PATH" "$TARGET_TMP"'
        )
        target_modules = script.index(
            'cp -a "$SOURCE_MODULES_PATH" "$TARGET_MODULES_TMP"'
        )

        self.assertLess(root_preflight, target_next)
        self.assertLess(root_preflight, target_modules)

    def test_dry_run_script_does_not_enter_mutation_block(self):
        script = MODULE.remote_rollback_script(
            self.plan(),
            dry_run=True,
            receipt_dir="/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/rollback-test",
        )
        self.assertIn('if [ "$MODE" = "DRY_RUN" ]; then', script)
        self.assertIn("exit 0", script)

    def test_rollback_result_binds_paired_dependency_provenance(self):
        plan = self.plan()
        script = MODULE.remote_rollback_script(
            plan,
            dry_run=False,
            receipt_dir=(
                "/mnt/HC_Volume_105319120/aoe2war/"
                "deploy-receipts/rollback-test"
            ),
        )

        # Remote certification and stdout must both bind the dependency
        # transition and the paired forward-fast rollback path.
        self.assertIn(
            "from_node_modules_sha256=$CURRENT_DEPENDENCY_SHA",
            script,
        )
        self.assertIn(
            "printf 'from_node_modules_sha256\t%s\n' "
            '"$CURRENT_DEPENDENCY_SHA"',
            script,
        )
        self.assertIn(
            "to_node_modules_sha256=$TARGET_DEPENDENCY_SHA",
            script,
        )
        self.assertIn(
            "printf 'to_node_modules_sha256\t%s\n' "
            '"$TARGET_DEPENDENCY_SHA"',
            script,
        )
        self.assertIn(
            "forward_fast_rollback_modules=$FORWARD_FAST_MODULES",
            script,
        )
        self.assertIn(
            "printf 'forward_fast_rollback_modules\t%s\n' "
            '"$FORWARD_FAST_MODULES"',
            script,
        )

        result = {
            "status": "ROLLED_BACK",
            "from_release_sha": plan["current_release_sha"],
            "to_release_sha": plan["target_release_sha"],
            "from_build_id": plan["current_build_id"],
            "to_build_id": plan["target_build_id"],
            "to_build_version": plan["target_build_version"],
            "from_node_modules_sha256": plan["current_node_modules_sha256"],
            "to_node_modules_sha256": plan["target_node_modules_sha256"],
            "source_kind": "fast",
            "forward_fast_rollback": ".next-rollback-manual-test",
            "forward_fast_rollback_modules": (
                ".node_modules-rollback-manual-test"
            ),
            "wolo8092": "1",
            "wolo8093": "1",
            "receipt_dir": (
                "/mnt/HC_Volume_105319120/aoe2war/"
                "deploy-receipts/rollback-test"
            ),
        }

        self.assertEqual(
            MODULE.validate_remote_result(result, plan),
            [],
        )

        missing_dependency = dict(result)
        missing_dependency.pop("to_node_modules_sha256")
        self.assertTrue(
            MODULE.validate_remote_result(missing_dependency, plan)
        )

        wrong_pair = dict(result)
        wrong_pair["forward_fast_rollback_modules"] = (
            ".node_modules-rollback-manual-wrong"
        )
        self.assertTrue(
            MODULE.validate_remote_result(wrong_pair, plan)
        )

        # The durable local result receipt must preserve the same provenance.
        source = SCRIPT.read_text()
        self.assertIn(
            '"from_node_modules_sha256": result["from_node_modules_sha256"]',
            source,
        )
        self.assertIn(
            '"to_node_modules_sha256": result["to_node_modules_sha256"]',
            source,
        )
        self.assertIn(
            '"forward_fast_rollback_modules": '
            'result["forward_fast_rollback_modules"]',
            source,
        )

    def test_validate_remote_result_requires_exact_target(self):
        plan = self.plan()
        result = {
            "status": "ROLLED_BACK",
            "from_release_sha": plan["current_release_sha"],
            "to_release_sha": plan["target_release_sha"],
            "from_build_id": plan["current_build_id"],
            "to_build_id": plan["target_build_id"],
            "to_build_version": plan["target_build_version"],
            "from_node_modules_sha256": plan["current_node_modules_sha256"],
            "to_node_modules_sha256": plan["target_node_modules_sha256"],
            "source_kind": "fast",
            "forward_fast_rollback": ".next-rollback-manual-test",
            "forward_fast_rollback_modules": ".node_modules-rollback-manual-test",
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
