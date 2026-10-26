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

SCHEMA = "aoe2war.new-epoch-isolation-review.v2"
ROLES = frozenset({
    "hd_web", "hd_api", "de_web", "de_api", "legacy_primary_8092",
    "legacy_founder_8093", "staking_faucet", "replay_callbacks",
    "cron_user_units", "systemd_timers", "containers_hasura",
    "direct_cli_keyrings", "external_signers", "proxy_ingress",
})
SHA = re.compile(r"[a-f0-9]{64}\Z")
WALLET = re.compile(r"wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}\Z")
INT = re.compile(r"(?:0|[1-9][0-9]*)\Z")
EPOCH = re.compile(r"[A-Za-z0-9_-]{12,80}\Z")
MAX = (1 << 128) - 1
DIGESTS = (
    "trusted_header_checkpoint_sha256", "native_bank_proof_sha256",
    "hd_snapshot_sha256", "de_snapshot_sha256", "legacy_journals_sha256",
    "entitlement_nonoverlap_witness_sha256", "vault_key_exclusion_witness_sha256",
    "signer_lease_receipt_sha256", "durable_offhost_nonce_receipt_sha256",
    "epoch_manifest_sha256", "quiesced_restore_witness_sha256",
    "gas_model_witness_sha256", "escrow_scope_witness_sha256",
    "escrow_address_pubkey_proof_sha256", "escrow_policy_witness_sha256",
    "escrow_ledger_replay_exclusion_sha256", "escrow_keyring_acl_witness_sha256",
)



# A v2 review demands separate *claimed* escrow signer and policy identities.
# Digests and boolean witness fields are NOT evidence authentication or custody grants.
ESCROW_AUTHORITY_FIELDS = frozenset({
    "epoch_id", "address", "signer_pubkey_sha256", "signer_keyring_lineage_sha256",
    "credential_boundary_sha256", "signer_policy_sha256", "runtime_policy_sha256",
    "policy_version", "return_executor_sha256", "settlement_executor_sha256",
    "return_approval_key_sha256", "settlement_approval_key_sha256",
    "return_sender", "return_recipient", "settlement_sender", "operations",
    "legacy_writer_dependency", "external_authority_complete",
    "return_claims_new_epoch_only", "settlement_entitlements_new_epoch_only",
    "one_shot_replay_fenced",
})
ESCROW_DIGESTS = (
    "signer_pubkey_sha256", "signer_keyring_lineage_sha256",
    "credential_boundary_sha256", "signer_policy_sha256", "runtime_policy_sha256",
    "return_executor_sha256", "settlement_executor_sha256",
    "return_approval_key_sha256", "settlement_approval_key_sha256",
)
LEGACY_IDENTITY_FAMILIES = (
    "legacy_signer_fingerprints_sha256", "legacy_keyring_lineages_sha256",
    "legacy_signing_policies_sha256", "legacy_executor_fingerprints_sha256",
    "legacy_approval_keys_sha256", "legacy_credential_boundaries_sha256",
)


