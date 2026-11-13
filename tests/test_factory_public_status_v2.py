import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

SOURCE=Path(__file__).resolve().parents[1]/"docs/release/artifacts/aoe2war_factory_public_status_v2.py"
spec=importlib.util.spec_from_file_location("factory_public_status_v2",SOURCE)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
NOW="2026-11-13T23:00:00.000Z"

class FactoryPublicStatusTests(unittest.TestCase):
    def host(self,summary):
        with patch.object(m,"iso_now",return_value=NOW), \
             patch.object(m,"trusted_web_identity",return_value=(1,"f"*40,"new_build","/fixture")), \
             patch.object(m,"journal_for",return_value=({"timestamp":"2020-01-01T00:00:00Z"},Path("/fixture"))), \
             patch.object(m,"previous_from_journal",return_value=("e"*40,"old_build")), \
             patch.object(m,"public_release_summary",return_value=summary), \
             patch.object(m,"status",side_effect=lambda route,port=3032:
                503 if route=="/api/bets" else 401 if route=="/api/auth/session" else 200):
            return m.make()[0]

    def summary(self,events=()):
        return {"schema":"aoe2war.product.release-summary.v1","sourceSha":"f"*40,
            "buildId":"new_build","generatedAt":NOW,"startKind":"unknown",
            "firstVerifiedProductionMs":None,"finalAcceptedMs":None,
            "clocksUncertaintyMs":None,"provenanceUrl":None,
            "stages":[{"event":event,"state":"pass","at":NOW,
                "durationMs":10,"proofSha256":"a"*64} for event in events]}

    def test_current_host_health_never_invents_pipeline_or_security_proof(self):
        value=self.host(self.summary())
        self.assertTrue(all(state=="unknown" for state in value["pipelineStage"]["stages"].values()))
        self.assertEqual(value["liveRelease"]["buildId"],"new_build")
        self.assertEqual(value["previousRelease"]["buildId"],"old_build")
        self.assertEqual(value["recentActivity"],[])
        for group in value["testGroups"]:
            if group["id"]!="release":
                self.assertEqual(group["state"],"unknown")
                self.assertIsNone(group["passed"])
            else:
                self.assertEqual((group["passed"],group["total"]),(5,5))

    def test_full_rollback_needs_three_distinct_milestones(self):
        value=self.host(self.summary(("T8","T9")))
        self.assertEqual(value["pipelineStage"]["stages"]["rollback"],"unknown")
        value=self.host(self.summary(("T8","T9","T10")))
        self.assertEqual(value["pipelineStage"]["stages"]["rollback"],"pass")

    def test_expired_summary_or_stage_is_stale(self):
        summary=self.summary(("T4",))
        summary["generatedAt"]="2026-11-11T23:00:00.000Z"
        self.assertEqual(self.host(summary)["pipelineStage"]["stages"]["build"],"stale")
        summary=self.summary(("T4",))
        summary["stages"][0]["at"]="2026-11-11T23:00:00.000Z"
        self.assertEqual(self.host(summary)["pipelineStage"]["stages"]["approve"],"stale")

    def test_wrong_source_or_missing_receipt_fails_closed(self):
        obj=self.summary(("T4",));obj["sourceSha"]="a"*40
        class Metadata:
            st_size=1000
        with patch.object(Path,"exists",return_value=True), \
             patch.object(Path,"lstat",return_value=Metadata()), \
             patch.object(m,"root_file",return_value=json.dumps(obj).encode()):
            self.assertEqual(m.public_release_summary(Path("/fixture"),"f"*40,"new_build",NOW)["stages"],[])
        obj=self.summary(("T4",));obj["stages"][0]["proofSha256"]=None
        with patch.object(Path,"exists",return_value=True), \
             patch.object(Path,"lstat",return_value=Metadata()), \
             patch.object(m,"root_file",return_value=json.dumps(obj).encode()):
            self.assertEqual(m.public_release_summary(Path("/fixture"),"f"*40,"new_build",NOW)["stages"][0]["state"],"unknown")

if __name__=="__main__":
    unittest.main()
