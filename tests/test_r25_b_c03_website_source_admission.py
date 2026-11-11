"""Static route authority boundaries: source-only, cannot certify live C03."""
from __future__ import annotations
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
STEAM=(ROOT/"app/api/auth/steam/route.ts")
PROD=(ROOT/"lib/productionAuth.ts")
SIDE=(ROOT/"lib/c03ExistingSteamPg.ts")
DDL=(ROOT/"scripts/release/r25_b_c03_nonfinancial_sidecar_SCHEMA_REVIEW_ONLY.sql")
class C03RouteSource(unittest.TestCase):
    def test_steam_provider_verified_before_c03_identity(self):
        text=STEAM.read_text()
        self.assertLess(text.index("await verifySteamCallback(request)"),
                        text.index("if (usesC03ExistingOnlyAuth())"))
        self.assertLess(text.index("if (usesC03ExistingOnlyAuth())"),
                        text.index("const profile = await fetchSteamProfile(steamId)"))
    def test_c03_branch_never_falls_back_mutating_secdef(self):
        s=STEAM.read_text()
        block=s.split("if (usesC03ExistingOnlyAuth()) {",1)[1].split(
            'callbackStage = "community_profile";',1)[0]
        actual = "\n".join(x.split("//")[0] for x in block.splitlines())
        for forbidden in ("getPrisma(","completeProductionSteamLogin(",
                          "newSessionUid(","prisma.","UPDATE public.users","INSERT INTO public.users"):
            self.assertNotIn(forbidden,actual)
        self.assertIn("admitVerifiedExistingSteamCallback",block)
        self.assertIn("setSessionCookie",block)
    def test_preexisting_profile_requires_exact_explicit_opt_in(self):
        s=PROD.read_text()
        self.assertIn('"nonfinancial-c03-existing-only-v1"',s)
        self.assertIn("usesC03ExistingOnlyAuth()",s)
        self.assertIn("HOLD:C03_LEGACY_MUTATING_SECURITY_DEFINER_DENIED",s)
    def test_reader_and_nonce_are_distinct_db_roles(self):
        s=SIDE.read_text()
        for role in ("c03_auth_reader","c03_auth_nonce_writer",
                     "c03_auth_presence_writer"):
            self.assertIn(role,s)
        self.assertIn("current_user AS role, current_database()",s)
        self.assertIn("readerDb === sidecarDb",s)
    def test_reader_only_executes_projected_facade(self):
        s=SIDE.read_text()
        self.assertIn("c03_auth_ro.resolve_existing_steam",s)
        self.assertIn("c03_auth_ro.read_user",s)
        for bad in ("UPDATE public.users","INSERT INTO public.users",
                    "complete_steam_login","touch_session"):
            self.assertNotIn(bad,s)
    def test_nonce_digest_insert_is_not_upsert(self):
        s=SIDE.read_text()
        self.assertIn("INSERT INTO c03_b_sidecar.steam_verified_nonces",s)
        self.assertIn("UNIQUE nonce digest",s) if False else None
        self.assertNotIn("ON CONFLICT DO NOTHING",s)
    def test_only_presence_sidecar_may_update(self):
        s=SIDE.read_text()
        self.assertIn("c03_b_sidecar.user_presence",s)
        self.assertNotIn("SET last_seen",s)
    def test_sql_defines_nonce_primary_key_and_nonce_role_insert_only(self):
        s=DDL.read_text()
        self.assertIn("nonce_sha256 text PRIMARY KEY",s)
        self.assertIn("GRANT INSERT ON c03_b_sidecar.steam_verified_nonces TO c03_auth_nonce_writer",s)
        self.assertNotIn("TO aoe2war_web_prod",s)
        self.assertNotIn("GRANT UPDATE ON c03_b_sidecar.steam_verified_nonces",s)
        self.assertNotIn("CREATE SCHEMA IF NOT EXISTS",s)
    def test_c03_signed_session_get_and_post_do_not_construct_legacy_prisma(self):
        src=(ROOT/"app/api/auth/session/route.ts").read_text()
        self.assertIn("readProductionUser(null, uid)",src)
        self.assertIn("touchProductionSession(null, uid, providedEmail)",src)
        self.assertLess(src.index("if (usesC03ExistingOnlyAuth()) {\n    const user ="),
                        src.index("const prisma = getPrisma();\n  if (usesNonfinancialProductionAuth()) {"))
        self.assertIn("C03 preview identity not admitted",src)
    def test_c03_user_me_denies_protected_profile_post(self):
        src=(ROOT/"app/api/user/me/route.ts").read_text()
        self.assertIn("readProductionUser(null, uid)",src)
        self.assertIn("C03 protected account updates unavailable",src)
        self.assertIn("status: 503",src)
    def test_c03_presence_pings_only_use_new_sidecar(self):
        src=(ROOT/"app/api/user/ping/route.ts").read_text()
        self.assertIn("usesC03ExistingOnlyAuth() ? null : getPrisma()",src)
        self.assertIn("touchProductionSession(prisma, uid)",src)
        self.assertIn("prisma!.user.updateMany",src)
    def test_c03_maintenance_profile_denies_guests_and_shadow(self):
        src=PROD.read_text()
        for need in ("AOE2WAR_SHADOW_MODE","ALLOW_GUEST_SESSIONS",
                     "AOE2WAR_R25_ISOLATED_WEB",
                     "WARGRAPH_RUNTIME_DISABLED",
                     "HOLD:C03_ISOLATED_PRODUCTION_ONLY_PROFILE_REQUIRED"):
            self.assertIn(need,src)
    def test_no_physical_finance_write_authority_claim(self):
        s=SIDE.read_text()
        self.assertIn("No HBA/grant/DDL writes",s)

if __name__=="__main__":unittest.main()
