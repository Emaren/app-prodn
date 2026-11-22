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
    "fallback_3030": "PROTECT_ORIGINAL_RESCUE_WORKDIR",
    "emergency_3033": "PROTECT_ORIGINAL_RECOVERY_WORKDIR",
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
    if type(ledger_raw) is not bytes or not 20 <= len(ledger_raw) <= 2_000_000:
        raise RetentionHold("T10_LEDGER_BUDGET")
    try:
        events = [json.loads(line) for line in ledger_raw.splitlines()]
    except ValueError:
        raise RetentionHold("T10_LEDGER_PARSE") from None
    if not (1 <= len(events) <= 512 and
            events[-1].get("event") == "T10" and
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
    exact_first = (source_sha == "9cf670724c82e29861e539c03c4d3165893da8f3"
                   and previous_source == "50b943a44a2e89deaee7b12acaf87d8567898b3f")
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
