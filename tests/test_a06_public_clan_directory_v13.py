"""A06: public clan projection is bounded to non-sensitive display fields."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
DDL = ROOT / "config/nonfinancial-public-clan-directory-v13.sql"
TS = ROOT / "lib/clans.ts"


class PublicClanDirectoryV13(unittest.TestCase):
    def test_security_barrier_and_original_raw_denial(self):
        source = DDL.read_text()
        self.assertIn("current_user <> 'postgres'", source)
        self.assertIn("WITH (security_barrier=true)", source)
        self.assertIn("WHERE c.status='active'", source)
        self.assertIn("m.status='active'", source)
        self.assertIn("GRANT SELECT ON aoe2war_public_v13.active_clan_directory TO aoe2war_web_prod", source)
        self.assertIn("has_table_privilege('aoe2war_web_prod','public.clans','SELECT')", source)
        self.assertIn("has_table_privilege('aoe2war_web_prod','public.clan_members','SELECT')", source)
        self.assertIn("has_schema_privilege('aoe2war_web_prod','aoe2war_public_v13','CREATE')", source)
        self.assertIn("pg_get_userbyid(c.relowner)<>'postgres'", source)
        self.assertEqual(source.count("BEGIN;"), 1)
        self.assertEqual(source.count("COMMIT;"), 1)

    def test_no_member_identity_or_finance_exposure(self):
        query = DDL.read_text().split("WITH (security_barrier=true) AS", 1)[1].split("REVOKE ALL ON", 1)[0]
        for forbidden in ("user_id", "author_user_id", "steam_id", "email", "token",
                          "amount_wolo", "stake", "payout", "balance", "wallet", "chat_audience_policy",
                          "role", "body", "metadata"):
            self.assertNotIn(forbidden, query.lower())
        self.assertIn("count(*)::bigint", query)
        self.assertIn('c.crest_url AS "crestUrl"', query)

    def test_production_selects_projection_only_and_normalizes_bigint(self):
        source = TS.read_text()
        start = source.index("export async function loadClanDirectory(")
        end = source.index("  const clans = await prisma.clan.findMany", start)
        scope = source[start:end]
        self.assertIn("usesNonfinancialProductionAuth()", scope)
        self.assertIn("aoe2war_public_v13.active_clan_directory", scope)
        self.assertIn("ORDER BY name ASC, id ASC", scope)
        self.assertIn("memberCount: Number(row.memberCount)", scope)
        self.assertNotIn("prisma.clan.findMany(", scope)
        self.assertNotIn("FROM public.clans", scope)
        self.assertNotIn("FROM public.clan_members", scope)


if __name__ == "__main__":
    unittest.main()
