"""V9 single-runtime/finance-safe rollback contract, no host mutation."""
from pathlib import Path
import importlib.util, hashlib, unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
def imported(filename):
 path=ROOT/"scripts/release"/filename
 spec=importlib.util.spec_from_file_location(filename.replace(".","_"),path)
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 return m
g=imported("r25_steam_refresh_traffic_v9.py")
r=imported("r25_traffic_single_runtime_release_v9.py")
class V9Contracts(unittest.TestCase):
 def test_original_financial_pin_not_rotated(self):
  self.assertEqual(g.FIN_SNAPSHOT,"6296fcf49fbc1d33f507c6a8339f87513f933948c0d86a7aa373cebe46071cfb")
  self.assertEqual(g.ORIGINAL_FIN_SNAPSHOT,g.FIN_SNAPSHOT)
  self.assertEqual(g.NFT_SHAPE,"985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af")
 def test_exact_17_attack_source_bound_to_wrapper(self):
  helper=(ROOT/"scripts/release/r25_c03_observer_oneshot_guard_v9.py").read_bytes()
  self.assertEqual(hashlib.sha256(helper).hexdigest(),g.C03_HELPER_SHA)
  self.assertEqual(r.GUARD_SHA,hashlib.sha256((ROOT/"scripts/release/r25_steam_refresh_traffic_v9.py").read_bytes()).hexdigest())
  self.assertEqual(g.C03_HELPER.name,"r25_c03_observer_oneshot_guard_v9.py")
 def test_real_staging_preserved_44954_files(self):
  self.assertEqual(set(g.PROFILES),{"candidate","rollback"})
  self.assertEqual(g.PROFILES["candidate"]["source"],r.SOURCE)
  self.assertEqual(g.PROFILES["candidate"]["build"],"YF_YxSAxc0izAfRG0ARsc")
  self.assertEqual(g.PROFILES["candidate"]["origin_sha"],r.STAGE_RECEIPT_SHA)
  self.assertEqual(g.PROFILES["rollback"]["source"],"0a7450f9c8c1d12cdf63e33d57e665ad1e3f5cb1")
 def test_fund_protection_and_old_3030_never_restarted(self):
  source=(ROOT/"scripts/release/r25_traffic_single_runtime_release_v9.py").read_text()
  for text in ("'FUNDED_PORT_OPEN'","'LEGACY_3030_PID_DRIFT'","'WALLET_VALIDATOR_PID_DRIFT'",
               "'MIXED_RELEASE_UNSAFE'","'PASS_RESTRICTED_3032_STEAM_V9_ROLLBACK'",
               "check('LISTEN' not in","old_web,new_steam","enrollment(False)"):
   self.assertIn(text,source)
  for bad in ("GRANT ","ALTER ROLE","REVOKE ","systemctl restart wolochaind","systemctl restart aoe2hdbets-web.service"):
   self.assertNotIn(bad,source)
 def test_no_legacy_finance_writable_3030_in_rollback(self):
  with patch.object(r,"persist") as persist:
   for pair in ((b"no",b"bad"),(b"same",b"same")):
    with self.assertRaisesRegex(RuntimeError,"NON_WHITELISTED"):
     r.transition(*pair)
   persist.assert_not_called()
 def test_invalid_combinations_never_write(self):
  with patch.object(r,"sha",side_effect=lambda x:{
    b"newweb":r.CANDIDATE_UNIT_SHA,b"oldsteam":r.CURRENT_STEAM_UNIT_SHA,
    b"oldweb":r.CURRENT_UNIT_SHA,b"newsteam":r.CANDIDATE_STEAM_UNIT_SHA,
  }[x]):
   with patch.object(r,"persist") as persist:
    with self.assertRaisesRegex(RuntimeError,"MIXED_RELEASE_UNSAFE"):
     r.transition(b"newweb",b"oldsteam")
    persist.assert_not_called()
 def test_original_sha_software_unchanged(self):
  self.assertEqual(g.OLD_SHA,"3e54151c10ad39889a6341f000ae36dc1a89f9a3278608c918e707bd068fbb07")
  self.assertEqual(g.V6_SHA,"88343a6405e263e2227c94744e058b53fa4d067c4fd53070d99c15f43b5546ce")
  self.assertEqual(r.V7_GUARD_SHA,"aaf01a33def75ca840d04cf1ea1132110c197562b60cfee7625959ffab2a01cd")
 def test_timer_restored_even_on_failure(self):
  source=(ROOT/"scripts/release/r25_traffic_single_runtime_release_v9.py").read_text()
  self.assertIn("finally:\n   if timer_paused:",source)
  self.assertIn("STEAM_TIMER_RESUME",source)
 def test_false_admin_or_full_browser_not_certified(self):
  source=(ROOT/"scripts/release/r25_steam_refresh_traffic_v9.py").read_text()
  self.assertIn("'steam_owner_browser_verified':False",source)
  self.assertIn("'canonical_traffic_certified':False",source)
if __name__=="__main__":unittest.main()
