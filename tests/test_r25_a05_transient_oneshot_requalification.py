#!/usr/bin/env python3
"""Native R25 protected-state policy: transient timer race, never authority bypass."""
import importlib.util
import json
from pathlib import Path
from unittest import TestCase, mock

ROOT = Path(__file__).resolve().parents[1]
controller_path = ROOT / "scripts/r25_c_start_root.py"
spec = importlib.util.spec_from_file_location("qualified_r25_transient_source", controller_path)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
recovery_path = ROOT / "scripts/r25_a05_final_3032_recovery.py"
spec_r = importlib.util.spec_from_file_location("qualified_a05_recovery_source", recovery_path)
r = importlib.util.module_from_spec(spec_r)
spec_r.loader.exec_module(r)


def systemd_show(unit, state="inactive", pid="0", triggered_by=None, typename="oneshot"):
    timer = triggered_by or c.MONITOR_ONESHOT_TIMERS[unit]
    return "\n".join((
        "Id="+unit,
        "Type="+typename,
        "TriggeredBy="+timer,
        "NeedDaemonReload=no",
        "Result=success",
        "ActiveState="+state,
        "MainPID="+pid,
        "ExecMainStartTimestampMonotonic=123456",
        "User=",
        "WorkingDirectory=",
        "ExecStart={ path=/usr/bin/true ; argv[]=/usr/bin/true ; ignore_errors=no ; start_time=[Wed 2026-11-04] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }",
        "FragmentPath=/etc/systemd/system/"+unit,
        "DropInPaths=",
    )).encode()


