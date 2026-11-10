"""F8 offline sanitized collector adapters: no live service/vendor authority."""
from __future__ import annotations

from dataclasses import replace
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import subprocess
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from foundry import Rejected
from foundry_secure import SecureJournal, TrustedRepo
from foundry_dispatch import DurableDispatcher
from foundry_dashboard import read_model
from nightforge_collectors import (
    MODE, canonical, review_batch, review_snapshot, seal_offline_fixture
)

ROOT = Path(__file__).resolve().parents[3]
HEAD = subprocess.check_output(["git","-C",str(ROOT),"rev-parse","HEAD"],
                                text=True).strip()
ORIGIN = subprocess.check_output(
    ["git","-C",str(ROOT),"remote","get-url","origin"],
    text=True).strip()
NOW = "2026-11-10T14:00:10Z"
OBSERVED = "2026-11-10T14:00:00Z"

SAMPLES = {
    "systemd":{"unit":"kingdom-traders-paper.service","active":"active",
               "timer_age_sec":None},
    "github":{"repo":"app-prodn","pr":1298,"draft":True,"check":"failure"},
    "steam":{"admin_authenticated":True,"ordinary_authenticated":False},
    "watcher":{"version":"1.6.5","connected":True,"monitoring":False,
               "heartbeat_age_sec":30},
    "traffic":{"certified_through":"2026-10-19",
               "expected_through":"2026-11-09","missing_certified_days":0},
    "storage":{"plane":"mac","available_mib":20000,"visual_signed":False},
    "paper":{"source_age_sec":None,"native_crc":False,"orders_halted":True},
    "media":{"asset_group":"managed-portraits","missing_count":3},
    "routes":{"route":"traffic","status_code":503,"expected_denial":False},
}

