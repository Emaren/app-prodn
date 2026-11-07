"""Session B v5s exact hourly C03 observer normalization contract, offline only.

No HEL1 calls, nft changes, live PostgreSQL operations, or service control.
"""
from __future__ import annotations
import hashlib, importlib.util, json
from pathlib import Path
from unittest import TestCase, mock

ROOT=Path(__file__).resolve().parents[1]
STEAM=ROOT/"scripts/release/r25_steam_refresh_v5s.py"
ORIGINAL=ROOT/"scripts/r25_c_start_root.py"
spec=importlib.util.spec_from_file_location("steam_v5s_c03_explicit",STEAM)
s=importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)

def fake_show(unit,when="17:24:30",timer="wolo-c03-observer.timer",
              action="/usr/bin/true",result="success",
              active="inactive",pid="0",need_reload="no"):
    return "\n".join((
        "Id="+unit,"Type=oneshot","TriggeredBy="+timer,
        "NeedDaemonReload="+need_reload,"Result="+result,
        "ActiveState="+active,"MainPID="+pid,
        "ExecMainStartTimestampMonotonic="+("1914807388169" if when=="17:24:30" else "1911207388169"),
        "User=","WorkingDirectory=",
        "ExecStart={ path="+action+" ; argv[]="+action+
            " ; ignore_errors=no ; start_time=[Sat 2026-11-07 "+when+
            " UTC] ; stop_time=[Sat 2026-11-07 17:25:00 UTC] ; pid=0 ; code=exited ; status=0/0 }",
        "FragmentPath=/etc/systemd/system/"+unit,"DropInPaths=",
    )).encode()

def original_with_reviewed_timer():
    original_bytes=ORIGINAL.read_bytes()
    with mock.patch.object(s,"ORIG",ORIGINAL),\
         mock.patch.object(s,"ORIG_SHA",hashlib.sha256(original_bytes).hexdigest()),\
         mock.patch.object(s,"rawfile",return_value=original_bytes):
        return s.load_immutable_original()

