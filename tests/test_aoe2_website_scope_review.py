import importlib.util
import pathlib
import sys
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
        actual = MODULE.inspect_paths([
            "app/kingdom-bettors/page.tsx",
            "app/api/admin/kingdom-bettors/personas/route.ts",
            "lib/kingdomBettors.ts",
            "app/AppShell.tsx",
        ])
        self.assertFalse(actual["website_release_authorized"])
        self.assertFalse(actual["financial_scope_admitted"])
        self.assertEqual(actual["status"], "FINANCIAL_OR_SHARED_SCOPE_UNPROVEN")
        self.assertTrue(any("financial" in item["reason"] for item in actual["risks"]))

    def test_css_only_and_pure_asset_only_still_need_independent_proof(self):
        for path in ("components/intro/Intro.module.css", "public/avatars/pilot.webp"):
            with self.subTest(path=path):
                result = MODULE.inspect_paths([path])
                self.assertFalse(result["website_release_authorized"])
                self.assertTrue(result["risks"])

    def test_nonfinancial_documentation_has_no_release_authority(self):
        result = MODULE.inspect_paths(["docs/README.md"])
        self.assertFalse(result["website_release_authorized"])
        self.assertEqual(result["status"], "SCOPE_UNPROVEN")

    def test_path_traversal_and_unknown_files_fail_closed(self):
        for path in ("../prisma/schema.prisma", "/tmp/state", "app\\settings.ts", ""):
            with self.subTest(path=path):
                result = MODULE.inspect_paths([path])
                self.assertFalse(result["website_release_authorized"])
                self.assertTrue(result["risks"])

    def test_untrusted_refs_cannot_drive_scope(self):
        with self.assertRaises(ValueError):
            MODULE.inspect_commits("main;rm -rf /", "f" * 40)

    def test_revision_identity_requires_clean_worktree(self):
        with mock.patch.object(MODULE, "_git", side_effect=["", "", "", "?? pending.sql"]):
            with self.assertRaisesRegex(ValueError, "Worktree dirty"):
                MODULE.inspect_commits("a" * 40, "b" * 40)

    def test_commits_never_authorize_website_release(self):
        with mock.patch.object(MODULE, "_git", side_effect=["", "", "", "", "app/AppShell.tsx"]):
            result = MODULE.inspect_commits("a" * 40, "b" * 40)
        self.assertFalse(result["website_release_authorized"])
        self.assertFalse(result["financial_scope_admitted"])


if __name__ == "__main__":
    unittest.main()
