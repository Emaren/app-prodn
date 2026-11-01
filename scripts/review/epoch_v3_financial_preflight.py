#!/usr/bin/env python3
"""Held financial epoch v3 preflight. Source PASS cannot authorize real funds."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "prisma/migrations/20261027023000_epoch_v3_held_financial_ledger/migration.sql"
MANIFEST = ROOT / "scripts/review/epoch_v3_release_dependencies.json"

REQUIRED: dict[str, tuple[str, str, str, str]] = {
    "BANK_PROOF_STALE": ("Codex/Wolo", "authenticated Comet H/H+1 escrow+vault roots", "Obtain fresh independent native proofs; do not relax freshness", "vault+escrow"),
    "NEW_ESCROW_SIGNER_ABSENT": ("Codex/Wolo", "native woloescrowd signer/actor/keyring lease", "Implement independently owned signer and off-host nonce", "escrow"),
    "TICKET_ALLOCATION_EXCEEDS_FUNDING": ("Codex/Wolo + HD", "native original ticket MsgSend plus allocation ledger", "Conserve all market legs against one proven physical source", "ticket"),
    "PHYSICAL_RECEIPT_ALREADY_CONSUMED": ("HD Finance", "unique DB chain_id/tx_hash/msg-index across all financial ingress", "Quarantine collision; reconcile original source, never replay", "receipts"),
    "ESCROW_RESERVE_DEFICIT": ("HD/DE Finance + Codex", "independent account-local bank proof and complete bounded liabilities", "Preserve uncertainty and fund/resolve deficits independently", "escrow"),
    "WRITER_EXCLUSION_INCOMPLETE": ("Owner/HEL1", "complete old 8092/8093/DE/cron/CLI/external writer evidence", "Prove exclusion of each direct and indirect signer", "both"),
    "UNKNOWN_NO_REPLAY": ("Codex/Wolo + HD", "append-only signed attempt ledger and native physical lookup", "No resends after unknown; authenticate original effect or hold", "operation"),
    "OWNER_PERMIT_MISSING": ("Central Command", "genuine owner-signed transaction-specific permit and off-host nonce", "Obtain real per-operation authorization, not synthetic signatures", "owner"),
    "LEDGER_ATOMICITY_UNPROVEN": ("HD Finance", "isolated PG chronology, SERIALIZABLE races, signed proof-ingest issuer", "Qualify atomic test receipts and role fencing before DB integration", "postgres"),
}
def entry(code: str, *, epoch: str | None = None, op: str | None = None,
          state: str = "UNKNOWN", when: str | None = None) -> dict[str, Any]:
    owner, source, action, domain = REQUIRED[code]
    return {
        "code": code, "state": state, "severity": "BLOCKER", "domain": domain,
        "cause": "Trusted runtime evidence is absent or independently unverified",
        "evidence_source": source, "evidence_timestamp": when,
        "epoch_id": epoch, "operation_id": op,
        "retry_safe": False, "owner": owner, "next_permitted_operation": action,
        "production_admission": "HOLD",
    }
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--expected-migration-sha256")
    parser.add_argument("--epoch")
    parser.add_argument("--operation")
    args = parser.parse_args()
    migration_exists = MIGRATION.is_file()
    actual_sha = hashlib.sha256(MIGRATION.read_bytes()).hexdigest() if migration_exists else None
    source_ok = bool(migration_exists and (not args.expected_migration_sha256 or
        actual_sha == args.expected_migration_sha256))
    manifest_ok = MANIFEST.is_file()
    if manifest_ok:
        try:
            m = json.loads(MANIFEST.read_text())
            manifest_ok = m.get("status") == "HELD_SOURCE_CANDIDATE_NOT_FINANCIAL_AUTHORITY"
        except (OSError, ValueError):
            manifest_ok = False
    paths = [
        ROOT / "lib/warSatchelEpochV3GoWire.ts",
        ROOT / "lib/warSatchelEpochV3TicketFunding.ts",
        ROOT / "lib/warSatchelEpochV3Durability.ts",
        ROOT / "lib/warSatchelEpochV3ReleaseGate.ts",
    ]
    sources_ok = all(f.is_file() for f in paths)
    checks = [
        {"code": "MIGRATION_SOURCE_INTACT", "state": "PASS" if source_ok else "HOLD",
         "observed_sha256": actual_sha},
        {"code": "INTEGRATION_MANIFEST", "state": "PASS" if manifest_ok else "HOLD"},
        {"code": "INERT_HD_SOURCE_PRESENT", "state": "PASS" if sources_ok else "HOLD"},
    ]
    result = {
        "schema": "aoe2war.epoch-v3.financial-preflight.v1",
        "status": "HOLD",
        "source_checks": checks,
        "native_bank_authenticated": False,
        "escrow_signing_authorized": False,
        "postgres_runtime_writer_enrolled": False,
        "physical_replay_excluded": False,
        "owner_permit_verified": False,
        "mainnet_money_go": False,
        "findings": [entry(code, epoch=args.epoch, op=args.operation)
                     for code in REQUIRED],
        "note": "Source checks are not bank, signer, HD+DE census, rollback or owner proof. "
                "No synthetic JSON input can unlock production in this source-only preflight.",
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 2

if __name__ == "__main__":
    raise SystemExit(main())
