"""V20 retry requires a genuinely distinct one-use negative V19 receipt."""
import hashlib,importlib.util
from pathlib import Path
import tempfile,unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"scripts/release/r25_c03_steam_v20_sandbox_ro_install_v1.py"
V20=ROOT/"scripts/release/r25_steam_refresh_traffic_v20.py"
UNIT=ROOT/"scripts/release/r25_steam_refresh_traffic_v20.service"
spec=importlib.util.spec_from_file_location("v20_exact_sandbox_retry_installer",SRC)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ReviewOneUse(unittest.TestCase):
 def test_all_new_source_digest_and_prior_negative(self):
  self.assertEqual(hashlib.sha256(V20.read_bytes()).hexdigest(),m.V20_SOURCE_SHA)
  self.assertEqual(hashlib.sha256(UNIT.read_bytes()).hexdigest(),m.V20_UNIT_SHA)
  self.assertEqual(m.PRIOR_FAILED_V19_SHA,"c8b828cf30c9e8df1562a87ba7a061b87faca8dc8aa4e105c49b994e94682a69")
  self.assertEqual(m.PRIOR_SOURCE_V19_SHA,"76f48e21de2bc504af121f1c0ae91a8353b72b51bac360ddb7d3f7a24468ba1c")
  self.assertEqual(m.V18_UNIT_SHA,"8dae3ac8f4f9ac0d01fed6ddde4a82bb0e6de28ced2553eba9c24349533c3032")
  self.assertIn("PREVIOUS_FAILED_STEAM_ROLLBACK_NOT_SEALED",SRC.read_text())
  self.assertIn("V20_INSTALL_READONLY_PRECHECK",SRC.read_text())
  self.assertIn("PASS_V20_RETIRED_PREVIEW_PROTECTED_STEAM_RENEWAL",SRC.read_text())

 def test_no_website_switch_or_raw_payment_service(self):
  code=SRC.read_text()
  for text in ("systemctl unmask","8092/api","8093/api","systemctl stop aoe2hdbets-web-prod","systemctl start aoe2hdbets-web-prod","GRANT ALL"):
   self.assertNotIn(text,code)
  self.assertIn("ONE_USE_RESULT",code)
  self.assertIn("PASS_EXACT_V18_FAIL_CLOSED_UNIT_RESTORED",code)
  self.assertIn("V20_REFRESH_NOT_ACCEPTED",code)

 def test_root_preimage_wrong_digest_denied(self):
  with tempfile.TemporaryDirectory() as d:
   f=Path(d)/"source";f.write_text("not source")
   with self.assertRaisesRegex(m.Hold,"PINNED_ROOT_SOURCE"):
    m.pinned(f,m.V20_SOURCE_SHA)
 def test_one_use_symlink_refused(self):
  with tempfile.TemporaryDirectory() as d:
   f=Path(d)/"receipt";f.symlink_to("/etc/passwd")
   with self.assertRaisesRegex(m.Hold,"ONE_USE_FILE_EXISTS"):
    m.write(f,b"no",0o600)
 def test_receipt_append_only(self):
  with tempfile.TemporaryDirectory() as d:
   f=Path(d)/"receipt"
   m.write(f,b"first",0o600)
   with self.assertRaisesRegex(m.Hold,"ONE_USE_FILE_EXISTS"):
    m.write(f,b"second",0o600)
if __name__=="__main__":
 unittest.main()
