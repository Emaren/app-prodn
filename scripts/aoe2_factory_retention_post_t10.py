#!/usr/bin/env python3
"""Original Factory post-T10 retention intent. NEVER transfers/deletes.

This source-controlled read-only recorder runs after the genuine release T10
seal. It prevents silent historical-debt growth by recording an exact immutable
HOLD/owner-action handoff, not by inventing current+two owner pins, Intel copies,
cold checkpoint restores, or an L4 software-retirement authorization.
"""
from __future__ import annotations

import hashlib
import json
import re

SCHEMA = "aoe2war.factory.post-t10-retention-intent.v1"
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
BUILD = re.compile(r"[A-Za-z0-9_-]{8,64}\Z")
FIRST_OWNER_SELECTED = {
    "generation": "4c14cbc7c518",
    "source_sha": "4c14cbc7c518f9b28e1d84b5f88a022a82f7d2e7",
    "build_id": "w-tDoD2iUw6P2P4oTw3Ti",
    "source_filesystem_uuid": "64f6fb02-4fed-4836-a33b-86e8993afdfa",
    "expanded_device": 2049,
    "expanded_inode": 4493824,
    "full_original_source_manifest_sha256":
        "d96aa4edf0dcf2a117b2cb46a1e4ee4a69da8bdcf22db779610adff5043c50bc",
    "full_tree_sha256":
        "60ba8c3561bed95b8f72dcb97f805516a55c5963a0f6c182ea94536c4f6f6647",
    "scope": "HEL1_HISTORICAL_FACTORY_RUNTIME/COPY_ONLY_NO_RETIRE",
}
PROTECTED = {
    "appearance": "f50ead889c61",
    "social": "da0bee282e52",
    "fallback_3030": "KEEP_3030_ORIGINAL:/var/www/AoE2HDBets/app-prodn",
    "emergency_3033": "KEEP_3033_ORIGINAL:/",
}

class RetentionHold(ValueError):
    pass

