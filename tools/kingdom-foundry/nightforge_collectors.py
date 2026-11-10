"""F8 offline adapters for sanitized PRODUCT-only Nightforge observations.

Collector BOUNDARY, not production probes: accepts fixed-schema, bounded,
pre-sanitized typed JSON snapshots, NEVER raw logs/URLs/headers, never
invokes git, systemctl, GitHub, HTTP or private services. Any collector
claim is untrusted; F1 journal sees source SHA 'unknown' and records HOLD.
No task may be enqueued or executed from these observations.
"""
from __future__ import annotations
from hashlib import sha256
import json
import re

from foundry import Rejected
from foundry_secure import strict_json
from nightforge import CONTRACTS, diagnose, group_findings, _utc

SCHEMA = "kingdom.nightforge.collector-fixture.v1"
MODE = "SANITIZED_OFFLINE_FIXTURE_ONLY"
LOCAL_MODE = "LOCAL_HOST_READONLY_UNATTESTED"
MAX_SNAPSHOT_BYTES = 4096
MAX_BATCH = 20
MAX_AGE_SECONDS = 3600
SHA64 = re.compile(r"[0-9a-f]{64}\Z")
SOURCE_SHA = re.compile(r"(?:unknown|[0-9a-f]{40})\Z")
REPORT_FIELDS = frozenset((
    "schema","kind","lane","observed_utc","data","mode",
    "claimed_source_sha","snapshot_sha256"
))
SEVERITY = frozenset(("info","warning","error","critical"))


def canonical(value) -> bytes:
    try:
        return json.dumps(value, sort_keys=True, separators=(",",":"),
                          ensure_ascii=True, allow_nan=False).encode("ascii")
    except (ValueError, TypeError, UnicodeError) as exc:
        raise Rejected("HOLD_COLLECTOR_CANONICAL_JSON") from exc


def seal_offline_fixture(*, kind, lane, observed_utc, data,
                         claimed_source_sha="unknown") -> bytes:
    """Make a deterministic typed test fixture, not an origin signature.

    This construction helper is for tests and research snapshots only;
    it may NOT be used as a source of physical service truth.
    """
    record = {
        "schema":SCHEMA,"kind":kind,"lane":lane,
        "observed_utc":observed_utc,"data":data,
        "mode":MODE,"claimed_source_sha":claimed_source_sha,
    }
    return canonical({**record,"snapshot_sha256":sha256(canonical(record)).hexdigest()})


