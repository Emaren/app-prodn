import base64
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import scripts.aoe2_db_snapshot_retention as retention


def exact_row(index: int, *, year: int, month: int, day: int = 15) -> dict:
    release = f"{index + 1:040x}"[-40:]
    digest = f"{index + 1:064x}"[-64:]
    stamp = datetime(year, month, day, 12, 0, tzinfo=timezone.utc).isoformat()
    return {
        "path": f"/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/migration-{index}/pre-migration.dump",
        "relative_path": f"migration-{index}/pre-migration.dump",
        "parent": f"/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/migration-{index}",
        "parent_name": f"migration-{index}",
        "name": "pre-migration.dump",
        "size_bytes": 1000 + index,
        "mtime": stamp,
        "status_receipt_valid": True,
        "migration_shape_exact": True,
        "release_sha": release,
        "declared_sha256": digest,
        "actual_sha256": None,
        "hash_matches_declared": None,
        "migrations": [f"migration_{index}"],
        "external_reference_count": 0,
        "external_reference_examples": [],
    }


class DatabaseSnapshotRetentionTests(unittest.TestCase):
    def test_exact_canonical_migration_shape_classifies_as_boundary(self):
        row = exact_row(1, year=2026, month=9)
        classification, reason = retention.classify_snapshot(row)
        self.assertEqual(classification, "migration-boundary")
        self.assertIn("canonical pre-migration", reason)

    def test_verified_hash_mismatch_fails_closed_to_ambiguous(self):
        row = exact_row(1, year=2026, month=9)
        row["hash_matches_declared"] = False
        classification, reason = retention.classify_snapshot(row)
        self.assertEqual(classification, "legacy-ambiguous")
        self.assertIn("hash does not match", reason)

    def test_financial_and_incident_shapes_are_protected_classes(self):
        financial = exact_row(1, year=2026, month=9)
        financial["migration_shape_exact"] = False
        financial["relative_path"] = "bet-recovery/database.dump"
        financial["parent_name"] = "bet-recovery"
        financial["name"] = "database.dump"

        incident = exact_row(2, year=2026, month=8)
        incident["migration_shape_exact"] = False
        incident["relative_path"] = "incident-202608/database-before.dump"
        incident["parent_name"] = "incident-202608"
        incident["name"] = "database-before.dump"

        self.assertEqual(
            retention.classify_snapshot(financial)[0],
            "financial",
        )
        self.assertEqual(
            retention.classify_snapshot(incident)[0],
            "incident/recovery",
        )

    def test_legacy_unknown_shape_never_becomes_generic_retire_candidate(self):
        row = exact_row(1, year=2024, month=1)
        row["migration_shape_exact"] = False
        row["relative_path"] = "old/database.dump"
        row["parent_name"] = "old"
        row["name"] = "database.dump"
        planned = retention.select_retention([row])
        self.assertEqual(planned[0]["classification"], "legacy-ambiguous")
        self.assertEqual(planned[0]["retention_class"], "PROTECTED_EVIDENCE")
        self.assertFalse(planned[0]["retire_candidate"])

    def test_external_reference_outranks_hot_cold_and_candidate_logic(self):
        row = exact_row(1, year=2026, month=9)
        row["external_reference_count"] = 2
        row["external_reference_examples"] = ["/proof/a.json", "/proof/b.json"]
        planned = retention.select_retention([row])
        self.assertEqual(planned[0]["retention_class"], "PROTECTED_REFERENCE")
        self.assertFalse(planned[0]["retire_candidate"])

    def test_reference_protection_satisfies_same_period_cold_coverage(self):
        rows = [
            exact_row(1, year=2026, month=9, day=20),
            exact_row(2, year=2026, month=9, day=19),
            exact_row(3, year=2026, month=9, day=18),
            exact_row(4, year=2026, month=9, day=17),
            exact_row(5, year=2026, month=9, day=16),
            exact_row(6, year=2026, month=8, day=20),
            exact_row(7, year=2026, month=8, day=19),
        ]
        rows[5]["external_reference_count"] = 1
        rows[5]["external_reference_examples"] = ["/proof/reference.json"]
        planned = retention.select_retention(rows)
        referenced = next(
            row for row in planned if row["path"] == rows[5]["path"]
        )
        older_same_month = next(
            row for row in planned if row["path"] == rows[6]["path"]
        )
        self.assertEqual(
            referenced["retention_class"],
            "PROTECTED_REFERENCE",
        )
        self.assertNotEqual(
            older_same_month["retention_class"],
            "COLD_MONTHLY",
        )

    def test_policy_keeps_hot_weekly_monthly_and_only_then_marks_candidates(self):
        rows = []
        year = 2026
        month = 9
        for i in range(32):
            rows.append(exact_row(i, year=year, month=month, day=15))
            month -= 1
            if month == 0:
                month = 12
                year -= 1

        planned = retention.select_retention(rows)
        summary = retention.summarize(planned)

        self.assertEqual(summary["snapshot_count"], 32)
        self.assertEqual(summary["retention_counts"]["HOT"], 5)
        self.assertLessEqual(
            summary["retention_counts"].get("COLD_WEEKLY", 0),
            retention.policy()["weekly_cold_weeks"],
        )
        self.assertLessEqual(
            summary["retention_counts"].get("COLD_MONTHLY", 0),
            retention.policy()["monthly_cold_months"],
        )
        self.assertGreater(summary["candidate_count"], 0)
        self.assertTrue(
            all(
                row["classification"] == "migration-boundary"
                and row["declared_sha256"]
                and row["external_reference_count"] == 0
                for row in planned
                if row["retire_candidate"]
            )
        )

    def test_canonical_receipt_timestamp_outranks_mutable_file_mtime(self):
        row = exact_row(1, year=2024, month=1)
        row["receipt_timestamp"] = "20260923T120000Z"
        self.assertEqual(
            retention.retention_time(row),
            datetime(2026, 9, 23, 12, 0, tzinfo=timezone.utc),
        )

    def test_remote_inventory_preloads_bounded_metadata_once(self):
        source = retention.REMOTE_INVENTORY
        self.assertIn("metadata_documents = []", source)
        self.assertIn("metadata_documents.append((path, text))", source)
        self.assertIn("for meta, text in metadata_documents:", source)
        self.assertNotIn("for meta in metadata_files:", source)

    def test_read_only_contract_has_no_apply_or_delete_mode(self):
        source = open(retention.__file__, encoding="utf-8").read()
        self.assertIn('"delete_enabled": False', source)
        self.assertIn('"apply": {', source)
        self.assertIn('"available": False', source)
        self.assertNotIn("unlink(", source)
        self.assertNotIn("os.remove(", source)
        self.assertNotIn("shutil.rmtree(", source)

    def test_remote_inventory_fails_closed_when_root_is_missing(self):
        with tempfile.TemporaryDirectory() as td:
            missing = Path(td) / "missing"
            policy = {
                "snapshot_root": str(missing),
                "max_metadata_file_bytes": 2 * 1024 * 1024,
            }
            encoded = base64.urlsafe_b64encode(
                json.dumps(policy).encode("utf-8")
            ).decode("ascii")
            proc = subprocess.run(
                [sys.executable, "-", encoded, "0"],
                input=retention.REMOTE_INVENTORY,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("canonical deploy-receipt root", proc.stderr)

    def test_remote_inventory_rejects_symlinked_status_receipt(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            modern = root / "migration-20260923T120000Z-aaaaaaaaaaaa"
            modern.mkdir()
            dump = modern / "pre-migration.dump"
            dump.write_bytes(b"backup")
            real_status = root / "real-status.txt"
            real_status.write_text(
                "status=APPLIED\n"
                + "release_sha=" + ("a" * 40) + "\n"
                + "dump=pre-migration.dump\n"
                + "dump_sha256=" + hashlib.sha256(dump.read_bytes()).hexdigest() + "\n",
                encoding="utf-8",
            )
            (modern / "migration-status.txt").symlink_to(real_status)
            (modern / "migration-status.txt.sha256").write_text(
                hashlib.sha256(real_status.read_bytes()).hexdigest()
                + "  migration-status.txt\n",
                encoding="utf-8",
            )
            policy = {
                "snapshot_root": str(root),
                "max_metadata_file_bytes": 2 * 1024 * 1024,
            }
            encoded = base64.urlsafe_b64encode(
                json.dumps(policy).encode("utf-8")
            ).decode("ascii")
            proc = subprocess.run(
                [sys.executable, "-", encoded, "0"],
                input=retention.REMOTE_INVENTORY,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        row = json.loads(proc.stdout)["snapshots"][0]
        self.assertFalse(row["status_receipt_valid"])
        self.assertFalse(row["migration_shape_exact"])

    def test_remote_inventory_requires_directory_release_prefix_match(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            modern = root / "migration-20260923T120000Z-bbbbbbbbbbbb"
            modern.mkdir()
            dump = modern / "pre-migration.dump"
            dump.write_bytes(b"backup")
            dump_sha = hashlib.sha256(dump.read_bytes()).hexdigest()
            status = modern / "migration-status.txt"
            status.write_text(
                "\n".join(
                    [
                        "status=APPLIED",
                        "release_sha=" + ("a" * 40),
                        "database=aoe2hdbets",
                        "dump=pre-migration.dump",
                        "dump_sha256=" + dump_sha,
                        "migration=20260923000000_test",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            status_sha = hashlib.sha256(status.read_bytes()).hexdigest()
            (modern / "migration-status.txt.sha256").write_text(
                f"{status_sha}  {status}\\n",
                encoding="utf-8",
            )
            policy = {
                "snapshot_root": str(root),
                "max_metadata_file_bytes": 2 * 1024 * 1024,
            }
            encoded = base64.urlsafe_b64encode(
                json.dumps(policy).encode("utf-8")
            ).decode("ascii")
            proc = subprocess.run(
                [sys.executable, "-", encoded, "0"],
                input=retention.REMOTE_INVENTORY,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        row = json.loads(proc.stdout)["snapshots"][0]
        self.assertTrue(row["status_receipt_valid"])
        self.assertFalse(row["migration_shape_exact"])

    def test_remote_inventory_requires_unique_complete_migration_metadata(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            modern = root / "migration-20260923T120000Z-aaaaaaaaaaaa"
            modern.mkdir()
            dump = modern / "pre-migration.dump"
            dump.write_bytes(b"backup")
            dump_sha = hashlib.sha256(dump.read_bytes()).hexdigest()
            status = modern / "migration-status.txt"
            status.write_text(
                "\n".join(
                    [
                        "status=APPLIED",
                        "release_sha=" + ("a" * 40),
                        "release_sha=" + ("b" * 40),
                        "dump=pre-migration.dump",
                        "dump_sha256=" + dump_sha,
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            status_sha = hashlib.sha256(status.read_bytes()).hexdigest()
            (modern / "migration-status.txt.sha256").write_text(
                f"{status_sha}  {status}\\n",
                encoding="utf-8",
            )
            policy = {
                "snapshot_root": str(root),
                "max_metadata_file_bytes": 2 * 1024 * 1024,
            }
            encoded = base64.urlsafe_b64encode(
                json.dumps(policy).encode("utf-8")
            ).decode("ascii")
            proc = subprocess.run(
                [sys.executable, "-", encoded, "0"],
                input=retention.REMOTE_INVENTORY,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        row = json.loads(proc.stdout)["snapshots"][0]
        self.assertTrue(row["status_receipt_valid"])
        self.assertFalse(row["migration_shape_exact"])
        self.assertIsNone(row["release_sha"])
        self.assertIsNone(row["database"])
        self.assertEqual(row["migrations"], [])

    def test_remote_inventory_rejects_invalid_receipt_timestamp(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            modern = root / "migration-20269999T999999Z-aaaaaaaaaaaa"
            modern.mkdir()
            dump = modern / "pre-migration.dump"
            dump.write_bytes(b"backup")
            dump_sha = hashlib.sha256(dump.read_bytes()).hexdigest()
            status = modern / "migration-status.txt"
            status.write_text(
                "\n".join(
                    [
                        "status=APPLIED",
                        "release_sha=" + ("a" * 40),
                        "database=aoe2hdbets",
                        "dump=pre-migration.dump",
                        "dump_sha256=" + dump_sha,
                        "migration=20260923000000_test",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            status_sha = hashlib.sha256(status.read_bytes()).hexdigest()
            (modern / "migration-status.txt.sha256").write_text(
                f"{status_sha}  {status}\\n",
                encoding="utf-8",
            )
            policy = {
                "snapshot_root": str(root),
                "max_metadata_file_bytes": 2 * 1024 * 1024,
            }
            encoded = base64.urlsafe_b64encode(
                json.dumps(policy).encode("utf-8")
            ).decode("ascii")
            proc = subprocess.run(
                [sys.executable, "-", encoded, "0"],
                input=retention.REMOTE_INVENTORY,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        row = json.loads(proc.stdout)["snapshots"][0]
        self.assertIsNone(row["receipt_timestamp"])
        self.assertFalse(row["migration_shape_exact"])

    def test_default_inventory_does_not_hash_snapshot_bodies(self):
        source = open(retention.__file__, encoding="utf-8").read()
        self.assertIn('verify_hashes = sys.argv[2] == "1"', source)
        self.assertIn("actual_sha = sha256(path) if verify_hashes else None", source)
        self.assertIn("default uses sealed", source)

    def test_remote_inventory_executes_against_historical_shapes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            modern = root / "migration-20260923T120000Z-aaaaaaaaaaaa"
            modern.mkdir()
            dump = modern / "pre-migration.dump"
            dump.write_bytes(b"canonical migration backup")
            dump_sha = hashlib.sha256(dump.read_bytes()).hexdigest()
            status = modern / "migration-status.txt"
            status.write_text(
                "\n".join(
                    [
                        "status=APPLIED",
                        "release_sha=" + ("a" * 40),
                        "database=aoe2hdbets",
                        "dump=pre-migration.dump",
                        "dump_sha256=" + dump_sha,
                        "migration=20260923000000_test",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            status_sha = hashlib.sha256(status.read_bytes()).hexdigest()
            (modern / "migration-status.txt.sha256").write_text(
                f"{status_sha}  {status}\\n",
                encoding="utf-8",
            )

            incident = root / "incident-repair"
            incident.mkdir()
            (incident / "database-before.dump").write_bytes(b"incident")
            financial = root / "bet-recovery"
            financial.mkdir()
            (financial / "database.dump").write_bytes(b"financial")

            policy = {
                "snapshot_root": str(root),
                "max_metadata_file_bytes": 2 * 1024 * 1024,
            }
            encoded = base64.urlsafe_b64encode(
                json.dumps(policy).encode("utf-8")
            ).decode("ascii")
            proc = subprocess.run(
                [sys.executable, "-", encoded, "1"],
                input=retention.REMOTE_INVENTORY,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        rows = {
            row["relative_path"]: row
            for row in payload["snapshots"]
        }
        modern_row = rows[
            "migration-20260923T120000Z-aaaaaaaaaaaa/pre-migration.dump"
        ]
        self.assertTrue(modern_row["migration_shape_exact"])
        self.assertTrue(modern_row["status_receipt_valid"])
        self.assertTrue(modern_row["hash_matches_declared"])
        self.assertEqual(
            modern_row["receipt_timestamp"],
            "20260923T120000Z",
        )

        planned = retention.select_retention(list(rows.values()))
        by_path = {row["relative_path"]: row for row in planned}
        self.assertEqual(
            by_path["incident-repair/database-before.dump"]["classification"],
            "incident/recovery",
        )
        self.assertEqual(
            by_path["bet-recovery/database.dump"]["classification"],
            "financial",
        )
        self.assertFalse(
            by_path["incident-repair/database-before.dump"]["retire_candidate"]
        )
        self.assertFalse(
            by_path["bet-recovery/database.dump"]["retire_candidate"]
        )

    def test_summary_reports_candidate_bytes_without_authorizing_deletion(self):
        hot = exact_row(1, year=2026, month=9)
        protected = exact_row(2, year=2025, month=9)
        protected["migration_shape_exact"] = False
        protected["relative_path"] = "incident/database-before.dump"
        protected["parent_name"] = "incident"
        protected["name"] = "database-before.dump"
        rows = retention.select_retention([hot, protected])
        summary = retention.summarize(rows)
        self.assertEqual(summary["snapshot_count"], 2)
        self.assertEqual(summary["candidate_count"], 0)
        self.assertEqual(summary["ambiguous_count"], 0)
        self.assertEqual(
            summary["classification_counts"]["incident/recovery"],
            1,
        )


if __name__ == "__main__":
    unittest.main()
