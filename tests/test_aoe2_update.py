from __future__ import annotations

import importlib.util
import io
import pathlib
import sys
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


class UpdateCommandTests(unittest.TestCase):
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
