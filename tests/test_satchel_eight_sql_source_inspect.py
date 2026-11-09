"""Fail-closed source-only tests for held 8-file Satchel SQL provenance."""
from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts.satchel_eight_sql_source_inspect import (
    EXPECTED_MIGRATIONS,
    inspect,
)


ROOT = Path(__file__).resolve().parents[1]


class SatchelEightSqlSourceInspectorTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="satchel-sql-source-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.base = self.root / "prisma" / "migrations"
        for name, _ in EXPECTED_MIGRATIONS:
            from_path = ROOT / "prisma" / "migrations" / name / "migration.sql"
            to_path = self.base / name / "migration.sql"
            to_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(from_path, to_path)

    def test_review_qualifies_only_exact_bytes_not_production_release(self):
        report = inspect(self.root)
        self.assertEqual(report["status"], "EXACT_SQL_REVIEW_ONLY")
        self.assertEqual(len(report["migrations"]), 8)
        self.assertTrue(report["all_eight_migration_bytes_match"])
        self.assertFalse(report["production_database_read"])
        self.assertFalse(report["database_modified"])
        self.assertFalse(report["approved_for_generic_additive_release"])
        self.assertFalse(report["financial_migration_receipt_present"])
        self.assertFalse(report["financial_release_authorized"])
        self.assertFalse(report["wolo_signing_or_broadcast"])

    def test_modified_financial_sql_fails_closed(self):
        target = self.base / EXPECTED_MIGRATIONS[1][0] / "migration.sql"
        target.write_bytes(target.read_bytes() + b"\n-- unauthorized source change\n")
        report = inspect(self.root)
        self.assertEqual(report["status"], "STOP_SOURCE_DRIFT")
        self.assertFalse(report["all_eight_migration_bytes_match"])
        self.assertEqual(
            len([row for row in report["migrations"] if not row["exact_match"]]), 1
        )

    def test_missing_migration_fails_closed(self):
        (self.base / EXPECTED_MIGRATIONS[2][0] / "migration.sql").unlink()
        report = inspect(self.root)
        self.assertEqual(report["status"], "STOP_SOURCE_DRIFT")
        self.assertFalse(report["all_eight_migration_bytes_match"])

    def test_symlink_migration_fails_closed(self):
        target = self.base / EXPECTED_MIGRATIONS[0][0] / "migration.sql"
        moved = self.root / "saved-original.sql"
        target.rename(moved)
        target.symlink_to(moved)
        report = inspect(self.root)
        self.assertEqual(report["status"], "STOP_SOURCE_DRIFT")
        self.assertFalse(report["all_eight_migration_bytes_match"])

    def test_report_contains_no_sql_or_database_credentials(self):
        result = json.dumps(inspect(self.root))
        self.assertNotIn("CREATE TABLE", result)
        self.assertNotIn("DATABASE_URL", result)
        self.assertNotIn("jdbc:", result)


if __name__ == "__main__":
    unittest.main()
