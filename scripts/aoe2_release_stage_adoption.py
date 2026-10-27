#!/usr/bin/env python3
"""Non-deploying, two-root adoption evidence for the 2026-10-27 Kingdom stage.

The PRODUCT checkout owns the already-existing stage receipt, manifest and
gate. The CONTROLLER checkout owns reviewed release code. This inspector
cannot sign, consume a nonce, touch HEL1, or call activation. In particular
it NEVER fabricates the missing historical PRE_STAGE owner approval.
"""
from __future__ import annotations

import argparse
import base64
import binascii
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

import aoe2_release_ship as ship

POLICY = "aoe2war.solo-owner.existing-staged-adoption.v1"
SOURCE_SHA = "14ce71045150fcad4a25f0e3c3858c1c3cc7aab6"
INITIAL_CONTROLLER_SHA = "50a9a0bb67da32d34d3d5c64b2c79ca4ee26b0d1"
PREVIOUS_SHA = "6d2a78224e5a5c647345d6b5ffc91bf94dc84b59"
ARTIFACT_SHA = "b3d2705478f35b5e247ae7e2f55e6588bd24654e6a4248e9f68abc712a7ce25a"
STAGE_SHA = "ac065a12a14571198c29912184ffbd10a00422ec7548c5cc5eb0bf6555f55812"
MANIFEST_SHA = "78b5f197944b93d7582e812d7f3b5a0f8679faa07dce89002f84066dd6bf2090"
GATE_SHA = "afa497e79926ed7978a924f2bf73e8a9c6c546300c8def54d260fe9b39b9fcd7"
BUILD_ID = "u842UVpDjLRLz-paxPv2U"
STAGE_NAME = "14ce71045150-b3d2705478f3.json"
TRUST_PUBLIC = Path("/etc/aoe2war/website-owner-v4/owner.pem")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
HEX40 = re.compile(r"^[0-9a-f]{40}$")
NONCE = re.compile(r"^[A-Za-z0-9_-]{24,96}$")


class Hold(ValueError):
    """A real release/adoption prerequisite has not been proven."""


def require(ok: bool, reason: str):
    if not ok:
        raise Hold(reason)


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=True,
                      allow_nan=False, separators=(",", ":")).encode("ascii")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def unique_pairs(pairs):
    result = {}
    for name, value in pairs:
        require(name not in result, "DUPLICATE_JSON_KEY")
        result[name] = value
    return result


def read_packet(path: Path) -> dict:
    require(path.is_file() and not path.is_symlink()
            and path.stat().st_size <= 16384, "UNTRUSTED_OWNER_PACKET")
    try:
        value = json.loads(path.read_text(encoding="utf-8"),
                           object_pairs_hook=unique_pairs,
                           parse_constant=lambda _x: (_ for _ in ()).throw(Hold("NONFINITE_JSON")))
    except (UnicodeError, ValueError) as exc:
        raise Hold("INVALID_OWNER_PACKET") from exc
    require(type(value) is dict, "INVALID_OWNER_PACKET")
    return value


def git(root: Path, *arguments: str) -> str:
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    result = subprocess.run(
        ["git", "--no-optional-locks", "-C", str(root),
         "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null",
         *arguments],
        capture_output=True, timeout=15, check=False, env=env,
    )
    require(result.returncode == 0, "GIT_SOURCE_PROVENANCE_UNVERIFIED")
    try:
        return result.stdout.decode("utf-8").strip()
    except UnicodeError as exc:
        raise Hold("INVALID_GIT_SOURCE_ENCODING") from exc


