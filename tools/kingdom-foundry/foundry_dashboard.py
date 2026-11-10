"""Foundry F7 — PRIVATE static Central Command PAPER/PRODUCT read model.

No HTTP route, listening port, external JavaScript/CSS, cookies, streaming,
LLM, order execution, financial SQL, or machine credential handling.
Reads F1/F2/F6 authenticated-by-LOCAL-configuration research records only.
A Git HEAD inspection is not externally attested production provenance.
"""
from __future__ import annotations

from collections import Counter
from html import escape
import json
import os
from pathlib import Path
import re
import secrets

from foundry import Rejected
from foundry_secure import SecureJournal
from foundry_audit import FrozenAudit

MAX_ROWS = 160
MAX_HTML_BYTES = 250_000
STATUS_MAP = {
    "HOLD_SOURCE_UNVERIFIED": "Verify pinned PRODUCT Git commit and evidence with an operator; no claim",
    "HOLD_CRITICAL": "Investigate critical source offline; no autonomous action",
    "HOLD": "Review recorded HOLD reason and source; change only through a separate draft PR",
    "WAITING": "Review the proposal and approval boundary; do not execute",
    "CLAIMED": "Await simulated lease expiry/receipt; no agent may run",
    "DONE": "Simulation receipt only; inspect independent CI and signed release acceptance",
    "OBSERVED": "Source observation has no execution or scheduling permission",
}
DISPLAY_STATUS = frozenset(STATUS_MAP)
REPO = re.compile(r"[a-z0-9][a-z0-9_-]{1,40}\Z")
SOURCE_SHA = re.compile(r"(?:unknown|[0-9a-f]{40})\Z")


