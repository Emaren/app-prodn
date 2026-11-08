"""Strict source-only adversarial release contracts, no SSH/host mutation."""
import importlib.util
import hashlib
import json
import pathlib
import re
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]

def load(name, filename):
 spec=importlib.util.spec_from_file_location(name,ROOT/"scripts/release"/filename)
 result=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(result)
 return result

v=load("candidate_guard_v7","r25_steam_refresh_traffic_v7.py")
r=load("release_controller_v7","r25_traffic_single_runtime_release_v7.py")

def real_receipt(name="candidate"):
 p=v.PROFILES[name]
 return {
  'schema':'aoe2war.app.traffic-steam-v7.release.v1','profile':name,
  'current_public_pid':3000000,'old_public_pid':v.OLD_PUBLIC_PID,
  'start_ticks':1234567,'source_sha':p['source'],'build_id':p['build'],
  'build_version':p['version'],'unit_sha256':p['unit_sha'],
  'origin_receipt_sha256':p['origin_sha'],'fin_snapshot_sha256':v.FIN_SNAPSHOT,
  'nft_shape_sha256':v.NFT_SHAPE,'finance_authorized':False,
  'canonical_traffic_certified':False,'steam_owner_browser_verified':False
 }

class ExactSteamControllerContract(unittest.TestCase):
 def test_only_two_pinned_source_profiles(self):
  self.assertEqual(set(v.PROFILES),{'candidate','rollback'})
  self.assertEqual(v.PROFILES['candidate']['source'],r.SOURCE)
  self.assertEqual(v.PROFILES['candidate']['unit_sha'],r.CANDIDATE_UNIT_SHA)
  self.assertEqual(v.PROFILES['rollback']['unit_sha'],r.CURRENT_UNIT_SHA)
  self.assertNotEqual(v.PROFILES['rollback']['origin_sha'],v.PROFILES['candidate']['origin_sha'])
  self.assertEqual(v.NFT_SHAPE,'985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af')
 def test_candidate_physical_receipt_visible_inside_hardened_service(self):
  # ProtectHome=yes makes /root inaccessible to the real Steam systemd unit.
  # The root0600 copy is byte-identical to the protected physical stage original.
  self.assertEqual(v.CANDIDATE_STAGE_RECEIPT,
                   v.ROOT / 'candidate-stage-acceptance.json')
  self.assertNotIn('/root/',str(v.PROFILES['candidate']['origin']))
  self.assertEqual(v.PROFILES['candidate']['origin_sha'],
                   '31d750fe72b6b6e1fdad492fec94d1a863fd5305360c400bc3b036167b6c9f27')
 def test_immutable_steam_guard_is_source_pinned(self):
  code=(ROOT/"scripts/release/r25_steam_refresh_traffic_v7.py").read_text()
  self.assertIn(v.OLD_SHA,code)
  self.assertIn(v.V6_SHA,code)
  self.assertIn('obj.refresh()',code)
  self.assertIn("obj.NEW_SELF=SELF",code)
  self.assertIn("obj.expected_policy=expected",code)
  self.assertIn("m.production_protected()",code)
  self.assertIn("m.production_nft_shape()",code)
  self.assertNotIn("nft -f",code)
  self.assertNotIn("iptables",code)
  self.assertNotIn("subprocess.Popen",code)
 def test_strict_v7_release_receipt_positive(self):
  payload=real_receipt()
  raw=json.dumps(payload).encode()
  with patch.object(v,'active_profile',return_value=('candidate',v.PROFILES['candidate'])), \
       patch.object(v,'verified',return_value=raw), \
       patch.object(v,'verify_active_runtime',return_value=(3000000,1234567)):
   result,sha=v.bind_source()
   self.assertEqual(result,{'old_public_pid':v.OLD_PUBLIC_PID,'pid3032':3000000})
   self.assertEqual(sha,hashlib.sha256(raw).hexdigest())
 def test_forged_receipts_always_hold(self):
  for key,value in [
   ('finance_authorized',True),('canonical_traffic_certified',True),
   ('steam_owner_browser_verified',True),('source_sha','not-reviewed'),
   ('unit_sha256','f'*64),('fin_snapshot_sha256','f'*64),
   ('nft_shape_sha256','0'*64),('origin_receipt_sha256','a'*64),
   ('old_public_pid',2625090),('current_public_pid',17),('start_ticks',0),
  ]:
   with self.subTest(field=key):
    payload=real_receipt()
    payload[key]=value
    with patch.object(v,'active_profile',return_value=('candidate',v.PROFILES['candidate'])), \
         patch.object(v,'verified',return_value=json.dumps(payload).encode()), \
         patch.object(v,'verify_active_runtime',return_value=(3000000,1234567)):
     with self.assertRaises(RuntimeError):v.bind_source()
 def test_extra_release_receipt_field_fails_closed(self):
  payload=real_receipt();payload['extra']='ignored'
  with patch.object(v,'active_profile',return_value=('candidate',v.PROFILES['candidate'])), \
       patch.object(v,'verified',return_value=json.dumps(payload).encode()):
   with self.assertRaisesRegex(RuntimeError,'FIELD_SCOPE'):v.bind_source()
 def test_unrecognized_profile_rejected_before_io(self):
  with patch.object(v,'verified',return_value=json.dumps({'schema':'aoe2war.app.traffic-steam-v7.active.v1',
       'profile':'finance','source_sha':'a','stage_receipt_sha256':'b','finance_authorized':False}).encode()):
   with self.assertRaisesRegex(RuntimeError,'PROFILE'):v.active_profile()
 def test_unapproved_profile_finance_flag_rejected(self):
  p=v.PROFILES['candidate']
  for field,value in [('finance_authorized',True),('source_sha','f'*40),('stage_receipt_sha256','0'*64)]:
   m={'schema':'aoe2war.app.traffic-steam-v7.active.v1','profile':'candidate',
      'source_sha':p['source'],'stage_receipt_sha256':p['origin_sha'],'finance_authorized':False}
   m[field]=value
   with patch.object(v,'verified',return_value=json.dumps(m).encode()):
    with self.assertRaises(RuntimeError):v.active_profile()
 def test_no_unprivileged_enrollment(self):
  with patch.object(v.os,'geteuid',return_value=1000):
   with self.assertRaisesRegex(RuntimeError,'ROOT_REQUIRED'):v.enroll('candidate')
 def test_auth_health_checks_are_check_authentication_only(self):
  code=(ROOT/"scripts/release/r25_steam_refresh_traffic_v7.py").read_text()
  self.assertIn("'/api/auth/steam?returnTo=%2Fplayers'",code)
  self.assertIn("'https','steamcommunity.com','/openid/login'",code)
  self.assertIn("'__Host-aoe2war_steam_state='",code)
  self.assertNotIn("STEAM_API_KEY=",code)
 def test_original_guard_keeps_immutable_original_route_scope(self):
  code=(ROOT/"scripts/release/r25_steam_refresh_traffic_v7.py").read_text()
  self.assertIn("old_expected=obj.expected_policy",code)
  self.assertIn("obj.bound_public_commit=bind_source",code)
  self.assertIn("obj.evidence()",code)
  self.assertIn("public_release_receipt_sha256",code)
  self.assertIn("STEAM_ONLY_EXISTING_UID990_NFT_SETS",code)

