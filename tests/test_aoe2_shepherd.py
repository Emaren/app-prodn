from __future__ import annotations

from datetime import datetime, timezone, timedelta
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location("aoe2_shepherd", SCRIPTS / "aoe2_shepherd.py")
assert SPEC and SPEC.loader
SHEPHERD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SHEPHERD)


def reg(repo: str, path: str, sha: str = "a" * 64) -> dict:
    return {"repo": repo, "documents": [{
        "path": path, "id": "aoe2war." + repo + ".example",
        "title": "Example", "type": "working", "status": "active",
        "owner": "example", "systems": [repo], "audience": ["developers"],
        "source_of_truth": "git", "authority": "example-contract",
        "reviewed_at": "2026-10-13", "review_interval_days": 30,
        "sensitivity": "internal", "sha256": sha,
    }]}


def taxonomy(repo: str, path: str) -> dict:
    record = reg(repo, path)["documents"][0].copy()
    record["repository"] = repo
    record["source_sha256"] = record.pop("sha256")
    return {"documents": [record]}


NOW = datetime(2026, 10, 14, 1, 30, tzinfo=timezone.utc)


class KingdomShepherdTests(unittest.TestCase):
    def test_branch_only_watcher_governed_document_is_blocker_not_auto_delete(self):
        name = "aoe2-watcher"
        old = "docs/WATCHER_1_6_4_UPDATE_LIFECYCLE.md"
        snapshot = SHEPHERD.build_plan(
            {name: {"repo": name, "documents": []}},
            taxonomy(name, old),
            [], None, NOW, intended_head="b" * 40,
        )
        self.assertEqual(snapshot["firstBlocker"]["code"], "governed-document-absent")
        self.assertEqual(snapshot["firstBlocker"]["stage"], "documentation")
        self.assertIn("Never silently delete", snapshot["firstBlocker"]["nextAction"])
        self.assertFalse(snapshot["mutationAllowed"])
        self.assertFalse(snapshot["readyForLiveMutation"])

    def test_new_source_doc_is_update_not_unauthorized_removal(self):
        name = "aoe2-watcher"
        rows = SHEPHERD.taxonomy_differences({"documents": []}, {name: reg(name, "docs/new.md")})
        self.assertEqual(rows[0]["code"], "new-source-document")
        self.assertEqual(rows[0]["level"], "UPDATE")

    def test_same_registry_and_taxonomy_have_no_fault(self):
        t = taxonomy("app-prodn", "docs/README.md")
        self.assertEqual(SHEPHERD.taxonomy_differences(t, {
            "app-prodn": reg("app-prodn", "docs/README.md")
        }), [])

    def test_changed_source_hash_is_visible(self):
        t = taxonomy("aoe2-watcher", "docs/a.md")
        result = SHEPHERD.taxonomy_differences(
            t, {"aoe2-watcher": reg("aoe2-watcher", "docs/a.md", "c" * 64)}
        )
        self.assertEqual(result[0]["code"], "registry-taxonomy-drift")
        self.assertIn("source_sha256", result[0]["finding"])

    def test_dirty_docs_precedes_later_observation_disagreements(self):
        inspection = {
            "schema": 1, "generatedAt": NOW.isoformat(),
            "releaseSha": "a" * 40,
            "categories": [{"id": "speed", "title": "Website Speed", "score": 68}],
        }
        plan = SHEPHERD.build_plan(
            {"aoe2-watcher": reg("aoe2-watcher", "docs/a.md")},
            taxonomy("aoe2-watcher", "docs/a.md"),
            [{"id": "AoE2WAR-docs", "available": True, "branch": "main",
              "clean": False, "dirtyCount": 4, "localTrackingExact": True}],
            inspection, NOW, intended_head="b" * 40,
        )
        self.assertEqual(plan["firstBlocker"]["code"], "source-dirty")
        self.assertEqual(plan["findings"][0]["stage"], "source")
        self.assertIn("inspection-release-behind-source", {row["code"] for row in plan["findings"]})
        self.assertIn("inspection-points-unearned", {row["code"] for row in plan["findings"]})
        self.assertEqual(inspection["categories"][0]["score"], 68)
        self.assertNotIn("healthScore", plan)

    def test_old_board_is_stale_not_a_new_doctor_grade(self):
        observed = {
            "schema": 1, "generatedAt": (NOW - timedelta(hours=3)).isoformat(),
            "releaseSha": "b" * 40, "categories": [],
        }
        found = SHEPHERD.inspection_differences(observed, "b" * 40, NOW)
        self.assertEqual([item["code"] for item in found], ["inspection-snapshot-stale"])

    def test_invalid_inspection_scores_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "Malformed category score"):
            SHEPHERD.inspection_differences(
                {"schema": 1, "categories": [{"score": 110}]}, None, NOW)

    def test_duplicate_governed_paths_rejected(self):
        row = taxonomy("aoe2-watcher", "docs/a.md")["documents"][0]
        with self.assertRaisesRegex(ValueError, "Duplicate governed"):
            SHEPHERD.taxonomy_differences(
                {"documents": [row, row]}, {"aoe2-watcher": reg("aoe2-watcher", "docs/a.md")}
            )

    def test_clean_local_checkout_is_not_proof_of_remote_parity(self):
        with tempfile.TemporaryDirectory() as td:
            snapshot = SHEPHERD.repository_observation(Path(td), "empty")
            self.assertFalse(snapshot["available"])
        result = SHEPHERD.classify_repository(snapshot)
        self.assertEqual(result[0]["code"], "source-unavailable")

    def test_new_tool_does_not_execute_mutation_or_shell_commands(self):
        text = (SCRIPTS / "aoe2_shepherd.py").read_text()
        self.assertIn('"git", "--no-optional-locks"', text)
        self.assertNotIn("git reset", text)
        self.assertNotIn("git clean", text)
        self.assertNotIn("git push", text)
        self.assertNotIn("subprocess.Popen", text)
        cli = (ROOT / "bin/aoe2war").read_text()
        self.assertIn('SHEPHERD="$BIN_DIR/../scripts/aoe2_shepherd.py"', cli)
        self.assertIn("  shepherd)", cli)


if __name__ == "__main__":
    unittest.main()