def _safe_read_model(journal: SecureJournal, *, max_rows=80):
    if (not isinstance(journal, SecureJournal) or
        type(max_rows) is not int or not 1 <= max_rows <= MAX_ROWS):
        raise Rejected("HOLD_DASHBOARD_UNTRUSTED_SOURCE_OR_BOUNDS")
    if journal.conn.in_transaction:
        raise Rejected("HOLD_DASHBOARD_ACTIVE_WRITER_TRANSACTION")
    # Audit must be present and intact; do not fabricate a verified green view
    # for a legacy F0/F1 ledger without transactional F6 receipts.
    verified: dict[tuple, bool] = {}
    rows = []
    # Verify the audit and source rows INSIDE one stable read transaction,
    # not in two separately observed WAL snapshots. No SQL writes/DDL.
    journal.conn.execute("BEGIN")
    try:
        audit = FrozenAudit(journal.conn,create_schema=False).verify()
        if audit["entries"] <= 0:
            raise Rejected("HOLD_DASHBOARD_NO_AUDIT_EVIDENCE")
        raw = journal.conn.execute(
            "SELECT e.seq,e.body,e.lane,e.kind,e.repo,e.source_sha,"
            "e.trust,j.status,j.attempts,j.hold_reason,j.pr_key "
            "FROM f1_events e LEFT JOIN f2_jobs j ON j.event_seq=e.seq "
            "ORDER BY e.seq DESC LIMIT ?", (max_rows,)
        ).fetchall()
        for (sequence, body, lane, kind, repo, sha, trust,
             queued, attempts, reason, pr_key) in raw:
            try:
                event = json.loads(body)
            except (ValueError, TypeError):
                raise Rejected("HOLD_DASHBOARD_CORRUPT_EVENT") from None
            # Restrict stored fields rather than trusting old rows just
            # because they came from a database path.
            if (lane not in ("PRODUCT_B", "PRODUCT_C") or
                type(repo) is not str or not REPO.fullmatch(repo) or
                type(sha) is not str or not SOURCE_SHA.fullmatch(sha) or
                type(event) is not dict or
                event.get("lane") != lane or
                event.get("kind") != kind or
                event.get("source_sha") != sha or
                event.get("severity") not in
                ("info", "warning", "error", "critical")):
                raise Rejected("HOLD_DASHBOARD_CORRUPT_SOURCE_BINDING")
            source = event.get("source")
            identity = (lane, source, sha)
            if identity not in verified:
                bound = journal.bindings.get((lane, source))
                if bound is None or bound.name != repo:
                    verified[identity] = False
                else:
                    try:
                        bound.verify(journal.root, sha)
                        verified[identity] = True
                    except Rejected:
                        verified[identity] = False
            is_current = trust == "VERIFIED" and verified[identity]
            if not is_current:
                status = "HOLD_SOURCE_UNVERIFIED"
            elif event["severity"] == "critical":
                status = "HOLD_CRITICAL"
            elif queued == "HOLD":
                status = "HOLD"
            elif queued in ("WAITING", "CLAIMED", "DONE"):
                status = queued
            else:
                status = "OBSERVED"
            evidence = event.get("evidence_ref")
            if (type(evidence) is not str or len(evidence) > 300 or
                not evidence.startswith(("receipt://event/",
                                         "fixture://",
                                         "https://github.com/Emaren/"))):
                raise Rejected("HOLD_DASHBOARD_UNSAFE_EVIDENCE_LABEL")
            rows.append({
                "recordId": f"KF-{sequence:012d}",
                "lane": lane, "severity": event["severity"],
                "category": kind, "repo": repo,
                "sourceSha": sha,
                "sourceStatus": "LOCAL_GIT_HEAD_MATCH" if is_current
                                else "HOLD_CURRENT_SOURCE_UNVERIFIED",
                "evidence": evidence, "state": status,
                "attempts": attempts if type(attempts) is int and 0 <= attempts <= 3 else 0,
                "holdReason": reason if type(reason) is str and
                              re.fullmatch(r"[A-Z_]{0,64}", reason) else "UNAVAILABLE",
                "prTarget": pr_key if type(pr_key) is str and
                            re.fullmatch(r"[a-z0-9:/_-]{1,128}", pr_key)
                            else None,
                "nextPermittedStep": STATUS_MAP[status],
                "financialApproval": False,
                "executionEnabled": False,
            })
    finally:
        journal.conn.execute("ROLLBACK")
    totals = Counter(x["state"] for x in rows)
    severity = Counter(x["severity"] for x in rows)
    return {
        "schema": "kingdom.foundry.private-command-read-model.v1",
        "status": "READONLY_SOURCE_VIEW_NOT_PRODUCTION_CERTIFICATION",
        "entriesShown": len(rows),
        "truncatedToMaxRows": len(rows) == max_rows,
        "totalByState": dict(sorted(totals.items())),
        "totalBySeverity": dict(sorted(severity.items())),
        "audit": audit,
        "items": rows,
        "executor": "DISABLED", "modelInference": "DISABLED",
        "websiteMounted": False, "privatePaperAccountData": False,
        "currentMarketPrice": None,
        "historicalSevenPositionMark": None,
        "historicalUnrealizedPnL": None,
        "newPaperOrdersAllowed": False, "realOrdersAllowed": False,
        "walletOrWoloAllowed": False,
        "resourceBudget": "NO_RUNTIME_OR_INFERENCE_ADMITTED",
    }


def read_model(journal: SecureJournal, *, max_rows=80):
    return _safe_read_model(journal, max_rows=max_rows)


