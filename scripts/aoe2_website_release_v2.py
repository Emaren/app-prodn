#!/usr/bin/env python3
"""Candidate-bound, NONDEPLOYING website release authority verifier.

This is phase-1 engineering for app #665, not an exception to Finish P1.
The protected Ship/Finish code does not consume this verifier's result.
A separate independently reviewed, under-global-lease issuer/consumer and
real operator/owner approvals are required before any production action.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import os
import re
import secrets
import sqlite3
import stat
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

PRODUCTION_SHA = "a2b941f154fdc31ec4d6c4ece6d0e49036c48abd"
MAIN_SOURCE_SHA = "21cd1493b182cb0968a6b6cf3f528d0578cfd797"
FAST_URI_PATCH_BLOB_SHA = "27f0271065998f9025f530580a5a0732a4141e15"
TRUST_ROOT = Path("/etc/aoe2war/website-release-authority-v2")
ROLES = ("owner", "chain_reviewer", "finance_reviewer", "release_operator")
ALLOWED_DELTA = frozenset({
    "components/kingdom-index/KingdomIndex.tsx",
    "config/kingdom-index-baseline.json",
    "config/kingdom-index-provisional-source-reviews.json",
    "config/kingdom-index-routes.json",
    "config/kingdom-index-watcher-166-source-review.json",
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
    "tests/kingdom-index-watcher-draft-score.test.mts",
    "yarn.lock",
    # This verifier and its tests have no web/SSR/worker import entrypoint.
    "scripts/aoe2_website_release_v2.py",
    "tests/test_aoe2_website_release_v2.py",
    "docs/WEBSITE_ONLY_RELEASE_AUTHORITY_V2.md",
})
HEX40 = re.compile(r"[a-f0-9]{40}\Z")
HEX64 = re.compile(r"[a-f0-9]{64}\Z")
NONCE = re.compile(r"[A-Za-z0-9_-]{24,96}\Z")


class Hold(ValueError):
    """Fail closed without authorizing a deployment."""


def require(ok: bool, message: str):
    if not ok:
        raise Hold(message)


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate JSON key")
        result[key] = value
    return result


def canonical(payload) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def read_json(path: Path) -> dict:
    require(path.is_file() and not path.is_symlink(), "missing/linked evidence")
    require(path.stat().st_size <= 2_000_000, "oversized evidence")
    with path.open("r", encoding="utf-8") as handle:
        result = json.load(handle, object_pairs_hook=no_duplicates,
                           parse_constant=lambda _: (_ for _ in ()).throw(Hold("nonfinite JSON")))
    require(type(result) is dict, "evidence must be a JSON object")
    return result


def utc_time(raw: str) -> datetime:
    require(type(raw) is str and raw.endswith("Z"), "UTC timestamp required")
    try:
        when = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise Hold("malformed timestamp") from exc
    require(when.utcoffset() == timedelta(0), "non-UTC timestamp")
    return when


def git(repo: Path, *args: str) -> str:
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    result = subprocess.run(["git", "-C", str(repo), "-c", "core.fsmonitor=false",
                             "-c", "core.hooksPath=/dev/null", *args],
                            capture_output=True, timeout=30, env=env, check=False)
    require(result.returncode == 0, "git provenance command failed")
    try:
        return result.stdout.decode("utf-8").strip()
    except UnicodeDecodeError as exc:
        raise Hold("non-UTF8 source path") from exc


def source_scope(repo: Path, target: str) -> dict:
    require(type(target) is str and HEX40.fullmatch(target) is not None,
            "invalid candidate sha")
    require(git(repo, "rev-parse", "--verify", "HEAD") == target,
            "candidate checkout is not exact")
    require(git(repo, "status", "--porcelain", "--untracked-files=all",
                "--ignore-submodules=none") == "",
            "dirty candidate")
    # Porcelain status may conceal edited build inputs when Git index flags
    # mark paths assume-unchanged or skip-worktree. A reviewed Git SHA does
    # not certify an uninspected working tree's actual build bytes.
    flags = git(repo, "ls-files", "-v", "-z")
    require(flags.endswith("\x00"), "truncated Git index flags")
    for entry in flags[:-1].split("\x00"):
        require(len(entry) >= 3 and entry[1:2] == " " and entry[0] == "H",
                "hidden or unreviewable Git index flags")
    require(git(repo, "merge-base", PRODUCTION_SHA, target) == PRODUCTION_SHA,
            "certified production is not ancestor")
    # Name-status catches path substitutions/renames, not just changed counts.
    raw = git(repo, "diff", "--name-status", "--no-renames",
              PRODUCTION_SHA + ".." + target).splitlines()
    changed = []
    for line in raw:
        fields = line.split("\t")
        require(len(fields) == 2 and fields[0] in ("A", "M"),
                "renamed/deleted/unreviewable candidate path")
        path = fields[1]
        require(path in ALLOWED_DELTA, "non-website or unknown source path: " + path)
        changed.append(path)
    require(len(changed) == len(set(changed)) and changed,
            "empty/duplicate source scope")
    require(git(repo, "rev-parse", target + ":yarn.lock") == FAST_URI_PATCH_BLOB_SHA,
            "unreviewed dependency graph")
    # No financial business source, migration, signer, queue, network endpoint
    # or release-runner mutation is admitted by this exact closed-world delta.
    return {"base": PRODUCTION_SHA, "candidate": target,
            "paths": sorted(changed),
            "scope_sha256": hashlib.sha256(canonical(sorted(changed))).hexdigest(),
            "transitive_noninterference_certified": False}


def protected_key(path: Path, trust_root: Path, *, allow_test_root=False) -> bytes:
    require(trust_root.is_absolute() and not trust_root.is_symlink(), "untrusted root")
    require(path.parent == trust_root and path.is_file() and not path.is_symlink(),
            "missing/redirected independent key")
    for part in (trust_root, path):
        mode = part.stat()
        if not allow_test_root:
            require(mode.st_uid == 0, "trust material not root-owned")
        require(not (mode.st_mode & (stat.S_IWGRP | stat.S_IWOTH)),
                "writable reviewer trust material")
    raw = path.read_bytes()
    require(0 < len(raw) < 8192 and b"PUBLIC KEY" in raw,
            "invalid reviewer key file")
    return raw


def verify_signatures(payload: dict, signatures: dict,
                      trust_root: Path = TRUST_ROOT, *,
                      allow_test_root=False) -> None:
    require(type(signatures) is dict and set(signatures) == set(ROLES),
            "four independent role signatures required")
    fingerprints = set()
    for role in ROLES:
        key = trust_root / (role + ".pem")
        raw = protected_key(key, trust_root, allow_test_root=allow_test_root)
        # Reviewer identity is the mathematical public key, not PEM text:
        # rewrapping the same SPKI as 32- vs 64-column base64 must NOT
        # impersonate a second independent approval role.
        identity = subprocess.run(
            ["openssl", "pkey", "-pubin", "-in", str(key),
             "-pubout", "-outform", "DER"],
            capture_output=True, timeout=10, check=False)
        require(identity.returncode == 0 and 0 < len(identity.stdout) < 8192,
                "unparseable independent reviewer key")
        fingerprint = hashlib.sha256(identity.stdout).hexdigest()
        require(fingerprint not in fingerprints, "duplicate reviewer identity")
        fingerprints.add(fingerprint)
        try:
            sig = base64.b64decode(signatures[role], validate=True)
        except (TypeError, ValueError, binascii.Error) as exc:
            raise Hold("invalid signature encoding") from exc
        require(32 <= len(sig) <= 8192, "invalid signature length")
        with tempfile.TemporaryDirectory(prefix="aoe2-web-auth-") as temp:
            location = Path(temp)
            (location / "message").write_bytes(canonical(payload))
            (location / "signature").write_bytes(sig)
            result = subprocess.run(
                ["openssl", "dgst", "-sha256", "-verify", str(key),
                 "-signature", str(location / "signature"),
                 str(location / "message")],
                capture_output=True, timeout=10, check=False)
        require(result.returncode == 0, "cryptographic reviewer signature invalid")


def assess(packet: dict, *, candidate: str, actual_scope: dict, now=None,
           trust_root=TRUST_ROOT, allow_test_root=False) -> dict:
    """Verify an independently signed phase packet; never return release GO."""
    require(type(packet) is dict and packet.get("schema") == 2,
            "unknown packet schema")
    payload, signatures = packet.get("payload"), packet.get("signatures")
    require(type(payload) is dict, "missing signed payload")
    require(payload.get("kind") == "aoe2war-website-only-v2",
            "invalid authority domain")
    phase = payload.get("phase")
    require(phase in ("PRE_STAGE", "PRE_ACTIVATE"), "invalid phase")
    require(payload.get("candidate_sha") == candidate == actual_scope.get("candidate"),
            "substituted candidate")
    require(payload.get("previous_production_sha") == PRODUCTION_SHA,
            "substituted production anchor")
    require(payload.get("scope_sha256") == actual_scope.get("scope_sha256"),
            "unreviewed source scope")
    require(payload.get("controller_sha") == hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "unreviewed running authority implementation")
    for name in ("challenge", "attempt_id"):
        require(type(payload.get(name)) is str and
                NONCE.fullmatch(payload[name]) is not None,
                "missing/invalid controller-issued identity")
    for name in ("controller_sha", "manifest_sha256", "gate_sha256",
                 "source_review_sha256", "wolo_prestate_sha256",
                 "financial_noninterference_sha256", "rollback_plan_sha256",
                 "independent_operator_observation_sha256"):
        require(type(payload.get(name)) is str and HEX64.fullmatch(payload[name]) is not None,
                "missing exact evidence digest " + name)
    require(payload.get("risk_class") in ("PRESENTATION", "INFRASTRUCTURE", "WATCHER"),
            "source gate did not independently classify presentation")
    require(payload.get("financial_release_authorized") is False and
            payload.get("custody_authorized") is False and
            payload.get("claim_889_resolved") is False and
            payload.get("wolo_source_p1_open") is True and
            payload.get("wolo_mutated") is False,
            "financial or Wolo authority escalation")
    current = now if now is not None else datetime.now(timezone.utc)
    issued, expiry = utc_time(payload.get("issued_at")), utc_time(payload.get("expires_at"))
    require(issued <= current < expiry and issued >= current - timedelta(minutes=30)
            and expiry - issued <= timedelta(minutes=30),
            "expired/stale/future authority")
    if phase == "PRE_STAGE":
        require(payload.get("artifact_sha256") is None and
                payload.get("stage_receipt_sha256") is None and
                payload.get("build_id") is None,
                "prestage packet cannot invent a staged artifact")
    else:
        for name in ("artifact_sha256", "stage_receipt_sha256",
                     "stage_approval_sha256", "wolo_poststage_sha256"):
            require(type(payload.get(name)) is str and
                    HEX64.fullmatch(payload[name]) is not None,
                    "activation missing actual stage evidence " + name)
        require(type(payload.get("build_id")) is str and
                8 <= len(payload["build_id"]) <= 128,
                "activation missing real BUILD_ID")
        require(payload.get("stage_challenge") != payload.get("challenge"),
                "phase challenge must be renewed")
    verify_signatures(payload, signatures, trust_root,
                      allow_test_root=allow_test_root)
    return {
        "state": "CRYPTOGRAPHIC_REVIEW_VALID_NONAUTHORIZING",
        "phase": phase, "candidate_sha": candidate,
        "attempt_id": payload["attempt_id"], "challenge": payload["challenge"],
        "expires_at": payload["expires_at"],
        "website_release_authorized": False,
        "financial_release_authorized": False,
        "production_mutated": False,
        "reason": "NO live issuer/atomic consumption/Ship integration or independently witnessed runtime continuity; review is not release.",
    }



# Executable **nondeploying** issuance and replay primitives. A future reviewed
# Ship integration must call these only under its authenticated global lease.
# Nothing in this module initiates a release.
STATE_ROOT = Path("/var/lib/aoe2war-website-authority-v2")


def _state_connection(state_root: Path, *, allow_test_root=False):
    require(state_root.is_absolute() and state_root.is_dir()
            and not state_root.is_symlink(), "unprovisioned/linked nonce authority")
    root_mode = state_root.stat()
    if not allow_test_root:
        # Controller executes as the *authenticated Mac operator* holding
        # the existing SSH/global lease. Requiring root-owned 0700 made that
        # legitimate unprivileged operator unable to issue or consume nonces,
        # and sudo would switch SSH/Git identity mid-transaction. The ledger
        # is instead private to the exact effective operator UID under the
        # independently root-protected /var/lib parent; public role keys stay
        # separately root-administered and signatures remain mandatory.
        require(root_mode.st_uid == os.geteuid(),
                "nonce authority is not owned by authenticated operator")
        parent = state_root.parent
        require(not parent.is_symlink() and parent.stat().st_uid == 0
                and not (parent.stat().st_mode & 0o022),
                "nonce ledger parent is not root-controlled")
    require(stat.S_ISDIR(root_mode.st_mode) and
            not (root_mode.st_mode & 0o077),
            "nonce authority directory must be private mode 0700")
    db = state_root / "authority.sqlite3"
    require(not db.is_symlink(), "linked nonce ledger")
    if not db.exists():
        fd = os.open(db, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(fd)
    mode = db.stat()
    if not allow_test_root:
        require(mode.st_uid == os.geteuid(),
                "nonce ledger not owned by authenticated operator")
    require(stat.S_ISREG(mode.st_mode) and not (mode.st_mode & 0o077),
            "nonce ledger must be private 0600")
    cx = sqlite3.connect(str(db), timeout=5, isolation_level=None)
    cx.execute("PRAGMA busy_timeout=5000")
    cx.execute("PRAGMA journal_mode=DELETE")
    cx.execute("PRAGMA synchronous=FULL")
    cx.execute("""CREATE TABLE IF NOT EXISTS attempts(
        attempt_id TEXT NOT NULL, phase TEXT NOT NULL, challenge TEXT UNIQUE NOT NULL,
        candidate_sha TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        previous_stage_sha TEXT, signed_packet_sha TEXT, consumed INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(attempt_id, phase)
    )""")
    return cx


def _stamp(moment: datetime) -> str:
    require(moment.utcoffset() == timedelta(0), "issuer clock must be UTC")
    return moment.isoformat(timespec="seconds").replace("+00:00", "Z")


def issue_challenge(*, state_root: Path, candidate: str, phase: str,
                    now=None, attempt_id=None, previous_stage_sha=None,
                    allow_test_root=False) -> dict:
    """Generate a real random, durable one-use challenge, never an approval."""
    require(type(candidate) is str and HEX40.fullmatch(candidate) is not None,
            "unbound issuer candidate")
    require(phase in ("PRE_STAGE", "PRE_ACTIVATE"), "unrecognized issuer phase")
    moment = now or datetime.now(timezone.utc)
    require(moment.utcoffset() == timedelta(0), "issuer clock not UTC")
    identity = attempt_id or secrets.token_urlsafe(32)
    challenge = secrets.token_urlsafe(32)
    require(NONCE.fullmatch(identity) is not None and
            NONCE.fullmatch(challenge) is not None, "unrecognized challenge identity")
    issued, expiry = _stamp(moment), _stamp(moment + timedelta(minutes=20))
    cx = _state_connection(state_root, allow_test_root=allow_test_root)
    try:
        cx.execute("BEGIN IMMEDIATE")
        if phase == "PRE_STAGE":
            require(attempt_id is None and previous_stage_sha is None,
                    "new PRE_STAGE must have newly minted identity")
        else:
            require(type(previous_stage_sha) is str and
                    HEX64.fullmatch(previous_stage_sha) is not None,
                    "activation must bind consumed stage approval")
            prior = cx.execute(
                "SELECT consumed,signed_packet_sha,candidate_sha FROM attempts "
                "WHERE attempt_id=? AND phase='PRE_STAGE'", (identity,)).fetchone()
            require(prior is not None and prior[0] == 1
                    and prior[1] == previous_stage_sha and prior[2] == candidate,
                    "stage attempt not consumed or replaced")
        cx.execute(
            "INSERT INTO attempts(attempt_id,phase,challenge,candidate_sha,issued_at,"
            "expires_at,previous_stage_sha) VALUES(?,?,?,?,?,?,?)",
            (identity, phase, challenge, candidate, issued, expiry, previous_stage_sha))
        cx.commit()
    except BaseException:
        cx.rollback()
        raise
    finally:
        cx.close()
    return {"attempt_id": identity, "challenge": challenge, "phase": phase,
            "candidate_sha": candidate, "issued_at": issued, "expires_at": expiry,
            "previous_stage_sha": previous_stage_sha,
            "website_release_authorized": False}


def consume_signed_review(*, packet: dict, candidate: str, actual_scope: dict,
                          state_root: Path, trust_root: Path = TRUST_ROOT,
                          now=None, allow_test_root=False) -> dict:
    """Atomic, durable replay exclusion; STILL not Ship or release permission.

    Integration must separately bind the validated stage/activate to exactly one
    protected lease transaction. This function alone cannot mutate production.
    """
    moment = now or datetime.now(timezone.utc)
    report = assess(packet, candidate=candidate, actual_scope=actual_scope,
                    now=moment, trust_root=trust_root, allow_test_root=allow_test_root)
    p = packet["payload"]
    fingerprint = hashlib.sha256(canonical(packet)).hexdigest()
    cx = _state_connection(state_root, allow_test_root=allow_test_root)
    try:
        cx.execute("BEGIN IMMEDIATE")
        record = cx.execute(
            "SELECT challenge,candidate_sha,issued_at,expires_at,previous_stage_sha,"
            "consumed FROM attempts WHERE attempt_id=? AND phase=?",
            (p["attempt_id"], p["phase"])).fetchone()
        require(record is not None, "unissued challenge")
        require(record[0] == p["challenge"] and record[1] == candidate
                and record[2] == p["issued_at"] and record[3] == p["expires_at"],
                "challenge/attempt/validity substitution")
        require(record[5] == 0, "replayed already consumed release review")
        if p["phase"] == "PRE_ACTIVATE":
            require(record[4] == p["stage_approval_sha256"],
                    "activation stage signature link substitution")
            stage = cx.execute(
                "SELECT challenge,consumed,signed_packet_sha,candidate_sha "
                "FROM attempts WHERE attempt_id=? AND phase='PRE_STAGE'",
                (p["attempt_id"],)).fetchone()
            require(stage is not None and stage[1] == 1
                    and stage[2] == p["stage_approval_sha256"]
                    and stage[3] == candidate,
                    "missing genuine consumed earlier PRE_STAGE")
            require(p.get("stage_challenge") == stage[0]
                    and p["challenge"] != stage[0],
                    "activation stage challenge does not match actual issued nonce")
        cx.execute(
            "UPDATE attempts SET consumed=1,signed_packet_sha=? "
            "WHERE attempt_id=? AND phase=? AND consumed=0",
            (fingerprint, p["attempt_id"], p["phase"]))
        require(cx.execute("SELECT changes()").fetchone()[0] == 1,
                "non-atomic or duplicate consumption")
        cx.commit()
    except BaseException:
        cx.rollback()
        raise
    finally:
        cx.close()
    return {**report, "signed_packet_sha256": fingerprint,
            "nonce_consumed": True,
            "website_release_authorized": False}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--packet", type=Path)
    args = parser.parse_args()
    try:
        scope = source_scope(args.repo, args.candidate)
        if args.packet:
            result = assess(read_json(args.packet),
                            candidate=args.candidate, actual_scope=scope)
        else:
            result = {"status": "SOURCE_SCOPE_REVIEW_ONLY", **scope,
                      "website_release_authorized": False,
                      "financial_release_authorized": False}
    except (Hold, OSError, subprocess.TimeoutExpired, TypeError, ValueError) as exc:
        result = {"status": "HOLD", "reason": str(exc),
                  "website_release_authorized": False,
                  "financial_release_authorized": False}
    print(json.dumps(result, indent=2, sort_keys=True))
    return 2  # Never allow this review-only source phase to authorize production.


if __name__ == "__main__":
    raise SystemExit(main())