def review_snapshot(raw: bytes, *, owner_now_utc: str):
    """Produce a sanitized HOLD report and nonexecuting journal envelope.

    A local SHA proves ONLY content agreement, not which service generated
    the bytes. It NEVER authorizes a Git source or an executable worker.
    """
    if type(raw) is not bytes or not 0 < len(raw) <= MAX_SNAPSHOT_BYTES:
        raise Rejected("HOLD_COLLECTOR_MAX_INPUT_BYTES")
    parsed = strict_json(raw)
    if type(parsed) is not dict or set(parsed) != REPORT_FIELDS:
        raise Rejected("HOLD_COLLECTOR_UNEXPECTED_FIELDS")
    if (parsed["schema"] != SCHEMA or
        parsed["mode"] not in (MODE, LOCAL_MODE)):
        raise Rejected("HOLD_COLLECTOR_SOURCE_MODE_NOT_APPROVED")
    if (type(parsed["kind"]) is not str or
        parsed["kind"] not in CONTRACTS or
        type(parsed["lane"]) is not str or
        parsed["lane"] not in ("PRODUCT_B","PRODUCT_C") or
        type(parsed["claimed_source_sha"]) is not str or
        not SOURCE_SHA.fullmatch(parsed["claimed_source_sha"])):
        raise Rejected("HOLD_COLLECTOR_UNKNOWN_LANE_OR_SOURCE")
    if type(parsed["data"]) is not dict or set(parsed["data"]) != CONTRACTS[parsed["kind"]]:
        raise Rejected("HOLD_COLLECTOR_PAYLOAD_EXTRA_OR_MISSING")
    # Never let arbitrary lists/maps or giant unbounded strings reach F3
    # allowlist lookups (which would otherwise raise unhashable TypeError).
    for value in parsed["data"].values():
        if value is not None and type(value) not in (str, bool, int):
            raise Rejected("HOLD_COLLECTOR_UNSUPPORTED_FIELD_TYPE")
        if type(value) is str and (
            len(value) > 100 or any(ord(ch) < 32 for ch in value)):
            raise Rejected("HOLD_COLLECTOR_UNSAFE_FIELD_TEXT")
    claimed = parsed["snapshot_sha256"]
    if (type(claimed) is not str or not SHA64.fullmatch(claimed) or
        sha256(canonical({k:v for k,v in parsed.items()
                          if k!="snapshot_sha256"})).hexdigest() != claimed):
        raise Rejected("HOLD_COLLECTOR_FIXTURE_CONTENT_MISMATCH")
    now = _utc(owner_now_utc)
    observed = _utc(parsed["observed_utc"])
    age = (now - observed).total_seconds()
    if age < 0 or age > MAX_AGE_SECONDS:
        raise Rejected("HOLD_COLLECTOR_REPLAY_OR_FUTURE_WALLCLOCK")
    # The standalone F3 accepts fixed typed cases. We NEVER forward a
    # source-head *claim* as a trusted Git proof: use unknown and HOLD.
    normalized = diagnose(
        parsed["kind"], parsed["data"], lane=parsed["lane"],
        source_sha="unknown", observed_utc=parsed["observed_utc"]
    )
    code, level = normalized["code"], normalized["severity"]
    if (type(code) is not str or not re.fullmatch("[A-Z_]{4,80}", code) or
        level not in SEVERITY):
        raise Rejected("HOLD_COLLECTOR_UNKNOWN_DIAGNOSTIC_CODE")
    source = normalized["event"]["source"]
    status = ("FAILED" if level in ("error","critical") else
              "UNKNOWN" if level=="warning" else "OBSERVED")
    # Version 2 ties repeated observations to their own sanitized digest.
    # F1 still knows NO authentic vendor identity; 'unknown' is a hard
    # source-HOLD even if the human-shared content hash is correct.
    evidence = canonical({
        "schema":"kingdom.foundry.evidence.v2",
        "source":source,"status":status,
        "observation_sha256":claimed,"diagnostic_code":code,
    })
    if len(evidence) > 4096:
        raise Rejected("HOLD_COLLECTOR_EVIDENCE_SIZE")
    event = dict(normalized["event"])
    event["evidence_ref"]="receipt://event/"+sha256(evidence).hexdigest()
    # Event IDs must be bound to the exact underlying snapshot digest, not
    # simply a repeated code; stable duplicates remain idempotent.
    event["event_id"]="nightforge-f8-"+sha256(
        b"F8\0"+claimed.encode("ascii")+b"\0"+event["evidence_ref"].encode("ascii")
    ).hexdigest()[:40]
    return {
        "schema":"kingdom.nightforge.offline-collector-result.v1",
        "kind":parsed["kind"],"lane":parsed["lane"],
        "sourceAttribution":(
            "UNATTESTED_LOCAL_READONLY_PROBE"
            if parsed["mode"] == LOCAL_MODE
            else "UNVERIFIED_LOCAL_FIXTURE"),
        "sourceGitSHA":"unknown","claimedSourceGitSHA":parsed["claimed_source_sha"],
        "reportedObservationUTC":parsed["observed_utc"],
        "observedTimeExternallyAttested":False,
        "sourceIndependenceVerified":False,
        "nativeServiceStateVerified":False,
        "collectorSourceApproved":False,
        "observationSHA256":claimed,
        "code":code,"severity":level,
        "status":"HOLD_UNVERIFIED_SOURCE_NO_TASK_ADMISSION",
        "investigationOnly":True,
        "event":event,"evidence_bytes":evidence,
        "executionEnabled":False,"dispatchAllowed":False,
        "financeAllowed":False,"newPaperOrdersAllowed":False,
        "realExchangeOrdersAllowed":False,
    }


def review_batch(raw_snapshots: tuple[bytes, ...], *, owner_now_utc: str):
    if (type(raw_snapshots) is not tuple or
        not 1 <= len(raw_snapshots) <= MAX_BATCH):
        raise Rejected("HOLD_COLLECTOR_BATCH_CAP")
    rows = [review_snapshot(raw, owner_now_utc=owner_now_utc)
            for raw in raw_snapshots]
    identities = [r["observationSHA256"] for r in rows]
    if len(identities) != len(set(identities)):
        raise Rejected("HOLD_COLLECTOR_DUPLICATE_SNAPSHOT_BATCH")
    # Fixed-code grouping only: no raw notes or dangerous text emitted.
    triage = group_findings(tuple({
        "status":"PROPOSE_INVESTIGATION_ONLY", "execution_enabled":False,
        "severity":row["severity"],"code":row["code"],
    } for row in rows))
    return {
        "schema":"kingdom.nightforge.offline-collector-batch.v1",
        "count":len(rows),"triage":triage,
        "reports":rows,"status":"HOLD_UNVERIFIED_SOURCE_NO_TASK_ADMISSION",
        "dispatchAllowed":False,"executionEnabled":False,
        "financeAllowed":False,"networkCalls":0,
    }
