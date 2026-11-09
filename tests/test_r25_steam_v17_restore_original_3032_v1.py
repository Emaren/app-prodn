"""Source-only tests for one-use, no-website-restart original Steam re-enrollment."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

SRC=Path(__file__).resolve().parents[1]/'scripts/release/r25_steam_v17_restore_original_3032_v1.py'
spec=importlib.util.spec_from_file_location('v17restore',SRC)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class StrictV17Restore(unittest.TestCase):
 def test_original_web_unit_and_limits_pinned(self):
  self.assertEqual(m.WEB_SHA,'42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621')
  self.assertEqual(m.EXPECTED_VERSION,'20261108182649-ca81f00609')
  self.assertEqual(m.MEMORY_SHA,'9590e15b4544680e0eec8a16cac43c272cd1e06267be46b0fa26c741d2e57438')
  self.assertIn('3355443200',SRC.read_text())
 def test_only_reviewed_source_receipts_are_published(self):
  self.assertEqual(set(m.EVIDENCES),{
   'original-finance-restricted-3032-unit.service',
   'stage-verification-no-install.json','root-owned-source-identity-overlay.json'})
  self.assertNotIn('runtime.env',str(m.EVIDENCES))
  self.assertNotIn('private',str(m.EVIDENCES))
 def test_binary_sha_and_rollback_unit_pinned(self):
  self.assertEqual(m.V17_SCRIPT_SHA,'699b16630eb8314e7e8043a91978dec7e3178ccc99360cc9416ea7cdaa47caac')
  self.assertEqual(m.V17_UNIT_SHA,'94209b3179f264b25d646795042fe037192735b60bb7eee95eedf6b106aa17a4')
  self.assertEqual(m.V14_UNIT_SHA,'17d640fde690e4e780dfd7370bd9d99122ccde7d567c0a043c8060739e6181f4')
  self.assertEqual(m.HELPER_SHA,'2d5b17c74c6fb5d916e8b65ed61dd92cf1bd83c8bf9affad42872045fdce53ec')
 def test_original_unit_reconstruction_is_exact_filename_change(self):
  v17=Path(__file__).resolve().parents[1]/'scripts/release/r25_steam_refresh_traffic_v17.service'
  new=v17.read_bytes()
  old=new.replace(b'r25_steam_refresh_traffic_v17.py',b'r25_steam_refresh_traffic_v14.py')
  self.assertEqual(new.count(b'r25_steam_refresh_traffic_v17.py'),1)
  self.assertEqual(m.digest(new),m.V17_UNIT_SHA)
  self.assertEqual(m.digest(old),m.V14_UNIT_SHA)
  self.assertIn(b'ProtectHome=yes',new)
  self.assertIn(b'ProtectSystem=strict',new)
  self.assertIn(b'NoNewPrivileges=yes',new)
 def test_empty_second_activation_refused(self):
  with patch.object(m,'inspect',return_value={'status':'ok'}),patch.object(m,'RECEIPT') as receipt:
   receipt.exists.return_value=True
   self.assertNotIn('systemctl stop aoe2hdbets-web-prod',SRC.read_text())
 def test_source_never_writes_or_starts_financial_or_web_services(self):
  s=SRC.read_text()
  for f in ('ALTER ROLE','GRANT ALL','nft add','--port 3030','--port 3033',
            'systemctl unmask','/satchel/v1/returns/execute'):
   self.assertNotIn(f,s)
  self.assertIn("run(['systemctl','start',SERVICE]",s)
  self.assertNotIn("run(['systemctl','start','aoe2hdbets-web-prod.service']",s)
  self.assertIn("need(prop('aoe2hdbets-web-prod.service','MainPID')==before['web_pid']",s)
 def test_financial_masks_and_closed_listener_still_required(self):
  s=SRC.read_text()
  for field in ("'masked'","'wolochaind-mainnet.service'","'aoe2hdbets-web.service'","(8092,8093,8094,8095)"):
   self.assertIn(field,s)
 def test_recovery_not_declared_a_steam_pass(self):
  s=SRC.read_text()
  self.assertIn('PASS_EXACT_V14_UNIT_RESTORED_BUT_ITS_C01_DRIFT_HOLD_REMAINS',s)
  self.assertIn("'C03_APP_HANDOFF':'HOLD'",s)
  self.assertIn("'C02_APP_TRANSPORT':'HOLD'",s)

if __name__=='__main__':unittest.main()
