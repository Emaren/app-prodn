"""Adversarial read-only review queue tests; runs in the repository Python inventory."""
from __future__ import annotations

from datetime import date
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "renaissance_docs_review_queue.py"
SPEC = importlib.util.spec_from_file_location("renaissance_docs_review_queue", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
queue = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(queue)


class ReviewQueueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "docs").mkdir()
        self.path = "docs/important.md"
        self.body = b"# Review the real implementation and evidence\n"
        (self.root / self.path).write_bytes(self.body)
        self.row = {
            "path": self.path,
            "status": "active",
            "reviewed_at": "2026-09-22",
            "review_interval_days": 30,
            "title": "Important procedure",
            "owner": "aoe2war-web",
            "authority": "operational-procedure",
            "systems": ["app-prodn", "wolochain"],
            "sha256": hashlib.sha256(self.body).hexdigest(),
        }
        self.registry = {"schema_version": 2, "documents": [self.row]}

    def report(self, day="2026-10-23", within=14):
        return queue.review_queue(self.root, self.registry, as_of=date.fromisoformat(day), within_days=within)

    def test_due_boundary_matches_protected_docs_gate(self):
        today = self.report("2026-10-22")
        self.assertEqual((today["overdue"], today["due_today"]), (0, 1))
        self.assertEqual(today["items"][0]["due_date"], "2026-10-22")
        late = self.report("2026-10-23")
        self.assertEqual((late["overdue"], late["due_today"]), (1, 0))
        self.assertEqual(late["items"][0]["days_to_due"], -1)
        self.assertEqual(late["items"][0]["content_integrity"], "MATCH")

    def test_lookahead_and_historical_exclusions(self):
        self.assertEqual(self.report("2026-10-01", within=14)["items"], [])
        self.assertEqual(self.report("2026-10-08", within=14)["upcoming"], 1)
        self.row["review_interval_days"] = 0
        self.row["status"] = "historical"
        self.assertEqual(self.report()["reviewable_documents"], 0)
        self.assertEqual(self.report()["items"], [])

    def test_content_drift_is_visible_not_silently_approved(self):
        before = (self.root / self.path).read_bytes()
        report = self.report()
        self.assertEqual(report["integrity_issues"], 0)
        self.assertEqual((self.root / self.path).read_bytes(), before)
        (self.root / self.path).write_text("Changed, not resealed")
        changed = self.report()
        self.assertEqual(changed["integrity_issues"], 1)
        self.assertEqual(changed["items"][0]["content_integrity"], "DRIFT")
        self.assertNotEqual(changed["items"][0]["registry_sha256"], changed["items"][0]["actual_sha256"])

    def test_missing_doc_is_not_trusted_as_match(self):
        (self.root / self.path).unlink()
        row = self.report()["items"][0]
        self.assertEqual((row["content_integrity"], row["actual_sha256"]), ("MISSING", None))

    def test_duplicate_and_unsafe_paths_fail_closed(self):
        for bad in ("../secrets", "/etc/passwd", "docs/../secrets", "docs//important.md", "docs\\important.md"):
            self.row["path"] = bad
            with self.subTest(path=bad), self.assertRaises(ValueError):
                self.report()
        self.row["path"] = self.path
        self.registry["documents"].append(dict(self.row))
        with self.assertRaisesRegex(ValueError, "duplicate registry path"):
            self.report()

    def test_malformed_review_metadata_not_cast_to_valid(self):
        for invalid in (True, -1, "30"):
            self.row["review_interval_days"] = invalid
            with self.subTest(value=invalid), self.assertRaises(ValueError):
                self.report()
        self.row["review_interval_days"] = 30
        for invalid in ("2026-9-22", "2026-02-30", None):
            self.row["reviewed_at"] = invalid
            with self.subTest(value=invalid), self.assertRaises(ValueError):
                self.report()

    def test_untrusted_text_does_not_break_markdown_table(self):
        self.row["title"] = "<script>|injected\nheading"
        self.row["owner"] = "operator|editor"
        rendered = queue.render_markdown(self.report())
        self.assertNotIn("<script>", rendered)
        self.assertIn("operator\\|editor", rendered)
        self.assertEqual(rendered.count("\n| 2026-10-22"), 1)
        self.assertIn("Read-only owner-triage aid.", rendered)
        self.assertIn("does_not_authorize_review_renewal", json.dumps(self.report()))

    def test_json_cli_is_read_only_and_reports_drift_exit_code(self):
        registry_path = self.root / "docs/document-registry.json"
        registry_path.write_text(json.dumps(self.registry))
        baseline = registry_path.read_bytes()
        from contextlib import redirect_stdout, redirect_stderr
        from io import StringIO
        out, err = StringIO(), StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            result = queue.main(["--root", str(self.root), "--as-of", "2026-10-23", "--format", "json"])
        self.assertEqual(result, 0, err.getvalue())
        parsed = json.loads(out.getvalue())
        self.assertEqual(parsed["overdue"], 1)
        self.assertIsNone(parsed["source_sha"])
        self.assertEqual(registry_path.read_bytes(), baseline)
        (self.root / self.path).write_text("unresealed")
        with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
            result = queue.main(["--root", str(self.root), "--as-of", "2026-10-23"])
        self.assertEqual(result, 2)
        self.assertEqual(registry_path.read_bytes(), baseline)


if __name__ == "__main__":
    unittest.main()
