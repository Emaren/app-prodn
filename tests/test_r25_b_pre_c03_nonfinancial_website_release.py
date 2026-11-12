"""Source-only B pre-C03 website release; not actual finance denial or HEL1 GO."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SHARED=(ROOT/'lib/productionAuth.ts').read_text()
STEAM=(ROOT/'app/api/auth/steam/route.ts').read_text()
SESSION=(ROOT/'app/api/auth/session/route.ts').read_text()
C03=(ROOT/'lib/c03ExistingSteamPg.ts').read_text()
RUNBOOK=(ROOT/'docs/release/SESSION_B_PRE_C03_NONFINANCIAL_SITE_RELEASE_BOUNDARY_20261111.md').read_text()

class NormalSiteBeforeC03(unittest.TestCase):
    def test_normal_and_c03_profiles_are_exclusive_and_explicit(self):
        self.assertIn('NONFINANCIAL_PRODUCTION_PROFILE = "nonfinancial-production-v1"',SHARED)
        self.assertIn('C03_EXISTING_ONLY_PROFILE = "nonfinancial-c03-existing-only-v1"',SHARED)
        self.assertIn('process.env.AOE2WAR_RUNTIME_PROFILE !== C03_EXISTING_ONLY_PROFILE',SHARED)
        self.assertIn('process.env.AOE2WAR_RUNTIME_PROFILE === NONFINANCIAL_PRODUCTION_PROFILE',SHARED)
    def test_original_steam_and_session_functions_remain_for_normal_site(self):
        for text in ('await verifySteamCallback(request)', 'if (usesC03ExistingOnlyAuth())','completeProductionSteamLogin('):
            self.assertIn(text,STEAM)
        for text in ('aoe2war_auth_v1.complete_steam_login(', 'aoe2war_auth_v1.touch_session(', 'aoe2war_auth_v1.read_user('):
            self.assertIn(text,SHARED)
        self.assertIn('if (usesNonfinancialProductionAuth())',SESSION)
    def test_c03_never_falls_back_to_legacy_writer_and_requires_direct_login(self):
        for text in ('HOLD:C03_LEGACY_MUTATING_SECURITY_DEFINER_DENIED',
                     'HOLD:C03_USE_EXPLICIT_SERVER_ONLY_SESSION_ADAPTER',
                     'HOLD:C03_USE_EXPLICIT_SERVER_ONLY_USER_READER'):
            self.assertIn(text,SHARED)
        self.assertIn('session_user AS login_role, current_user AS role',C03)
        self.assertIn('HOLD:C03_PG_DIRECT_LOGIN_ROLE_OR_DATABASE_DRIFT',C03)
    def test_admission_runbook_is_precise_about_original_writes_and_protected_rollback(self):
        for text in ('It does write', 'users_id_seq', 'NOT compatible', 'C03_AUTH_PRESTAGE_ONLY',
                     'does NOT authorize HEL1 installation', 'Emaren/Scribe','39-link Kingdom','third Next',
                     'C04','ACTIVATE_ONLY',
                     'B_NORMAL_NONFINANCIAL_SOURCE_RELEASE_BEFORE_C03=CONDITIONAL_SOURCE_ONLY',
                     'B_PHYSICAL_TWO_ROLLBACKS=HOLD_NOT_PERFORMED'):
            self.assertIn(text,RUNBOOK,text)
        self.assertNotIn('PRODUCT_DEPLOY_GO=PASS',RUNBOOK)

if __name__=='__main__':unittest.main()
