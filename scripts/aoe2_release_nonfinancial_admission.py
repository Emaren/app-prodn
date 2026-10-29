#!/usr/bin/env python3
"""W1 nonfinancial Source+Finance release admission for the EXISTING controller.

Verifier only. Never issues challenges, signs evidence, changes the host, or
promotes financial authority. Trust roots and challenges are independently
installed in root-owned Mac /private/etc (Linux /etc). The operator worktree
may provide packets, but cannot choose or replace trusted keys/challenges.
An accepted source receipt is NOT proof that the separately observed live
financial/WOLO state has actually been produced or approved.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
TRUST = Path("/private/etc/aoe2war/release-admission" if sys.platform == "darwin"
             else "/etc/aoe2war/release-admission")
PACKETS = ROOT / ".aoe2war-release" / "nonfinancial-admissions"
ROLES = ("source", "finance", "owner")
TRUST_ROLES = (*ROLES, "host")  # independently signed root-HEL1 nonce consumption
DOMAIN = b"AOE2WAR.W1.NONFINANCIAL.ADMISSION.V1\n"
HEX40 = re.compile(r"[a-f0-9]{40}\Z")
HEX64 = re.compile(r"[a-f0-9]{64}\Z")
NONCE = re.compile(r"[a-f0-9]{64}\Z")
OPENSSL = "/opt/homebrew/opt/openssl@3/bin/openssl" if sys.platform == "darwin" else "/usr/bin/openssl"
LOCK = "/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock"


class AdmissionHOLD(RuntimeError):
    pass


def check(ok: bool, message: str) -> None:
    if not ok:
        raise AdmissionHOLD("NONFINANCIAL WITNESS HOLD: " + message)


def unique_pairs(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        check(key not in result, "duplicate JSON field")
        result[key] = value
    return result


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False).encode("utf-8")


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def ordinary(path: Path, *, trusted: bool = False) -> bytes:
    check(path.is_absolute(), "nonabsolute evidence path")
    try:
        info = path.lstat()
        check(stat.S_ISREG(info.st_mode), "missing, linked or nonregular evidence")
        check(info.st_size <= 256 * 1024, "oversized evidence")
        check(info.st_mode & 0o022 == 0, "group/world writable evidence")
        if trusted:
            check(info.st_uid == 0, "trust file is not root owned")
            parent = path.parent
            while parent != parent.parent:
                st = parent.lstat()
                check(stat.S_ISDIR(st.st_mode) and st.st_uid == 0
                      and (st.st_mode & 0o022) == 0,
                      "trust ancestor not root-owned directory")
                parent = parent.parent
        return path.read_bytes()
    except OSError as exc:
        raise AdmissionHOLD("NONFINANCIAL WITNESS HOLD: unreadable evidence") from exc


def read_json(path: Path, *, trusted: bool = False) -> dict:
    raw = ordinary(path, trusted=trusted)
    try:
        obj = json.loads(raw, object_pairs_hook=unique_pairs)
    except (ValueError, TypeError) as exc:
        raise AdmissionHOLD("NONFINANCIAL WITNESS HOLD: invalid JSON evidence") from exc
    check(type(obj) is dict, "evidence must be a JSON object")
    return obj


def timestamp(value: object) -> datetime:
    check(type(value) is str and value.endswith("Z"), "UTC timestamp required")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AdmissionHOLD("NONFINANCIAL WITNESS HOLD: malformed UTC timestamp") from exc
    check(dt.tzinfo is not None and dt.utcoffset().total_seconds() == 0,
          "timestamp must be UTC")
    return dt


def controller_digest() -> str:
    content = bytearray()
    for rel in ("scripts/aoe2_release.py", "scripts/aoe2_release_gate.py",
                "scripts/aoe2_release_stage.py", "scripts/aoe2_release_ship.py",
                "scripts/aoe2_release_nonfinancial_admission.py"):
        p = ROOT / rel
        check(p.is_file() and not p.is_symlink(), "controller source unavailable")
        content.extend(rel.encode() + b"\0" + p.read_bytes() + b"\0")
    return digest(bytes(content))


def key_bytes(role: str, trust: Path, registry: dict) -> bytes:
    key = registry.get("keys", {}).get(role)
    check(type(key) is dict and set(key) == {"file", "spki_sha256"},
          "trusted key registry missing role")
    check(type(key["file"]) is str and re.fullmatch(r"[a-z]+\.pub\.pem", key["file"]),
          "invalid trusted key filename")
    check(bool(HEX64.fullmatch(str(key["spki_sha256"]))), "invalid trusted SPKI digest")
    public_path = trust / key["file"]
    pub = ordinary(public_path, trusted=True)
    p = subprocess.run([OPENSSL, "pkey", "-pubin", "-in", str(public_path),
                        "-outform", "DER"], capture_output=True, timeout=15)
    check(p.returncode == 0 and bool(p.stdout), "invalid trusted public key")
    check(digest(p.stdout) == key["spki_sha256"], "trusted SPKI identity mismatch")
    return pub


def verify_signature(role: str, payload: dict, signature: object, pub: bytes) -> None:
    check(type(signature) is str, "signature missing")
    try:
        binary = base64.b64decode(signature, validate=True)
    except ValueError as exc:
        raise AdmissionHOLD("NONFINANCIAL WITNESS HOLD: malformed signature") from exc
    check(len(binary) == 64, "invalid Ed25519 signature size")
    # OpenSSL Ed25519 accepts a raw message only. Public key is read via stdin
    # indirectly using a private temporary directory, never a signing key.
    import tempfile
    with tempfile.TemporaryDirectory(prefix="aoe2war-verify-") as directory:
        root = Path(directory)
        key_path, msg_path, sig_path = root / "pub", root / "msg", root / "sig"
        key_path.write_bytes(pub)
        msg_path.write_bytes(DOMAIN + role.encode("ascii") + b"\n" + canonical(payload))
        sig_path.write_bytes(binary)
        p = subprocess.run([OPENSSL, "pkeyutl", "-verify", "-pubin",
                            "-inkey", str(key_path), "-rawin",
                            "-in", str(msg_path), "-sigfile", str(sig_path)],
                           capture_output=True, timeout=15)
    check(p.returncode == 0, "invalid independent " + role + " signature")


def require_admission(
    phase: str, *, manifest: dict, manifest_sha: str, gate_sha: str,
    active_build_id: str, stage_receipt: dict | None = None,
    stage_sha: str = "", consume: bool = True,
    trust: Path = TRUST, packets: Path = PACKETS,
    now: datetime | None = None,
) -> dict:
    """Fail closed before stage SSH / activation SSH; no ENV bypass or auto-sign."""
    check(phase in {"PRE_STAGE", "PRE_ACTIVATE"}, "invalid release phase")
    release = manifest.get("release_sha")
    previous = manifest.get("previous_production_sha")
    check(type(release) is str and bool(HEX40.fullmatch(release)), "invalid exact release")
    check(type(previous) is str and bool(HEX40.fullmatch(previous)), "invalid previous source")
    check(all(type(x) is str and HEX64.fullmatch(x)
              for x in (manifest_sha, gate_sha)), "invalid gate/manifest digest")
    check(type(active_build_id) is str and len(active_build_id) >= 8,
          "missing active production BUILD_ID")
    migrations = manifest.get("migration_paths")
    check(type(migrations) is list and not migrations, "database migrations not allowed")
    paths = manifest.get("changed_files")
    check(type(paths) is list and all(type(x) is str for x in paths)
          and len(paths) == len(set(paths)), "invalid source changed-path manifest")
    check(not any(x.startswith("prisma/") for x in paths),
          "Prisma source changes require independent migration lane")
    if phase == "PRE_ACTIVATE":
        check(type(stage_receipt) is dict and HEX64.fullmatch(stage_sha or "") is not None,
              "missing exact staged receipt")
    else:
        check(stage_receipt is None and not stage_sha, "pre-stage cannot include staged artifact")

    registry = read_json(trust / "trust.json", trusted=True)
    check(registry.get("schema") == 1 and type(registry.get("keys")) is dict
          and set(registry["keys"]) == set(TRUST_ROLES), "unapproved trust schema/roles")
    spkis = [registry["keys"][r].get("spki_sha256") for r in TRUST_ROLES]
    check(len(set(spkis)) == len(TRUST_ROLES), "source/finance/owner/host signers not independent")
    challenge = read_json(trust / ("challenge-" + phase + ".json"), trusted=True)
    packet = read_json(packets / (release + "-" + phase + ".json"))
    check(packet.get("schema") == 1 and set(packet) == {"schema", "payload", "signatures"},
          "noncanonical witness packet")
    payload, signatures = packet["payload"], packet["signatures"]
    check(type(payload) is dict and type(signatures) is dict
          and set(signatures) == set(ROLES), "incomplete independent signed roles")
    check(payload.get("kind") == "aoe2war-w1-nonfinancial-release-v1"
          and payload.get("phase") == phase and payload.get("release_sha") == release
          and payload.get("previous_source_sha") == previous,
          "candidate/source or phase substitution")
    check(payload.get("manifest_sha256") == manifest_sha
          and payload.get("gate_sha256") == gate_sha
          and payload.get("controller_sha256") == controller_digest(),
          "gate/manifest/controller mismatch")
    check(payload.get("active_build_id") == active_build_id,
          "active BUILD_ID changed")
    check(payload.get("scope_sha256") == manifest.get("scope_sha256"),
          "candidate scope mismatch")
    check(payload.get("changed_paths_sha256") == digest(canonical(sorted(paths))),
          "actual changed-file list substitution")
    check(payload.get("lease_path") == LOCK
          and type(payload.get("lease_id")) is str
          and bool(HEX64.fullmatch(payload["lease_id"])),
          "release lease not pinned")
    check(type(challenge.get("nonce")) is str
          and bool(NONCE.fullmatch(challenge["nonce"]))
          and challenge.get("phase") == phase
          and challenge.get("release_sha") == release
          and challenge.get("lease_id") == payload["lease_id"]
          and challenge.get("nonce") == payload.get("nonce"),
          "root-issued same-attempt challenge mismatch")
    issue, expiry = timestamp(payload.get("issued_at")), timestamp(payload.get("expires_at"))
    check(challenge.get("issued_at") == payload.get("issued_at")
          and challenge.get("expires_at") == payload.get("expires_at"),
          "challenge issuance/expiry mismatch")
    instant = now or datetime.now(timezone.utc)
    check(instant.tzinfo is not None and instant.utcoffset().total_seconds() == 0,
          "verifier clock not UTC")
    check(0 < (expiry - issue).total_seconds() <= 600 and issue <= instant <= expiry,
          "expired, future, or oversized witness TTL")

    review = payload.get("source_review")
    check(type(review) is dict
          and review.get("status") == "INDEPENDENTLY_REVIEWED"
          and all(bool(HEX64.fullmatch(str(review.get(k) or ""))) for k in (
              "transitive_closure_sha256", "import_edges_sha256", "finance_surface_sha256"))
          and all(review.get(k) == [] for k in (
              "unresolved_import_edges", "changed_financial_writers",
              "financial_migration_paths", "unchecked_producer_edges")),
          "unknown transitive imports or financial writer paths")
    protected = payload.get("protected")
    check(type(protected) is dict and set(protected) == {"8092", "8093", "writers"},
          "incomplete protected Wolo/finance observation")
    for port in ("8092", "8093"):
        p = protected[port]
        check(type(p) is dict and p.get("count") == 1
              and type(p.get("pid")) is int and p["pid"] > 1
              and all(bool(HEX64.fullmatch(str(p.get(k) or ""))) for k in (
                  "executable_sha256", "unit_sha256", "config_sha256", "source_sha256")),
              "protected listener fingerprint absent")
    check(type(protected["writers"]) is dict
          and all(bool(HEX64.fullmatch(str(protected["writers"].get(k) or "")))
                  for k in ("hd_sha256", "de_sha256", "settlement_sha256",
                            "custody_sha256")),
          "HD/DE/settlement/custody writer fingerprint absent")
    check(payload.get("wolo_finance_p1") == "HOLD"
          and payload.get("financial_movement_authorized") is False,
          "financial hold not preserved")
    if phase == "PRE_ACTIVATE":
        pre_payload = read_json(packets / (release + "-PRE_STAGE.json")).get("payload")
        check(type(pre_payload) is dict and
              pre_payload.get("nonce") != payload.get("nonce") and
              pre_payload.get("lease_id") == payload.get("lease_id") and
              pre_payload.get("protected") == payload.get("protected"),
              "changed protected Wolo/finance fingerprints or reused phase nonce")
        check(payload.get("stage_receipt_sha256") == stage_sha
              and payload.get("staged_build_id") == stage_receipt.get("staged_build_id")
              and payload.get("artifact_sha256") == stage_receipt.get("artifact_sha256")
              and payload.get("dependency_sha256")
              == stage_receipt.get("candidate_node_modules_sha256"),
              "candidate artifact/BUILD_ID substitution")
        check(payload.get("pre_stage_packet_sha256") ==
              digest(ordinary(packets / (release + "-PRE_STAGE.json"))),
              "pre-stage witness chain missing")
    else:
        check(not any(k in payload for k in (
            "stage_receipt_sha256", "staged_build_id", "artifact_sha256",
            "dependency_sha256", "pre_stage_packet_sha256")),
            "pre-stage packet pretends staged artifact exists")

    for role in ROLES:
        pub = key_bytes(role, trust, registry)
        verify_signature(role, payload, signatures[role], pub)
    sealed_sha = digest(canonical(packet))
    # Host root must independently consume and sign a nonce claim in its
    # durable release lease journal BEFORE the Mac operator may stage.
    # A user-owned Mac O_EXCL file is deliberately NOT sufficient authority.
    host = read_json(trust / ("host-claim-" + phase + ".json"), trusted=True)
    check(host.get("schema") == 1 and set(host) == {"schema", "payload", "signature_base64"},
          "missing independent HEL1 root journal claim")
    hp = host["payload"]
    check(type(hp) is dict
          and hp.get("kind") == "aoe2war-hel1-root-nonce-consumption-v1"
          and hp.get("host") == "hel1"
          and hp.get("phase") == phase
          and hp.get("release_sha") == release
          and hp.get("nonce") == payload["nonce"]
          and hp.get("lease_id") == payload["lease_id"]
          and hp.get("packet_sha256") == sealed_sha
          and hp.get("protected") == protected
          and hp.get("root_journal_status") == "CONSUMED"
          and bool(HEX64.fullmatch(str(hp.get("root_journal_sha256") or ""))),
          "host journal claim not candidate/nonce/fingerprint bound")
    observed_at = timestamp(hp.get("observed_at"))
    check(0 <= (instant - observed_at).total_seconds() <= 120,
          "stale or future HEL1 live fingerprint witness")
    verify_signature("host", hp, host["signature_base64"],
                     key_bytes("host", trust, registry))
    if consume:
        packets.mkdir(parents=True, exist_ok=True)
        check(not packets.is_symlink() and packets.stat().st_mode & 0o077 == 0,
              "unsafe local replay journal directory")
        journal = packets / ("USED-" + phase + "-" + payload["nonce"])
        result = {"schema": 1, "phase": phase, "release_sha": release,
                  "packet_sha256": sealed_sha, "nonce": payload["nonce"]}
        try:
            fd = os.open(journal, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        except FileExistsError as exc:
            raise AdmissionHOLD("NONFINANCIAL WITNESS HOLD: replayed permit/nonce") from exc
        except OSError as exc:
            raise AdmissionHOLD("NONFINANCIAL WITNESS HOLD: replay journal unavailable") from exc
        with os.fdopen(fd, "wb") as output:
            output.write(canonical(result) + b"\n")
            output.flush()
            os.fsync(output.fileno())
    return {"status": "ADMITTED_SOURCE_ONLY", "phase": phase, "packet_sha256": sealed_sha,
            "release_sha": release, "nonce": payload["nonce"], "consumed": consume}
