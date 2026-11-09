"""V18 authentic b1ef final public-only source + rollback identity contracts."""
import hashlib,importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch,MagicMock
R=Path(__file__).resolve().parents[1]
STEAM=R/'scripts/release/r25_steam_refresh_traffic_v18.py'
UNIT=R/'scripts/release/r25_steam_refresh_traffic_v18.service'
PROMOTE=R/'scripts/release/r25_c03_b1ef_v18_retained_release_v1.py'
def importfile(name,p):
 s=importlib.util.spec_from_file_location(name,p)
 m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
 return m
v=importfile('steamv18',STEAM)
p=importfile('retainedv18',PROMOTE)
class V18(unittest.TestCase):
 def test_release_has_only_two_exact_source_profiles(self):
  self.assertEqual(set(v.PROFILES),{'rollback','candidate'})
  self.assertEqual(v.PROFILES['candidate']['source'],'b1ef050b954be734c9f34147361e0d02d7c89b19')
  self.assertEqual(v.PROFILES['candidate']['build'],'QVzgMJiQwhFvwrRbY9oZW')
  self.assertEqual(v.PROFILES['candidate']['version'],'20261109194837-9ac998896a')
  self.assertEqual(v.PROFILES['candidate']['origin_sha'],'c7a3788a22cbaaa49356330f305c40c90d90232809bb0037236137ad819f64e7')
  self.assertEqual(v.PROFILES['candidate']['unit_sha'],p.CANDIDATE_SHA)
  self.assertEqual(v.PROFILES['rollback']['unit_sha'],p.ORIGINAL_SHA)
  self.assertNotIn('/root/',STEAM.read_text())
 def test_exact_v18_effective_service_source_sha(self):
  self.assertEqual(hashlib.sha256(UNIT.read_bytes()).hexdigest(),v.STEAM_V18_UNIT_SHA256)
  self.assertEqual(hashlib.sha256(STEAM.read_bytes()).hexdigest(),p.STEAM_SOURCE_SHA)
  self.assertEqual(v.STEAM_V18_UNIT_SHA256,p.STEAM_UNIT_SHA)
  self.assertEqual(v.FIN_SNAPSHOT,'6bef38a7bbd89f4041e832eeebfa7c2213fa627633299b8d0ad45135b3018999')
  self.assertEqual(v.NFT_SHAPE,'985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af')
  self.assertEqual(v.C01_DELTA_HELPER_SHA256,'2d5b17c74c6fb5d916e8b65ed61dd92cf1bd83c8bf9affad42872045fdce53ec')
  self.assertIn('ProtectHome=yes',UNIT.read_text())
  self.assertIn('ProtectSystem=strict',UNIT.read_text())
 def test_fail_shut_on_public_empty_denial_or_fake_private_200(self):
  pub={'schema':'aoe2war.app.bets-published-live-preview.v1',
       'status':'PUBLIC_MARKET_PREVIEW_FINANCIAL_HOLD','source':'aoe2war_public_v9.published_markets',
       'financialExecutionAuthorized':False,'acceptingWagers':False,'actualLiquidityProven':False,
       'markets':[],'emptyReason':'NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS'}
  hist={'status':'PUBLIC_HISTORY_READ_ONLY_FINANCIAL_HOLD','financialExecutionAuthorized':False,'markets':[]}
  class Resp:
   def __init__(self,j):
    self.status=200;self._b=__import__('json').dumps(j).encode()
   def __enter__(self):return self
   def __exit__(self,*a):return False
   def read(self,n):return self._b
  def cases():
   return [Resp({'buildVersion':v.PROFILES['candidate']['version']}),
           Resp({'status':'PUBLIC_200'}),Resp({'status':'PLAYERS_200'}),Resp(pub),Resp(hist)]
  # no HTTPError for /api/bets: an unexpected 200 must raise immediately.
  with patch.object(v,'open',create=True):pass
  src=STEAM.read_text()
  self.assertIn("'PUBLIC_LIVE_NOT_FUNCTIONAL_HTTP200'",src)
  self.assertIn("'PUBLIC_HISTORY_NOT_FUNCTIONAL_HTTP200'",src)
  self.assertIn("'PRIVATE_BETS_UNEXPECTED_HTTP200'",src)
  self.assertIn("denied.code==503",src)
  self.assertIn("'PRIVATE_BETS_NOT_EXACT_FINANCIAL_HOLD'",src)
 def test_not_weakening_original_security_guard(self):
  src=STEAM.read_text()
  for required in ('m.production_protected()','reconstruct_pre_c01(m,snapshot)',
                   'PROTECTED_FINANCE_TOPOLOGY_DRIFT','STEAM_NFT_SHAPE_DRIFT',
                   'FUNDED_PORT_UNEXPECTEDLY_OPEN','LEGACY_ROLLBACK_PID_CHANGED',
                   'STEAM_V18_EFFECTIVE_SERVICE_UNIT_DRIFT','LEASE_EXPIRY_ZERO_AT_GC_BOUNDARY'):
   self.assertIn(required,src)
  self.assertNotIn('/root/',src)
 def test_promotion_compulsory_rollback_and_allowlisted_only(self):
  src=PROMOTE.read_text()
  for required in ("'--phase','enroll','--profile','candidate'",
                   "'--phase','enroll','--profile','rollback'",
                   "obs['rollback_steps']=recover(trial)",
                   "'PASS_RUNNING_B1EF_PUBLIC_ONLY_R25_STEAM_V18_NOT_AUTH_CERTIFIED'",
                   "'signed_in_roles_verified':False",
                   "'C03_APP_HANDOFF':'HOLD'","'C02_APP_TRANSPORT':'HOLD'",
                   "'RESTORED_STEAM_REFRESH_HOLD'", "'V18_UNIT_POSTINSTALL_MISMATCH'"):
   self.assertIn(required,src)
  for forbidden in ('systemctl unmask','ALTER ROLE','GRANT ALL','DROP DATABASE',
                    '127.0.0.1:8092','127.0.0.1:8093'):
   self.assertNotIn(forbidden,src)
 def test_current_steambound_rollback_contract(self):
  self.assertEqual(p.OLD_PROFILE_ORIGIN_SHA,'c41c7e2bffd7287e8637a620e84e12cc38e05bce4bc86081115cebf4621ba701')
  self.assertEqual(p.CANDIDATE_RECEIPT_SHA,'c7a3788a22cbaaa49356330f305c40c90d90232809bb0037236137ad819f64e7')
  self.assertEqual(p.CI_ARTIFACT_SHA,'2c0bb606db2c21ca263efbcacb57c52e4cb493553737a5a919e21170baaf6a74')
if __name__=='__main__':unittest.main()
