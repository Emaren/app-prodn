import copy
import importlib.util
import json
import pathlib
import shutil
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "aoe2_storage_retention.py"
SPEC = importlib.util.spec_from_file_location("aoe2_storage_retention", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


GENERATION_NAMES = (
    "activate-20260810T010000Z-aaaaaaaaaaaa",
    "activate-20260810T020000Z-bbbbbbbbbbbb",
    "activate-20260810T030000Z-cccccccccccc",
    "activate-20260810T040000Z-dddddddddddd",
)


def runtime_fixture():
    return {
        "source_sha": "a" * 40,
        "source_dirty_count": 0,
        "active_build_id": "active-build",
        "active_runtime_path": "/var/www/AoE2HDBets/app-prodn/.next",
        "active_cache_path": "/var/www/AoE2HDBets/app-prodn/.next/cache",
        "service": "active",
        "wolo_listener_counts": {"8092": 1, "8093": 1},
    }


def capacity_fixture():
    return {
        "path": "/mnt/HC_Volume_105319120",
        "total_bytes": 100_000,
        "used_bytes": 90_000,
        "free_bytes": 10_000,
        "available_bytes": 10_000,
        "used_percent": 90.0,
    }


def policy_fixture(rollback_root: pathlib.Path):
    return {
        "production_host": "hel1",
        "production_repo": "/var/www/AoE2HDBets/app-prodn",
        "service": "aoe2hdbets-web.service",
        "volume_mount": str(rollback_root.parent),
        "rollback_root": str(rollback_root),
        "receipt_root": str(rollback_root.parent / "receipts"),
        "lock_path": str(rollback_root.parent / "retention.lock"),
        "activation_prefix": "activate-",
        "cache_relative_path": "next/cache",
        "source_cache_relative_path": ".next/cache",
        "protected_newest": 2,
        "wolo_ports": [8092, 8093],
    }


def make_generation(
    rollback_root: pathlib.Path,
    name: str,
    *,
    build_id: str | None = None,
    cache_payload: bytes = b"cache",
) -> pathlib.Path:
    next_dir = rollback_root / name / "next"
    cache = next_dir / "cache"
    cache.mkdir(parents=True)
    if build_id is not None:
        (next_dir / "BUILD_ID").write_text(build_id + "\n", encoding="utf-8")
    (cache / "webpack.bin").write_bytes(cache_payload)
    return cache


class StorageRetentionPlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.temp_root = pathlib.Path(self.temp.name).resolve()
        self.rollback_root = self.temp_root / "rollbacks"
        self.rollback_root.mkdir()

    def build_all_generations(self):
        caches = {}
        for index, name in enumerate(GENERATION_NAMES):
            caches[name] = make_generation(
                self.rollback_root,
                name,
                build_id=f"build-{index}",
                cache_payload=(name.encode("ascii") * (index + 1)),
            )
        return caches

    def plan(self):
        return MODULE.build_plan(
            policy_fixture(self.rollback_root),
            runtime_fixture(),
            capacity_fixture(),
        )

    def test_newest_two_are_always_protected_and_only_older_cache_is_candidate(self):
        caches = self.build_all_generations()

        plan = self.plan()

        by_name = {item["generation"]: item for item in plan["generations"]}
        self.assertEqual(
            by_name[GENERATION_NAMES[3]]["action"],
            "PROTECT_NEWEST",
        )
        self.assertEqual(
            by_name[GENERATION_NAMES[2]]["action"],
            "PROTECT_NEWEST",
        )
        self.assertEqual(
            by_name[GENERATION_NAMES[1]]["action"],
            "DELETE_CACHE",
        )
        self.assertEqual(
            by_name[GENERATION_NAMES[0]]["action"],
            "DELETE_CACHE",
        )
        self.assertEqual(plan["protected_generation_count"], 2)
        self.assertEqual(plan["candidate_count"], 2)
        self.assertTrue(all(path.is_dir() for path in caches.values()))

    def test_old_cache_without_build_id_is_kept_unverified(self):
        self.build_all_generations()
        build_id = self.rollback_root / GENERATION_NAMES[0] / "next" / "BUILD_ID"
        build_id.unlink()

        plan = self.plan()

        oldest = next(
            item
            for item in plan["generations"]
            if item["generation"] == GENERATION_NAMES[0]
        )
        self.assertEqual(oldest["action"], "KEEP_UNVERIFIED")
        self.assertEqual(plan["candidate_count"], 1)

    def test_plan_digest_binds_cache_metadata_and_rejects_stale_plan(self):
        caches = self.build_all_generations()
        first = self.plan()
        expected = first["plan_digest_sha256"]

        with (caches[GENERATION_NAMES[0]] / "webpack.bin").open("ab") as handle:
            handle.write(b"changed-after-plan")
        second = self.plan()

        self.assertNotEqual(second["plan_digest_sha256"], expected)
        with self.assertRaisesRegex(MODULE.RetentionError, "digest changed"):
            MODULE.verify_plan_digest(second, expected)

    def test_digest_ignores_display_time_but_not_bound_target_data(self):
        self.build_all_generations()
        plan = self.plan()
        display_copy = copy.deepcopy(plan)
        display_copy["generated_at"] = "2099-01-01T00:00:00Z"
        display_copy["mode"] = "PREVIEW"
        self.assertEqual(MODULE.plan_digest(display_copy), MODULE.plan_digest(plan))

        bound_copy = copy.deepcopy(plan)
        candidate = next(
            item
            for item in bound_copy["generations"]
            if item["action"] == "DELETE_CACHE"
        )
        candidate["cache"]["allocated_bytes"] += 512
        self.assertNotEqual(MODULE.plan_digest(bound_copy), MODULE.plan_digest(plan))

    def test_generation_set_drift_fails_before_a_planned_target_can_be_used(self):
        self.build_all_generations()
        plan = self.plan()
        target = next(
            item for item in plan["generations"] if item["action"] == "DELETE_CACHE"
        )
        make_generation(
            self.rollback_root,
            "activate-20260810T050000Z-eeeeeeeeeeee",
            build_id="new-build",
        )

        with self.assertRaisesRegex(MODULE.RetentionError, "set/order changed"):
            MODULE.target_still_safe(
                target,
                plan,
                policy_fixture(self.rollback_root),
            )


class StorageRetentionPathSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.temp_root = pathlib.Path(self.temp.name).resolve()
        self.rollback_root = self.temp_root / "rollbacks"
        self.rollback_root.mkdir()
        self.generation = GENERATION_NAMES[0]
        self.cache = make_generation(
            self.rollback_root,
            self.generation,
            build_id="safe-build",
        )

    def test_path_outside_exact_next_cache_target_fails_closed(self):
        outside = self.temp_root / "not-rollbacks" / self.generation / "next" / "cache"
        outside.mkdir(parents=True)

        with self.assertRaisesRegex(MODULE.RetentionError, "escapes the exact"):
            MODULE.validate_cache_target(
                outside,
                self.rollback_root,
                self.generation,
            )

    def test_cache_symlink_fails_closed(self):
        target = self.temp_root / "outside-cache"
        target.mkdir()
        (target / "must-survive").write_text("evidence", encoding="utf-8")
        shutil.rmtree(self.cache)
        self.cache.symlink_to(target, target_is_directory=True)

        with self.assertRaisesRegex(MODULE.RetentionError, "must not be a symlink"):
            MODULE.validate_cache_target(
                self.cache,
                self.rollback_root,
                self.generation,
            )
        self.assertTrue((target / "must-survive").is_file())

    def test_symlink_inside_cache_fails_closed(self):
        target = self.temp_root / "outside-evidence"
        target.write_text("must survive", encoding="utf-8")
        (self.cache / "unsafe-link").symlink_to(target)

        with self.assertRaisesRegex(MODULE.RetentionError, "containing symlinks"):
            MODULE.cache_tree_metadata(
                self.cache,
                self.rollback_root,
                self.generation,
            )
        self.assertEqual(target.read_text(encoding="utf-8"), "must survive")


class StorageRetentionIntegrationContractTests(unittest.TestCase):
    def test_checked_in_contract_has_fail_closed_canonical_policy(self):
        contract = MODULE.load_contract()
        policy = MODULE.policy_from_contract(contract)
        self.assertEqual(policy["rollback_root"], MODULE.CANONICAL_ROLLBACK_ROOT)
        self.assertEqual(policy["receipt_root"], MODULE.CANONICAL_RECEIPT_ROOT)
        self.assertEqual(policy["protected_newest"], 2)
        self.assertEqual(policy["wolo_ports"], [8092, 8093])

    def test_remote_policy_substitution_is_rejected(self):
        policy = MODULE.policy_from_contract(MODULE.load_contract())
        policy["rollback_root"] = "/tmp/rollbacks"
        encoded = MODULE.encode_policy(policy)
        with self.assertRaisesRegex(MODULE.RetentionError, "must be exactly"):
            MODULE.decode_policy(encoded)

    def test_operator_cli_routes_storage_retention_and_documents_preview(self):
        with tempfile.TemporaryDirectory() as temp:
            fake_root = pathlib.Path(temp)
            bin_dir = fake_root / "bin"
            scripts_dir = fake_root / "scripts"
            bin_dir.mkdir()
            scripts_dir.mkdir()
            cli = bin_dir / "aoe2war"
            shutil.copy2(ROOT / "bin" / "aoe2war", cli)
            release = bin_dir / "aoe2war-release"
            release.write_text("#!/usr/bin/env bash\nexit 99\n", encoding="utf-8")
            release.chmod(0o755)
            storage = scripts_dir / "aoe2_storage_retention.py"
            storage.write_text(
                "import json,sys\nprint(json.dumps(sys.argv[1:]))\n",
                encoding="utf-8",
            )

            routed = subprocess.run(
                [str(cli), "storage-retention", "--json"],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            help_result = subprocess.run(
                [str(cli), "--help"],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

        self.assertEqual(routed.returncode, 0, routed.stderr)
        self.assertEqual(json.loads(routed.stdout), ["--json"])
        self.assertEqual(help_result.returncode, 0)
        self.assertIn("storage-retention [--apply] [--json]", help_result.stdout)

    def test_release_gate_treats_retention_files_as_infrastructure(self):
        gate_script = ROOT / "scripts" / "aoe2_release_gate.py"
        spec = importlib.util.spec_from_file_location(
            "aoe2_release_gate_retention", gate_script
        )
        gate = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        spec.loader.exec_module(gate)

        self.assertEqual(
            gate.path_risk("scripts/aoe2_storage_retention.py"),
            "INFRASTRUCTURE",
        )
        self.assertEqual(
            gate.path_risk("tests/test_aoe2_storage_retention.py"),
            "INFRASTRUCTURE",
        )
        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": ["scripts/aoe2_storage_retention.py"],
        }
        commands = gate.command_plan(scope, "INFRASTRUCTURE")
        release_tests = next(
            args
            for label, args, _timeout in commands
            if label == "release-engineering-tests"
        )
        compile_args = next(
            args
            for label, args, _timeout in commands
            if label == "release-python-compile"
        )
        self.assertIn("tests/test_aoe2_storage_retention.py", release_tests)
        self.assertIn("scripts/aoe2_storage_retention.py", compile_args)


if __name__ == "__main__":
    unittest.main()
