"""F9 private HOLD-only SQLite preview for untrusted F8 observations.

This is an OFFLINE read-only source investigation, not an F1/F2 scheduler,
not an audit proof and NOT externally attested production source collection.
It refuses any non-HOLD event, any scheduled job and all executable surfaces.
No HTTP, shell, model, personal credentials or financial data access.
"""
from __future__ import annotations

from collections import Counter
from hashlib import sha256
from pathlib import Path
import re
import sqlite3
from urllib.parse import quote

from foundry import Rejected
from foundry_secure import strict_event, PROTECTED_PARTS, MAX_EVENTS
from foundry_dashboard import STATUS_MAP

ALLOWED_REPOS = frozenset(("app-prodn", "kingdom-traders", "traffic-api", "traffic-app"))
MAX_PREVIEW_ROWS = 160
REASON = "HOLD_SOURCE_UNVERIFIED"
SCHEMA = "kingdom.foundry.private-command-read-model.v1"


def _file_policy(path: Path, product_root: Path):
    try:
        base = Path(product_root).expanduser().resolve(strict=True)
    except (OSError, RuntimeError):
        raise Rejected("HOLD_OBSERVER_PRODUCT_ROOT_NOT_PRESENT") from None
    candidate = Path(path).expanduser().absolute()
    if (candidate.is_symlink() or candidate.parent.is_symlink() or
        any(part.lower() in PROTECTED_PARTS for part in candidate.parts)):
        raise Rejected("HOLD_OBSERVER_PROTECTED_OR_SYMLINK_PATH")
    try:
        canonical = candidate.resolve(strict=True)
    except (OSError, RuntimeError):
        raise Rejected("HOLD_OBSERVER_DATABASE_NOT_PRESENT") from None
    if (not canonical.is_relative_to(base) or not canonical.is_file() or
        canonical.parent.stat().st_mode & 0o077 or
        canonical.stat().st_mode & 0o077 or
        canonical.stat().st_nlink != 1 or
        canonical.stat().st_size > 64*1024*1024):
        raise Rejected("HOLD_OBSERVER_DATABASE_NOT_PRIVATE_PRODUCT")
    return canonical


def _table_exists(conn, name):
    return conn.execute(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone()[0] == 1


def preview_untrusted_observations(db_path: Path, *,
                                   product_root: Path,
                                   max_rows: int = 80):
    """Open SQLite in real read-only mode; no WAL tables or app state created."""
    if type(max_rows) is not int or not 1 <= max_rows <= MAX_PREVIEW_ROWS:
        raise Rejected("HOLD_OBSERVER_ROW_BOUND")
    db_path = _file_policy(db_path, product_root)
    conn = None
    try:
        # URI path must be encoded, otherwise a question mark could silently
        # change read-only URI controls. SQLite mode=ro refuses creation.
        uri = "file:" + quote(str(db_path), safe="/") + "?mode=ro"
        conn = sqlite3.connect(uri,uri=True,timeout=2,isolation_level=None)
        conn.execute("PRAGMA query_only=ON")
        conn.execute("PRAGMA trusted_schema=OFF")
        conn.execute("PRAGMA busy_timeout=2000")
        conn.execute("BEGIN")
        if not _table_exists(conn,"f1_events"):
            raise Rejected("HOLD_OBSERVER_NO_VALIDATED_F1_LEDGER")
        for tbl in ("f2_jobs","f6_audit"):
            if _table_exists(conn,tbl):
                count = conn.execute("SELECT count(*) FROM "+tbl).fetchone()[0]
                if count:
                    raise Rejected("HOLD_OBSERVER_SCHEDULER_OR_AUDIT_EXISTS")
        total = conn.execute("SELECT count(*) FROM f1_events").fetchone()[0]
        if not 1 <= total <= MAX_EVENTS:
            raise Rejected("HOLD_OBSERVER_NO_BOUNDED_F1_EVENTS")
        rows = conn.execute(
            "SELECT seq, external_id, body_sha256, body, lane, kind, "
            "repo, source_sha, trust FROM f1_events "
            "ORDER BY seq DESC LIMIT ?",(max_rows,)
        ).fetchall()
        if len(rows) != min(max_rows,total):
            raise Rejected("HOLD_OBSERVER_ROW_COUNT_MISMATCH")
        items = []
        for (seq,external_id,body_sha,body,lane,kind,
             repo,source_sha,trust) in rows:
            if (type(seq) is not int or seq < 1 or
                type(body) is not str or len(body)>8192 or
                type(body_sha) is not str or
                not re.fullmatch("[0-9a-f]{64}",body_sha) or
                trust != "HOLD" or source_sha != "unknown" or
                repo not in ALLOWED_REPOS):
                raise Rejected("HOLD_OBSERVER_NOT_ALL_UNVERIFIED_SOURCE")
            try:
                event,canonical = strict_event(body.encode("ascii"))
            except (UnicodeError, Rejected):
                raise Rejected("HOLD_OBSERVER_CORRUPT_EVENT_BODY") from None
            if (body != canonical or sha256(body.encode("ascii")).hexdigest()!=body_sha or
                event["event_id"] != external_id or event["lane"] != lane or
                event["kind"] != kind or event["source_sha"]!="unknown" or
                event["severity"] not in ("info","warning","error","critical")):
                raise Rejected("HOLD_OBSERVER_CORRUPT_OR_REWRITTEN_EVENT")
            items.append({
                "recordId":f"KF-{seq:012d}",
                "lane":lane,"severity":event["severity"],
                "category":kind,"repo":repo,
                "sourceSha":"unknown",
                "sourceStatus":"HOLD_CURRENT_SOURCE_UNVERIFIED",
                "evidence":event["evidence_ref"],
                "state":REASON,
                "attempts":0,
                "holdReason":"SOURCE_NOT_ATTESTED",
                "prTarget":None,
                "nextPermittedStep":STATUS_MAP[REASON],
                "financialApproval":False,"executionEnabled":False,
            })
        conn.execute("ROLLBACK")
    except sqlite3.Error as exc:
        raise Rejected("HOLD_OBSERVER_SQLITE_READ_FAILURE") from exc
    finally:
        if conn is not None:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            conn.close()
    totals = Counter(x["state"] for x in items)
    levels = Counter(x["severity"] for x in items)
    return {
        "schema":SCHEMA,
        "status":"HOLD_ONLY_UNSEALED_NO_SCHEDULER",
        "entriesShown":len(items),
        "truncatedToMaxRows":total>max_rows,
        "totalByState":dict(sorted(totals.items())),
        "totalBySeverity":dict(sorted(levels.items())),
        "audit":{
            "schema":"kingdom.foundry.f6-audit.v1",
            "status":"NO_AUDIT_ALL_HOLDS",
            "entries":0,
            "headSHA256":None,
            "externallyAnchored":False,
            "signed":False,
            "tamperProof":False,
            "executionEnabled":False,
            "financialApproval":False,
        },
        "items":items,
        "executor":"DISABLED",
        "modelInference":"DISABLED",
        "websiteMounted":False,
        "privatePaperAccountData":False,
        "currentMarketPrice":None,
        "historicalSevenPositionMark":None,
        "historicalUnrealizedPnL":None,
        "newPaperOrdersAllowed":False,
        "realOrdersAllowed":False,
        "walletOrWoloAllowed":False,
        "resourceBudget":"NO_RUNTIME_OR_INFERENCE_ADMITTED",
    }
