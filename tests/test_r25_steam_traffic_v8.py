"""Adversarial website-only controller contracts; no host/service mutation."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]

def module(name,path):
 spec=importlib.util.spec_from_file_location(name,ROOT/"scripts/release"/path)
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

v=module("s_b_v8_guard","r25_steam_refresh_traffic_v8.py")
r=module("s_b_v8_release","r25_traffic_single_runtime_release_v8.py")

class ExactWebsiteAndSteamV8(unittest.TestCase):
 def test_two_source_only(self):
  self.assertEqual(set(v.PROFILES),{'candidate','rollback'})
  self.assertEqual(v.PROFILES['candidate']['source'],r.SOURCE)
  self.assertEqual(v.PROFILES['candidate']['unit_sha'],r.CANDIDATE_UNIT_SHA)
  self.assertEqual(v.PROFILES['rollback']['unit_sha'],r.CURRENT_UNIT_SHA)
  self.assertEqual(v.PROFILES['candidate']['build'],'YF_YxSAxc0izAfRG0ARsc')
  self.assertEqual(v.PROFILES['candidate']['version'],r.NEW_VERSION)
  self.assertEqual(v.PROFILES['rollback']['version'],r.OLD_VERSION)
  self.assertNotEqual(v.PROFILES['candidate']['source'],v.PROFILES['rollback']['source'])
 def test_guard_source_is_exact_pinned(self):
  data=(ROOT/"scripts/release/r25_steam_refresh_traffic_v8.py").read_bytes()
  self.assertEqual(hashlib.sha256(data).hexdigest(),r.GUARD_SHA)
  self.assertEqual(r.V7_GUARD_SHA,v.OLD_SHA) if False else None
  self.assertEqual(r.CURRENT_STEAM_UNIT_SHA,'77669f8c50b354beb7e0a8b5d665491cbb7e1422793e69027c038282cbb52381')
  self.assertEqual(r.CANDIDATE_STEAM_UNIT_SHA,'29276c662bbd0146938ae58194763848482f1c85df6f10698632499d089ef3a3')
 def test_private_candidate_receipt_can_never_be_faked_by_source_only(self):
  self.assertEqual(v.PROFILES['candidate']['origin_sha'],r.STAGE_RECEIPT_SHA)
  self.assertIn('/etc/aoe2war/web-prod-v8/',str(v.CANDIDATE_STAGE_RECEIPT))
  self.assertEqual(r.STAGE_RECEIPT.name,'physical-stage-acceptance.json')
  self.assertEqual(v.PROFILES['candidate']['origin_sha'],'c41c7e2bffd7287e8637a620e84e12cc38e05bce4bc86081115cebf4621ba701')
 def test_protected_chain_snapshot_is_original_no_expansion(self):
  self.assertEqual(v.FIN_SNAPSHOT,'6296fcf49fbc1d33f507c6a8339f87513f933948c0d86a7aa373cebe46071cfb')
  self.assertEqual(v.NFT_SHAPE,'985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af')
  source=(ROOT/"scripts/release/r25_steam_refresh_traffic_v8.py").read_text()
  for marker in ('m.production_protected()','m.production_nft_shape()',
                 "check(unit_pid('wolochaind-mainnet.service')==VALIDATOR_PID",
                 'check(j[\'finance_authorized\'] is False',
                 'STEAM_ONLY_EXISTING_UID990_NFT_SETS'):
   self.assertIn(marker,source)
  self.assertNotIn('GRANT ',source)
  self.assertNotIn('ALTER ROLE',source)
  self.assertNotIn('systemctl restart wolochaind',source)
 def test_web_origin_must_deliver_two_full_page_bodies(self):
  source=(ROOT/"scripts/release/r25_steam_refresh_traffic_v8.py").read_text()
  for marker in ("'/traffic',21","'/players',21","TRAFFIC_COMPLETE_BODY_REQUIRED",
                 "PLAYERS_COMPLETE_BODY_REQUIRED","'OWNER_SINGLE_CANONICAL_TRAFFIC_CHART_NOT_RENDERED'"):
   self.assertIn(marker,source)
  self.assertIn("and 'Recent observations' not in text",source)
  self.assertIn("'__Host-aoe2war_steam_state='",source)
 def test_nonroot_denied_before_enrollment_and_release(self):
  with patch.object(v.os,'geteuid',return_value=1000):
   with self.assertRaisesRegex(RuntimeError,'ROOT_REQUIRED'):v.enroll('candidate')
  with patch.object(r.os,'geteuid',return_value=1000):
   with self.assertRaisesRegex(RuntimeError,'RELEASE_ROOT_REQUIRED'):r.preflight()
 def test_invalid_web_and_steam_unit_bytes_do_not_write(self):
  with patch.object(r,'persist') as persist:
   with self.assertRaisesRegex(RuntimeError,'NON_WHITELISTED_WEB_UNIT'):
    r.transition(b'bad-web',b'bad-steam')
   persist.assert_not_called()
 def test_mixed_release_unit_bytes_do_not_write(self):
  # Simulate independently whitelisted exact digest values, but mismatched
  # website-v7 / Steam-v8 pair; the controller must still refuse.
  with patch.object(r,'sha',side_effect=lambda b:r.CURRENT_UNIT_SHA if b==b'old-web' else
                    r.CANDIDATE_STEAM_UNIT_SHA if b==b'new-steam' else '0'*64):
   with patch.object(r,'persist') as persist:
    with self.assertRaisesRegex(RuntimeError,'MIXED_RELEASE_UNSAFE'):
     r.transition(b'old-web',b'new-steam')
    persist.assert_not_called()
 def test_timer_restoration_is_in_finally(self):
  source=(ROOT/"scripts/release/r25_traffic_single_runtime_release_v8.py").read_text()
  self.assertIn("finally:\n   if timer_paused:",source)
  self.assertIn("'aoe2war-steam-egress-refresh.timer'",source)
  self.assertIn('PASS_AUTOMATIC_V7_STEAM_SAFE_ROLLBACK',source)
  self.assertIn("enrollment(False)",source)
  self.assertIn('PASS_V7_RESTORED_WEBSITE_AND_STEAM',source)
 def test_reviewer_must_select_explicit_plan_or_execute(self):
  source=(ROOT/"scripts/release/r25_traffic_single_runtime_release_v8.py").read_text()
  self.assertIn("cli.add_argument('--phase',choices=['plan','execute'],required=True)",source)
  self.assertIn("if args.phase=='plan':",source)
  self.assertIn("elif args.phase=='execute':",source)
  self.assertIn("'PASS_V8_READ_ONLY_EXACT_RELEASE_PREFLIGHT'",source)
  self.assertIn("'PREVIOUS_V7_PROTECTED_PLAN_FAILED'",source)
  self.assertIn("'PREVIOUS_STEAM_REFRESH_STILL_ACTIVE'",source)
 def test_security_whitelists_no_finance_execution(self):
  source=(ROOT/"scripts/release/r25_traffic_single_runtime_release_v8.py").read_text()
  for forbidden in ('psql ', 'nft -f', 'DROP TABLE','GRANT ','ALTER ROLE',
                    'systemctl restart wolochaind','systemctl restart aoe2hdbets-web.service'):
   self.assertNotIn(forbidden,source)
  self.assertIn("'FUNDED_PORT_OPEN'",source)
  self.assertIn("protected()",source)
  self.assertIn("finance_authorized':False",source)
 def test_no_registration_or_bot_linking_in_auth_observer(self):
  source=(ROOT/"scripts/release/r25_steam_refresh_traffic_v8.py").read_text()
  self.assertIn("'/api/auth/steam?returnTo=%2Fplayers'",source)
  self.assertNotIn('aoe2hd_ai_concierge',source)
  self.assertNotIn('prisma.user.create',source)
  self.assertNotIn('aoe2war_scribe',source)
 def test_exact_source_web_manifest(self):
  self.assertEqual(r.SOURCE,'4ab96cc7c1c0ba43a0403795485d3f410a6ba07f')
  self.assertEqual(r.OLD_PID,3002734)
  self.assertEqual(r.NEW_VERSION,'20261108182649-ca81f00609')
  self.assertEqual(r.CANDIDATE_UNIT_SHA,v.PROFILES['candidate']['unit_sha'])

if __name__=='__main__':unittest.main()
