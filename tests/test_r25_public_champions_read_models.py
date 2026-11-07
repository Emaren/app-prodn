#!/usr/bin/env python3
"""Negative-first source contract for the isolated Champions publication."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "config/nonfinancial-public-champions-v6.sql").read_text()
SRC = (ROOT / "lib/champions/championsV2.ts").read_text()


class ChampionsPublication(unittest.TestCase):
    def test_scoped_views_and_negative_source_acl(self):
        self.assertEqual(
            re.findall(r"CREATE OR REPLACE VIEW (aoe2war_public_v6\.\w+)", SQL),
            [
                "aoe2war_public_v6.champions_chaos_activity",
                "aoe2war_public_v6.champions_elo_custody",
            ],
        )
        self.assertEqual(SQL.count("WITH (security_barrier = true)"), 2)
        self.assertIn("current_user <> 'postgres'", SQL)
        self.assertIn("NOT rolsuper AND NOT rolbypassrls", SQL)
        self.assertNotIn("GRANT SELECT ON ALL TABLES", SQL.upper())
        self.assertNotIn("GRANT CREATE", SQL.upper())
        for source in ("trophies", "api_keys", "watcher_client_events"):
            self.assertIn(f"has_table_privilege('aoe2war_web_prod','public.{source}','SELECT')", SQL)
        for view in ("champions_chaos_activity", "champions_elo_custody"):
            self.assertIn(
                f"GRANT SELECT ON aoe2war_public_v6.{view} TO aoe2war_web_prod;", SQL
            )

    def test_only_display_columns_not_raw_evidence(self):
        for start, end in (
            ("CREATE OR REPLACE VIEW aoe2war_public_v6.champions_chaos_activity", "REVOKE ALL ON aoe2war_public_v6.champions_chaos_activity"),
            ("CREATE OR REPLACE VIEW aoe2war_public_v6.champions_elo_custody", "REVOKE ALL ON aoe2war_public_v6.champions_elo_custody"),
        ):
            view = SQL.split(start, 1)[1].split(end, 1)[0]
            select = view.split("FROM public.", 1)[0]
            for private in ("password", "secret", "api_key", "token", "wallet", "tx_hash", "error_state"):
                self.assertNotIn(private, select.lower(), private)
        self.assertIn("k.revoked_at IS NULL", SQL)
        self.assertIn("t.family='elo' AND t.status IN ('held','active','guardian_held')", SQL)

    def test_r25_runtime_has_view_reads_and_legacy_is_intact(self):
        self.assertIn("isNonfinancialPublicReadProfile()", SRC)
        self.assertIn("FROM aoe2war_public_v6.champions_chaos_activity", SRC)
        self.assertIn("FROM aoe2war_public_v6.champions_elo_custody", SRC)
        self.assertIn("FROM watcher_client_events w", SRC)
        self.assertIn(": await prisma.trophy.findMany({", SRC)
        self.assertIn("return await prisma.$queryRaw<WatcherActivityRow[]>(Prisma.sql", SRC)
        self.assertIn('currentHolder: row.currentUid ?', SRC)
        self.assertIn('if (isNonfinancialPublicReadProfile()) throw error;', SRC)


if __name__ == "__main__":
    unittest.main()
