from __future__ import annotations

import importlib.util
import io
import pathlib
import sys
import tempfile
import unittest

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

    def test_baseline_refresh_detection(self):
        self.assertTrue(
            MODULE.baseline_refresh_needed(
                "implementation changed after the recorded baseline"
            )
        )
        self.assertFalse(MODULE.baseline_refresh_needed("candidate document found"))

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


if __name__ == "__main__":
    unittest.main()
