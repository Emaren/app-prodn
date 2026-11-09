"""V13 mixed-expiry Steam-only nft preflight; no financial permission."""
from pathlib import Path
from unittest.mock import patch
import hashlib, importlib.util, json, unittest

ROOT=Path(__file__).resolve().parents[1]
MAIN=ROOT/'scripts/release/r25_steam_refresh_traffic_v13.py'
BEFORE=ROOT/'scripts/release/r25_steam_refresh_traffic_v12.py'
CONTROL=ROOT/'scripts/release/r25_steam_masked_c04_switch_v13.py'
spec=importlib.util.spec_from_file_location('test_staggered_lease_source_v13',MAIN)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class Guard:
    def production_nft_shape(self):return mod.NFT_SHAPE

class V13MixedExpiry(unittest.TestCase):
    def snapshot(self): return (None,Guard(),mod.FIN_SNAPSHOT)
    def run_lease(self, snapshots, pauses=None):
        waits=[]
        if pauses is None: pauses=[]
        with patch.object(mod,'native_snapshot',side_effect=self.snapshot):
            with patch.object(mod,'read_live_steam_lease_seconds',side_effect=snapshots) as raw:
                mod.lease_expiry_readonly_wait(lambda s:waits.append(s))
        return waits,raw.call_count

    def test_healthy_leases_zero_wait(self):
        self.assertEqual(self.run_lease([[230,231,232]]),([],1))

    def test_empty_set_original_refresh_handles(self):
        self.assertEqual(self.run_lease([[]]),([],1))

    def test_synchronized_short_leases_wait_then_refresh(self):
        self.assertEqual(self.run_lease([[7,8,7],[]]),([9],2))

    def test_real_failure_staggered_new_ip_not_denied(self):
        # V12 rejected this legitimate split as LEASE_MIXED_EXPIRY_HOLD.
        self.assertEqual(self.run_lease([[8,273,269],[265,261]]),([10],2))

    def test_multiple_near_expiry_ip_groups_each_naturally_expire(self):
        self.assertEqual(self.run_lease([[8,22,31],[12,21],[7],[]]),([10,14,9],4))

    def test_expiry_wait_budget_is_finite(self):
        with patch.object(mod,'native_snapshot',side_effect=self.snapshot):
            with patch.object(mod,'read_live_steam_lease_seconds',side_effect=[[40],[40],[40],[40],[40]]):
                waits=[]
                with self.assertRaisesRegex(RuntimeError,'LEASE_STAGGERED_WAIT_BUDGET_EXCEEDED'):
                    mod.lease_expiry_readonly_wait(waits.append)
                self.assertEqual(waits,[42,42])

    def test_bad_protected_snapshot_denies_before_any_wait(self):
        with patch.object(mod,'native_snapshot',return_value=(None,Guard(),'f'*64)):
            with self.assertRaisesRegex(RuntimeError,'LEASE_PROTECTED_BASELINE_DRIFT'):
                mod.lease_expiry_readonly_wait(lambda _:self.fail('no wait'))

    def test_post_wait_snapshot_change_denied(self):
        with patch.object(mod,'native_snapshot',side_effect=[self.snapshot(),(None,Guard(),'f'*64)]):
            with patch.object(mod,'read_live_steam_lease_seconds',return_value=[8]):
                with self.assertRaisesRegex(RuntimeError,'LEASE_PROTECTED_CHANGED_DURING_WAIT'):
                    mod.lease_expiry_readonly_wait(lambda _:None)

    def nft(self,exp=20):
        return {'nftables':[{'set':{'name':'steam4','family':'inet','table':'aoe2war_web_prod',
          'flags':['timeout'],'elem':[{'elem':{'expires':exp,'val':'2.23.88.217'}}]}},
          {'set':{'name':'steam6','family':'inet','table':'aoe2war_web_prod',
          'flags':['timeout'],'elem':[]}}]}

    def test_strict_nft_actual_shape_without_automatic_mutation(self):
        with patch.object(mod,'exec_out',return_value=json.dumps(self.nft())) as query:
            self.assertEqual(mod.read_live_steam_lease_seconds(),[20])
        query.assert_called_once_with(['/usr/sbin/nft','-j','list','table','inet','aoe2war_web_prod'])

    def test_invalid_expiration_units_denied(self):
        for invalid in (0,301,-1,True,'4',None):
            with self.subTest(invalid=invalid),patch.object(mod,'exec_out',return_value=json.dumps(self.nft(invalid))):
                with self.assertRaisesRegex(RuntimeError,'LEASE_EXPIRY'):
                    mod.read_live_steam_lease_seconds()

    def test_duplicate_or_missing_nft_set_denied(self):
        dup=self.nft();dup['nftables'].append(dup['nftables'][0])
        with patch.object(mod,'exec_out',return_value=json.dumps(dup)):
            with self.assertRaisesRegex(RuntimeError,'LEASE_DUPLICATE_SET'):
                mod.read_live_steam_lease_seconds()
        missing=self.nft();missing['nftables'].pop()
        with patch.object(mod,'exec_out',return_value=json.dumps(missing)):
            with self.assertRaisesRegex(RuntimeError,'LEASE_SET_SCOPE_CHANGED'):
                mod.read_live_steam_lease_seconds()

    def test_original_v5z_signed_tls_nft_guard_remains_unmodified(self):
        before=BEFORE.read_text();after=MAIN.read_text()
        self.assertIn('obj.refresh()',before)
        self.assertIn('lease_expiry_readonly_wait()\n  obj.refresh()',after)
        self.assertIn('PASS_V13_BOUNDED_STAGGERED_STEAM_LEASE_PREWAIT',after)
        self.assertIn("C04_HELPER = P('/usr/local/lib/aoe2war-web-prod/r25_c04_masked_listener_guard_v11.py')",after)
        self.assertEqual(mod.FIN_SNAPSHOT,'064a16dde48c64a3001621902b4ae7a028ec4975183fd4c24b8a16338c1a226c')
        self.assertEqual(mod.C04_HELPER_SHA256,'0b56dd8dbdd8ae3fea58019df7fa6e14250030cac6d664b542b081142701b340')
        for forbidden in ('systemctl unmask','ALTER ROLE','GRANT ALL','127.0.0.1:8092','CAP_SYS_ADMIN'):
            self.assertNotIn(forbidden,after)

    def test_one_use_v12_backout_new_source_hash_and_mask(self):
        ctl=CONTROL.read_text()
        self.assertIn("OLD = b'r25_steam_refresh_traffic_v12.py'",ctl)
        self.assertIn("NEW = b'r25_steam_refresh_traffic_v13.py'",ctl)
        self.assertIn("OLD_UNIT_SHA = '9049673a3156a54dc1a3b0fbdffc52c57d8bfd93235ae8097b85d2fb0063a886'",ctl)
        self.assertIn("MAIN_SHA = '"+hashlib.sha256(MAIN.read_bytes()).hexdigest()+"'",ctl)
        self.assertIn("C04_READONLY_MANIFEST = P('/etc/aoe2war/web-prod-v11/c04-original-unit-fingerprints.json')",ctl)
        self.assertIn('persist_unit(file(BACKUP,0o600))',ctl)
        self.assertIn('PASS_ROLLBACK_ORIGINAL_V12_SOURCE_RESTORED_UNDER_C04_HOLD',ctl)

if __name__=='__main__':unittest.main()
