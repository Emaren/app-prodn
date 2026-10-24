"""Read-only diagnostic syntax and privilege invariants; never connect to hel1."""
from __future__ import annotations
import subprocess
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DIAG=ROOT/"scripts"/"aoe2_website_release_readonly_diag.sh"

class WebsiteDiagnosticSafetyTests(unittest.TestCase):
    def test_bash_parser_and_mac_legacy_shell_compatibility(self):
        result=subprocess.run(["bash","-n",str(DIAG)],capture_output=True,text=True,timeout=12)
        self.assertEqual(0,result.returncode,result.stderr)
        contents=DIAG.read_text()
        self.assertNotIn("${name^^}",contents)
        self.assertNotIn("find -maxdepth",contents)

    def test_readonly_safety_and_safe_ssh(self):
        text=DIAG.read_text()
        for fragment in (
            "StrictHostKeyChecking=yes","BatchMode=yes",
            "bash -s", "ssh -T", "systemctl is-active",
            "ss -ltn", "/api/deployment-version",
            "GITHUB_MAIN_REMOTE_SHA","CONTROLLER_APPROVED_SHA",
            "SIGNED_SOURCE_FINANCE","SIGNED_WOLO_PRESTATE",
        ):
            self.assertIn(fragment,text)
        self.assertNotIn("systemctl restart ",text)
        self.assertNotIn("git -C \"$WEB\" checkout",text)
        self.assertNotIn("curl -fsS --max-time 8 http://127.0.0.1:3030/api/bets",text)

if __name__=="__main__":
    unittest.main()
