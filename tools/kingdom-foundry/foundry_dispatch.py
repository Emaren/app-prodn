"""F2 persistent PRODUCT scheduler ONLY: no agent, HTTP, shell or worker.

Claims are simulated scheduling permits with opaque hashed lease tokens, NOT
permission to execute code or deploy anything. All state lives in SQLite WAL.
"""
from __future__ import annotations
from datetime import datetime, timezone
from hashlib import sha256
import json
import re
import secrets

from foundry import Rejected
from foundry_secure import SecureJournal

LANES = frozenset(("PRODUCT_B", "PRODUCT_C"))
PR_KEY = re.compile(r"(app-prodn|kingdom-traders|traffic-api|traffic-app):[a-z0-9/_-]{1,96}\Z")
OWNER = re.compile(r"[a-z0-9][a-z0-9._-]{2,63}\Z")
MAX_LEASE_MS = 120_000
MAX_RETRIES = 3
MAX_DEPENDENCIES = 8
MAX_QUEUE = 500


def _valid_clock(ms):
    if type(ms) is not int or ms < 0 or ms > 4_102_444_800_000:
        raise Rejected("HOLD_INVALID_DURABLE_CLOCK")
    return ms


def _day(ms):
    return datetime.fromtimestamp(ms/1000, timezone.utc).date().isoformat()


