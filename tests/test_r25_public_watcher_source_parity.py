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
    def test_exact_original_parser_query_is_embedded_in_security_barrier_view(self):
        tick=chr(96)
        legacy=SOURCE.split(
            "    >(Prisma.sql"+tick,1)[1].split(tick+");",1)[0].strip()
        for key,value in CONSTANTS.items():
            needle="$"+"{"+key+"}"
            self.assertEqual(legacy.count(needle),1,key)
            legacy=legacy.replace(needle,"'"+value+"'")
        self.assertNotIn("$"+"{",legacy)
        view=SQL.split(
            "CREATE OR REPLACE VIEW aoe2war_public_v3.current_watcher_account_states\n"
            "WITH (security_barrier=true) AS\n",1)[1].split(
                ";\nREVOKE ALL ON aoe2war_public_v3.current_watcher_account_states",1)[0].strip()
        self.assertEqual(view,legacy)
    def test_seven_columns_only_and_no_private_table_select(self):
        self.assertIn('FROM aoe2war_public_v3.current_watcher_account_states',SOURCE)
        self.assertIn('isNonfinancialPublicReadProfile()',SOURCE)
        self.assertIn('PUBLIC_WATCHER_RAW_EVIDENCE_AUTHORITY_DRIFT',SQL)
        grants=re.findall(r'^GRANT SELECT ON (\S+) TO aoe2war_web_prod;$',SQL,re.M)
        self.assertEqual(grants,['aoe2war_public_v3.current_watcher_account_states'])
        self.assertNotRegex(SQL,r'GRANT (?:ALL|INSERT|UPDATE|DELETE)')
        self.assertNotRegex(SQL,r'GRANT SELECT ON public\.')
        assert "ORDER BY account_ids.steam_id" in SQL
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
