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
    def test_duplicate_json_keys(self):
        with self.assertRaises(ValueError):no_duplicate_keys([("height",1),("height",2)])
    def test_amount_scientific_rejected(self):
        with self.assertRaises(ValueError):number("1e6")
    def test_amount_overflow_rejected(self):
        with self.assertRaises(ValueError):number(str(1<<128))

if __name__ == "__main__":unittest.main()
