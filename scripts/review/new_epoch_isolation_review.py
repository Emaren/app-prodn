#!/usr/bin/env python3
"""Offline structural review for an *untrusted* new-WOLO-epoch evidence packet.

No network, no signing, no database, no filesystem mutation, no GO outcome.
Passing is REVIEW_ONLY and is NEVER proof of provenance, independent chain
finality, key isolation, custody availability, or activation authority.
"""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path

SCHEMA = "aoe2war.new-epoch-isolation-review.v1"
ROLES = frozenset({
    "hd_web", "hd_api", "de_web", "de_api", "legacy_primary_8092",
    "legacy_founder_8093", "staking_faucet", "replay_callbacks",
    "cron_user_units", "systemd_timers", "containers_hasura",
    "direct_cli_keyrings", "external_signers", "proxy_ingress",
})
SHA = re.compile(r"[a-f0-9]{64}\Z")
WALLET = re.compile(r"wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}\Z")
INT = re.compile(r"(?:0|[1-9][0-9]*)\Z")
MAX = (1 << 128) - 1
DIGESTS = (
    "trusted_header_checkpoint_sha256", "native_bank_proof_sha256",
    "hd_snapshot_sha256", "de_snapshot_sha256", "legacy_journals_sha256",
    "entitlement_nonoverlap_witness_sha256", "vault_key_exclusion_witness_sha256",
    "signer_lease_receipt_sha256", "durable_offhost_nonce_receipt_sha256",
    "epoch_manifest_sha256", "quiesced_restore_witness_sha256",
    "gas_model_witness_sha256", "escrow_scope_witness_sha256",
)


def no_duplicate_keys(pairs):
    result = {}
    for k, v in pairs:
        if k in result:
            raise ValueError("duplicate_json_key")
        result[k] = v
    return result


def number(x):
    if not isinstance(x, str) or not INT.fullmatch(x):
        raise ValueError("noncanonical_uwolo")
    v = int(x)
    if v > MAX:
        raise ValueError("uwolo_overflow")
    return v


def examine(p):
    """Return evidence *structure* result; never returns money movement GO."""
    problems = []
    def reject(code):
        if code not in problems:
            problems.append(code)
    if type(p) is not dict or p.get("schema") != SCHEMA or p.get("chain_id") != "wolo-1":
        return {"status": "HOLD", "authority": "NONE", "reasons": ["schema_or_chain"]}
    vault, escrow = p.get("vault"), p.get("escrow")
    if not isinstance(vault, str) or not WALLET.fullmatch(vault):
        reject("vault_invalid")
    if not isinstance(escrow, str) or not WALLET.fullmatch(escrow):
        reject("escrow_invalid")
    if vault == escrow:
        reject("vault_equals_escrow")
    legacy_addresses = p.get("legacy_addresses")
    if not isinstance(legacy_addresses, list) or not legacy_addresses or any(
            not isinstance(a, str) or not WALLET.fullmatch(a) for a in legacy_addresses):
        reject("legacy_address_inventory_incomplete")
    else:
        if vault in legacy_addresses:
            reject("vault_reuses_legacy_account")
        if escrow in legacy_addresses:
            reject("escrow_shared_with_legacy")
    fingerprints = p.get("legacy_signer_fingerprints_sha256")
    vault_fp = p.get("vault_signer_fingerprint_sha256")
    if not isinstance(fingerprints, list) or not fingerprints or any(
            not isinstance(k, str) or not SHA.fullmatch(k) for k in fingerprints):
        reject("legacy_signer_inventory_incomplete")
    if not isinstance(vault_fp, str) or not SHA.fullmatch(vault_fp):
        reject("vault_signer_identity_missing")
    elif isinstance(fingerprints, list) and vault_fp in fingerprints:
        reject("vault_signer_key_reused")
    if any(not isinstance(p.get(k), str) or not SHA.fullmatch(p[k]) or p[k] == "0"*64 for k in DIGESTS):
        reject("bounded_evidence_digest_missing")
    observations = p.get("writer_coverage")
    if not isinstance(observations, dict) or set(observations) != ROLES:
        reject("writer_category_coverage_incomplete")
    else:
        for role, v in observations.items():
            if type(v) is not dict or v.get("vault_access") != "DENIED" or v.get("escrow_access") != "DENIED" or not isinstance(v.get("evidence_sha256"), str) or not SHA.fullmatch(v["evidence_sha256"]):
                reject("writer_access_not_excluded:" + role)
    if p.get("old_funded_estate_empty") is not True:
        reject("hd_cold_start_unproved")
    if p.get("old_funded_receipts_orphaned") is not False:
        reject("historical_credit_orphan")
    if p.get("legacy_replay_possible") is not False:
        reject("legacy_replay_possible")
    if p.get("owner_exclusive_custody") is not True:
        reject("exclusive_custody_not_witnessed")
    if p.get("escrow_segregated") is not True:
        reject("escrow_not_segregated")
    h, ch, txh = p.get("state_height"), p.get("commit_height"), p.get("first_eligible_tx_height")
    if any(type(v) is not int or v <= 0 or v > 2**63-2 for v in (h, ch, txh)):
        reject("chain_height_invalid")
    elif ch != h + 1 or txh <= h:
        reject("epoch_root_or_tx_height_mismatch")
    vals = {}
    for k in ("bank_spendable_uwolo", "unique_confirmed_liabilities_uwolo", "max_uncertain_liabilities_uwolo", "gas_reserve_uwolo", "operating_floor_uwolo", "proposed_debit_uwolo"):
        try:
            vals[k] = number(p.get(k))
        except (ValueError, TypeError):
            reject("amount_invalid:" + k)
    if len(vals) == 6:
        if vals["gas_reserve_uwolo"] <= 0 or vals["operating_floor_uwolo"] <= 0:
            reject("fee_or_floor_missing")
        if p.get("uncertainty_complete") is not True:
            reject("uncertain_upper_bound_not_proven")
        needed = sum(vals[k] for k in vals if k != "bank_spendable_uwolo")
        if needed > vals["bank_spendable_uwolo"]:
            reject("insufficient_spendable_assets")
    if not problems:
        # Structural checks DO NOT authenticate supplied booleans, digests or chain data.
        return {"status": "REVIEW_ONLY_NONAUTHORIZING", "authority": "NONE", "reasons": ["independent_authentication_required"]}
    return {"status": "HOLD", "authority": "NONE", "reasons": sorted(problems)}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("packet", type=Path, help="Local redacted evidence packet (no credentials)")
    a = ap.parse_args()
    try:
        if not a.packet.is_file() or a.packet.stat().st_size > 128*1024:
            raise ValueError("packet_missing_or_oversized")
        packet = json.loads(a.packet.read_text(encoding="utf-8"), object_pairs_hook=no_duplicate_keys)
        result = examine(packet)
    except (ValueError, OSError, UnicodeError, json.JSONDecodeError) as exc:
        result = {"status": "HOLD", "authority": "NONE", "reasons": [type(exc).__name__]}
    print(json.dumps(result, sort_keys=True))
    return 3  # Intentionally never exit 0 to prevent use as an activation gate.


if __name__ == "__main__":
    raise SystemExit(main())
