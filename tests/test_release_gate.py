import importlib.util
import json
import pathlib
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_release_gate.py"
SPEC = importlib.util.spec_from_file_location("aoe2_release_gate", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ReleaseGateTests(unittest.TestCase):
    def test_documentation_risk(self):
        self.assertEqual(
            MODULE.classify_risk(["docs/RELEASE_ENGINEERING.md"]),
            "DOCUMENTATION",
        )

    def test_database_risk_wins(self):
        self.assertEqual(
            MODULE.classify_risk(
                ["app/AppShell.tsx", "prisma/migrations/20260809_x/migration.sql"]
            ),
            "DATABASE",
        )

    def test_financial_risk(self):
        self.assertEqual(
            MODULE.classify_risk(["lib/bets.ts"]),
            "FINANCIAL",
        )

    def test_betting_domain_paths_are_financial_risk(self):
        for item in (
            "lib/betMarketWagerability.ts",
            "lib/betStakeTickets.ts",
            "lib/betWagering.ts",
            "lib/desyncSideMarket.ts",
            "tests/bet-market-wagerability.test.mts",
            "tests/desync-side-market-wagering.test.mts",
        ):
            with self.subTest(item=item):
                self.assertEqual(
                    MODULE.path_risk(item),
                    "FINANCIAL",
                )

    def test_replay_truth_risk(self):
        self.assertEqual(
            MODULE.classify_risk(["lib/unresolvedWatcherResult.ts"]),
            "REPLAY_TRUTH",
        )

    def test_watcher_risk(self):
        self.assertEqual(
            MODULE.classify_risk(["lib/watcherSession.ts"]),
            "WATCHER",
        )

    def test_infrastructure_risk(self):
        self.assertEqual(
            MODULE.classify_risk(["scripts/aoe2_release_gate.py"]),
            "INFRASTRUCTURE",
        )
        self.assertEqual(
            MODULE.classify_risk(["scripts/aoe2_release_prebuild_validation.mjs"]),
            "INFRASTRUCTURE",
        )

    def test_presentation_risk(self):
        self.assertEqual(
            MODULE.classify_risk(["app/AppShell.tsx"]),
            "PRESENTATION",
        )

    def test_application_default(self):
        self.assertEqual(
            MODULE.classify_risk(["app/api/forum/route.ts"]),
            "APPLICATION",
        )

    def test_no_change(self):
        self.assertEqual(MODULE.classify_risk([]), "NO_CHANGE")

    def test_focused_tests_are_deduplicated(self):
        scripts = MODULE.focused_npm_tests(
            ["lib/replay.ts", "tests/hd-replay-truth.test.mts"]
        )
        self.assertEqual(scripts.count("test:replay-truth"), 1)

    def test_typescript_validation_expands_to_non_lintable_contract_changes(self):
        for changed in (
            ["tsconfig.json"],
            ["prisma/schema.prisma"],
            ["package.json"],
            ["yarn.lock"],
        ):
            with self.subTest(changed=changed):
                scope = {
                    "mode": "committed",
                    "base_sha": "a" * 40,
                    "target_sha": "b" * 40,
                    "changed_files": changed,
                }
                labels = [label for label, _args, _timeout in MODULE.command_plan(scope, MODULE.classify_risk(changed))]
                self.assertIn("prisma-generate", labels)
                self.assertIn("typescript", labels)

    def test_lint_configuration_changes_run_full_lint(self):
        for changed in (["tsconfig.json"], ["package.json"], ["yarn.lock"], [".eslintrc.json"]):
            with self.subTest(changed=changed):
                scope = {
                    "mode": "committed",
                    "base_sha": "a" * 40,
                    "target_sha": "b" * 40,
                    "changed_files": changed,
                }
                labels = [label for label, _args, _timeout in MODULE.command_plan(scope, MODULE.classify_risk(changed))]
                self.assertIn("eslint-full", labels)
                self.assertNotIn("eslint-changed", labels)

    def test_changed_typescript_keeps_incremental_eslint_and_full_typecheck(self):
        scope = {
            "mode": "committed",
            "base_sha": "a" * 40,
            "target_sha": "b" * 40,
            "changed_files": ["app/api/forum/route.ts"],
        }
        labels = [label for label, _args, _timeout in MODULE.command_plan(scope, "APPLICATION")]
        self.assertIn("typescript", labels)
        self.assertIn("eslint-changed", labels)
        self.assertNotIn("eslint-full", labels)


    def test_storage_os_is_infrastructure_risk(self):
        self.assertEqual(
            MODULE.path_risk("scripts/aoe2_storage.py"),
            "INFRASTRUCTURE",
        )

        self.assertEqual(
            MODULE.path_risk(
                "scripts/aoe2_rollback_archive_one.sh"
            ),
            "INFRASTRUCTURE",
        )

        self.assertEqual(
            MODULE.path_risk("tests/test_aoe2_storage.py"),
            "INFRASTRUCTURE",
        )

    def test_storage_os_triggers_storage_unit_contract(self):
        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": ["scripts/aoe2_storage.py"],
        }

        plan = MODULE.command_plan(
            scope,
            "INFRASTRUCTURE",
        )

        release_tests = [
            args
            for label, args, _timeout in plan
            if label == "active-python-test-contract"
        ]

        self.assertEqual(
            len(release_tests),
            1,
        )

        self.assertEqual(release_tests[0], ["python3", "scripts/run_test_contract.py", "--python"])

        compile_steps = [
            args
            for label, args, _timeout in plan
            if label == "release-python-compile"
        ]

        self.assertEqual(
            len(compile_steps),
            1,
        )

        self.assertIn(
            "scripts/aoe2_storage.py",
            compile_steps[0],
        )


    def test_documentation_os_is_infrastructure_risk(self):
        self.assertEqual(
            MODULE.path_risk("scripts/aoe2_docs.py"),
            "INFRASTRUCTURE",
        )
        self.assertEqual(
            MODULE.path_risk("tests/test_aoe2_docs.py"),
            "INFRASTRUCTURE",
        )

    def test_documentation_os_triggers_release_contract(self):
        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": ["scripts/aoe2_docs.py"],
        }
        plan = MODULE.command_plan(scope, "INFRASTRUCTURE")
        release_tests = [
            args
            for label, args, _timeout in plan
            if label == "active-python-test-contract"
        ]
        compile_steps = [
            args
            for label, args, _timeout in plan
            if label == "release-python-compile"
        ]
        self.assertEqual(len(release_tests), 1)
        self.assertEqual(len(compile_steps), 1)
        self.assertEqual(release_tests[0], ["python3", "scripts/run_test_contract.py", "--python"])
        self.assertIn("scripts/aoe2_docs.py", compile_steps[0])

    def test_release_prebuild_helper_triggers_full_release_suite(self):
        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": ["scripts/aoe2_release_prebuild_validation.mjs"],
        }
        plan = MODULE.command_plan(scope, "INFRASTRUCTURE")
        labels = [label for label, _args, _timeout in plan]
        self.assertIn("active-python-test-contract", labels)

    def test_operator_cli_is_infrastructure_risk(self):
        self.assertEqual(MODULE.path_risk("bin/aoe2war"), "INFRASTRUCTURE")

    def test_operator_cli_triggers_full_release_suite(self):
        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": ["bin/aoe2war"],
        }
        plan = MODULE.command_plan(scope, "INFRASTRUCTURE")
        release_tests = [args for label, args, _timeout in plan if label == "active-python-test-contract"]
        self.assertEqual(len(release_tests), 1)
        self.assertEqual(release_tests[0], ["python3", "scripts/run_test_contract.py", "--python"])

    def test_rollback_tooling_is_infrastructure_and_compiled(self):
        self.assertEqual(
            MODULE.path_risk("scripts/aoe2_release_rollback.py"),
            "INFRASTRUCTURE",
        )
        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": ["scripts/aoe2_release_rollback.py"],
        }
        plan = MODULE.command_plan(scope, "INFRASTRUCTURE")
        compile_commands = [
            args for label, args, _timeout in plan
            if label == "release-python-compile"
        ]
        self.assertEqual(len(compile_commands), 1)
        self.assertIn("scripts/aoe2_release_rollback.py", compile_commands[0])


    def test_rollback_tooling_triggers_full_release_suite(self):
        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": ["scripts/aoe2_release_rollback.py"],
        }
        plan = MODULE.command_plan(scope, "INFRASTRUCTURE")
        release_tests = [
            args for label, args, _timeout in plan
            if label == "active-python-test-contract"
        ]
        self.assertEqual(len(release_tests), 1)
        self.assertEqual(release_tests[0], ["python3", "scripts/run_test_contract.py", "--python"])

    def test_finish_and_doctor_are_infrastructure_tooling(self):
        self.assertEqual(
            MODULE.path_risk("scripts/aoe2_finish.py"),
            "INFRASTRUCTURE",
        )
        self.assertEqual(
            MODULE.path_risk("scripts/aoe2_doctor.py"),
            "INFRASTRUCTURE",
        )
        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": ["scripts/aoe2_finish.py"],
        }
        plan = MODULE.command_plan(scope, "INFRASTRUCTURE")
        release_tests = [
            args
            for label, args, _timeout in plan
            if label == "active-python-test-contract"
        ]
        self.assertEqual(len(release_tests), 1)
        self.assertEqual(release_tests[0], ["python3", "scripts/run_test_contract.py", "--python"])


    def test_validation_context_matching_can_ignore_tree_for_docs_descendant(self):
        context = {
            "tree_digest": "new-tree",
            "implementation_digest": "impl",
            "dependency_digest": "deps",
            "test_contract_digest": "tests",
            "toolchain_digest": "tools",
            "validator_digest": "validator",
        }

        prior = {
            **context,
            "tree_digest": "old-tree",
        }

        self.assertFalse(
            MODULE.validation_fields_match(
                prior,
                context,
                include_tree=True,
            )
        )

        self.assertTrue(
            MODULE.validation_fields_match(
                prior,
                context,
                include_tree=False,
            )
        )




