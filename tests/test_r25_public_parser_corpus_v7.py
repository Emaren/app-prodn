#!/usr/bin/env python3
"""Negative-first A05 final replay corpus publication source contract."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/"config/nonfinancial-public-game-stats-corpus-v7.sql").read_text()
SRC=(ROOT/"lib/parserObservatory.ts").read_text()

class ParserCorpusV7(unittest.TestCase):
    def test_atomic_postgres_only_projection_and_web_select(self):
        self.assertEqual(SQL.count("BEGIN;"),1)
        self.assertEqual(SQL.count("COMMIT;"),1)
        self.assertIn("current_user <> 'postgres'",SQL)
        self.assertIn("NOT rolsuper AND NOT rolbypassrls",SQL)
        self.assertIn("WITH (security_barrier=true)",SQL)
        self.assertIn("WHERE g.is_final IS TRUE",SQL)
        self.assertIn("GRANT SELECT ON aoe2war_public_v7.parser_final_corpus TO aoe2war_web_prod",SQL)
        self.assertNotIn("GRANT SELECT ON ALL TABLES",SQL)
        self.assertNotIn("GRANT CREATE",SQL)
        self.assertIn("has_schema_privilege('aoe2war_web_prod','aoe2war_public_v7','CREATE')",SQL)

    def test_private_evidence_wallet_and_manual_notes_not_published(self):
        view=SQL.split("CREATE OR REPLACE VIEW aoe2war_public_v7.parser_final_corpus",1)[1].split("REVOKE ALL ON aoe2war_public_v7.parser_final_corpus",1)[0]
        self.assertIn("'evidence',NULL",view)
        self.assertIn("'reason','Reviewed game result'",view)
        for forbidden in ("a.evidence","a.raw_parser_snapshot","a.market_snapshot",
                          "a.financial_disposition","a.actor_user_id",
                          "u.email","u.password","u.wallet","u.api_key"):
            self.assertNotIn(forbidden,view)
        for raw in ("public.users","public.replay_result_adjudications","public.bet_wagers"):
            self.assertIn(f"has_table_privilege('aoe2war_web_prod','{raw}','SELECT')",SQL)
        self.assertIn("LEFT JOIN aoe2war_public_v5.user_profiles",view)

    def test_exact_isolated_profile_not_legacy_or_unauthorized_write(self):
        self.assertIn("if (!isNonfinancialPublicReadProfile()) return loadLegacyCorpusRows();",SRC)
        self.assertIn("FROM aoe2war_public_v7.parser_final_corpus",SRC)
        self.assertIn("ORDER BY played_on DESC NULLS LAST",SRC)
        self.assertIn("RETIRED_AUTOMATIC_REPLAY_RESULT_POLICY_VERSIONS",SRC)
        self.assertIn("idempotencyKey.startsWith(prefix)",SRC)
        self.assertIn(".slice(0, 1)",SRC)
        self.assertIn("createdAt: new Date(item.createdAt)",SRC)
        self.assertEqual(len(re.findall(r"FROM aoe2war_public_v7.parser_final_corpus",SRC)),1)
        self.assertIn("return getPrisma().gameStats.findMany(",SRC)

    def test_error_not_silently_replaced_with_zero(self):
        v=SRC.split("async function loadCorpusRows() {",1)[1].split("async function buildPublicParserObservatory()",1)[0]
        self.assertNotIn("catch (",v)
        self.assertNotIn("Promise.resolve([])",v)
        self.assertNotIn("return [];",v)
        self.assertIn("await getPrisma().$queryRaw",v)

if __name__=="__main__":
    unittest.main()
