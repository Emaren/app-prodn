"""Synthetic adversarial packets: never real addresses, secrets or signatures."""
import copy
import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "review"))
from new_epoch_isolation_review import SCHEMA, ROLES, DIGESTS, examine, no_duplicate_keys, number

# Deliberately nonproduction synthetic bech32-shaped identifiers.
VAULT = "wolo1" + "q"*38
ESCROW = "wolo1" + "p"*38
OLD = "wolo1" + "r"*38
D = "a"*64

def clean():
    p = dict(schema=SCHEMA, chain_id="wolo-1", vault=VAULT, escrow=ESCROW,
        legacy_addresses=[OLD], legacy_signer_fingerprints_sha256=["b"*64],
        vault_signer_fingerprint_sha256="c"*64,
        writer_coverage={r:dict(vault_access="DENIED", escrow_access="DENIED", evidence_sha256=D) for r in ROLES},
        old_funded_estate_empty=True, old_funded_receipts_orphaned=False,
        legacy_replay_possible=False, owner_exclusive_custody=True, escrow_segregated=True,
        state_height=2345, commit_height=2346, first_eligible_tx_height=2346,
        bank_spendable_uwolo="5000", unique_confirmed_liabilities_uwolo="250",
        max_uncertain_liabilities_uwolo="200", gas_reserve_uwolo="20",
        operating_floor_uwolo="50", proposed_debit_uwolo="1", uncertainty_complete=True)
    p.update({key:D for key in DIGESTS})
    p.update(epoch_id="epoch_20261026_new", historical_epoch_ids=["epoch_20250819_old"],
             vault_keyring_lineage_sha256="c"*64,
             vault_credential_boundary_sha256=D,
             legacy_keyring_lineages_sha256=["6"*64],
             legacy_signing_policies_sha256=["7"*64],
             legacy_executor_fingerprints_sha256=["8"*64],
             legacy_approval_keys_sha256=["9"*64],
             legacy_credential_boundaries_sha256=["0"*63+"a"],
             escrow_bank_spendable_uwolo="10000", escrow_unique_liabilities_uwolo="200",
             escrow_max_uncertain_liabilities_uwolo="800",
             escrow_gas_reserve_uwolo="50", escrow_operating_floor_uwolo="100",
             escrow_proposed_debit_uwolo="1", escrow_uncertainty_complete=True,
             escrow_state_height=2345, escrow_commit_height=2346)
    p["escrow_authority"] = dict(
        epoch_id=p["epoch_id"], address=ESCROW, signer_pubkey_sha256="d"*64,
        signer_keyring_lineage_sha256="e"*64, credential_boundary_sha256="f"*64,
        signer_policy_sha256="1"*64, runtime_policy_sha256="1"*64,
        policy_version="aoe2war.new-escrow-policy.v1",
        return_executor_sha256="2"*64, settlement_executor_sha256="3"*64,
        return_approval_key_sha256="4"*64, settlement_approval_key_sha256="5"*64,
        return_sender=ESCROW, return_recipient=VAULT, settlement_sender=ESCROW,
        operations=["epoch_return","epoch_settlement"], legacy_writer_dependency=False,
        external_authority_complete=True, return_claims_new_epoch_only=True,
        settlement_entitlements_new_epoch_only=True, one_shot_replay_fenced=True)
    return p

