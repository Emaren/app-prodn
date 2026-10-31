#!/usr/bin/env python3
"""Mac witness-only repair consent and pin tests (offline, no SSH)."""
import importlib.util
import json
from pathlib import Path
import types
import unittest
from unittest.mock import patch

root = Path(__file__).resolve().parents[1]
p = root / "scripts" / "r25_b_owner_mac_witness_repair.py"
spec = importlib.util.spec_from_file_location("b_mac_repair", p)
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


class TestMacRepair(unittest.TestCase):
    def test_exact_immutable_source_pins_and_separate_gui_phrase(self):
        self.assertEqual(b.ROOT_REF, "4c9d2ec8029bd97f4307823fa1971ef326527adc")
        self.assertEqual(b.ROOT_SIZE, 14001)
        self.assertEqual(b.ROOT_SHA, "c4301d6faa0d3b9f763168f3883473425c8f2ca6f9b3e6ea03bdfbc079f6e749")
        self.assertEqual(b.ROOT_BLOB, "5f66cdb87ee44fd91ba2c9e5c1c3e362e46d4f5c")
        self.assertEqual(b.WITNESS_REF, "73635d328ee7c9c96a5c2e447cc08df8eae2a085")
        self.assertEqual(b.WITNESS_SIZE, 22310)
        self.assertEqual(b.WITNESS_SHA, "a72f96668bc6beeaacc90d089cbd7b3a3815caca7b69d4ef7e7be68da6c6ef90")
        self.assertEqual(b.WITNESS_BLOB, "01cb34dcd23a1793fef62d1e49ba6e6f600e8b44")
        self.assertNotIn("INSTALL-R25-B", b.AUTH)

    def test_cancel_mismatch_timeout_refuse_before_ssh(self):
        for rc, text in [(1, ""), (0, "INSTALL-R25-B-NEW-ONLY-87d340314e46"), (0, "REPAIR-R25-B-WITNESS-ONLY-87d340314e46x")]:
            with self.subTest(rc=rc, text=text), \
                 patch.object(b.subprocess, "run", return_value=types.SimpleNamespace(returncode=rc, stdout=text)), \
                 patch.object(b, "root_call") as remote:
                with self.assertRaises(SystemExit):
                    b.owner_approval()
                remote.assert_not_called()
        with patch.object(b.subprocess, "run", side_effect=b.subprocess.TimeoutExpired("osascript", 1)):
            with self.assertRaisesRegex(SystemExit, "GUI_UNAVAILABLE"):
                b.owner_approval()

    def test_exact_gui_phrase_accepts_only_native_osascript(self):
        with patch.object(b.subprocess, "run", return_value=types.SimpleNamespace(returncode=0, stdout=b.AUTH + "\n")) as call:
            b.owner_approval()
        self.assertEqual(call.call_args.args[0][0], "/usr/bin/osascript")
        self.assertIn("default answer", call.call_args.args[0][2])

    def test_nonroot_darwin_gate_prior_to_fetch_or_ssh(self):
        with patch.object(b.sys, "platform", "linux"), patch.object(b, "fetch") as f:
            with patch.object(b.sys, "argv", ["owner", "--repair"]):
                with self.assertRaisesRegex(SystemExit, "ORIGINAL_NONROOT_MAC_REQUIRED"):
                    b.main()
            f.assert_not_called()

    def test_prestart_read_only_does_not_show_gui(self):
        positive = {"status": "PASS_B_REPAIRED_WITNESS_NATIVE_PRESTART_READ_ONLY"}
        with patch.object(b.sys, "platform", "darwin"), \
             patch.object(b.os, "geteuid", return_value=501), \
             patch.object(b.sys, "argv", ["owner", "--prestart-only"]), \
             patch.object(b, "fetch", return_value=b"pinned"), \
             patch.object(b, "owner_approval") as gui, \
             patch.object(b, "root_call", return_value=positive) as call:
            self.assertEqual(b.main(), 0)
            self.assertEqual(call.call_args.args[2], "prestart")
            gui.assert_not_called()

    def test_repair_positive_requires_distinct_consent_before_ssh(self):
        plan = {"status": "PASS_B_WITNESS_REPAIR_PLAN_READ_ONLY"}
        done = {"status": "WITNESS_ONLY_REPAIR_COMPLETE_NOT_PRESTART_AUTHORITY",
                "installed_witness_sha256": b.WITNESS_SHA,
                "original_install_report_sha256": "41be908123b5f13e349b3ad093ebea7a7908149c9c646041969556d3e0cc1cd2",
                "new_service_started": False, "public_cutover_authorized": False}
        with patch.object(b.sys, "platform", "darwin"), \
             patch.object(b.os, "geteuid", return_value=501), \
             patch.object(b.sys, "argv", ["owner", "--repair"]), \
             patch.object(b, "fetch", return_value=b"pinned"), \
             patch.object(b, "owner_approval") as gui, \
             patch.object(b, "root_call", side_effect=[plan, done]) as calls:
            self.assertEqual(b.main(), 0)
            gui.assert_called_once()
            self.assertEqual(calls.call_count, 2)
            self.assertEqual(calls.call_args_list[0].args[2], "plan")
            self.assertEqual(calls.call_args_list[1].args[2], "repair")
            self.assertTrue(calls.call_args_list[1].kwargs["approved"])

    def test_source_no_install_replay_and_strict_ssh(self):
        source = p.read_text()
        self.assertNotIn("r25_b_additive_3031_setup.py", source)
        self.assertNotIn("systemctl start", source)
        self.assertNotIn("systemctl reload", source)
        self.assertIn('ssh = ["/usr/bin/ssh", "-T"', source)
        self.assertNotIn('ssh = ["ssh", "-T"', source)
        for check in ("StrictHostKeyChecking=yes", "BatchMode=yes",
                      "NumberOfPasswordPrompts=0", "root@hel1",
                      "IMMUTABLE_SOURCE_SIZE_SHA256_OR_GIT_BLOB_DRIFT"):
            self.assertIn(check, source)


if __name__ == "__main__":
    unittest.main()
