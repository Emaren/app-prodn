"""F3 sanitized Nightforge observations; never connects or executes."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import subprocess
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from foundry import Rejected
from foundry_secure import SecureJournal, TrustedRepo
from nightforge import diagnose, group_findings

REPO=Path(__file__).resolve().parents[3]
HEAD=subprocess.check_output(["git","-C",str(REPO),"rev-parse","HEAD"],
                             text=True).strip()
ORIGIN=subprocess.check_output(
    ["git","-C",str(REPO),"remote","get-url","origin"],text=True).strip()
TIME="2026-11-10T05:30:00Z"


class NightforgeTests(unittest.TestCase):
    def report(self,kind,data,**kwargs):
        return diagnose(kind,data,lane=kwargs.pop("lane","PRODUCT_C"),
                        source_sha=kwargs.pop("source_sha",HEAD),
                        observed_utc=kwargs.pop("observed_utc",TIME),**kwargs)

    def test_systemd_and_timer_health_never_start_services(self):
        failed=self.report("systemd",{
            "unit":"kingdom-traders-paper.service","active":"failed",
            "timer_age_sec":None})
        self.assertEqual(failed["code"],"SYSTEMD_UNIT_UNHEALTHY")
        self.assertEqual(failed["severity"],"error")
        stale=self.report("systemd",{
            "unit":"traffic-collector.timer","active":"active",
            "timer_age_sec":5000})
        self.assertEqual(stale["code"],"SYSTEMD_TIMER_STALE")
        self.assertFalse(stale["execution_enabled"])

    def test_github_ci_draft_changes_without_mutating_pr(self):
        bad=self.report("github",{
            "repo":"app-prodn","pr":1291,
            "draft":True,"check":"failure"})
        self.assertEqual(bad["code"],"GITHUB_CHECK_FAILED")
        offdraft=self.report("github",{
            "repo":"app-prodn","pr":1291,
            "draft":False,"check":"success"})
        self.assertEqual(offdraft["code"],"GITHUB_PR_NO_LONGER_DRAFT")

    def test_steam_matrix_never_claims_browser_verified(self):
        missing=self.report("steam",{
            "admin_authenticated":True,"ordinary_authenticated":False})
        self.assertEqual(missing["code"],"AUTH_MATRIX_INCOMPLETE")
        complete=self.report("steam",{
            "admin_authenticated":True,"ordinary_authenticated":True})
        self.assertEqual(complete["severity"],"info")
        self.assertFalse(complete["originalMetricsCertified"])

    def test_watcher_connected_does_not_prove_replay_monitoring(self):
        seen=self.report("watcher",{"version":"1.6.5",
            "connected":True,"monitoring":False,"heartbeat_age_sec":30})
        self.assertEqual(seen["code"],"WATCHER_MONITORING_NOT_PROVEN")
        old=self.report("watcher",{"version":"1.6.4",
            "connected":True,"monitoring":True,"heartbeat_age_sec":30})
        self.assertEqual(old["code"],"WATCHER_VERSION_DRIFT")
        stale=self.report("watcher",{"version":"1.6.5",
            "connected":True,"monitoring":True,"heartbeat_age_sec":999})
        self.assertEqual(stale["code"],"WATCHER_SOURCE_STALE")

    def test_traffic_historical_gap_is_not_fabricated_zero(self):
        gap=self.report("traffic",{
            "certified_through":"2026-10-19",
            "expected_through":"2026-11-09",
            "missing_certified_days":0})
        self.assertEqual(gap["code"],"TRAFFIC_CANONICAL_GAP")
        self.assertEqual(gap["severity"],"warning")
        holes=self.report("traffic",{
            "certified_through":"2026-10-19",
            "expected_through":"2026-11-09",
            "missing_certified_days":10})
        self.assertEqual(holes["severity"],"error")
        self.assertNotIn("0 sessions",holes["event"]["summary"])

    def test_storage_visual_insufficient_for_backup_recovery(self):
        low=self.report("storage",{
            "plane":"mac","available_mib":16*1024,"visual_signed":True})
        self.assertEqual(low["code"],"STORAGE_BELOW_RESEARCH_FLOOR")
        unverified=self.report("storage",{
            "plane":"hel1-root","available_mib":40*1024,
            "visual_signed":False})
        self.assertEqual(unverified["code"],"STORAGE_VISUAL_SOURCE_NOT_TRUSTED")
        self.assertFalse(unverified["originalMetricsCertified"])

    def test_private_paper_source_and_halt_breach_are_grouped(self):
        stale=self.report("paper",{
            "source_age_sec":100,"native_crc":False,"orders_halted":True})
        self.assertEqual(stale["code"],"PAPER_SOURCE_NOT_CURRENT_NATIVE")
        breach=self.report("paper",{
            "source_age_sec":1,"native_crc":True,"orders_halted":False})
        self.assertEqual(breach["severity"],"critical")
        self.assertEqual(breach["code"],"PAPER_HALT_BREACH")
        self.assertFalse(breach["execution_enabled"])
        grouped=group_findings((stale,breach,breach))
        self.assertFalse(grouped["execution_enabled"])
        self.assertTrue(any(row["count"]==2 for row in grouped["groups"]))

    def test_media_and_routes_never_leak_real_paths(self):
        broken=self.report("media",{
            "asset_group":"sniper-portrait","missing_count":4})
        self.assertEqual(broken["code"],"MANAGED_MEDIA_MISSING")
        self.assertNotIn("/mnt/",json.dumps(broken["event"]))
        denied=self.report("routes",{
            "route":"profiles","status_code":401,"expected_denial":True})
        self.assertEqual(denied["code"],"EXPECTED_AUTH_DENIAL")
        failure=self.report("routes",{
            "route":"traffic","status_code":500,"expected_denial":False})
        self.assertEqual(failure["severity"],"error")

    def test_hostile_private_log_and_extra_fields_cannot_enter_adapter(self):
        base={"asset_group":"managed-portraits","missing_count":1}
        for extra in ("authorization","cookie","wallet","password","command",
                      "raw_sql","ssh_key","raw_logs"):
            with self.subTest(extra=extra),self.assertRaises(Rejected):
                self.report("media",{**base,extra:"DONOTSTORE"})
        with self.assertRaises(Rejected):
            self.report("media",{**base,"asset_group":"../../FINANCIAL"})

    def test_invalid_dates_counts_and_finance_lanes_refused(self):
        report={"certified_through":"2026-02-30",
                "expected_through":"2026-11-09","missing_certified_days":1}
        with self.assertRaises(Rejected):self.report("traffic",report)
        with self.assertRaises(Rejected):
            self.report("storage",{"plane":"mac",
                "available_mib":float("nan"),"visual_signed":True})
        with self.assertRaises(Rejected):
            self.report("media",{"asset_group":"sniper-portrait",
                "missing_count":1},lane="FINANCIAL")
        with self.assertRaises(Rejected):
            self.report("media",{"asset_group":"sniper-portrait",
                "missing_count":1},observed_utc="2026-02-30T01:02:03Z")

    def test_full_normalized_event_is_f0_schema_and_f1_evidence(self):
        obs=self.report("traffic",{"certified_through":"2026-10-19",
                "expected_through":"2026-11-09",
                "missing_certified_days":1})
        with TemporaryDirectory(prefix="f3-verified-",dir=REPO) as temp:
            folder=Path(temp);folder.chmod(0o700)
            bound=TrustedRepo("app-prodn",REPO,HEAD,
                ORIGIN)
            journal=SecureJournal(folder/"foundry.sqlite",REPO,
                      {("PRODUCT_C","traffic-rollup"):bound})
            try:
                encoded=json.dumps(obs["event"],sort_keys=True).encode()
                first=journal.ingest(encoded,obs["evidence_bytes"])
                self.assertEqual(first["status"],"RECORDED")
                self.assertTrue(first["source_verified"])
                again=journal.ingest(encoded,obs["evidence_bytes"])
                self.assertEqual(again["status"],"DUPLICATE")
            finally:journal.close()

    def test_no_unreviewed_command_or_network_or_llm_in_f3(self):
        source=(REPO/"tools/kingdom-foundry/nightforge.py").read_text()
        for bad in ("subprocess", "Popen(", "requests.", "urllib.request",
                    "os.system", "eval(", "exec(", "send_email(", "place_order("):
            self.assertNotIn(bad,source)
        report=self.report("systemd",{"unit":"nginx.service",
            "active":"active","timer_age_sec":None})
        self.assertTrue(report["event"]["summary"].startswith(
            "Nightforge observation "))
        self.assertFalse(report["execution_enabled"])


if __name__=="__main__":
    unittest.main()
