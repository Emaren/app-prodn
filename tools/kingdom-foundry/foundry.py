#!/usr/bin/env python3
"""Kingdom Foundry V0: unprivileged, offline, deterministic observe/propose journal."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys

SCHEMA = "kingdom.foundry.event.v0"
FIELDS = frozenset({"schema_version", "event_id", "observed_utc", "source", "lane", "kind", "severity", "source_sha", "summary", "evidence_ref"})
LANES = {"PRODUCT_B", "PRODUCT_C"}  # FINANCIAL intentionally impossible
KINDS = {"ci_failure", "test_failure", "traffic_gap", "watcher_drift", "storage_pressure", "paper_source_stale", "website_media_missing"}
SEVERITIES = {"info", "warning", "error", "critical"}
SOURCES = {"github-ci", "traffic-rollup", "watcher", "storage-os", "kingdom-traders-paper", "app-media", "source-tests"}
SENSITIVE = re.compile(r"(?i)(password|passphrase|private.?key|api.?key|bearer|cookie|authorization|secret|wallet.?seed|mnemonic|\btoken\b|financial.?sql|signing.?key)")
ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._:-]{4,127}$")
SHA = re.compile(r"^(unknown|[0-9a-f]{40}|[0-9a-f]{64})$")
MAX_BYTES = 8192
PROTECTED_PATH_PARTS = {"financial", ".wolo-owner-authority", "recovery-archives"}

def safe_product_path(path):
    # This is not an OS sandbox. Deploy V0 only under a restricted identity.
    resolved = Path(path).expanduser().resolve(strict=False)
    if any(part.lower() in PROTECTED_PATH_PARTS for part in resolved.parts):
        raise Rejected("protected FINANCIAL/owner authority path denied")
    return resolved

class Rejected(ValueError):
    pass

def validate(obj):
    if not isinstance(obj, dict) or set(obj) != FIELDS:
        raise Rejected("schema fields do not match fixed allowlist")
    if obj["schema_version"] != SCHEMA or obj["lane"] not in LANES:
        raise Rejected("schema/lane refused")
    if obj["source"] not in SOURCES or obj["kind"] not in KINDS or obj["severity"] not in SEVERITIES:
        raise Rejected("source/kind/severity refused")
    if not isinstance(obj["event_id"], str) or not ID.fullmatch(obj["event_id"]):
        raise Rejected("invalid event ID")
    if not isinstance(obj["source_sha"], str) or not SHA.fullmatch(obj["source_sha"]):
        raise Rejected("invalid source SHA")
    for k in ("observed_utc", "summary", "evidence_ref"):
        if not isinstance(obj[k], str) or len(obj[k]) > 320 or not obj[k]:
            raise Rejected(f"invalid {k}")
    if SENSITIVE.search(obj["summary"]) or SENSITIVE.search(obj["evidence_ref"]):
        raise Rejected("possible sensitive material: refuse storage")
    if not obj["evidence_ref"].startswith(("https://github.com/", "fixture://", "receipt://")):
        raise Rejected("evidence must use an approved nonsecret reference scheme")
    try:
        dt = datetime.fromisoformat(obj["observed_utc"].replace("Z", "+00:00"))
        if dt.tzinfo is None or dt.utcoffset() is None:
            raise ValueError()
    except ValueError:
        raise Rejected("event time must have timezone") from None
    return json.dumps(obj, sort_keys=True, ensure_ascii=True, separators=(",", ":"))

def connect(path):
    path = safe_product_path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=3000")
    conn.execute("CREATE TABLE IF NOT EXISTS events (event_id TEXT PRIMARY KEY, body_sha256 TEXT NOT NULL, body TEXT NOT NULL, recorded_utc TEXT NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS proposals (event_id TEXT PRIMARY KEY REFERENCES events(event_id), lane TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('QUEUED','HOLD')), prompt TEXT NOT NULL)")
    conn.commit()
    return conn

def ingest(conn, data):
    if len(data) > MAX_BYTES:
        raise Rejected("event oversized")
    try:
        obj = json.loads(data)
    except (ValueError, UnicodeDecodeError):
        raise Rejected("invalid JSON") from None
    canonical = validate(obj)
    sha = hashlib.sha256(canonical.encode()).hexdigest()
    existing = conn.execute("SELECT body_sha256 FROM events WHERE event_id=?", (obj["event_id"],)).fetchone()
    if existing:
        if existing[0] != sha:
            raise Rejected("same event ID with altered evidence")
        return "DUPLICATE", sha
    # Untrusted DATA only. Not a command, agent instruction or execution permit.
    prompt = f"Investigate {obj['kind']} in {obj['source']} at source {obj['source_sha']}; review evidence {obj['evidence_ref']} in {obj['lane']} only; propose source-only tests; no production action."
    status = "HOLD" if obj["source_sha"] == "unknown" or obj["severity"] == "critical" else "QUEUED"
    with conn:
        conn.execute("INSERT INTO events VALUES(?,?,?,?)", (obj["event_id"], sha, canonical, datetime.now(timezone.utc).isoformat()))
        conn.execute("INSERT INTO proposals VALUES(?,?,?,?,?)", (obj["event_id"], obj["lane"], obj["kind"], status, prompt))
    return status, sha

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", default="foundry-v0.sqlite3")
    sub = ap.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    sub.add_parser("status")
    sub.add_parser("queue")
    ing = sub.add_parser("ingest")
    ing.add_argument("event_file")
    args = ap.parse_args(argv)
    try:
        with connect(args.db) as conn:
            if args.command == "init":
                print("PASS_FOUNDRY_V0_INITIALIZED_NO_EXECUTION")
            elif args.command == "ingest":
                p = safe_product_path(args.event_file)
                if not p.is_file() or p.stat().st_size > MAX_BYTES:
                    raise Rejected("file missing or oversized")
                status, sha = ingest(conn, p.read_bytes())
                print(json.dumps({"status": status, "event_sha256": sha}))
            elif args.command == "status":
                print(json.dumps({"events": conn.execute("SELECT count(*) FROM events").fetchone()[0], "proposals": dict(conn.execute("SELECT status, count(*) FROM proposals GROUP BY status")), "executor": "DISABLED", "finance": "DENIED", "inference": "DISABLED"}, sort_keys=True))
            else:
                for event_id, lane, kind, status, prompt in conn.execute("SELECT event_id,lane,kind,status,prompt FROM proposals ORDER BY rowid"):
                    print(json.dumps({"event_id":event_id, "lane":lane, "kind":kind, "status":status, "proposal":prompt}))
    except (Rejected, sqlite3.Error) as exc:
        print(f"HOLD_FOUNDRY_V0 {exc}", file=sys.stderr)
        return 3
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
