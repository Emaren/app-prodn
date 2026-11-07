#!/usr/bin/env python3
"""A05 strict WAR CHEST public display projection and accounting contract."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/"config/nonfinancial-public-war-chest-v9.sql").read_text()
WAR=(ROOT/"lib/warChest.ts").read_text()
EARN=(ROOT/"lib/lobbyWoloEarners.ts").read_text()
PUBLIC=(ROOT/"lib/warChestNonfinancial.ts").read_text()


class WarChestV9(unittest.TestCase):
    def test_postgres_owned_security_barrier_and_no_raw_financial_grants(self):
        self.assertEqual(SQL.count("BEGIN;"),1)
        self.assertEqual(SQL.count("COMMIT;"),1)
        self.assertEqual(SQL.count("WITH (security_barrier=true)"),3)
        self.assertIn("current_user <> 'postgres'",SQL)
        self.assertIn("rolcanlogin AND NOT rolsuper AND NOT rolbypassrls",SQL)
        for view in ("published_wagers","published_claims","published_markets"):
            self.assertIn(f"GRANT SELECT ON aoe2war_public_v9.{view} TO aoe2war_web_prod",SQL)
        for table in ("bet_wagers","pending_wolo_claims","bet_markets","bet_stake_intents","bet_stake_tickets","users"):
            self.assertIn(f"has_table_privilege('aoe2war_web_prod','public.{table}','SELECT')",SQL)
        self.assertIn("has_schema_privilege('aoe2war_web_prod','aoe2war_public_v9','CREATE')",SQL)
        self.assertNotIn("GRANT SELECT ON ALL TABLES",SQL)
        self.assertNotIn("GRANT INSERT",SQL)
        self.assertNotIn("GRANT UPDATE",SQL)

    def test_proof_is_intent_or_ticket_recorded_not_bare_hash(self):
        segment=SQL.split("CREATE OR REPLACE VIEW aoe2war_public_v9.published_wagers",1)[1].split("REVOKE ALL ON aoe2war_public_v9.published_wagers",1)[0]
        for item in ("w.execution_mode='onchain_escrow'",
                     "w.stake_locked_at IS NOT NULL",
                     "NULLIF(BTRIM(w.stake_tx_hash),'') IS NOT NULL AND i.status='recorded'",
                     "t.status='recorded' AND NULLIF(BTRIM(t.stake_tx_hash),'') IS NOT NULL",
                     "LEFT JOIN public.bet_stake_intents",
                     "LEFT JOIN public.bet_stake_tickets",
                     'COALESCE(', '),FALSE) AS "recordedFunding"'):
            self.assertIn(item,segment)
        for blocked in ("w.stake_wallet_address AS", "i.wallet_address AS",
                        "t.wallet_address AS", "t.stake_tx_hash AS",
                        "i.error_detail AS", "t.browser_info AS"):
            self.assertNotIn(blocked,segment)
        self.assertIn("getWoloMainnetDisplayStartAt()",PUBLIC)
        self.assertIn("wager.recordedFunding && wager.stakeLockedAt !== null",PUBLIC)
        self.assertIn("row.recordedFunding &&",EARN)

    def test_claim_notes_private_and_rescissions_absent(self):
        segment=SQL.split("CREATE OR REPLACE VIEW aoe2war_public_v9.published_claims",1)[1].split("REVOKE ALL ON aoe2war_public_v9.published_claims",1)[0]
        self.assertIn("WHERE c.rescinded_at IS NULL",segment)
        self.assertIn("NULL::text AS note",segment)
        self.assertNotIn("c.note",segment)
        self.assertNotIn("c.error_state AS",segment)
        self.assertIn("WHEN c.error_state IS NOT NULL THEN 'operator_review'",segment)
        self.assertIn("c.payout_tx_hash AS",segment)
        self.assertIn("claimedByUserId",segment)

    def test_nonfinancial_branch_runs_before_legacy_financial_orm(self):
        head=WAR.split("export async function loadWarChestSnapshot(",1)[1].split("const earnersPromise",1)[0]
        self.assertIn("if (isNonfinancialPublicReadProfile())",head)
        self.assertIn("return loadNonfinancialWarChestSnapshot(prisma, mode)",head)
        self.assertIn("prisma.betWager.aggregate",WAR)
        self.assertIn("prisma.pendingWoloClaim.findMany",WAR)
        self.assertIn("prisma.betWager.groupBy",WAR)
        self.assertIn('FROM aoe2war_public_v9.published_wagers',PUBLIC)
        self.assertIn('FROM aoe2war_public_v9.published_claims',PUBLIC)
        self.assertIn('FROM aoe2war_public_v9.published_markets',PUBLIC)
        self.assertIn('FROM aoe2war_public_v5.user_profiles',PUBLIC)
        self.assertNotIn("prisma.betWager.",PUBLIC)
        self.assertNotIn("prisma.pendingWoloClaim.",PUBLIC)
        self.assertNotIn("catch (",PUBLIC)
        self.assertNotIn("return []",PUBLIC)

    def test_existing_leaderboard_algorithm_and_open_market_math_not_erased(self):
        self.assertIn("loadLobbyWoloEarnersBoard(prisma, { mode, generatedAt })",PUBLIC)
        self.assertIn("getWarChestUtcWeekStart(generatedAt)",PUBLIC)
        self.assertIn("matchedMarketVolumeWolo",PUBLIC)
        self.assertIn("activeBettors: new Set(weeklyWagers.map",PUBLIC)
        self.assertIn("getWarChestUtcWeekStart",WAR)
        self.assertIn("loadBetBoardSnapshot(prisma, viewerUid",WAR)
        self.assertIn("markets.filter((market) => market.status === \"settled\"",PUBLIC)
        self.assertIn("Math.round((pool / totalPot) * 100)",PUBLIC)
        self.assertIn("return Math.max(stake, Math.round",PUBLIC)


    def test_public_market_integrity_must_match_legacy_verified_and_desync_rules(self):
        view=SQL.split("CREATE OR REPLACE VIEW aoe2war_public_v9.published_markets",1)[1].split(
            "REVOKE ALL ON aoe2war_public_v9.published_markets",1)[0]
        for required in (
            "m.integrity_status='verified'",
            "NULLIF(BTRIM(m.proposition_hash),'') IS NOT NULL",
            "m.team_resolution_status='resolved'",
            "m.team_confidence='high'",
            "m.market_type='desync'",
            "parent.market_type='winner'",
            "parent.winner_side IN ('left','right')",
            "parent.settled_at IS NOT NULL",
            "LEFT JOIN public.bet_markets parent ON parent.id=m.parent_market_id",
            'AS "publicIntegrityEligible"'):
            self.assertIn(required,view)
        for forbidden in ('m.proposition_hash AS','m.integrity_reason AS',
                          'parent.source_roster_hash AS','parent.proposition_hash AS'):
            self.assertNotIn(forbidden,view)
        self.assertIn("eligiblePublishedOpenMarket(",PUBLIC)
        self.assertIn("isConfidentBetMarket(market)",PUBLIC)
        self.assertIn('market.publicIntegrityEligible === true',
            (ROOT/"lib/warChestPublicMarketTruth.ts").read_text())

    def test_open_market_pot_counts_active_slips_not_settled_or_void(self):
        self.assertIn("activePublishedMarketWagers(wagersByMarket.get(market.id) ?? [])",PUBLIC)
        self.assertIn('wager.status === "active"',
            (ROOT/"lib/warChestPublicMarketTruth.ts").read_text())
        self.assertNotIn('...markets.filter((market) => market.status === "settled"',PUBLIC)
        self.assertIn("const biggestPotCandidates = primary.map(",PUBLIC)

    def test_public_learner_loaders_only_use_scoped_aggregates(self):
        for func in ("loadClaims","loadWagers","loadUsersByIds","loadUsersByNames"):
            s=EARN.split(f"async function {func}(",1)[1].split("\n}",1)[0]
            self.assertIn("isNonfinancialPublicReadProfile()",s)
            self.assertIn("$queryRaw",s)
        self.assertIn('FROM aoe2war_public_v9.published_claims',EARN)
        self.assertIn('FROM aoe2war_public_v9.published_wagers',EARN)
        self.assertIn('FROM aoe2war_public_v5.user_profiles',EARN)

if __name__=="__main__":unittest.main()
