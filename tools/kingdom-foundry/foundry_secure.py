"""F1 source-bound, monotonic, immutable, NONEXECUTING Foundry journal.

Reads trusted PRODUCT Git source through FIXED argv, shell=False; no coding
model, free-form command, HTTP, financial source, or task execution.
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json
import os
import re
import sqlite3
import subprocess
from foundry import Rejected, MAX_BYTES, validate

COMMIT = re.compile(r"[0-9a-f]{40}\Z")
HOSTILE = re.compile(r"(?i)(<script|javascript:|data:text/html|"
                     r"ignore\s+(all\s+)?(prior|previous|system)\s+instructions|"
                     r"(sudo|chmod|chown|curl|wget|eval|exec)\s+|"
                     r"\$\(|\x60|rm\s+-|BEGIN\s+PRIVATE\s+KEY|"
                     r"password|passphrase|bearer|authorization|cookie|"
                     r"api[_-]?key|(?:^|/)\.\.(?:/|$))")
REPOS = frozenset(("app-prodn", "kingdom-traders", "traffic-api", "traffic-app"))
MAX_EVENTS = 5_000
PROTECTED_PARTS = frozenset(("financial", ".wolo-owner-authority",
                             "recovery-archives", "signer", "custody"))


def strict_json(data: bytes):
    if type(data) is not bytes or not 0 < len(data) <= MAX_BYTES:
        raise Rejected("HOLD_INVALID_EVENT_SIZE")
    def pairs(items):
        out = {}
        for key, value in items:
            if key in out:
                raise Rejected("HOLD_DUPLICATE_JSON_KEY")
            out[key] = value
        return out
    try:
        return json.loads(data.decode("utf-8"), object_pairs_hook=pairs,
                          parse_constant=lambda x: (_ for _ in ()).throw(
                              Rejected("HOLD_NONFINITE_JSON")))
    except Rejected:
        raise
    except (UnicodeError, ValueError) as exc:
        raise Rejected("HOLD_UNDECODABLE_EVENT") from exc


def strict_event(data: bytes):
    event = strict_json(data)
    canonical = validate(event)
    for key in ("event_id", "summary", "evidence_ref"):
        if HOSTILE.search(event[key]) or any(ord(c) < 32 for c in event[key]):
            raise Rejected("HOLD_HOSTILE_EVENT_CONTENT")
    if not event["observed_utc"].endswith("Z"):
        raise Rejected("HOLD_EVENT_UTC_REQUIRED")
    uri = urlsplit(event["evidence_ref"])
    rawpath = unquote(uri.path)
    if (uri.query or uri.fragment or uri.username or uri.password or
        any(segment == ".." for segment in rawpath.split("/"))):
        raise Rejected("HOLD_EVIDENCE_TRAVERSAL")
    if uri.scheme == "https":
        parts = rawpath.strip("/").split("/")
        if (uri.netloc != "github.com" or len(parts) < 4 or
            parts[0] != "Emaren" or parts[1] not in REPOS or
            parts[2] not in ("pull", "issues", "commit", "actions")):
            raise Rejected("HOLD_UNTRUSTED_EVIDENCE_URL")
    elif uri.scheme in ("receipt", "fixture"):
        if (uri.netloc not in ("event", "fixture", "test") or
            not re.fullmatch(r"/[A-Za-z0-9._/-]{1,130}", rawpath)):
            raise Rejected("HOLD_UNTRUSTED_RECEIPT")
    else:
        raise Rejected("HOLD_UNTRUSTED_EVIDENCE_SCHEME")
    return event, canonical


@dataclass(frozen=True)
class TrustedRepo:
    name: str
    root: Path
    approved_commit: str
    expected_origin: str

    def verify(self, product_root: Path, source_sha: str):
        if self.name not in REPOS or not COMMIT.fullmatch(
            source_sha if type(source_sha) is str else ""):
            raise Rejected("HOLD_UNKNOWN_REPO_OR_SHA")
        if source_sha != self.approved_commit:
            raise Rejected("HOLD_SOURCE_NOT_PINNED")
        base = Path(product_root).resolve(strict=True)
        repo = Path(self.root).resolve(strict=True)
        if (not repo.is_dir() or not repo.is_relative_to(base) or
            any(x.lower() in PROTECTED_PARTS for x in repo.parts)):
            raise Rejected("HOLD_OUTSIDE_PRODUCT_SOURCE")
        if not self.expected_origin.startswith(("git@github.com:Emaren/",
                                               "https://github.com/Emaren/")):
            raise Rejected("HOLD_UNAPPROVED_GIT_ORIGIN")
        # Not a shell; ONLY fixed read-only git queries, with user event text
        # never interpreted as a command or argument other than checked SHA.
        def git(*argv):
            command = ["git", "-c", "core.hooksPath=/dev/null", "-C",
                       str(repo), *argv]
            env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                   "HOME": str(base), "GIT_CONFIG_NOSYSTEM": "1",
                   "GIT_CONFIG_GLOBAL": os.devnull,
                   "GIT_TERMINAL_PROMPT": "0"}
            try:
                reply = subprocess.run(command, shell=False, env=env,
                    capture_output=True, text=True, timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                raise Rejected("HOLD_GIT_PROOF_UNAVAILABLE") from None
            if reply.returncode or len(reply.stdout) > 1024:
                raise Rejected("HOLD_GIT_PROOF_FAILED")
            return reply.stdout.strip()
        if Path(git("rev-parse", "--show-toplevel")).resolve() != repo:
            raise Rejected("HOLD_GIT_ROOT_MISMATCH")
        if git("remote", "get-url", "origin") != self.expected_origin:
            raise Rejected("HOLD_GIT_ORIGIN_MISMATCH")
        if git("rev-parse", "HEAD") != source_sha:
            raise Rejected("HOLD_GIT_HEAD_MISMATCH")
        if git("cat-file", "-t", source_sha) != "commit":
            raise Rejected("HOLD_GIT_NOT_A_COMMIT")
        return self.name


class SecureJournal:
    def __init__(self, path: Path, product_root: Path,
                 bindings: dict[tuple[str, str], TrustedRepo]):
        self.root = Path(product_root).resolve(strict=True)
        self.bindings = dict(bindings)
        if not self.bindings:
            raise Rejected("HOLD_NO_TRUSTED_SOURCE_ROSTER")
        p = Path(path).expanduser().absolute()
        if p.is_symlink() or p.parent.is_symlink():
            raise Rejected("HOLD_DATABASE_SYMLINK")
        parent = p.parent.resolve(strict=True)
        if (not parent.is_relative_to(self.root) or
            any(x.lower() in PROTECTED_PARTS for x in p.parts) or
            parent.stat().st_mode & 0o077):
            raise Rejected("HOLD_DATABASE_PARENT_NOT_PRIVATE")
        if p.exists() and (not p.is_file() or p.stat().st_mode & 0o077 or
                           p.stat().st_size > 64*1024*1024):
            raise Rejected("HOLD_DATABASE_FILE_NOT_PRIVATE")
        if not p.exists():
            fd = os.open(p, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(fd)
        self.conn = sqlite3.connect(p, isolation_level=None, timeout=3)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=3000")
        self.conn.execute("PRAGMA wal_autocheckpoint=100")
        self.conn.execute("PRAGMA journal_size_limit=8388608")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.execute("CREATE TABLE IF NOT EXISTS f1_events ("
            "seq INTEGER PRIMARY KEY AUTOINCREMENT,"
            "external_id TEXT NOT NULL UNIQUE,"
            "body_sha256 TEXT NOT NULL,"
            "task_fingerprint TEXT NOT NULL UNIQUE,"
            "body TEXT NOT NULL,"
            "lane TEXT NOT NULL,"
            "kind TEXT NOT NULL,"
            "repo TEXT NOT NULL,"
            "source_sha TEXT NOT NULL,"
            "trust TEXT NOT NULL CHECK(trust IN ('VERIFIED','HOLD')),"
            "recorded_utc TEXT NOT NULL)")
        self.conn.commit()

    def close(self):
        self.conn.close()

    def ingest(self, data: bytes, evidence_bytes: bytes | None = None):
        event, canonical = strict_event(data)
        evidence_verified = False
        offline_fixture_evidence = False
        if evidence_bytes is not None:
            if type(evidence_bytes) is not bytes or not 0 < len(evidence_bytes) <= 4096:
                raise Rejected("HOLD_EVIDENCE_BYTES_OVERSIZED")
            proof = strict_json(evidence_bytes)
            common = (type(proof) is dict and
                proof.get("source") == event["source"] and
                proof.get("status") in ("OBSERVED", "FAILED", "UNKNOWN"))
            if not common:
                raise Rejected("HOLD_EVIDENCE_NOT_TYPED")
            if proof.get("schema") == "kingdom.foundry.evidence.v1":
                if set(proof) != {"schema", "source", "status"}:
                    raise Rejected("HOLD_EVIDENCE_NOT_TYPED")
            elif proof.get("schema") == "kingdom.foundry.evidence.v2":
                # F8 observational fixture digests are local content seals;
                # they cannot become authenticated Git/source attestations.
                if (set(proof) != {"schema", "source", "status",
                                  "observation_sha256", "diagnostic_code"} or
                    type(proof.get("observation_sha256")) is not str or
                    not re.fullmatch(r"[0-9a-f]{64}", proof["observation_sha256"]) or
                    type(proof.get("diagnostic_code")) is not str or
                    not re.fullmatch(r"[A-Z_]{4,80}", proof["diagnostic_code"])):
                    raise Rejected("HOLD_EVIDENCE_NOT_TYPED")
                offline_fixture_evidence = True
            else:
                raise Rejected("HOLD_EVIDENCE_NOT_TYPED")
            if HOSTILE.search(evidence_bytes.decode("utf-8")):
                raise Rejected("HOLD_EVIDENCE_HOSTILE")
            expected = "receipt://event/" + sha256(evidence_bytes).hexdigest()
            if event["evidence_ref"] != expected:
                raise Rejected("HOLD_EVIDENCE_SHA_MISMATCH")
            evidence_verified = True
        binding = self.bindings.get((event["lane"], event["source"]))
        if binding is None:
            raise Rejected("HOLD_UNTRUSTED_LANE_SOURCE_PAIR")
        try:
            repo = binding.verify(self.root, event["source_sha"])
            trust = "VERIFIED"
        except Rejected:
            repo, trust = binding.name, "HOLD"
        if (event["severity"] == "critical" or not evidence_verified or
            offline_fixture_evidence):
            trust = "HOLD"
        body_sha = sha256(canonical.encode("ascii")).hexdigest()
        fingerprint = sha256(json.dumps({
            "lane": event["lane"], "source": event["source"],
            "kind": event["kind"], "source_sha": event["source_sha"],
            "evidence_ref": event["evidence_ref"],
        }, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        self.conn.execute("BEGIN IMMEDIATE")
        try:
            current = self.conn.execute("SELECT seq,body_sha256 FROM f1_events "
                "WHERE external_id=?", (event["event_id"],)).fetchone()
            if current:
                if current[1] != body_sha:
                    raise Rejected("HOLD_EVENT_ID_COLLISION")
                self.conn.execute("COMMIT")
                return {"status":"DUPLICATE","sequence":current[0],
                        "record_id":f"KF-{current[0]:012d}"}
            duplicate = self.conn.execute("SELECT seq FROM f1_events "
                "WHERE task_fingerprint=?", (fingerprint,)).fetchone()
            if duplicate:
                self.conn.execute("COMMIT")
                return {"status":"DUPLICATE_TASK","sequence":duplicate[0],
                        "record_id":f"KF-{duplicate[0]:012d}"}
            created = self.conn.execute("INSERT INTO f1_events("
                "external_id,body_sha256,task_fingerprint,body,lane,kind,"
                "repo,source_sha,trust,recorded_utc) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (event["event_id"], body_sha, fingerprint, canonical,
                 event["lane"], event["kind"], repo, event["source_sha"],
                 trust, datetime.now(timezone.utc).isoformat()))
            seq = created.lastrowid
            self.conn.execute("COMMIT")
            return {"status":"RECORDED" if trust == "VERIFIED" else "HOLD",
                    "sequence":seq,"record_id":f"KF-{seq:012d}",
                    "source_verified":trust == "VERIFIED",
                    "body_sha256":body_sha}
        except BaseException:
            self.conn.execute("ROLLBACK")
            raise

    def rows(self):
        return tuple(self.conn.execute("SELECT seq,external_id,lane,kind,trust "
                          "FROM f1_events ORDER BY seq").fetchall())
