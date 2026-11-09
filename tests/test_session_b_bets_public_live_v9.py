"""C03 existing v9 view: actual public live-market preview, never wallet access."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
API=ROOT/'app/api/bets/public-live/route.ts'
UI=ROOT/'components/bets/PublishedLiveMarketPreview.tsx'
HALL=ROOT/'app/bets/page.tsx'
EXISTING=ROOT/'app/api/bets/route.ts'

class PublishedLiveExistingV9Contract(unittest.TestCase):
 def test_only_bounded_sql_get_on_existing_approved_view(self):
  source=API.read_text()
  self.assertEqual(len(re.findall(r'export async function GET\s*\(',source)),1)
  self.assertNotRegex(source,r'export async function (POST|PUT|PATCH|DELETE)\s*\(')
  self.assertEqual(source.count('$queryRaw<'),1)
  self.assertEqual(source.count('FROM aoe2war_public_v9.published_markets AS m'),1)
  self.assertIn('m."publicIntegrityEligible" IS TRUE',source)
  self.assertIn("m.status IN ('open', 'live', 'closing', 'awaiting_final_proof')",source)
  self.assertIn('ORDER BY m.featured DESC',source)
  self.assertIn('LIMIT 48',source)
  self.assertNotIn('SELECT *',source)
  for forbidden in ('pending_wolo_claims','bet_wagers','bet_markets','bet_stake_intents','user_id',
                    'walletAddress','payoutTxHash','stakeTxHash','claimKind','payoutProofUrl',
                    'JOIN ', 'GROUP BY','ensureBetMarkets','loadBetBoardSnapshot',
                    '$executeRaw','$transaction','fetch(','8092','8093','8094','8095'):
   self.assertNotIn(forbidden,source)
 def test_empty_census_is_not_missing_projection(self):
  s=API.read_text()
  self.assertIn('markets.length === 0 ? "NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS" : null',s)
  self.assertIn('status: "HOLD_APPROVED_PUBLIC_MARKET_VIEW_UNAVAILABLE"',s)
  self.assertIn('{ status: 503, headers: NO_STORE_HEADERS }',s)
  self.assertIn('export const dynamic = "force-dynamic"',s)
  self.assertIn('"Cache-Control": "private, no-store',s)
  self.assertIn('"X-Content-Type-Options": "nosniff"',s)
  self.assertIn('Vary: "Cookie"',s)
 def test_public_preview_never_claims_escrow_or_actual_liquidity(self):
  s=API.read_text()
  self.assertIn('source: "aoe2war_public_v9.published_markets"',s)
  self.assertIn('publicIntegrityRequired: true',s)
  for flag in ('financialExecutionAuthorized','acceptingWagers','approvingPayouts',
               'onchainPaymentFinalityVerified','personalWagersIncluded',
               'actualLiquidityProven','completeMarketCensus'):
   self.assertIn(flag+': false',s)
  self.assertIn('bettingPermitted: false',s)
  self.assertNotIn('totalPotWolo',s)
  self.assertNotIn('seedLeftWolo',s)
  self.assertNotIn('seedRightWolo',s)
 def test_ui_requires_exact_false_flags_and_no_stake_controls(self):
  s=UI.read_text()
  self.assertIn('function isPublicMarketPreview(input: unknown)',s)
  for flag in ('financialExecutionAuthorized','acceptingWagers','approvingPayouts',
               'onchainPaymentFinalityVerified','personalWagersIncluded',
               'actualLiquidityProven','completeMarketCensus','bettingPermitted'):
   self.assertIn(flag,s)
  self.assertIn('v.markets.length > 48',s)
  self.assertIn('NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS',s)
  for bad in ('placeWager(', 'submitStake(', 'sendTransaction(', 'walletAddress',
              'txHash','settlementRequest','fundedExecution'):
   self.assertNotIn(bad,s)
  self.assertIn('No wagers accepted',s)
  self.assertIn('No market or balance has been inferred',s)
 def test_only_existing_finance_held_betting_hall_shows_fallback(self):
  s=HALL.read_text()
  self.assertIn('import PublishedLiveMarketPreview from',s)
  start=s.index('if (!loadingBoard && board === null)')
  end=s.index('\n  return (',start+10)
  self.assertIn('<PublishedLiveMarketPreview />',s[start:end])
  self.assertIn('<PublishedBetHistoryFallback />',s[start:end])
  self.assertLess(s[start:end].index('<PublishedLiveMarketPreview />'),
                  s[start:end].index('<PublishedBetHistoryFallback />'))
 def test_repaired_full_bet_board_http200_not_faked(self):
  s=EXISTING.read_text()
  self.assertIn('loadBetBoardSnapshot(prisma, sessionUid',s)
  self.assertIn('isRestrictedBetsReadDenied(error)',s)
  self.assertIn('status: 503',s)
  self.assertNotIn('public-live',s)

if __name__=='__main__':unittest.main()
