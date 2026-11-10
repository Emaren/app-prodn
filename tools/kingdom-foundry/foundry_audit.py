"""F6 append-only, self-checking audit receipts for NONEXECUTING queue state.

The chain is an internal SQLite integrity control, not externally anchored,
signed, tamper-proof, remote-attested or evidence of a completed agent task.
All writes occur inside the caller's durable SQLite IMMEDIATE transaction.
Raw lease tokens, user report text and financial data are NEVER recorded.
"""
from __future__ import annotations

from hashlib import sha256
import json
import re

from foundry import Rejected

ALLOWED_CODES = frozenset((
    "QUEUED", "LANE_PAUSED", "LEASE_CLAIMED_SIMULATION",
    "LEASE_HEARTBEAT", "LEASE_EXPIRED_RETRY", "LEASE_EXPIRED_HOLD",
    "SOURCE_CHANGED_HOLD", "DEPENDENCY_HOLD", "SIMULATED_SETTLEMENT",
))
ALLOWED_STATES = frozenset((
    "WAITING", "CLAIMED", "DONE", "HOLD", "PAUSED",
))
LANES = frozenset(("PRODUCT_B", "PRODUCT_C"))
ZERO = "0"*64
HASH = re.compile("[0-9a-f]{64}\\Z")
MAX_AUDIT = 20_000


def canonical(data):
    return json.dumps(data, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True)


class FrozenAudit:
    """Rollback-safe append within dispatcher transactions; NO side effects."""

    def __init__(self, conn, *, create_schema=True):
        self.db = conn
        # Read-only observers MUST NOT create triggers/tables or write WAL.
        # The dispatcher alone may run schema initialization.
        if create_schema is False:
            return
        if create_schema is not True:
            raise Rejected("HOLD_AUDIT_SCHEMA_MODE_INVALID")
        self.db.execute("CREATE TABLE IF NOT EXISTS f6_audit ("
            "seq INTEGER PRIMARY KEY AUTOINCREMENT,"
            "prev_sha TEXT NOT NULL,"
            "entry_sha TEXT NOT NULL UNIQUE,"
            "event_body TEXT NOT NULL)")
        self.db.execute("CREATE TRIGGER IF NOT EXISTS f6_audit_no_update "
            "BEFORE UPDATE ON f6_audit BEGIN SELECT RAISE(ABORT,"
            "'HOLD_APPEND_ONLY_AUDIT_UPDATE'); END")
        self.db.execute("CREATE TRIGGER IF NOT EXISTS f6_audit_no_delete "
            "BEFORE DELETE ON f6_audit BEGIN SELECT RAISE(ABORT,"
            "'HOLD_APPEND_ONLY_AUDIT_DELETE'); END")

    def append(self, *, lane, job_id, code, now_ms, status, cents=0):
        if (lane not in LANES or
            type(job_id) is not int or not 0 <= job_id <= 10_000_000 or
            code not in ALLOWED_CODES or status not in ALLOWED_STATES or
            type(now_ms) is not int or not 0 <= now_ms <= 4_102_444_800_000 or
            type(cents) is not int or not 0 <= cents <= 100_000):
            raise Rejected("HOLD_AUDIT_EVENT_OUTSIDE_PRODUCT_CONTRACT")
        count = self.db.execute("SELECT count(*) FROM f6_audit").fetchone()[0]
        if count >= MAX_AUDIT:
            raise Rejected("HOLD_AUDIT_CAPACITY")
        previous = self.db.execute(
            "SELECT seq,entry_sha FROM f6_audit ORDER BY seq DESC LIMIT 1"
        ).fetchone()
        next_seq = (previous[0] + 1) if previous else 1
        prior_sha = previous[1] if previous else ZERO
        body = canonical({
            "schema": "kingdom.foundry.f6-audit-event.v1",
            "sequence": next_seq, "lane": lane, "jobId": job_id,
            "event": code, "recordedEpochMs": now_ms, "state": status,
            "costCents": cents, "executionEnabled": False,
            "finance": "DENIED",
        })
        digest = sha256((prior_sha+"\n"+body).encode("ascii")).hexdigest()
        self.db.execute(
            "INSERT INTO f6_audit(prev_sha,entry_sha,event_body)"
            " VALUES(?,?,?)", (prior_sha,digest,body))
        return {"auditSequence": next_seq, "auditHeadSHA256":digest}

    def verify(self):
        last = ZERO
        count = 0
        for sequence, prior, stored, body in self.db.execute(
            "SELECT seq,prev_sha,entry_sha,event_body "
            "FROM f6_audit ORDER BY seq"
        ):
            count += 1
            if count > MAX_AUDIT:
                raise Rejected("HOLD_AUDIT_BOUNDS")
            if (sequence != count or prior != last or
                type(stored) is not str or not HASH.fullmatch(stored) or
                type(body) is not str or len(body) > 900):
                raise Rejected("HOLD_AUDIT_GAP_OR_PREV_HASH")
            try:
                parsed = json.loads(body)
            except ValueError:
                raise Rejected("HOLD_AUDIT_INVALID_ENTRY") from None
            if (canonical(parsed) != body or
                parsed.get("sequence") != sequence or
                parsed.get("schema") != "kingdom.foundry.f6-audit-event.v1" or
                parsed.get("event") not in ALLOWED_CODES or
                parsed.get("lane") not in LANES or
                parsed.get("executionEnabled") is not False or
                parsed.get("finance") != "DENIED"):
                raise Rejected("HOLD_AUDIT_ENTRY_CONTRACT")
            actual = sha256((last+"\n"+body).encode("ascii")).hexdigest()
            if actual != stored:
                raise Rejected("HOLD_AUDIT_HASH_CHAIN_MISMATCH")
            last = stored
        return {
            "schema": "kingdom.foundry.f6-audit.v1",
            "status":"VERIFIED_INTERNAL_CHAIN_ONLY",
            "entries":count,"headSHA256":last,
            "externallyAnchored":False,"signed":False,
            "tamperProof":False,"executionEnabled":False,
            "financialApproval":False,
        }
