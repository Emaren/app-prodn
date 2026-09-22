from __future__ import annotations

import importlib.util
import inspect
import io
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_update.py"
SCRIPTS = SCRIPT.parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

SPEC = importlib.util.spec_from_file_location("aoe2_update", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def certified_release(source: str = "a" * 40) -> dict:
    build_id = "certified-build-id"
    build_version = "20260811010000-aaaaaaaaaa"
    return {
        "local": {
            "head": source,
            "branch": "main",
            "dirty_count": 0,
        },
        "github": {"main_sha": source},
        "production": {
            "host": "hel1",
            "repo": "/var/www/AoE2HDBets/app-prodn",
            "reachable": True,
            "source_sha": source,
            "branch": "main",
            "dirty_count": 0,
            "service": "active",
            "active_build_id": build_id,
            "staged_build_id": None,
            "internal_build_version": build_version,
            "public_build_version": build_version,
            "version_parity": True,
            "rollback_count": 2,
            "latest_rollback": ".next-rollback-activate-example",
            "root_free_kb": 6_000_000,
            "volume_free_kb": 8_000_000,
            "wolo_8092_count": 1,
            "wolo_8093_count": 1,
        },
        "certification": {
            "status": "CERTIFIED",
            "release_sha": source,
            "active_build_id": build_id,
            "build_version": build_version,
            "artifact_sha256": "b" * 64,
            "receipt_path": ".aoe2war-release/activation-receipts/example.json",
        },
    }


def legacy_unmanifested_release(source: str = "a" * 40) -> dict:
    data = certified_release(source)
    data["certification"] = {
        "status": "legacy-unmanifested",
        "release_sha": None,
        "active_build_id": None,
        "build_version": None,
        "artifact_sha256": None,
        "receipt_path": None,
    }
    return data


class UpdateCommandTests(unittest.TestCase):
    def test_context_preservation_skips_pre_capture_pruning(self):
        MODULE.prune_context_before_capture(
            ["AoE2HDBets"],
            preserve_context_history=True,
        )

    def test_docs_owned_paths(self):
        self.assertTrue(MODULE.docs_owned_path("README.md"))
        self.assertTrue(MODULE.docs_owned_path("docs/x.md"))
        self.assertTrue(MODULE.docs_owned_path("catalog-info.yaml"))
        self.assertFalse(MODULE.docs_owned_path("app/page.tsx"))

    def test_central_owned_paths(self):
        self.assertTrue(
            MODULE.central_owned_path("catalog/registries/app-prodn.json")
        )
        self.assertTrue(MODULE.central_owned_path("docs/generated/catalog.md"))
        self.assertTrue(
            MODULE.central_owned_path("catalog/document-taxonomy.json")
        )
        self.assertFalse(MODULE.central_owned_path("scripts/generate.py"))

    def test_verify_committed_tree_accepts_exact_clean_tree(self):
        expected = "a" * 40
        with mock.patch.object(
            MODULE,
            "git_output",
            return_value=expected,
        ), mock.patch.object(
            MODULE,
            "status_paths",
            return_value=set(),
        ):
            self.assertEqual(
                MODULE.verify_committed_tree(pathlib.Path("/repo"), expected),
                expected,
            )

    def test_verify_committed_tree_rejects_tree_mutation(self):
        expected = "a" * 40
        with mock.patch.object(
            MODULE,
            "git_output",
            return_value="b" * 40,
        ), mock.patch.object(
            MODULE,
            "status_paths",
            return_value=set(),
        ):
            with self.assertRaisesRegex(
                MODULE.UpdateError,
                "post-commit tree identity failed",
            ):
                MODULE.verify_committed_tree(pathlib.Path("/repo"), expected)

    def test_verify_committed_tree_rejects_dirty_post_commit_state(self):
        expected = "a" * 40
        with mock.patch.object(
            MODULE,
            "git_output",
            return_value=expected,
        ), mock.patch.object(
            MODULE,
            "status_paths",
            return_value={"catalog/generated.json"},
        ):
            with self.assertRaisesRegex(
                MODULE.UpdateError,
                "determinism contract failed",
            ):
                MODULE.verify_committed_tree(pathlib.Path("/repo"), expected)

    def test_central_sync_proves_one_validated_tree_instead_of_rebuilding_it(self):
        source = inspect.getsource(MODULE.central_sync)
        self.assertEqual(
            source.count('for target in ("docs-check", "audit-taxonomy", "build")'),
            1,
        )
        self.assertIn('git_output(DOCS, "write-tree")', source)
        self.assertIn("verify_committed_tree(DOCS, validated_tree)", source)

    def test_baseline_refresh_detection(self):
        self.assertTrue(
            MODULE.baseline_refresh_needed(
                "implementation changed after the recorded baseline"
            )
        )
        self.assertFalse(MODULE.baseline_refresh_needed("candidate document found"))

    def test_release_docs_refresh_detection(self):
        marker = "WATCHER_RELEASE_DOCS_STALE version=1.5.12"
        self.assertTrue(MODULE.release_docs_refresh_needed(marker))
        self.assertTrue(MODULE.source_docs_refresh_needed(marker))
        self.assertFalse(MODULE.release_docs_refresh_needed("WATCHER_RELEASE_DOCS_CURRENT"))

    def test_source_checker_runs_release_documentation_gate(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo = pathlib.Path(temporary)
            scripts = repo / "scripts"
            scripts.mkdir()
            (scripts / "docs_v2_check.py").write_text("# checker")
            (scripts / "sync-release-docs.mjs").write_text("// release checker")
            with mock.patch.object(
                MODULE,
                "run",
                side_effect=[
                    (0, "DOCS_PASS"),
                    (2, "WATCHER_RELEASE_DOCS_STALE version=1.5.12"),
                ],
            ) as run_call:
                rc, output = MODULE.source_checker(repo)
        self.assertEqual(rc, 2)
        self.assertIn("WATCHER_RELEASE_DOCS_STALE", output)
        self.assertEqual(run_call.call_count, 2)

    def test_collect_plan_allows_central_quality_p0_self_remediation(self):
        audit = mock.Mock()
        audit.payload.return_value = {
            "p0": 2,
            "p1": 1,
            "findings": [
                {
                    "severity": "P0",
                    "area": "Documentation",
                    "key": "docs-check",
                    "detail": "stale federated registry",
                },
                {
                    "severity": "P0",
                    "area": "Documentation",
                    "key": "strict-build",
                    "detail": "stale federated registry",
                },
                {
                    "severity": "P1",
                    "area": "Documentation",
                    "key": "central-source-snapshot-stale",
                    "detail": "vpssentry central snapshot is stale",
                },
            ],
        }

        with mock.patch.object(
            MODULE.aoe2_audit,
            "collect_audit",
            return_value=audit,
        ), mock.patch.object(
            MODULE,
            "source_checker",
            return_value=(0, "PASS"),
        ), mock.patch.object(
            MODULE,
            "estate_map_refresh_plan",
            return_value={
                "status": "deferred",
                "reason": "post-deploy",
                "intended_source_sha": "a" * 40,
            },
        ):
            plan = MODULE.collect_plan(release_data=certified_release())

        self.assertFalse(plan["blocked"])
        self.assertTrue(plan["central_sync"])
        self.assertEqual(
            {item["key"] for item in plan["auto_remediable_p0"]},
            {"docs-check", "strict-build"},
        )
        self.assertEqual(plan["unknown_p0"], [])

    def test_runtime_provenance_finish_remediation_requires_exact_healthy_source(self):
        data = legacy_unmanifested_release()
        self.assertTrue(MODULE.runtime_provenance_finish_remediable(data))

        mutations = [
            ("github mismatch", lambda x: x["github"].__setitem__("main_sha", "b" * 40)),
            ("production source mismatch", lambda x: x["production"].__setitem__("source_sha", "b" * 40)),
            ("local dirty", lambda x: x["local"].__setitem__("dirty_count", 1)),
            ("production dirty", lambda x: x["production"].__setitem__("dirty_count", 1)),
            ("production unreachable", lambda x: x["production"].__setitem__("reachable", False)),
            ("service inactive", lambda x: x["production"].__setitem__("service", "inactive")),
            ("version parity false", lambda x: x["production"].__setitem__("version_parity", False)),
            ("missing build id", lambda x: x["production"].__setitem__("active_build_id", "")),
            ("wolo 8092 abnormal", lambda x: x["production"].__setitem__("wolo_8092_count", 0)),
            ("wolo 8093 abnormal", lambda x: x["production"].__setitem__("wolo_8093_count", 2)),
            ("already certified", lambda x: x["certification"].__setitem__("status", "CERTIFIED")),
        ]
        for label, mutate in mutations:
            with self.subTest(label=label):
                candidate = legacy_unmanifested_release()
                mutate(candidate)
                self.assertFalse(
                    MODULE.runtime_provenance_finish_remediable(candidate)
                )

    def test_collect_plan_defers_runtime_provenance_only_when_finish_authorizes_it(self):
        audit = mock.Mock()
        audit.payload.return_value = {
            "p0": 1,
            "p1": 0,
            "findings": [
                {
                    "severity": "P0",
                    "area": "Release Engine",
                    "key": "runtime-provenance",
                    "detail": "status='legacy-unmanifested'",
                },
            ],
        }

        with mock.patch.object(
            MODULE.aoe2_audit,
            "collect_audit",
            return_value=audit,
        ), mock.patch.object(
            MODULE,
            "source_checker",
            return_value=(0, "PASS"),
        ), mock.patch.object(
            MODULE,
            "estate_map_refresh_plan",
            return_value={
                "status": "deferred",
                "reason": "post-deploy",
                "intended_source_sha": "a" * 40,
            },
        ):
            default = MODULE.collect_plan(
                release_data=legacy_unmanifested_release(),
            )
            finish = MODULE.collect_plan(
                release_data=legacy_unmanifested_release(),
                defer_runtime_provenance=True,
            )

        self.assertTrue(default["blocked"])
        self.assertEqual(default["auto_remediable_p0"], [])
        self.assertEqual(
            [item["key"] for item in default["unknown_p0"]],
            ["runtime-provenance"],
        )

        self.assertFalse(finish["blocked"])
        self.assertEqual(
            [item["key"] for item in finish["auto_remediable_p0"]],
            ["runtime-provenance"],
        )
        self.assertEqual(finish["unknown_p0"], [])

    def test_collect_plan_keeps_nonremediable_p0_blocking(self):
        audit = mock.Mock()
        audit.payload.return_value = {
            "p0": 1,
            "p1": 1,
            "findings": [
                {
                    "severity": "P0",
                    "area": "Documentation",
                    "key": "docs-venv-missing",
                    "detail": "central docs venv is missing",
                },
                {
                    "severity": "P1",
                    "area": "Documentation",
                    "key": "central-source-snapshot-stale",
                    "detail": "vpssentry central snapshot is stale",
                },
            ],
        }

        with mock.patch.object(
            MODULE.aoe2_audit,
            "collect_audit",
            return_value=audit,
        ), mock.patch.object(
            MODULE,
            "source_checker",
            return_value=(0, "PASS"),
        ), mock.patch.object(
            MODULE,
            "estate_map_refresh_plan",
            return_value={
                "status": "deferred",
                "reason": "post-deploy",
                "intended_source_sha": "a" * 40,
            },
        ):
            plan = MODULE.collect_plan(release_data=certified_release())

        self.assertTrue(plan["blocked"])
        self.assertEqual(plan["auto_remediable_p0"], [])
        self.assertEqual(
            [item["key"] for item in plan["unknown_p0"]],
            ["docs-venv-missing"],
        )

    def test_collect_plan_auto_remediates_archive_retention_drift_unless_preserved(self):
        audit = mock.Mock()
        audit.payload.return_value = {
            "p0": 0,
            "p1": 1,
            "findings": [
                {
                    "severity": "P1",
                    "area": "Context Durability",
                    "key": "archive-retention-drift",
                    "detail": "AoE2HDBets: 2 TGZ cameras retained; expected one outside explicit forensic preservation",
                },
            ],
        }

        with mock.patch.object(
            MODULE.aoe2_audit,
            "collect_audit",
            return_value=audit,
        ), mock.patch.object(
            MODULE,
            "source_checker",
            return_value=(0, "PASS"),
        ), mock.patch.object(
            MODULE,
            "estate_map_refresh_plan",
            return_value={
                "status": "deferred",
                "reason": "post-deploy",
                "intended_source_sha": "a" * 40,
            },
        ):
            normal = MODULE.collect_plan(
                release_data=certified_release(),
                preserve_context_history=False,
            )
            preserved = MODULE.collect_plan(
                release_data=certified_release(),
                preserve_context_history=True,
            )

        self.assertFalse(normal["blocked"])
        self.assertEqual(
            [item["key"] for item in normal["auto_remediable_p1"]],
            ["archive-retention-drift"],
        )
        self.assertEqual(normal["unknown_p1"], [])
        self.assertEqual(normal["context_projects"], ["AoE2HDBets"])

        self.assertTrue(preserved["blocked"])
        self.assertEqual(preserved["auto_remediable_p1"], [])
        self.assertEqual(
            [item["key"] for item in preserved["unknown_p1"]],
            ["archive-retention-drift"],
        )
        self.assertEqual(preserved["context_projects"], [])

    def test_deferred_context_audit_allows_only_selected_archive_stale(self):
        audit = {
            "findings": [
                {
                    "severity": "P1",
                    "key": "archive-stale",
                    "detail": "AoE2HDBets: archive=old newest=new",
                },
                {
                    "severity": "P1",
                    "key": "other-problem",
                    "detail": "must remain blocking",
                },
                {
                    "severity": "P0",
                    "key": "archive-stale",
                    "detail": "AoE2HDBets: archive=old newest=new",
                },
            ]
        }
        blockers = MODULE.audit_blockers_with_deferred_context(
            audit,
            ["AoE2HDBets"],
        )
        self.assertEqual(len(blockers), 2)
        self.assertEqual(blockers[0]["key"], "other-problem")
        self.assertEqual(blockers[1]["severity"], "P0")

    def test_archive_project_detection(self):
        self.assertEqual(
            MODULE.archive_project_from_finding(
                "AoE2HDBets: archive=old newest=new"
            ),
            "AoE2HDBets",
        )
        self.assertEqual(
            MODULE.archive_project_from_finding(
                "aoe2-watcher: archive=old newest=new"
            ),
            "aoe2-watcher",
        )
        self.assertEqual(MODULE.REPO_TO_CONTEXT["aoe2-watcher"], "aoe2-watcher")
        self.assertIsNone(
            MODULE.archive_project_from_finding("unknown: x")
        )

    def test_certified_source_ready_requires_exact_three_plane_identity(self):
        ready, reason, source = MODULE.certified_source_ready(certified_release())
        self.assertTrue(ready, reason)
        self.assertEqual(source, "a" * 40)

        github_ahead = certified_release("a" * 40)
        github_ahead["local"]["head"] = "c" * 40
        github_ahead["github"]["main_sha"] = "c" * 40
        ready, reason, source = MODULE.certified_source_ready(github_ahead)
        self.assertFalse(ready)
        self.assertEqual(source, "c" * 40)
        self.assertIn("defer until post-deploy", reason)

    def test_estate_map_plan_refreshes_only_certified_intended_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = pathlib.Path(temporary)
            vpssentry = base / "VPSSentry"
            (vpssentry / "context").mkdir(parents=True)
            block = (
                MODULE.ESTATE_MAP_BEGIN
                + "\n## Generated\n\n"
                + f"- Current-state source SHA: `{'d' * 40}`\n"
                + MODULE.ESTATE_MAP_END
                + "\n"
            )
            for name in MODULE.ESTATE_MAP_FILES:
                (vpssentry / "context" / name).write_text(
                    block, encoding="utf-8"
                )
            closure_block = (
                MODULE.CLOSURE_STATE_BEGIN
                + "\n## Generated Closure\n\n"
                + f"- Current-state source SHA: `{'d' * 40}`\n"
                + MODULE.CLOSURE_STATE_END
                + "\n"
            )
            (vpssentry / "context" / "AOE2WAR_100_CLOSURE.md").write_text(
                closure_block, encoding="utf-8"
            )

            plan = MODULE.estate_map_refresh_plan(
                certified_release(),
                vpssentry=vpssentry,
            )
            self.assertEqual(plan["status"], "refresh")
            self.assertEqual(plan["current_source_sha"], "d" * 40)

            deferred_release = certified_release()
            deferred_release["local"]["head"] = "c" * 40
            deferred_release["github"]["main_sha"] = "c" * 40
            deferred = MODULE.estate_map_refresh_plan(
                deferred_release,
                vpssentry=vpssentry,
            )
            self.assertEqual(deferred["status"], "deferred")

    def test_historical_closure_ledger_is_excluded_from_living_source_convergence(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = pathlib.Path(temporary)
            vpssentry = base / "VPSSentry"
            (vpssentry / "context").mkdir(parents=True)

            def estate_block(source: str) -> str:
                return (
                    MODULE.ESTATE_MAP_BEGIN
                    + "\n## Generated\n\n"
                    + f"- Current-state source SHA: `{source}`\n"
                    + MODULE.ESTATE_MAP_END
                    + "\n"
                )

            for name in MODULE.ESTATE_MAP_FILES:
                (vpssentry / "context" / name).write_text(
                    estate_block("d" * 40), encoding="utf-8"
                )

            frozen_closure = (
                "---\nstatus: \"historical\"\n---\n\n"
                + MODULE.CLOSURE_STATE_BEGIN
                + "\n## Generated Closure\n\n"
                + f"- Current-state source SHA: `{'e' * 40}`\n"
                + MODULE.CLOSURE_STATE_END
                + "\n"
            )
            closure_path = vpssentry / "context" / "AOE2WAR_100_CLOSURE.md"
            closure_path.write_text(frozen_closure, encoding="utf-8")

            refresh = MODULE.estate_map_refresh_plan(
                certified_release(),
                vpssentry=vpssentry,
            )
            self.assertEqual(refresh["status"], "refresh")
            self.assertEqual(refresh["current_source_sha"], "d" * 40)

            for name in MODULE.ESTATE_MAP_FILES:
                (vpssentry / "context" / name).write_text(
                    estate_block("a" * 40), encoding="utf-8"
                )

            current = MODULE.estate_map_refresh_plan(
                certified_release(),
                vpssentry=vpssentry,
            )
            self.assertEqual(current["status"], "current")
            self.assertEqual(current["current_source_sha"], "a" * 40)
            self.assertEqual(MODULE.closure_state_source(closure_path), "e" * 40)

    def test_active_closure_ledger_still_participates_in_source_convergence(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = pathlib.Path(temporary)
            vpssentry = base / "VPSSentry"
            (vpssentry / "context").mkdir(parents=True)
            block = (
                MODULE.ESTATE_MAP_BEGIN
                + "\n## Generated\n\n"
                + f"- Current-state source SHA: `{'a' * 40}`\n"
                + MODULE.ESTATE_MAP_END
                + "\n"
            )
            for name in MODULE.ESTATE_MAP_FILES:
                (vpssentry / "context" / name).write_text(
                    block, encoding="utf-8"
                )
            active_closure = (
                "---\nstatus: \"active\"\n---\n\n"
                + MODULE.CLOSURE_STATE_BEGIN
                + "\n## Generated Closure\n\n"
                + f"- Current-state source SHA: `{'e' * 40}`\n"
                + MODULE.CLOSURE_STATE_END
                + "\n"
            )
            (vpssentry / "context" / "AOE2WAR_100_CLOSURE.md").write_text(
                active_closure, encoding="utf-8"
            )

            plan = MODULE.estate_map_refresh_plan(
                certified_release(),
                vpssentry=vpssentry,
            )
            self.assertEqual(plan["status"], "blocked")
            self.assertIn("disagree", plan["reason"])

    def test_estate_map_snapshot_uses_certification_receipt_evidence(self):
        receipt = {
            "generated_at": "2026-08-11T00:59:00.123Z",
            "implementation_sha": "c" * 40,
            "remote_receipt_dir": "/mnt/volume/deploy-receipts/example",
            "durable_rollback": "/mnt/volume/rollbacks/example",
            "fast_rollback": ".next-rollback-activate-example",
            "risk_class": "INFRASTRUCTURE",
            "wolo_mutated": False,
        }
        snapshot = MODULE.build_estate_map_snapshot(
            certified_release(),
            receipt,
            observed_at="2026-08-11T01:00:00Z",
        )
        self.assertEqual(snapshot["intended_source_sha"], "a" * 40)
        self.assertEqual(
            snapshot["certification"]["implementation_sha"], "c" * 40
        )
        self.assertEqual(
            snapshot["certification"]["durable_rollback"],
            "/mnt/volume/rollbacks/example",
        )
        self.assertFalse(snapshot["certification"]["wolo_mutated"])

    def test_taxonomy_refresh_existing(self):
        taxonomy = {
            "documents": [
                {
                    "repository": "app-prodn",
                    "path": "README.md",
                    "id": "aoe2war.app.readme",
                    "title": "Old",
                    "type": "reference",
                    "status": "active",
                    "owner": "owner",
                    "systems": ["app-prodn"],
                    "audience": ["developer"],
                    "source_of_truth": "git",
                    "authority": "entry",
                    "reviewed_at": "2026-08-10",
                    "review_interval_days": 90,
                    "sensitivity": "internal",
                    "semantic_indexed": True,
                    "migration_action": "keep",
                    "rationale": "x",
                    "source_sha256": "old",
                    "phase2_decomposition": "",
                }
            ],
            "expected_counts": {
                "candidate_classifications": 0,
                "unclassified": 0,
                "path_moves": 0,
                "exact_duplicate_content_groups": 0,
                "duplicate_heading_groups": 0,
            },
        }
        registries = {
            "app-prodn": {
                "documents": [
                    {
                        "path": "README.md",
                        "id": "aoe2war.app.readme",
                        "title": "New",
                        "type": "reference",
                        "status": "active",
                        "owner": "owner",
                        "systems": ["app-prodn"],
                        "audience": ["developer"],
                        "source_of_truth": "git",
                        "authority": "entry",
                        "reviewed_at": "2026-08-10",
                        "review_interval_days": 90,
                        "sensitivity": "internal",
                        "sha256": "new",
                    }
                ]
            }
        }
        payload, changes = MODULE.reconcile_taxonomy(taxonomy, registries)
        self.assertEqual(payload["documents"][0]["title"], "New")
        self.assertEqual(payload["documents"][0]["source_sha256"], "new")
        self.assertEqual(len(changes), 1)
        self.assertEqual(payload["expected_counts"]["corpus_total"], 1)

    def test_taxonomy_add_new_document(self):
        taxonomy = {
            "documents": [],
            "expected_counts": {
                "candidate_classifications": 0,
                "unclassified": 0,
                "path_moves": 0,
                "exact_duplicate_content_groups": 0,
                "duplicate_heading_groups": 0,
            },
        }
        doc = {
            "path": "docs/new.md",
            "id": "aoe2war.app.new",
            "title": "New",
            "type": "reference",
            "status": "active",
            "owner": "owner",
            "systems": ["app-prodn"],
            "audience": ["developer"],
            "source_of_truth": "git",
            "authority": "reference",
            "reviewed_at": "2026-08-10",
            "review_interval_days": 90,
            "sensitivity": "internal",
            "sha256": "abc",
        }
        payload, changes = MODULE.reconcile_taxonomy(
            taxonomy,
            {"app-prodn": {"documents": [doc]}},
        )
        self.assertEqual(len(payload["documents"]), 1)
        self.assertTrue(payload["documents"][0]["semantic_indexed"])
        self.assertEqual(changes, ["ADD app-prodn:docs/new.md"])

    def test_taxonomy_refuses_removed_document(self):
        taxonomy = {
            "documents": [
                {
                    "repository": "app-prodn",
                    "path": "README.md",
                    "id": "aoe2war.app.readme",
                    "title": "Readme",
                    "type": "reference",
                    "status": "active",
                    "owner": "owner",
                    "systems": ["app-prodn"],
                    "audience": ["developer"],
                    "source_of_truth": "git",
                    "authority": "entry",
                    "reviewed_at": "2026-08-10",
                    "review_interval_days": 90,
                    "sensitivity": "internal",
                    "semantic_indexed": True,
                    "migration_action": "keep",
                    "rationale": "x",
                    "source_sha256": "old",
                    "phase2_decomposition": "",
                }
            ],
            "expected_counts": {
                "candidate_classifications": 0,
                "unclassified": 0,
                "path_moves": 0,
                "exact_duplicate_content_groups": 0,
                "duplicate_heading_groups": 0,
            },
        }
        with self.assertRaises(MODULE.UpdateError):
            MODULE.reconcile_taxonomy(
                taxonomy,
                {"app-prodn": {"documents": []}},
            )


    def test_format_elapsed(self):
        self.assertEqual(MODULE.format_elapsed(0), "00:00")
        self.assertEqual(MODULE.format_elapsed(65), "01:05")
        self.assertEqual(MODULE.format_elapsed(3661), "1:01:01")

    def test_progress_emits_elapsed_human_line(self):
        values = iter([100.0, 165.0])
        stream = io.StringIO()
        progress = MODULE.Progress(
            stream=stream,
            clock=lambda: next(values),
        )
        progress.done("finished")
        self.assertEqual(
            stream.getvalue(),
            "[01:05] ✓ finished\n",
        )

    def test_progress_wait_includes_step_elapsed(self):
        values = iter([10.0, 20.0])
        stream = io.StringIO()
        progress = MODULE.Progress(
            stream=stream,
            clock=lambda: next(values),
        )
        progress.wait("working", 42)
        self.assertIn(
            "… working (00:42 in this step)",
            stream.getvalue(),
        )

    def test_run_with_heartbeat_reports_long_step(self):
        stream = io.StringIO()
        progress = MODULE.Progress(stream=stream)
        rc, output = MODULE.run_with_heartbeat(
            [
                sys.executable,
                "-c",
                "import time; time.sleep(0.12); print('done')",
            ],
            cwd=pathlib.Path.cwd(),
            progress=progress,
            label="heartbeat test",
            timeout=2,
            heartbeat_seconds=0.02,
        )
        self.assertEqual(rc, 0)
        self.assertEqual(output, "done")
        self.assertIn("… heartbeat test", stream.getvalue())


    def test_context_capture_can_include_host_cameras(self):
        with tempfile.TemporaryDirectory() as temporary:
            vpssentry = pathlib.Path(temporary)
            tool = vpssentry / "bin" / "full-context-tgz"
            tool.parent.mkdir(parents=True)
            tool.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            tool.chmod(0o755)
            (vpssentry / "context").mkdir()

            with mock.patch.object(MODULE, "VPSSENTRY", vpssentry), \
                 mock.patch.object(MODULE, "prune_context_before_capture"), \
                 mock.patch.object(MODULE, "context_capture_headroom"), \
                 mock.patch.object(MODULE, "run", return_value=(0, "ok")) as run_call:
                with self.assertRaises(MODULE.UpdateError):
                    MODULE.capture_context(
                        ["VPSSentry"],
                        include_host_context=True,
                    )

            command = run_call.call_args_list[0].args[0]
            self.assertNotIn("--only-projects", command)
            self.assertIn("--projects", command)
            self.assertIn("VPSSentry", command)

    def test_context_capture_keeps_project_only_mode_for_overlap(self):
        with tempfile.TemporaryDirectory() as temporary:
            vpssentry = pathlib.Path(temporary)
            tool = vpssentry / "bin" / "full-context-tgz"
            tool.parent.mkdir(parents=True)
            tool.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            tool.chmod(0o755)
            (vpssentry / "context").mkdir()

            with mock.patch.object(MODULE, "VPSSENTRY", vpssentry), \
                 mock.patch.object(MODULE, "prune_context_before_capture"), \
                 mock.patch.object(MODULE, "context_capture_headroom"), \
                 mock.patch.object(MODULE, "run", return_value=(0, "ok")) as run_call:
                with self.assertRaises(MODULE.UpdateError):
                    MODULE.capture_context(["AoE2HDBets"])

            command = run_call.call_args_list[0].args[0]
            self.assertIn("--only-projects", command)


    def test_context_capture_verifies_tgz_and_markdown_companion_pair(self):
        with tempfile.TemporaryDirectory() as temporary:
            vpssentry = pathlib.Path(temporary)
            tool = vpssentry / "bin" / "full-context-tgz"
            tool.parent.mkdir(parents=True)
            tool.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            tool.chmod(0o755)

            context = vpssentry / "context"
            tgz = context / "tgz"
            md = context / "md"
            sha = context / "sha256"
            for directory in (tgz, md, sha):
                directory.mkdir(parents=True)

            def fake_run(args, *, cwd, timeout=120, env=None):
                if args[0] == str(tool):
                    assert env is not None
                    stamp = env["CTX_TS"]
                    archive = tgz / f"AoE2HDBets-context-host-{stamp}.tgz"
                    archive.write_bytes(b"archive-payload")
                    archive_sha = MODULE.sha256(archive)
                    (sha / f"{archive.name}.sha256").write_text(
                        f"{archive_sha}  {archive.name}\n",
                        encoding="utf-8",
                    )
                    companion = md / f"{archive.stem}.md"
                    companion.write_text(
                        "# AoE2WAR Portable Context Companion\n\n"
                        f"- source_archive: `{archive.name}`\n"
                        f"- source_sha256: `{archive_sha}`\n",
                        encoding="utf-8",
                    )
                    companion_sha = MODULE.sha256(companion)
                    (sha / f"{companion.name}.sha256").write_text(
                        f"{companion_sha}  {companion.name}\n",
                        encoding="utf-8",
                    )
                    return 0, "capture ok"
                if args[0] == "shasum":
                    return 0, "OK"
                raise AssertionError(args)

            with mock.patch.object(MODULE, "VPSSENTRY", vpssentry), \
                 mock.patch.object(MODULE, "prune_context_before_capture"), \
                 mock.patch.object(MODULE, "context_capture_headroom"), \
                 mock.patch.object(MODULE, "run", side_effect=fake_run):
                result = MODULE.capture_context(["AoE2HDBets"])

            row = result["AoE2HDBets"]
            self.assertTrue(row["archive"].endswith(".tgz"))
            self.assertTrue(row["markdown"].endswith(".md"))
            self.assertEqual(len(row["sha256"]), 64)
            self.assertEqual(len(row["markdown_sha256"]), 64)
            self.assertGreater(row["bytes"], 0)
            self.assertGreater(row["markdown_bytes"], 0)


if __name__ == "__main__":
    unittest.main()