def trusted_checkout(root: Path, *, exact: str | None = None,
                     ancestor: str | None = None) -> str:
    require(root.is_absolute() and root.is_dir() and not root.is_symlink(),
            "SOURCE_ROOT_UNTRUSTED")
    resolved = root.resolve()
    require(str(resolved) == str(root), "SOURCE_ROOT_INDIRECT")
    require(git(root, "rev-parse", "--show-toplevel") == str(root),
            "SOURCE_CHECKOUT_NOT_ROOT")
    head = git(root, "rev-parse", "--verify", "HEAD")
    require(HEX40.fullmatch(head) is not None, "INVALID_SOURCE_HEAD")
    if exact is not None:
        require(head == exact, "STAGED_PRODUCT_SOURCE_DRIFT")
    if ancestor is not None:
        require(git(root, "merge-base", ancestor, head) == ancestor,
                "RELEASE_CONTROLLER_LINEAGE_DRIFT")
    require(git(root, "status", "--porcelain=v1", "--untracked-files=all") == "",
            "SOURCE_WORKTREE_NOT_CLEAN")
    # Git's assume-unchanged and skip-worktree bits can conceal modified code.
    index = subprocess.run(
        ["git", "--no-optional-locks", "-C", str(root), "ls-files", "-v", "-z"],
        capture_output=True, timeout=15, check=False,
        env={k: v for k, v in os.environ.items() if not k.startswith("GIT_")},
    )
    require(index.returncode == 0 and index.stdout.endswith(b"\0"),
            "GIT_INDEX_NOT_INSPECTABLE")
    for entry in index.stdout[:-1].split(b"\0"):
        require(len(entry) >= 3 and entry[:2] == b"H ",
                "HIDDEN_GIT_INDEX_STATE")
    return head


def stage_identity(product_root: Path, controller_root: Path) -> dict:
    require(product_root != controller_root,
            "CONTROLLER_AND_PRODUCT_NOT_INDEPENDENT")
    product_sha = trusted_checkout(product_root, exact=SOURCE_SHA)
    controller_sha = trusted_checkout(controller_root, ancestor=INITIAL_CONTROLLER_SHA)
    require(controller_sha != product_sha,
            "CONTROLLER_AND_PRODUCT_IDENTITIES_COLLIDE")
    receipt_path = product_root / ".aoe2war-release" / "stage-receipts" / STAGE_NAME
    require(receipt_path.is_file() and not receipt_path.is_symlink(),
            "SEALED_STAGE_RECEIPT_NOT_PRESENT")
    # IMPORTANT: source_root is a new explicit argument; do not rewrite
    # ship.ROOT or copy stage receipts into the controller worktree.
    try:
        (path, receipt, receipt_sha, manifest_path, manifest, manifest_sha,
         gate_path, gate_sha) = ship.load_stage_receipt(
            str(receipt_path), source_root=product_root
        )
    except (ship.ShipError, OSError, ValueError) as exc:
        raise Hold("STAGE_CHAIN_INTEGRITY_FAILED") from exc
    require(path == receipt_path.resolve(), "STAGE_RECEIPT_PATH_SUBSTITUTED")
    require(receipt_sha == STAGE_SHA, "STAGE_RECEIPT_HASH_CHANGED")
    require(manifest_sha == MANIFEST_SHA, "STAGE_MANIFEST_HASH_CHANGED")
    require(gate_sha == GATE_SHA, "STAGE_GATE_HASH_CHANGED")
    require(receipt.get("release_sha") == SOURCE_SHA
            and receipt.get("artifact_sha256") == ARTIFACT_SHA
            and receipt.get("staged_build_id") == BUILD_ID
            and receipt.get("previous_production_sha") == PREVIOUS_SHA,
            "STAGE_PRODUCT_IDENTITY_CHANGED")
    require(manifest.get("release_sha") == SOURCE_SHA
            and manifest.get("previous_production_sha") == PREVIOUS_SHA,
            "STAGE_MANIFEST_IDENTITY_CHANGED")
    require(manifest.get("migration_paths") == [],
            "STAGED_WEBSITE_MIGRATIONS_UNEXPECTED")
    return {
        "product_source_sha": product_sha,
        "controller_source_sha": controller_sha,
        "previous_production_sha": PREVIOUS_SHA,
        "artifact_sha256": ARTIFACT_SHA,
        "stage_receipt_sha256": STAGE_SHA,
        "manifest_sha256": MANIFEST_SHA,
        "gate_sha256": GATE_SHA,
        "build_id": BUILD_ID,
        "stage_path": str(receipt_path),
        "sealed_manifest_path": str(manifest_path),
        "sealed_gate_path": str(gate_path),
        "historical_pre_stage_approval_proven": False,
    }


