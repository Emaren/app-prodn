"""Never install unreviewed launchd/systemd units; source-only schedule safety."""
import plistlib,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DEPLOY=ROOT/"deploy/storage-sentinel"
class TestSentinelSchedules(unittest.TestCase):
 def test_mac_launchd_is_local_partial_read_only_and_not_prearmed(self):
  p=plistlib.loads((DEPLOY/"org.aoe2war.storage-sentinel-mac.plist").read_bytes())
  self.assertEqual(p["StartInterval"],900)
  self.assertFalse(p["RunAtLoad"])
  args=p["ProgramArguments"]
  self.assertIn("aoe2_storage_probe.py",args[1])
  self.assertEqual(args[-2:],["--plane","mac"])
  self.assertIn("__OPERATOR_PRIVATE_DIR__",p["StandardOutPath"])
 def test_hel1_timer_is_bounded_not_a_new_host_scanner(self):
  tick=(DEPLOY/"aoe2war-storage-sentinel-tick.service").read_text()
  deliver=(DEPLOY/"aoe2war-storage-sentinel-deliver.service").read_text()
  for unit in (tick,deliver):
   for required in ("NoNewPrivileges=yes","ProtectSystem=strict","ProtectHome=yes",
                    "User=aoe2war-sentinel","Type=oneshot","ReadWritePaths=/var/lib/aoe2war-storage-sentinel"):
    self.assertIn(required,unit)
   for dangerous in ("--apply","systemctl start","chmod 777","sudo ","rm -rf","/dev/loop4"):
    self.assertNotIn(dangerous,unit)
  self.assertIn("PrivateNetwork=yes",tick)
  self.assertIn("EnvironmentFile=/etc/aoe2war/storage-sentinel-private.env",deliver)
  self.assertIn(" aoe2_storage_sentinel.py tick ",tick.replace("/scripts/aoe2_storage_sentinel.py"," aoe2_storage_sentinel.py"))
  self.assertIn("aoe2_storage_sentinel.py deliver",deliver)
  for name in ("aoe2war-storage-sentinel-tick.timer","aoe2war-storage-sentinel-deliver.timer"):
   timer=(DEPLOY/name).read_text()
   self.assertIn("OnUnitActiveSec=5min",timer)
   self.assertIn("Persistent=true",timer)
 def test_no_public_route_ingestion_or_notification_writer(self):
  server=(ROOT/"lib/aoe2StorageSentinelServer.ts").read_text()
  writer=(ROOT/"scripts/aoe2_storage_sentinel_inbox.mts").read_text()
  self.assertIn("server-only",server)
  self.assertIn("O_NOFOLLOW",server)
  self.assertIn("STORAGE_SENTINEL_DELIVERY_ENABLED",writer)
  self.assertNotIn("export async function POST",writer)
  self.assertNotIn("fetch(",writer)
if __name__=="__main__":unittest.main()
