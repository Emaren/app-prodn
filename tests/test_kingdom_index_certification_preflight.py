"""Fail-closed Renaissance first-page planning contract (no invented score)."""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import kingdom_index_certification_preflight as preflight  # noqa: E402


class FirstPagePreflightContract(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "config").mkdir()
        rubric = json.loads((ROOT / "config/kingdom-index-quality-rubric.json").read_text())
        profiles = json.loads((ROOT / "config/kingdom-index-assurance-profiles.json").read_text())
        (self.root / "config/kingdom-index-quality-rubric.json").write_text(json.dumps(rubric))
        (self.root / "config/kingdom-index-assurance-profiles.json").write_text(json.dumps(profiles))
        (self.root / "config/kingdom-index-routes.json").write_text(
            json.dumps([{"href": "/kingdom-index", "sourceTree": "src-fake"}]))
        (self.root / "config/kingdom-index-inventory.json").write_text(
            json.dumps({"pages": [{"href": "/kingdom-index", "entrypoint":
                                    "app/kingdom-index/page.tsx", "scope": "public-index"}]}))
        (self.root / "app/kingdom-index").mkdir(parents=True)
        (self.root / "app/kingdom-index/page.tsx").write_text("export default function Page(){ return null; }")

    def tearDown(self):
        self.temp.cleanup()

    def report(self):
        known = preflight.known_sources(self.root)
        return preflight.plan_for_route(self.root, "/kingdom-index", known)

    def test_twenty_criteria_100_points_three_index_gates_no_grade(self):
        report = self.report()
        self.assertEqual(report["maximum"], 100)
        self.assertEqual(len(report["criteria"]), 20)
        self.assertEqual(sum(x["maximum"] for x in report["criteria"]), 100)
        self.assertEqual(len(report["required_gates"]), 3)
        self.assertEqual({x["id"] for x in report["required_gates"]},
                         {"source-closure", "score-verification", "staleness"})
        self.assertIsNone(report["grade"])
        self.assertFalse(report["certified"])
        self.assertFalse(report["publication_authorized"])
        self.assertEqual(report["status"], "PRECERTIFICATION_BLOCKED")
        self.assertTrue(report["independent_blockers"])

    def test_rubric_drift_refuses_not_reweights(self):
        file = self.root / "config/kingdom-index-quality-rubric.json"
        rubric = json.loads(file.read_text())
        rubric["dimensions"]["tests"]["criteria"][0]["max"] += 1
        file.write_text(json.dumps(rubric))
        with self.assertRaisesRegex(ValueError, "allocation drift"):
            self.report()

    def test_unregistered_route_refuses(self):
        with self.assertRaisesRegex(ValueError, "not registered"):
            preflight.plan_for_route(self.root, "/admin", preflight.known_sources(self.root))

    def test_missing_assurance_profile_refuses(self):
        file = self.root / "config/kingdom-index-assurance-profiles.json"
        profiles = json.loads(file.read_text())
        del profiles["routeProfiles"]["/kingdom-index"]
        file.write_text(json.dumps(profiles))
        with self.assertRaisesRegex(ValueError, "Missing registered"):
            self.report()

    def test_committed_localization_data_changes_route_dependency_closure(self):
        # @/messages is a real tsconfig alias subtree outside historical
        # module roots; a translation change must invalidate page source proof.
        messages = self.root / "messages"
        messages.mkdir()
        locale = messages / "en.json"
        locale.write_text('{"title":"old"}')
        entry = self.root / "app/kingdom-index/page.tsx"
        entry.write_text('import strings from "@/messages/en.json";\\n'
                         'export default function Page(){ return strings.title; }')
        report = self.report()["lexical_source"]
        self.assertEqual(report["unresolved_local_imports"], [])
        previous = report["closure"]
        locale.write_text('{"title":"new"}')
        self.assertNotEqual(previous, self.report()["lexical_source"]["closure"])

    def test_dependency_fingerprint_and_missing_source_refusal(self):
        a = self.report()["lexical_source"]["closure"]
        file = self.root / "app/kingdom-index/page.tsx"
        file.write_text("export default function Page(){ return <main/>; }")
        self.assertNotEqual(a, self.report()["lexical_source"]["closure"])
        file.unlink()
        with self.assertRaisesRegex(preflight.DependencyEvidenceError, "No statically known page"):
            self.report()


if __name__ == "__main__":
    unittest.main()