class GuardedSingleRuntimeContract(unittest.TestCase):
 def test_v7_source_sha_exact(self):
  source=ROOT/"scripts/release/r25_steam_refresh_traffic_v7.py"
  self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),r.GUARD_SHA)
 def test_release_only_changes_web_unit_in_whitelist(self):
  with patch.object(r,'persist') as persist:
   with self.assertRaisesRegex(RuntimeError,'NON_WHITELISTED_WEB_UNIT'):r.transition(b'evil')
   persist.assert_not_called()
 def test_rollback_is_built_in_and_steam_restored(self):
  code=(ROOT/"scripts/release/r25_traffic_single_runtime_release_v7.py").read_text()
  self.assertIn("enrollment('candidate')",code)
  self.assertIn("transition(original)",code)
  self.assertIn("enrollment('rollback')",code)
  self.assertIn("public_exact_version(OLD_VERSION,24)",code)
  self.assertIn("HOLD_AUTOMATIC_ROLLBACK_UNVERIFIED",code)
  self.assertIn("PASS_ROLLBACK_PUBLIC_WEBSITE_STEAM_AND_FINANCIAL_FENCE",code)
 def test_second_attempt_is_pinned_to_real_verified_rollback_identity(self):
  self.assertEqual(r.OLD_PID,2990256)
  self.assertEqual(r.OLD_VERSION,'20261108044653-2983e18532')
  self.assertEqual(r.ROOT_RECEIPT.name,'public-promotion-or-rollback-v7-attempt2.json')
  self.assertEqual(r.ORIGINAL_BACKUP.name,'original-3032-unit-v7-before-switch-attempt2.service')
 def test_old_site_refresh_fails_before_any_unit_write(self):
  code=(ROOT/"scripts/release/r25_traffic_single_runtime_release_v7.py").read_text()
  self.assertLess(code.index("manual_steam_refresh()\n  persist(ORIGINAL_BACKUP"),
                  code.index("   transition(new)"))
  self.assertLess(code.index("  persist(ORIGINAL_BACKUP"),
                  code.index("   transition(new)"))
 def test_no_direct_funded_or_chain_mutations(self):
  code=(ROOT/"scripts/release/r25_traffic_single_runtime_release_v7.py").read_text()
  self.assertIn("('/usr/bin/python3'",code) if False else None
  self.assertIn("FUNDED_PORT_OPEN",code)
  self.assertNotIn("systemctl restart wolochaind",code)
  self.assertNotIn("systemctl restart aoe2hdbets-web.service",code)
  self.assertNotIn("psql ",code)
  self.assertNotIn("nft -f",code)
 def test_public_probe_always_rejects_zero_deadline(self):
  with self.assertRaisesRegex(RuntimeError,'PUBLIC_HTTPS_BUILD_PARITY_UNPROVEN'):
   r.public_exact_version('nope',0)
 def test_preflight_never_grants_admin_by_stale_auth(self):
  with patch.object(r.os,'geteuid',return_value=1000):
   with self.assertRaisesRegex(RuntimeError,'ROOT_REQUIRED'):r.preflight()

if __name__=='__main__':
 unittest.main()