def render_private_html(report: dict) -> str:
    if (type(report) is not dict or
        report.get("schema") != "kingdom.foundry.private-command-read-model.v1" or
        report.get("executor") != "DISABLED" or
        report.get("newPaperOrdersAllowed") is not False or
        report.get("realOrdersAllowed") is not False or
        report.get("walletOrWoloAllowed") is not False or
        report.get("historicalSevenPositionMark") is not None or
        type(report.get("items")) is not list or
        len(report["items"]) > MAX_ROWS):
        raise Rejected("HOLD_DASHBOARD_UNTRUSTED_REPORT")
    audit = report.get("audit")
    if type(audit) is not dict:
        raise Rejected("HOLD_DASHBOARD_NO_VERIFIED_AUDIT")
    hold_only = audit.get("status") == "NO_AUDIT_ALL_HOLDS"
    if hold_only:
        # This alternative is ONLY for a private F8 source-UNKNOWN journal,
        # not a way to bless a "DONE" receipt without an F6 audit chain.
        if (report.get("status") != "HOLD_ONLY_UNSEALED_NO_SCHEDULER" or
            audit.get("entries") != 0 or not report["items"] or
            any(type(row) is not dict or
                row.get("state") != "HOLD_SOURCE_UNVERIFIED" or
                row.get("sourceSha") != "unknown" or
                row.get("sourceStatus") != "HOLD_CURRENT_SOURCE_UNVERIFIED"
                for row in report["items"])):
            raise Rejected("HOLD_DASHBOARD_UNSEALED_NOT_ALL_SOURCE_HOLD")
    elif audit.get("status") != "VERIFIED_INTERNAL_CHAIN_ONLY":
        raise Rejected("HOLD_DASHBOARD_NO_VERIFIED_AUDIT")
    unsealed_note = (
        '<p class="warn" role="status">UNSEALED HOLD-ONLY OBSERVATIONS: '
        'No source attestation, scheduler job or audited completion '
        'is present. Every row requires operator investigation.</p>'
        if hold_only else ""
    )
    css = """
:root{color-scheme:dark;--bg:#101620;--panel:#1b2533;--line:#344255;
--text:#f5f8ff;--muted:#bdc9db;--accent:#b3dbff;--hold:#f7be78;
--ok:#80e6bd}*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1280px;margin:auto;padding:clamp(16px,4vw,48px)}
h1{font-size:clamp(1.7rem,4vw,2.6rem);line-height:1.18;margin:0}
h2{font-size:1.25rem;margin:28px 0 12px}
header{border-bottom:1px solid var(--line);padding:0 0 24px}
p{max-width:90ch}.muted{color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(156px,1fr));
gap:12px;margin:22px 0}
.stat{background:var(--panel);border:1px solid var(--line);
border-radius:12px;padding:14px}
.stat b{font-size:1.45rem;display:block}
.warn{color:var(--hold)}.pass{color:var(--ok)}
table{border-collapse:collapse;width:100%;font-size:.91rem}
th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid var(--line)}
th{color:var(--accent);white-space:nowrap}
.tablewrap{overflow-x:auto;background:var(--panel);
border:1px solid var(--line);border-radius:12px}
code{overflow-wrap:anywhere;font-size:.82rem}
td span{display:block}th[scope=col]{font-weight:700}
footer{margin-top:32px;border-top:1px solid var(--line);
padding-top:14px;color:var(--muted);font-size:.9rem}
@media(max-width:640px){table{min-width:820px}main{padding:14px}
.stat{padding:10px}.tablewrap{box-shadow:inset -10px 0 20px #10162055}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
"""
    esc = lambda value: escape(str(value),quote=True)
    stats = [
        ("Visible records",report["entriesShown"]),
        ("HOLD sources",sum(v for k,v in report["totalByState"].items()
                            if k.startswith("HOLD"))),
        ("Audit receipts",report["audit"]["entries"]),
        ("New PAPER orders", "HALT"),
    ]
    stat_html = "".join(
        f'<div class="stat"><span class="muted">{esc(name)}</span>'
        f'<b>{esc(value)}</b></div>' for name,value in stats
    )
    table_rows = []
    for item in report["items"]:
        if (type(item) is not dict or
            item.get("state") not in DISPLAY_STATUS or
            item.get("lane") not in ("PRODUCT_B","PRODUCT_C")):
            raise Rejected("HOLD_DASHBOARD_ROW_INVALID")
        table_rows.append(
            "<tr>"
            f'<td><code>{esc(item.get("recordId",""))}</code>'
            f'<span>{esc(item["lane"])}</span></td>'
            f'<td>{esc(item.get("severity",""))}'
            f'<span>{esc(item["state"])}</span></td>'
            f'<td>{esc(item.get("category",""))}'
            f'<span>{esc(item.get("repo",""))}</span></td>'
            f'<td><code>{esc(item.get("sourceSha",""))}</code>'
            f'<span>{esc(item.get("sourceStatus",""))}</span></td>'
            f'<td><code>{esc(item.get("evidence",""))}</code></td>'
            f'<td>{esc(item.get("nextPermittedStep",""))}</td>'
            "</tr>"
        )
    html = (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<meta http-equiv=\"Content-Security-Policy\" "
        "content=\"default-src 'none'; style-src 'unsafe-inline'; "
        "img-src 'none'; connect-src 'none'; script-src 'none'; "
        "font-src 'none'; form-action 'none'; base-uri 'none'\">"
        "<title>Kingdom Foundry · Private Command View</title>"
        f"<style>{css}</style></head><body><main><header>"
        "<p class=\"muted\">PRODUCT-only / Static owner-private export</p>"
        "<h1>Kingdom Foundry · Central Command</h1>"
        "<p class=\"warn\">No agent execution · No financial authority · "
        "No live market-price certification</p>"
        "<p class=\"muted\">This is a bounded local database projection. "
        "Local Git source checks and internal hash-chain checks are not "
        "independent production or external attestations.</p>"
        f"{unsealed_note}</header>"
        f'<section aria-label="Queue summary" class="stats">{stat_html}</section>'
        "<h2>Investigation and HOLD register</h2>"
        '<div class="tablewrap" role="region" tabindex="0" '
        'aria-label="Scroll horizontally to read the evidence table">'
        '<table><caption class="muted">Sanitized source and proposed next step, '
        'never commands or approvals</caption><thead><tr>'
        '<th scope="col">Record and lane</th><th scope="col">Severity / HOLD</th>'
        '<th scope="col">Kind and repo</th><th scope="col">Source binding</th>'
        '<th scope="col">Evidence reference</th>'
        '<th scope="col">Next permitted step</th>'
        "</tr></thead><tbody>"
        + "".join(table_rows)
        + "</tbody></table></div>"
        "<h2>Financial and source quarantine</h2>"
        "<p class=\"warn\">The original 100 PAPER accounts and seven open BTC "
        "positions are historical accounting records only. Current "
        "mark and unrealized P&amp;L remain UNKNOWN. Never infer zero "
        "exposure or use synthetic reference prices to trade.</p>"
        "<footer>Static private file. No network, cookies, third-party "
        "scripts, private PAPER credentials, live order controls or "
        "browser-side calls. Session B owns the public website; "
        "Codex owns FINANCIAL.</footer></main></body></html>"
    )
    if len(html.encode("utf-8")) > MAX_HTML_BYTES:
        raise Rejected("HOLD_DASHBOARD_HTML_BYTE_BUDGET")
    return html