class NativeExactObserverTests(TestCase):
    def test_only_two_exact_extra_service_timer_bindings(self):
        m=original_with_reviewed_timer()
        spec2=importlib.util.spec_from_file_location("original_unmodified_c03",ORIGINAL)
        base=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(base)
        added=set(m.MONITOR_ONESHOT_TIMERS)-set(base.MONITOR_ONESHOT_TIMERS)
        self.assertEqual(added,{s.FINGERPRINT_TIMER,s.C03_FINGERPRINT_OBSERVER_SERVICE})
        self.assertEqual(m.MONITOR_ONESHOT_TIMERS[s.C03_FINGERPRINT_OBSERVER_SERVICE],
                         "wolo-c03-observer.timer")
        self.assertEqual(m.MONITOR_ONESHOT_TIMERS[s.FINGERPRINT_TIMER],
                         "aoe2war-public-priority-relay.timer")
    def observe(self,when="17:24:30",**changes):
        m=original_with_reviewed_timer()
        name=s.C03_FINGERPRINT_OBSERVER_SERVICE
        def respond(argv,**kwargs):
            if "show" in argv:return fake_show(name,when,**changes)
            if "cat" in argv:return b"REVIEWED_C03_UNIT_EXACT"
            raise AssertionError(argv)
        with mock.patch.object(m,"run",side_effect=respond):
            return m.unit_state(name)
    def test_hourly_completed_timestamps_normalize_without_ignoring_unit(self):
        one=self.observe(when="16:24:21")
        two=self.observe(when="17:24:30")
        self.assertEqual(one,two)
        self.assertNotIn("ExecMainStartTimestampMonotonic",one["properties"])
        self.assertNotIn("ExecStart",one["properties"])
        self.assertIn("ExecStart_command_sha256",one["properties"])
        self.assertEqual(one["unit_config_sha256"],
                         hashlib.sha256(b"REVIEWED_C03_UNIT_EXACT").hexdigest())
    def test_changed_timer_denied(self):
        m=original_with_reviewed_timer()
        name=s.C03_FINGERPRINT_OBSERVER_SERVICE
        with mock.patch.object(m,"run",side_effect=[
                fake_show(name,timer="unreviewed-c03-escape.timer"),b"UNIT"]):
            with self.assertRaisesRegex(m.Hold,"MONITOR_ONESHOT_IDENTITY_DRIFT"):
                m.unit_state(name)
    def test_in_progress_oneshot_requires_completion_before_sampling(self):
        m=original_with_reviewed_timer()
        name=s.C03_FINGERPRINT_OBSERVER_SERVICE
        with mock.patch.object(m,"run",return_value=fake_show(name,active="activating",pid="123")):
            with self.assertRaisesRegex(m.Hold,"MONITOR_ONESHOT_TEMPORARILY_ACTIVE"):
                m.unit_state(name)
    def test_failed_state_denied(self):
        m=original_with_reviewed_timer()
        name=s.C03_FINGERPRINT_OBSERVER_SERVICE
        with mock.patch.object(m,"run",return_value=fake_show(name,active="failed")):
            with self.assertRaisesRegex(m.Hold,"MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"):
                m.unit_state(name)
    def test_daemon_reload_requested_denied(self):
        m=original_with_reviewed_timer()
        name=s.C03_FINGERPRINT_OBSERVER_SERVICE
        with mock.patch.object(m,"run",return_value=fake_show(name,need_reload="yes")):
            with self.assertRaisesRegex(m.Hold,"MONITOR_ONESHOT_IDENTITY_DRIFT"):
                m.unit_state(name)
    def test_changed_command_remains_in_fingerprint(self):
        original=self.observe()
        changed=self.observe(action="/usr/bin/other")
        self.assertNotEqual(original["properties"]["ExecStart_command_sha256"],
                            changed["properties"]["ExecStart_command_sha256"])
    def test_non_success_result_remains_in_fingerprint(self):
        original=self.observe()
        changed=self.observe(result="exit-code")
        self.assertNotEqual(original["properties"]["Result"],changed["properties"]["Result"])
        self.assertNotEqual(original,changed)
    def test_unit_file_change_remains_in_fingerprint(self):
        m=original_with_reviewed_timer()
        name=s.C03_FINGERPRINT_OBSERVER_SERVICE
        with mock.patch.object(m,"run",side_effect=[
             fake_show(name),b"REVIEWED_C03_UNIT_CHANGED"]):
            changed=m.unit_state(name)
        self.assertNotEqual(changed["unit_config_sha256"],self.observe()["unit_config_sha256"])
    def test_no_generic_finance_snapshot_drift_override_in_controller(self):
        txt=STEAM.read_text()
        for expected in ("PROTECTED_FINANCE_SNAPSHOT_CHANGED",
                         "PROTECTED_FINANCE_SNAPSHOT_CHANGED_BEFORE_NFT",
                         "STAGED_V5_FINANCE_SNAPSHOT_OR_POLICY_DRIFT",
                         "REFRESH_SYSTEMD_SECURITY_DRIFT",
                         "finance_authorized\":False",
                         "C03_FINGERPRINT_OBSERVER_SERVICE"):
            self.assertIn(expected,txt)
        self.assertNotIn("IGNORE_FINANCE_SNAPSHOT",txt)
    def test_new_runtime_admission_is_distinct_from_prior_v5r(self):
        self.assertIn("web-prod-v5s",str(s.ADMISSION))
        self.assertIn("web-prod-v5s",str(s.POLICY))
        self.assertIn("v5s.py",str(s.NEW_SELF))
        self.assertEqual(s.C03_FINGERPRINT_OBSERVER_SERVICE,"wolo-c03-observer.service")
if __name__=="__main__":
 import unittest
 unittest.main()