class DeterministicPrismaPreparationTests(unittest.TestCase):
    def test_prisma_generate_precedes_typescript_and_database_validation(self):
        scope = {
            "mode": "committed",
            "base_sha": "a" * 40,
            "target_sha": "b" * 40,
            "changed_files": [
                "app/api/challenges/[id]/route.ts",
                "prisma/schema.prisma",
            ],
        }

        plan = MODULE.command_plan(
            scope,
            "DATABASE",
        )

        labels = [
            label
            for label, _command, _timeout
            in plan
        ]

        self.assertIn(
            "prisma-generate",
            labels,
        )
        self.assertIn(
            "typescript",
            labels,
        )
        self.assertIn(
            "prisma-validate",
            labels,
        )

        self.assertLess(
            labels.index("prisma-generate"),
            labels.index("typescript"),
        )
        self.assertLess(
            labels.index("prisma-generate"),
            labels.index("prisma-validate"),
        )

        generate = next(
            command
            for label, command, _timeout
            in plan
            if label == "prisma-generate"
        )

        self.assertEqual(
            generate,
            ["npx", "prisma", "generate"],
        )


if __name__ == "__main__":
    unittest.main()


class SameSourceManifestPreconditionTests(unittest.TestCase):
    @staticmethod
    def sample():
        source = "a" * 40
        return {
            "local": {
                "head": source,
                "dirty_count": 0,
            },
            "github": {
                "main_sha": source,
            },
            "documentation": {
                "baseline_is_ancestor_of_local": True,
            },
            "production": {
                "reachable": True,
                "dirty_count": 0,
                "source_sha": source,
                "service": "active",
                "active_build_id": "live-build",
                "staged_build_id": None,
                "version_parity": True,
                "wolo_8092_count": 1,
                "wolo_8093_count": 1,
            },
            "certification": {
                "status": "legacy-unmanifested",
                "release_sha": None,
                "receipt_path": None,
            },
        }

    @classmethod
    def actual_sample(cls):
        data = cls.sample()
        source = MODULE.git_text("rev-parse", "HEAD")
        data["local"]["head"] = source
        data["github"]["main_sha"] = source
        data["production"]["source_sha"] = source
        data["documentation"]["implementation_baseline"] = source
        return data

    def test_manifest_allows_exact_healthy_same_source_legacy_recertification(self):
        data = self.sample()
        self.assertTrue(MODULE.same_source_recertification_allowed(data))
        self.assertEqual(MODULE.manifest_precondition_errors(data), [])

    def test_manifest_same_source_certified_runtime_remains_blocked(self):
        data = self.sample()
        data["certification"] = {
            "status": "CERTIFIED",
            "release_sha": data["local"]["head"],
            "receipt_path": ".aoe2war-release/activation-receipts/example.json",
        }
        self.assertFalse(MODULE.same_source_recertification_allowed(data))
        errors = MODULE.manifest_precondition_errors(data)
        self.assertEqual(len(errors), 1)
        self.assertIn("production source already equals this release", errors[0])

    def test_same_source_recertification_has_distinct_full_validation_identity(self):
        data = self.actual_sample()
        scope = MODULE.release_scope(data)
        self.assertEqual(scope["mode"], "clean")
        self.assertEqual(scope["changed_files"], [])

        standard_digest = MODULE.scope_digest(scope)
        recert_digest = MODULE.scope_digest(
            scope,
            same_source_recertification=True,
        )
        self.assertNotEqual(standard_digest, recert_digest)

        context = MODULE.validation_context(
            scope,
            same_source_recertification=True,
        )
        self.assertEqual(
            context["release_mode"],
            "SAME_SOURCE_RECERTIFICATION",
        )

        plan = MODULE.command_plan(
            scope,
            "INFRASTRUCTURE",
            same_source_recertification=True,
        )
        labels = [label for label, _command, _timeout in plan]
        self.assertIn("active-python-test-contract", labels)
        self.assertIn("release-python-compile", labels)
        self.assertIn("typescript", labels)
        self.assertIn("eslint-full", labels)
        self.assertIn("prisma-validate", labels)

    def test_manifest_uses_recertification_gate_context_for_clean_same_source(self):
        data = self.actual_sample()
        scope = MODULE.release_scope(data)
        context = MODULE.validation_context(
            scope,
            same_source_recertification=True,
        )
        digest = MODULE.scope_digest(
            scope,
            same_source_recertification=True,
        )

        with tempfile.TemporaryDirectory(dir=MODULE.ROOT) as tmp:
            base = pathlib.Path(tmp)
            gate_dir = base / "gates"
            manifest_dir = base / "manifests"
            gate_dir.mkdir()
            manifest_dir.mkdir()

            gate_path = gate_dir / "recert.json"
            gate_payload = {
                "schema": 2,
                "status": "PASS",
                "base_sha": scope["base_sha"],
                "target_sha": scope["target_sha"],
                "scope_sha256": digest,
                "risk_class": "INFRASTRUCTURE",
                "same_source_recertification": True,
                "changed_files": [],
                "validation_mode": "FULL",
                **context,
            }
            gate_path.write_text(
                json.dumps(gate_payload, sort_keys=True),
                encoding="utf-8",
            )

            old_gate_dir = MODULE.GATE_DIR
            old_manifest_dir = MODULE.MANIFEST_DIR
            try:
                MODULE.GATE_DIR = gate_dir
                MODULE.MANIFEST_DIR = manifest_dir
                rc = MODULE.manifest_release(data, json_output=True)
            finally:
                MODULE.GATE_DIR = old_gate_dir
                MODULE.MANIFEST_DIR = old_manifest_dir

            self.assertEqual(rc, 0)
            manifest_path = manifest_dir / f"{data['local']['head']}.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertTrue(manifest["same_source_recertification"])
            self.assertTrue(manifest["policy"]["same_source_recertification"])
            self.assertEqual(manifest["scope_sha256"], digest)
            self.assertEqual(manifest["risk_class"], "INFRASTRUCTURE")
            self.assertEqual(manifest["changed_files"], [])
            self.assertEqual(
                manifest["previous_production_sha"],
                data["local"]["head"],
            )

    def test_manifest_rejects_standard_clean_gate_for_same_source_recertification(self):
        data = self.actual_sample()
        scope = MODULE.release_scope(data)
        standard_context = MODULE.validation_context(scope)
        standard_digest = MODULE.scope_digest(scope)

        with tempfile.TemporaryDirectory(dir=MODULE.ROOT) as tmp:
            base = pathlib.Path(tmp)
            gate_dir = base / "gates"
            manifest_dir = base / "manifests"
            gate_dir.mkdir()
            manifest_dir.mkdir()

            gate_path = gate_dir / "standard.json"
            gate_payload = {
                "schema": 2,
                "status": "PASS",
                "base_sha": scope["base_sha"],
                "target_sha": scope["target_sha"],
                "scope_sha256": standard_digest,
                "risk_class": "NO_CHANGE",
                "same_source_recertification": False,
                "changed_files": [],
                "validation_mode": "FULL",
                **standard_context,
            }
            gate_path.write_text(
                json.dumps(gate_payload, sort_keys=True),
                encoding="utf-8",
            )

            old_gate_dir = MODULE.GATE_DIR
            old_manifest_dir = MODULE.MANIFEST_DIR
            try:
                MODULE.GATE_DIR = gate_dir
                MODULE.MANIFEST_DIR = manifest_dir
                rc = MODULE.manifest_release(data, json_output=True)
            finally:
                MODULE.GATE_DIR = old_gate_dir
                MODULE.MANIFEST_DIR = old_manifest_dir

            self.assertEqual(rc, 2)
            self.assertFalse(
                (manifest_dir / f"{data['local']['head']}.json").exists()
            )

    def test_manifest_same_source_legacy_recertification_fails_closed_when_unhealthy(self):
        mutations = [
            ("github mismatch", lambda x: x["github"].__setitem__("main_sha", "b" * 40)),
            ("local dirty", lambda x: x["local"].__setitem__("dirty_count", 1)),
            ("production dirty", lambda x: x["production"].__setitem__("dirty_count", 1)),
            ("production unreachable", lambda x: x["production"].__setitem__("reachable", False)),
            ("service inactive", lambda x: x["production"].__setitem__("service", "inactive")),
            ("missing build", lambda x: x["production"].__setitem__("active_build_id", "")),
            ("version parity false", lambda x: x["production"].__setitem__("version_parity", False)),
            ("staged build", lambda x: x["production"].__setitem__("staged_build_id", "candidate")),
            ("wolo 8092 abnormal", lambda x: x["production"].__setitem__("wolo_8092_count", 0)),
            ("wolo 8093 abnormal", lambda x: x["production"].__setitem__("wolo_8093_count", 2)),
        ]
        for label, mutate in mutations:
            with self.subTest(label=label):
                data = self.sample()
                mutate(data)
                self.assertFalse(MODULE.same_source_recertification_allowed(data))
                self.assertTrue(MODULE.manifest_precondition_errors(data))