class ProtectedNativeMonitorTests(TestCase):
    def test_only_exact_allowlisted_busy_oneshot_is_retryable(self):
        unit="aoe2hdbets-challenge-reconcile.service"
        with mock.patch.object(c,"run",return_value=systemd_show(unit, state="activating",pid="938123")):
            with self.assertRaisesRegex(c.Hold,"MONITOR_ONESHOT_TEMPORARILY_ACTIVE"):
                c.unit_state(unit)

    def test_changed_timer_or_loaded_command_is_never_temporarily_ignored(self):
        unit="aoe2hdbets-challenge-reconcile.service"
        wrong_timer=systemd_show(unit,state="activating",pid="938123",triggered_by="unexpected.timer")
        with mock.patch.object(c,"run",return_value=wrong_timer):
            with self.assertRaisesRegex(c.Hold,"MONITOR_ONESHOT_IDENTITY_DRIFT"):
                c.unit_state(unit)
        changed=systemd_show(unit,state="activating",pid="938123").replace(b"/usr/bin/true",b"/fake/path")
        with mock.patch.object(c,"run",return_value=changed):
            with self.assertRaisesRegex(c.Hold,"MONITOR_ONESHOT_TEMPORARILY_ACTIVE"):
                c.unit_state(unit)
        self.assertIn("MONITOR_EFFECTIVE_COMMAND_UNRECOGNIZED",controller_path.read_text())
        # The candidate is NEVER accepted; the next successful snapshot must
        # verify its command SHA against the original approved plan.

    def test_persistent_or_invalid_timer_service_fails_closed(self):
        unit="aoe2hdbets-challenge-reconcile.service"
        for state,pid in (("active","0"),("failed","0"),("inactive","21")):
            with self.subTest(state=state,pid=pid):
                with mock.patch.object(c,"run",return_value=systemd_show(unit,state,pid)):
                    with self.assertRaisesRegex(c.Hold,"MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"):
                        c.unit_state(unit)

    def test_only_normalized_inactive_oneshot_preserves_exact_command_hash(self):
        unit="aoe2hdbets-challenge-reconcile.service"
        with mock.patch.object(c,"run",side_effect=[
                systemd_show(unit),
                b"UNIT_FILE_EXACT_BYTES",
            ]):
            result=c.unit_state(unit)
        self.assertEqual(result["properties"]["MainPID"],"0")
        self.assertEqual(result["properties"]["ActiveState"],"inactive")
        self.assertIn("ExecStart_command_sha256",result["properties"])
        self.assertNotIn("ExecMainStartTimestampMonotonic",result["properties"])
        self.assertEqual(result["unit_config_sha256"],c.sha(b"UNIT_FILE_EXACT_BYTES"))

    def test_bounded_retry_rechecks_whole_fingerprint_after_job_finishes(self):
        with mock.patch.object(c,"production_protected_once",
                side_effect=[c.Hold("MONITOR_ONESHOT_TEMPORARILY_ACTIVE"),{"complete":"exact"}]) as f,\
             mock.patch.object(c.time,"monotonic",side_effect=[1.0,2.0]),\
             mock.patch.object(c.time,"sleep") as nap:
            self.assertEqual(c.production_protected(),{"complete":"exact"})
            self.assertEqual(f.call_count,2)
            nap.assert_called_once_with(0.35)

    def test_unknown_identity_drifts_do_not_retry(self):
        with mock.patch.object(c,"production_protected_once",
                side_effect=c.Hold("MONITOR_ONESHOT_IDENTITY_DRIFT")) as f,\
             mock.patch.object(c.time,"monotonic",return_value=1.0),\
             mock.patch.object(c.time,"sleep") as nap:
            with self.assertRaisesRegex(c.Hold,"MONITOR_ONESHOT_IDENTITY_DRIFT"):
                c.production_protected()
            f.assert_called_once()
            nap.assert_not_called()

    def test_bounded_retry_expires_instead_of_infinite_wait(self):
        with mock.patch.object(c,"production_protected_once",
                side_effect=c.Hold("MONITOR_ONESHOT_TEMPORARILY_ACTIVE")) as f,\
             mock.patch.object(c.time,"monotonic",side_effect=[0.0,47.0]),\
             mock.patch.object(c.time,"sleep") as nap:
            with self.assertRaisesRegex(c.Hold,"MONITOR_ONESHOT_TEMPORARILY_ACTIVE"):
                c.production_protected()
            f.assert_called_once()
            nap.assert_not_called()

    def test_current_owner_failure_requires_exact_unchanged_forensic_journal(self):
        self.assertEqual(r.FAILED_OWNER_ENTERED_SHA,
                         "7f1e0d51a7855cd17d8351a128c29cdf4773ae359d09a71024727a5fdfe40b49")
        self.assertEqual(r.FAILED_OWNER_HOLD_SHA,
                         "1bd55f0fb8994ba181526ce68270576e17131244daf068b3c1d6948a4ff4ffb2")
        self.assertIn("FAILED_OWNER_ROLLBACK_FILE_NOT_RESTORED",recovery_path.read_text())
        self.assertIn('"nonce_consumed": True',recovery_path.read_text())
        self.assertIn("CONSUMED_OWNER_RELEASE_FORENSIC_RECEIPT_CHANGED",recovery_path.read_text())
        self.assertIn("latest_failed_owner",recovery_path.read_text())
        self.assertEqual(r.PRODUCTION_SOURCE_SHA,
                         "8161731de2af7261dbdc201796fbcdb015d7a9f82facd301f44fb1d57582fec9")

    def test_native_db_nginx_financial_guards_unchanged(self):
        text=controller_path.read_text()
        for guard in ("PROTECTED_LISTENER_NOT_UNIQUE",
                      "ORIGINAL_PID_START_IDENTITY_CHANGED",
                      "PRODUCTION_ADDITIONAL_PUBLIC_READ_MODELS_CHANGED",
                      "PRODUCTION_ORIGINAL_OR_PREVIEW_CHANGED",
                      "PROD_PUBLIC_ADDITIONAL_DEFINITION_SHA256",
                      "PROD_OWNED_UNITS"):
            self.assertIn(guard,text)
        self.assertEqual(len(c.PROD_PUBLIC_ADDITIONAL_VIEWS),10)


if __name__=="__main__":
    import unittest
    unittest.main()