def utc_time(raw: str) -> datetime:
    require(type(raw) is str and raw.endswith("Z"), "OWNER_PACKET_UTC_INVALID")
    try:
        when = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise Hold("OWNER_PACKET_TIMESTAMP_INVALID") from exc
    require(when.utcoffset() == timedelta(0), "OWNER_PACKET_TIMESTAMP_INVALID")
    return when


def public_fingerprint(key: Path, *, test_root=False) -> str:
    require(key.is_absolute() and key.is_file() and not key.is_symlink()
            and not key.parent.is_symlink(), "OWNER_V4_KEY_NOT_ENROLLED")
    for item in (key, key.parent):
        s = item.stat()
        require(not s.st_mode & (stat.S_IWGRP | stat.S_IWOTH),
                "OWNER_V4_KEY_WRITABLE_BY_OTHERS")
        require(test_root or s.st_uid == 0, "OWNER_V4_KEY_NOT_ROOT_OWNED")
    raw = key.read_bytes()
    require(0 < len(raw) <= 8192 and b"PUBLIC KEY" in raw
            and b"PRIVATE KEY" not in raw, "OWNER_V4_KEY_INVALID")
    pub = subprocess.run(
        ["openssl", "pkey", "-pubin", "-in", str(key),
         "-pubout", "-outform", "DER"],
        capture_output=True, timeout=10, check=False,
    )
    strength = subprocess.run(
        ["openssl", "rsa", "-pubin", "-in", str(key), "-text", "-noout"],
        capture_output=True, timeout=10, check=False,
    )
    n = re.search(rb"\((\d+) bit\)", strength.stdout)
    require(pub.returncode == 0 and strength.returncode == 0
            and pub.stdout and n is not None and int(n[1]) >= 2048,
            "OWNER_V4_KEY_INVALID")
    return sha256_bytes(pub.stdout)


