import importlib.util
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SCRIPTS = pathlib.Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location("aoe2_website_scope_review", SCRIPTS / "aoe2_website_scope_review.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
import aoe2_release_gate


class WebsiteHoldScopeTests(unittest.TestCase):
    def test_financial_new_routes_cannot_be_presentation_risk(self):
        for name in (
            "app/api/kingdom-bettors/route.ts",
            "app/api/kingdom-bettors/nominations/route.ts",
            "app/api/admin/kingdom-bettors/personas/route.ts",
            "app/admin/kingdom-bettors/page.tsx",
            "lib/kingdomBettors.ts",
            "components/kingdom-bettors/KingdomBettors.module.css",
            "tests/kingdom-bettors-contract.test.mts",
        ):
            with self.subTest(path=name):
                self.assertEqual(aoe2_release_gate.path_risk(name), "FINANCIAL")

    def test_new_bettor_release_is_not_site_only_approved(self):
        result = MODULE.inspect_paths([
            "app/kingdom-bettors/page.tsx",
            "app/api/admin/kingdom-bettors/personas/route.ts",
            "lib/kingdomBettors.ts", "app/AppShell.tsx",
        ])
        self.assertFalse(result["website_release_authorized"])
        self.assertFalse(result["financial_scope_admitted"])
        self.assertEqual(result["status"], "FINANCIAL_OR_SHARED_SCOPE_UNPROVEN")
        self.assertTrue(any("financial" in item["reason"] for item in result["risks"]))

    def test_css_only_and_pure_asset_only_still_need_independent_proof(self):
        for path in ("components/intro/Intro.module.css", "public/avatars/pilot.webp"):
            with self.subTest(path=path):
                r = MODULE.inspect_paths([path])
                self.assertFalse(r["website_release_authorized"])
                self.assertTrue(r["risks"])

    def test_nonfinancial_documentation_has_no_release_authority(self):
        r = MODULE.inspect_paths(["docs/README.md"])
        self.assertFalse(r["website_release_authorized"])
        self.assertEqual(r["status"], "SCOPE_UNPROVEN")

    def test_unusual_invalid_paths_are_rejected_or_marked_risky(self):
        for path in ("../prisma/schema.prisma", "/tmp/state", "app\\settings.ts", "", "a\x00b"):
            with self.subTest(path=repr(path)):
                r = MODULE.inspect_paths([path])
                self.assertFalse(r["website_release_authorized"])
                self.assertTrue(r["risks"])

    def test_untrusted_refs_cannot_drive_scope(self):
        with self.assertRaises(ValueError):
            MODULE.inspect_commits("main;rm -rf /", "f" * 40)

    def test_path_count_and_git_output_are_bounded(self):
        with self.assertRaisesRegex(ValueError, "Too many"):
            MODULE.inspect_paths(["docs/p" + str(i) for i in range(MODULE.MAX_PATHS + 1)])
        with self.assertRaisesRegex(ValueError, "Truncated"):
            MODULE._paths_from_nul(b"unterminated")
        with self.assertRaisesRegex(ValueError, "Non-UTF8"):
            MODULE._paths_from_nul(b"\xff\x00")

    def test_no_authorization_even_when_no_risks(self):
        r = MODULE.inspect_paths([])
        self.assertFalse(r["website_release_authorized"])
        self.assertFalse(r["finance_release_authorized"])

    def _git(self, cwd, *args):
        return subprocess.check_output(
            ["git", *args], cwd=cwd, stderr=subprocess.DEVNULL,
            env={"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null"},
        ).decode().strip()

    def _repo(self, root):
        p = pathlib.Path(root)
        self._git(p, "init", "-q")
        self._git(p, "config", "user.name", "Scope Tester")
        self._git(p, "config", "user.email", "scope@example.invalid")
        (p / "lib").mkdir()
        (p / "lib/kingdomBettors.ts").write_text("export const allowed = false;\n")
        self._git(p, "add", ".")
        self._git(p, "commit", "-qm", "baseline")
        return p, self._git(p, "rev-parse", "HEAD")

    def test_real_git_rename_cannot_hide_financial_original(self):
        with tempfile.TemporaryDirectory() as d:
            p, base = self._repo(d)
            (p / "docs").mkdir()
            self._git(p, "mv", "lib/kingdomBettors.ts", "docs/readme.txt")
            self._git(p, "commit", "-qm", "move financial code with identical bytes")
            tip = self._git(p, "rev-parse", "HEAD")
            with mock.patch.object(MODULE, "REPO", p):
                result = MODULE.inspect_commits(base, tip)
            self.assertIn("lib/kingdomBettors.ts", result["changed_files"])
            self.assertIn("docs/readme.txt", result["changed_files"])
            self.assertEqual(result["status"], "FINANCIAL_OR_SHARED_SCOPE_UNPROVEN")
            self.assertFalse(result["website_release_authorized"])

    def test_real_git_unusual_newline_filename_stays_one_path(self):
        with tempfile.TemporaryDirectory() as d:
            p, base = self._repo(d)
            name = "docs/betting\nledger.txt"
            (p / "docs").mkdir()
            (p / name).write_text("not safe\n")
            self._git(p, "add", ".")
            self._git(p, "commit", "-qm", "unusual filename")
            tip = self._git(p, "rev-parse", "HEAD")
            with mock.patch.object(MODULE, "REPO", p):
                result = MODULE.inspect_commits(base, tip)
            self.assertIn(name, result["changed_files"])
            self.assertEqual(len(result["changed_files"]), 1)
            self.assertFalse(result["website_release_authorized"])

    def test_real_git_assume_unchanged_and_skip_worktree_both_rejected(self):
        for flag in ("--assume-unchanged", "--skip-worktree"):
            with self.subTest(flag=flag), tempfile.TemporaryDirectory() as d:
                p, tip = self._repo(d)
                self._git(p, "update-index", flag, "lib/kingdomBettors.ts")
                (p / "lib/kingdomBettors.ts").write_text("export const allowed = true;\n")
                self.assertEqual(self._git(p, "status", "--porcelain=v1"), "")
                with mock.patch.object(MODULE, "REPO", p):
                    with self.assertRaisesRegex(ValueError, "index flags"):
                        MODULE.inspect_commits(tip, tip)

    def test_real_git_dirty_and_mismatched_candidate_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p, base = self._repo(d)
            (p / "docs.txt").write_text("untracked\n")
            with mock.patch.object(MODULE, "REPO", p):
                with self.assertRaisesRegex(ValueError, "Worktree dirty"):
                    MODULE.inspect_commits(base, base)
                with self.assertRaisesRegex(RuntimeError, "source ancestry"):
                    MODULE.inspect_commits(base, "f" * 40)


if __name__ == "__main__":
    unittest.main()
