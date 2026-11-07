"""Demonstrate genuine Steam oneshot completion before a public R25 swap."""
from __future__ import annotations
import importlib.util
import inspect
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'scripts/release/r25_bets_history_v5x_nonfinancial_cutover.py'
spec=importlib.util.spec_from_file_location('r25_post_rollback_steam_wait',SOURCE)
assert spec and spec.loader
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class NaturalSteamQuiescence(unittest.TestCase):
    def test_new_release_root_never_overwrites_consumed_previous_attempt(self):
        self.assertEqual(m.ROOT.name,'aoe2war-r25-bets-history-v5x-r2-20261107')
        self.assertNotEqual(m.ROOT.name,'aoe2war-r25-bets-history-v5x-20261107')
        self.assertEqual(m.OLD_WEB_PID,2120006)
        self.assertFalse(m.receipt_payload(100,200,{"validated_destination_count":3})["financial_c01_c09_accepted"])

    def test_immediately_idle_success_does_not_call_steam_stop(self):
        with patch.object(m,'state',side_effect=['inactive','success']) as read,\
             patch.object(m.time,'sleep') as sleep:
            m.quiesce_steam_after_timer_stop()
            self.assertEqual(read.call_count,2)
            sleep.assert_not_called()

    def test_legitimate_running_oneshot_finishes_without_signal(self):
        with patch.object(m,'state',side_effect=[
                'active','success','deactivating','success','inactive','success']) as read,\
             patch.object(m.time,'sleep') as sleep:
            m.quiesce_steam_after_timer_stop()
            self.assertEqual(read.call_count,6)
            self.assertEqual(sleep.call_count,2)
            sleep.assert_called_with(1)

    def test_failed_or_killed_oneshot_remains_hard_hold(self):
        for active,result in (('failed','signal'),('inactive','signal'),('active','exit-code'),
                              ('activating','exit-code'),('unknown','success')):
            with self.subTest(active=active,result=result),\
                 patch.object(m,'state',side_effect=[active,result]),\
                 patch.object(m.time,'sleep') as sleep:
                with self.assertRaises(m.Hold):
                    m.quiesce_steam_after_timer_stop()
                sleep.assert_not_called()

    def test_oneshot_does_not_run_forever(self):
        with patch.object(m,'state',side_effect=lambda unit,key:
                          'active' if key=='ActiveState' else 'success'),\
             patch.object(m.time,'sleep') as sleep:
            with self.assertRaisesRegex(m.Hold,'OUTSIDE_WAIT_WINDOW'):
                m.quiesce_steam_after_timer_stop()
            self.assertEqual(sleep.call_count,35)

    def test_release_never_stop_kills_existing_restricted_steam_oneshot(self):
        src=inspect.getsource(m.commit)
        self.assertIn('exec_ok(["/usr/bin/systemctl", "stop", STEAM_TIMER]',src)
        self.assertIn('quiesce_steam_after_timer_stop()',src)
        self.assertNotIn('exec_ok(["/usr/bin/systemctl", "stop", STEAM]',src)
        self.assertLess(src.index('quiesce_steam_after_timer_stop()'),
                        src.index('exec_ok(["/usr/bin/systemctl", "stop", WEB]'))

    def test_failed_steam_cannot_be_accepted_as_timer_collision(self):
        source=inspect.getsource(m.quiesce_steam_after_timer_stop)
        self.assertIn('result == "success"',source)
        self.assertNotIn('reset-failed',source)
        self.assertNotIn('systemctl restart',source)
        self.assertNotIn('skip_finance',source)

if __name__=='__main__':
    unittest.main()
