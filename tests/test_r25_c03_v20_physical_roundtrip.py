"""V20 source-specific bounded reversible 3032 gate: isolated negative tests."""
from pathlib import Path
import importlib.util,hashlib,unittest,sys
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts/release/r25_c03_v20_reversible_physical_v1.py"
CORE=ROOT/"scripts/release/r25_c03_v18_reversible_roundtrip_v1.py"
spec=importlib.util.spec_from_file_location("source_reviewed_v20_reversible",SCRIPT)
v=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=v
spec.loader.exec_module(v)
src=SCRIPT.read_text()

class V20Roundtrip(unittest.TestCase):
 def test_source_pinned_v20_and_original_b1ef(self):
  self.assertEqual(v.STEAM_SHA,"7d432066f370b9eeb7f931f2143a12f2695177e6c174775b4400617e00909c4c")
  self.assertEqual(v.V20_UNIT_SHA,"b976a10d5cc8b3c199974f1b85a912a67323e8b57b4f69325a1061428d20deb2")
  self.assertEqual(v.CYCLE_SHA,hashlib.sha256(CORE.read_bytes()).hexdigest())
  self.assertEqual(v.V20_FIN_SHA,"3a24b53d356d6ac406999fbabed66c5144d74e538503840d407feb4d5f365f15")
  self.assertEqual(v.NFT_SHA,"985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af")
  self.assertIn("physical-v20-steam-retired-preview-install.json",src)
  self.assertEqual(v.V20_INSTALL_RECEIPT_SHA,"eb9da5ca2dd0ef08a657ff13fcfe299230111bb5a00f6f0471129d643c593a6f")
  self.assertIn("SOURCE_QUALIFIED_V20_PHYSICAL_INSTALL_RECEIPT_SHA",src)
  self.assertIn("PASS_V20_RETIRED_PREVIEW_PROTECTED_STEAM_RENEWAL",src)
  self.assertIn("PASS_REAL_V20_WEB3032_RETURN_TO_B1EF_UNAUTHENTICATED",src)
  self.assertIn("C03_APP_HANDOFF_ACCEPTED",src)
  self.assertNotIn("REPLACE_EXACT_SOURCE_SHA_AT_STAGING",src)

 def test_finance_guard_does_not_depend_on_retired_steam_v17(self):
  self.assertNotIn("self.trial.finance()",src)
  self.assertIn("self.v20.native_snapshot()",src)
  self.assertIn("PROTECTED_V20_POST_C01_C03_C04_NFT",src)
  self.assertIn("PROTECTED_ORIGINAL_MEMORY_MAX",src)
  for port in (8092,8093,8094,8095):
   self.assertIn("(8092,8093,8094,8095)",src)
  self.assertIn("self.v20.health(profile,expected)",src)
  self.assertIn("self.trial.protected_public_health(artifact)",src)
  self.assertIn("STEAM_PROFILE_MISMATCH",src)
  self.assertIn("V20_ACCEPTED_RUNTIME_NOT_BOUND_TO_LIVE_PID",src)

 def test_source_no_financial_mutation_and_no_extra_next(self):
  for text in ("systemctl unmask","GRANT ALL","ALTER ROLE","UPDATE payout",
               "127.0.0.1:8092","127.0.0.1:8093","systemctl start wolo-satchel",
               "3033 start","source-qualified-approval-bypass"):
   self.assertNotIn(text,src)
  self.assertIn("app_runtime_count=2",src)
  self.assertIn("financial_authorized",src)
  self.assertIn("money_moved",src)
  self.assertIn("ONE_USE_RESULT_EXISTS",src)

 def test_no_implicit_real_website_action(self):
  with self.assertRaisesRegex(v.Hold,"NO_IMPLICIT_PRODUCTION_SWITCH"):
   v.main([])
  with self.assertRaisesRegex(v.Hold,"NO_IMPLICIT_PRODUCTION_SWITCH"):
   v.main(["--unreviewed"])

 def test_requires_actual_root_source_not_user_file(self):
  with patch.object(v.os,"geteuid",return_value=501):
   with self.assertRaisesRegex(v.Hold,"ROOT_ONLY"):
    v.get_core()

 def test_cycle_positive_negative_and_permanent_original_fallback(self):
  fake_spec=importlib.util.spec_from_file_location(
      "isolated_original_v18_state_machine_test",
      ROOT/"tests/test_r25_c03_v18_reversible_roundtrip_v1.py")
  t=importlib.util.module_from_spec(fake_spec)
  sys.modules[fake_spec.name]=t
  fake_spec.loader.exec_module(t)
  with patch.object(t.m,"V18_UNIT_SHA",v.V20_UNIT_SHA),patch.object(t.m,"V18_SOURCE_SHA",v.STEAM_SHA),patch.object(t.m,"FIN_SNAPSHOT",v.V20_FIN_SHA):
   h=t.FakeHost()
   result=t.m.reversible_cycle(h)
   self.assertEqual(result["status"],"PASS_V18_ROLLBACK_AND_RETURN_TO_EXACT_B1EF_NO_FINANCE")
   self.assertEqual(result["final"]["pid"],465837)
   self.assertFalse(result["C03_APP_HANDOFF_ACCEPTED"])
   for point in ("health_rollback","enroll_rollback","refresh_candidate","health_candidate"):
    bad=t.FakeHost(fail_at=point)
    fail=t.m.reversible_cycle(bad)
    self.assertTrue(fail["status"].startswith("HOLD_"))
    self.assertEqual(fail["negative_recovery"],"PASS_SAFE_RECOVERY_TO_CANDIDATE")
    self.assertTrue(fail["final"]["finance_ports_closed"])
   h=t.FakeHost()
   def no_candidate(profile):
    if profile=="candidate":raise t.m.Hold("PERMANENT_SOURCE_DID_NOT_HEALTH")
   h.wait_health=no_candidate
   fail=t.m.reversible_cycle(h)
   self.assertEqual(fail["negative_recovery"],"PASS_SAFE_RECOVERY_TO_ROLLBACK")
   self.assertFalse(fail["finance_authorized"])
   self.assertEqual(fail["final"]["profile"],"rollback")

if __name__=="__main__":
 unittest.main()
