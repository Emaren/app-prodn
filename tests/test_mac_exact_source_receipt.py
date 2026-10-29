#!/usr/bin/env python3
"""Synthetic, read-only Mac exact-source receipt and historical ENOENT tests."""
from __future__ import annotations

from contextlib import redirect_stdout
import errno
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "aoe2_mac_exact_source_receipt", ROOT / "scripts/aoe2_mac_exact_source_receipt.py")
assert SPEC is not None and SPEC.loader is not None
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)

DF_LOW = (
    "Filesystem   1024-blocks      Used Available Capacity  Mounted on\n"
    "/dev/disk3s5 482797652 425828336 12443264 98% /System/Volumes/Data\n"
)
DF_HIGH = (
    "Filesystem   1024-blocks      Used Available Capacity  Mounted on\n"
    "/dev/disk3s5 482797652 400000000 30000000 90% /System/Volumes/Data\n"
)


class MacExactSourceReceiptTests(unittest.TestCase):
    @staticmethod
    def roots(td, *, present=False):
        home = Path(td).resolve() / "home"
        parent = home / "Downloads"
        parent.mkdir(parents=True)
        target = parent / "AoE2 HD"
        if present:
            target.mkdir()
        return home, target

    @staticmethod
    def df(stdout=DF_LOW, status=0, stderr=""):
        return subprocess.CompletedProcess(
            ["df", "-Pk", mod.DATA_MOUNT], status, stdout, stderr)

    def check_receipt(self, receipt, expected_exit):
        self.assertEqual(receipt["exit_code"], expected_exit)
        self.assertFalse(receipt["scan_admission_permitted"])
        self.assertEqual(receipt["directories_enumerated"], 0)
        self.assertFalse(receipt["project_location_confirmed"])
        self.assertIsNone(receipt["project_size_bytes"])
        self.assertIsNone(receipt["unique_apfs_reclaimable_bytes"])
        self.assertFalse(receipt["l1_gate_3_accepted"])
        self.assertEqual((receipt["l1_accepted_gates"], receipt["l1_total_gates"]), (2, 8))
        self.assertEqual(receipt["mutation_authority"], "NONE")
        self.assertFalse(receipt["persisted_signed_ledger"])
        self.assertEqual(len(receipt["unsigned_receipt_sha256"]), 64)
        saved = dict(receipt)
        digest = saved.pop("unsigned_receipt_sha256")
        canonical = json.dumps(saved, sort_keys=True, separators=(",", ":"))
        self.assertEqual(hashlib.sha256(canonical.encode()).hexdigest(), digest)

    def test_owner_low_capacity_and_enoent_are_both_preserved_with_exit_three(self):
        with tempfile.TemporaryDirectory() as td:
            home, target = self.roots(td, present=False)
            with mock.patch.object(mod.subprocess, "run", return_value=self.df()) as run, \
                 mock.patch.object(mod.os, "scandir", side_effect=AssertionError("no scan")), \
                 mock.patch.object(mod.os, "walk", side_effect=AssertionError("no walk")):
                receipt, code = mod.collect(target, home=home, platform="darwin",
                    captured_at="2026-10-29T19:13:00+00:00")
            self.assertEqual(code, mod.EXIT_EXTERNAL_CAPACITY)
            self.assertEqual(receipt["status"], "BLOCKED_EXTERNAL_MAC_CAPACITY")
            self.assertEqual(receipt["df_exit_code"], 0)
            self.assertEqual(receipt["df"]["ordinary_available_kib"], 12443264)
            self.assertEqual(receipt["ordinary_free_floor_shortfall_kib"], 13771136)
            self.assertEqual(receipt["target"]["state"], "EXACT_PATH_ABSENT_ENOENT")
            self.assertEqual(receipt["target"]["errno"], errno.ENOENT)
            self.assertEqual(receipt["path_candidates_checked"], 1)
            self.assertEqual(receipt["captured_at_utc"], "2026-10-29T19:13:00+00:00")
            run.assert_called_once()
            self.assertEqual(run.call_args.args[0], ["df", "-Pk", mod.DATA_MOUNT])
            self.check_receipt(receipt, 3)

    def test_high_capacity_missing_name_exit_four_not_empty_project(self):
        with tempfile.TemporaryDirectory() as td:
            home, target = self.roots(td)
            with mock.patch.object(mod.subprocess, "run", return_value=self.df(DF_HIGH)):
                receipt, code = mod.collect(target, home=home, platform="darwin")
            self.assertEqual(code, mod.EXIT_TARGET_UNKNOWN)
            self.assertEqual(receipt["status"], "TARGET_PATH_UNKNOWN_ENOENT")
            self.assertFalse(receipt["project_location_confirmed"])
            self.assertIsNone(receipt["project_size_bytes"])
            self.check_receipt(receipt, 4)

    def test_present_exact_path_exit_zero_is_not_scan_or_l1_certificate(self):
        with tempfile.TemporaryDirectory() as td:
            home, target = self.roots(td, present=True)
            with mock.patch.object(mod.subprocess, "run", return_value=self.df(DF_HIGH)), \
                 mock.patch.object(mod.os, "scandir", side_effect=AssertionError("scan")):
                receipt, code = mod.collect(target, home=home, platform="darwin")
            self.assertEqual(code, 0)
            self.assertEqual(receipt["status"], "OBSERVED_EXACT_PATH_NOT_L1_CERTIFIED")
            self.assertEqual(receipt["target"]["entry_type"], "DIRECTORY")
            self.assertEqual(receipt["target"]["state"], "EXACT_PATH_PRESENT_METADATA_ONLY")
            self.assertFalse(receipt["project_location_confirmed"])
            self.check_receipt(receipt, 0)

    def test_symlink_ancestor_and_foreign_target_never_follow(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td).resolve() / "home"
            outside = Path(td).resolve() / "elsewhere"
            outside.mkdir()
            home.mkdir()
            (home / "Downloads").symlink_to(outside, target_is_directory=True)
            target = home / "Downloads" / "AoE2 HD"
            with mock.patch.object(mod.subprocess, "run", return_value=self.df(DF_HIGH)):
                receipt, code = mod.collect(target, home=home, platform="darwin")
            self.assertEqual(code, 2)
            self.assertEqual(receipt["target"]["state"], "SYMLINK_NO_FOLLOW_HOLD")
            self.check_receipt(receipt, 2)
        with tempfile.TemporaryDirectory() as td:
            home, target = self.roots(td, present=True)
            original = os.lstat
            def lstat(p):
                st = original(p)
                if str(p) == str(target):
                    from types import SimpleNamespace
                    return SimpleNamespace(st_mode=st.st_mode, st_dev=st.st_dev+1,
                                           st_ino=st.st_ino)
                return st
            with mock.patch.object(mod.subprocess, "run", return_value=self.df(DF_HIGH)), \
                 mock.patch.object(mod.os, "lstat", side_effect=lstat):
                receipt, code = mod.collect(target, home=home, platform="darwin")
            self.assertEqual(code, 2)
            self.assertEqual(receipt["target"]["state"], "FOREIGN_MOUNT_HOLD")

    def test_permission_and_missing_ancestor_remain_unknown_bytes(self):
        with tempfile.TemporaryDirectory() as td:
            home, target = self.roots(td, present=True)
            original = os.lstat
            def deny(p):
                if str(p) == str(target):
                    raise PermissionError(errno.EACCES, "denied", str(p))
                return original(p)
            with mock.patch.object(mod.subprocess, "run", return_value=self.df(DF_HIGH)), \
                 mock.patch.object(mod.os, "lstat", side_effect=deny):
                receipt, code = mod.collect(target, home=home, platform="darwin")
            self.assertEqual(code, 2)
            self.assertEqual(receipt["target"]["state"], "EXACT_PATH_PERMISSION_HOLD")
            self.assertIsNone(receipt["target"]["allocated_bytes"])

    def test_df_bad_exit_malformed_and_timeout_never_claim_pass(self):
        with tempfile.TemporaryDirectory() as td:
            home, target = self.roots(td, present=True)
            with mock.patch.object(mod.subprocess, "run", return_value=self.df("", 1, "failed")):
                receipt, code = mod.collect(target, home=home, platform="darwin")
            self.assertEqual((code, receipt["df_exit_code"]), (2, 1))
            self.assertEqual(receipt["status"], "DF_MALFORMED_OR_FAILED")
            self.assertEqual(receipt["path_candidates_checked"], 0)
            self.assertEqual(receipt["target"]["state"], "NOT_CHECKED_SOURCE_UNAVAILABLE")
            with mock.patch.object(mod.subprocess, "run", return_value=self.df("junk", 0)):
                receipt, code = mod.collect(target, home=home, platform="darwin")
            self.assertEqual((code, receipt["status"]), (2, "DF_MALFORMED_OR_FAILED"))
            with mock.patch.object(mod.subprocess, "run",
                                   side_effect=subprocess.TimeoutExpired(["df"], 8)):
                receipt, code = mod.collect(target, home=home, platform="darwin")
            self.assertEqual((code, receipt["status"]), (2, "DF_TIMEOUT"))

    def test_non_mac_and_outside_home_fail_without_path_enumeration(self):
        with tempfile.TemporaryDirectory() as td:
            home, target = self.roots(td)
            with mock.patch.object(mod.subprocess, "run", side_effect=AssertionError("no df")):
                receipt, code = mod.collect(target, home=home, platform="linux")
            self.assertEqual((code, receipt["status"]), (2, "NON_NATIVE_MAC_NO_PROBE"))
            with mock.patch.object(mod.subprocess, "run", return_value=self.df(DF_HIGH)):
                receipt, code = mod.collect(Path(td) / "outside", home=home, platform="darwin")
            self.assertEqual(code, 2)
            self.assertEqual(receipt["target"]["state"],
                             "TARGET_OUTSIDE_EXPLICIT_HOME_SCOPE")

    def test_cli_propagates_nonzero_exit_and_no_unconditional_success_marker(self):
        fake = {"schema_version": mod.SCHEMA, "status": "BLOCKED_EXTERNAL_MAC_CAPACITY",
                "target": {"state": "EXACT_PATH_ABSENT_ENOENT"}, "captured_at_utc": "UTC"}
        with mock.patch.object(mod, "collect", return_value=(fake, 3)), \
             mock.patch.object(sys, "argv", ["aoe2_mac_exact_source_receipt.py", "--json"]), \
             redirect_stdout(io.StringIO()) as output:
            status = mod.main()
        self.assertEqual(status, 3)
        self.assertEqual(json.loads(output.getvalue())["status"], "BLOCKED_EXTERNAL_MAC_CAPACITY")
        self.assertNotIn("PASS:", output.getvalue())

    def test_historical_owner_enoent_and_false_pass_fixture_is_not_overwritten(self):
        record = json.loads((ROOT / "tests/fixtures/mac_aoe2_hd_enoent_owner_20261029.json")
                            .read_text(encoding="utf-8"))
        self.assertEqual(record["df_available_kib"], 12443264)
        self.assertEqual(record["admission_shortfall_kib"], 13771136)
        self.assertEqual(record["du_failure_classification_from_stderr"],
                         "ENOENT_AT_REQUESTED_PATH")
        self.assertIsNone(record["du_exit_code"])  # old shell did NOT capture it
        self.assertFalse(record["du_exit_code_observed"])
        self.assertEqual(record["find_stdout_count"], 0)
        self.assertTrue(record["find_stderr_suppressed"])
        self.assertFalse(record["find_count_valid"])
        self.assertFalse(record["terminal_final_marker_valid"])
        self.assertEqual(record["historical_aggregate_result"], "PARTIAL_FALSE_PASS")
        self.assertIsNone(record["original_project_size_bytes"])
        self.assertEqual(record["original_project_path"], "UNKNOWN")
        self.assertFalse(record["owner_finder_report"]["verified"])
        self.assertFalse(record["record_is_signed"])


if __name__ == "__main__":
    unittest.main()
