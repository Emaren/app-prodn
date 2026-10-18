import unittest
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SpecializedQualityProfiles(unittest.TestCase):
    def setUp(self):
        self.contract = json.loads((ROOT / "config/kingdom-index-assurance-profiles.json").read_text())
        self.catalog = json.loads((ROOT / "config/kingdom-index-routes.json").read_text())
        self.rubric = json.loads((ROOT / "config/kingdom-index-quality-rubric.json").read_text())

    def test_every_route_has_single_uniform_100_point_rubric(self):
        self.assertEqual(sum(d["weight"] for d in self.rubric["dimensions"].values()), 100)
        self.assertEqual(self.contract["baseRubric"], "config/kingdom-index-quality-rubric.json")
        self.assertEqual(self.contract["schema"], 1)
        self.assertEqual(len({item["href"] for item in self.catalog}), len(self.catalog))

    def test_specialized_requirements_are_tied_to_real_routes(self):
        known = {item["href"] for item in self.catalog}
        self.assertEqual(set(self.contract["routeProfiles"]) - known, set())
        self.assertIn("/leaderboard", self.contract["routeProfiles"])
        self.assertIn("/kingdom-index", self.contract["routeProfiles"])
        self.assertIn("/bets", self.contract["routeProfiles"])

    def test_specialized_evidence_gates_never_add_points(self):
        dimensions = set(self.rubric["dimensions"])
        for name, profile in self.contract["profiles"].items():
            self.assertGreaterEqual(len(profile["label"]), 4)
            ids = [gate["id"] for gate in profile["gates"]]
            self.assertEqual(len(ids), len(set(ids)), name)
            for gate in profile["gates"]:
                self.assertIn(gate["dimension"], dimensions)
                self.assertGreater(len(gate["requirement"]), 30)
                self.assertNotIn("points", gate)
                self.assertNotIn("score", gate)
        self.assertEqual(self.contract["profiles"]["general"]["gates"], [])

    def test_every_mapping_resolves_known_specialty(self):
        for href, profile in self.contract["routeProfiles"].items():
            self.assertIn(profile, self.contract["profiles"], href)

    def test_api_discloses_unverified_requirement_not_a_claimed_pass(self):
        src = (ROOT / "lib/kingdomIndex.ts").read_text()
        self.assertIn("specializedAssurance:", src)
        self.assertIn('status:"unverified" as const', src)
        self.assertNotIn('status:"verified" as const', src)


if __name__ == "__main__":
    unittest.main()
