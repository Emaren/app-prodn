#!/usr/bin/env python3
"""Source-bound website-only *review*; NEVER a deployment authorization.

A genuine Wolo source drift remains a blocking P1 in Finish. This tool verifies
that a candidate's evidence and independent signatures are internally bound,
not that its JavaScript is behaviorally incapable of financial side effects.
Its exit status is always 2; neither Ship nor Finish consumes its output.
"""
from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from datetime import datetime, timedelta, timezone

SHA40 = re.compile(r"[0-9a-f]{40}\Z")
SHA64 = re.compile(r"[0-9a-f]{64}\Z")
REQUIRED_ROLES = ("owner", "chain_reviewer", "finance_reviewer", "release_operator")
REQUIRED_EVIDENCE = (
    "source_diff_review_sha256", "isolated_postgres_noninterference_sha256",
    "legacy_escrow_preview_refusal_sha256", "historical_liability_delta_sha256",
    "wallet_custody_disabled_sha256", "rollback_rehearsal_sha256",
)
BLOCKED_PATH_PREFIXES = (
    "prisma/", "deploy/", "app/api/wolo/", "app/api/wallet/",
    "app/api/staking/", "app/api/payout/", "app/api/withdraw/",
    "scripts/aoe2_release_", "scripts/aoe2_finish.py",
    "scripts/aoe2_update.py", "scripts/aoe2_website_release_policy.py",
    "config/aoe2war-operations.json", ".github/workflows/",
)
BLOCKED_PATH_WORDS = ("settlement", "custody", "treasury", "signer", "migrations", "financial_migration")
ROOT = Path(__file__).resolve().parents[1]
TRUST_DIR = Path("/etc/aoe2war/website-release-reviewers")
MAX_BYTES = 2 * 1024 * 1024


class Hold(ValueError):
    """Preserve hold on all ambiguity."""


def ensure(condition: bool, reason: str) -> None:
    if not condition:
        raise Hold(reason)


def canonical(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("ascii")


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def read_json(path: Path) -> tuple[dict, bytes]:
    ensure(path.is_file() and not path.is_symlink(), "missing or linked evidence input")
    ensure(path.stat().st_size <= MAX_BYTES, "oversized evidence input")
    raw = path.read_bytes()
    ensure(len(raw) <= MAX_BYTES, "oversized evidence input")
    value = json.loads(raw)
    ensure(type(value) is dict, "evidence must be an object")
    return value, raw


def parse_time(value: str) -> datetime:
    ensure(isinstance(value, str) and value.endswith("Z"), "UTC time required")
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise Hold("invalid UTC time") from exc
    ensure(d.utcoffset() == timedelta(0), "UTC time required")
    return d


def git(repo: Path, *args: str) -> bytes:
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull)
    p = subprocess.run(["git", *args], cwd=repo, env=env, stdout=subprocess.PIPE,
                       stderr=subprocess.DEVNULL, timeout=30, check=False)
    ensure(p.returncode == 0 and len(p.stdout) <= MAX_BYTES, "source Git proof missing")
    return p.stdout


def exact_source(repo: Path, base: str, candidate: str) -> list[str]:
    ensure(SHA40.fullmatch(base) is not None and SHA40.fullmatch(candidate) is not None,
           "invalid source SHA")
    ensure(git(repo, "rev-parse", "HEAD").decode().strip() == candidate,
           "wrong checked-out source SHA")
    git(repo, "merge-base", "--is-ancestor", base, candidate)
    ensure(not git(repo, "status", "--porcelain=v1", "-z", "--untracked-files=all",
                   "--ignore-submodules=none"), "dirty source worktree")
    flags = git(repo, "ls-files", "-v", "-z")
    for entry in flags.rstrip(b"\0").split(b"\0"):
        if entry:
            ensure(len(entry) > 2 and entry[1:2] == b" " and entry[:1] not in (b"S",)
                   and not (97 <= entry[0] <= 122), "unproven Git index flags")
    raw = git(repo, "diff", "--no-ext-diff", "--no-textconv", "--no-renames",
              "--name-only", "-z", base, candidate, "--")
    ensure(not raw or raw.endswith(b"\0"), "truncated source diff")
    try:
        paths = [v.decode("utf-8") for v in raw.rstrip(b"\0").split(b"\0") if v]
    except UnicodeDecodeError as exc:
        raise Hold("unreviewable source path") from exc
    ensure(paths and len(paths) <= 4096, "empty or oversized source scope")
    return sorted(paths)


