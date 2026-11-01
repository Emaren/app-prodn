import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "scripts/ai_branch_inventory.py"
spec = importlib.util.spec_from_file_location("ai_branch_inventory", PATH)
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


class AIEntryPointContract(unittest.TestCase):
    def test_existing_authority_references_are_real(self):
        guide = (ROOT / "AGENTS.md").read_text()
        for target in ("docs/ENGINEERING_MEMORY.md", "docs/DOCUMENTATION_OS.md",
                       "docs/DOCUMENTATION_CONTROL_PLANE.md", "docs/document-registry.json"):
            self.assertTrue((ROOT / target).is_file(), target)
            self.assertIn(target, guide)
        for issue in ("Emaren/app-prodn/issues/1108", "Emaren/app-prodn/issues/934",
                      "Emaren/wolochain/issues/5"):
            self.assertIn(issue, guide)
        self.assertIn("DISCOVER → REUSE → INTEGRATE → VERIFY → DEPLOY → RECORD", guide)

    def test_parses_detached_and_locked_without_discarding_work(self):
        raw = ("worktree /tmp/checked\nHEAD abc\nbranch refs/heads/feature\n\n"
               "worktree /tmp/held\nHEAD def\ndetached\nlocked review\n")
        rows = inventory.parse_worktrees(raw)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["branch"], "refs/heads/feature")
        self.assertTrue(rows[1]["detached"])
        self.assertTrue(rows[1]["locked"])

    def test_unknown_never_becomes_abandoned(self):
        result = inventory.measure(ROOT, "not-a-commit", "also-not-a-commit",
                                   "unknown", None, [])
        self.assertEqual(result["disposition"], "UNKNOWN")
        self.assertEqual(result["source_qualified"] if "source_qualified" in result else
                         result["production_state"], "NOT_VERIFIED")
        self.assertEqual(result["release_gate"], "UNKNOWN")

    def test_no_source_mutation_commands_or_implicit_deploy(self):
        s = PATH.read_text()
        for disallowed in ('"git", "reset"', '"git", "clean"', '"git", "fetch"',
                           '"git", "push"', '"git", "checkout"', '"git", "worktree", "remove"',
                           '"gh", "pr", "merge"'):
            self.assertNotIn(disallowed, s)
        self.assertIn('GIT_OPTIONAL_LOCKS="0"', s)
        self.assertIn('NOT_VERIFIED', s)


if __name__ == "__main__":
    unittest.main()
