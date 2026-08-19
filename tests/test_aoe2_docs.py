import importlib.util
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

SCRIPT = SCRIPTS / "aoe2_docs.py"
SPEC = importlib.util.spec_from_file_location("aoe2_docs", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class DocumentationOSTests(unittest.TestCase):
    def test_documentation_paths_are_not_implementation(self):
        self.assertTrue(MODULE.docs_owned_path("docs/FOO.md"))
        self.assertTrue(MODULE.docs_owned_path("README.md"))
        self.assertFalse(MODULE.docs_owned_path("app/page.tsx"))

    def test_infrastructure_requires_semantic_review(self):
        self.assertIn("INFRASTRUCTURE", MODULE.SEMANTIC_REVIEW_RISKS)
        self.assertNotIn("APPLICATION", MODULE.SEMANTIC_REVIEW_RISKS)

    def test_topics_expand_docs_to_documentation(self):
        topics = MODULE.impact_topics(
            ["scripts/aoe2_docs.py"],
            "INFRASTRUCTURE",
        )
        self.assertIn("documentation", topics)
        self.assertIn("release", topics)

    def test_database_topics_are_present(self):
        topics = MODULE.impact_topics(
            ["prisma/schema.prisma"],
            "DATABASE",
        )
        self.assertIn("database", topics)
        self.assertIn("schema", topics)

    def test_current_registry_yields_review_candidates(self):
        candidates = MODULE.candidate_documents(
            ["scripts/aoe2_docs.py", "bin/aoe2war"],
            "INFRASTRUCTURE",
        )
        self.assertTrue(candidates)
        self.assertTrue(all("path" in item for item in candidates))


if __name__ == "__main__":
    unittest.main()
