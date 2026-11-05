"""A05: exact 3032-only DNS mount renewal with fail-closed rollback identity."""
import importlib.util
from pathlib import Path
import hashlib
from unittest import TestCase, main

ROOT=Path(__file__).resolve().parents[1]
def load(name, rel):
 spec=importlib.util.spec_from_file_location(name, ROOT/rel)
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 return module

r=load('a05_dns_8862', 'scripts/r25_c_contained_runtime_refresh_dns_8862.py')
c=load('a05_dns_8862_controller', 'scripts/r25_c_start_root.py')
BIND=b'BindReadOnlyPaths=/run/systemd/resolve/stub-resolv.conf:/run/systemd/resolve/stub-resolv.conf\n'

class DnsContainedRefresh(TestCase):
 def test_exact_scope_and_source_artifact(self):
  self.assertEqual(r.OLD,'bdb134fe4013c9b26f382b55e232638b1d1f5874')
  self.assertEqual(r.NEW,'88621f9798ea2a0982751abdac1aee93bc820d67')
  self.assertEqual(r.NEW_CONTROLLER_SHA, hashlib.sha256((ROOT/'scripts/r25_c_start_root.py').read_bytes()).hexdigest())
  self.assertEqual(r.NEW_CONTROLLER_SIZE,136658)
  self.assertEqual(r.STAGE_RECEIPT_SHA,'d03ac30beef269f987a3e65a7bf6d21332deb368774dbaf0b08d19786c2d5ffe')
  self.assertEqual(r.ARTIFACT_SHA,'8d030a643adc5752962f2b23c46eaa9d3f62b3c903b87b66ac79b4e9a184069a')
  self.assertEqual(r.SCOPE,'REFRESH_EXISTING_NONFINANCIAL_3032_ONLY')
  self.assertEqual(r.CONTROLLER_SHA,'9d17d780bc08989a42ed850eea8db244871f2434c38954ee0477195a3c85488e')
 def test_only_single_readonly_mount_and_exact_new_unit(self):
  old=c.production_unit_bytes(Path(r.OLD_STAGE)).replace(BIND,b'')
  self.assertEqual(old.count(r.OLD_STAGE.encode()),4)
  revised=r.render_unit(old)
  self.assertEqual(revised,c.production_unit_bytes(Path(r.NEW_STAGE)))
  self.assertEqual(revised.count(BIND),1)
  self.assertIn(b'TemporaryFileSystem=/run:ro\n',revised)
  self.assertNotIn(b'BindPaths=/run/systemd/resolve',revised)
  self.assertNotIn(b'ReadWritePaths=/run',revised)
 def test_dns_mount_preimage_drift_denied(self):
  old=c.production_unit_bytes(Path(r.OLD_STAGE)).replace(BIND,b'')
  for invalid in (old+ BIND,old.replace(b'TemporaryFileSystem=/run:ro\n',b''),old.replace(b'NoNewPrivileges=yes',b'NoNewPrivileges=no')):
   with self.assertRaises(r.Hold):r.render_unit(invalid)
 def test_rollback_uses_original_controller_and_no_financial_or_public_switch(self):
  text=(ROOT/'scripts/r25_c_contained_runtime_refresh_dns_8862.py').read_text()
  self.assertIn('original = load_controller(old_controller, "rollback_original_controller")',text)
  self.assertIn('restored = ready_profile(original, before',text)
  self.assertIn('write_atomic(CONTROLLER, old_controller, 0o644)',text)
  self.assertIn('"public_nginx_changes": False, "financial_authorized": False',text)
  self.assertIn('"public_cutover_authorized": False',text)
  self.assertIn('candidate_systemd("stop", TIMER)',text)
  self.assertIn('stopped_isolated_candidate(c, plan["old_pid"])',text)

if __name__=='__main__':main()
