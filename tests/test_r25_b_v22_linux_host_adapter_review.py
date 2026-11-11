"""No privileged operations. Structural host adapter exact-path/denial tests."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
FILE=ROOT/"scripts/release/r25_b_v22_linux_host_adapter_REVIEW_ONLY.py"
spec=importlib.util.spec_from_file_location("b_linux_adapter",FILE)
a=importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)

class ExactHostReview(unittest.TestCase):
    def test_no_root_execution_cli(self):
        p=subprocess.run([sys.executable,"-B",str(FILE)],capture_output=True,text=True,timeout=5)
        self.assertEqual(p.returncode,3)
        self.assertIn("REVIEW_ONLY",p.stdout)
    def test_adapter_requires_root_immutable_sources(self):
        if __import__("os").geteuid()!=0:
            with self.assertRaisesRegex(RuntimeError,"ROOT_REQUIRED"):
                a.HEL1SourceInstallHost().require_immutable_root_executor()
    def test_all_three_literal_production_destinations(self):
        self.assertEqual(set(a.txn.PRODUCTION_TARGETS),{"v22","controller","guard"})
        self.assertEqual(a.txn.PRODUCTION_TARGETS["v22"],
          "/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_two_web_builds_v22.py")
    def test_central_fetch_exact_issue_endpoint(self):
        self.assertEqual(a.CENTRAL_COMMENT_API,
          "https://api.github.com/repos/Emaren/app-prodn/issues/comments/")
    def test_fence_unit_is_persistent_negative_exists_guard(self):
        self.assertIn(b"ConditionPathExists=!",a.policy.FENCE_BODY)
        self.assertIn(a.policy.SENTINEL.encode(),a.policy.FENCE_BODY)
        self.assertTrue(a.GUARD.as_posix().endswith(
          "/60-r25-source-install-guard.conf"))
    def test_one_use_packet_is_root_private_fixed_location(self):
        self.assertEqual(a.INPUT,a.ROOT/"packet.json")
        self.assertEqual(a.OWNER,a.ROOT/"owner-receipt.json")
        self.assertEqual(a.TRANS,a.ROOT/"transaction")
    def test_no_legacy_3030_service_modification_method(self):
        text=FILE.read_text()
        self.assertNotIn('["/usr/bin/systemctl","stop","aoe2hdbets-web.service"',text)
        self.assertNotIn('["/usr/bin/systemctl","restart","aoe2hdbets-web.service"',text)
        self.assertNotIn('["/usr/bin/systemctl","stop","aoe2hdbets-web-prod.service"',text)
    def test_no_nft_or_finance_write_commands(self):
        text=FILE.read_text()
        for cmd in ("pg_dump","psql -c","nft add","nft delete","wolochain-mainnet-settlement start"):
            self.assertNotIn(cmd,text)
    def test_cannot_construct_dynamic_target_from_packet(self):
        text=FILE.read_text()
        self.assertIn('txn.PRODUCTION_TARGETS',text)
        self.assertNotIn('self.packet["target_path"]',text)
    def test_root_loader_preserves_review_only_status(self):
        self.assertIn("HOLD:REVIEW_ONLY_NO_LIVE_ROOT_INSTALL_CLI",FILE.read_text())

if __name__=="__main__":unittest.main()
