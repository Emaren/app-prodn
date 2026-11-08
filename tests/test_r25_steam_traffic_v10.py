"""Exact second-attempt R25 web-only controller contract, no live ops."""
from pathlib import Path
import importlib.util
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
P=ROOT/"scripts/release/r25_traffic_single_runtime_release_v10.py"
spec=importlib.util.spec_from_file_location("v10",P)
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class V10ReleaseContract(unittest.TestCase):
 def test_second_attempt_distinct_receipt_and_locks(self):
  self.assertTrue(r.ROOT_RECEIPT.name.endswith("v10-attempt2.json"))
  self.assertTrue(r.ORIGINAL_BACKUP.name.endswith("v10-before-switch-attempt2.service"))
  self.assertEqual(r.OLD_PID,3329075)
  self.assertEqual(r.LEGACY_PID,2625090)
  self.assertEqual(r.VALIDATOR_PID,1009)
 def test_new_site_source_and_unit_byte_pinned(self):
  self.assertEqual(r.SOURCE,"4ab96cc7c1c0ba43a0403795485d3f410a6ba07f")
  self.assertEqual(r.CANDIDATE_UNIT_SHA,"42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621")
  self.assertEqual(r.NEW_VERSION,"20261108182649-ca81f00609")
 def test_steam_v9_already_enrolled_and_never_rewritten(self):
  self.assertEqual(r.STEAM_EXEC,r.NEW_STEAM_EXEC)
  self.assertEqual(r.CURRENT_STEAM_UNIT_SHA,r.CANDIDATE_STEAM_UNIT_SHA)
  source=P.read_text()
  self.assertNotIn("persist(STEAM,steam_bytes",source)
  self.assertIn("ENROLLED_STEAM_UNIT_MUTATED_DURING_RELEASE",source)
 def test_source_sidecar_must_be_physically_source_bound(self):
  self.assertIn("staged-source-identity-overlay-v9.json",P.read_text())
  self.assertIn("3ec11c04117036e787735a1c128411ef3db10f085cd8e319f98d14a2e5e6078c",P.read_text())
  self.assertIn("CANDIDATE_ROOT_SOURCE_IDENTITY_MISSING",P.read_text())
 def test_rolled_back_version_must_be_restricted_3032(self):
  source=P.read_text()
  self.assertIn("transition(old_web,new_steam)",source)
  self.assertIn("'reset-failed','aoe2hdbets-web-prod.service'",source)
  self.assertIn("public_exact_version(OLD_VERSION,32)",source)
  self.assertIn("enrollment(False)",source)
  self.assertNotIn("restart','aoe2hdbets-web.service",source)
 def test_invalid_mutation_rejected_before_writing_web(self):
  with patch.object(r,"sha",side_effect=lambda b:{
   b"webnew":r.CANDIDATE_UNIT_SHA,b"webold":r.CURRENT_UNIT_SHA,b"badsteam":"bad"}[b]):
   with patch.object(r,"persist") as persist:
    with self.assertRaisesRegex(RuntimeError,"NON_WHITELISTED_STEAM"):
     r.transition(b"webnew",b"badsteam")
    persist.assert_not_called()
 def test_financial_interlocks_not_removed(self):
  source=P.read_text()
  for guard in ("LEGACY_3030_PID_DRIFT","WALLET_VALIDATOR_PID_DRIFT","FUNDED_PORT_OPEN",
                "ROOT_DISK_RESERVE_TOO_LOW","WEB_RESTART_RAM_HEADROOM_LOW",
                "PUBLIC_WEB_PROCESS_CHANGED","OLD_PUBLIC_RELEASE_UNHEALTHY",
                "V9_ENROLLED_RESTRICTED_STEAM_ROLLBACK_NOT_PROVEN"):
   self.assertIn(guard,source)
  for mutation in ("ALTER ROLE","GRANT ","REVOKE ","systemctl restart wolochaind","8092/execute"):
   self.assertNotIn(mutation,source)
 def test_source_gates_one_shot_stop_restart_and_resume(self):
  source=P.read_text()
  self.assertIn("execute(['systemctl','stop','aoe2war-steam-egress-refresh.timer']",source)
  self.assertIn("if timer_paused:",source)
  self.assertIn("STEAM_TIMER_RESUME",source)
 def test_receipt_records_true_uncertainty_not_false_success(self):
  source=P.read_text()
  self.assertIn("HOLD_V10_AUTOMATIC_ROLLBACK_UNVERIFIED",source)
  self.assertIn("canonical_traffic_certification_authorized':False",source)
if __name__=="__main__":unittest.main()
