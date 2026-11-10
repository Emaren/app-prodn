"""F5 durable future-agent continuation checkpoints — NO AGENT EXECUTOR.

Only stores hashed, nonsecret source/session/receipt references and finite
budgets. Never invokes Codex/API, sends commands, resumes sessions, approves
finances, accepts an operator signature, or auto-acts on a checkpoint.
"""
from __future__ import annotations

from hashlib import sha256
import re

from foundry import Rejected
from foundry_secure import SecureJournal

HEX64 = re.compile(r"[0-9a-f]{64}\Z")
SHA40 = re.compile(r"[0-9a-f]{40}\Z")
PROVIDERS = frozenset(("CODEX_SDK_FUTURE","OPENAI_API_FUTURE"))


class FrozenAgentCheckpoints:
    def __init__(self,journal: SecureJournal):
        if not isinstance(journal,SecureJournal):
            raise Rejected("HOLD_NO_TRUSTED_JOURNAL")
        self.db=journal.conn
        self.db.execute("CREATE TABLE IF NOT EXISTS f5_checkpoints ("
             "job_id INTEGER PRIMARY KEY REFERENCES f2_jobs(job_id),"
             "source_sha TEXT NOT NULL,"
             "provider TEXT NOT NULL,"
             "remote_session_digest TEXT NOT NULL,"
             "proof_digest TEXT NOT NULL,"
             "max_cents INTEGER NOT NULL,"
             "max_turns INTEGER NOT NULL,"
             "state TEXT NOT NULL DEFAULT 'HOLD_NO_AGENT_ADMISSION' "
             "CHECK(state='HOLD_NO_AGENT_ADMISSION'),"
             "human_approval_verified INTEGER NOT NULL DEFAULT 0 "
             "CHECK(human_approval_verified=0),"
             "execution_enabled INTEGER NOT NULL DEFAULT 0 "
             "CHECK(execution_enabled=0))")
        self.db.commit()

    def seal(self,job_id,*,source_sha,provider,remote_session_digest,
             proof_digest,max_cents,max_turns):
        if (type(job_id) is not int or job_id<1 or
            type(source_sha) is not str or not SHA40.fullmatch(source_sha) or
            provider not in PROVIDERS or
            type(remote_session_digest) is not str or
            not HEX64.fullmatch(remote_session_digest) or
            type(proof_digest) is not str or not HEX64.fullmatch(proof_digest) or
            type(max_cents) is not int or not 0<=max_cents<=1000 or
            type(max_turns) is not int or not 1<=max_turns<=10):
            raise Rejected("HOLD_UNTRUSTED_AGENT_CHECKPOINT")
        self.db.execute("BEGIN IMMEDIATE")
        try:
            source=self.db.execute(
                "SELECT ev.source_sha,ev.trust,j.lane,j.status,"
                "j.cost_reserved_cents FROM f2_jobs j JOIN f1_events ev "
                "ON ev.seq=j.event_seq WHERE j.job_id=?",
                (job_id,)).fetchone()
            if (source is None or source[0]!=source_sha or
                source[1]!="VERIFIED" or
                source[2] not in ("PRODUCT_B","PRODUCT_C") or
                source[3] not in ("WAITING","HOLD") or
                max_cents>source[4]):
                raise Rejected("HOLD_CHECKPOINT_SOURCE_OR_BUDGET_INVALID")
            earlier=self.db.execute(
                "SELECT source_sha,provider,remote_session_digest,"
                "proof_digest,max_cents,max_turns FROM f5_checkpoints "
                "WHERE job_id=?",(job_id,)).fetchone()
            expected=(source_sha,provider,remote_session_digest,
                      proof_digest,max_cents,max_turns)
            if earlier:
                if earlier!=expected:
                    raise Rejected("HOLD_CHECKPOINT_REPLAY_COLLISION")
                self.db.execute("COMMIT")
                return {"status":"DUPLICATE_FROZEN_CHECKPOINT",
                        "executionEnabled":False}
            self.db.execute("INSERT INTO f5_checkpoints(job_id,source_sha,"
                "provider,remote_session_digest,proof_digest,max_cents,"
                "max_turns) VALUES(?,?,?,?,?,?,?)",(job_id,*expected))
            self.db.execute("COMMIT")
            return {"status":"SEALED_HOLD_NO_AGENT_ADMISSION",
                    "jobId":job_id,"executionEnabled":False,
                    "approvalVerified":False}
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def inspect(self,job_id):
        if type(job_id) is not int or job_id<1:
            raise Rejected("HOLD_BAD_CHECKPOINT_ID")
        result=self.db.execute("SELECT source_sha,provider,max_cents,"
            "max_turns,state,execution_enabled,human_approval_verified "
            "FROM f5_checkpoints WHERE job_id=?",(job_id,)).fetchone()
        if not result:
            raise Rejected("HOLD_UNKNOWN_CHECKPOINT")
        return {"schema":"kingdom.foundry.agent-checkpoint.v1",
                "sourceSha":result[0],"futureProvider":result[1],
                "budgetCapCents":result[2],"maxContinuationTurns":result[3],
                "status":result[4],
                "executionEnabled":False,
                "financialApproval":False,
                "humanApprovalVerified":False,
                "currentAgentSessionId":None,
                "apiCredential":None,
                "toolCommand":None,
                "nextStep":"PENDING_EXPLICIT_SOURCE_AND_OWNER_ADMISSION"}
