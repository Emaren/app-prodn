"""Static cross-repo finance handoff checks: never credit a native UNKNOWN."""
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
RT=(ROOT/"lib/warSatchelClaimReturnRuntime.ts").read_text()
ADAPTER=(ROOT/"lib/woloBetSettlement.ts").read_text()
RESERVE=(ROOT/"lib/warSatchelClaimReturnReserve.ts").read_text()

class NativeReturnContract(unittest.TestCase):
    def test_execute_passes_signed_approval_not_legacy_run(self):
        self.assertIn("executeServiceOnlySatchelEscrowReturn(e.approval,cfg.escrow,reader)",RT)
        self.assertNotIn("executeServiceOnlySatchelEscrowReturn(run,cfg.escrow,reader)",RT)
        self.assertIn('SATCHEL_RETURN_ENDPOINT+"/execute"',ADAPTER)
        self.assertIn('method:"POST"',ADAPTER)
        self.assertIn("return withHdFinancialLease(",ADAPTER)

    def test_recovery_is_read_only_and_does_not_retry(self):
        self.assertIn("inspectServiceOnlySatchelEscrowReturn(String(claimId),reader)",RT)
        self.assertIn('SATCHEL_RETURN_ENDPOINT+"/execution/"',ADAPTER)
        self.assertIn('method:"GET"',ADAPTER)
        self.assertNotIn("inspection.found",RT)
        self.assertNotIn("inspection.record",RT)
        self.assertNotIn("inspection.settlement_run_id",RT)

    def test_unknown_cannot_credit_without_native_proof(self):
        self.assertIn("satchelEscrowReturnSpendObservation(value,claimId)",RT)
        self.assertIn('observed.operation_id!==run.settlement_run_id',RT)
        self.assertIn("!observed.tx_hash",RT)
        self.assertIn("if(!txHash)return unknown(prisma,claimId)",RT)
        self.assertIn("authenticateSatchelClaimReturn(expected,reader)",RT)
        self.assertIn("authenticatedWarSatchelClaimReturnFreshAt(proof)",RT)
        self.assertIn("creditVerifiedSatchelClaimReturn",RT)

    def test_reserve_hard_hold_cannot_be_bypassed(self):
        self.assertIn('refuse("native_execution_inventory_verifier_unavailable")',RESERVE)
        self.assertIn("assertCurrentSatchelReturnReserve(e,r.reserveReviewJson,bank)",RT)
        self.assertNotIn('http://127.0.0.1:8092',RT)
        self.assertIn('SATCHEL_RETURN_ENDPOINT="http://127.0.0.1:8094',ADAPTER)

if __name__=="__main__":
    unittest.main()
