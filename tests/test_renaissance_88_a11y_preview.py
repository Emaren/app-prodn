"""Quarantined accessibility preview must never turn into a source-seal bypass."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
class PreviewSourceIsolation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=(ROOT/"scripts/renaissance_88_plan.py").read_text()
        cls.guard=(ROOT/"scripts/renaissance_88_preview_manifest_guard.sh").read_text()
        cls.preview=(ROOT/".github/workflows/renaissance-88-a11y-preview.yml").read_text()
        cls.official=(ROOT/".github/workflows/renaissance-88-factory.yml").read_text()
    def test_default_still_requires_clean_git_head(self):
        self.assertIn("preview_unsealed_generated_policy:bool=False",self.source)
        self.assertIn("if not preview_unsealed_generated_policy:",self.source)
        self.assertIn('raise ValueError("Cannot bind census to clean exact Git head")',self.source)
        self.assertNotIn("--preview-unsealed-generated-policy",self.official)
    def test_preview_one_tracked_generated_file_only(self):
        self.assertIn('[" M lib/pageChangeManifest.generated.ts"]',self.source)
        self.assertIn("changed!=",self.source)
        self.assertIn("quarantined",self.preview.lower())
        self.assertIn("--preview-unsealed-generated-policy",self.preview)
        self.assertIn('"source_clean":clean',self.source)
        self.assertIn('"derived_policy_unsealed":not clean',self.source)
        self.assertIn('HOLD_GENERATED_POLICY_RESEAL',self.source)
        self.assertIn("GENERATED_POLICY_NOT_SEALED",self.source)
    def test_manifest_guard_deterministic_and_immutable(self):
        self.assertIn("git diff --quiet -- .",self.guard)
        self.assertIn("git diff --cached --quiet",self.guard)
        self.assertIn("first=",self.guard)
        self.assertIn("second=",self.guard)
        self.assertIn("first\\" == \\"$second",self.guard)
        self.assertIn("REN88_GENERATED_MANIFEST_SHA",self.guard)
        self.assertIn("INDEX_ADMISSION=HOLD_UNTIL_CENTRAL_SEAL",self.guard)
        self.assertIn("renaissance_88_preview_manifest_guard.sh verify",self.preview)
    def test_only_plan_from_exact_next_build_can_use_preview(self):
        self.assertIn('o.action!="plan" or o.build_dir is None',self.source)
        self.assertIn("Unsealed preview requires exact built Next",self.source)
        self.assertIn("source_clean:plan.source_clean===true", (ROOT/"scripts/renaissance_88_browser.cjs").read_text())
        self.assertIn("source_admission:plan.source_admission", (ROOT/"scripts/renaissance_88_receipts.mjs").read_text())
if __name__=="__main__":
    unittest.main()
