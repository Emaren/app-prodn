"""No raw replay evidence leaks through the R25 live account display view."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
SOURCE=(ROOT/"lib/currentWatcherAccountState.ts").read_text()
SQL=(ROOT/"config/nonfinancial-public-watcher-v3.sql").read_text()
CONSTANTS={
 "CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.parserName":"aoe2war.mgz_hd",
 "CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.parserVersion":"1.8.51",
 "CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.schemaVersion":"2026-07-25.1",
 "CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.passName":"hd_deterministic_evidence",
 "CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.passVersion":"10",
}
class PublicWatcherSQLContract(unittest.TestCase):
    def test_reviewed_semantic_delta_and_security_barrier(self):
        tick=chr(96)
        legacy=SOURCE.split(
            "    >(Prisma.sql"+tick,1)[1].split(tick+");",1)[0].strip()
        for key,value in CONSTANTS.items():
            needle="$"+"{"+key+"}"
            self.assertEqual(legacy.count(needle),1,key)
            legacy=legacy.replace(needle,"'"+value+"'")
        self.assertNotIn("$"+"{",legacy)
        marker=("CREATE OR REPLACE VIEW aoe2war_public_v3.current_watcher_account_states\n"
                "WITH (security_barrier=true) AS\n")
        self.assertEqual(SQL.count(marker),1)
        view=SQL.split(marker,1)[1].split(";\nDO $view_acl$",1)[0].strip()
        old="FROM replay_parse_attempts a"
        self.assertEqual(legacy.count(old),1)
        legacy=legacy.replace(old,"FROM public.replay_parse_attempts a",1)
        self.assertEqual(view,legacy)
        self.assertIn("SET LOCAL search_path = pg_catalog, public;",SQL)
        self.assertEqual(re.findall(r'AS "([^"]+)"',view),
            ["steamId","latestObservedName","nameObservedAt","steamRmRating",
             "steamRmObservedAt","steamDmRating","steamDmObservedAt"])
        self.assertIn("ORDER BY account_ids.steam_id",view)

    def test_seven_columns_only_and_no_private_table_select(self):
        self.assertIn('FROM aoe2war_public_v3.current_watcher_account_states',SOURCE)
        self.assertIn('isNonfinancialPublicReadProfile()',SOURCE)
        self.assertIn('PUBLIC_WATCHER_RAW_EVIDENCE_AUTHORITY_DRIFT',SQL)
        self.assertEqual(re.findall(r'^\s*GRANT (.+?);$',SQL,re.M),
            ["USAGE ON SCHEMA aoe2war_public_v3 TO aoe2war_web_prod",
             "SELECT ON aoe2war_public_v3.current_watcher_account_states TO aoe2war_web_prod"])
        for privilege,target,grant in (
            ("has_schema_privilege","aoe2war_public_v3","USAGE ON SCHEMA aoe2war_public_v3"),
            ("has_table_privilege","aoe2war_public_v3.current_watcher_account_states","SELECT ON aoe2war_public_v3.current_watcher_account_states")):
            perm=grant.split()[0]
            self.assertIn(f"IF NOT pg_catalog.{privilege}('aoe2war_web_prod','{target}','{perm}') THEN\n   GRANT {grant} TO aoe2war_web_prod;\n END IF;",SQL)
        self.assertNotRegex(SQL,r"(?im)^\s*REVOKE\b")
        self.assertIn("PUBLIC_WATCHER_PUBLIC_ACL_DRIFT",SQL)
        self.assertIn("has_any_column_privilege('aoe2war_web_prod','public.replay_parse_attempts','SELECT,INSERT,UPDATE,REFERENCES')",SQL)
        for target in ("public.replay_parse_attempts","aoe2war_public_v3.current_watcher_account_states"):
            self.assertIn(f"has_table_privilege('aoe2war_web_prod','{target}','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')",SQL)
        self.assertIn("has_schema_privilege('aoe2war_web_prod','aoe2war_public_v3','CREATE')",SQL)

    def test_legacy_frozen_parser_contract_stays_unchanged(self):
        for key,value in CONSTANTS.items():
            keyname=key.split(".")[-1]
            self.assertIn(keyname, SOURCE)
            self.assertIn('"'+value+'"',SOURCE)
        self.assertIn("provenance_signature_verified",SQL)
        self.assertIn("archive_verified",SQL)
        self.assertIn("client_sha256_verified",SQL)
        self.assertIn("result_authority",SQL)

if __name__=="__main__":unittest.main()
