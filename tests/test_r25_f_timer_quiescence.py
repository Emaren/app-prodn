"""Transient systemd timer gate may retry; no failed financial proof is accepted."""
import importlib.util
import pathlib
import unittest
from unittest import mock
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("f_timer",ROOT/"scripts/aoe2_r24_f_parallel_nginx_cutover.py")
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
class Quiescence(unittest.TestCase):
    def test_real_timer_completion_replays_full_unchanged_native_snapshot(self):
        sample={"native_protected":"native","wolo":"legacy","finance":{"heartbeat":"inactive"}}
        with mock.patch.object(f,"snapshots",side_effect=[
             f.Hold("MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"),
             f.Hold("MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"),sample]) as native,\
             mock.patch.object(f.time,"sleep") as sleep:
            result=f.snapshots_during_bounded_timer_quiescence(["heartbeat"])
        self.assertIs(result,sample)
        self.assertEqual(native.call_count,3)
        self.assertEqual(sleep.call_count,2)
    def test_never_ignores_network_database_or_unrelated_failures(self):
        for reason in ("NATIVE_PROTECTED_DRIFT","EXACT_ROOT_PID_CHANGED",
                       "PG_CATALOG_ROLE_CHANGED","WOLO_SETTLEMENT_MUTATION"):
            with mock.patch.object(f,"snapshots",side_effect=f.Hold(reason)):
                with self.assertRaisesRegex(f.Hold,reason):
                    f.snapshots_during_bounded_timer_quiescence([])
    def test_expired_deadline_does_not_mask_long_running_timer(self):
        with mock.patch.object(f,"snapshots",side_effect=f.Hold("MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT")) as native:
            with self.assertRaisesRegex(f.Hold,"MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"):
                f.snapshots_during_bounded_timer_quiescence([],maximum_seconds=0)
            self.assertEqual(native.call_count,1)
    def test_native_readonly_collector_still_has_all_original_checks(self):
        source=(ROOT/"scripts/aoe2_r24_f_parallel_nginx_cutover.py").read_text()
        segment=source[source.index('def snapshots(units):'):source.index('def listener_lines(raw):')]
        for required in ('reader.protected_snapshot()','unit_state(OLD_UNIT)',
                         'unit_state(NEW_UNIT)','unit_state(u) for u in units',
                         'COMPLETE_NATIVE_FINANCE_UNIT_SET_DRIFT'):
            self.assertIn(required,segment)
if __name__=="__main__":unittest.main()
