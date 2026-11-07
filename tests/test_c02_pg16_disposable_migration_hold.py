"""C02 byte-pinned PG16 synthetic-only rehearsal: adversarial, no live database."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "c02_pg16_disposable_migration_hold.py"
spec = importlib.util.spec_from_file_location("c02pg16_held", SCRIPT)
held = importlib.util.module_from_spec(spec)
spec.loader.exec_module(held)


class C02Pg16HeldTests(unittest.TestCase):
    def fixture_repo(self):
        folder = tempfile.TemporaryDirectory(prefix="c02-unit-repo-")
        repo = Path(folder.name)
        base = ROOT / "prisma" / "migrations"
        for name, raw in held.catalog(ROOT):
            path = repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(raw)
        return folder, repo

    def test_exact_pinned_original_release_catalog(self):
        entries = held.catalog(ROOT)
        self.assertEqual(len(entries), 13)
        self.assertTrue(all(name.startswith("prisma/migrations/") for name, _ in entries))
        self.assertEqual(entries[0][0].split("/")[-2],
                         "20261014_103500_war_satchel_noncrediting_foundation")
        self.assertEqual(entries[-1][0].split("/")[-2],
                         "20261029_160000_war_satchel_claim_return_execution")
        h = hashlib.sha256()
        for name, sql in entries:
            h.update(name.encode("ascii") + b"\0" + hashlib.sha256(sql).digest())
        self.assertEqual(h.hexdigest(), held.CATALOG_SHA256)
        self.assertNotIn(b"DROP DATABASE", b"\n".join(raw for _, raw in entries))

    def test_changed_migration_byte_refuses_to_claim_release(self):
        folder, repo = self.fixture_repo()
        try:
            first = held.catalog(repo)[0][0]
            path = repo / first
            path.write_bytes(path.read_bytes() + b"\n-- malicious source drift\n")
            with self.assertRaisesRegex(held.Hold, "^PINNED_MIGRATION_BYTES_DRIFT$"):
                held.catalog(repo)
        finally:
            folder.cleanup()

    def test_missing_or_additional_financial_migration_refused(self):
        folder, repo = self.fixture_repo()
        try:
            name = held.catalog(repo)[0][0]
            path = repo / name
            content = path.read_bytes()
            path.unlink()
            with self.assertRaisesRegex(held.Hold, "^MIGRATION_COUNT_DRIFT$"):
                held.catalog(repo)
            path.write_bytes(content)
            extra = repo / "prisma/migrations/20261106_fake_war_satchel/migration.sql"
            extra.parent.mkdir(parents=True)
            extra.write_bytes(b"SELECT 1;\n")
            with self.assertRaisesRegex(held.Hold, "^MIGRATION_COUNT_DRIFT$"):
                held.catalog(repo)
        finally:
            folder.cleanup()

    def test_migration_symlink_refused_not_followed(self):
        folder, repo = self.fixture_repo()
        try:
            name = held.catalog(repo)[0][0]
            path = repo / name
            path.unlink()
            path.symlink_to("/etc/passwd")
            with self.assertRaisesRegex(held.Hold, "^MIGRATION_PATH_UNSAFE$"):
                held.catalog(repo)
        finally:
            folder.cleanup()

    def test_root_can_never_run_disposable_pg16(self):
        with patch.object(held.os, "geteuid", return_value=0):
            with self.assertRaisesRegex(held.Hold, "^REFUSE_ROOT_PG16_TEST$"):
                held.rehearse(ROOT, Path("/tmp/does-not-matter"))

    def test_wrong_pg_binary_directory_fails_closed(self):
        with tempfile.TemporaryDirectory(prefix="c02-missingpg-") as d:
            with self.assertRaisesRegex(held.Hold, "^PG16_BINARY_SET_ABSENT$"):
                held.rehearse(ROOT, Path(d))

    def test_local_process_timeout_is_stop_not_success(self):
        with patch.object(held.subprocess, "run",
                          side_effect=subprocess.TimeoutExpired("initdb", 30)):
            with self.assertRaisesRegex(held.Hold, "^LOCAL_PROCESS_FAILED_CLOSED$"):
                held.checked(["initdb"])

    def test_private_receipt_written_once_mode_0600(self):
        with tempfile.TemporaryDirectory(prefix="c02-private-") as d:
            path = Path(d) / "receipt.json"
            digest = held.restricted_receipt(path, {
                "status": "HOLD", "funded_release_authorized": False,
            })
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), digest)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaisesRegex(held.Hold, "^RECEIPT_WRITE_FAILED$"):
                held.restricted_receipt(path, {"status": "PASS"})

    def test_receipt_world_directory_and_symlink_fail(self):
        with tempfile.TemporaryDirectory(prefix="c02-unsafe-") as d:
            base = Path(d)
            path = base / "receipt.json"
            base.chmod(0o755)
            with self.assertRaisesRegex(held.Hold, "^RECEIPT_DIRECTORY_NOT_PRIVATE$"):
                held.restricted_receipt(path, {"status": "HOLD"})
            base.chmod(0o700)
            path.symlink_to("/etc/passwd")
            with self.assertRaisesRegex(held.Hold, "^RECEIPT_PATH_INVALID$"):
                held.restricted_receipt(path, {"status": "HOLD"})

    def test_only_thirteen_migrations_with_no_spendable_synthetic_rows(self):
        self.assertEqual(held.EXPECTED_COUNT, 13)
        self.assertEqual(held.EXPECTED_TABLES, 29)
        self.assertEqual(held.EXPECTED_TRIGGERS, 53)
        self.assertEqual(held.PORT, "55439")
        self.assertIn(b"CREATE TABLE users", held.FIXTURE)
        self.assertIn(b"VALUES(1,-1)", held.NEGATIVE)
        self.assertIn(b"war_satchel_funded_balances", held.NEGATIVE)
        self.assertIn(b"VALUES(71, false, 5, 10000, 0)", held.POSITIVE_PRODUCT)
        self.assertIn(b"VALUES(72, false, 6, 10000, 0)", held.NEGATIVE_PRODUCT)
        self.assertNotIn(b"INSERT INTO war_satchel", held.FIXTURE)
        self.assertIn(b"tables=", held.CENSUS)
        self.assertIn(b"triggers=", held.CENSUS)

    def test_nonpromoting_cli_rehearsal_returns_three(self):
        with patch.object(held, "rehearse", return_value={
                "schema": held.SCHEMA, "status": "HOLD_SYNTHETIC_ONLY",
                "C02_physically_admitted": False,
                "funded_release_authorized": False}) as verify:
            with patch.object(held, "print", create=True) as out:
                self.assertEqual(held.main([]), 3)
            result = json.loads(out.call_args.args[0])
            self.assertEqual(result["status"], "HOLD_SYNTHETIC_ONLY")
            self.assertIs(result["funded_release_authorized"], False)
            verify.assert_called_once()

    def test_never_exposes_funded_execution_flag(self):
        with self.assertRaises(SystemExit) as err:
            held.main(["--execute"])
        self.assertEqual(err.exception.code, 2)


    def test_postddl_role_probe_rejects_unfenced_finance_tables(self):
        result = lambda stdout=b"", rc=0: subprocess.CompletedProcess(
            ["psql"], rc, stdout, b"")
        before = (b"owner_legacy=29\n"
                  b"table_write=29\nsequence_write=0\nselectable=29\n"
                  b"schema_create=true\nfinance_member=false\n")
        bad_after = (b"owner_legacy=0\n"
                     b"table_write=1\nsequence_write=0\nselectable=29\n"
                     b"schema_create=false\nfinance_member=false\n")
        with patch.object(held, "checked", side_effect=[
                result(), result(before), result(), result(bad_after)]):
            with self.assertRaisesRegex(held.Hold,
                                        "^C02_POSTDDL_MODEL_LEGACY_WRITER_NOT_FENCED$"):
                held.prove_postddl_owner_boundary(["psql"], {"PGHOST": "/tmp/disposable"})

    def test_postddl_role_probe_rejects_unexpected_successful_finance_insert(self):
        result = lambda stdout=b"": subprocess.CompletedProcess(
            ["psql"], 0, stdout, b"")
        before = (b"owner_legacy=29\n"
                  b"table_write=29\nsequence_write=0\nselectable=29\n"
                  b"schema_create=true\nfinance_member=false\n")
        after = (b"owner_legacy=0\n"
                 b"table_write=0\nsequence_write=0\nselectable=29\n"
                 b"schema_create=false\nfinance_member=false\n")
        with patch.object(held, "checked", side_effect=[
                result(), result(before), result(), result(after), result()]):
            with self.assertRaisesRegex(held.Hold, "^C02_LEGACY_INSERT_PERMITTED$"):
                held.prove_postddl_owner_boundary(["psql"], {"PGHOST": "/tmp/disposable"})

    def test_postddl_role_model_does_not_claim_real_financial_fence(self):
        import inspect
        source = inspect.getsource(held.prove_postddl_owner_boundary)
        self.assertIn("CREATE ROLE c02_finance_model NOLOGIN", source)
        self.assertIn("'table_write=0'", source)
        self.assertIn("'live_hd_de_privilege_fence_verified':False", source)
        self.assertIn("'real_migration_executor_verified':False", source)
        self.assertIn("'PGUSER'] = 'c02_legacy_model'", source)


if __name__ == "__main__":
    unittest.main()