class DurableDispatcher:
    """Single transactional durable scheduler; it NEVER launches any tasks."""

    def __init__(self, journal: SecureJournal,
                 daily_cap_cents=100, max_jobs_per_day=20):
        if not isinstance(journal, SecureJournal):
            raise Rejected("HOLD_UNTRUSTED_FOUNDRY_JOURNAL")
        if (type(daily_cap_cents) is not int or
            not 1 <= daily_cap_cents <= 100_000 or
            type(max_jobs_per_day) is not int or
            not 1 <= max_jobs_per_day <= 100):
            raise Rejected("HOLD_BUDGET_POLICY_BOUNDS")
        self.journal = journal
        self.db = journal.conn
        self.daily_cap_cents = daily_cap_cents
        self.max_jobs_per_day = max_jobs_per_day
        self.db.execute("CREATE TABLE IF NOT EXISTS f2_jobs ("
             "job_id INTEGER PRIMARY KEY AUTOINCREMENT,"
             "event_seq INTEGER NOT NULL UNIQUE REFERENCES f1_events(seq),"
             "lane TEXT NOT NULL CHECK(lane IN ('PRODUCT_B','PRODUCT_C')),"
             "pr_key TEXT UNIQUE NOT NULL,"
             "status TEXT NOT NULL CHECK(status IN "
             "('WAITING','CLAIMED','DONE','HOLD')),"
             "attempts INTEGER NOT NULL DEFAULT 0,"
             "lease_token_sha TEXT,"
             "lease_owner TEXT,"
             "lease_started_ms INTEGER,"
             "lease_expires_ms INTEGER,"
             "cost_reserved_cents INTEGER NOT NULL,"
             "cost_spent_cents INTEGER NOT NULL DEFAULT 0,"
             "cost_day TEXT,"
             "hold_reason TEXT NOT NULL DEFAULT '',"
             "created_ms INTEGER NOT NULL)")
        self.db.execute("CREATE TABLE IF NOT EXISTS f2_dependencies ("
             "job_id INTEGER NOT NULL REFERENCES f2_jobs(job_id),"
             "dependency_id INTEGER NOT NULL REFERENCES f2_jobs(job_id),"
             "PRIMARY KEY(job_id,dependency_id),"
             "CHECK(job_id!=dependency_id))")
        self.db.execute("CREATE TABLE IF NOT EXISTS f2_lane_control ("
             "lane TEXT PRIMARY KEY,paused_until_ms INTEGER NOT NULL DEFAULT 0,"
             "clock_highwater_ms INTEGER NOT NULL DEFAULT 0)")
        self.db.execute("CREATE TABLE IF NOT EXISTS f2_daily_usage ("
             "lane TEXT NOT NULL,day TEXT NOT NULL,"
             "completed_cents INTEGER NOT NULL DEFAULT 0,"
             "claims INTEGER NOT NULL DEFAULT 0,"
             "PRIMARY KEY(lane,day))")
        for lane in sorted(LANES):
            self.db.execute("INSERT OR IGNORE INTO f2_lane_control(lane)"
                            " VALUES(?)",(lane,))
        self.db.commit()

    def _begin(self):
        self.db.execute("BEGIN IMMEDIATE")

    def _clock(self, lane, now_ms):
        _valid_clock(now_ms)
        if lane not in LANES:
            raise Rejected("HOLD_OUTSIDE_PRODUCT_LANE")
        old = self.db.execute("SELECT clock_highwater_ms FROM f2_lane_control"
                              " WHERE lane=?", (lane,)).fetchone()[0]
        if now_ms < old:
            raise Rejected("HOLD_DURABLE_CLOCK_REGRESSION")
        self.db.execute("UPDATE f2_lane_control SET clock_highwater_ms=?"
                        " WHERE lane=?", (now_ms,lane))

    def _source_still_admitted(self,event_seq):
        row=self.db.execute("SELECT lane,body,source_sha,trust "
            "FROM f1_events WHERE seq=?",(event_seq,)).fetchone()
        if not row or row[3]!="VERIFIED":
            return False
        # F1 stores the strictly validated canonical source inside body,
        # not a second mutable/de-normalized source column.
        source=json.loads(row[1]).get("source")
        binding=self.journal.bindings.get((row[0],source))
        if binding is None:
            return False
        try:
            binding.verify(self.journal.root,row[2])
            return True
        except Rejected:
            return False

    def enqueue(self,event_seq:int,pr_key:str,*,dependencies=(),
                estimated_cost_cents=0,now_ms:int):
        _valid_clock(now_ms)
        if (type(event_seq) is not int or event_seq <= 0 or
            type(pr_key) is not str or not PR_KEY.fullmatch(pr_key) or
            type(estimated_cost_cents) is not int or
            not 0 <= estimated_cost_cents <= self.daily_cap_cents or
            type(dependencies) is not tuple or len(dependencies)>MAX_DEPENDENCIES or
            len(set(dependencies))!=len(dependencies) or
            any(type(x) is not int or x<=0 for x in dependencies)):
            raise Rejected("HOLD_INVALID_QUEUE_REQUEST")
        self._begin()
        try:
            row=self.db.execute("SELECT lane,trust FROM f1_events WHERE seq=?",
                                (event_seq,)).fetchone()
            if (row is None or row[1]!="VERIFIED" or
                not self._source_still_admitted(event_seq)):
                raise Rejected("HOLD_UNQUALIFIED_SOURCE_EVENT")
            lane=row[0]
            self._clock(lane,now_ms)
            already=self.db.execute("SELECT job_id FROM f2_jobs WHERE "
                "event_seq=? OR pr_key=?", (event_seq,pr_key)).fetchone()
            if already:
                self.db.execute("COMMIT")
                return {"status":"DUPLICATE_QUEUE_OR_PR","job_id":already[0]}
            if self.db.execute("SELECT count(*) FROM f2_jobs").fetchone()[0]>=MAX_QUEUE:
                raise Rejected("HOLD_QUEUE_CAPACITY")
            for dep in dependencies:
                parent=self.db.execute("SELECT lane,created_ms FROM f2_jobs "
                    "WHERE job_id=?", (dep,)).fetchone()
                if parent is None or parent[0]!=lane or parent[1]>now_ms:
                    raise Rejected("HOLD_UNKNOWN_OR_CROSS_LANE_DEPENDENCY")
            row=self.db.execute("INSERT INTO f2_jobs "
                "(event_seq,lane,pr_key,status,cost_reserved_cents,created_ms)"
                " VALUES(?, ?, ?, 'WAITING', ?, ?)",
                (event_seq,lane,pr_key,estimated_cost_cents,now_ms))
            job_id=row.lastrowid
            for dep in dependencies:
                if dep>=job_id:
                    raise Rejected("HOLD_DEPENDENCY_MUST_PRECEDE_JOB")
                self.db.execute("INSERT INTO f2_dependencies VALUES(?,?)",
                                (job_id,dep))
            self.db.execute("COMMIT")
            return {"status":"WAITING","job_id":job_id,
                    "execution_enabled":False}
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def pause_lane(self,lane,until_ms,*,now_ms):
        self._begin()
        try:
            self._clock(lane,now_ms)
            if type(until_ms) is not int or not now_ms <= until_ms <= now_ms+86_400_000:
                raise Rejected("HOLD_RATE_LIMIT_PAUSE_BOUNDS")
            self.db.execute("UPDATE f2_lane_control SET paused_until_ms=? "
                            "WHERE lane=?",(until_ms,lane))
            self.db.execute("COMMIT")
            return {"status":"PAUSED","lane":lane,
                    "execution_enabled":False}
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def claim(self,lane,*,worker,now_ms,lease_ms=30_000):
        if (type(worker) is not str or not OWNER.fullmatch(worker) or
            type(lease_ms) is not int or not 1_000<=lease_ms<=MAX_LEASE_MS):
            raise Rejected("HOLD_UNTRUSTED_CLAIM")
        self._begin()
        try:
            self._clock(lane,now_ms)
            row=self.db.execute("SELECT paused_until_ms FROM f2_lane_control"
                                " WHERE lane=?",(lane,)).fetchone()
            if row[0]>now_ms:
                self.db.execute("COMMIT")
                return {"status":"RATE_LIMIT_PAUSE","execution_enabled":False}
            # An expired lease is never completed automatically. Its old
            # token becomes invalid; bounded attempts decide retry vs HOLD.
            self.db.execute("UPDATE f2_jobs SET status=CASE WHEN "
                "attempts>=? THEN 'HOLD' ELSE 'WAITING' END,"
                "hold_reason=CASE WHEN attempts>=? THEN 'RETRY_LIMIT' ELSE '' END,"
                "lease_token_sha=NULL,lease_owner=NULL,lease_expires_ms=NULL,"
                "lease_started_ms=NULL WHERE lane=? AND status='CLAIMED' "
                "AND lease_expires_ms<=?",(MAX_RETRIES,MAX_RETRIES,lane,now_ms))
            self.db.execute("UPDATE f2_jobs SET status='HOLD',"
                "hold_reason='DEPENDENCY_HELD' WHERE lane=? AND status='WAITING' "
                "AND EXISTS (SELECT 1 FROM f2_dependencies dep JOIN f2_jobs p "
                "ON p.job_id=dep.dependency_id WHERE dep.job_id=f2_jobs.job_id "
                "AND p.status='HOLD')",(lane,))
            day=_day(now_ms)
            usage=self.db.execute("SELECT completed_cents,claims FROM "
                "f2_daily_usage WHERE lane=? AND day=?",
                (lane,day)).fetchone() or (0,0)
            active=self.db.execute("SELECT coalesce(sum(cost_reserved_cents),0)"
                " FROM f2_jobs WHERE lane=? AND status='CLAIMED' AND cost_day=?",
                (lane,day)).fetchone()[0]
            for job_id,cost,attempts,event_seq in self.db.execute(
                "SELECT job_id,cost_reserved_cents,attempts,event_seq FROM f2_jobs j "
                "WHERE j.lane=? AND j.status='WAITING' AND NOT EXISTS "
                "(SELECT 1 FROM f2_dependencies d JOIN f2_jobs p "
                "ON d.dependency_id=p.job_id WHERE d.job_id=j.job_id "
                "AND p.status!='DONE') ORDER BY j.job_id",(lane,)).fetchall():
                if not self._source_still_admitted(event_seq):
                    self.db.execute("UPDATE f2_jobs SET status='HOLD',"
                         "hold_reason='SOURCE_REF_CHANGED' WHERE job_id=?",
                         (job_id,))
                    continue
                if usage[1]>=self.max_jobs_per_day:
                    self.db.execute("COMMIT")
                    return {"status":"DAILY_CLAIM_LIMIT","execution_enabled":False}
                if usage[0]+active+cost>self.daily_cap_cents:
                    continue
                token=secrets.token_urlsafe(36)
                digest=sha256(token.encode()).hexdigest()
                self.db.execute("UPDATE f2_jobs SET status='CLAIMED',"
                    "attempts=?,lease_token_sha=?,lease_owner=?,"
                    "lease_started_ms=?,lease_expires_ms=?,cost_day=? "
                    "WHERE job_id=? AND status='WAITING'",
                    (attempts+1,digest,worker,now_ms,now_ms+lease_ms,day,job_id))
                self.db.execute("INSERT INTO f2_daily_usage(lane,day,claims)"
                    " VALUES(?,?,1) ON CONFLICT(lane,day) DO UPDATE "
                    "SET claims=claims+1",(lane,day))
                self.db.execute("COMMIT")
                return {"status":"CLAIMED_SIMULATION_ONLY","job_id":job_id,
                        "lease_token":token,"expires_ms":now_ms+lease_ms,
                        "attempt":attempts+1,"execution_enabled":False}
            self.db.execute("COMMIT")
            return {"status":"NO_ADMITTED_QUEUE_OR_BUDGET","execution_enabled":False}
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def _lease(self,job_id,token,now_ms):
        _valid_clock(now_ms)
        if type(job_id) is not int or type(token) is not str or len(token)>100:
            raise Rejected("HOLD_INVALID_LEASE")
        row=self.db.execute("SELECT lane,status,lease_token_sha,"
            "lease_started_ms,lease_expires_ms,cost_reserved_cents,cost_day,"
            "attempts FROM f2_jobs WHERE job_id=?",(job_id,)).fetchone()
        if (row is None or row[1]!="CLAIMED" or
            row[2]!=sha256(token.encode()).hexdigest() or
            not row[3]<=now_ms<row[4]):
            raise Rejected("HOLD_EXPIRED_OR_REPLAYED_LEASE")
        self._clock(row[0],now_ms)
        return row

    def heartbeat(self,job_id,token,*,now_ms,extend_ms=15_000):
        self._begin()
        try:
            row=self._lease(job_id,token,now_ms)
            if type(extend_ms) is not int or not 1_000<=extend_ms<=30_000:
                raise Rejected("HOLD_UNBOUNDED_HEARTBEAT")
            expiry=min(now_ms+extend_ms,row[3]+MAX_LEASE_MS)
            if expiry<=now_ms:
                raise Rejected("HOLD_LEASE_MAX_ELAPSED")
            self.db.execute("UPDATE f2_jobs SET lease_expires_ms=? "
                            "WHERE job_id=?",(expiry,job_id))
            self.db.execute("COMMIT")
            return {"status":"HEARTBEAT_RECEIPT_ONLY",
                    "expires_ms":expiry,"execution_enabled":False}
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def settle(self,job_id,token,*,now_ms,result,cost_cents=0):
        if result not in ("DONE","RETRYABLE_FAILURE","HOLD"):
            raise Rejected("HOLD_UNKNOWN_COMPLETION")
        self._begin()
        try:
            row=self._lease(job_id,token,now_ms)
            if (type(cost_cents) is not int or
                cost_cents<0 or cost_cents>row[5]):
                raise Rejected("HOLD_UNRECONCILED_COST")
            newstatus=("WAITING" if result=="RETRYABLE_FAILURE" and
                       row[7]<MAX_RETRIES else
                       "HOLD" if result!="DONE" else "DONE")
            self.db.execute("UPDATE f2_jobs SET status=?,"
                "cost_spent_cents=cost_spent_cents+?,"
                "hold_reason=?,lease_token_sha=NULL,lease_owner=NULL,"
                "lease_started_ms=NULL,lease_expires_ms=NULL WHERE job_id=?",
                (newstatus,cost_cents,
                 "RETRY_LIMIT" if newstatus=="HOLD" else "",job_id))
            self.db.execute("INSERT INTO f2_daily_usage(lane,day,"
                "completed_cents) VALUES(?,?,?) ON CONFLICT(lane,day) "
                "DO UPDATE SET completed_cents=completed_cents+?",
                (row[0],row[6],cost_cents,cost_cents))
            self.db.execute("COMMIT")
            return {"status":newstatus,"execution_enabled":False}
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def snapshot(self):
        jobs=self.db.execute("SELECT status,count(*) FROM f2_jobs "
                             "GROUP BY status").fetchall()
        return {"schema":"kingdom.foundry.dispatcher.v1",
                "queue":dict(jobs),"executor":"DISABLED",
                "model_calls":0,"shell_commands":0,
                "finance":"DENIED","deployments":0}
