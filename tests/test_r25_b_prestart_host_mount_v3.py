"""Candidate-only namespace prestart recovery; no LIVE unit mutation."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = ROOT / "deploy/r25-b-3031.prestart-host-mount-v3.dropin.conf"
OLD = ROOT / "deploy/r25-b-3031.namespace-recovery.dropin.conf"

class PrestartHostMountV3(unittest.TestCase):
    def test_private_run_retained_and_no_web_exec_changes(self):
        v2 = OLD.read_text()
        v3 = CONFIG.read_text()
        self.assertIn("TemporaryFileSystem=/run:ro", v2)
        self.assertNotIn("TemporaryFileSystem=", v3)
        self.assertNotIn("ExecStart=", v3)
        self.assertNotIn("ReadWritePaths=", v3)
        self.assertNotIn("BindPaths=", v3)
        self.assertNotIn("User=", v3)
        self.assertNotIn("EnvironmentFile=", v3)
    def test_exact_root_prestart_only(self):
        lines = [line for line in CONFIG.read_text().splitlines() if not line.startswith("#") and line]
        self.assertEqual(lines, [
            "[Service]",
            "ExecStartPre=",
            "ExecStartPre=+/usr/bin/nsenter --target 1 --mount -- /usr/bin/python3 -I -B /etc/aoe2war/r24-parallel-web/approved-runtime-namespace-v2.py --phase prestart --expected-guard-sha256 dead2815b3f20b311ede29dfd99086cbb81dfd6a73f1a71f2b7b57ccd74e809d",
        ])
        self.assertNotIn("systemctl start", CONFIG.read_text())
        self.assertNotIn("8092", CONFIG.read_text())
        self.assertNotIn("8093", CONFIG.read_text())

if __name__ == "__main__":
    unittest.main()
