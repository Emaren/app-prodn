"""A05 protected public projections must never bypass nonfinancial confinement.

The five public routes may render approved static/sanitized source content.
No private gameplay, profile, oracle positions, payouts, wallet or settlement
tables are authorized by this page-level acceptance.
"""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class NonfinancialPublicProjectionSafety(unittest.TestCase):
    def page(self, name: str) -> str:
        return (ROOT/"app"/name/"page.tsx").read_text()

    def test_ai_still_uses_only_five_published_directory_fields(self):
        source=self.page("ai")
        self.assertIn("usesNonfinancialProductionAuth()",source)
        self.assertIn("loadNonfinancialPublicAiDirectory(getPrisma())",source)
        self.assertTrue(source.index("loadNonfinancialPublicAiDirectory") <
                        source.index("loadPublicAiCouncil(getPrisma())"))
        self.assertIn('data-public-read-model={projectionAvailable ? "available" : "unavailable"}',source)

    def test_kingdom_static_chronicle_cannot_fall_through_to_private_summary(self):
        source=self.page("kingdom")
        self.assertIn("if (usesNonfinancialProductionAuth())",source)
        self.assertIn("return <KingdomPublicNonfinancial />;",source)
        self.assertTrue(source.index("return <KingdomPublicNonfinancial />;") <
                        source.index("loadKingdomSummary()"))
        public=(ROOT/"app/kingdom/KingdomPublicNonfinancial.tsx").read_text()
        self.assertIn('data-public-read-model="static-public-only"',public)
        self.assertIn("UNKNOWN rather than zero",public)
        self.assertNotIn("getPrisma",public)
        self.assertNotIn("fetch(",public)

    def test_bettors_and_oracle_have_only_published_historical_readers(self):
        for route,private in [
            ("kingdom-bettors","loadKingdomBettors()"),
            ("oracle","loadOracleSnapshot(getPrisma()"),
        ]:
            source=self.page(route)
            with self.subTest(route=route):
                self.assertIn("if (usesNonfinancialProductionAuth())",source)
                self.assertIn("loadNonfinancialPublicMarketArchive(getPrisma())",source)
                self.assertIn("return <PublicHistoricalMarketArchive",source)
                self.assertTrue(source.index("return <PublicHistoricalMarketArchive") <
                                source.index(private))
                self.assertIn("catch {",source)
                self.assertIn("viewAvailable={available}",source)

    def test_market_archive_sql_is_fixed_and_has_no_sensitive_projection(self):
        source=(ROOT/"lib/nonfinancialPublicMarketArchive.ts").read_text()
        self.assertIn("FROM aoe2war_public_v9.published_markets",source)
        self.assertIn('"publicIntegrityEligible" IS TRUE',source)
        self.assertIn("status IN ('settled', 'voided', 'under_review')",source)
        self.assertIn("LIMIT 18",source)
        self.assertIn('SELECT id, title, "eventLabel", status, "leftLabel", "rightLabel"',source)
        sql=source.split("Prisma.sql`",1)[1].split("`",1)[0]
        self.assertNotIn("prisma.betMarket.findMany",source)
        self.assertNotIn("FROM public.",sql)
        for secret in ["userId", "wallet", "payoutWolo", "amountWolo", "txHash", "privateKey", "claims"]:
            self.assertNotIn(secret,sql)

    def test_market_archive_ui_cannot_imply_funded_authorization(self):
        source=(ROOT/"components/production/PublicHistoricalMarketArchive.tsx").read_text()
        self.assertIn('data-public-read-model={viewAvailable ? "available" : "unavailable"}',source)
        self.assertIn("NOT independent blockchain finality",source)
        self.assertIn("wagers, wallets, claims, execution",source.lower())
        self.assertIn("Records remain UNKNOWN",source)
        self.assertNotIn("onClick",source)
        self.assertNotIn("onSubmit",source)
        self.assertNotIn("<form",source)

    def test_war_engine_unknown_not_fabricated_zero(self):
        source=self.page("war-engine")
        self.assertIn("const restricted = usesNonfinancialProductionAuth();",source)
        self.assertTrue(source.index("const restricted = usesNonfinancialProductionAuth();") <
                        source.index("prisma.warEngineCase.findMany"))
        self.assertIn('? [] // private case/gameStats joins',source)
        self.assertIn('value={restricted ? "UNKNOWN" : cases.length}',source)
        self.assertIn('value={restricted ? "UNKNOWN" : queuedCount}',source)
        self.assertIn('restricted ? "UNKNOWN / UNKNOWN"',source)
        self.assertIn("data-public-read-model",source)

    def test_original_restricted_guest_component_remains_as_fail_closed_tool(self):
        source=(ROOT/"components/production/RestrictedPublicPreview.tsx").read_text()
        self.assertIn("Read-only preview",source)
        self.assertIn("temporarily unavailable",source)
        self.assertIn("No wagers, wallets, or settlement operations",source)

if __name__=="__main__":
    unittest.main()
