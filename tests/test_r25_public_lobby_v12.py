"""R25 A05 v12: source-pinned public-only header/ticker projection tests.

Do not accept raw private table reads, empty-data substitutions, or financial
write authority as a workaround for real PostgreSQL 42501.
"""
from pathlib import Path
import importlib.util
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/"config/nonfinancial-public-lobby-v12.sql").read_text()
TICKER=(ROOT/"lib/liveTicker.ts").read_text()
HEADER=(ROOT/"app/api/header-summary/route.ts").read_text()
spec=importlib.util.spec_from_file_location("a05_lobby_v12_controller",ROOT/"scripts/r25_c_start_root.py")
controller=importlib.util.module_from_spec(spec)
spec.loader.exec_module(controller)

class PublicLobbyV12(unittest.TestCase):
    def test_view_ddl_is_exact_public_two_view_bundle(self):
        self.assertTrue(SQL.startswith("-- A05 v12:"))
        self.assertTrue(SQL.rstrip().endswith("COMMIT;"))
        names=re.findall(r"CREATE OR REPLACE VIEW (aoe2war_public_v12\.[a-z_]+)",SQL)
        self.assertEqual(names,[
            "aoe2war_public_v12.published_ticker",
            "aoe2war_public_v12.header_counts",
        ])
        self.assertEqual(SQL.count("WITH (security_barrier=true) AS"),2)
        self.assertIn("CREATE SCHEMA IF NOT EXISTS aoe2war_public_v12 AUTHORIZATION postgres;",SQL)
        self.assertIn("REVOKE ALL ON SCHEMA aoe2war_public_v12 FROM PUBLIC;",SQL)
        self.assertIn("GRANT USAGE ON SCHEMA aoe2war_public_v12 TO aoe2war_web_prod;",SQL)
        self.assertEqual(SQL.count("GRANT SELECT ON aoe2war_public_v12."),2)
        self.assertEqual(SQL.count("REVOKE ALL ON aoe2war_public_v12."),2)

    def test_no_raw_access_to_sensitive_sources(self):
        for table in ("live_ticker_messages","community_requests","workshop_status","workshop_streams"):
            self.assertIn(f"has_table_privilege('aoe2war_web_prod','public.{table}','SELECT')",SQL)
            self.assertNotIn(f"GRANT SELECT ON public.{table}",SQL)
        self.assertIn("has_schema_privilege('aoe2war_web_prod','aoe2war_public_v12','CREATE')",SQL)
        for forbidden in ("wallet_address","key_hash","token","cookie","guest_session_id",
                          "contact_email","chat_message_guest_reactions","bet_wagers",
                          "staking_positions","financial_authorized=true","GRANT ALL"):
            self.assertNotIn(forbidden,SQL.lower())

    def test_publication_filters_are_explicit_and_do_not_copy_private_rows(self):
        self.assertIn("WHERE enabled IS TRUE AND (expires_at IS NULL OR expires_at > now())",SQL)
        self.assertIn("FROM public.community_requests WHERE status='open'",SQL)
        self.assertIn("WHERE id=1 AND is_live IS TRUE",SQL)
        self.assertIn("WHERE status='live' AND is_public IS TRUE",SQL)
        self.assertIn("SELECT id, text, priority, expires_at AS \"expiresAt\"",SQL)
        self.assertIn("count(*)::bigint",SQL)

    def test_native_c_catalog_attests_exact_source_derived_digest(self):
        self.assertEqual(
          controller.PROD_PUBLIC_ADDITIONAL_VIEWS["aoe2war_public_v12"],
          ("header_counts","published_ticker"))
        self.assertEqual(
          controller.PROD_PUBLIC_ADDITIONAL_DEFINITION_SHA256["aoe2war_public_v12"],
          "0c10a889d9435ba19c25894d4d19e19d7e742a7877091c98a51587d101cd7575")
        self.assertIn("aoe2war_public_v12.header_counts",controller.PROD_PUBLIC_APPROVED_IDENTITIES)
        self.assertIn("aoe2war_public_v12.published_ticker",controller.PROD_PUBLIC_APPROVED_IDENTITIES)
        self.assertNotIn("public.live_ticker_messages",controller.PROD_PUBLIC_APPROVED_IDENTITIES)

    def test_r25_runtime_reads_exact_views_legacy_stays_unchanged(self):
        self.assertIn("isNonfinancialPublicReadProfile()",TICKER)
        self.assertIn("FROM aoe2war_public_v12.published_ticker",TICKER)
        self.assertIn("LIMIT 8",TICKER)
        self.assertIn("prisma.liveTickerMessage.findMany",TICKER)
        self.assertIn("isNonfinancialPublicReadProfile()",HEADER)
        self.assertIn("FROM aoe2war_public_v12.header_counts",HEADER)
        self.assertIn("A05_PRODUCTION_PUBLIC_HEADER_V12_REQUIRED",HEADER)
        self.assertIn("A05_PRODUCTION_HEADER_COUNT_INVALID",HEADER)
        self.assertIn("Number.isSafeInteger",HEADER)
        self.assertIn("prisma.communityRequest.count",HEADER)
        self.assertIn("prisma.workshopStream.findFirst",HEADER)
        self.assertNotIn("await prisma.communityRequest.findMany",HEADER)

    def test_no_fabricated_values_for_missing_projections(self):
        branch=HEADER.split("if (isNonfinancialPublicReadProfile()) {",1)[1].split(
            "// Header refresh must never dispatch",1)[0]
        self.assertIn('throw new Error("A05_PRODUCTION_PUBLIC_HEADER_V12_REQUIRED")',branch)
        self.assertIn("loadLiveGamesSnapshot(prisma)",branch)
        self.assertNotIn("allSettled",branch)
        self.assertNotIn("?? 0",branch)
        self.assertNotIn("catch",branch)
        self.assertIn("throw new Error",branch)

if __name__=="__main__":unittest.main()
