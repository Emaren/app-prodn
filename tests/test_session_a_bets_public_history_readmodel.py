"""R25 public market history must never reach financial or private tables."""
from pathlib import Path
import re
import unittest

SRC = Path(__file__).resolve().parents[1] / "app/api/bets/public-history/route.ts"
R25_BET_GET = Path(__file__).resolve().parents[1] / "app/api/bets/route.ts"

class PublishedHistoricalMarketContract(unittest.TestCase):
    def test_only_get_and_fixed_limit(self):
        source = SRC.read_text()
        self.assertEqual(len(re.findall(r"export async function GET\s*\(", source)), 1)
        self.assertNotRegex(source, r"export async function (POST|PUT|PATCH|DELETE)\s*\(")
        self.assertRegex(source, r"\bLIMIT 48\b")
        self.assertIn('export const dynamic = "force-dynamic"', source)
        self.assertIn('"Cache-Control": "private, no-store', source)

    def test_all_queries_use_existing_restricted_public_view_only(self):
        source = SRC.read_text()
        self.assertEqual(source.count("$queryRaw<"), 1)
        self.assertEqual(source.count("FROM aoe2war_public_v9.published_markets AS m"), 1)
        self.assertIn('m."publicIntegrityEligible" IS TRUE', source)
        self.assertIn("m.status IN ('settled', 'voided', 'under_review')", source)
        for forbidden in (
            "queueBetMarketEnsure", "ensureBetMarkets", "loadBetBoardSnapshot",
            "pendingWoloClaim.findMany", "betMarket.findMany",
            "getWoloSettlementSurfaceStatus", "runuser", "child_process",
            "executeRaw", "$transaction", "WOLO_SETTLEMENT_URL",
            "8092", "8093", "8094", "8095"
        ):
            self.assertNotIn(forbidden, source)

    def test_response_never_claims_finance_authority_or_finality(self):
        source = SRC.read_text()
        self.assertIn('financialExecutionAuthorized: false', source)
        self.assertIn('acceptingWagers: false', source)
        self.assertIn('approvingPayouts: false', source)
        self.assertIn('onchainPaymentFinalityVerified: false', source)
        self.assertIn('personalWagersIncluded: false', source)
        self.assertIn('payoutFinalityVerified: false', source)
        self.assertIn("not authenticated chain settlement", source)
        self.assertIn('status: "HOLD_PUBLIC_HISTORY_READMODEL_UNAVAILABLE"', source)
        self.assertIn('{ status: 503, headers: NO_STORE_HEADERS }', source)
        for forbidden in (
            "payoutTxHash", "userId", "walletAddress", "stakeTxHash",
            "claimKind", "amountWolo", "payoutWolo", "public_wagers",
        ):
            self.assertNotIn(forbidden, source)

    def test_existing_r25_bets_get_is_not_proxied_to_unrestricted_legacy(self):
        old = R25_BET_GET.read_text()
        self.assertIn("ensureMarkets: false", old)
        self.assertNotIn("queueBetMarketEnsure", old)
        source = SRC.read_text()
        self.assertNotIn("fetch(", source)
        self.assertNotIn("3030", source)
        self.assertIn('source: "aoe2war_public_v9.published_markets"', source)

if __name__ == "__main__":
    unittest.main()