def verify_signed_adoption_review(packet: dict, facts: dict, *,
                                  public_key: Path = TRUST_PUBLIC,
                                  now: datetime | None = None,
                                  test_root=False) -> dict:
    """Proof of owner intent only; NOT a nonce reservation or release permit."""
    require(type(packet) is dict and set(packet) ==
            {"schema", "policy", "payload", "signature"}
            and type(packet["schema"]) is int and packet["schema"] == 1
            and packet["policy"] == POLICY, "WRONG_ADOPTION_SIGNATURE_DOMAIN")
    p = packet["payload"]
    required = {
        "kind", "phase", "nonce", "issued_at", "expires_at",
        "owner_pubkey_der_sha256", "product_source_sha",
        "controller_source_sha", "previous_production_sha",
        "artifact_sha256", "stage_receipt_sha256", "manifest_sha256",
        "gate_sha256", "build_id", "wolo_runtime_witness_sha256",
        "financial_noninterference_sha256", "historical_pre_stage_approval_proven",
        "financial_release_authorized", "custody_authorized"
    }
    require(type(p) is dict and set(p) == required
            and p["kind"] == POLICY and p["phase"] == "ADOPT_ALREADY_STAGED",
            "OWNER_ADOPTION_FIELDS_INVALID")
    for key in ("product_source_sha", "controller_source_sha",
                "previous_production_sha", "artifact_sha256",
                "stage_receipt_sha256", "manifest_sha256", "gate_sha256",
                "build_id", "historical_pre_stage_approval_proven"):
        require(p[key] == facts[key], "OWNER_ADOPTION_STAGE_SUBSTITUTED")
    require(p["historical_pre_stage_approval_proven"] is False
            and p["financial_release_authorized"] is False
            and p["custody_authorized"] is False, "OWNER_ADOPTION_FINANCIAL_ESCALATION")
    require(type(p["nonce"]) is str and NONCE.fullmatch(p["nonce"]) is not None,
            "OWNER_ADOPTION_NONCE_INVALID")
    for key in ("wolo_runtime_witness_sha256",
                "financial_noninterference_sha256"):
        require(type(p[key]) is str and HEX64.fullmatch(p[key]) is not None
                and p[key] != "0" * 64, "OWNER_ADOPTION_EVIDENCE_DIGEST_INVALID")
    clock = datetime.now(timezone.utc) if now is None else now
    issued, expires = utc_time(p["issued_at"]), utc_time(p["expires_at"])
    require(issued <= clock < expires
            and timedelta(0) < expires - issued <= timedelta(minutes=20),
            "OWNER_ADOPTION_EXPIRED_OR_FUTURE")
    require(public_fingerprint(public_key, test_root=test_root) ==
            p["owner_pubkey_der_sha256"], "OWNER_ADOPTION_WRONG_PUBLIC_KEY")
    try:
        signature = base64.b64decode(packet["signature"], validate=True)
    except (ValueError, TypeError, binascii.Error) as exc:
        raise Hold("OWNER_ADOPTION_SIGNATURE_INVALID") from exc
    require(32 <= len(signature) <= 8192, "OWNER_ADOPTION_SIGNATURE_INVALID")
    with tempfile.TemporaryDirectory(prefix="aoe2war-adoption-review-") as folder:
        message = Path(folder) / "message"
        sig = Path(folder) / "signature"
        message.write_bytes(canonical(p))
        sig.write_bytes(signature)
        verification = subprocess.run(
            ["openssl", "dgst", "-sha256", "-verify", str(public_key),
             "-signature", str(sig), str(message)],
            capture_output=True, timeout=10, check=False
        )
    require(verification.returncode == 0, "OWNER_ADOPTION_SIGNATURE_INVALID")
    return {
        "owner_signature_cryptographically_valid": True,
        "signed_packet_sha256": sha256_bytes(canonical(packet)),
        "wolo_witness_independently_verified": False,
        "noninterference_independently_verified": False,
        "durable_nonce_consumed": False,
        "release_authorized": False,
        "website_activated": False,
        "financial_release_authorized": False,
    }


def inspect(product_root: Path, controller_root: Path, *,
            packet: dict | None = None, public_key: Path = TRUST_PUBLIC,
            now: datetime | None = None, test_root=False) -> dict:
    facts = stage_identity(product_root, controller_root)
    review = (verify_signed_adoption_review(packet, facts,
              public_key=public_key, now=now, test_root=test_root)
              if packet is not None else {})
    return {
        "schema": 1,
        "kind": POLICY,
        "status": "HOLD_AUTHENTIC_ADOPTION_AND_RELEASE_AUTHORITY",
        "source_facts": facts,
        "owner_review": review,
        "required": [
            "approved_external_controller_commit_digest",
            "owner_v4_signed_existing_stage_adoption",
            "independently_authenticated_fresh_runtime_and_finance_witness",
            "protected_global_lease_and_exactly_once_durable_nonce",
            "guarded_controller_dispatch_and_postflight_reconciliation"
        ],
        "deploy_performed": False,
        "financial_release_authorized": False,
        "release_authorized": False,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--product-root", type=Path, required=True)
    ap.add_argument("--controller-root", type=Path, required=True)
    ap.add_argument("--signed-adoption-packet", type=Path)
    args = ap.parse_args()
    try:
        packet = (read_packet(args.signed_adoption_packet)
                  if args.signed_adoption_packet else None)
        result = inspect(args.product_root, args.controller_root, packet=packet)
    except (Hold, OSError, subprocess.SubprocessError) as exc:
        result = {"schema": 1, "kind": POLICY, "status": "HOLD",
                  "reason": str(exc), "deploy_performed": False,
                  "release_authorized": False}
    print(json.dumps(result, sort_keys=True, indent=2))
    return 2  # Deliberately NONAUTHORIZING even with a valid owner signature.


if __name__ == "__main__":
    raise SystemExit(main())
