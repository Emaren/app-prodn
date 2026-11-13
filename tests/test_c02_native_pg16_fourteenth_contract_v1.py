"""C02 exact 14th migration/journal source and isolated PG16 harness safety."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts/c02_native_pg16_fourteenth_migration_v1.py"
spec=importlib.util.spec_from_file_location("c02_pg16_native_exact",SCRIPT)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class ExactNative14th(unittest.TestCase):
    def test_source_pins_exact_migration_and_finance_journal(self):
        self.assertEqual(hashlib.sha256(m.NATIVE.read_bytes()).hexdigest(),m.NATIVE_SHA)
        self.assertEqual(hashlib.sha256(m.JOURNAL.read_bytes()).hexdigest(),m.JOURNAL_SHA)
        self.assertEqual(m.NATIVE_SHA,
                         "005b6143b69db15586a0562a97f419ad4a35a758cdec3909ff9f46a1b07dc2c3")

    def test_exact_durable_unique_identity_and_immutable_trigger(self):
        sql=m.NATIVE.read_text()
        self.assertIn("claim_id bigint PRIMARY KEY",sql)
        self.assertIn("operation_key varchar(128) NOT NULL UNIQUE",sql)
        self.assertIn("approval_sha256 varchar(64) NOT NULL",sql)
        self.assertIn("c02_immutable_rows",sql)
        self.assertIn("c02_global_chain_tx_once",sql)
        self.assertIn("war_satchel_native_source_admission",sql)
        self.assertIn("C02_AUTHENTICATED_FRESH_WAGER_FUNDING_REQUIRED",sql)
        self.assertIn("receipt_kind IN ('deposit','claim_return','native_return')",sql)

    def test_finance_only_client_is_durable_before_network_post(self):
        src=m.JOURNAL.read_text()
        self.assertIn("FOR SHARE",src)
        self.assertIn("ON CONFLICT DO NOTHING",src)
        self.assertIn("Serializable",src)
        self.assertIn("approval_sha256!==id.approvalSha256",src)
        self.assertIn('hold("durable_attempt_conflict")',src)
        self.assertNotIn("http://127.0.0.1:8092",src)
        self.assertNotIn("http://127.0.0.1:8093",src)

    def test_test_harness_not_production_listener_or_credit(self):
        src=SCRIPT.read_text()
        for required in (
          "listen_addresses=''",
          "temporary_cluster_removed",
          "C02_APP_TRANSPORT",
          "synthetic_only",
          "live_database_accessed",
          "no_real_native_attempts_or_credits",
          "FOR SHARE",
          "RESTRICTED_WORKER",
        ):
          self.assertIn(required if required!="RESTRICTED_WORKER" else "restricted_worker",src)
        self.assertNotIn("127.0.0.1:8092",src)
        self.assertNotIn("127.0.0.1:8093",src)
        self.assertNotIn("http://127.0.0.1:8094",src)
        self.assertNotIn("production_database",src)

    def test_root_denied_without_touching_pg(self):
        with patch.object(m.os,"geteuid",return_value=0):
            with self.assertRaisesRegex(m.Hold,"REFUSE_ROOT_FOR_LOCAL_PG_CLUSTER"):
                m.run()

    def test_tampered_native_migration_denied_before_pg(self):
        with patch.object(m,"NATIVE_SHA", "0"*64):
            with self.assertRaisesRegex(m.Hold,"NATIVE_MIGRATION_BYTES_CHANGED"):
                m.run()

    def test_tampered_journal_source_denied_before_pg(self):
        with patch.object(m,"JOURNAL_SHA", "0"*64):
            with self.assertRaisesRegex(m.Hold,"JOURNAL_SOURCE_BYTES_CHANGED"):
                m.run()

    def test_private_receipt_is_opt_in_and_one_use(self):
        self.assertEqual(m.main([]),3)
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"proof.json"
            Path(folder).chmod(0o755)
            self.assertEqual(m.main(["--receipt",str(path)]),3)
            self.assertFalse(path.exists())
            path.symlink_to("/etc/passwd")
            self.assertEqual(m.main(["--receipt",str(path)]),3)

    def test_unsupported_binary_path_denied_before_bootstrap(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(m.Hold,"PG16_BINARY_DIRECTORY_REQUIRED"):
                m.run(pg_bin=Path(folder))

if __name__=="__main__":
    unittest.main()
