"""V5V: narrow public website repair cannot silently waive Steam/security state."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from unittest.mock import patch
import hashlib
import unittest
SOURCE=Path(__file__).resolve().parents[1]/'scripts/release/r25_steam_refresh_v5v.py'
sp=importlib.util.spec_from_file_location('steam_v5v_source',SOURCE)
m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)

def canonical_synthetic():
 site=b''.join(b'proxy_pass http://127.0.0.1:3032;\n' for _ in range(6))
 site+=b'''
 location = /api/user/appearance
 location = /api/kingdom-presence/state
 location ^~ /clans/
 location ^~ /uploads/
 location = /_next/image
 location ^~ /api/ {
 '''
 mapping=b'~^(POST|PUT|DELETE):https://(www\\.)?aoe2war\\.com$ 1;'
 prior=b'known original'
 stage1=b'known first recovery'
 return {m.NGINX:site,m.RECOVERY_MAP:mapping,
         m.ORIGINAL_NGINX_PREIMAGE:prior,m.FIRST_RECOVERY_STAGE:stage1}

class ReviewedRecoveryV5V(unittest.TestCase):
 def test_source_pins_site_and_map_and_preimages(self):
  self.assertEqual(m.NGINX_SHA,'9192a8e775b4e94e59701ba0f7ad6e5373a88aa97f5a7c0f3f633b4ea3bfabc7')
  self.assertEqual(m.RECOVERY_MAP_SHA,'e6c598cb63bdfa6c5b84623494fe5d337cfea5ecd8abb574ee59071ba85af3ea')
  self.assertEqual(m.ORIGINAL_NGINX_PREIMAGE_SHA,'35bbfcbe9e502bc59bc14e89014c0a20c01a272ff68743259e598dfbdec29c9f')
  self.assertEqual(m.FIRST_RECOVERY_SHA,'9571d6eda0c7bc717dc4a37beb7e978569994195e9355bc056e0c69556d0184b')
  self.assertEqual(m.NEW_SELF.name,'r25_steam_refresh_public_recovery_v5v.py')
  self.assertEqual(m.ADMISSION.parent.name,'web-prod-v5v')
  self.assertEqual(m.POLICY.parent.name,'web-prod-v5v')

 def test_reviewed_bridge_expected_exact_shapes(self):
  fake=canonical_synthetic()
  hashes={fake[m.NGINX]:m.NGINX_SHA,fake[m.RECOVERY_MAP]:m.RECOVERY_MAP_SHA,
          fake[m.ORIGINAL_NGINX_PREIMAGE]:m.ORIGINAL_NGINX_PREIMAGE_SHA,
          fake[m.FIRST_RECOVERY_STAGE]:m.FIRST_RECOVERY_SHA}
  with patch.object(m,'rawfile',side_effect=lambda p,mode=None:fake[p]), \
       patch.object(m,'sha',side_effect=lambda b:hashes.get(b,hashlib.sha256(b).hexdigest())):
   self.assertTrue(m.reviewed_nonfinancial_bridge())

 def test_reviewed_bridge_rejects_each_modified_protected_input(self):
  baseline=canonical_synthetic()
  hashes={raw:known for raw,known in zip(baseline.values(),[
   m.NGINX_SHA,m.RECOVERY_MAP_SHA,m.ORIGINAL_NGINX_PREIMAGE_SHA,m.FIRST_RECOVERY_SHA])}
  for p in baseline:
   altered=dict(baseline);altered[p]=altered[p]+b' unauthorised mutation'
   with self.subTest(p=p.name),patch.object(m,'rawfile',side_effect=lambda path,mode=None:altered[path]),\
        patch.object(m,'sha',side_effect=lambda b:hashes.get(b,hashlib.sha256(b).hexdigest())):
    with self.assertRaisesRegex(RuntimeError,'HOLD:R25_NONFINANCIAL_PUBLIC_BRIDGE_CHANGED'):
     m.reviewed_nonfinancial_bridge()

 def test_unreviewed_proxy_and_route_contamination_rejected(self):
  baseline=canonical_synthetic()
  hashes={raw:known for raw,known in zip(baseline.values(),[
   m.NGINX_SHA,m.RECOVERY_MAP_SHA,m.ORIGINAL_NGINX_PREIMAGE_SHA,m.FIRST_RECOVERY_SHA])}
  variants=[
   (m.NGINX,baseline[m.NGINX].replace(b'proxy_pass http://127.0.0.1:3032;',b'proxy_pass http://127.0.0.1:3030;',1)),
   (m.NGINX,baseline[m.NGINX].replace(b'location = /api/user/appearance',b'location = /api/bets/wager')),
   (m.RECOVERY_MAP,baseline[m.RECOVERY_MAP].replace(b'aoe2war',b'otherorigin')),
  ]
  for changed_path,changed in variants:
   altered=dict(baseline);altered[changed_path]=changed
   with self.subTest(changed_path=changed_path.name),\
        patch.object(m,'rawfile',side_effect=lambda p,mode=None:altered[p]),\
        patch.object(m,'sha',side_effect=lambda b:hashes.get(b,hashlib.sha256(b).hexdigest())):
    with self.assertRaises(RuntimeError):m.reviewed_nonfinancial_bridge()

 def test_source_does_not_enable_legacy_fund_execution(self):
  s=SOURCE.read_text()
  for token in ('"finance_authorized":False','"modifies_financial_services":False',
                '"public_cutover_authorized":False','"public_recovery_is_nonfinancial_only":True',
                'STEAM_ONLY_EXISTING_UID990_NFT_SETS',
                'R25_NONFINANCIAL_PUBLIC_BRIDGE_CHANGED',
                'REVIEWED_PUBLIC_SELECTORS_CHANGED',
                'STEAM_SET_UNBOUNDED_OR_EXPIRED'):
   self.assertIn(token,s)
  self.assertNotIn('pg_terminate_backend',s)
  self.assertNotIn('ALTER TABLE ',s)
  self.assertNotIn('wolo-satchel-c01.service", "start"',s)
  self.assertNotIn('8094',s)
  self.assertNotIn('8095',s)

 def test_private_nonstrict_home_evidence_bound_to_root_only_etc_policy(self):
  self.assertEqual(m.ORIGINAL_NGINX_PREIMAGE.parent,m.POLICY.parent)
  self.assertEqual(m.FIRST_RECOVERY_STAGE.parent,m.POLICY.parent)
  self.assertEqual(m.POLICY.parent,Path("/etc/aoe2war/web-prod-v5v"))
  self.assertNotIn("/root",str(m.ORIGINAL_NGINX_PREIMAGE))
  self.assertNotIn("/root",str(m.FIRST_RECOVERY_STAGE))
  self.assertIn('rawfile(ORIGINAL_NGINX_PREIMAGE,0o600)',SOURCE.read_text())
  self.assertIn('rawfile(FIRST_RECOVERY_STAGE,0o600)',SOURCE.read_text())

 def test_new_separate_policy_and_admission_are_mandatory(self):
  s=SOURCE.read_text()
  self.assertIn('aoe2war.app.steam-runtime-readmission.v5v',s)
  self.assertIn('aoe2war.app.r25.steam-refresh-after-verified-public-cutover.v5v',s)
  self.assertIn('new_controller_sha256',s)
  self.assertIn('runtime_restart_admission_sha256',s)
  self.assertIn('production_nft_shape()',s)
  self.assertIn('production_protected()',s)
  self.assertIn('get_caps_or_hold()',s)

if __name__=='__main__':unittest.main()
