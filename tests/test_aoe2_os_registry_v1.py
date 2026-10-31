"""R25 D: immutable OS identity/alias census. No live-worker attestations."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "config" / "aoe2war-os-registry.v1.json"
CONSTELLATION = {"release", "documentation", "storage", "host", "recovery",
                 "workspace", "speed", "replay-truth"}
PROPOSED = {"deployment", "orchestra", "agent", "swarm", "wolochain"}

class OSRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.value = json.loads(REGISTRY.read_text(encoding="utf-8"))
        cls.nodes = cls.value["subordinate_os"]

    def test_version_and_original_source(self):
        self.assertEqual(self.value["schema"], "aoe2war.os.census.v1")
        self.assertEqual(self.value["source_input"]["pull_request"], 1090)
        self.assertEqual(len(self.value["source_input"]["head_sha"]), 40)

    def test_ids_are_unique_immutable_and_namespaced(self):
        ids=[x["id"] for x in self.nodes]
        namespaced=[x["canonical_id"] for x in self.nodes]
        self.assertEqual(len(ids),len(set(ids)))
        self.assertEqual(len(namespaced),len(set(namespaced)))
        for x in self.nodes:
            self.assertEqual(x["canonical_id"],"aoe2war.os."+x["id"])
            self.assertIs(x["immutable_id"],True)
            self.assertTrue(x["authority_domain"])
            self.assertTrue(x["source_authorities"])
            self.assertTrue(x["value_gate"])

    def test_eight_public_do_not_include_doctor(self):
        self.assertTrue(CONSTELLATION.issubset({n["id"] for n in self.nodes}))
        self.assertEqual(self.value["counts"]["confirmed_constellation_os"],8)
        self.assertNotIn("system-doctor",{n["id"] for n in self.nodes})
        self.assertNotIn("system-shepherd",{n["id"] for n in self.nodes})

    def test_existing_central_and_code_health_distinct(self):
        by_id={n["id"]:n for n in self.nodes}
        for x in ("central-command","code-health"):
            self.assertEqual(by_id[x]["lifecycle"],"source-present")
        self.assertIn("scripts/aoe2_code_health.py",
                      by_id["code-health"]["source_authorities"])

    def test_proposed_are_not_proven_live(self):
        by_id={n["id"]:n for n in self.nodes}
        self.assertTrue(PROPOSED.issubset(by_id))
        for ident in PROPOSED:
            self.assertIn(by_id[ident]["lifecycle"],{"proposed","draft-unmerged"})
            self.assertEqual(by_id[ident]["live_deployment_proof"],"UNVERIFIED")
        self.assertIsNone(self.value["counts"]["verified_autonomous_running_os_workers"])

    def test_performance_alias_owned_by_speed(self):
        by_id={n["id"]:n for n in self.nodes}
        self.assertIn("Performance OS",by_id["speed"]["aliases"])
        self.assertNotIn("performance",by_id)
        evidence=[x for x in self.value["unreconciled_named_capabilities"]
                  if x["name"]=="Performance OS"][0]
        self.assertEqual(evidence["resolution"],"alias")
        self.assertEqual(evidence["canonical_os_id"],"aoe2war.os.speed")

    def test_renaissance_not_extra_domain(self):
        names={n["id"] for n in self.nodes}
        self.assertNotIn("renaissance",names)
        overlay=[x for x in self.value["unreconciled_named_capabilities"]
                 if x["name"]=="Renaissance OS"][0]
        self.assertEqual(overlay["resolution"],"integration-facet-not-independent-domain")

    def test_planning_count_is_not_live_os_count(self):
        counts=self.value["counts"]
        self.assertEqual(counts["planned_subordinate_os_total"],len(self.nodes))
        self.assertEqual(counts["planned_total_including_umbrella"],len(self.nodes)+1)
        self.assertEqual(counts["planned_additional_subordinate_identities"],5)
        self.assertEqual(counts["additional_existing_code_health_os_source"],1)
        self.assertIsNone(counts["systemwide_unique_operational_os_total"])

    def test_supervisory_roles_do_not_become_os(self):
        for role in self.value["supervisory_roles"]:
            self.assertIs(role["not_subordinate_os"],True)
            self.assertTrue(role["canonical_id"].startswith("aoe2war.role."))

    def test_alias_and_source_do_not_grant_financial_rights(self):
        for node in self.nodes:
            self.assertIs(node["has_exclusive_financial_authority"],False)
            self.assertEqual(node["native_runtime_proof"],"UNVERIFIED")

    def test_agent_count_unproven(self):
        truth=self.value["agent_runtime_truth"]
        self.assertEqual(truth["allocated_owner_relays"],6)
        self.assertIsNone(truth["observed_autonomous_agents"])
        self.assertIsNone(truth["verified_live_worker_count"])

    def test_priority_preservation(self):
        self.assertTrue(any("P0" in x and "P3" in x for x in self.value["rules"]))

if __name__ == "__main__":
    unittest.main()
