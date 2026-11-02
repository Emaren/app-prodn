"""G's independent read-only one-shot sampling is bounded, not bypassed."""
import importlib.util
import pathlib
import subprocess
import unittest
from unittest import mock
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("g_timer",ROOT/"scripts/aoe2_r25_f_g_parallel_observer.py")
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
class GTimer(unittest.TestCase):
    def test_real_transient_timer_retries_full_native_system_state(self):
        sample={"finance.service":{"main_process":{"pid":123}}}
        with mock.patch.object(g,"system_state",side_effect=[
            g.Hold("MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"),
            g.Hold("MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"),
            sample]) as native, mock.patch.object(g.time,"sleep") as sleep:
            self.assertIs(g.stable_system_state_during_timer_quiescence(),sample)
        self.assertEqual(native.call_count,3)
        self.assertEqual(sleep.call_count,2)
    def test_never_retries_non_timer_financial_failures(self):
        for reason in ("ACTIVE_POSTGRESQL_INSTANCE_MISSING","ORIGINAL_FINANCIAL_UNIT_SET_NOT_COMPLETE",
                       "NOT_EXACTLY_ONE_LISTENER:8092","SYSTEMD_SERVICE_PID_MISSING"):
            with self.subTest(reason=reason):
                with mock.patch.object(g,"system_state",side_effect=g.Hold(reason)):
                    with self.assertRaisesRegex(g.Hold,reason):
                        g.stable_system_state_during_timer_quiescence()
    def test_timer_deadline_is_finite_and_fail_closed(self):
        with mock.patch.object(g,"system_state",side_effect=g.Hold("MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT")) as native:
            with self.assertRaisesRegex(g.Hold,"MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"):
                g.stable_system_state_during_timer_quiescence(maximum_seconds=0)
        self.assertEqual(native.call_count,1)
    def test_native_ssh_predicate_is_preserved_but_not_arbitrary_stderr(self):
        def result(stderr):
            return subprocess.CompletedProcess([],2,b"",stderr)
        with mock.patch.object(g.subprocess,"run",return_value=result(
                b"HOLD:G_R25_PARALLEL_POSTFLIGHT:MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT\n")):
            with mock.patch.object(g.pathlib.Path,"read_bytes",return_value=b"source"):
                with self.assertRaisesRegex(g.Hold,"G_REMOTE_NATIVE_HOLD:MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"):
                    g.ssh_snapshot("root@hel1","after")
        with mock.patch.object(g.subprocess,"run",return_value=result(
                b"PASSWORD=DO_NOT_DISCLOSE")):
            with mock.patch.object(g.pathlib.Path,"read_bytes",return_value=b"source"):
                with self.assertRaisesRegex(g.Hold,"G_REMOTE_UNCLASSIFIED_EXIT_2") as exc:
                    g.ssh_snapshot("root@hel1","after")
                self.assertNotIn("PASSWORD",str(exc.exception))
    def test_ssh_transport_exit_classified_without_disclosure_or_retry(self):
        response=subprocess.CompletedProcess([],255,b"",b"ssh: connection lost; TOKEN=NEVER_ECHO")
        with mock.patch.object(g.subprocess,"run",return_value=response) as call:
            with mock.patch.object(g.pathlib.Path,"read_bytes",return_value=b"source"):
                with self.assertRaisesRegex(g.Hold,"G_REMOTE_SSH_TRANSPORT_EXIT_255") as e:
                    g.ssh_snapshot("root@hel1","after")
                self.assertNotIn("TOKEN",str(e.exception))
        self.assertEqual(call.call_count,1)
    def test_unhandled_remote_python_class_is_sanitized_but_fails_closed(self):
        response=subprocess.CompletedProcess([],1,b"",b'Traceback (most recent call last):\n  File "/root/secret", line 1\nNameError: PASSWORD=NEVER_ECHO\n')
        with mock.patch.object(g.subprocess,"run",return_value=response) as call:
            with mock.patch.object(g.pathlib.Path,"read_bytes",return_value=b"source"):
                with self.assertRaisesRegex(g.Hold,"G_REMOTE_PYTHON_EXCEPTION_NAMEERROR") as e:
                    g.ssh_snapshot("root@hel1","after")
                self.assertNotIn("PASSWORD",str(e.exception))
        self.assertEqual(call.call_count,1)
    def test_native_hold_is_not_converted_to_ssh_transport(self):
        response=subprocess.CompletedProcess([],2,b"",b"HOLD:G_R25_PARALLEL_POSTFLIGHT:F_LOADED_NGINX_DOES_NOT_MATCH_ROOT_COMMIT")
        with mock.patch.object(g.subprocess,"run",return_value=response):
            with mock.patch.object(g.pathlib.Path,"read_bytes",return_value=b"source"):
                with self.assertRaisesRegex(g.Hold,"G_REMOTE_NATIVE_HOLD:F_LOADED_NGINX_DOES_NOT_MATCH_ROOT_COMMIT"):
                    g.ssh_snapshot("root@hel1","after")
if __name__=="__main__":unittest.main()
