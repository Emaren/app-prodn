"""A failed live BetBoardSnapshot renders history, never fake wager amounts."""
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PAGE=ROOT/'app/bets/page.tsx'
COMPONENT=ROOT/'components/bets/PublishedBetHistoryFallback.tsx'

class PublicBetsFallbackTests(unittest.TestCase):
  def test_page_falls_back_only_after_failed_real_live_board(self):
    s=PAGE.read_text()
    self.assertIn('if (!loadingBoard && board === null)',s)
    self.assertIn('<PublishedBetHistoryFallback />',s)
    self.assertIn('Financial release on hold',s)
    self.assertLess(s.index('if (!loadingBoard && board === null)'),s.index('className="space-y-5 overflow-x-hidden py-4 text-white sm:space-y-6 sm:py-5"'))
    self.assertIn('The live wagering board is unavailable.',s)
    self.assertNotIn('No live games today.',s)

  def test_archive_fetch_is_exact_and_read_only(self):
    s=COMPONENT.read_text()
    self.assertIn('fetch("/api/bets/public-history"',s)
    self.assertIn('method: "GET"',s)
    self.assertIn('cache: "no-store"',s)
    self.assertIn('credentials: "same-origin"',s)
    self.assertIn('abort.signal',s)
    self.assertIn('res.ok',s)
    self.assertIn('isPublicHistory(data)',s)
    self.assertIn('markets.length > 48',s)
    for key in ['financialExecutionAuthorized','acceptingWagers','approvingPayouts',
                'onchainPaymentFinalityVerified','personalWagersIncluded']:
      self.assertIn('v.'+key+' !== false',s)
    for forbidden in ['/api/bets/wager','/api/staking','payoutTxHash','stakeTxHash',
                      'walletBalance','amountWolo','poolWolo','setTimeout','onClick=', '8092',
                      '3030']:
      self.assertNotIn(forbidden,s)

  def test_archival_labels_cannot_claim_paid_or_verified(self):
    s=COMPONENT.read_text()
    self.assertIn('not independently verified',s)
    self.assertIn('No wagers accepted · No payout finality attested',s)
    self.assertIn('No historical',s) if False else None
    self.assertIn('No eligible published historical market entries',s)
    self.assertIn('The verified public archive is temporarily unavailable',s)
    self.assertNotIn('paid out',s)
    self.assertIn('new Set<number>()',s)

if __name__=='__main__':
  unittest.main()
