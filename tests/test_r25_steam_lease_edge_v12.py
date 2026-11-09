"""V12: bounded Steam NFT lease-edge preflight, preserving original post-guard."""
from pathlib import Path
from unittest.mock import patch
import hashlib
import importlib.util
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts/release/r25_steam_refresh_traffic_v12.py'
CONTROLLER = ROOT / 'scripts/release/r25_steam_masked_c04_switch_v12.py'
V11 = ROOT / 'scripts/release/r25_steam_refresh_traffic_v11.py'
spec = importlib.util.spec_from_file_location('r25_steam_lease_edge_v12', SOURCE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class FakeGuard:
    def production_nft_shape(self):
        return mod.NFT_SHAPE

class LeaseEdgeV12(unittest.TestCase):
    def snapshot(self):
        return (None, FakeGuard(), mod.FIN_SNAPSHOT)

    def test_lease_far_from_expiry_does_not_wait(self):
        pauses = []
        with patch.object(mod, 'native_snapshot', side_effect=self.snapshot), patch.object(mod, 'read_live_steam_lease_seconds', return_value=[240, 240, 240]):
            mod.lease_expiry_readonly_wait(pauses.append)
        self.assertEqual(pauses, [])

    def test_lease_naturally_expires_before_original_refresh(self):
        pauses = []
        with patch.object(mod, 'native_snapshot', side_effect=self.snapshot) as snapshots, patch.object(mod, 'read_live_steam_lease_seconds', return_value=[10, 11, 10]):
            mod.lease_expiry_readonly_wait(pauses.append)
        self.assertEqual(pauses, [13])
        self.assertEqual(snapshots.call_count, 2)

    def test_empty_set_is_left_to_original_refresh_guard(self):
        pauses = []
        with patch.object(mod, 'native_snapshot', side_effect=self.snapshot), patch.object(mod, 'read_live_steam_lease_seconds', return_value=[]):
            mod.lease_expiry_readonly_wait(pauses.append)
        self.assertEqual(pauses, [])

    def test_mixed_expiry_denied_not_bypassed(self):
        with patch.object(mod, 'native_snapshot', side_effect=self.snapshot), patch.object(mod, 'read_live_steam_lease_seconds', return_value=[13, 211]):
            with self.assertRaisesRegex(RuntimeError, 'LEASE_MIXED_EXPIRY_HOLD'):
                mod.lease_expiry_readonly_wait(lambda _: self.fail('must never sleep'))

    def test_protected_snapshot_changed_during_wait_denied(self):
        snapshots = [self.snapshot(), (None, FakeGuard(), 'A'*64)]
        with patch.object(mod, 'native_snapshot', side_effect=snapshots), patch.object(mod, 'read_live_steam_lease_seconds', return_value=[5, 5]):
            with self.assertRaisesRegex(RuntimeError, 'LEASE_PROTECTED_CHANGED_DURING_WAIT'):
                mod.lease_expiry_readonly_wait(lambda _: None)

    def test_protected_snapshot_unapproved_denied(self):
        with patch.object(mod, 'native_snapshot', return_value=(None, FakeGuard(), 'B'*64)):
            with self.assertRaisesRegex(RuntimeError, 'LEASE_PROTECTED_BASELINE_DRIFT'):
                mod.lease_expiry_readonly_wait(lambda _: self.fail('must never sleep'))

    def base_nft(self, expire=31):
        return {'nftables': [
            {'set': {'name': 'steam4', 'table': 'aoe2war_web_prod', 'family': 'inet', 'flags': ['timeout'], 'elem': [
                {'elem': {'val': '2.23.88.217', 'expires': expire}}]}},
            {'set': {'name': 'steam6', 'table': 'aoe2war_web_prod', 'family': 'inet', 'flags': ['timeout'], 'elem': []}}
        ]}

    def test_nft_readonly_strict_positive(self):
        with patch.object(mod, 'exec_out', return_value=json.dumps(self.base_nft())) as run:
            self.assertEqual(mod.read_live_steam_lease_seconds(), [31])
        run.assert_called_once_with(['/usr/sbin/nft', '-j', 'list', 'table', 'inet', 'aoe2war_web_prod'])

    def test_nft_expired_or_wrong_units_denied(self):
        for bad in (0, 301, -1, 10000, True, '25', None):
            with self.subTest(bad=bad), patch.object(mod, 'exec_out', return_value=json.dumps(self.base_nft(bad))):
                with self.assertRaisesRegex(RuntimeError, 'LEASE_EXPIRY'):
                    mod.read_live_steam_lease_seconds()

    def test_nft_duplicate_and_missing_set_denied(self):
        duplicated = self.base_nft()
        duplicated['nftables'].append(duplicated['nftables'][0])
        with patch.object(mod, 'exec_out', return_value=json.dumps(duplicated)):
            with self.assertRaisesRegex(RuntimeError, 'LEASE_DUPLICATE_SET'):
                mod.read_live_steam_lease_seconds()
        missing = self.base_nft()
        missing['nftables'].pop()
        with patch.object(mod, 'exec_out', return_value=json.dumps(missing)):
            with self.assertRaisesRegex(RuntimeError, 'LEASE_SET_SCOPE_CHANGED'):
                mod.read_live_steam_lease_seconds()

    def test_source_preserves_exact_original_guard_with_extra_readonly_gate(self):
        before = V11.read_text()
        after = SOURCE.read_text()
        self.assertIn('obj.refresh()', after)
        self.assertIn('lease_expiry_readonly_wait()\n  obj.refresh()', after)
        self.assertIn('def lease_expiry_readonly_wait(', after)
        self.assertEqual(mod.C04_HELPER_SHA256, '0b56dd8dbdd8ae3fea58019df7fa6e14250030cac6d664b542b081142701b340')
        self.assertEqual(mod.FIN_SNAPSHOT, '064a16dde48c64a3001621902b4ae7a028ec4975183fd4c24b8a16338c1a226c')
        self.assertIn('obj.refresh()', before)
        for forbidden in ('systemctl unmask', 'ALTER ROLE', 'GRANT ALL', '8092/satchel', 'CAP_SYS_ADMIN'):
            self.assertNotIn(forbidden, after)

    def test_one_use_v11_rollback_and_exact_new_source(self):
        c = CONTROLLER.read_text()
        self.assertIn("OLD = b'r25_steam_refresh_traffic_v11.py'", c)
        self.assertIn("NEW = b'r25_steam_refresh_traffic_v12.py'", c)
        self.assertIn("OLD_UNIT_SHA = '07d95f1079d33b18274fafab912d9ab0af9a0ea22d19b8fcecf64c0af589e653'", c)
        self.assertIn("MAIN_SHA = '" + hashlib.sha256(SOURCE.read_bytes()).hexdigest() + "'", c)
        self.assertIn('persist_unit(file(BACKUP,0o600))', c)
        self.assertIn("C04_READONLY_MANIFEST = P('/etc/aoe2war/web-prod-v11/c04-original-unit-fingerprints.json')", c)
        self.assertIn('PASS_ROLLBACK_ORIGINAL_V11_SOURCE_RESTORED_UNDER_C04_HOLD', c)
        self.assertNotIn('systemctl unmask', c)

if __name__=='__main__':
    unittest.main()
