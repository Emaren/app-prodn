from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest
from unittest import mock

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

    def test_divergent_pr_scans_each_added_line_from_unique_merge_base(self):
        base, common, commit = "a" * 40, "b" * 40, "c" * 40
        fake = "AK" + "IA" + "B" * 16
        patch = (
            "diff --git a/lib/p.ts b/lib/p.ts\n"
            "+++ b/lib/p.ts\n"
            "@@ -0,0 +1 @@\n"
            "+const value = '" + fake + "';\n"
        )

        def fake_git(*args):
            if args[:2] == ("cat-file", "-e"):
                return b""
            if args[:2] == ("merge-base", "--all"):
                self.assertEqual(args[2:], (base, "HEAD"))
                return (common + "\n").encode()
            if args[:2] == ("merge-base", "--is-ancestor"):
                self.assertEqual(args[2:], (common, "HEAD"))
                return b""
            if args[:2] == ("rev-list", "--reverse"):
                self.assertEqual(args[2], common + "..HEAD")
                return (commit + "\n").encode()
            if args[:2] == ("rev-list", "--parents"):
                return (commit + " " + common + "\n").encode()
            if args[0] == "diff":
                self.assertEqual(args[-3:], (common, commit, "--"))
                return patch.encode()
            raise AssertionError("unexpected Git invocation: " + repr(args))

        with mock.patch.object(MOD, "git", side_effect=fake_git):
            findings, count = MOD.scan_history(base)
        self.assertEqual(count, 1)
        self.assertEqual([(f.commit, f.kind) for f in findings],
                         [(commit[:12], "aws-access-key")])
        self.assertNotIn(fake, repr(findings))

    def test_ambiguous_and_missing_merge_base_fail_closed(self):
        base, common = "a" * 40, "b" * 40

        def fake_git(*args):
            if args[:2] == ("cat-file", "-e"):
                return b""
            if args[:2] == ("merge-base", "--all"):
                return fake_git.bases
            raise AssertionError("must stop before scanning an ambiguous history")

        for bases in (b"", (common + "\n" + "c" * 40 + "\n").encode()):
            fake_git.bases = bases
            with self.subTest(bases=bases), mock.patch.object(MOD, "git", side_effect=fake_git):
                with self.assertRaisesRegex(ValueError, "missing or ambiguous"):
                    MOD.scan_history(base)

    def test_no_untrusted_base_fallback(self):
        workflow = (ROOT / ".github/workflows/ci.yml").read_text()
        self.assertIn("python3 scripts/scan_changed_commit_history_secrets.py", workflow)
        self.assertIn("PR_BASE_SHA:", workflow)


if __name__ == "__main__":
    unittest.main()
