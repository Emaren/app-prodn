"""Exact consumed v13/DNS rollback-hold recovery; candidate-only one-use."""
import hashlib,importlib.util
from pathlib import Path
from unittest import TestCase,main
R=Path(__file__).resolve().parents[1]
def load(path,name):
 spec=importlib.util.spec_from_file_location(name,path)
 obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj)
 return obj
c=load(R/"scripts/r25_c_start_root.py","candidate_new_c")
r=load(R/"scripts/r25_c_stopped_resolver_recovery_8862.py","stopped_new_r")
class StoppedRecovery(TestCase):
 def test_exact_failed_receipt_and_source_identity(self):
  self.assertEqual(r.CONTROLLER_SHA,"5dba6ee5d0bdd65eb0102fbd709963f9410eacd7716eb9e0ddef7fafa3330141")
  self.assertEqual(r.NEW_CONTROLLER_SHA,hashlib.sha256((R/"scripts/r25_c_start_root.py").read_bytes()).hexdigest())
  self.assertEqual(r.NEW_CONTROLLER_SIZE,(R/"scripts/r25_c_start_root.py").stat().st_size)
  self.assertEqual(r.SCOPE,"RECOVER_STOPPED_NONFINANCIAL_3032_ONLY")
  self.assertEqual(r.OLD,"bdb134fe4013c9b26f382b55e232638b1d1f5874")
  self.assertEqual(r.NEW,"88621f9798ea2a0982751abdac1aee93bc820d67")
  self.assertEqual(r.FAILED_ENTERED_SHA,"c458794f63856c1aa026b306f8b9e487a812f53719138bd34400f267a8ecb17f")
  self.assertEqual(r.FAILED_HOLD_SHA,"a5c17de1fea1acd53cc9857b137996b909a3b943e0afde82b337ace53f56c995")
  self.assertEqual(r.FAILED_ROLLBACK_ADMISSION_SHA,"2e5cb9307b524289e0d9bedd4989b87e4832bb0a3cff4d237fae01b1944fb642")
 def test_old_app_with_read_only_dns_renders_new_app_exact_canonical_unit(self):
  old=c.production_unit_bytes(Path(r.OLD_STAGE))
  new=r.render_unit(old)
  self.assertEqual(new,c.production_unit_bytes(Path(r.NEW_STAGE)))
  bind=b"BindReadOnlyPaths=/run/systemd/resolve/stub-resolv.conf:/run/systemd/resolve/stub-resolv.conf\n"
  self.assertEqual(new.count(bind),1)
  self.assertEqual(old.count(bind),1)
  self.assertNotIn(b"ReadWritePaths=/run",new)
 def test_fails_closed_and_keeps_public_and_financial_untouched(self):
  source=(R/"scripts/r25_c_stopped_resolver_recovery_8862.py").read_text()
  for marker in ("FAILED_RESOLVER_RECEIPTS_CHANGED","STOPPED_RESOLVER_FAILURE_CONTEXT_CHANGED",
                 "STOPPED_ISOLATED_SERVICE_NOT_PROVED","ISOLATED_3032_LISTENER_STILL_PRESENT",
                 "PUBLIC_3030_PID_CHANGED","EXACT_STOPPED_RECOVERY_REQUIRED",
                 'before.get("source_sha")','public_cutover_authorized','financial_authorized'):
   if marker=='before.get("source_sha")':continue
   self.assertIn(marker,source)
  self.assertIn("write_atomic(CONTROLLER, controller, 0o644)",source)
  self.assertIn("rollback_unit = unit",source)
  self.assertIn('restored = ready_profile(c, before',source)
  self.assertNotIn("systemctl restart nginx",source)
  self.assertNotIn("nft flush ruleset",source)
if __name__=="__main__":main()
