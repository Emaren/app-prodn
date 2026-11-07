"""C03-safe v5x R2: do not SIGTERM the original protected Steam oneshot."""
import importlib.util
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'scripts/release/r25_bets_history_v5x_nonfinancial_cutover.py'
S=importlib.util.spec_from_file_location('r25_v5x_r2_source',SCRIPT)
assert S and S.loader
r=S.loader
m=importlib.util.module_from_spec(S)
r.exec_module(m)

class OriginalProtectedSteamQuiesce(TestCase):
    def test_active_oneshot_must_finish_successfully_without_stop(self):
        events=[('active','success'),('deactivating','success'),('inactive','success')]
        data=[]
        def state(_unit,key):
            if key=='ActiveState':
                data.append(events.pop(0))
            return data[-1][0] if key=='ActiveState' else data[-1][1]
        with patch.object(m,'state',side_effect=state) as reader,\
             patch.object(m.time,'sleep') as sleeper:
            m.quiesce_steam_after_timer_stop()
        self.assertEqual(reader.call_count,6)
        self.assertEqual(sleeper.call_count,2)

    def test_fast_inactive_success_is_noop(self):
        with patch.object(m,'state',side_effect=lambda _,key:{
            'ActiveState':'inactive','Result':'success'}[key]),\
             patch.object(m.time,'sleep') as sleeper:
            m.quiesce_steam_after_timer_stop()
            sleeper.assert_not_called()

    def test_any_failed_steam_result_remains_hold(self):
        for active,result in (('failed','exit-code'),
                              ('inactive','exit-code'),
                              ('active','exit-code'),
                              ('activating','signal'),
                              ('deactivating','timeout')):
            with self.subTest(active=active,result=result),\
                 patch.object(m,'state',side_effect=lambda _,key:{
                   'ActiveState':active,'Result':result}[key]),\
                 patch.object(m.time,'sleep') as sleeper:
                with self.assertRaises(m.Hold):
                    m.quiesce_steam_after_timer_stop()
                sleeper.assert_not_called()

    def test_unknown_active_state_is_hold(self):
        for active in ('reloading','maintenance','not-found','', 'failed'):
            with self.subTest(active=active),\
                 patch.object(m,'state',side_effect=lambda _,key:{
                  'ActiveState':active,'Result':'success'}[key]),\
                 patch.object(m.time,'sleep') as sleeper:
                with self.assertRaises(m.Hold):
                    m.quiesce_steam_after_timer_stop()
                sleeper.assert_not_called()

    def test_persistent_oneshot_is_bounded(self):
        with patch.object(m,'state',side_effect=lambda _,key:{
            'ActiveState':'active','Result':'success'}[key]) as reader,\
             patch.object(m.time,'sleep') as sleeper:
            with self.assertRaises(m.Hold):
                m.quiesce_steam_after_timer_stop()
            self.assertEqual(sleeper.call_count,35)
            self.assertEqual(reader.call_count,72)

    def test_commit_must_not_send_sigterm_to_active_restricted_steam_unit(self):
        source=SCRIPT.read_text()
        self.assertNotIn('exec_ok(["/usr/bin/systemctl", "stop", STEAM]',source)
        self.assertIn('exec_ok(["/usr/bin/systemctl", "stop", STEAM_TIMER]',source)
        self.assertIn('quiesce_steam_after_timer_stop()',source)
        self.assertIn('time.sleep(1)',source)
        self.assertIn('STEAM_RESTRICTED_ONESHOT_FAILED_OR_OUTSIDE_WAIT_WINDOW',source)
        self.assertIn('PASS_R25_BETS_HISTORY_V5X_PUBLIC_NONFINANCIAL_ACCEPTED',source)
        self.assertIn('ROOT = Path("/root/aoe2war-r25-bets-history-v5x-r2-20261107")',source)
        self.assertIn('OLD_WEB_PID = 2120006',source)
        self.assertIn('financial_c01_c09_accepted',source)

    def test_watchdog_preserved_exact_original_units(self):
        source=SCRIPT.read_text()
        for v in ('PREIMAGE_WEB', 'PREIMAGE_STEAM', 'WATCHDOG_PID',
                  'WATCHDOG_TIMED_OUT_WITHOUT_ROOT_RELEASE_ACCEPTANCE',
                  'NEW_WEB_UNIT_SHA','NEW_V5X_SOURCE_SHA'):
            self.assertIn(v,source)
        self.assertNotIn('reset-failed',source)

if __name__=="__main__":
    import unittest
    unittest.main()
