"""G R25 P3 source-backed visual contract tests, no host/production effects."""
from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]
def source(name):
    return (ROOT / name).read_text()
def config(name):
    return json.loads((ROOT / name).read_text())

class VisualContracts(unittest.TestCase):
    def test_01_registry_has_14_distinct_subordinate_ids(self):
        data=config("config/aoe2war-os-registry.v1.json")
        self.assertEqual(data["umbrella"]["id"], "aoe2war")
        ids=[a["id"] for a in data["subordinate_os"]]
        self.assertEqual(len(set(ids)),14)
        self.assertIn("orchestra",ids)
        self.assertIn("central-command",ids)
        self.assertEqual(data["counts"]["verified_autonomous_running_os_workers"],None)

    def test_02_roles_not_fake_os_or_workers(self):
        data=config("config/aoe2war-os-registry.v1.json")
        roles=data["supervisory_roles"]
        self.assertEqual({r["id"] for r in roles},
            {"system-doctor","system-shepherd","system-composer"})
        self.assertEqual(next(r["ownership"] for r in roles if r["id"]=="system-composer"),"Orchestra OS")

    def test_03_exact_six_assigned_not_verified_active_lanes(self):
        seed=config("docs/central-agent-ledger/r25-seed.json")
        self.assertFalse(seed["dispatch"]["active_sessions_verified"])
        self.assertEqual({r["lane"] for r in seed["assignments"]},set("BCDEFG"))
        self.assertTrue(all(r["active_session_verified"] is False for r in seed["assignments"]))

    def test_04_source_imports_no_duplicate_collector(self):
        p=source("lib/kingdomEngineeringProjection.ts")
        for original in ("aoe2war-os-registry.v1.json","central-agent-os-bindings.v1.json","r25-seed.json"):
            self.assertIn(original,p)
        for forbidden in ("fetch(","setInterval(","systemctl","exec(","/proc/","ssh ","pg_query("):
            self.assertNotIn(forbidden,p)

    def test_05_public_route_sanitized(self):
        p=source("app/aoe2war-os/[mode]/page.tsx")
        self.assertIn('buildEngineeringProjection("public")',p)
        self.assertIn("dynamicParams = false",p)
        self.assertIn("notFound()",p)
        self.assertIn('return [{ mode: "engineering" }]',p)
        proj=source("lib/kingdomEngineeringProjection.ts")
        self.assertIn('if (audience === "admin")',proj)
        self.assertNotIn("process.env",proj)
        self.assertNotIn("readFileSync",proj)

    def test_06_admin_auth_before_projection(self):
        p=source("app/admin/engineering-os/page.tsx")
        self.assertIn("await requireServerAdmin()",p)
        self.assertLess(p.index("await requireServerAdmin()"),
                        p.index('buildEngineeringProjection("admin")'))
        self.assertIn('robots: { index: false, follow: false }',p)

    def test_07_six_real_graphic_modes_with_both_formations(self):
        p=source("components/kingdom-engineering/EngineeringObservatory.tsx")
        names=["graph","loops","formations","hierarchy","composer","runup"]
        for name in names:
            self.assertIn('id: "'+name+'"',p)
        for graphic in ("GraphMode","LoopsMode","FormationsMode",
                        "HierarchyMode","ComposerMode","RunUpMode"):
            self.assertIn("function "+graphic+"(",p)
        self.assertIn('"swarm" | "army"',p)
        self.assertIn('SWARM FIELD',p)
        self.assertIn('ENGINEERING ARMY',p)

    def test_08_no_phantom_heartbeat_or_live_worker_claim(self):
        p=source("lib/kingdomEngineeringProjection.ts")
        self.assertIn('activeWorkerVerified: false as const',p)
        self.assertIn('workerEvidence: "UNKNOWN" as const',p)
        self.assertIn("liveObservation: false",p)
        self.assertIn("sourceOnly: true",p)
        self.assertIn('id === "SOURCE_EXTRACTED" ? "OWNER_REPORTED" : "UNKNOWN"',p)

    def test_09_release_rail_all_eight_truthful_gates(self):
        p=source("lib/kingdomEngineeringProjection.ts")
        for name in ("SOURCE_RECEIVED","SOURCE_EXTRACTED","BUILD_STAGED",
                     "FINANCIALLY_ISOLATED","PARALLEL_RUNNING","ROUTE_READY",
                     "PUBLIC_ROUTED","LIVE_VERIFIED"):
            self.assertIn('"'+name+'"',p)
        self.assertIn('publicCutoverEvidence: "UNKNOWN"',p)

    def test_10_no_browser_pollers_or_financial_controllers(self):
        p=source("components/kingdom-engineering/EngineeringObservatory.tsx")
        for forbidden in ("useEffect","setInterval","fetch(","WebSocket","EventSource",
                          "window.location","systemctl","/api/admin","POST"):
            self.assertNotIn(forbidden,p)
        self.assertIn("READ-ONLY",p)
        self.assertIn("NO DISPATCH",p)

    def test_11_keyboard_reduced_motion_and_responsive(self):
        p=source("components/kingdom-engineering/EngineeringObservatory.tsx")
        css=source("components/kingdom-engineering/EngineeringObservatory.module.css")
        self.assertIn('role="tablist"',p)
        self.assertIn('onKeyDown=',p)
        self.assertIn('aria-label=',p)
        self.assertIn('prefers-reduced-motion:reduce',css)
        self.assertIn('max-width:650px',css)
        self.assertIn('max-width:1050px',css)

    def test_12_no_frozen_website_or_finance_changes(self):
        # This branch must stay a new read-only surface. No script executes
        # financial or host operations, and routes are entirely additive.
        p=source("components/kingdom-engineering/EngineeringObservatory.tsx")
        self.assertIn("SOURCE VIEW",p)
        self.assertIn("NOT LIVE TELEMETRY",p)
        self.assertNotIn("transferWolo",p)

if __name__ == "__main__":
    unittest.main()
