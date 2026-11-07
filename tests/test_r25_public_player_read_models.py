"""R25 public display-only user, avatar and replay-generation source parity."""
from pathlib import Path
import re,unittest

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/"config/nonfinancial-public-players-v5.sql").read_text()
GEN=(ROOT/"lib/publicReplayGeneration.ts").read_text()
DIR=(ROOT/"lib/publicPlayerDirectory.ts").read_text()
SUP=(ROOT/"lib/publicPlayerDirectoryGeneration.ts").read_text()

class PublicPlayerReadModelTests(unittest.TestCase):
    def test_identity_fingerprint_is_exact_legacy_public_generation_hash(self):
        tick=chr(96)
        legacy=GEN.split(
            "    : prisma.$queryRaw<Array<{ fingerprint: string }>>"+tick,1
        )[1].split(tick+")",1)[0].strip()
        view=SQL.split(
            "CREATE OR REPLACE VIEW aoe2war_public_v5.user_identity_fingerprint\n"
            "WITH (security_barrier=true) AS\n",1
        )[1].split(";\nREVOKE ALL ON aoe2war_public_v5.user_identity_fingerprint",1)[0].strip()
        self.assertEqual(legacy,view)
    def test_only_four_presentational_views_and_zero_raw_table_privileges(self):
        names=re.findall(r"CREATE OR REPLACE VIEW (aoe2war_public_v5\.[a-z_]+)",SQL)
        self.assertEqual(names,[
          "aoe2war_public_v5.user_profiles",
          "aoe2war_public_v5.avatar_revisions",
          "aoe2war_public_v5.user_identity_fingerprint",
          "aoe2war_public_v5.replay_adjudication_watermark",
        ])
        grants=re.findall(r"^GRANT SELECT ON (\S+) TO aoe2war_web_prod;$",SQL,re.M)
        self.assertEqual(grants,names)
        self.assertNotRegex(SQL,r"GRANT SELECT ON public\.")
        self.assertNotRegex(SQL,r"GRANT (?:ALL|INSERT|UPDATE|DELETE)")
        self.assertIn("PUBLIC_PLAYER_PRIVATE_SOURCE_AUTHORITY_DRIFT",SQL)
    def test_public_user_profiles_exclude_private_credentials_contact_and_wallet(self):
        view=SQL.split("CREATE OR REPLACE VIEW aoe2war_public_v5.user_profiles",1)[1].split("REVOKE ALL ON aoe2war_public_v5.user_profiles",1)[0]
        fields=view.split("SELECT",1)[1].split("FROM public.users",1)[0]
        for field in ("email","password","api_key","wallet_address","phone",
                      "session","cookie","refresh_token","private_key","contact"):
            self.assertNotIn(field,fields)
        for field in ("verified","uid","steam_id","in_game_name","represented_country"):
            self.assertIn(field,fields)
    def test_actual_restricted_source_uses_only_safe_views(self):
        for view in ("user_profiles","avatar_revisions"):
            self.assertIn("aoe2war_public_v5."+view,DIR)
        self.assertIn("aoe2war_public_v5.user_profiles",SUP)
        self.assertIn("aoe2war_public_v5.avatar_revisions",SUP)
        self.assertIn("aoe2war_public_v5.user_identity_fingerprint",GEN)
        self.assertIn("aoe2war_public_v5.replay_adjudication_watermark",GEN)
        self.assertIn("isNonfinancialPublicReadProfile()",DIR)
        self.assertIn("isNonfinancialPublicReadProfile()",GEN)
        self.assertIn("prisma.user.findMany",DIR)
        self.assertIn("prisma.managedMediaAsset.findMany",DIR)

if __name__=="__main__":unittest.main()
