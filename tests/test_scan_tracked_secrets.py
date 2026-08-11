from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "scan_tracked_secrets.py"
SPEC = importlib.util.spec_from_file_location("scan_tracked_secrets", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class SecretScannerTests(unittest.TestCase):
    def test_detects_high_confidence_values_without_returning_value(self):
        secret = "AK" + "IA" + ("A" * 16)
        findings = MODULE.scan_text("config.ts", f"const value = '{secret}'")
        self.assertEqual(findings[0].kind, "aws-access-key")
        self.assertNotIn(secret, repr(findings[0]))

    def test_placeholders_and_examples_are_allowed(self):
        self.assertEqual(
            MODULE.scan_text("example.env", "OPENAI_API_KEY=<set-me>"),
            [],
        )
        self.assertFalse(MODULE.sensitive_path(".env.production.example"))
        self.assertTrue(MODULE.sensitive_path(".env.production"))


if __name__ == "__main__":
    unittest.main()