def escrow_authority_issues(p, reject):
    """Structural cross-domain conflicts; actual cryptographic witness still required."""
    epoch = p.get("epoch_id")
    if not isinstance(epoch, str) or not EPOCH.fullmatch(epoch):
        reject("epoch_id_missing_or_invalid")
    old_epochs = p.get("historical_epoch_ids")
    if not isinstance(old_epochs, list) or any(
        not isinstance(x, str) or not EPOCH.fullmatch(x) for x in old_epochs
    ) or len(old_epochs) != len(set(old_epochs)) or not old_epochs:
        reject("historical_epoch_inventory_missing")
    elif epoch in old_epochs:
        reject("epoch_id_replayed")
    ids = {}
    for family in LEGACY_IDENTITY_FAMILIES:
        values = p.get(family)
        if not isinstance(values, list) or not values or any(
                not isinstance(v, str) or not SHA.fullmatch(v) or v == "0"*64 for v in values
        ) or len(values) != len(set(values)):
            reject("legacy_authority_inventory_missing:" + family)
            continue
        ids[family] = set(values)
    a = p.get("escrow_authority")
    if type(a) is not dict or set(a) != ESCROW_AUTHORITY_FIELDS:
        reject("escrow_policy_identity_missing_or_extra")
        return
    if a.get("address") != p.get("escrow") or a.get("epoch_id") != epoch:
        reject("escrow_policy_scope_mismatch")
    for field in ESCROW_DIGESTS:
        value = a.get(field)
        if not isinstance(value, str) or not SHA.fullmatch(value) or value == "0"*64:
            reject("escrow_authority_digest_missing:" + field)
    vault_lineage = p.get("vault_keyring_lineage_sha256")
    vault_credential = p.get("vault_credential_boundary_sha256")
    for name, v in (("vault_keyring_lineage_sha256", vault_lineage),
                    ("vault_credential_boundary_sha256", vault_credential)):
        if not isinstance(v, str) or not SHA.fullmatch(v) or v == "0"*64:
            reject("vault_boundary_identity_missing:" + name)
    distinct = [
        a.get("signer_pubkey_sha256"), a.get("signer_keyring_lineage_sha256"),
        a.get("credential_boundary_sha256"), a.get("signer_policy_sha256"),
        a.get("return_executor_sha256"), a.get("settlement_executor_sha256"),
        a.get("return_approval_key_sha256"), a.get("settlement_approval_key_sha256"),
    ]
    if all(isinstance(v, str) and SHA.fullmatch(v) for v in distinct):
        if len(set(distinct)) != len(distinct):
            reject("escrow_separation_of_duties_missing")
    for value in [a.get("signer_pubkey_sha256"), a.get("return_approval_key_sha256"),
                  a.get("settlement_approval_key_sha256")]:
        if isinstance(value, str) and (value in ids.get("legacy_signer_fingerprints_sha256", set())
            or value in ids.get("legacy_approval_keys_sha256", set())
            or value == p.get("vault_signer_fingerprint_sha256")):
            reject("escrow_signing_key_reuses_legacy_or_vault")
    for field, family, vault_identity, code in [
        ("signer_keyring_lineage_sha256", "legacy_keyring_lineages_sha256", vault_lineage,
         "escrow_keyring_reuses_legacy_or_vault"),
        ("credential_boundary_sha256", "legacy_credential_boundaries_sha256", vault_credential,
         "escrow_credential_boundary_shared"),
        ("signer_policy_sha256", "legacy_signing_policies_sha256", None,
         "escrow_signing_policy_inherited"),
        ("return_executor_sha256", "legacy_executor_fingerprints_sha256", None,
         "escrow_executor_inherited"),
        ("settlement_executor_sha256", "legacy_executor_fingerprints_sha256", None,
         "escrow_executor_inherited"),
    ]:
        value = a.get(field)
        if isinstance(value, str) and (value in ids.get(family, set())
                                      or (vault_identity is not None and value == vault_identity)):
            reject(code)
    if a.get("runtime_policy_sha256") != a.get("signer_policy_sha256") or a.get("policy_version") != "aoe2war.new-escrow-policy.v1":
        reject("escrow_policy_drift_or_version")
    if a.get("operations") != ["epoch_return", "epoch_settlement"]:
        reject("escrow_operation_scope_incomplete")
    if a.get("return_sender") != p.get("escrow") or a.get("settlement_sender") != p.get("escrow"):
        reject("escrow_sender_inherited_or_mismatched")
    if a.get("return_recipient") != p.get("vault"):
        reject("escrow_return_wrong_destination")
    if a.get("legacy_writer_dependency") is not False:
        reject("escrow_return_depends_on_legacy_writer")
    if a.get("external_authority_complete") is not True:
        reject("unknown_escrow_external_authority")
    if a.get("return_claims_new_epoch_only") is not True or a.get("settlement_entitlements_new_epoch_only") is not True:
        reject("cross_epoch_entitlement_possible")
    if a.get("one_shot_replay_fenced") is not True:
        reject("cross_epoch_escrow_replay_possible")


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
    escrow_authority_issues(p, reject)
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
    # An escrow is a separate financial reserve domain: NEVER net vault surplus
    # against unverified escrow deficits, or count one account's assets twice.
    escrow_vals = {}
    for k in ("escrow_bank_spendable_uwolo", "escrow_unique_liabilities_uwolo",
              "escrow_max_uncertain_liabilities_uwolo", "escrow_gas_reserve_uwolo",
              "escrow_operating_floor_uwolo", "escrow_proposed_debit_uwolo"):
        try:
            escrow_vals[k] = number(p.get(k))
        except (ValueError, TypeError):
            reject("escrow_amount_invalid:" + k)
    if len(escrow_vals) == 6:
        if escrow_vals["escrow_gas_reserve_uwolo"] <= 0 or escrow_vals["escrow_operating_floor_uwolo"] <= 0:
            reject("escrow_gas_or_floor_missing")
        if sum(v for k, v in escrow_vals.items() if k != "escrow_bank_spendable_uwolo") > escrow_vals["escrow_bank_spendable_uwolo"]:
            reject("escrow_reserve_deficit")
    if p.get("escrow_uncertainty_complete") is not True:
        reject("escrow_uncertain_upper_bound_missing")
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
