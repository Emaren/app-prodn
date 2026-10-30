"""88-route evidence machinery: read-only contracts and conservative invalidation."""
from __future__ import annotations
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("factory",ROOT/"scripts/renaissance_88_plan.py")
factory=importlib.util.module_from_spec(spec)
spec.loader.exec_module(factory)

class PublicFactoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan=factory.make_plan(ROOT)
    def test_all_88_are_distinct_public_only_and_source_aligned(self):
        p=self.plan
        self.assertEqual(len(p["routes"]),88)
        self.assertEqual(len(set(x["route"] for x in p["routes"])),88)
        self.assertEqual(p["planned_public"],88)
        self.assertEqual(len(p["phase_order"]),7)
        self.assertEqual(p["actual_templates"],151)
        self.assertEqual(p["actual_handlers"],282)
        self.assertTrue(all(x["category"] in ("public_index_static","public_alias_redirect") for x in p["routes"]))
        self.assertTrue(all(x["source_closure_complete"] is False for x in p["routes"]))
        self.assertFalse(p["production_certified"])
        self.assertIsNone(p["score"])
    def test_canonical_redirects_are_determined_from_source_not_guessed(self):
        rows={x["route"]:x for x in self.plan["routes"]}
        expected={"/about":"/requests","/belts":"/champions",
                  "/nations":"/national-champions","/realm":"/kingdom",
                  "/roadmap":"/requests","/users":"/players",
                  "/wolo-1":"/wolo"}
        for alias,target in expected.items():
            self.assertEqual(rows[alias]["category"],"public_alias_redirect")
            self.assertEqual(rows[alias]["redirect_to"],target)
        self.assertIsNone(rows["/"]["redirect_to"])
        self.assertEqual(sum(r["category"]=="public_alias_redirect"
                             for r in self.plan["routes"]),7)
    def test_all_specialized_profiles_exist_without_scored_criteria(self):
        for row in self.plan["routes"]:
            self.assertIsInstance(row["specialty_gates"],list)
            self.assertIsNone(row["quality_score"])
            self.assertEqual(row["evidence"]["p75_p95"],"UNMEASURED")
            self.assertFalse(row["certified"])
            self.assertIn(row["profile"],("general","rankings","betting","media",
                "challenges","citizen","battlerecords","belts","index","release"))
    def test_overlay_exclusions_are_source_indicated_not_proof(self):
        routes={x["route"]:x for x in self.plan["routes"]}
        for prefix in ("/academy","/speed","/statistics","/traffic"):
            self.assertEqual(routes[prefix]["overlay_source_policy"]["theme"],"EXCLUDED_BY_POLICY")
        self.assertTrue(routes["/kingdom"]["overlay_source_policy"]["speed_explicit_route"])
        self.assertTrue(routes["/leaderboard"]["overlay_source_policy"]["gray_enrolled"])
        self.assertEqual(routes["/kingdom-index"]["overlay_source_policy"]["speed_readiness"],"UNMEASURED")
        self.assertEqual(routes["/wargraph"]["overlay_source_policy"]["living_eligibility"],"NO_BY_POLICY")
    def test_source_impact_never_says_unaffected_when_compiled_closure_unknown(self):
        p=self.plan
        for paths in ([p["routes"][0]["entrypoint"]],["app/layout.tsx"],
                      ["lib/adminJourneyIntelligence.ts"],["prisma/schema.prisma"],
                      ["docs/SITE_THEME_CAMPAIGN.md"]):
            result=factory.impact(p,paths)
            self.assertEqual(len(result["invalidated_routes"]),88)
            self.assertEqual(result["certified_unaffected_routes"],[])
            self.assertEqual(result["reason"],"FAIL_CLOSED_UNPROVEN_COMPILED_CLOSURE")
        with self.assertRaises(ValueError):factory.impact(p,["../../secrets"])
    def test_missing_exact_build_id_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)
            (p/"server").mkdir()
            (p/"BUILD_ID").write_text("expected_12345")
            (p/"server"/"app-paths-manifest.json").write_text(json.dumps({"/page":"app/page.js"}))
            with self.assertRaisesRegex(ValueError,"BUILD_ID"):
                factory.make_plan(ROOT,build=p,expected_build_id="wrong_BUILD")
    def test_candidate_scope_is_separate_from_watcher(self):
        self.assertEqual(self.plan["phase_order"],["I","II","III","IV","V","VI","VII"])
        self.assertNotIn("/watcher",[r["route"] for r in self.plan["routes"]])
        self.assertEqual(self.plan["historical_baseline"],{"pages":144,"handlers":273})
        self.assertEqual(self.plan["build"]["status"],"NOT_PROVIDED")
if __name__=="__main__":unittest.main()
