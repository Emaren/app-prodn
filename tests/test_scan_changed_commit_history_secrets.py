from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
FILE = ROOT / "scripts/scan_changed_commit_history_secrets.py"
SPEC = importlib.util.spec_from_file_location("scan_changed_commit_history_secrets", FILE)
MOD = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MOD
SPEC.loader.exec_module(MOD)


class HistoricalSecretScanTests(unittest.TestCase):
    def test_added_secrets_not_deleted_or_context_lines(self):
        fake = "AK" + "IA" + "B" * 16
        patch = "\n".join([
            "diff --git a/lib/example.ts b/lib/example.ts",
            "--- a/lib/example.ts",
            "+++ b/lib/example.ts",
            "@@ -1,2 +1,2 @@",
            "-" + fake,
            "+const token = '" + fake + "';",
            " const previous = '" + fake + "';",
        ])
        matches = MOD.parse_patch("a" * 40, patch)
        self.assertEqual([(f.path, f.kind) for f in matches],
                         [("lib/example.ts", "aws-access-key")])
        self.assertNotIn(fake, repr(matches))

    def test_private_env_paths_still_fail_even_without_content(self):
        patch = "diff --git a/.env.production b/.env.production\n+++ b/.env.production\n@@ -0,0 +1 @@\n+hello=world\n"
        self.assertEqual(MOD.parse_patch("b" * 40, patch)[0].kind, "sensitive-file-path")

    def test_merge_resolution_and_boundaries(self):
        self.assertEqual(MOD.parse_patch("c" * 40, "diff --git a/a b/a\nGIT binary patch\n"), [])
        with self.assertRaises(ValueError):
            MOD.scan_history("not-a-sha")

    def test_no_untrusted_base_fallback(self):
        workflow = (ROOT / ".github/workflows/ci.yml").read_text()
        self.assertIn("python3 scripts/scan_changed_commit_history_secrets.py", workflow)
        self.assertIn("PR_BASE_SHA:", workflow)


if __name__ == "__main__":
    unittest.main()
