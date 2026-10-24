import importlib.util
import pathlib
import sys
import tempfile
import unittest

S = pathlib.Path(__file__).resolve().parents[1] / 'scripts/aoe2_satchel_cap_crosswalk.py'
spec = importlib.util.spec_from_file_location('aoe2_satchel_cap_crosswalk', S)
app = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = app
spec.loader.exec_module(app)


def fixture(root, cap=10000, daily=50000):
    parts = {
        'lib/betAutomation.ts': f'export const BET_AUTOMATION_MAX_PER_GAME_WOLO = {cap};\nexport const BET_AUTOMATION_MAX_RESERVE_WOLO = 10000;\n',
        'lib/warSatchelAutoSpendConsent.ts': f'c.perGameCapWolo <= {cap} && c.dailyCapWolo <= {daily}',
        'lib/warSatchelWagerReservation.ts': f'const MAX_WAGER_UWOLO = BigInt({cap}) * BigInt(1000000);',
        'lib/warSatchelDedicatedSignerClient.ts': f'BigInt(p.amountUwolo)>BigInt({cap})*BigInt(1000000)',
        'lib/warSatchelFundedLedger.ts': f'input.reserveUwolo > BigInt({cap}) * BigInt(1000000)',
    }
    for name, contents in parts.items():
        file = root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(contents)


class EconomicCrosswalkTests(unittest.TestCase):
    def test_aligned_literals_remain_non_authorizing(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d)
            fixture(root)
            r=app.inspect(root)
            self.assertEqual(r['status'], 'LITERALS_MATCH_OWNER_REQUEST_NOT_CERTIFIED')
            self.assertFalse(r['custody_enabled'])
            self.assertFalse(r['safe_to_deploy'])
            reserve=[o for o in r['observations'] if o['rule']=='finite_plan_reserve'][0]
            self.assertEqual(reserve['classification'],'DISTINCT_FINITE_PLAN_RESERVE')

    def test_catches_all_independent_old_1000_limits(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d)
            fixture(root,1000,10000)
            r=app.inspect(root)
            self.assertEqual(r['status'],'INCOMPLETE_OR_MISMATCHED')
            self.assertEqual(r['mismatches'],6)
            self.assertEqual(r['unknown_rules'],0)

    def test_unknown_does_not_claim_alignment(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d)
            fixture(root)
            p=root/'lib/warSatchelDedicatedSignerClient.ts'
            p.unlink()
            self.assertEqual(app.inspect(root)['unknown_rules'],1)
            real=root/'real.ts'
            real.write_text('BigInt(p.amountUwolo)>BigInt(10000)*BigInt(1000000)')
            p.symlink_to(real)
            self.assertEqual(app.inspect(root)['unknown_rules'],1)

    def test_syntax_drift_is_unknown(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d)
            fixture(root)
            (root/'lib/warSatchelAutoSpendConsent.ts').write_text('dynamicConfiguredCap()')
            self.assertEqual(app.inspect(root)['unknown_rules'],2)


if __name__ == '__main__':
    unittest.main()
