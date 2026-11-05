"""A05 isolated-only successor, source/rollback/role evidence pinned."""
from pathlib import Path
from unittest import TestCase,main
import hashlib,importlib.util
ROOT=Path(__file__).resolve().parents[1]
def load(filename,name):
 spec=importlib.util.spec_from_file_location(name, ROOT/filename)
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 return m
c=load("scripts/r25_c_start_root.py","C_controller")
r=load("scripts/r25_c_preview_readonly_refresh_20261105.py","r25_5route")
DNS=b"BindReadOnlyPaths=/run/systemd/resolve/stub-resolv.conf:/run/systemd/resolve/stub-resolv.conf\n"
class FiveRouteCandidate(TestCase):
 def test_source_pins_and_candidate_only(self):
  self.assertEqual(r.OLD,"88621f9798ea2a0982751abdac1aee93bc820d67")
  self.assertEqual(r.NEW,"cffee3b8fd208f0081470594b4c7d0fac1a71816")
  self.assertEqual(r.CONTROLLER_SHA,hashlib.sha256((ROOT/"scripts/r25_c_start_root.py").read_bytes()).hexdigest())
  self.assertEqual(r.NEW_CONTROLLER_SHA,r.CONTROLLER_SHA)
  self.assertEqual(r.NEW_CONTROLLER_SIZE,(ROOT/"scripts/r25_c_start_root.py").stat().st_size)
  self.assertEqual(r.SCOPE,"REFRESH_EXISTING_NONFINANCIAL_3032_ONLY")
  self.assertEqual(r.STAGE_RECEIPT_SHA,"612822d5d37f905d0b919869ef1e8bc9619da06b3b29a8cc0b4577c0620ddd1d")
  self.assertEqual(r.ARTIFACT_SHA,"b8fdf221f679372c95c5c8c2df44a1355fa1a26e128aad8bd848975fd96f37b6")
  self.assertEqual(r.BUILD_VERSION,"20261105181134-0ba51cfcd0")
  self.assertEqual(r.BUILD_ID,"io9We0f4HD2LVLndzYYjn")
 def test_canonical_one_bind_per_unit(self):
  before=c.production_unit_bytes(Path(r.OLD_STAGE))
  after=r.render_unit(before)
  self.assertEqual(before.count(DNS),1)
  self.assertEqual(after.count(DNS),1)
  self.assertEqual(after,c.production_unit_bytes(Path(r.NEW_STAGE)))
  self.assertNotIn(b"ReadWritePaths=/run",after)
 def test_exact_source_route_gates(self):
  self.assertEqual(len(r.ROUTES),13)
  self.assertEqual(len(set(r.ROUTES)),13)
  for x in ("/ai","/kingdom","/kingdom-bettors","/oracle","/war-engine"):
   self.assertIn(x,r.ROUTES)
 def test_old_app_rollback_without_dns_or_acl_relaxation(self):
  s=(ROOT/"scripts/r25_c_preview_readonly_refresh_20261105.py").read_text()
  self.assertIn("rollback_unit = unit",s)
  self.assertIn("rollback_unit == c.production_unit_bytes(Path(OLD_STAGE))",s)
  self.assertIn("restored = ready_profile(c, before",s)
  self.assertIn("stopped_isolated_candidate",s)
  self.assertIn('\"financial_authorized\": False, \"public_cutover_authorized\": False',s)
  self.assertIn('\"public_nginx_changes\": False',s)
  self.assertNotIn("nft flush",s)
if __name__=="__main__":main()
