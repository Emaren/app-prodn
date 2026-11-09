"""C03: add approved v9 public active preview without changing frozen route count."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
API=ROOT/'app/api/bets/public-history/route.ts'
UI=ROOT/'components/bets/PublishedBetHistoryFallback.tsx'
HALL=ROOT/'app/bets/page.tsx'
EXISTING=ROOT/'app/api/bets/route.ts'

class ExistingEndpointCurrentPreviewContract(unittest.TestCase):
 def test_only_existing_bounded_sql_get_and_no_new_route(self):
  source=API.read_text()
  self.assertEqual(len(re.findall(r'export async function GET\s*\(',source)),1)
  self.assertNotRegex(source,r'export async function (POST|PUT|PATCH|DELETE)\s*\(')
  self.assertEqual(source.count('$queryRaw<'),2)
  self.assertEqual(source.count('FROM aoe2war_public_v9.published_markets AS m'),2)
  self.assertEqual(source.count('LIMIT 48'),2)
  self.assertIn('m."publicIntegrityEligible" IS TRUE',source)
  self.assertIn("m.status IN ('open', 'live', 'closing', 'awaiting_final_proof')",source)
  self.assertIn('ORDER BY m.featured DESC',source)
  self.assertTrue((ROOT/'app/api/bets/public-live/route.ts').exists())
  self.assertFalse((ROOT/'components/bets/PublishedLiveMarketPreview.tsx').exists())
  self.assertNotIn('SELECT *',source)
  for forbidden in ('pending_wolo_claims','bet_wagers','bet_markets','bet_stake_intents','user_id',
                    'walletAddress','payoutTxHash','stakeTxHash','claimKind','payoutProofUrl',
                    'JOIN ', 'GROUP BY','ensureBetMarkets','loadBetBoardSnapshot',
                    '$executeRaw','$transaction','fetch(','8092','8093','8094','8095'):
   self.assertNotIn(forbidden,source)
 def test_empty_census_distinct_from_missing_projection(self):
  s=API.read_text()
  self.assertIn('activePublished.length === 0',s)
  self.assertIn('"NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS" : null',s)
  self.assertIn('status: "HOLD_PUBLIC_HISTORY_READMODEL_UNAVAILABLE"',s)
  self.assertIn('{ status: 503, headers: NO_STORE_HEADERS }',s)
  self.assertIn('export const dynamic = "force-dynamic"',s)
  self.assertIn('"Cache-Control": "private, no-store',s)
  self.assertIn('"X-Content-Type-Options": "nosniff"',s)
 def test_public_preview_has_no_payout_or_real_liquidity_claim(self):
  s=API.read_text()
  self.assertIn('source: "aoe2war_public_v9.published_markets"',s)
  self.assertIn('publicIntegrityRequired: true',s)
  for flag in ('financialExecutionAuthorized','acceptingWagers','approvingPayouts',
               'onchainPaymentFinalityVerified','personalWagersIncluded',
               'actualLiquidityProven','completeMarketCensus'):
   self.assertIn(flag+': false',s)
  self.assertIn('bettingPermitted: false',s)
  for unexpected in ('totalPotWolo','seedLeftWolo','seedRightWolo'):
   self.assertNotIn(unexpected,s)
 def test_current_ui_requires_all_false_flags_and_shows_no_stake(self):
  s=UI.read_text()
  self.assertIn('function isPublicLivePreview(input: unknown)',s)
  for flag in ('financialExecutionAuthorized','acceptingWagers','approvingPayouts',
               'onchainPaymentFinalityVerified','personalWagersIncluded',
               'actualLiquidityProven','completeMarketCensus','bettingPermitted'):
   self.assertIn(flag,s)
  self.assertIn('v.markets.length > 48',s)
  self.assertIn('NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS',s)
  self.assertIn('!isPublicLivePreview(v.publicLivePreview)',s)
  self.assertIn('No wagers accepted',s)
  for bad in ('placeWager(', 'submitStake(', 'sendTransaction('):
   self.assertNotIn(bad,s)
 def test_history_is_preserved_and_page_unchanged(self):
  s=UI.read_text()
  self.assertIn('Recorded market history',s)
  self.assertIn('Public war archives',s)
  self.assertIn('Public market outlook',s)
  self.assertLess(s.index('Public market outlook'),s.index('Public war archives'))
  hall=HALL.read_text()
  self.assertIn('if (!loadingBoard && board === null)',hall)
  self.assertIn('<PublishedBetHistoryFallback />',hall)
  self.assertNotIn('PublishedLiveMarketPreview',hall)
 def test_full_betting_api_still_not_spoofed_as_functional(self):
  s=EXISTING.read_text()
  self.assertIn('loadBetBoardSnapshot(prisma, sessionUid',s)
  self.assertIn('isRestrictedBetsReadDenied(error)',s)
  self.assertIn('status: 503',s)
  self.assertNotIn('public-live',s)

if __name__=='__main__':unittest.main()
