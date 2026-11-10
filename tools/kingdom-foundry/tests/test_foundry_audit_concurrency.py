"""F6 adversarial concurrent-worker and real disposable SIGKILL queue tests.

A "worker" is only a process requesting simulated scheduler leases. No
agent, shell command executor, money, HEL1 service or protected DB involved.
All SQLite files created inside owner-private disposable PRODUCT directories.
"""
from __future__ import annotations

from dataclasses import replace
from hashlib import sha256
from multiprocessing import get_context
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import os
import signal
import sqlite3
import subprocess
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from foundry import Rejected, SCHEMA
from foundry_secure import SecureJournal, TrustedRepo
from foundry_dispatch import DurableDispatcher
from foundry_audit import FrozenAudit

REPO = Path(__file__).resolve().parents[3]
HEAD = subprocess.check_output(
    ["git", "-C", str(REPO), "rev-parse", "HEAD"], text=True).strip()
ORIGIN = subprocess.check_output(
    ["git", "-C", str(REPO), "remote", "get-url", "origin"],
    text=True).strip()
CLOCK = 1_800_000_000_000
EVIDENCE = json.dumps({
    "schema": "kingdom.foundry.evidence.v1",
    "source": "source-tests", "status": "FAILED",
}, sort_keys=True, separators=(",", ":")).encode()
REF = "receipt://event/"+sha256(EVIDENCE).hexdigest()
KINDS = ("test_failure", "ci_failure", "storage_pressure")


def _raced_claim(db_path, ready, go, outgoing, label):
    """Fixed simulation-only helper, never executes a task."""
    try:
        repo = TrustedRepo("app-prodn", REPO, HEAD, ORIGIN)
        journal = SecureJournal(
            db_path, REPO, {("PRODUCT_C", "source-tests"): repo})
        dispatcher = DurableDispatcher(journal)
        ready.put(label)
        if not go.wait(timeout=10):
            raise RuntimeError("HOLD_TEST_START_BARRIER")
        claimed = dispatcher.claim("PRODUCT_C", worker=label, now_ms=CLOCK,
                                   lease_ms=1_000)
        outgoing.put((label, claimed["status"], claimed.get("job_id", 0),
                      claimed.get("attempt", 0)))
        journal.close()
    except BaseException as exc:
        outgoing.put((label, "HOLD_ERROR", type(exc).__name__, str(exc)))


def _claim_then_die(db_path, pipe):
    """Only this disposable child process intentionally receives SIGKILL."""
    repo = TrustedRepo("app-prodn", REPO, HEAD, ORIGIN)
    journal = SecureJournal(
        db_path, REPO, {("PRODUCT_C", "source-tests"): repo})
    dispatcher = DurableDispatcher(journal)
    lease = dispatcher.claim("PRODUCT_C", worker="killed-simulation",
                             now_ms=CLOCK, lease_ms=1_000)
    pipe.send((lease["status"], lease["job_id"], lease["lease_token"]))
    pipe.close()
    os.kill(os.getpid(), signal.SIGKILL)


class AuditedRaceTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory(prefix="foundry-f6-test-", dir=REPO)
        self.addCleanup(temp.cleanup)
        folder = Path(temp.name)
        folder.chmod(0o700)
        self.dbfile = folder / "foundry.sqlite"
        self.binding = TrustedRepo("app-prodn", REPO, HEAD, ORIGIN)
        self.roster = {("PRODUCT_C", "source-tests"): self.binding}
        self.journal = SecureJournal(self.dbfile, REPO, self.roster)
        self.addCleanup(self.journal.close)
        self.dispatch = DurableDispatcher(self.journal)

    def event(self, n):
        record = {
            "schema_version": SCHEMA,
            "event_id": f"f6-adversarial-product-receipt-{n:06d}",
            "observed_utc": "2026-11-10T14:00:00Z",
            "source": "source-tests", "lane": "PRODUCT_C",
            "kind": KINDS[n-1], "severity": "warning",
            "source_sha": HEAD,
            "summary": "Synthetic source-only audit test",
            "evidence_ref": REF,
        }
        return json.dumps(record,sort_keys=True).encode()

    def task(self, n):
        recorded=self.journal.ingest(self.event(n),EVIDENCE)
        self.assertEqual(recorded["status"],"RECORDED")
        queued=self.dispatch.enqueue(recorded["sequence"],
            f"app-prodn:foundry/audited-{n}",now_ms=CLOCK,
            estimated_cost_cents=10)
        self.assertEqual(queued["status"],"WAITING")
        return queued["job_id"]

    def test_four_transition_receipts_are_ordered_and_private(self):
        job_id=self.task(1)
        lease=self.dispatch.claim("PRODUCT_C",worker="one-worker",
                                  now_ms=CLOCK,lease_ms=1000)
        self.dispatch.heartbeat(job_id,lease["lease_token"],
                                now_ms=CLOCK+100,extend_ms=10_000)
        self.dispatch.settle(job_id,lease["lease_token"],now_ms=CLOCK+101,
                             result="DONE",cost_cents=3)
        result=self.dispatch.audit.verify()
        self.assertEqual(result["entries"],4)
        self.assertEqual(result["status"],"VERIFIED_INTERNAL_CHAIN_ONLY")
        self.assertFalse(result["externallyAnchored"])
        self.assertFalse(result["tamperProof"])
        stored=" ".join(x[0] for x in self.journal.conn.execute(
            "SELECT event_body FROM f6_audit"))
        self.assertNotIn(lease["lease_token"],stored)
        self.assertIn("SIMULATED_SETTLEMENT",stored)
        self.assertIn('"executionEnabled":false',stored)
        self.assertEqual(self.dispatch.snapshot()["audit"]["entries"],4)

    def test_append_only_sql_triggers_refuse_tamper_and_deletion(self):
        self.task(1)
        with self.assertRaisesRegex(sqlite3.DatabaseError,"APPEND_ONLY"):
            self.journal.conn.execute(
                "UPDATE f6_audit SET event_body='INJECTED' WHERE seq=1")
        with self.assertRaisesRegex(sqlite3.DatabaseError,"APPEND_ONLY"):
            self.journal.conn.execute("DELETE FROM f6_audit WHERE seq=1")
        self.assertEqual(self.dispatch.audit.verify()["entries"],1)

    def test_privileged_mutation_breaks_hash_verifier_and_claim_gate(self):
        self.task(1)
        # A privileged DB writer could bypass SQL triggers. The internal
        # hash chain detects this byte change; it cannot prove external
        # immutability without a separately signed off-host digest.
        self.journal.conn.execute("DROP TRIGGER f6_audit_no_update")
        self.journal.conn.execute(
            "UPDATE f6_audit SET entry_sha=? WHERE seq=1",("f"*64,))
        with self.assertRaisesRegex(Rejected,"HASH_CHAIN"):
            self.dispatch.audit.verify()
        with self.assertRaisesRegex(Rejected,"HASH_CHAIN"):
            self.dispatch.claim("PRODUCT_C",worker="one-worker",
                                now_ms=CLOCK)
        self.assertEqual(self.journal.conn.execute(
            "SELECT status FROM f2_jobs WHERE job_id=1"
        ).fetchone()[0],"WAITING")

    def test_failed_settlement_rolls_back_cost_and_audit_together(self):
        job=self.task(1)
        receipt=self.dispatch.claim("PRODUCT_C",worker="one-worker",
                                    now_ms=CLOCK,lease_ms=1000)
        count=self.dispatch.audit.verify()["entries"]
        with self.assertRaisesRegex(Rejected,"COST"):
            self.dispatch.settle(job,receipt["lease_token"],
                                 now_ms=CLOCK+1,result="DONE",cost_cents=999)
        self.assertEqual(self.dispatch.audit.verify()["entries"],count)
        self.assertEqual(self.journal.conn.execute(
            "SELECT status,cost_spent_cents FROM f2_jobs WHERE job_id=?",
            (job,)).fetchone(),("CLAIMED",0))

    def test_source_drift_holds_and_audits_but_never_claims(self):
        self.task(1)
        self.journal.bindings[("PRODUCT_C","source-tests")]=replace(
            self.binding,approved_commit="f"*40)
        observed=self.dispatch.claim("PRODUCT_C",worker="one-worker",
                                     now_ms=CLOCK)
        self.assertEqual(observed["status"],"NO_ADMITTED_QUEUE_OR_BUDGET")
        self.assertEqual(self.dispatch.snapshot()["queue"]["HOLD"],1)
        last=self.journal.conn.execute(
            "SELECT event_body FROM f6_audit ORDER BY seq DESC LIMIT 1"
        ).fetchone()[0]
        self.assertEqual(json.loads(last)["event"],"SOURCE_CHANGED_HOLD")
        self.assertEqual(self.dispatch.audit.verify()["entries"],2)

    def test_three_real_child_processes_get_unique_concurrent_claims(self):
        for index in (1,2,3):
            self.task(index)
        self.journal.close()
        context=get_context("fork")
        ready=context.Queue()
        outgoing=context.Queue()
        go=context.Event()
        children=[
            context.Process(target=_raced_claim,args=(
                self.dbfile,ready,go,outgoing,f"race-worker-{i}"))
            for i in range(3)
        ]
        for process in children:
            process.start()
        for _ in children:
            ready.get(timeout=10)
        go.set()
        outcomes=[outgoing.get(timeout=15) for _ in children]
        for process in children:
            process.join(timeout=10)
            if process.is_alive():
                process.kill()
                process.join(timeout=5)
            self.assertEqual(process.exitcode,0)
        self.assertEqual([x[1] for x in outcomes],
                         ["CLAIMED_SIMULATION_ONLY"]*3)
        self.assertEqual({x[2] for x in outcomes},{1,2,3})
        verifier=SecureJournal(self.dbfile,REPO,self.roster)
        try:
            snapshot=DurableDispatcher(verifier).snapshot()
            self.assertEqual(snapshot["queue"]["CLAIMED"],3)
            self.assertEqual(snapshot["audit"]["entries"],6)
            self.assertFalse(snapshot["audit"]["externallyAnchored"])
        finally:
            verifier.close()

    def test_real_sigkill_disposable_child_then_one_safe_reclaim(self):
        self.task(1)
        self.journal.close()
        context=get_context("fork")
        parent,child=context.Pipe(duplex=False)
        process=context.Process(target=_claim_then_die,args=(self.dbfile,child))
        process.start()
        child.close()
        self.assertTrue(parent.poll(10),"HOLD_TEST_CHILD_CLAIM_TIMEOUT")
        status,job_id,dead_token=parent.recv()
        parent.close()
        process.join(timeout=10)
        if process.is_alive():
            process.kill()
            process.join(timeout=5)
        self.assertEqual(status,"CLAIMED_SIMULATION_ONLY")
        self.assertEqual(process.exitcode,-signal.SIGKILL)
        another=SecureJournal(self.dbfile,REPO,self.roster)
        try:
            resumed=DurableDispatcher(another)
            claim=resumed.claim("PRODUCT_C",worker="recovery-worker",
                now_ms=CLOCK+1001,lease_ms=1000)
            self.assertEqual(claim["job_id"],job_id)
            self.assertEqual(claim["attempt"],2)
            with self.assertRaisesRegex(Rejected,"REPLAYED"):
                resumed.settle(job_id,dead_token,now_ms=CLOCK+1001,
                               result="DONE")
            final=resumed.settle(job_id,claim["lease_token"],
                now_ms=CLOCK+1001,result="DONE",cost_cents=0)
            self.assertEqual(final["status"],"DONE")
            self.assertEqual(resumed.snapshot()["queue"]["DONE"],1)
            self.assertEqual(resumed.audit.verify()["entries"],5)
        finally:
            another.close()

    def test_log_reopen_preserves_prev_hash_chain_across_connections(self):
        self.task(1)
        self.journal.close()
        reopened=SecureJournal(self.dbfile,REPO,self.roster)
        try:
            renewed=DurableDispatcher(reopened)
            self.assertEqual(renewed.audit.verify()["entries"],1)
            renewed.pause_lane("PRODUCT_C",CLOCK+10_000,now_ms=CLOCK)
            result=renewed.audit.verify()
            self.assertEqual(result["entries"],2)
            self.assertNotEqual(result["headSHA256"],"0"*64)
        finally:
            reopened.close()

    def test_untrusted_audit_data_and_other_lanes_refused(self):
        self.task(1)
        for params in (
            {"lane":"FINANCIAL","job_id":1,"code":"QUEUED",
             "now_ms":CLOCK,"status":"WAITING"},
            {"lane":"PRODUCT_C","job_id":1,"code":"RUN_SHELL",
             "now_ms":CLOCK,"status":"CLAIMED"},
            {"lane":"PRODUCT_C","job_id":1,"code":"QUEUED",
             "now_ms":CLOCK,"status":"FUNDED"},
            {"lane":"PRODUCT_C","job_id":1,"code":"QUEUED",
             "now_ms":CLOCK,"status":"WAITING","cents":True},
        ):
            with self.subTest(params=params),self.assertRaises(Rejected):
                self.dispatch.audit.append(**params)
        self.assertEqual(self.dispatch.audit.verify()["entries"],1)


if __name__=="__main__":
    unittest.main()
