import base64
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
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


def canonical_receipt(
    root: Path,
    *,
    stamp: str,
    release: str = "a" * 40,
    migrations: list[str] | None = None,
) -> Path:
    migrations = migrations or ["20260923000000_test"]
    parent = root / f"migration-{stamp}-{release[:12]}"
    parent.mkdir()
    dump = parent / "pre-migration.dump"
    dump.write_bytes(f"backup-{stamp}".encode("utf-8"))
    status = parent / "migration-status.txt"
    status.write_text(
        "\n".join(
            [
                "status=APPLIED",
                f"release_sha={release}",
                "database=aoe2hdbets",
                "dump=pre-migration.dump",
                "dump_sha256=" + hashlib.sha256(dump.read_bytes()).hexdigest(),
                *[f"migration={name}" for name in migrations],
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    status_sha = hashlib.sha256(status.read_bytes()).hexdigest()
    (parent / "migration-status.txt.sha256").write_text(
        f"{status_sha}  {status}\n",
        encoding="utf-8",
    )
    return parent


def run_remote_inventory(
    root: Path,
    *,
    verify_hashes: bool = False,
    output_path: Path | None = None,
):
    policy = {
        "snapshot_root": str(root),
        "max_metadata_file_bytes": 2 * 1024 * 1024,
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(policy).encode("utf-8")
    ).decode("ascii")
    args = [sys.executable, "-", encoded, "1" if verify_hashes else "0"]
    if output_path is not None:
        args.append(str(output_path))
    return subprocess.run(
        args,
        input=retention.REMOTE_INVENTORY,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


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

    def test_incomplete_reference_census_never_emits_retire_candidate(self):
        rows = []
        year = 2026
        month = 9
        for i in range(32):
            rows.append(exact_row(i, year=year, month=month, day=15))
            month -= 1
            if month == 0:
                month = 12
                year -= 1

        planned = retention.select_retention(
            rows,
            reference_scan_complete=False,
        )
        self.assertFalse(any(row["retire_candidate"] for row in planned))
        self.assertGreater(
            sum(
                row["retention_class"] == "PROTECTED_REFERENCE_CENSUS"
                for row in planned
            ),
            0,
        )

    def test_collect_missing_reference_census_field_fails_closed(self):
        rows = []
        year = 2026
        month = 9
        for i in range(32):
            rows.append(exact_row(i, year=year, month=month, day=15))
            month -= 1
            if month == 0:
                month = 12
                year -= 1

        with mock.patch.object(
            retention,
            "remote_inventory",
            return_value={"snapshots": rows},
        ):
            payload = retention.collect()

        self.assertFalse(payload["reference_census"]["complete"])
        self.assertEqual(payload["summary"]["candidate_count"], 0)
        self.assertIn(
            "PROTECTED_REFERENCE_CENSUS",
            payload["summary"]["retention_counts"],
        )

    def test_collect_contradictory_complete_census_with_blockers_fails_closed(self):
        rows = []
        year = 2026
        month = 9
        for i in range(32):
            rows.append(exact_row(i, year=year, month=month, day=15))
            month -= 1
            if month == 0:
                month = 12
                year -= 1

        inventory = {
            "snapshots": rows,
            "reference_scan_complete": True,
            "reference_scan_files": 4,
            "reference_scan_bytes": 1024,
            "reference_scan_blocker_count": 1,
            "reference_scan_blockers": ["contradictory-proof"],
        }
        with mock.patch.object(
            retention,
            "remote_inventory",
            return_value=inventory,
        ):
            payload = retention.collect()

        self.assertFalse(payload["reference_census"]["complete"])
        self.assertEqual(payload["reference_census"]["blocker_count"], 1)
        self.assertEqual(payload["summary"]["candidate_count"], 0)
        self.assertIn(
            "PROTECTED_REFERENCE_CENSUS",
            payload["summary"]["retention_counts"],
        )

    def test_collect_invalid_reference_scan_counters_fail_closed(self):
        row = exact_row(1, year=2026, month=9)
        inventory = {
            "snapshots": [row],
            "reference_scan_complete": True,
            "reference_scan_files": -1,
            "reference_scan_bytes": "unknown",
            "reference_scan_blocker_count": 0,
            "reference_scan_blockers": [],
        }
        with mock.patch.object(
            retention,
            "remote_inventory",
            return_value=inventory,
        ):
            payload = retention.collect()

        self.assertFalse(payload["reference_census"]["complete"])
        self.assertEqual(payload["reference_census"]["files_scanned"], 0)
        self.assertEqual(payload["reference_census"]["bytes_scanned"], 0)

    def test_remote_reference_census_reports_unreadable_metadata_root(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "receipts"
            root.mkdir()
            canonical_receipt(root, stamp="20260923T120000Z")
            missing_meta = Path(td) / "missing-os-control"
            source = retention.REMOTE_INVENTORY.replace(
                'Path("/mnt/HC_Volume_105319120/aoe2war/os-control")',
                f"Path({str(missing_meta)!r})",
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
                input=source,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        self.assertFalse(payload["reference_scan_complete"])
        self.assertGreater(payload["reference_scan_blocker_count"], 0)
        self.assertTrue(
            any(
                str(missing_meta) in blocker
                for blocker in payload["reference_scan_blockers"]
            )
        )

    def test_remote_reference_census_reports_oversize_metadata(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "receipts"
            root.mkdir()
            canonical_receipt(root, stamp="20260923T120000Z")
            meta = Path(td) / "os-control"
            meta.mkdir()
            (meta / "oversize.json").write_text(
                "x" * 4097,
                encoding="utf-8",
            )
            source = retention.REMOTE_INVENTORY.replace(
                'Path("/mnt/HC_Volume_105319120/aoe2war/os-control")',
                f"Path({str(meta)!r})",
            )
            policy = {
                "snapshot_root": str(root),
                "max_metadata_file_bytes": 4096,
            }
            encoded = base64.urlsafe_b64encode(
                json.dumps(policy).encode("utf-8")
            ).decode("ascii")
            proc = subprocess.run(
                [sys.executable, "-", encoded, "0"],
                input=source,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        self.assertFalse(payload["reference_scan_complete"])
        self.assertTrue(
            any(
                blocker.startswith("metadata-file-oversize:")
                for blocker in payload["reference_scan_blockers"]
            )
        )

    def test_remote_reference_census_matches_digest_only_reference(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "receipts"
            root.mkdir()
            parent = canonical_receipt(root, stamp="20260923T120000Z")
            status = parent / "migration-status.txt"
            declared = next(
                line.split("=", 1)[1]
                for line in status.read_text(encoding="utf-8").splitlines()
                if line.startswith("dump_sha256=")
            )

            meta = Path(td) / "os-control"
            meta.mkdir()
            proof = meta / "activation-proof.json"
            proof.write_text(
                json.dumps({"database_snapshot_sha256": declared}) + "\n",
                encoding="utf-8",
            )
            source = retention.REMOTE_INVENTORY.replace(
                'Path("/mnt/HC_Volume_105319120/aoe2war/os-control")',
                f"Path({str(meta)!r})",
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
                input=source,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        self.assertTrue(payload["reference_scan_complete"])
        self.assertEqual(len(payload["snapshots"]), 1)
        row = payload["snapshots"][0]
        self.assertEqual(row["external_reference_count"], 1)
        self.assertEqual(row["external_reference_examples"], [str(proof)])
        planned = retention.select_retention(payload["snapshots"])
        self.assertEqual(
            planned[0]["retention_class"],
            "PROTECTED_REFERENCE",
        )
        self.assertFalse(planned[0]["retire_candidate"])

    def test_remote_reference_census_bounds_blocker_evidence_memory(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "receipts"
            root.mkdir()
            canonical_receipt(root, stamp="20260923T120000Z")
            meta = Path(td) / "os-control"
            meta.mkdir()
            for index in range(150):
                (meta / f"oversize-{index:03d}.json").write_text(
                    "x" * 4097,
                    encoding="utf-8",
                )
            source = retention.REMOTE_INVENTORY.replace(
                'Path("/mnt/HC_Volume_105319120/aoe2war/os-control")',
                f"Path({str(meta)!r})",
            )
            policy = {
                "snapshot_root": str(root),
                "max_metadata_file_bytes": 4096,
            }
            encoded = base64.urlsafe_b64encode(
                json.dumps(policy).encode("utf-8")
            ).decode("ascii")
            proc = subprocess.run(
                [sys.executable, "-", encoded, "0"],
                input=source,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        self.assertFalse(payload["reference_scan_complete"])
        self.assertEqual(payload["reference_scan_blocker_count"], 150)
        self.assertEqual(len(payload["reference_scan_blockers"]), 100)

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

    def test_read_only_contract_has_no_apply_or_snapshot_delete_mode(self):
        source = open(retention.__file__, encoding="utf-8").read()
        self.assertIn('"delete_enabled": False', source)
        self.assertIn('"apply": {', source)
        self.assertIn('"available": False', source)
        self.assertNotIn('sub.add_parser("apply")', source)
        self.assertNotIn('sub.add_parser("delete")', source)
        self.assertNotIn("shutil.rmtree(", source)
        self.assertNotIn("os.remove(", source)
        # The governed full-body verifier may delete only its own /tmp result.
        self.assertIn("output.unlink(missing_ok=True)", source)

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
                f"{status_sha}  {status}\n",
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
                f"{status_sha}  {status}\n",
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
                f"{status_sha}  {status}\n",
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

    def test_remote_inventory_requires_exact_sidecar_path(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            parent = canonical_receipt(
                root,
                stamp="20260923T120000Z",
            )
            status = parent / "migration-status.txt"
            sidecar = parent / "migration-status.txt.sha256"
            digest = hashlib.sha256(status.read_bytes()).hexdigest()
            sidecar.write_text(
                f"{digest}  migration-status.txt\n",
                encoding="utf-8",
            )
            proc = run_remote_inventory(root)

        self.assertEqual(proc.returncode, 0, proc.stderr)
        row = json.loads(proc.stdout)["snapshots"][0]
        self.assertFalse(row["status_receipt_valid"])
        self.assertFalse(row["migration_shape_exact"])

    def test_remote_inventory_rejects_duplicate_migration_fields(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            canonical_receipt(
                root,
                stamp="20260923T120000Z",
                migrations=[
                    "20260923000000_test",
                    "20260923000000_test",
                ],
            )
            proc = run_remote_inventory(root)

        self.assertEqual(proc.returncode, 0, proc.stderr)
        row = json.loads(proc.stdout)["snapshots"][0]
        self.assertTrue(row["status_receipt_valid"])
        self.assertFalse(row["migration_shape_exact"])

    def test_remote_inventory_protects_duplicate_receipts_for_same_release(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            canonical_receipt(root, stamp="20260923T120000Z")
            canonical_receipt(root, stamp="20260923T120100Z")
            proc = run_remote_inventory(root)

        self.assertEqual(proc.returncode, 0, proc.stderr)
        rows = json.loads(proc.stdout)["snapshots"]
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row["release_receipt_count"] == 2 for row in rows))
        self.assertTrue(all(not row["migration_shape_exact"] for row in rows))
        self.assertTrue(all(row["receipt_ambiguity"] for row in rows))
        planned = retention.select_retention(rows)
        self.assertTrue(
            all(row["classification"] == "legacy-ambiguous" for row in planned)
        )
        self.assertTrue(
            all(row["retention_class"] == "PROTECTED_EVIDENCE" for row in planned)
        )
        self.assertTrue(all(not row["retire_candidate"] for row in planned))

    def test_remote_inventory_protects_canonical_receipt_when_malformed_sibling_shares_release_prefix(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            release = "a" * 40
            canonical_receipt(
                root,
                stamp="20260923T120000Z",
                release=release,
            )
            # The protected activation verifier considers every direct
            # migration-*-<release12> entry before trusting receipt contents.
            # A malformed sibling therefore makes the release receipt
            # ambiguous even though this sibling contains no snapshot body.
            malformed = root / f"migration-garbage-{release[:12]}"
            malformed.mkdir()
            proc = run_remote_inventory(root)

        self.assertEqual(proc.returncode, 0, proc.stderr)
        rows = json.loads(proc.stdout)["snapshots"]
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["release_receipt_count"], 2)
        self.assertTrue(row["receipt_ambiguity"])
        self.assertFalse(row["migration_shape_exact"])
        planned = retention.select_retention(rows)
        self.assertEqual(planned[0]["classification"], "legacy-ambiguous")
        self.assertEqual(planned[0]["retention_class"], "PROTECTED_EVIDENCE")
        self.assertFalse(planned[0]["retire_candidate"])

    def test_remote_inventory_rejects_malformed_status_line_even_with_valid_sidecar(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            parent = canonical_receipt(root, stamp="20260923T120000Z")
            status = parent / "migration-status.txt"
            status.write_text(
                status.read_text(encoding="utf-8") + "MALFORMED_LINE\n",
                encoding="utf-8",
            )
            digest = hashlib.sha256(status.read_bytes()).hexdigest()
            (parent / "migration-status.txt.sha256").write_text(
                f"{digest}  {status}\n",
                encoding="utf-8",
            )
            proc = run_remote_inventory(root)

        self.assertEqual(proc.returncode, 0, proc.stderr)
        row = json.loads(proc.stdout)["snapshots"][0]
        self.assertFalse(row["status_syntax_valid"])
        self.assertFalse(row["status_receipt_valid"])
        self.assertFalse(row["migration_shape_exact"])
        planned = retention.select_retention([row])
        self.assertEqual(planned[0]["classification"], "legacy-ambiguous")
        self.assertFalse(planned[0]["retire_candidate"])

    def test_remote_inventory_rejects_empty_migration_row_even_with_valid_migration(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            parent = canonical_receipt(root, stamp="20260923T120000Z")
            status = parent / "migration-status.txt"
            status.write_text(
                status.read_text(encoding="utf-8") + "migration=\n",
                encoding="utf-8",
            )
            digest = hashlib.sha256(status.read_bytes()).hexdigest()
            (parent / "migration-status.txt.sha256").write_text(
                f"{digest}  {status}\n",
                encoding="utf-8",
            )
            proc = run_remote_inventory(root)

        self.assertEqual(proc.returncode, 0, proc.stderr)
        row = json.loads(proc.stdout)["snapshots"][0]
        self.assertFalse(row["status_syntax_valid"])
        self.assertFalse(row["status_receipt_valid"])
        self.assertFalse(row["migration_shape_exact"])

    def test_remote_inventory_rejects_status_larger_than_activation_limit(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            parent = canonical_receipt(root, stamp="20260923T120000Z")
            status = parent / "migration-status.txt"
            status.write_text(
                status.read_text(encoding="utf-8")
                + ("note=" + ("x" * (257 * 1024)) + "\n"),
                encoding="utf-8",
            )
            digest = hashlib.sha256(status.read_bytes()).hexdigest()
            (parent / "migration-status.txt.sha256").write_text(
                f"{digest}  {status}\n",
                encoding="utf-8",
            )
            proc = run_remote_inventory(root)

        self.assertEqual(proc.returncode, 0, proc.stderr)
        row = json.loads(proc.stdout)["snapshots"][0]
        self.assertFalse(row["status_receipt_valid"])
        self.assertFalse(row["migration_shape_exact"])

    def test_remote_inventory_rejects_empty_pre_migration_dump(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            parent = canonical_receipt(root, stamp="20260923T120000Z")
            dump = parent / "pre-migration.dump"
            dump.write_bytes(b"")
            status = parent / "migration-status.txt"
            lines = [
                line
                for line in status.read_text(encoding="utf-8").splitlines()
                if not line.startswith("dump_sha256=")
            ]
            lines.append("dump_sha256=" + hashlib.sha256(b"").hexdigest())
            status.write_text("\n".join(lines) + "\n", encoding="utf-8")
            digest = hashlib.sha256(status.read_bytes()).hexdigest()
            (parent / "migration-status.txt.sha256").write_text(
                f"{digest}  {status}\n",
                encoding="utf-8",
            )
            proc = run_remote_inventory(root, verify_hashes=True)

        self.assertEqual(proc.returncode, 0, proc.stderr)
        row = json.loads(proc.stdout)["snapshots"][0]
        self.assertTrue(row["status_receipt_valid"])
        self.assertTrue(row["hash_matches_declared"])
        self.assertFalse(row["migration_shape_exact"])

    def test_remote_inventory_invalid_utf8_status_is_not_canonical(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            parent = canonical_receipt(root, stamp="20260923T120000Z")
            status = parent / "migration-status.txt"
            status.write_bytes(status.read_bytes() + b"\xff\xfe")
            digest = hashlib.sha256(status.read_bytes()).hexdigest()
            (parent / "migration-status.txt.sha256").write_text(
                f"{digest}  {status}\n",
                encoding="utf-8",
            )
            proc = run_remote_inventory(root)

        self.assertEqual(proc.returncode, 0, proc.stderr)
        row = json.loads(proc.stdout)["snapshots"][0]
        self.assertFalse(row["status_receipt_valid"])
        self.assertFalse(row["migration_shape_exact"])

    def test_remote_inventory_governed_output_path_is_exact_and_private(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            canonical_receipt(root, stamp="20260923T120000Z")
            suffix = hashlib.sha256(str(root).encode("utf-8")).hexdigest()[:32]
            output = Path("/tmp") / (
                f"aoe2war-db-snapshot-verify-{suffix}.json"
            )
            output.unlink(missing_ok=True)
            try:
                proc = run_remote_inventory(
                    root,
                    verify_hashes=True,
                    output_path=output,
                )
                self.assertEqual(proc.returncode, 0, proc.stderr)
                self.assertEqual(proc.stdout, "")
                self.assertTrue(output.is_file())
                self.assertEqual(output.stat().st_mode & 0o777, 0o400)
                payload = json.loads(output.read_text(encoding="utf-8"))
                self.assertTrue(payload["verify_hashes"])
                self.assertEqual(
                    payload["kind"],
                    "aoe2war-db-snapshot-inventory",
                )
            finally:
                output.unlink(missing_ok=True)

    def test_governed_verify_result_marker_is_exact_and_validated(self):
        payload = {
            "kind": "aoe2war-db-snapshot-inventory",
            "verify_hashes": True,
            "snapshots": [],
        }
        raw = json.dumps(payload).encode("utf-8")
        marker = (
            "maintenance preflight\n"
            "AOE2WAR_DB_SNAPSHOT_VERIFY_RESULT="
            + base64.urlsafe_b64encode(raw).decode("ascii")
            + "\nmaintenance postcheck\n"
        )
        self.assertEqual(
            retention.decode_governed_verify_output(marker),
            payload,
        )
        with self.assertRaises(retention.SnapshotRetentionError):
            retention.decode_governed_verify_output("maintenance only\n")

    def test_governed_verify_helper_uses_root_owned_private_runtime_path(self):
        payload = {
            "kind": "aoe2war-db-snapshot-inventory",
            "verify_hashes": True,
            "snapshots": [],
        }
        raw = json.dumps(payload, sort_keys=True).encode("utf-8")
        completed = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=(
                "AOE2WAR_DB_SNAPSHOT_VERIFY_RESULT="
                + base64.urlsafe_b64encode(raw).decode("ascii")
                + "\n"
            ),
            stderr="",
        )
        policy = {
            "root_maintenance_host": "root@hel1",
        }
        with mock.patch.object(
            retention.subprocess,
            "run",
            return_value=completed,
        ) as run:
            self.assertEqual(
                retention.governed_remote_inventory(policy, "encoded"),
                payload,
            )

        remote = run.call_args.kwargs["input"]
        self.assertIn(
            'helper_root = Path("/run/aoe2war-db-snapshot-verify")',
            remote,
        )
        self.assertIn("root_stat.st_uid != 0", remote)
        self.assertIn("tool_stat.st_uid != 0", remote)
        self.assertIn('getattr(os, "O_NOFOLLOW", 0)', remote)
        self.assertNotIn(
            'tool = Path("/tmp") / ("aoe2war-db-snapshot-inventory-"',
            remote,
        )

    def test_full_body_verify_uses_wolo_safe_maintenance_governor(self):
        source = open(retention.__file__, encoding="utf-8").read()
        self.assertIn('"/usr/local/sbin/aoe2war-maintenance-run"', source)
        self.assertIn('"db-snapshot-verify"', source)
        self.assertIn('"root_maintenance_host"', source)
        self.assertIn("if verify_hashes:", source)
        self.assertIn("return governed_remote_inventory(p, encoded)", source)
        self.assertIn(
            '"AOE2WAR_DB_SNAPSHOT_VERIFY_RESULT="',
            source,
        )

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
                f"{status_sha}  {status}\n",
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
