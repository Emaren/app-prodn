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
HEX40 = re.compile(r"[a-f0-9]{40}\\Z")
HEX64 = re.compile(r"[a-f0-9]{64}\\Z")
NONCE = re.compile(r"[A-Za-z0-9_-]{24,96}\\Z")


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
    require(git(repo, "status", "--porcelain", "--untracked-files=all") == "",
            "dirty candidate")
    require(git(repo, "merge-base", PRODUCTION_SHA, target) == PRODUCTION_SHA,
            "certified production is not ancestor")
    # Name-status catches path substitutions/renames, not just changed counts.
    raw = git(repo, "diff", "--name-status", "--no-renames",
              PRODUCTION_SHA + ".." + target).splitlines()
    changed = []
    for line in raw:
        fields = line.split("\\t")
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
        fingerprint = hashlib.sha256(raw).hexdigest()
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
    require(payload.get("risk_class") == "PRESENTATION",
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
