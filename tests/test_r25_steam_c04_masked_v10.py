"""C04 masked financial-listener recognition; never patch original C03/V1 guard."""
import hashlib
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
HELP = ROOT / 'scripts/release/r25_c04_masked_listener_guard_v10.py'
STEAM = ROOT / 'scripts/release/r25_steam_refresh_traffic_v10.py'
V9 = ROOT / 'scripts/release/r25_steam_refresh_traffic_v9.py'
spec = importlib.util.spec_from_file_location('c04_mask_guard', HELP)
c04 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c04)


class OriginalModule:
    @staticmethod
    def need(ok, code):
        if not ok:
            raise RuntimeError('HOLD:' + code)

    def __init__(self):
        self.need = self.need


def sample(ports=None):
    return {'protected_sockets': ports or {
        '8092': [], '8093': [], '3030': ['original-pinned-socket'],
        '5432': ['loopback-db-socket'],
    }}


class C04MaskedSteamAdmission(unittest.TestCase):
    def setUp(self):
        self.m = OriginalModule()
        self.pre = {3030: ['original'], 3032: ['restricted'], 8092: [],
                    8093: [], 8094: [], 8095: [], 5432: ['db']}

    def old_factory(self, exceptions=2, bad=False, socket=None):
        def run():
            for _ in range(exceptions):
                self.m.need(False, 'PROTECTED_LISTENER_NOT_UNIQUE')
            if bad:
                self.m.need(False, 'C03_ORIGINAL_COMMAND_CHANGED')
            return sample(socket)
        return run

    def call(self, factory):
        with patch.object(c04, 'attest', side_effect=[self.pre, self.pre]):
            return c04.guarded_snapshot(self.m, factory)

    def test_exactly_two_closed_listener_exceptions_pass(self):
        original = self.m.need
        self.assertEqual(self.call(self.old_factory())['protected_sockets']['8092'], [])
        self.assertIs(self.m.need, original)

    def test_not_two_closed_listener_exceptions_refuses(self):
        for n in (0, 1):
            with self.subTest(n=n):
                with self.assertRaisesRegex(c04.C04Hold, 'EXPECTATION_COUNT'):
                    self.call(self.old_factory(exceptions=n))

    def test_three_listener_exceptions_cannot_bypass_another_service(self):
        with self.assertRaisesRegex(c04.C04Hold, 'UNEXPECTED_THIRD'):
            self.call(self.old_factory(exceptions=3))

    def test_any_unrelated_financial_guard_denial_is_preserved(self):
        original = self.m.need
        with self.assertRaisesRegex(RuntimeError, 'C03_ORIGINAL_COMMAND_CHANGED'):
            self.call(self.old_factory(bad=True))
        self.assertIs(self.m.need, original)

    def test_failclosed_original_snapshot_runtime_exception(self):
        def bad_factory():
            raise RuntimeError('HOLD:C03_TIMER_CHANGED')
        original = self.m.need
        with self.assertRaisesRegex(RuntimeError, 'C03_TIMER_CHANGED'):
            self.call(bad_factory)
        self.assertIs(self.m.need, original)

    def test_legacy_listener_resurrection_rejected_in_snapshot(self):
        injected = sample()['protected_sockets'].copy()
        injected['8092'] = ['unauthorized-listener']
        with self.assertRaisesRegex(c04.C04Hold, 'MASKED_LISTENER_CONTENT_DRIFT'):
            self.call(self.old_factory(socket=injected))

    def test_immutable_web_listener_still_required(self):
        injected = sample()['protected_sockets'].copy()
        injected['3030'] = []
        with self.assertRaisesRegex(c04.C04Hold, 'MASKED_LISTENER_CONTENT_DRIFT'):
            self.call(self.old_factory(socket=injected))

    def test_protected_topology_toctou_rejected(self):
        changed = dict(self.pre)
        changed[8092] = ['intruder']
        with patch.object(c04, 'attest', side_effect=[self.pre, changed]):
            with self.assertRaisesRegex(c04.C04Hold, 'TOCTOU_DRIFT'):
                c04.guarded_snapshot(self.m, self.old_factory())

    def test_closed_financial_ports_are_all_pinned(self):
        with patch.object(c04, 'state', return_value={
            'LoadState': 'masked','UnitFileState': 'masked',
            'ActiveState': 'inactive','MainPID': '0','NeedDaemonReload':'no',
        }), patch.object(c04, 'command', return_value='1009'):
            # Source-level contract is a safeguard against accidental deletion:
            # actual HEL1 masks and sockets require independent physical attestation.
            for port in (8092,8093,8094,8095):
                self.assertIn(port, c04.REQUIRED_CLOSED_PORTS)

    def test_original_c04_unit_sha_and_signed_governance_scope(self):
        self.assertEqual(c04.MASKED_POLICY_ID,
            'C04_PR227_b250461c45b3d74d5202e14d74df8a345e484add')
        self.assertEqual(len(c04.APPROVED_MASKS), 2)
        self.assertEqual(len(set(c04.APPROVED_MASKS.values())), 2)

    def test_v10_preserves_immutable_c03_v1_and_original_v9_sources(self):
        s=STEAM.read_text()
        self.assertIn("helper.guarded_snapshot(module, original_snapshot)",s)
        self.assertIn("c04.guarded_snapshot(module, c03_snapshot)",s)
        self.assertIn("load_c03_helper()",s)
        self.assertIn('ORIGINAL_FIN_SNAPSHOT =',s)
        self.assertIn('C03_ORIGINAL_V1_REVIEW_PINS_CHANGED',s)
        self.assertIn('C04_EXACT_MASK_HELPER_SOURCE_DRIFT',s)
        self.assertIn("STEAM_V10_EFFECTIVE_SERVICE_UNIT_DRIFT",s)
        self.assertIn("f5d08beebca0912e8271fddf891983ac80b60d148e7e2242cd34832bb0a55176",s)
        self.assertIn("0fddaf791d3c147766c5df108b34c761da9a3d07759043348671fa222eda0557",s)
        self.assertIn('FIN_SNAPSHOT = ' + repr(
            '064a16dde48c64a3001621902b4ae7a028ec4975183fd4c24b8a16338c1a226c'),s)
        self.assertEqual(hashlib.sha256(V9.read_bytes()).hexdigest(),
           'cb275a8ae8bc62c373ffe73063e60ff8ca7bd93661b899d887432ad6095cb07a')

    def test_v10_enrollment_has_distinct_protected_policy_location(self):
        src=STEAM.read_text()
        self.assertIn('/etc/aoe2war/web-prod-v10',src)
        self.assertIn('traffic-steam-v10',src)
        self.assertIn('finance_authorized',src)
        self.assertNotIn('ALTER ROLE',src)
        self.assertNotIn('GRANT ',src)
        self.assertNotIn('http://127.0.0.1:8092',src)

if __name__=='__main__':
    unittest.main()
