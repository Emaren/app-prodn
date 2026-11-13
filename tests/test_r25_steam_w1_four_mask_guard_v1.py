#!/usr/bin/env python3
"""Focused synthetic W1 signed four-unit financial timer mask admission tests."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

SOURCE = Path(__file__).parents[1] / "scripts/release/r25_steam_w1_four_mask_guard_v1.py"
spec = importlib.util.spec_from_file_location("w1_guard", SOURCE)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class W1FourMaskProof(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.control = self.root / "system.control"
        self.control.mkdir(mode=0o700)
        self.masks = {}
        self.receipt = {
            "state": "QUARANTINED",
            "manual_start_denied": list(guard.UNITS),
            "masked_runtime_states": {name: {"LoadState": "masked"} for name in guard.UNITS},
            "original_files_unchanged": True,
            "financial_writer_fence": False,
            "funded_operations": "DENIED",
            "utc": "2026-11-13T09:53:35Z",
        }
        for name in guard.UNITS:
            (self.control / name).symlink_to("/dev/null")
            state = {
                "Id": name, "LoadState": "masked", "UnitFileState": "masked",
                "FragmentPath": str(self.control / name), "TriggeredBy": "",
                "MainPID": "0", "ControlPID": "0", "Type": "",
                "NextElapseUSecRealtime": "", "NextElapseUSecMonotonic": "infinity",
            }
            if name.endswith(".service"):
                state.update(ActiveState="inactive", SubState="dead", Result="success")
            else:
                state.update(ActiveState="failed", SubState="failed", Result="resources")
            self.masks[name] = state
        self.enabled = {name: "masked" for name in guard.UNITS}

    def inspect(self):
        return guard.validate_four_masked(
            self.receipt, show=lambda name: dict(self.masks[name]),
            enabled=lambda name: self.enabled[name],
            control=self.control, mask_uid=os.getuid())

    def test_exact_four_unit_masked_pass_is_not_financial_permission(self):
        status = self.inspect()
        self.assertEqual(status["state"], "PASS_PHYSICAL_W1_MASK_ONLY")
        self.assertFalse(status["financial_authorized"])
        self.assertEqual(set(status["units"]), set(guard.UNITS))

    def test_unexpected_unmask_of_any_unit_holds(self):
        for name in guard.UNITS:
            with self.subTest(name=name):
                self.enabled[name] = "enabled"
                with self.assertRaisesRegex(guard.Hold, "SYSTEMD_MASK_IDENTITY"):
                    self.inspect()
                self.enabled[name] = "masked"

    def test_partial_quarantine_missing_mask_holds(self):
        first = guard.UNITS[0]
        (self.control / first).unlink()
        with self.assertRaisesRegex(guard.Hold, "CONTROL_MASK_MISSING"):
            self.inspect()

    def test_service_resumption_and_timer_rearm_holds(self):
        s = next(x for x in guard.UNITS if x.endswith(".service"))
        self.masks[s]["MainPID"] = "999"
        with self.assertRaisesRegex(guard.Hold, "SERVICE_RESUMED"):
            self.inspect()
        self.masks[s]["MainPID"] = "0"
        t = next(x for x in guard.UNITS if x.endswith(".timer"))
        self.masks[t]["NextElapseUSecMonotonic"] = "12345"
        with self.assertRaisesRegex(guard.Hold, "TIMER_REARMED"):
            self.inspect()

    def test_wrong_loaded_fragment_and_missing_manual_denial_hold(self):
        first = guard.UNITS[0]
        self.masks[first]["FragmentPath"] = "/etc/systemd/system/overridden"
        with self.assertRaisesRegex(guard.Hold, "SYSTEMD_MASK_IDENTITY"):
            self.inspect()
        self.masks[first]["FragmentPath"] = str(self.control / first)
        self.receipt["manual_start_denied"] = list(guard.UNITS[:-1])
        with self.assertRaisesRegex(guard.Hold, "UNTRUSTED_RECEIPT"):
            self.inspect()

    def test_exact_private_receipt_digest_and_scope(self):
        self.root.chmod(0o700)
        journal = self.root / "nonce"
        journal.mkdir(mode=0o700)
        packet = json.dumps(self.receipt, sort_keys=True, separators=(",", ":")).encode()
        proof = journal / "QUARANTINED.json"
        proof.write_bytes(packet)
        proof.chmod(0o600)
        digest = hashlib.sha256(packet).hexdigest()
        self.assertEqual(
            guard.accepted_receipt(self.root, uid=os.getuid(), expected_sha=digest),
            self.receipt)
        with self.assertRaisesRegex(guard.Hold, "EXACT_ACCEPTED_RECEIPT_NOT_UNIQUE"):
            guard.accepted_receipt(self.root, uid=os.getuid(), expected_sha="0" * 64)
        proof.chmod(0o666)
        with self.assertRaisesRegex(guard.Hold, "UNTRUSTED_OWNER_MODE"):
            guard.accepted_receipt(self.root, uid=os.getuid(), expected_sha=digest)


if __name__ == "__main__":
    unittest.main()
