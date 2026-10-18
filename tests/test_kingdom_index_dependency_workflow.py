"""Workflow contract: diagnostics must never become a scoring or release bypass."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/kingdom-index-source-census.yml"

class DependencyWorkflowTests(unittest.TestCase):
    def test_fingerprints_still_fail_on_drift(self):
        text = WORKFLOW.read_text()
        self.assertIn("node scripts/kingdom_index_source_audit.mjs --check", text)
        self.assertIn("dependency-evidence:", text)
        self.assertIn("--route /leaderboard --json", text)
        self.assertIn("--route /kingdom-index --json", text)
        self.assertIn("--all --json", text)
        self.assertIn("page_quality_certified", text)
        self.assertIn("financial_release_authorized", text)
        self.assertIn("NOT A CERTIFICATE", text)
        self.assertNotIn("|| true", text)
        self.assertNotIn("continue-on-error: true", text)

    def test_global_inputs_trigger_dependency_recheck(self):
        text = WORKFLOW.read_text()
        for path in ("prisma/schema.prisma","package.json","yarn.lock",
                     "config/**","scripts/aoe2_module_graph.py"):
            self.assertIn(path, text)

if __name__ == "__main__":
    unittest.main()
