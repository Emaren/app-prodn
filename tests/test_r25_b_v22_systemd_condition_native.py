"""Native systemd negative-condition semantics in temporary sandbox only.

No service install, sudo, daemon-reload, timer, SSH, or production mutation.
Skipped locally on Darwin; required to run natively on ubuntu-24.04 CI.
"""
from __future__ import annotations
import importlib.util
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import unittest

SRC=Path(__file__).resolve().parents[1]/"scripts/release/r25_v22_root_install_admission_REVIEW_ONLY.py"
spec=importlib.util.spec_from_file_location("native_policy",SRC)
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)

@unittest.skipUnless(platform.system()=="Linux" and shutil.which("systemd-analyze"),
                     "Linux systemd-analyze required")
class SteamExecutionFenceNative(unittest.TestCase):
    def test_systemd_negative_condition_obeys_sentinel_state(self):
        with tempfile.TemporaryDirectory(prefix="b-v22-sentinel-native-") as root:
            sentinel=Path(root)/"install-in-progress"
            condition=f"ConditionPathExists=!{sentinel}"
            self.assertIn(b"ConditionPathExists=!",p.FENCE_BODY)
            self.assertIn(p.SENTINEL.encode(),p.FENCE_BODY)
            no_sentinel=subprocess.run(
                ["systemd-analyze","condition",condition],
                capture_output=True,text=True,timeout=8)
            self.assertEqual(no_sentinel.returncode,0,
                no_sentinel.stderr+no_sentinel.stdout)
            sentinel.write_text("review fixture only")
            present=subprocess.run(
                ["systemd-analyze","condition",condition],
                capture_output=True,text=True,timeout=8)
            self.assertNotEqual(present.returncode,0,
                "A present fail-closed sentinel MUST deny Steam oneshot")
            sentinel.unlink()
            recovered=subprocess.run(
                ["systemd-analyze","condition",condition],
                capture_output=True,text=True,timeout=8)
            self.assertEqual(recovered.returncode,0)

if __name__=="__main__":unittest.main()