def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def canonical(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")

def _document(raw: bytes, limit: int) -> dict:
    if type(raw) is not bytes or not 20 <= len(raw) <= limit:
        raise RetentionHold("BOUNDED_T10_SOURCE_REQUIRED")
    try:
        obj = json.loads(raw)
    except (ValueError, UnicodeError):
        raise RetentionHold("MALFORMED_FACTORY_ORIGINAL") from None
    if type(obj) is not dict:
        raise RetentionHold("ORIGINAL_NOT_OBJECT")
    return obj

def plan_only_after_exact_t10(*, source_sha: str, build_id: str,
                               seal_raw: bytes, ledger_raw: bytes,
                               t8_raw: bytes) -> dict:
    """Bound original receipts, emit immutable plan-only post-T10 handoff.

    This function has no IO, secret access, shell, network, archive or unlink.
    No original owner-signed pinset ledger is ingested here; its admission
    remains independent and cannot be inferred from T8 predecessor ancestry.
    """
    if not (type(source_sha) is str and HEX40.fullmatch(source_sha) and
            type(build_id) is str and BUILD.fullmatch(build_id)):
        raise RetentionHold("CURRENT_SOURCE_BUILD_IDENTITY")
    if type(ledger_raw) is not bytes or not 20 <= len(ledger_raw) <= 2_000_000:
        raise RetentionHold("T10_LEDGER_BUDGET")
    seal = _document(seal_raw, 16384)
    t8 = _document(t8_raw, 131072)
    if not (seal.get("schema") == "aoe2war.product.release-seal.v1"
            and seal.get("sourceSha") == source_sha
            and seal.get("buildId") == build_id
            and seal.get("financialAuthorized") is False
            and seal.get("ledgerSha256") == sha(ledger_raw)
            and type(seal.get("lastEventHash")) is str
            and HEX64.fullmatch(seal["lastEventHash"])
            and type(seal.get("summarySha256")) is str
            and HEX64.fullmatch(seal["summarySha256"])):
        raise RetentionHold("T10_SEAL_ORIGINAL_LEDGER_MISMATCH")
    try:
        events = [json.loads(line) for line in ledger_raw.splitlines()]
    except ValueError:
        raise RetentionHold("T10_LEDGER_PARSE") from None
    if not (1 <= len(events) <= 512
            and all(type(e) is dict for e in events)
            and events[-1].get("event") == "T10" and
            events[-1].get("state") == "pass" and
            events[-1].get("eventHash") == seal["lastEventHash"] and
            all(isinstance(e,dict) and e.get("sourceSha") == source_sha for e in events)):
        raise RetentionHold("T10_LAST_EVENT_OR_SOURCE_NOT_VERIFIED")
    previous_source = t8.get("sourceSha")
    previous_build = t8.get("buildId")
    if not (type(previous_source) is str and HEX40.fullmatch(previous_source)
            and previous_source != source_sha
            and type(previous_build) is str and BUILD.fullmatch(previous_build)):
        raise RetentionHold("T8_PREDECESSOR_ORIGINAL_MISMATCH")
    exact_first = (source_sha == "890d9dcc22d081ff1c662f33c98a8da795f3d3e9"
                   and build_id == "0NEGtfP0ieSzETh1JHGhE"
                   and previous_source == "9cf670724c82e29861e539c03c4d3165893da8f3"
                   and previous_build == "fvPCvEd_aFucA_X3hSfn9")
    report = {
        "schema": SCHEMA,
        "factory_source_sha": source_sha,
        "factory_build_id": build_id,
        "original_t10_seal_sha256": sha(seal_raw),
        "original_t10_event_ledger_sha256": sha(ledger_raw),
        "original_t8_witness_sha256": sha(t8_raw),
        "current": {"source_sha": source_sha, "build_id": build_id,
                    "protection": "KEEP_CURRENT"},
        "t8_verified_predecessor": {"source_sha": previous_source,
                                   "build_id": previous_build,
                                   "protection": "KEEP_PREVIOUS_UNTIL_OWNER_ADMITTED_PINSET"},
        "two_hot_pinset": "HOLD_OWNER_ED25519_FACTORY_LEDGER_ABSENT",
        "third_hot_identity_inferred_from_ancestry": False,
        "three_cold_checkpoints": "HOLD_INDEPENDENT_ENCRYPTED_RESTORE_PROOF_REQUIRED",
        "protected_ancillary": PROTECTED,
        "first_owner_selected_cold_review": FIRST_OWNER_SELECTED if exact_first else None,
        "historical_queue": "HOLD_REQUIRE_ORDERED_ORIGINAL_T10_RECEIPTS_NOT_AGE_SORT",
        "copy_class_admitted": False,
        "copy_permission_validated": False,
        "archive_transfer_requested": False,
        "retirement_authorized": False,
        "retirement_attempted": False,
        "delete_or_prune_allowed": False,
        "physical_reclaimed_bytes": None,
        "next_action": "SOURCE_REVIEW_OWNER_PINSET_THEN_EXACT_INTEL_COPY_ONLY_THEN_L4",
        "operation": "PLAN_ONLY_NO_EXECUTION",
    }
    report["canonical_sha256"] = sha(canonical(report))
    return report


# Additive, reviewed original Factory birth registry; source-recording only.
# This certificate inherits the existing T5/T8/T10 controller invocation.
# The original Factory append-only release ledger and one-shot seal_once own
# storage; this pure builder never starts another service or grants deletion.
BIRTH_SCHEMA = "aoe2war.factory.object-birth.v1"
BIRTH_PHASES = ("T5", "T8", "T10")
BIRTH_CLASS = {
    "T5": frozenset(("M1_STAGED_TAR", "HEL1_TRANSPORT_TAR")),
    "T8": frozenset(("M1_T8_WITNESS", "HEL1_ROLLBACK_GENERATION")),
    "T10": frozenset(("M1_T10_SEAL", "HEL1_LIVE_GENERATION")),
}
BIRTH_SURFACES = {"M1_STAGED_TAR": "M1", "HEL1_TRANSPORT_TAR": "HEL1_ROOT",
                  "M1_T8_WITNESS": "M1",
                  "HEL1_ROLLBACK_GENERATION": "HEL1_ROOT",
                  "M1_T10_SEAL": "M1",
                  "HEL1_LIVE_GENERATION": "HEL1_ROOT"}
BIRTH_PURPOSES = {
    "M1_STAGED_TAR": "FACTORY_T5_RECOVERABLE_TRANSPORT_INPUT",
    "HEL1_TRANSPORT_TAR": "FACTORY_T5_REMOTE_STAGE_FOR_T7",
    "M1_T8_WITNESS": "FACTORY_T8_ORIGINAL_ROLLBACK_EVIDENCE",
    "HEL1_ROLLBACK_GENERATION": "FACTORY_PROTECTED_HOT_PREDECESSOR",
    "M1_T10_SEAL": "FACTORY_IMMUTABLE_ACCEPTANCE_SOURCE",
    "HEL1_LIVE_GENERATION": "FACTORY_CURRENT_WEBSITE_RUNTIME",
}
BIRTH_KEEP = {
    "M1_STAGED_TAR": "KEEP_UNTIL_INDEPENDENT_RESTORE_AND_OWNER_REVIEW",
    "HEL1_TRANSPORT_TAR": "KEEP_T5_AND_T8_PREDECESSOR_FLOOR",
    "M1_T8_WITNESS": "KEEP_SOURCE_PROOF_NO_PRUNE",
    "HEL1_ROLLBACK_GENERATION": "KEEP_HOT_ROLLBACK",
    "M1_T10_SEAL": "KEEP_T10_ORIGINAL_PROOF",
    "HEL1_LIVE_GENERATION": "KEEP_LIVE_RUNTIME",
}
BIRTH_RECOVERY = {
    "M1_STAGED_TAR": ["ORIGINAL_ARTIFACT_SHA_AND_LINUX_PROOF",
                      "ISOLATED_RUNTIME_REEXTRACTION", "SOURCE_OWNER_APPROVAL"],
    "HEL1_TRANSPORT_TAR": ["DATA_OR_INTEL_COLD_COPY",
                           "INDEPENDENT_FULL_SHA_AND_ISOLATED_RESTORE",
                           "ROOT_T8_FLOOR_AND_HUMAN_L4_AUTHORIZATION"],
    "M1_T8_WITNESS": ["ORIGINAL_FACTORY_LEDGER_AND_ROOT_SEAL",
                      "INDEPENDENT_PROVENANCE", "SOURCE_OWNER_APPROVAL"],
    "HEL1_ROLLBACK_GENERATION": ["NEWER_LIVE_AND_TWO_HOT_FLOOR",
                                "INDEPENDENT_REEXTRACTION", "HUMAN_L4_PERMISSION"],
    "M1_T10_SEAL": ["ROOT_LEDGER_READBACK", "GITHUB_SOURCE_AND_ARTIFACT",
                    "DURABLE_COLD_RECOVERY"],
    "HEL1_LIVE_GENERATION": ["NEWER_T10_AND_ROLLBACK_VERIFIED",
                             "THREE_HOT_GENERATIONS", "OWNER_SIGNED_RETIRE"],
}


def object_birth_certificate(*, source_sha: str, build_id: str,
                             github_run_id: int, phase: str,
                             evidence_sha256: str, records: list[dict]) -> dict:
    """Pure bounded Factory producer classification; no filesystem or authority.

    BIRTH means a source-owner T5/T8/T10 event, not that independent cold
    recovery has been proved. Unknown identities remain visible HOLD.
    """
    if (type(source_sha) is not str or not HEX40.fullmatch(source_sha)
            or type(build_id) is not str or not BUILD.fullmatch(build_id)
            or type(github_run_id) is not int or github_run_id <= 0
            or phase not in BIRTH_PHASES or type(evidence_sha256) is not str
            or not HEX64.fullmatch(evidence_sha256)):
        raise RetentionHold("BIRTH_ORIGINAL_PRODUCER_IDENTITY")
    if not (type(records) is list
            and len(records) == len(BIRTH_CLASS[phase]) == 2
            and all(type(x) is dict for x in records)):
        raise RetentionHold("BIRTH_BOUNDED_TWO_ORIGINAL_OBJECTS")
    permitted = BIRTH_CLASS[phase]
    if {x.get("kind") for x in records} != permitted:
        raise RetentionHold("BIRTH_EXACT_FACTORY_PHASE_CLASSES")
    output = []
    for entry in sorted(records, key=lambda x: x["kind"]):
        if set(entry) != {"kind", "path", "expected_sha256", "identity",
                          "verified_source_sha256", "observed_at_utc",
                          "generation_source_sha", "generation_build_id"}:
            raise RetentionHold("BIRTH_RECORD_FIELDS")
        kind, path = entry["kind"], entry["path"]
        gen_source, gen_build = (entry["generation_source_sha"],
                                 entry["generation_build_id"])
        if (type(gen_source) is not str or not HEX40.fullmatch(gen_source)
                or type(gen_build) is not str or not BUILD.fullmatch(gen_build)):
            raise RetentionHold("BIRTH_OBJECT_GENERATION_IDENTITY")
        if (type(path) is not str or not 10 <= len(path) <= 384
                or not path.startswith("/") or ".." in path.split("/")
                or "\x00" in path or "\n" in path or "\r" in path):
            raise RetentionHold("BIRTH_ORIGINAL_PATH")
        if (kind.startswith("HEL1_") and not path.startswith((
                 "/home/tony/.aoe2war-b-os-", "/var/lib/aoe2war-web-prod-"))
                or kind.startswith("M1_") and
                not path.startswith("/Users/tonyblum/")):
            raise RetentionHold("BIRTH_ORIGINAL_SURFACE")
        expected = entry["expected_sha256"]
        if expected is not None and (
                type(expected) is not str or not HEX64.fullmatch(expected)):
            raise RetentionHold("BIRTH_EXPECTED_DIGEST")
        identity = entry["identity"]
        if identity is not None:
            keys = {"device", "inode", "logical_bytes", "allocated_bytes",
                    "uid", "mode", "nlink", "mtime_ns"}
            if (type(identity) is not dict or set(identity) != keys
                    or any(type(identity[k]) is not int or identity[k] < 0
                           for k in keys)
                    or identity["device"] == 0 or identity["inode"] == 0
                    or identity["nlink"] != 1 or identity["mode"] & 0o022):
                raise RetentionHold("BIRTH_FILE_IDENTITY")
        verified_sha = entry["verified_source_sha256"]
        if verified_sha is not None and (
                type(verified_sha) is not str or not HEX64.fullmatch(verified_sha)
                or expected != verified_sha):
            raise RetentionHold("BIRTH_PROOF_MISMATCH")
        observed = entry["observed_at_utc"]
        if observed is not None and (
                type(observed) is not str
                or not re.fullmatch(r"20[0-9]{2}-[0-9]{2}-[0-9]{2}T"
                                    r"[0-9]{2}:[0-9]{2}:[0-9]{2}"
                                    r"(?:\.[0-9]+)?Z", observed)):
            raise RetentionHold("BIRTH_OBSERVATION_CLOCK")
        object_id = sha(canonical({"source": source_sha, "run": github_run_id,
                                   "phase": phase, "kind": kind, "path": path,
                                   "object_source": gen_source,
                                   "object_build": gen_build}))
        status = ("VERIFIED_LOCAL_FILE_HOLD_RECOVERY"
                  if identity is not None and verified_sha is not None
                  else "UNCLASSIFIED_HOLD_MISSING_FILE_OR_RESTORE_EVIDENCE")
        output.append({
            "object_id": object_id, "copy_id": sha(canonical({
                "object": object_id, "identity": identity})),
            "kind": kind, "surface": BIRTH_SURFACES[kind],
            "path": path, "source_sha": source_sha, "build_id": build_id,
            "generation_source_sha": gen_source,
            "generation_build_id": gen_build,
            "run_id": github_run_id, "file_identity": identity,
            "expected_sha256": expected, "verified_source_sha256": verified_sha,
            "source_producer": "ORIGINAL_FACTORY_T5_T8_T10",
            "source_owner": "AOE2WAR_FACTORY",
            "consumer": BIRTH_PURPOSES[kind],
            "why_kept": BIRTH_PURPOSES[kind],
            "retention_floor": BIRTH_KEEP[kind],
            "review_due_utc": None, "retention_deadline_utc": None,
            "cold_destination": "INTEL_COLD_REVIEW_NOT_COPY_AUTHORIZED",
            "recovery_requirements": BIRTH_RECOVERY[kind],
            "independent_restore_receipt_sha256": None,
            "observed_at_utc": observed,
            "state": status, "next_action": (
                "SOURCE_VERIFY_MISSING_FILE_IDENTITY" if identity is None
                else "PROVE_COLD_COPY_FULL_RESTORE_THEN_HUMAN_L4_REVIEW"),
            "copy_authorized": False, "retire_authorized": False,
            "measured_physically_reclaimed_bytes": None,
        })
    result = {
        "schema": BIRTH_SCHEMA,
        "original_factory_stage": phase, "source_sha": source_sha,
        "build_id": build_id, "github_run_id": github_run_id,
        "original_stage_evidence_sha256": evidence_sha256,
        "records": output, "classified": len(output),
        "unknown_holds": sum(x["state"].startswith("UNCLASSIFIED_HOLD")
                             for x in output),
        "original_release_ledger_is_authority": True,
        "storage_mutation_authorized": False,
        "retirement_authorized": False,
    }
    result["canonical_sha256"] = sha(canonical(result))
    return result
