#!/usr/bin/env python3
"""Solo-owner website policy v3: one owner, no independent-attestation fiction.

Old council policy is preserved unchanged. This separate authority admits ONLY
6be434c's pinned ten-path website delta. It cannot authorize financial changes,
Wolo changes or migrations. Owner signatures are required before stage and,
separately, before activation of the real staged artifact. Never auto-retry a
consumed operation, even when a transport/result is uncertain.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import re
import secrets
import sqlite3
import stat
import subprocess
import tempfile
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path

from aoe2_website_owner_observer_v3 import TIMER_FAMILIES

from aoe2_website_release_v2 import (
    MAIN_SOURCE_SHA, PRODUCTION_SHA, Hold, canonical, git, read_json, require,
    source_scope as historical_scope, utc_time,
)

POLICY_ID = "aoe2war.solo-owner.website.v3"
TRUST_ROOT = Path("/etc/aoe2war/website-owner-v3")
PUBLIC_KEY = TRUST_ROOT / "owner.pem"
STATE_ROOT = Path("/var/lib/aoe2war-website-owner-v3")
ROOT = Path(__file__).resolve().parents[1]
MANIFEST_SHA256 = "7fd6fa4a01ffe0906eeeda0719fdf7b1cd0c8e2b1975e35d7669b80c082ab4e6"
TEN_PATHS = frozenset({
    "components/kingdom-index/KingdomIndex.tsx",
    "config/kingdom-index-baseline.json",
    "config/kingdom-index-provisional-source-reviews.json",
    "config/kingdom-index-routes.json",
    "config/kingdom-index-watcher-166-source-review.json",
    "docs/DOCUMENTATION_CONTROL_PLANE.md", "docs/RIVALRIES_AND_WAR_VAULT.md",
    "docs/document-registry.json", "tests/kingdom-index-watcher-draft-score.test.mts",
    "yarn.lock",
})
CONTEXT_KEYS = frozenset({
    "candidate_sha", "previous_production_sha", "scope_sha256",
    "controller_commit_sha", "operator_inventory_sha256", "policy_source_sha256",
    "manifest_sha256", "gate_sha256", "runtime_observation", "rollback",
    "artifact_sha256", "stage_receipt_sha256", "build_id",
})


def digest(value) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def hex_value(value, length=64) -> bool:
    return type(value) is str and len(value) == length and all(c in "0123456789abcdef" for c in value)


def moment(now=None):
    return now if now is not None else datetime.now(timezone.utc)


def stamp(now):
    return now.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def load_owner_key(path: Path, *, allow_test_root=False) -> str:
    require(path.is_absolute() and path.is_file() and not path.is_symlink() and
            not path.parent.is_symlink(), "owner public key unavailable/linked")
    for entry in (path.parent, path):
        mode = entry.stat()
        require(not mode.st_mode & 0o022, "owner public trust writable by another user")
        require(allow_test_root or mode.st_uid == 0, "owner public trust must be root administered")
    raw = path.read_bytes()
    require(0 < len(raw) < 8192 and b"PUBLIC KEY" in raw and b"PRIVATE KEY" not in raw,
            "only owner PUBLIC material is accepted")
    p = subprocess.run(["openssl", "pkey", "-pubin", "-in", str(path), "-pubout", "-outform", "DER"],
                       capture_output=True, timeout=10, check=False)
    require(p.returncode == 0 and 0 < len(p.stdout) < 8192, "invalid owner public key")
    strength = subprocess.run(["openssl", "rsa", "-pubin", "-in", str(path), "-text", "-noout"],
                              capture_output=True, timeout=10, check=False)
    bits = re.search(rb"\((\d+) bit\)", strength.stdout)
    require(strength.returncode == 0 and bits is not None and int(bits[1]) >= 2048,
            "owner policy requires an RSA public key of at least 2048 bits")
    return hashlib.sha256(p.stdout).hexdigest()


def _connection(root: Path, *, allow_test_root=False):
    require(root.is_absolute() and root.is_dir() and not root.is_symlink(), "private owner nonce directory unavailable")
    info = root.stat()
    require(info.st_uid == os.geteuid() and not info.st_mode & 0o077, "nonce directory must be operator-owned 0700")
    parent = root.parent.stat()
    require(allow_test_root or parent.st_uid == 0 and not parent.st_mode & 0o022,
            "nonce directory parent must be root protected")
    db = root / "owner-v3.sqlite3"
    require(not db.is_symlink(), "nonce database is linked")
    if not db.exists():
        fd = os.open(db, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(fd)
    mode = db.stat()
    require(stat.S_ISREG(mode.st_mode) and mode.st_uid == os.geteuid() and stat.S_IMODE(mode.st_mode) == 0o600,
            "nonce database must be private regular operator-owned 0600")
    cx = sqlite3.connect(str(db), timeout=5, isolation_level=None)
    try:
        require(cx.execute("PRAGMA journal_mode=DELETE").fetchone()[0].lower() == "delete",
                "nonce ledger did not enter rollback journal mode")
        # EXTRA also synchronizes the directory after journal deletion; FULL
        # alone can lose the last committed consumption after a power loss.
        cx.execute("PRAGMA synchronous=EXTRA")
        cx.execute("PRAGMA fullfsync=ON")
        require(cx.execute("PRAGMA synchronous").fetchone()[0] == 3 and
                cx.execute("PRAGMA fullfsync").fetchone()[0] == 1,
                "nonce ledger durability settings unavailable")
        cx.execute("""CREATE TABLE IF NOT EXISTS requests_v3(
            attempt_id TEXT NOT NULL, phase TEXT NOT NULL, nonce TEXT NOT NULL UNIQUE,
            payload TEXT NOT NULL, state TEXT NOT NULL, packet_sha TEXT, result TEXT,
            PRIMARY KEY(attempt_id,phase))""")
    except BaseException:
        cx.close()
        raise
    return cx


def check_context(context: dict, phase: str):
    require(type(context) is dict and set(context) == CONTEXT_KEYS, "incomplete/unknown release context")
    require(context["candidate_sha"] == MAIN_SOURCE_SHA and context["previous_production_sha"] == PRODUCTION_SHA,
            "wrong website/production source")
    for key in ("scope_sha256", "operator_inventory_sha256", "policy_source_sha256", "manifest_sha256", "gate_sha256"):
        require(hex_value(context[key]), "invalid release digest: " + key)
    require(hex_value(context["controller_commit_sha"], 40), "invalid controller source")
    require(context["manifest_sha256"] == MANIFEST_SHA256, "different sealed website manifest")
    require(type(context["runtime_observation"]) is dict and type(context["rollback"]) is dict,
            "runtime/rollback context missing")
    require(context["rollback"].get("source_sha") == PRODUCTION_SHA and
            type(context["rollback"].get("build_id")) is str and context["rollback"]["build_id"],
            "rollback source/BUILD_ID missing")
    if phase == "PRE_STAGE":
        require(all(context[k] is None for k in ("artifact_sha256", "stage_receipt_sha256", "build_id")),
                "stage authorization cannot invent an artifact")
    else:
        require(hex_value(context["artifact_sha256"]) and hex_value(context["stage_receipt_sha256"]) and
                type(context["build_id"]) is str and 8 <= len(context["build_id"]) <= 128,
                "activation must bind actual artifact/BUILD_ID")


def issue_request(context: dict, phase: str, *, state_root: Path, public_key: Path,
                  now=None, attempt_id=None, allow_test_root=False) -> dict:
    require(phase in ("PRE_STAGE", "PRE_ACTIVATE"), "unsupported owner phase")
    check_context(context, phase)
    fingerprint = load_owner_key(public_key, allow_test_root=allow_test_root)
    current = moment(now)
    require(current.utcoffset() == timedelta(0), "UTC issuer clock required")
    identity = attempt_id or secrets.token_urlsafe(32)
    require(type(identity) is str and 24 <= len(identity) <= 96 and
            all(c.isascii() and (c.isalnum() or c in "_-") for c in identity), "invalid attempt identity")
    require(phase != "PRE_STAGE" or attempt_id is None, "new stage requires new identity")
    payload = {"kind": POLICY_ID, "phase": phase, "attempt_id": identity,
               "nonce": secrets.token_urlsafe(32), "issued_at": stamp(current),
               "expires_at": stamp(current + timedelta(minutes=20)),
               "owner_key_sha256": fingerprint, "context": context,
               "same_owner_observation_not_independent": True,
               "financial_release_authorized": False, "custody_authorized": False,
               "wolo_source_p1_open": True, "claim_889_resolved": False}
    cx = _connection(state_root, allow_test_root=allow_test_root)
    try:
        cx.execute("BEGIN IMMEDIATE")
        if phase == "PRE_ACTIVATE":
            row = cx.execute("SELECT state,result FROM requests_v3 WHERE attempt_id=? AND phase='PRE_STAGE'", (identity,)).fetchone()
            require(row is not None and row[0] == "COMPLETE" and row[1] is not None,
                    "stage is not proven complete; no retry after uncertainty")
            result = json.loads(row[1])
            require(result.get("status") == "STAGED" and result.get("artifact_sha256") == context["artifact_sha256"] and
                    result.get("staged_build_id") == context["build_id"] and
                    result.get("local_receipt_sha256") == context["stage_receipt_sha256"], "actual stage lineage mismatch")
        cx.execute("INSERT INTO requests_v3(attempt_id,phase,nonce,payload,state) VALUES(?,?,?,?, 'ISSUED')",
                   (identity, phase, payload["nonce"], canonical(payload).decode("ascii")))
        cx.commit()
    except BaseException:
        cx.rollback()
        raise
    finally:
        cx.close()
    return payload


def verify_packet(packet: dict, *, public_key: Path, issued_payload: dict,
                  now=None, allow_test_root=False) -> dict:
    require(type(packet) is dict and set(packet) == {"schema", "policy", "payload", "signature"} and
            type(packet["schema"]) is int and packet["schema"] == 3 and packet["policy"] == POLICY_ID,
            "legacy/unknown authorization policy")
    p = packet["payload"]
    require(type(p) is dict and p == issued_payload and p.get("kind") == POLICY_ID,
            "owner authorization differs from controller-issued exact context")
    require(p.get("phase") in ("PRE_STAGE", "PRE_ACTIVATE"), "unsupported owner authorization phase")
    check_context(p["context"], p.get("phase"))
    require(p.get("same_owner_observation_not_independent") is True and
            p.get("financial_release_authorized") is False and p.get("custody_authorized") is False and
            p.get("wolo_source_p1_open") is True and p.get("claim_889_resolved") is False,
            "owner website policy cannot escalate financial authority")
    current = moment(now)
    issued, expiry = utc_time(p["issued_at"]), utc_time(p["expires_at"])
    require(issued <= current < expiry and timedelta(0) < expiry-issued <= timedelta(minutes=20),
            "expired/future owner authorization")
    require(load_owner_key(public_key, allow_test_root=allow_test_root) == p["owner_key_sha256"],
            "owner public identity changed")
    try:
        signature = base64.b64decode(packet["signature"], validate=True)
    except (ValueError, TypeError) as exc:
        raise Hold("invalid owner signature encoding") from exc
    require(32 <= len(signature) <= 8192, "invalid owner signature size")
    with tempfile.TemporaryDirectory(prefix="aoe2-owner-v3-verify-") as folder:
        msg, sig = Path(folder)/"message", Path(folder)/"signature"
        msg.write_bytes(canonical(p)); sig.write_bytes(signature)
        v = subprocess.run(["openssl", "dgst", "-sha256", "-verify", str(public_key),
                            "-signature", str(sig), str(msg)], capture_output=True, timeout=10, check=False)
    require(v.returncode == 0, "owner signature invalid")
    require(issued <= moment(now) < expiry, "owner authorization expired during signature verification")
    return p


def consume_request(packet: dict, *, state_root: Path, public_key: Path,
                    now=None, allow_test_root=False) -> str:
    p = packet.get("payload") if type(packet) is dict else None
    require(type(p) is dict and type(p.get("attempt_id")) is str and type(p.get("phase")) is str,
            "missing owner-issued request")
    cx = _connection(state_root, allow_test_root=allow_test_root)
    try:
        cx.execute("BEGIN IMMEDIATE")
        row = cx.execute("SELECT payload,state FROM requests_v3 WHERE attempt_id=? AND phase=?",
                         (p["attempt_id"], p["phase"])).fetchone()
        require(row is not None and row[1] == "ISSUED", "unknown/consumed attempt: inspect receipts, never retry blindly")
        verify_packet(packet, public_key=public_key, issued_payload=json.loads(row[0]), now=now,
                      allow_test_root=allow_test_root)
        sha = digest(packet)
        cx.execute("UPDATE requests_v3 SET state='CONSUMED',packet_sha=? WHERE attempt_id=? AND phase=? AND state='ISSUED'",
                   (sha, p["attempt_id"], p["phase"]))
        cx.commit()
        return sha
    except BaseException:
        cx.rollback()
        raise
    finally:
        cx.close()


def finish_request(attempt_id, phase, result, *, state_root: Path, allow_test_root=False):
    cx = _connection(state_root, allow_test_root=allow_test_root)
    try:
        cx.execute("BEGIN IMMEDIATE")
        require(cx.execute("UPDATE requests_v3 SET state='COMPLETE',result=? WHERE attempt_id=? AND phase=? AND state='CONSUMED'",
                           (canonical(result).decode("ascii"), attempt_id, phase)).rowcount == 1,
                "operation is not uniquely consumed")
        cx.commit()
    except BaseException:
        cx.rollback(); raise
    finally:
        cx.close()


def mechanical_scope(candidate_repo: Path) -> dict:
    scope = historical_scope(candidate_repo, MAIN_SOURCE_SHA)
    require(set(scope["paths"]) == TEN_PATHS, "not the approved ten-path website scope")
    # The complete immutable Git tree, rather than a filename heuristic, pins
    # the reviewed client component/JSON and sole fast-uri lockfile update.
    component = git(candidate_repo, "show", MAIN_SOURCE_SHA + ":components/kingdom-index/KingdomIndex.tsx")
    require(component.startswith('"use client"') or component.startswith("'use client'"), "component became server executable")
    scope["blobs"] = {path: git(candidate_repo, "rev-parse", MAIN_SOURCE_SHA+":"+path) for path in sorted(TEN_PATHS)}
    # These unchanged entrypoints include the existing idempotent WarGraph DB
    # workers and side-effecting legacy GET ingress. They are not newly enabled
    # or invoked by this controller; passive version probes alone are used.
    bootstrap = (
        "package.json", "server.js", "next.config.js", "instrumentation.ts", "instrumentation.node.ts",
        "lib/wargraph/runtime.ts", "lib/wargraph/prismaSettlementWorker.ts",
        "lib/betMarketEnsureQueue.ts", "lib/lobbySnapshot.ts", "lib/bets.ts",
        "scripts/prepare-runtime-cache.mjs", "app/api/deployment-version/route.ts",
    )
    scope["unchanged_runtime_blobs"] = {}
    for path in bootstrap:
        before = git(candidate_repo, "rev-parse", PRODUCTION_SHA+":"+path)
        after = git(candidate_repo, "rev-parse", MAIN_SOURCE_SHA+":"+path)
        require(before == after, "unreviewed startup/server/finance behavior: " + path)
        scope["unchanged_runtime_blobs"][path] = after
    scope["same_owner_review_not_independent"] = True
    scope["server_financial_startup_or_migration_source_delta"] = []
    scope["passive_health_paths"] = ["/api/deployment-version"]
    return scope


def release_context(candidate_repo: Path, observation: dict, *, stage_receipt: Path | None = None) -> dict:
    import aoe2_website_protected_release_v2 as engine
    import aoe2_release_ship as ship
    scope = mechanical_scope(candidate_repo)
    provenance = engine.operator_source_provenance(root=ROOT)
    _mf, manifest, manifest_sha = ship.load_manifest(MAIN_SOURCE_SHA)
    _gf, gate_sha = ship.gate_integrity(manifest)
    require(manifest_sha == MANIFEST_SHA256 and manifest.get("migration_paths") == [] and
            manifest.get("release_sha") == MAIN_SOURCE_SHA and manifest.get("previous_production_sha") == PRODUCTION_SHA and
            manifest.get("changed_files") == scope["paths"] and manifest.get("risk_class") == "WATCHER",
            "sealed source/gate/scope manifest changed")
    facts = engine.stage_facts(candidate_repo, stage_receipt) if stage_receipt is not None else None
    return {"candidate_sha": MAIN_SOURCE_SHA, "previous_production_sha": PRODUCTION_SHA,
            "scope_sha256": digest(scope), "controller_commit_sha": provenance["commit_sha"],
            "operator_inventory_sha256": provenance["inventory_sha256"],
            "policy_source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "manifest_sha256": manifest_sha, "gate_sha256": gate_sha,
            "runtime_observation": observation,
            "rollback": {"source_sha": PRODUCTION_SHA, "build_id": observation["website"]["build_id"]},
            "artifact_sha256": facts["artifact_sha256"] if facts else None,
            "stage_receipt_sha256": facts["sha"] if facts else None,
            "build_id": facts["build_id"] if facts else None}


def protected_dispatch(data, candidate_repo, mode, stage_receipt=None):
    """Existing protected stage/activate libraries, with the caller's held lease.

    No raw Ship CLI, child lease, service commands or global P1 waiver. The
    exact source/risk/manifest and owner packet have already been verified.
    """
    import aoe2_release as release
    import aoe2_release_stage as stage
    import aoe2_release_ship as ship
    for module in (release, stage, ship):
        require(Path(module.ROOT).resolve() == candidate_repo, "release module points at a different candidate")
    require(data.get("local", {}).get("head") == MAIN_SOURCE_SHA and
            data.get("local", {}).get("dirty_count") == 0, "protected release snapshot changed")
    output = io.StringIO()
    with redirect_stdout(output):
        if mode == "stage":
            rc = stage.stage_release(data, json_output=True)
        else:
            require(stage_receipt is not None, "actual stage receipt required")
            rc = ship.activate_release(data, stage_receipt=str(stage_receipt), dry_run=False, json_output=True)
    require(rc == 0, "protected release failed: do not retry a consumed attempt")
    from aoe2_website_protected_release_v2 import strict_json_bytes
    result = strict_json_bytes(output.getvalue().encode("utf-8"))
    require(result.get("status") == ("STAGED" if mode == "stage" else "CERTIFIED") and
            result.get("release_sha") == MAIN_SOURCE_SHA and result.get("wolo_mutated") is False,
            "protected engine returned unverified evidence")
    return result


def stable_financial_runtime_identity(immutable: dict) -> dict:
    """Compare protected Wolo/config/timer policy, not timer-fired one-shot PIDs.

    A reconciliation service launched by its already-enabled timer is expected
    to go active/running and then inactive/dead during a long isolated web build.
    Its transient MainPID/ActiveState/SubState are OBSERVED in each full packet,
    but not treated as immutable release authority. Unit presence/load/config,
    enablement, and all timer states remain checked; continuous Wolo/consensus
    writers retain exact PID/inode/exe identity.

    Call only after validate_observation has admitted each complete snapshot.
    """
    require(type(immutable) is dict and type(immutable.get("financial_units")) is dict,
            "invalid protected financial runtime observation")
    units = immutable["financial_units"]
    oneshots = {name + ".service" for name in TIMER_FAMILIES}
    require(oneshots.issubset(units), "missing registered timed one-shot service")
    stable = dict(immutable)
    stable_units = {}
    for name, row in units.items():
        require(type(row) is dict, "invalid financial unit observation")
        if name in oneshots:
            require(set(row) == {"LoadState", "ActiveState", "SubState",
                                 "UnitFileState", "MainPID"} and row["LoadState"] == "loaded" and
                    type(row["MainPID"]) is int and row["MainPID"] >= 0 and
                    all(type(row[k]) is str and 0 < len(row[k]) <= 64
                        for k in ("ActiveState", "SubState", "UnitFileState")) and
                    row["ActiveState"] in {"inactive", "activating", "active", "deactivating"} and
                    (row["ActiveState"] != "inactive" or
                     (row["SubState"] == "dead" and row["MainPID"] == 0)),
                    "unacceptable timed one-shot unit state")
            stable_units[name] = {
                "LoadState": row["LoadState"],
                "UnitFileState": row["UnitFileState"],
            }
        else:
            stable_units[name] = row
    stable["financial_units"] = stable_units
    return stable


def operation(mode, candidate_repo: Path, *, packet=None, stage_receipt=None, attempt_id=None):
    # Set trusted candidate root BEFORE importing existing lease/release modules.
    require(not candidate_repo.is_symlink(), "linked candidate")
    candidate_repo = candidate_repo.resolve(strict=True)
    os.environ["AOE2WAR_WEBSITE_CANDIDATE_ROOT"] = str(candidate_repo)
    import aoe2_release as release
    from aoe2_website_owner_observer_v3 import observe, validate_observation
    load_owner_key(PUBLIC_KEY)
    with release.deployment_lock():
        data = release.collect()
        before = observe()
        validate_observation(before)
        require(before["website"]["source_sha"] == PRODUCTION_SHA, "production source no longer the approved rollback anchor")
        context = release_context(candidate_repo, before, stage_receipt=stage_receipt)
        phase = "PRE_ACTIVATE" if mode in ("issue-activation", "activate") else "PRE_STAGE"
        if mode.startswith("issue-"):
            return {"schema": 3, "policy": POLICY_ID, "status": "OWNER_SIGNATURE_REQUIRED",
                    "payload": issue_request(context, phase, state_root=STATE_ROOT, public_key=PUBLIC_KEY, attempt_id=attempt_id)}
        require(mode in ("stage", "activate") and packet is not None, "signed owner request required")
        p = packet.get("payload", {})
        expected = p.get("context", {})
        require(p.get("phase") == phase, "wrong signed phase")
        reference = expected.get("runtime_observation")
        validate_observation(reference, max_age_seconds=1200)
        require(stable_financial_runtime_identity(reference["immutable"]) == stable_financial_runtime_identity(before["immutable"]) and reference["website"] == before["website"],
                "runtime/config/finance/website changed since owner approval")
        actual = dict(context); actual["runtime_observation"] = reference
        require(actual == expected, "source/controller/manifest/rollback/artifact changed after owner review")
        # Context Git/manifest/file I/O may outlive freshness. Obtain a new
        # bounded observation after it and bind it to the owner's reference.
        latest = observe(); validate_observation(latest)
        require(stable_financial_runtime_identity(latest["immutable"]) == stable_financial_runtime_identity(before["immutable"]) and latest["website"] == before["website"],
                "runtime changed during lease-held authorization I/O")
        validate_observation(latest)
        # Consume durably before the ONE protected dispatch. Failure remains
        # CONSUMED and cannot automatically rerun after crash/transport loss.
        sha = consume_request(packet, state_root=STATE_ROOT, public_key=PUBLIC_KEY)
        # SQLite lock/fsync and cryptographic verification are I/O too. If
        # either consumes the remaining validity, retain CONSUMED but refuse
        # dispatch; never reset that nonce to make a retry possible.
        validate_observation(latest)
        require(utc_time(p["issued_at"]) <= moment() < utc_time(p["expires_at"]),
                "owner authorization expired during durable consumption")
        # Source-only future evidence extension: no authority or comparator
        # tolerance changes. The original nonce still decides one-use execution.
        from aoe2_website_owner_evidence_v1 import append_event, differences
        def record(event, value):
            return append_event(STATE_ROOT, p["attempt_id"], phase, event, value,
                                source_sha=expected["controller_commit_sha"])
        record("before-dispatch", {"observation": before, "latest_observation": latest,
                                   "owner_packet_sha256": sha})
        record("dispatch-starting", {"recorded_at": stamp(moment()), "mode": mode})
        try:
            # Evidence fsync is bounded local I/O too: it must not lend an
            # expired observation or owner authorization to the dispatcher.
            validate_observation(latest)
            require(utc_time(p["issued_at"]) <= moment() < utc_time(p["expires_at"]),
                    "owner authorization expired during durable evidence I/O")
        except BaseException as exc:
            record("dispatch-refused", {"error_type": type(exc).__name__, "redispatch_permitted": False})
            raise
        try:
            result = protected_dispatch(data, candidate_repo, mode, stage_receipt)
        except BaseException as exc:
            # No result is proof of uncertainty, not permission to rerun.
            record("dispatch-uncertain", {"error_type": type(exc).__name__, "redispatch_permitted": False})
            raise
        # Persist CERTIFIED/STAGED before a slow/failing final observer. An
        # immutable protected engine receipt remains separate original evidence.
        record("dispatch-returned", {"protected_release_result": result})
        diff = None
        try:
            after = observe()
            record("after-dispatch", {"observation": after})
            # Retain raw differences even if the changed executable/source or
            # malformed unit makes the strict observer reject this snapshot.
            diff = differences(before["immutable"], after.get("immutable"))
            validate_observation(after)
            diff = differences(stable_financial_runtime_identity(before["immutable"]),
                               stable_financial_runtime_identity(after["immutable"]))
            require(not diff, "financial/Wolo boundary changed during release; recovery review required")
            require(after["website"]["source_sha"] == (MAIN_SOURCE_SHA if mode == "activate" else PRODUCTION_SHA),
                    "post-operation website source incorrect")
            if mode == "stage":
                require(before["website"] == after["website"], "isolated stage changed active website")
            else:
                require(after["website"]["build_id"] == expected["build_id"], "active BUILD_ID differs from owner-approved artifact")
        except BaseException as exc:
            record("verification-held", {"error_type": type(exc).__name__, "reason": str(exc),
                                          "differences": diff, "original_nonce_state": "CONSUMED",
                                          "redispatch_permitted": False})
            raise
        record("verification-passed", {"observation_sha256": digest(after)})
        finish_request(p["attempt_id"], phase, result, state_root=STATE_ROOT)
        return {"schema": 3, "policy": POLICY_ID, "status": "OWNER_WEBSITE_STAGE_VERIFIED" if mode == "stage" else "OWNER_WEBSITE_ACTIVATION_VERIFIED",
                "owner_packet_sha256": sha, "protected_release_result": result,
                "observation_independent": False, "financial_release_authorized": False,
                "custody_authorized": False, "wolo_source_p1_open": True}


def sign_request(request: dict, private_key: Path, *, candidate: str, controller: str, manifest: str, phase: str) -> dict:
    p = request.get("payload", {})
    require(request.get("schema") == 3 and request.get("policy") == POLICY_ID and p.get("kind") == POLICY_ID,
            "not a solo-owner v3 request")
    context = p.get("context", {})
    require(context.get("candidate_sha") == candidate == MAIN_SOURCE_SHA and context.get("controller_commit_sha") == controller and
            context.get("manifest_sha256") == manifest == MANIFEST_SHA256 and p.get("phase") == phase,
            "explicit owner policy/source/manifest/phase acceptance differs")
    require(private_key.is_absolute() and private_key.is_file() and not private_key.is_symlink(), "owner signing credential unavailable")
    mode = private_key.stat()
    require(mode.st_uid == os.geteuid() and not mode.st_mode & 0o077, "owner private key must be owner-only")
    parent = private_key.parent.stat()
    require(parent.st_uid == os.geteuid() and not parent.st_mode & 0o077,
            "owner signing directory must be private 0700")
    inside = subprocess.run(["git", "-C", str(private_key.parent), "rev-parse", "--is-inside-work-tree"],
                            capture_output=True, timeout=10, check=False,
                            env={k: v for k, v in os.environ.items() if not k.startswith("GIT_")})
    require(inside.returncode != 0, "owner private credential must be outside every Git checkout")
    require(mode.st_size <= 16384, "owner credential exceeds bounded PKCS8 size")
    with private_key.open("rb") as credential:
        require(credential.readline(80).strip() == b"-----BEGIN ENCRYPTED PRIVATE KEY-----",
                "owner credential must be encrypted PKCS8; no plaintext private key")
    with tempfile.TemporaryDirectory(prefix="aoe2-owner-sign-") as folder:
        path = Path(folder)/"message"; path.write_bytes(canonical(p))
        # Owner invokes interactively. No passphrase environment/argument/log;
        # OpenSSL reads any encrypted-key passphrase directly from their tty.
        result = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(private_key), str(path)],
                                stdout=subprocess.PIPE, timeout=120, check=False)
    require(result.returncode == 0, "owner signing failed")
    return {"schema": 3, "policy": POLICY_ID, "payload": p, "signature": base64.b64encode(result.stdout).decode("ascii")}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("mode", choices=["issue-stage", "stage", "issue-activation", "activate", "sign"])
    ap.add_argument("--candidate-repo", type=Path, default=Path.home()/"projects/AoE2HDBets/app-prodn")
    ap.add_argument("--packet", type=Path); ap.add_argument("--stage-receipt", type=Path); ap.add_argument("--attempt-id")
    ap.add_argument("--request", type=Path); ap.add_argument("--private-key", type=Path)
    ap.add_argument("--approve-candidate"); ap.add_argument("--approve-controller"); ap.add_argument("--approve-manifest"); ap.add_argument("--approve-phase")
    args = ap.parse_args()
    try:
        if args.mode == "sign":
            require(args.request is not None and args.private_key is not None, "owner request/private credential path required")
            output = sign_request(read_json(args.request), args.private_key, candidate=args.approve_candidate,
                                  controller=args.approve_controller, manifest=args.approve_manifest, phase=args.approve_phase)
        else:
            output = operation(args.mode, args.candidate_repo, packet=read_json(args.packet) if args.packet else None,
                               stage_receipt=args.stage_receipt, attempt_id=args.attempt_id)
    except (Hold, OSError, ValueError, sqlite3.Error, subprocess.SubprocessError) as exc:
        print(json.dumps({"schema": 3, "policy": POLICY_ID, "status": "HOLD", "reason": str(exc),
                          "financial_release_authorized": False, "custody_authorized": False,
                          "wolo_source_p1_open": True, "observation_independent": False}, indent=2))
        return 2
    print(json.dumps(output, indent=2, sort_keys=True)); return 0


if __name__ == "__main__":
    raise SystemExit(main())