def write_private_export(report, destination: Path, *, private_root: Path):
    """Create a new 0600 local HTML snapshot without overwrite or disclosure.

    Caller supplies an already authorized owner-private PRODUCT directory.
    O_EXCL protects the destination and hardlinks prevent overwrite.
    Crash recovery leaves at worst an owner-only temp file (no automation).
    """
    root = Path(private_root).resolve(strict=True)
    out = Path(destination).absolute()
    if (root.stat().st_mode & 0o077 or
        out.parent.resolve(strict=True) != root or out.is_symlink() or
        not re.fullmatch(r"foundry-private-[a-z0-9_-]{3,75}\.html",out.name)):
        raise Rejected("HOLD_DASHBOARD_EXPORT_NOT_PRIVATE_PRODUCT")
    source = render_private_html(report).encode("utf-8")
    temp = root / (".foundry-private-"+secrets.token_hex(12)+".tmp")
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    if hasattr(os,"O_NOFOLLOW"): flags |= os.O_NOFOLLOW
    descriptor = os.open(temp,flags,0o600)
    try:
        with os.fdopen(descriptor,"wb") as handle:
            handle.write(source)
            handle.flush()
            os.fsync(handle.fileno())
        os.link(temp,out,follow_symlinks=False)
    finally:
        if temp.exists():
            temp.unlink()
    if out.stat().st_mode & 0o777 != 0o600:
        raise Rejected("HOLD_DASHBOARD_EXPORT_MODE")
    return {"status":"PASS_OWNER_PRIVATE_SNAPSHOT_ONLY",
            "bytes":len(source),"sha256":__import__("hashlib").sha256(source).hexdigest(),
            "networkListeners":0,"executors":0,
            "publicWebsiteMounted":False}
