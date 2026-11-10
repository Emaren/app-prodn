"""F2 deterministic SQLite transaction, idempotence and crash recovery tests."""
from __future__ import annotations
from hashlib import sha256
from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import subprocess
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from foundry import Rejected, SCHEMA
from foundry_secure import SecureJournal, TrustedRepo
from foundry_dispatch import DurableDispatcher

REPO=Path(__file__).resolve().parents[3]
HEAD=subprocess.check_output(["git","-C",str(REPO),"rev-parse","HEAD"],
                             text=True).strip()
ORIGIN=subprocess.check_output(
    ["git","-C",str(REPO),"remote","get-url","origin"],text=True).strip()
EVIDENCE=json.dumps({"schema":"kingdom.foundry.evidence.v1",
                     "source":"source-tests","status":"FAILED"},
                    sort_keys=True,separators=(",",":")).encode()
EVIDENCE_REF="receipt://event/"+sha256(EVIDENCE).hexdigest()


class DispatcherTests(unittest.TestCase):
    def setUp(self):
        self.tmp=TemporaryDirectory(prefix="f2-durable-",dir=REPO)
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.root.chmod(0o700)
        self.file=self.root/"source-v1.sqlite"
        self.bind=TrustedRepo("app-prodn",REPO,HEAD,
                              ORIGIN)
        self.roster={(lane,"source-tests"):self.bind
                     for lane in ("PRODUCT_B","PRODUCT_C")}
        self.journal=SecureJournal(self.file,REPO,self.roster)
        self.addCleanup(self.journal.close)
        self.scheduler=DurableDispatcher(self.journal,daily_cap_cents=100,
                                         max_jobs_per_day=10)
        self.clock=1_800_000_000_000

    def event(self,index,*,lane="PRODUCT_C",kind="test_failure",
              source_sha=HEAD,severity="warning"):
        return json.dumps({
            "schema_version":SCHEMA,
            "event_id":f"foundry-dispatcher-test-{index:04d}",
            "observed_utc":"2026-11-10T05:00:00Z",
            "source":"source-tests","lane":lane,"kind":kind,
            "severity":severity,"source_sha":source_sha,
            "summary":"Bounded PRODUCT test failure",
            "evidence_ref":EVIDENCE_REF},sort_keys=True).encode()

    def task(self,index,*,kind="test_failure",lane="PRODUCT_C",cost=10,
             prkey=None,deps=(),sha=HEAD):
        record=self.journal.ingest(
            self.event(index,lane=lane,kind=kind,source_sha=sha),EVIDENCE)
        return self.scheduler.enqueue(record["sequence"],
             prkey or f"app-prodn:foundry/{index:03d}",dependencies=deps,
             estimated_cost_cents=cost,now_ms=self.clock)

    def claim(self,**kw):
        return self.scheduler.claim("PRODUCT_C",worker="nightforge-test",
                                    now_ms=self.clock,lease_ms=1000,**kw)

    def test_one_product_lane_claim_is_scheduler_only(self):
        job=self.task(1)
        self.assertEqual(job["status"],"WAITING")
        claim=self.claim()
        self.assertEqual(claim["status"],"CLAIMED_SIMULATION_ONLY")
        self.assertEqual(claim["job_id"],job["job_id"])
        self.assertFalse(claim["execution_enabled"])
        self.assertEqual(self.scheduler.snapshot()["executor"],"DISABLED")
        self.assertEqual(self.scheduler.snapshot()["model_calls"],0)
        self.assertEqual(self.scheduler.snapshot()["shell_commands"],0)

    def test_task_and_pr_key_duplicate_suppressed_persistently(self):
        first=self.task(1)
        dup=self.scheduler.enqueue(1,"app-prodn:foundry/002",
             now_ms=self.clock,estimated_cost_cents=0)
        self.assertEqual(dup["status"],"DUPLICATE_QUEUE_OR_PR")
        second=self.journal.ingest(self.event(2,kind="ci_failure"),EVIDENCE)
        same_pr=self.scheduler.enqueue(second["sequence"],
            "app-prodn:foundry/001",estimated_cost_cents=0,now_ms=self.clock)
        self.assertEqual(same_pr["status"],"DUPLICATE_QUEUE_OR_PR")
        self.assertEqual(same_pr["job_id"],first["job_id"])
        self.assertEqual(self.scheduler.snapshot()["queue"]["WAITING"],1)

    def test_dependencies_require_completed_prior_job_not_queued(self):
        ancestor=self.task(1)
        younger=self.task(2,kind="ci_failure",deps=(ancestor["job_id"],))
        first=self.claim()
        self.assertEqual(first["job_id"],ancestor["job_id"])
        self.assertEqual(self.claim()["status"],"NO_ADMITTED_QUEUE_OR_BUDGET")
        self.scheduler.settle(first["job_id"],first["lease_token"],
            now_ms=self.clock,result="DONE",cost_cents=5)
        next_one=self.claim()
        self.assertEqual(next_one["job_id"],younger["job_id"])

    def test_dependency_cycle_backedge_and_cross_lane_rejected(self):
        oldest=self.task(1)
        with self.assertRaisesRegex(Rejected,"DEPENDENCY"):
            self.task(2,kind="ci_failure",deps=(99,))
        with self.assertRaisesRegex(Rejected,"INVALID_QUEUE"):
            self.task(3,kind="watcher_drift",deps=(oldest["job_id"],)*2)
        b=self.task(4,lane="PRODUCT_B",kind="storage_pressure")
        with self.assertRaisesRegex(Rejected,"CROSS_LANE"):
            self.task(5,kind="paper_source_stale",deps=(b["job_id"],))

    def test_rate_limit_pause_persists_across_scheduler_reconnect(self):
        self.task(1)
        self.scheduler.pause_lane("PRODUCT_C",self.clock+30_000,
                                  now_ms=self.clock)
        resumed=SecureJournal(self.file,REPO,self.roster)
        self.addCleanup(resumed.close)
        second=DurableDispatcher(resumed, daily_cap_cents=100)
        hold=second.claim("PRODUCT_C",worker="nightforge-test",
                          now_ms=self.clock+5_000)
        self.assertEqual(hold["status"],"RATE_LIMIT_PAUSE")
        ready=second.claim("PRODUCT_C",worker="nightforge-test",
                          now_ms=self.clock+30_000)
        self.assertEqual(ready["status"],"CLAIMED_SIMULATION_ONLY")

    def test_previous_claim_cannot_ack_after_expiry_restart(self):
        self.task(1)
        first=self.claim()
        reopened=SecureJournal(self.file,REPO,self.roster)
        self.addCleanup(reopened.close)
        another=DurableDispatcher(reopened,daily_cap_cents=100)
        later=another.claim("PRODUCT_C",worker="other-worker",
            now_ms=self.clock+1001,lease_ms=1000)
        self.assertEqual(later["attempt"],2)
        self.assertEqual(later["job_id"],first["job_id"])
        with self.assertRaisesRegex(Rejected,"EXPIRED_OR_REPLAYED"):
            another.settle(first["job_id"],first["lease_token"],
                           now_ms=self.clock+1001,result="DONE")
        self.assertEqual(another.settle(later["job_id"],later["lease_token"],
                         now_ms=self.clock+1001,result="DONE")["status"],"DONE")
        self.assertEqual(another.claim("PRODUCT_C",worker="other-worker",
                 now_ms=self.clock+1002)["status"],"NO_ADMITTED_QUEUE_OR_BUDGET")

    def test_bounded_retries_stop_on_third_attempt(self):
        self.task(1)
        for attempt in (1,2,3):
            self.clock+=2000
            claim=self.claim()
            self.assertEqual(claim["attempt"],attempt)
            result=self.scheduler.settle(claim["job_id"],claim["lease_token"],
                now_ms=self.clock,result="RETRYABLE_FAILURE")
            self.assertEqual(result["status"],"HOLD" if attempt==3 else "WAITING")
        self.clock+=2000
        self.assertEqual(self.claim()["status"],"NO_ADMITTED_QUEUE_OR_BUDGET")

    def test_heartbeat_has_finite_max_and_token_cannot_be_guessed(self):
        self.task(1)
        claim=self.claim()
        with self.assertRaises(Rejected):
            self.scheduler.heartbeat(claim["job_id"],"fake",
                                     now_ms=self.clock+10)
        proof=self.scheduler.heartbeat(claim["job_id"],claim["lease_token"],
                now_ms=self.clock+500,extend_ms=30_000)
        self.assertEqual(proof["status"],"HEARTBEAT_RECEIPT_ONLY")
        self.assertLessEqual(proof["expires_ms"],self.clock+120_000)
        with self.assertRaises(Rejected):
            self.scheduler.settle(claim["job_id"],claim["lease_token"],
                                  now_ms=self.clock+120_001,result="DONE")

    def test_cost_reservations_and_daily_cap_are_durable(self):
        self.task(1,cost=80)
        self.task(2,kind="ci_failure",cost=50)
        first=self.claim()
        self.assertEqual(first["job_id"],1)
        self.assertEqual(self.claim()["status"],"NO_ADMITTED_QUEUE_OR_BUDGET")
        self.scheduler.settle(first["job_id"],first["lease_token"],
            now_ms=self.clock,result="DONE",cost_cents=20)
        next_one=self.claim()
        self.assertEqual(next_one["job_id"],2)
        with self.assertRaisesRegex(Rejected,"COST"):
            self.scheduler.settle(next_one["job_id"],next_one["lease_token"],
                now_ms=self.clock,result="DONE",cost_cents=51)
        self.scheduler.settle(next_one["job_id"],next_one["lease_token"],
                now_ms=self.clock,result="DONE",cost_cents=50)
        current=self.scheduler.snapshot()
        self.assertEqual(current["queue"]["DONE"],2)

    def test_daily_claim_count_limits_repeated_leases(self):
        self.scheduler=DurableDispatcher(self.journal,daily_cap_cents=100,
                                          max_jobs_per_day=1)
        self.task(1)
        self.task(2,kind="ci_failure")
        claim=self.claim()
        self.scheduler.settle(claim["job_id"],claim["lease_token"],
            now_ms=self.clock,result="DONE")
        self.assertEqual(self.claim()["status"],"DAILY_CLAIM_LIMIT")

    def test_unknown_source_and_critical_holds_never_enter_queue(self):
        for n,kwargs in ((1,{"source_sha":"0"*40}),(2,{"severity":"critical"})):
            event=self.journal.ingest(self.event(n,**kwargs),EVIDENCE)
            self.assertEqual(event["status"],"HOLD")
            with self.assertRaisesRegex(Rejected,"UNQUALIFIED_SOURCE"):
                self.scheduler.enqueue(event["sequence"],
                    f"app-prodn:foundry/{n:03d}",now_ms=self.clock)

    def test_repository_sha_drift_after_enqueue_causes_durable_hold(self):
        self.task(1)
        self.journal.bindings[("PRODUCT_C","source-tests")] = replace(
            self.bind,approved_commit="f"*40)
        receipt=self.claim()
        self.assertEqual(receipt["status"],"NO_ADMITTED_QUEUE_OR_BUDGET")
        self.assertEqual(self.scheduler.snapshot()["queue"]["HOLD"],1)

    def test_regressed_durable_clock_and_finance_lane_refused(self):
        self.task(1)
        self.scheduler.pause_lane("PRODUCT_C",self.clock+1000,now_ms=self.clock)
        with self.assertRaisesRegex(Rejected,"CLOCK_REGRESSION"):
            self.scheduler.pause_lane("PRODUCT_C",self.clock+1000,
                                       now_ms=self.clock-1)
        with self.assertRaisesRegex(Rejected,"OUTSIDE_PRODUCT"):
            self.scheduler.claim("FINANCIAL",worker="owner-finance",
                                 now_ms=self.clock)

    def test_no_unreviewed_shell_or_agent_execution_import(self):
        source=(REPO/"tools/kingdom-foundry/foundry_dispatch.py").read_text()
        for needle in ("subprocess", "os.system", "eval(", "exec(", "requests.",
                       "urllib.request", "Popen(", "create_order(", "deploy("):
            self.assertNotIn(needle,source)
        self.assertIn('"executor":"DISABLED"',source)


if __name__=="__main__":
    unittest.main()
