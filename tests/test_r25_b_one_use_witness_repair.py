#!/usr/bin/env python3
"""Adversarial mock-only tests: never contact HEL1 or production filesystem."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "scripts" / "r25_b_one_use_witness_repair_root.py"
spec = importlib.util.spec_from_file_location("b_witness_repair", path)
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


class TestBOneUseWitnessRepair(unittest.TestCase):
    def test_contract_exact_historical_and_new_pins(self):
        self.assertEqual(b.NEW_SHA, "edf1b42ea7cc8001da83d7076d8aa08f924860fd9a40f97431e60ad8528a30dc")
        self.assertEqual(b.OLD_SHA, "de8981ba8c79c276a1ddd1b6c89efea0eaff8d9f11bd1514a724deacde6fc86a")
        self.assertEqual(b.INSTALL_SHA, "41be908123b5f13e349b3ad093ebea7a7908149c9c646041969556d3e0cc1cd2")
        self.assertEqual(b.GUARD_SHA, "dead2815b3f20b311ede29dfd99086cbb81dfd6a73f1a71f2b7b57ccd74e809d")
        self.assertEqual(b.EXPECTED_UID, 993)
        self.assertEqual(b.CONSENT, "REPAIR-R25-B-WITNESS-ONLY-87d340314e46")
        self.assertNotEqual(b.CONSENT, "INSTALL-R25-B-NEW-ONLY-87d340314e46")
        new = (ROOT / "scripts" / "r25_b_host_witness.py").read_bytes()
        self.assertEqual(len(new), 22062)
        self.assertEqual(hashlib.sha256(new).hexdigest(), b.NEW_SHA)
        self.assertEqual(b.new_witness(new).TARGET, "0cee3c836c4b0760478280c145e02e81e470ce0e")

    def test_old_receipt_cannot_be_implicitly_rewritten_or_replayed(self):
        import inspect
        code = inspect.getsource(b.repair)
        self.assertNotIn("write_new(RECEIPT", code)
        self.assertNotIn("write_new(STARTED", code)
        self.assertNotIn("unlink(", code)
        self.assertNotIn("systemctl", code)
        self.assertIn("os.replace(staging, OLD)", code)
        self.assertIn("os.O_EXCL", inspect.getsource(b.write_new))
        self.assertLess(code.index("fsync_directory(JOURNAL)"), code.index("os.replace(staging, OLD)"))
        self.assertLess(code.index("fsync_directory(OLD.parent)  # stage"), code.index("os.replace(staging, OLD)"))
        self.assertIn("JOURNAL.exists()", code)
        self.assertIn("original_receipt()", inspect.getsource(b.host_admission))
        self.assertIn("w.db_proof(", inspect.getsource(b.host_admission))
        self.assertIn("w.nft_policy(", inspect.getsource(b.host_admission))

    def test_unknown_or_replayed_consent_fails_before_host_transaction(self):
        with patch.object(b.sys, "argv", ["repair", "--phase", "repair", "--consent", "INSTALL-R25-B-NEW-ONLY-87d340314e46"]):
            with patch.object(b, "host_admission") as adm:
                self.assertEqual(b.main(), 2)
                adm.assert_not_called()

    def test_old_journal_requires_exact_receipt_and_status(self):
        started = {"schema": "aoe2war.r25.b.additive-3031-setup.v1",
                   "status": "INSTALL_STARTED_NOT_CERTIFIED",
                   "source_commit": b.SOURCE_COMMIT, "old_web_pid": 2625090,
                   "database_name": "aoe2hd_db", "no_retry_without_independent_repair": True}
        receipt = {"schema": started["schema"], "status": "PASS_B_NEW_ONLY_SETUP_NOT_RUNTIME_OR_CUTOVER",
                   "source_commit": b.SOURCE_COMMIT, "old_web_mainpid": 2625090,
                   "uid": 993, "unit": b.UNIT, "database_name": "aoe2hd_db",
                   "db_role": "aoe2war_r25_web_ro", "report_sha256": b.INSTALL_SHA,
                   "new_guard_sha256": b.GUARD_SHA, "new_witness_sha256": b.OLD_SHA,
                   "new_dropin_sha256": b.DROPIN_SHA, "new_baseunit_sha256": b.BASE_SHA,
                   "candidate_started": False, "financial_authorized": False,
                   "public_cutover_authorized": False, "secret_values_disclosed": False}
        with patch.object(b, "json_root", side_effect=[started, receipt]), \
             patch.object(b, "canonical_sha", return_value=b.INSTALL_SHA), \
             patch.object(b, "trusted", return_value=b"root-original-receipts"):
            self.assertEqual(len(b.original_receipt()), 2)
        for key, value in [
            ("uid", 1000), ("old_web_mainpid", 1),
            ("new_guard_sha256", "bad"), ("new_witness_sha256", b.NEW_SHA),
            ("candidate_started", True), ("financial_authorized", True),
            ("public_cutover_authorized", True), ("secret_values_disclosed", True)
        ]:
            with self.subTest(key=key), \
                 patch.object(b, "json_root", side_effect=[started, {**receipt, key: value}]), \
                 patch.object(b, "canonical_sha", return_value=b.INSTALL_SHA):
                with self.assertRaisesRegex(RuntimeError, "ORIGINAL_INSTALL_RECEIPT_DRIFT"):
                    b.original_receipt()
        with patch.object(b, "json_root", side_effect=[{**started, "status": "BAD"}, receipt]):
            with self.assertRaisesRegex(RuntimeError, "ORIGINAL_STARTED_JOURNAL_DRIFT"):
                b.original_receipt()

    def test_file_trust_rejects_symlink_or_nonroot_mutable_parent(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "file"
            f.write_bytes(b"x")
            with self.assertRaisesRegex(RuntimeError, "UNTRUSTED_ROOT_PATH"):
                b.trusted(f)
            link = Path(tmp) / "link"
            link.symlink_to(f)
            with self.assertRaisesRegex(RuntimeError, "UNTRUSTED_ROOT_PATH"):
                b.trusted(link)

    def test_no_listener_accepts_both_ip_families_only_when_3031_free(self):
        with tempfile.TemporaryDirectory() as tmp:
            one = Path(tmp) / "tcp"
            two = Path(tmp) / "tcp6"
            one.write_text("header\n 0: 0100007F:0BD7 00000000:0000 0A 0 0 0 1\n")
            two.write_text("header\n")
            real = b.Path
            def mapper(s):
                if str(s) == "/proc/net/tcp":
                    return one
                if str(s) == "/proc/net/tcp6":
                    return two
                return real(s)
            with patch.object(b, "Path", side_effect=mapper):
                with self.assertRaisesRegex(RuntimeError, "3031_LISTENER_PRESENT"):
                    b.port_free()
                one.write_text("header\n")
                b.port_free()
                two.write_text("header\n 0: 00000000000000000000000001000000:0BD7 00000000000000000000000000000000:0000 0A 0 0 0 1\n")
                with self.assertRaisesRegex(RuntimeError, "3031_LISTENER_PRESENT"):
                    b.port_free()

    def test_atomic_only_witness_repair_and_one_use_backup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dest = root / "approved-runtime-prestart.py"
            dest.write_bytes(b"old-b-bytes")
            dest.chmod(0o644)
            setup = root / "existing-setup"
            setup.mkdir()
            repair = setup / "witness-repair-v1"
            # Never touch host state; admission is independently tested above.
            fake_trusted = lambda p, **kw: Path(p).read_bytes()
            new = b"new-w-bytes"
            with patch.object(b, "OLD", dest), patch.object(b, "JOURNAL", repair), \
                 patch.object(b, "SETUP", setup), \
                 patch.object(b, "OLD_SHA", hashlib.sha256(b"old-b-bytes").hexdigest()), \
                 patch.object(b, "NEW_SHA", hashlib.sha256(new).hexdigest()), \
                 patch.object(b, "trusted", side_effect=fake_trusted), \
                 patch.object(b, "host_admission", return_value=(hashlib.sha256(b"started").hexdigest(), hashlib.sha256(b"receipt").hexdigest())), \
                 patch.object(b, "STARTED", setup / "started.json"), \
                 patch.object(b, "RECEIPT", setup / "receipt.json"):
                (setup / "started.json").write_bytes(b"started")
                (setup / "receipt.json").write_bytes(b"receipt")
                # Recheck original inputs during the repair's post-rename guard.
                with patch.object(b, "sha", wraps=b.sha):
                    out = b.repair(None, new)
                self.assertEqual(out["status"], "WITNESS_ONLY_REPAIR_COMPLETE_NOT_PRESTART_AUTHORITY")
                self.assertEqual(dest.read_bytes(), new)
                self.assertEqual((repair / "old-witness.py").read_bytes(), b"old-b-bytes")
                self.assertEqual((setup / "started.json").read_bytes(), b"started")
                self.assertEqual((setup / "receipt.json").read_bytes(), b"receipt")
                self.assertTrue((repair / "receipt.json").is_file())
                with self.assertRaisesRegex(RuntimeError, "REPAIR_ALREADY_STARTED_NO_REPLAY"):
                    b.repair(None, new)


if __name__ == "__main__":
    unittest.main()