class SourceOnlyCollectorTests(unittest.TestCase):

    def fixture(self, kind="traffic", *, data=None, lane="PRODUCT_C",
                claimed_source_sha=HEAD, observed_utc=OBSERVED):
        return seal_offline_fixture(
            kind=kind,lane=lane,observed_utc=observed_utc,
            data=SAMPLES[kind] if data is None else data,
            claimed_source_sha=claimed_source_sha
        )

    def review(self, raw):
        r=review_snapshot(raw,owner_now_utc=NOW)
        self.assertEqual(r["status"],"HOLD_UNVERIFIED_SOURCE_NO_TASK_ADMISSION")
        self.assertEqual(r["sourceGitSHA"],"unknown")
        self.assertFalse(r["sourceIndependenceVerified"])
        self.assertFalse(r["collectorSourceApproved"])
        self.assertFalse(r["dispatchAllowed"])
        self.assertFalse(r["financeAllowed"])
        self.assertFalse(r["newPaperOrdersAllowed"])
        self.assertFalse(r["realExchangeOrdersAllowed"])
        self.assertFalse(r["executionEnabled"])
        self.assertEqual(r["event"]["source_sha"],"unknown")
        self.assertTrue(r["event"]["evidence_ref"].startswith("receipt://event/"))
        self.assertEqual(
            r["event"]["evidence_ref"],
            "receipt://event/"+sha256(r["evidence_bytes"]).hexdigest())
        self.assertEqual(json.loads(r["evidence_bytes"])["schema"],
                         "kingdom.foundry.evidence.v2")
        return r

    def test_all_nine_sanitized_product_collectors_are_source_hold(self):
        for kind in SAMPLES:
            with self.subTest(kind=kind):
                receipt=self.review(self.fixture(kind))
                self.assertEqual(receipt["kind"],kind)
                self.assertIn(receipt["severity"],
                              ("info","warning","error","critical"))
                self.assertTrue(receipt["investigationOnly"])
                self.assertFalse(receipt["nativeServiceStateVerified"])
                self.assertFalse(receipt["observedTimeExternallyAttested"])

    def test_github_failure_not_automatically_merged(self):
        item=self.review(self.fixture("github"))
        self.assertEqual(item["code"],"GITHUB_CHECK_FAILED")
        self.assertEqual(item["severity"],"error")
        self.assertFalse(item["dispatchAllowed"])

    def test_traffic_gaps_are_unknown_not_invented_counts(self):
        raw=self.fixture("traffic")
        result=self.review(raw)
        self.assertEqual(result["code"],"TRAFFIC_CANONICAL_GAP")
        self.assertEqual(result["severity"],"warning")
        self.assertNotIn("0 humans",json.dumps({
            k:v for k,v in result.items() if k!="evidence_bytes"}))

    def test_PAPER_source_crc_self_claim_not_funding_approval(self):
        pulse={"source_age_sec":1,"native_crc":True,"orders_halted":True}
        result=self.review(self.fixture("paper",data=pulse))
        self.assertEqual(result["code"],"PAPER_HALT_REMAINS_ACTIVE")
        self.assertFalse(result["realExchangeOrdersAllowed"])
        self.assertFalse(result["newPaperOrdersAllowed"])
        pulse["orders_halted"]=False
        alarming=self.review(self.fixture("paper",data=pulse))
        self.assertEqual(alarming["code"],"PAPER_HALT_BREACH")
        self.assertEqual(alarming["severity"],"critical")

    def test_missing_media_and_route_errors_are_not_real_http_receipts(self):
        media=self.review(self.fixture("media"))
        self.assertEqual(media["code"],"MANAGED_MEDIA_MISSING")
        route=self.review(self.fixture("routes"))
        self.assertEqual(route["code"],"PRODUCT_ROUTE_ERROR")
        self.assertFalse(route["nativeServiceStateVerified"])

    def test_batch_groups_sanitized_codes_not_hostile_raw_text(self):
        batch=review_batch(tuple(self.fixture(kind) for kind in SAMPLES),
                           owner_now_utc=NOW)
        self.assertEqual(batch["count"],9)
        self.assertFalse(batch["executionEnabled"])
        self.assertEqual(batch["networkCalls"],0)
        self.assertEqual(sum(x["count"] for x in
                         batch["triage"]["groups"]),9)

    def test_invalid_duplicate_raw_json_key_rejected(self):
        raw=self.fixture()
        duplicate=raw.replace(b'"kind":"traffic"',
                              b'"kind":"traffic","kind":"traffic"')
        with self.assertRaisesRegex(Rejected,"DUPLICATE_JSON_KEY"):
            self.review(duplicate)

    def test_original_exact_digest_refuses_fixture_tamper(self):
        raw=self.fixture("media")
        mutated=raw.replace(b'"missing_count":3',b'"missing_count":4')
        with self.assertRaisesRegex(Rejected,"CONTENT_MISMATCH"):
            self.review(mutated)

    def test_secret_fields_paths_and_command_text_rejected(self):
        for bad in (
            {"cookie":"I-should-not-be-here"},
            {"authorization":"Bearer something"},
            {"financialSQL":"never touch"},
            {"command":"sudo whoami"},
            {"secret":"hidden"},
            {"raw_stderr":"/root/FINANCIAL"},
        ):
            data={**SAMPLES["media"],**bad}
            with self.subTest(field=next(iter(bad))),self.assertRaises(Rejected):
                self.review(self.fixture("media",data=data))
        with self.assertRaises(Rejected):
            self.review(self.fixture("systemd",data={
                "unit":"../../FINANCIAL/private.service",
                "active":"failed","timer_age_sec":None}))

    def test_forced_production_capture_mode_and_auth_spoof_refused(self):
        base=json.loads(self.fixture())
        for patch in (
            {"mode":"PRODUCTION_NATIVE_VERIFIED"},
            {"lane":"FINANCIAL"},
            {"schema":"system.raw-log.v1"},
            {"claimed_source_sha":"0"*64},
        ):
            with self.subTest(patch=patch):
                altered={**base,**patch}
                altered["snapshot_sha256"]=sha256(canonical({
                    k:v for k,v in altered.items() if k!="snapshot_sha256"
                })).hexdigest()
                with self.assertRaises(Rejected):
                    self.review(canonical(altered))

    def test_stale_future_and_invalid_owner_wallclock_refused(self):
        for observed in ("2026-11-09T12:00:00Z",
                         "2026-11-10T14:00:11Z"):
            with self.subTest(observed=observed),self.assertRaisesRegex(
                    Rejected,"REPLAY_OR_FUTURE"):
                self.review(self.fixture(observed_utc=observed))
        with self.assertRaises(Rejected):
            review_snapshot(self.fixture(),owner_now_utc="nonsense")

    def test_input_and_batch_budgets_refuse_resource_exhaustion(self):
        with self.assertRaisesRegex(Rejected,"MAX_INPUT_BYTES"):
            self.review(b" "*4097)
        with self.assertRaisesRegex(Rejected,"BATCH_CAP"):
            review_batch((),owner_now_utc=NOW)
        with self.assertRaisesRegex(Rejected,"BATCH_CAP"):
            review_batch((self.fixture(),)*21,owner_now_utc=NOW)
        with self.assertRaisesRegex(Rejected,"DUPLICATE_SNAPSHOT_BATCH"):
            review_batch((self.fixture(),self.fixture()),owner_now_utc=NOW)

    def test_separate_same_kind_observations_dont_collapse_in_F1(self):
        with TemporaryDirectory(prefix="foundry-f8-ledger-",dir=ROOT) as dirname:
            folder=Path(dirname)
            folder.chmod(0o700)
            repo=TrustedRepo("app-prodn",ROOT,HEAD,ORIGIN)
            journal=SecureJournal(folder/"f8.sqlite",ROOT,
                       {("PRODUCT_C","app-media"):repo})
            try:
                samples=(
                    self.review(self.fixture("media",data={
                        "asset_group":"managed-portraits","missing_count":3})),
                    self.review(self.fixture("media",data={
                        "asset_group":"managed-portraits","missing_count":4})),
                )
                ids=[]
                for observation in samples:
                    result=journal.ingest(
                        canonical(observation["event"]),
                        observation["evidence_bytes"])
                    self.assertEqual(result["status"],"HOLD")
                    self.assertFalse(result["source_verified"])
                    ids.append(result["sequence"])
                self.assertEqual(ids,[1,2])
                self.assertEqual(len(journal.rows()),2)
                again=journal.ingest(canonical(samples[0]["event"]),
                                      samples[0]["evidence_bytes"])
                self.assertEqual(again["status"],"DUPLICATE")
                self.assertEqual(again["sequence"],1)
                scheduler=DurableDispatcher(journal)
                for seq in ids:
                    with self.assertRaisesRegex(Rejected,
                         "UNQUALIFIED_SOURCE_EVENT"):
                        scheduler.enqueue(seq,f"app-prodn:foundry/f8-{seq}",
                                          now_ms=1800000000000)
            finally: journal.close()

    def test_v2_fake_git_sha_with_valid_commit_still_stored_HOLD(self):
        with TemporaryDirectory(prefix="foundry-f8-forge-",dir=ROOT) as dirname:
            folder=Path(dirname);folder.chmod(0o700)
            repo=TrustedRepo("app-prodn",ROOT,HEAD,ORIGIN)
            journal=SecureJournal(folder/"f8.sqlite",ROOT,
                       {("PRODUCT_C","app-media"):repo})
            try:
                report=self.review(self.fixture("media"))
                event=dict(report["event"])
                event["source_sha"]=HEAD
                status=journal.ingest(canonical(event),report["evidence_bytes"])
                self.assertEqual(status["status"],"HOLD")
                self.assertFalse(status["source_verified"])
                # No private auth/finance approval even when the Git
                # checkout is real: evidence v2 remains a local fixture.
                self.assertEqual(journal.rows()[0][-1],"HOLD")
            finally:journal.close()

    def test_no_OS_commands_broker_HTTP_or_llm_code(self):
        source=(ROOT/"tools/kingdom-foundry/nightforge_collectors.py").read_text()
        for banned in (
            "subprocess", "Popen(", "requests.", "urlopen(", "socket.",
            "os.system", "openai.", "exec(", "eval(", "os.system",
            "create_order(", "deploy(", "psycopg", "sqlite3.connect(",
        ):
            self.assertNotIn(banned,source)
        self.assertIn("never\ninvokes",source)

if __name__=="__main__":
    unittest.main()
