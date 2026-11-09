from pathlib import Path
import unittest
R=Path(__file__).resolve().parents[1]
class PublicLive(unittest.TestCase):
 def test_bounded_approved_projection_only(self):
  s=(R/'app/api/bets/public-live/route.ts').read_text()
  self.assertEqual(s.count('FROM aoe2war_public_v9.published_markets AS m'),1)
  self.assertEqual(s.count('$queryRaw<'),1)
  self.assertIn('m."publicIntegrityEligible" IS TRUE',s)
  self.assertIn("m.status IN ('open', 'live', 'closing', 'awaiting_final_proof')",s)
  self.assertIn('LIMIT 48',s)
  self.assertNotIn('SELECT *',s)
  for bad in ('pending_wolo_claims','bet_markets','bet_wagers','bet_stake_intents','8092','8093','8094','8095','$executeRaw','$transaction'):
   self.assertNotIn(bad,s)
 def test_empty_is_distinct_from_denial_and_no_credit(self):
  s=(R/'app/api/bets/public-live/route.ts').read_text()
  for t in ('NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS','HOLD_APPROVED_PUBLIC_MARKET_VIEW_UNAVAILABLE',
            'status: 503','financialExecutionAuthorized: false','bettingPermitted: false',
            'actualLiquidityProven: false','onchainPaymentFinalityVerified: false'):
   self.assertIn(t,s)
  self.assertNotIn('export async function POST',s)
 def test_original_history_unchanged(self):
  s=(R/'app/api/bets/public-history/route.ts').read_text()
  self.assertIn('PUBLIC_HISTORY_READ_ONLY_FINANCIAL_HOLD',s)
  self.assertIn('publicLivePreview',s)
if __name__=='__main__': unittest.main()