def trust_key(path: Path, trust_root: Path) -> bytes:
    # Do not trust public keys shipped in the proposed application commit.
    ensure(trust_root.is_absolute() and trust_root.resolve() == TRUST_DIR.resolve(),
           "trust anchor must be the independently provisioned system path")
    for candidate in (trust_root, path):
        ensure(not candidate.is_symlink(), "symlinked trust anchor")
        info = candidate.stat()
        ensure(info.st_uid == 0 and not info.st_mode & (stat.S_IWGRP | stat.S_IWOTH),
               "trust anchor not root-owned and protected")
    ensure(path.is_file() and path.parent == trust_root, "unrecognized reviewer key")
    raw = path.read_bytes()
    ensure(0 < len(raw) < 8192, "invalid reviewer key")
    return raw


def verify_signatures(payload: dict, signatures: dict, trust_root: Path) -> None:
    ensure(type(signatures) is dict and set(signatures) == set(REQUIRED_ROLES),
           "missing or extra independent signatures")
    fingerprints: set[str] = set()
    for role in REQUIRED_ROLES:
        key = trust_root / (role + ".pem")
        pem = trust_key(key, trust_root)
        der = subprocess.run(["openssl", "pkey", "-pubin", "-in", str(key),
                              "-pubout", "-outform", "DER"],
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             timeout=10, check=False)
        ensure(der.returncode == 0 and der.stdout, "invalid reviewer public key")
        fingerprint = digest(der.stdout)
        ensure(fingerprint not in fingerprints, "reviewer identity not independent")
        fingerprints.add(fingerprint)
        try:
            signature = base64.b64decode(signatures[role], validate=True)
        except (TypeError, ValueError, binascii.Error) as exc:
            raise Hold("invalid reviewer signature encoding") from exc
        ensure(0 < len(signature) <= 8192, "invalid signature size")
        # OpenSSL verifies SHA256-over-canonical-payload RSA/ECDSA signatures;
        # detached signatures contain no mutable on-disk approval payload.
        import tempfile
        with tempfile.TemporaryDirectory(prefix="website-policy-") as temp:
            p = Path(temp)
            (p / "payload").write_bytes(canonical(payload))
            (p / "sig").write_bytes(signature)
            proc = subprocess.run(["openssl", "dgst", "-sha256", "-verify", str(key),
                                   "-signature", str(p / "sig"), str(p / "payload")],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                  timeout=10, check=False)
        ensure(proc.returncode == 0, "independent reviewer signature failed")


