"""C02 actual 13-migration PostgreSQL 16 replay: no real financial authority."""
from __future__ import annotations

import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import c02_real_migration_catalog_replay_hold as replay

ROOT=Path(__file__).resolve().parents[1]
NATIVE_PG=Path("/opt/homebrew/opt/postgresql@16/bin")


class C02NativeCatalogReplayTests(unittest.TestCase):
    def test_default_is_hold_without_native_execution(self):
        out=io.StringIO()
        with contextlib.redirect_stdout(out):
            rc=replay.main([])
        self.assertEqual(rc,3)
        self.assertEqual(json.loads(out.getvalue())["status"],
                         "HOLD_NO_SYNTHETIC_PG16_EXECUTION")

    def test_execution_requires_explicit_source_and_private_receipt(self):
        out=io.StringIO()
        with contextlib.redirect_stdout(out):
            rc=replay.main(["--execute"])
        self.assertEqual(rc,2)
        packet=json.loads(out.getvalue())
        self.assertFalse(packet["c02_gate_closed"])
        self.assertFalse(packet["c09_funded_release_authorized"])

    def test_explicit_wrong_pg_bin_does_not_connect_to_live_database(self):
        with tempfile.TemporaryDirectory(prefix="c02-native-test-") as t:
            out=io.StringIO()
            with contextlib.redirect_stdout(out):
                rc=replay.main(["--execute","--pg-bin",t,
                                "--receipt",str(Path(t)/"private.json")])
            self.assertEqual(rc,2)
            self.assertFalse(json.loads(out.getvalue())["c02_gate_closed"])

    def test_environment_never_inherits_external_db_connection(self):
        with patch.dict(os.environ,{
            "PGHOST":"production.example",
            "PGPORT":"8092",
            "PGPASSWORD":"x",
            "DATABASE_URL":"do-not-use",
            "PGSSLMODE":"verify-full",
            "PGSERVICE":"live-finance",
        }):
            env=replay.only_synthetic_environment(Path("/tmp/private-c02-socket"))
        self.assertEqual(env["PGHOST"],"/tmp/private-c02-socket")
        self.assertEqual(env["PGPORT"],replay.PORT)
        for name in ("DATABASE_URL","PGSERVICE","PGSSLMODE"):
            self.assertNotIn(name,env)
        self.assertEqual(env["PGPASSWORD"],"")

    def test_root_execution_never_spawns_postgres(self):
        with patch.object(replay.os,"geteuid",return_value=0):
            with self.assertRaisesRegex(replay.Hold,"C02_REFUSE_ROOT_PG16"):
                replay.replay(ROOT,NATIVE_PG)

    def test_mismatched_source_root_rejected(self):
        with tempfile.TemporaryDirectory(prefix="c02-root-test-") as t:
            with self.assertRaisesRegex(replay.Hold,
                                        "C02_REPOSITORY_SOURCE_NOT_EXACT"):
                replay.replay(Path(t),NATIVE_PG)

    def test_contains_real_catalog_names_and_protected_negative_checks(self):
        raw=(ROOT/"scripts/c02_real_migration_catalog_replay_hold.py").read_text()
        self.assertIn("DROP INDEX public.",raw)
        self.assertIn("GRANT USAGE ON SEQUENCE",raw)
        self.assertIn("GRANT INSERT ON TABLE",raw)
        self.assertIn("GRANT CREATE ON SCHEMA",raw)
        self.assertIn("listen_addresses=''",raw)
        self.assertIn("PGHOST=str(sock)",raw)
        self.assertIn("ROOT.resolve()",raw)
        self.assertNotIn("wolochaind tx",raw)
        self.assertNotIn("systemctl restart",raw)
        self.assertNotIn("os.system(",raw)

    @unittest.skipUnless(NATIVE_PG.joinpath("initdb").is_file(),
                         "Native PostgreSQL 16 optional Mac-specific physical test")
    def test_real_native_13_migrations_have_source_exact_113_relations(self):
        if os.geteuid()==0:
            self.skipTest("never run disposable database as root")
        with tempfile.TemporaryDirectory(prefix="c02-physical-unit-") as t:
            private=Path(t)
            private.chmod(0o700)
            path=private/"proof.json"
            out=io.StringIO()
            with contextlib.redirect_stdout(out):
                rc=replay.main(["--execute","--pg-bin",str(NATIVE_PG),
                                "--receipt",str(path)])
            self.assertEqual(rc,3)
            data=json.loads(out.getvalue())
            self.assertEqual(data["status"],
                             "PASS_SYNTHETIC_REAL_13_MIGRATIONS_NOT_C02_ACCEPTANCE")
            self.assertEqual(data["observed"]["tables"],29)
            self.assertEqual(data["observed"]["indexes"],76)
            self.assertEqual(data["observed"]["attached_sequences"],8)
            self.assertTrue(data["observed"]["REMOVED_INDEX_stopped"])
            self.assertTrue(data["observed"]["LEGACY_TABLE_INSERT_stopped"])
            self.assertTrue(data["observed"]["LEGACY_SCHEMA_CREATE_stopped"])
            self.assertTrue(data["observed"]["LEGACY_SEQUENCE_USAGE_stopped"])
            self.assertTrue(data["temporary_database_removed"])
            self.assertFalse(data["c02_gate_closed"])
            self.assertFalse(data["c09_funded_release_authorized"])
            self.assertEqual(path.stat().st_mode&0o777,0o600)


if __name__=="__main__":
    unittest.main()
