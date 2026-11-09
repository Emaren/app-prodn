"""V19 exact-source one-use installer: static and adversarial, no real host."""
import hashlib
import importlib.util
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"scripts/release/r25_c03_steam_v19_retired_preview_install_v1.py"
v19=ROOT/"scripts/release/r25_steam_refresh_traffic_v19.py"
unit=ROOT/"scripts/release/r25_steam_refresh_traffic_v19.service"
spec=importlib.util.spec_from_file_location("v19_installer",SRC)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class V19Install(unittest.TestCase):
 def test_pinned_exact_source_and_permanent_3032(self):
  self.assertEqual(hashlib.sha256(v19.read_bytes()).hexdigest(),m.V19_SOURCE_SHA)
  self.assertEqual(hashlib.sha256(unit.read_bytes()).hexdigest(),m.V19_UNIT_SHA)
  self.assertEqual(m.V18_UNIT_SHA,"8dae3ac8f4f9ac0d01fed6ddde4a82bb0e6de28ced2553eba9c24349533c3032")
  self.assertEqual(m.WEB_SHA,"f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a")
  self.assertEqual(m.RETIRED_SHA,"38cec1654b260a753b36fe185ff0bca2baf177dc2a3d25f86b423321b3aab3e3")
  self.assertEqual(m.APP_SOURCE,"b1ef050b954be734c9f34147361e0d02d7c89b19")
  self.assertEqual(m.APP_BUILD,"QVzgMJiQwhFvwrRbY9oZW")

 def test_no_site_restart_or_financial_boundary_mutation(self):
  src=SRC.read_text()
  for forbidden in ("systemctl unmask","ALTER ROLE","GRANT ALL","DROP DATABASE",
                    "systemctl restart aoe2hdbets-web-prod",
                    "systemctl stop aoe2hdbets-web-prod",
                    "systemctl start aoe2hdbets-web-prod",
                    "127.0.0.1:8092","127.0.0.1:8093","/satchel/v1/returns/execute"):
   self.assertNotIn(forbidden,src)
  self.assertIn("money_moved",src)
  self.assertIn("financial_authorized",src)
  self.assertIn("ONE_USE_RESULT",src)
  self.assertIn("PASS_EXACT_V18_FAIL_CLOSED_UNIT_RESTORED",src)
  self.assertIn("PASS_V19_RETIRED_PREVIEW_PROTECTED_STEAM_RENEWAL",src)
  self.assertIn("V19_REFRESH_NOT_ACCEPTED",src)
  self.assertIn("PROTECTED_ROLLBACK_OR_VALIDATOR_DRIFT",src)

 def test_wrong_source_hash_denied(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/"test.py";p.write_text("safe")
   with patch.object(m,"STEAM_SRC",p):
    with self.assertRaisesRegex(m.Hold,"PINNED_ROOT_SOURCE"):
     m.pinned(p,m.V19_SOURCE_SHA)

 def test_tmp_atomic_unit_name_rejected_when_exists(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/"test.unit";path.write_text("existing")
   with self.assertRaisesRegex(m.Hold,"ONE_USE_FILE_EXISTS"):
    m.write(path,b"new",0o644)

 def test_symlink_refused_and_no_follow_on_receipt(self):
  with tempfile.TemporaryDirectory() as tmp:
   link=Path(tmp)/"unit"
   link.symlink_to("/etc/passwd")
   with self.assertRaisesRegex(m.Hold,"ONE_USE_FILE_EXISTS"):
    m.write(link,b"clobber",0o644)

 def test_source_requires_exact_protected_r24_state_and_no_finance(self):
  text=SRC.read_text()
  for target in ('"MainPID")=="0"','"ActiveState")=="inactive"',
                 "FINANCE_LISTENER_OPEN","EXACT_RETAINED_PUBLIC_R25_MISSING",
                 "ALREADY_PUBLISHED_OR_PREVIOUS_ACTION",
                 "V19_TIMER_NOT_ACTIVE","ORIGIN_PROOF"):
   self.assertIn(target,text)

if __name__=="__main__":
 unittest.main()