class Review(unittest.TestCase):
    def assertHold(self, change, reason):
        p=clean(); change(p)
        result=examine(p)
        self.assertEqual(result["status"], "HOLD")
        self.assertIn(reason, result["reasons"])
        self.assertEqual(result["authority"], "NONE")

    def test_complete_structure_still_no_authority(self):
        p=clean(); self.assertEqual(examine(p), {"status":"REVIEW_ONLY_NONAUTHORIZING", "authority":"NONE", "reasons":["independent_authentication_required"]})
    def test_shared_escrow(self):self.assertHold(lambda p:p["legacy_addresses"].append(ESCROW),"escrow_shared_with_legacy")
    def test_shared_vault(self):self.assertHold(lambda p:p["legacy_addresses"].append(VAULT),"vault_reuses_legacy_account")
    def test_reused_key(self):self.assertHold(lambda p:p.update(vault_signer_fingerprint_sha256="b"*64),"vault_signer_key_reused")
    def test_missing_old_writer(self):self.assertHold(lambda p:p["writer_coverage"].pop("de_api"),"writer_category_coverage_incomplete")
    def test_de_escrow_access(self):self.assertHold(lambda p:p["writer_coverage"]["de_web"].update(escrow_access="UNKNOWN"),"writer_access_not_excluded:de_web")
    def test_unknown_direct_keyring(self):self.assertHold(lambda p:p["writer_coverage"]["direct_cli_keyrings"].update(vault_access="UNKNOWN"),"writer_access_not_excluded:direct_cli_keyrings")
    def test_old_funded_rows(self):self.assertHold(lambda p:p.update(old_funded_estate_empty=False),"hd_cold_start_unproved")
    def test_orphan_receipt(self):self.assertHold(lambda p:p.update(old_funded_receipts_orphaned=True),"historical_credit_orphan")
    def test_replay(self):self.assertHold(lambda p:p.update(legacy_replay_possible=True),"legacy_replay_possible")
    def test_no_exclusive_custody(self):self.assertHold(lambda p:p.update(owner_exclusive_custody=False),"exclusive_custody_not_witnessed")
    def test_escrow_without_partition(self):self.assertHold(lambda p:p.update(escrow_segregated=False),"escrow_not_segregated")
    def test_height_commit(self):self.assertHold(lambda p:p.update(commit_height=2345),"epoch_root_or_tx_height_mismatch")
    def test_preepoch_tx(self):self.assertHold(lambda p:p.update(first_eligible_tx_height=2345),"epoch_root_or_tx_height_mismatch")
    def test_snapshot_missing(self):self.assertHold(lambda p:p.update(hd_snapshot_sha256="0"*64),"bounded_evidence_digest_missing")
    def test_no_bounded_unknown(self):self.assertHold(lambda p:p.update(uncertainty_complete=False),"uncertain_upper_bound_not_proven")
    def test_null_unknown(self):self.assertHold(lambda p:p.update(max_uncertain_liabilities_uwolo=None),"amount_invalid:max_uncertain_liabilities_uwolo")
    def test_deficit(self):self.assertHold(lambda p:p.update(bank_spendable_uwolo="300"),"insufficient_spendable_assets")
    def test_gas_floor(self):self.assertHold(lambda p:p.update(gas_reserve_uwolo="0"),"fee_or_floor_missing")
    def test_no_legacy_inventory(self):self.assertHold(lambda p:p.update(legacy_addresses=[]),"legacy_address_inventory_incomplete")
    def test_escrow_new_address_old_signer(self):
        self.assertHold(lambda p:p["escrow_authority"].update(signer_pubkey_sha256="b"*64),"escrow_signing_key_reuses_legacy_or_vault")
    def test_escrow_reuses_vault_signer(self):
        self.assertHold(lambda p:p["escrow_authority"].update(signer_pubkey_sha256="c"*64),"escrow_signing_key_reuses_legacy_or_vault")
    def test_escrow_keyring_is_legacy(self):
        self.assertHold(lambda p:p["escrow_authority"].update(signer_keyring_lineage_sha256="6"*64),"escrow_keyring_reuses_legacy_or_vault")
    def test_escrow_keyring_shared_with_vault(self):
        self.assertHold(lambda p:p["escrow_authority"].update(signer_keyring_lineage_sha256="c"*64),"escrow_keyring_reuses_legacy_or_vault")
    def test_escrow_credential_boundary_shared(self):
        self.assertHold(lambda p:p["escrow_authority"].update(credential_boundary_sha256="0"*63+"a"),"escrow_credential_boundary_shared")
    def test_escrow_inherits_old_policy(self):
        self.assertHold(lambda p:p["escrow_authority"].update(signer_policy_sha256="7"*64,runtime_policy_sha256="7"*64),"escrow_signing_policy_inherited")
    def test_escrow_policy_drift(self):
        self.assertHold(lambda p:p["escrow_authority"].update(runtime_policy_sha256="a"*64),"escrow_policy_drift_or_version")
    def test_escrow_policy_version_wrong(self):
        self.assertHold(lambda p:p["escrow_authority"].update(policy_version="legacy-8092"),"escrow_policy_drift_or_version")
    def test_return_dependency_on_old_writer(self):
        self.assertHold(lambda p:p["escrow_authority"].update(legacy_writer_dependency=True),"escrow_return_depends_on_legacy_writer")
    def test_old_return_executor(self):
        self.assertHold(lambda p:p["escrow_authority"].update(return_executor_sha256="8"*64),"escrow_executor_inherited")
    def test_old_settlement_executor(self):
        self.assertHold(lambda p:p["escrow_authority"].update(settlement_executor_sha256="8"*64),"escrow_executor_inherited")
    def test_old_return_approval_key(self):
        self.assertHold(lambda p:p["escrow_authority"].update(return_approval_key_sha256="9"*64),"escrow_signing_key_reuses_legacy_or_vault")
    def test_shared_return_and_settlement_keys(self):
        self.assertHold(lambda p:p["escrow_authority"].update(settlement_approval_key_sha256="4"*64),"escrow_separation_of_duties_missing")
    def test_escrow_missing_external_authority(self):
        self.assertHold(lambda p:p["escrow_authority"].update(external_authority_complete=False),"unknown_escrow_external_authority")
    def test_escrow_missing_policy_identity(self):
        self.assertHold(lambda p:p.pop("escrow_authority"),"escrow_policy_identity_missing_or_extra")
    def test_escrow_unknown_field(self):
        self.assertHold(lambda p:p["escrow_authority"].update(secret="must_fail"),"escrow_policy_identity_missing_or_extra")
    def test_escrow_return_to_old_vault(self):
        self.assertHold(lambda p:p["escrow_authority"].update(return_recipient=OLD),"escrow_return_wrong_destination")
    def test_escrow_sender_old(self):
        self.assertHold(lambda p:p["escrow_authority"].update(return_sender=OLD),"escrow_sender_inherited_or_mismatched")
    def test_old_epoch_replay(self):
        self.assertHold(lambda p:p["historical_epoch_ids"].append(p["epoch_id"]),"epoch_id_replayed")
    def test_unknown_historical_epoch_inventory(self):
        self.assertHold(lambda p:p.update(historical_epoch_ids=[]),"historical_epoch_inventory_missing")
    def test_old_return_claim_entitlement(self):
        self.assertHold(lambda p:p["escrow_authority"].update(return_claims_new_epoch_only=False),"cross_epoch_entitlement_possible")
    def test_old_settlement_entitlement(self):
        self.assertHold(lambda p:p["escrow_authority"].update(settlement_entitlements_new_epoch_only=False),"cross_epoch_entitlement_possible")
    def test_unfenced_return_replay(self):
        self.assertHold(lambda p:p["escrow_authority"].update(one_shot_replay_fenced=False),"cross_epoch_escrow_replay_possible")
    def test_escrow_missing_gas(self):
        self.assertHold(lambda p:p.update(escrow_gas_reserve_uwolo="0"),"escrow_gas_or_floor_missing")
    def test_escrow_bank_shortfall_even_if_vault_rich(self):
        self.assertHold(lambda p:p.update(escrow_bank_spendable_uwolo="100"),"escrow_reserve_deficit")
    def test_escrow_unknown_max(self):
        self.assertHold(lambda p:p.update(escrow_max_uncertain_liabilities_uwolo=None),"escrow_amount_invalid:escrow_max_uncertain_liabilities_uwolo")
    def test_escrow_coverage_unknown(self):
        self.assertHold(lambda p:p.update(escrow_uncertainty_complete=False),"escrow_uncertain_upper_bound_missing")
    def test_escrow_bank_proof_missing(self):
        self.assertHold(lambda p:p.pop("escrow_native_bank_proof_sha256"),"bounded_evidence_digest_missing")
    def test_escrow_checkpoint_missing(self):
        self.assertHold(lambda p:p.update(escrow_independent_checkpoint_sha256="0"*64),"bounded_evidence_digest_missing")
    def test_escrow_bank_height_stale(self):
        self.assertHold(lambda p:p.update(escrow_state_height=2344),"escrow_authenticated_height_not_synchronized")
    def test_escrow_commit_height_bad(self):
        self.assertHold(lambda p:p.update(escrow_commit_height=2345),"escrow_authenticated_height_not_synchronized")
    def test_wrong_epoch_policy(self):
        self.assertHold(lambda p:p["escrow_authority"].update(epoch_id="another_20261026_new"),"escrow_policy_scope_mismatch")
    def test_scope_drift(self):
        self.assertHold(lambda p:p["escrow_authority"].update(operations=["epoch_return","legacy_payout"]),"escrow_operation_scope_incomplete")
    def test_vault_lineage_unwitnessed(self):
        self.assertHold(lambda p:p.update(vault_keyring_lineage_sha256=None),"vault_boundary_identity_missing:vault_keyring_lineage_sha256")
    def test_de_legacy_writer_unexcluded_even_with_distinct_keys(self):
        self.assertHold(lambda p:p["writer_coverage"]["de_api"].update(escrow_access="UNKNOWN"),"writer_access_not_excluded:de_api")
    def test_duplicate_json_keys(self):
        with self.assertRaises(ValueError):no_duplicate_keys([("height",1),("height",2)])
    def test_amount_scientific_rejected(self):
        with self.assertRaises(ValueError):number("1e6")
    def test_amount_overflow_rejected(self):
        with self.assertRaises(ValueError):number(str(1<<128))

if __name__ == "__main__":unittest.main()