def assess(*, repo: Path, manifest: dict, manifest_raw: bytes, gate: dict,
           gate_raw: bytes, stage: dict, stage_raw: bytes, plan: dict,
           signed: dict, now: datetime, trust_root: Path = TRUST_DIR) -> dict:
    """Success means evidence was reviewed, NEVER that deployment is permitted."""
    p = signed.get("payload")
    ensure(type(p) is dict and signed.get("schema") == 1, "invalid signed policy schema")
    ensure(p.get("kind") == "website-only-source-review-v1", "unrecognized policy")
    hashes = ("candidate_sha", "base_sha", "wolo_vps_sha", "wolo_docs_sha")
    ensure(all(SHA40.fullmatch(str(p.get(k, ""))) for k in hashes), "unbound source SHA")
    ensure(all(SHA64.fullmatch(str(p.get(k, ""))) for k in
               ("manifest_sha256", "gate_sha256", "stage_sha256", *REQUIRED_EVIDENCE)),
           "missing bound evidence checksum")
    issued = parse_time(p.get("issued_at"))
    expiry = parse_time(p.get("expires_at"))
    ensure(issued <= now <= expiry and timedelta(0) < expiry - issued <= timedelta(minutes=30),
           "expired, premature or overly broad approval")
    ensure(manifest.get("release_sha") == p["candidate_sha"] and
           manifest.get("previous_production_sha") == p["base_sha"],
           "manifest source or prior production mismatch")
    ensure(manifest.get("risk_class") == "FINANCIAL", "financial scope misclassified")
    ensure(manifest.get("migration_paths") == [], "mixed or unauthorized migrations")
    ensure(manifest.get("gate", {}).get("status") == "PASS" and gate.get("status") == "PASS"
           and gate.get("risk_class") == "FINANCIAL",
           "release gate not independently passing")
    ensure(manifest.get("gate", {}).get("receipt_sha256") == digest(gate_raw),
           "gate not bound into manifest")
    ensure(digest(manifest_raw) == p["manifest_sha256"] and
           digest(gate_raw) == p["gate_sha256"] and digest(stage_raw) == p["stage_sha256"],
           "source receipt bytes changed")
    ensure(stage.get("release_sha") == p["candidate_sha"] and
           stage.get("manifest_sha256") == p["manifest_sha256"] and
           stage.get("gate_sha256") == p["gate_sha256"] and
           stage.get("candidate_build_id") == p.get("candidate_build_id") and
           isinstance(p.get("candidate_build_id"), str) and p["candidate_build_id"],
           "candidate BUILD_ID or stage binding mismatch")
    ensure(stage.get("status") in ("STAGED", "PASS") and
           stage.get("wolo_mutated") is False, "unproved isolated stage")
    ensure(manifest.get("policy", {}).get("wolo_mutation_allowed") is False,
           "Wolo mutation policy changed")
    ensure(plan.get("blocked") is True and plan.get("unknown_p0") == [] and
           plan.get("blocked_source_docs") == [], "external source review not bounded")
    unknown = plan.get("unknown_p1")
    ensure(type(unknown) is list and len(unknown) == 1, "unreviewed external source drift")
    finding = unknown[0]
    ensure(finding.get("area") == "WoloChain" and finding.get("severity") == "P1" and
           finding.get("key") == "vps-source-drift" and
           finding.get("detail") ==
           f"VPS={p['wolo_vps_sha']} implementation_baseline={p['wolo_docs_sha']}" and
           p["wolo_vps_sha"] != p["wolo_docs_sha"], "unreviewed Wolo source drift")
    ensure(p.get("ci_status") == "success" and p.get("ci_head_sha") == p["candidate_sha"] and
           isinstance(p.get("ci_run_id"), int) and p["ci_run_id"] > 0,
           "wrong source CI evidence")
    ensure(p.get("financial_executors_enabled") is False and
           p.get("custody_enabled") is False and
           p.get("preview_funding_enabled") is False and
           p.get("historical_entitlements_mutated") is False,
           "attempted funded or entitlement-mutating release")
    paths = exact_source(repo, p["base_sha"], p["candidate_sha"])
    ensure(paths == manifest.get("changed_files"), "source diff and manifest disagree")
    ensure(not any(x.lower().startswith(BLOCKED_PATH_PREFIXES) or
                   any(token in x.lower() for token in BLOCKED_PATH_WORDS)
                   for x in paths), "protected migration/custody/runner source in candidate")
    ensure(p.get("reviewed_paths_sha256") == digest(canonical(paths)),
           "financial source paths not independently bound")
    verify_signatures(p, signed.get("signatures"), trust_root)
    return {
        "status": "EVIDENCE_REVIEWABLE_HOLD",
        "website_release_authorized": False,
        "financial_release_authorized": False,
        "existing_finish_blocked": True,
        "external_wolo_p1": finding,
        "candidate_sha": p["candidate_sha"],
        "build_id": p["candidate_build_id"],
        "risk_class": "FINANCIAL",
        "checked_source_paths": len(paths),
        "approval_expires_at": p["expires_at"],
        "reason": "Signatures attest a finite review packet, not semantic noninterference; protected Finish remains blocked and this program has no deploy entry point.",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    for key in ("manifest", "gate", "stage", "update_plan", "signed_review"):
        ap.add_argument("--" + key.replace("_", "-"), type=Path, required=True)
    ap.add_argument("--repo", type=Path, default=ROOT)
    args = ap.parse_args()
    result: dict = {"status": "HOLD", "website_release_authorized": False,
                    "financial_release_authorized": False}
    try:
        manifest, mr = read_json(args.manifest)
        gate, gr = read_json(args.gate)
        stage, sr = read_json(args.stage)
        plan, _ = read_json(args.update_plan)
        signed, _ = read_json(args.signed_review)
        result = assess(repo=args.repo, manifest=manifest, manifest_raw=mr,
                        gate=gate, gate_raw=gr, stage=stage, stage_raw=sr,
                        plan=plan, signed=signed, now=datetime.now(timezone.utc))
    except (Hold, ValueError, OSError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired) as exc:
        result["reason"] = str(exc)[:250]
    print(json.dumps(result, sort_keys=True, indent=2))
    return 2  # Not a release permit even after perfect evidence inspection.


if __name__ == "__main__":
    sys.exit(main())
