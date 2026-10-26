#!/usr/bin/env python3
"""Explicit owner-v4 signature ceremony for a controller-issued exact request.

Signs ONLY canonical JSON of the exact v4 challenge that the operator reviewed.
This is not a release dispatcher. No key generation, enrollment, stage, activation,
network access, key upload, or use of legacy v3 authority takes place here.

The encrypted PKCS#8 owner key is read directly by openssl from the owner's
private directory, and the passphrase is requested from the terminal, never
accepted as an argv value, environment variable or JSON input.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
from datetime import timedelta, timezone
from pathlib import Path

import aoe2_renaissance_owner_authority_v4 as auth
import aoe2_renaissance_v4_release as release

MAX_REQUEST_BYTES = 32768
SHA40 = re.compile(r"[a-f0-9]{40}\Z")
SHA64 = re.compile(r"[a-f0-9]{64}\Z")


def load_request(path: Path):
    auth.require(path.is_absolute() and path.is_file() and not path.is_symlink(),
                 "owner challenge must be absolute, regular and unlinked")
    auth.require(path.stat().st_size <= MAX_REQUEST_BYTES,
                 "oversized owner challenge")
    with path.open(encoding="utf-8") as fd:
        request = json.load(fd, object_pairs_hook=_unique_pairs)
    auth.require(type(request) is dict and set(request) == {"schema", "policy", "payload"} and
                 type(request["schema"]) is int and request["schema"] == auth.SCHEMA and
                 request["policy"] in (auth.POLICY, release.POLICY), "wrong v4 owner challenge envelope")
    return request


def _unique_pairs(rows):
    d = {}
    for key, value in rows:
        auth.require(key not in d, "duplicate key in challenge")
        d[key] = value
    return d


def validate_challenge(request, *, phase, candidate, controller, manifest, nonce,
                       accept_review_only=False, accept_release=False, now=None):
    auth.require(type(request) is dict and
                 set(request) == {"schema", "policy", "payload"} and
                 request["schema"] == auth.SCHEMA and
                 request["policy"] in (auth.POLICY, release.POLICY), "wrong owner v4 envelope")
    p = request["payload"]
    auth.require(type(p) is dict and p.get("kind") == request["policy"], "wrong owner challenge")
    auth.require(p.get("phase") == phase and phase in ("PRE_STAGE", "PRE_ACTIVATE"),
                 "owner approved a different phase")
    auth.require(p.get("nonce") == nonce and type(nonce) is str and
                 auth.NONCE.fullmatch(nonce) is not None,
                 "owner approved a different one-time nonce")
    if request["policy"] == release.POLICY:
        release.check_release_payload(p)
        auth.require(accept_release and not accept_review_only, "explicit actual-release signature acceptance required")
        auth.require(p["owner_pubkey_der_sha256"] == release.OWNER_FP, "untrusted release owner public identity")
    else:
        auth.check_context(p.get("context"), phase)
    ctx = p["context"]
    auth.require(ctx["candidate_sha"] == candidate == auth.FROZEN_TARGET and
                 ctx["controller_commit_sha"] == controller and SHA40.fullmatch(controller) and
                 ctx["manifest_sha256"] == manifest and SHA64.fullmatch(manifest),
                 "explicit source/controller/manifest approval differs")
    auth.require(type(p.get("attempt_id")) is str and
                 auth.NONCE.fullmatch(p["attempt_id"]) is not None,
                 "attempt identity not source bound")
    auth.require(type(p.get("owner_pubkey_der_sha256")) is str and
                 SHA64.fullmatch(p["owner_pubkey_der_sha256"]) is not None,
                 "missing intended enrolled owner")
    issued = auth.read_moment(p.get("issued_at"))
    expires = auth.read_moment(p.get("expires_at"))
    current = auth.moment(now)
    auth.require(current.utcoffset() == timedelta(0) and
                 issued <= current < expires and
                 timedelta(0) < expires-issued <= timedelta(minutes=20),
                 "owner challenge expired, future dated or overlong")
    # The current v4 protocol is REVIEW ONLY. This executable cannot pretend
    # that such a signature authorizes a protected stage or website activation.
    auth.require(p.get("financial_release_authorized") is False and
                 p.get("custody_authorized") is False and
                 p.get("wolo_source_p1_open") is True,
                 "v4 website signing cannot activate finance")
    is_review = p.get("source_scope_review_only") is True and p.get("dispatch_enabled") is False
    auth.require((request["policy"] == auth.POLICY and is_review and accept_review_only and not accept_release) or
                 (request["policy"] == release.POLICY and accept_release and not is_review),
                 "protected dispatcher requires separate actual release approval; review-only is inert")
    return p


def private_key_contract(private: Path):
    auth.require(private.is_absolute() and private.is_file() and
                 not private.is_symlink() and not private.parent.is_symlink(),
                 "owner private signing key unavailable or linked")
    for item in (private.parent, private):
        st = item.stat()
        auth.require(st.st_uid == os.geteuid() and not st.st_mode & 0o077,
                     "owner key directory and file must be owner-only")
    st = private.stat()
    auth.require(stat.S_ISREG(st.st_mode) and
                 0 < st.st_size <= 16384, "invalid bounded encrypted credential")
    with private.open("rb") as handle:
        auth.require(handle.readline(90).strip() == b"-----BEGIN ENCRYPTED PRIVATE KEY-----",
                     "v4 signing requires an encrypted PKCS8 private key")
    inside = subprocess.run(
        ["git", "-C", str(private.parent), "rev-parse", "--is-inside-work-tree"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=8,
        check=False, env={key: val for key, val in os.environ.items() if not key.startswith("GIT_")},
    )
    auth.require(inside.returncode != 0, "private key must be outside every Git repository")


def sign_review(p, private):
    private_key_contract(private)
    with tempfile.TemporaryDirectory(prefix="aoe2-owner-v4-sign-") as folder:
        message = Path(folder) / "challenge.json"
        message.write_bytes(auth.canonical(p))
        # OpenSSL obtains the encrypted PKCS#8 passphrase from the owner TTY.
        # Never pass it through Python input, an env var, shell argv or logs.
        result = subprocess.run(["openssl", "dgst", "-sha256", "-sign",
                                 str(private), str(message)],
                                stdout=subprocess.PIPE, timeout=120, check=False)
    auth.require(result.returncode == 0 and
                 32 <= len(result.stdout) <= 8192, "interactive owner signing failed")
    return {"schema": auth.SCHEMA, "policy": p["kind"],
            "payload": p, "signature": base64.b64encode(result.stdout).decode("ascii")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--private-key", required=True, type=Path)
    parser.add_argument("--approve-phase", required=True, choices=["PRE_STAGE", "PRE_ACTIVATE"])
    parser.add_argument("--approve-candidate", required=True)
    parser.add_argument("--approve-controller", required=True)
    parser.add_argument("--approve-manifest", required=True)
    parser.add_argument("--approve-nonce", required=True)
    parser.add_argument("--review-only", action="store_true",
                        help="Explicitly sign an inert review-only packet, never a deployment authority")
    parser.add_argument("--release", action="store_true", help="Explicitly sign the NEW actual website release policy, never an old review")
    args = parser.parse_args()
    try:
        challenge = load_request(args.request)
        p = validate_challenge(
            challenge, phase=args.approve_phase, candidate=args.approve_candidate,
            controller=args.approve_controller, manifest=args.approve_manifest,
            nonce=args.approve_nonce, accept_review_only=args.review_only, accept_release=args.release)
        output = sign_review(p, args.private_key)
        if args.release: release.check_time(p)
        print(auth.canonical(output).decode("ascii"))
        print("SIGNED WEBSITE RELEASE PHASE: financial authority forbidden" if args.release else "SIGNED REVIEW ONLY: no deployment authority",
              file=sys.stderr)
        return 0
    except (auth.Hold, OSError, ValueError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc),
                          "financial_release_authorized": False}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
