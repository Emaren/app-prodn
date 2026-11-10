"""V20: Nginx routing proved without invoking nginx -T in read-only systemd."""
import hashlib,importlib.util
from pathlib import Path
import tempfile,unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"scripts/release/r25_steam_refresh_traffic_v20.py"
UNIT=ROOT/"scripts/release/r25_steam_refresh_traffic_v20.service"
spec=importlib.util.spec_from_file_location("exact_v20_sandbox_ro",SRC)
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)

class ReadOnlyNginxRoute(unittest.TestCase):
 def setup_fixture(self,folder):
  root=Path(folder); (root/"conf.d").mkdir(); (root/"sites-available").mkdir()
  (root/"nginx.conf").write_text("events { worker_connections 100; }")
  site=root/"sites-available"/"aoe2war.com"
  site.write_text("server { proxy_pass http://127.0.0.1:3032; }")
  for idx in range(90):
   (root/"conf.d"/f"synthetic-{idx:03d}.conf").write_text("# Synthetic test only: no external selector\n"+"x"*1600)
  return root,site

 def test_exact_source_unit_and_original_no_write_guards(self):
  self.assertEqual(hashlib.sha256(UNIT.read_bytes()).hexdigest(),v.STEAM_V20_UNIT_SHA256)
  self.assertEqual(v.NGINX_SHA,"811cb9f1d4152a8573bc83ba27002206dcd5db1b2272b796c2c6dd919436425f")
  source=SRC.read_text()
  self.assertNotIn("exec_out(['/usr/sbin/nginx','-T']",source)
  self.assertIn("NGINX_CONFIG_CENSUS_MISSING",source)
  self.assertIn("R24_NGINX_SELECTOR_PRESENT",source)
  self.assertIn("FIN_SNAPSHOT",source)
  self.assertIn("STEAM_NFT_SHAPE_DRIFT",source)
  self.assertIn("C04_EXACT_MASK_HELPER_SOURCE_DRIFT",source)
  self.assertIn("C01_ORIGINAL_PREVIEW_FINGERPRINTS_CHANGED",source)
  self.assertIn("PRESERVED_PREVIEW_PID_DRIFT",source)
  self.assertNotIn("systemctl unmask",source)

 def test_sandbox_safe_source_census_good_and_reject_new_route(self):
  with tempfile.TemporaryDirectory() as d:
   root,site=self.setup_fixture(d)
   with patch.object(v,"NGINX_CONFIG_ROOT",root),patch.object(v,"NGINX",site),patch.object(v,"NGINX_SHA",hashlib.sha256(site.read_bytes()).hexdigest()),patch.object(v,"verified",side_effect=lambda path:Path(path).read_bytes()):
    self.assertEqual(v.nginx_config_has_no_retired_3031(),92)
    (root/"conf.d"/"synthetic-033.conf").write_text("proxy_pass http://127.0.0.1:3031;")
    with self.assertRaisesRegex(RuntimeError,"R24_NGINX_SELECTOR_PRESENT"):
     v.nginx_config_has_no_retired_3031()

 def test_canonical_site_changed_denied(self):
  with tempfile.TemporaryDirectory() as d:
   root,site=self.setup_fixture(d)
   wrong="0"*64
   with patch.object(v,"NGINX_CONFIG_ROOT",root),patch.object(v,"NGINX",site),patch.object(v,"NGINX_SHA",wrong),patch.object(v,"verified",side_effect=lambda path:Path(path).read_bytes()):
    with self.assertRaisesRegex(RuntimeError,"R24_CANONICAL_NGINX_SOURCE_DRIFT_OR_SELECTOR"):
     v.nginx_config_has_no_retired_3031()

 def test_main_config_missing_denied(self):
  with tempfile.TemporaryDirectory() as d:
   root,site=self.setup_fixture(d)
   (root/"nginx.conf").unlink()
   with patch.object(v,"NGINX_CONFIG_ROOT",root),patch.object(v,"NGINX",site),patch.object(v,"NGINX_SHA",hashlib.sha256(site.read_bytes()).hexdigest()),patch.object(v,"verified",side_effect=lambda path:Path(path).read_bytes()):
    with self.assertRaisesRegex(RuntimeError,"NGINX_CONFIG_CENSUS_MISSING"):
     v.nginx_config_has_no_retired_3031()

 def test_unexpected_excessive_configuration_denied(self):
  with tempfile.TemporaryDirectory() as d:
   root,site=self.setup_fixture(d)
   (root/"conf.d"/"oversize.conf").write_bytes(b" "*(1048577))
   with patch.object(v,"NGINX_CONFIG_ROOT",root),patch.object(v,"NGINX",site),patch.object(v,"NGINX_SHA",hashlib.sha256(site.read_bytes()).hexdigest()),patch.object(v,"verified",side_effect=lambda path:Path(path).read_bytes()):
    with self.assertRaisesRegex(RuntimeError,"NGINX_CONFIG_FILE_TYPE_OR_SIZE"):
     v.nginx_config_has_no_retired_3031()

if __name__=="__main__":
 unittest.main()
