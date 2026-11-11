"""Hermetic fail-closed tests for PR1326's independent PID1 watchdog.
No systemd mutations or production nft commands are executed by these tests.
"""
import datetime as dt
import importlib.util
import inspect
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

SRC=Path(__file__).resolve().parents[1]/"scripts/release/owner-review/r25_steam_live_atomic_renewal_REVIEW_ONLY.py"
def load():
    spec=importlib.util.spec_from_file_location("steam_watchdog_src",SRC)
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m
REQ={"nonce":"a"*40,"protected_host":{"boot_id":"fixture-boot-id"}}
class WatchdogSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.m=load()
    def test_import_no_implicit_watchdog(self):
        self.assertEqual(self.m.WATCHDOG_DELAY_SECONDS,115)
        self.assertEqual(self.m.WORKER_RUNTIME_MAX_SECONDS,85)
    def test_hard_runtime_expires_before_watchdog(self):
        self.assertGreaterEqual(self.m.WATCHDOG_DELAY_SECONDS-self.m.WORKER_RUNTIME_MAX_SECONDS,25)
        self.assertGreaterEqual(self.m.WORKER_NFT_BUDGET_SECONDS,30)
    def test_no_args_inert(self):
        p=subprocess.run([sys.executable,"-B",str(SRC)],
                          capture_output=True,text=True,timeout=10)
        self.assertEqual(p.returncode,3)
        self.assertIn("HOLD:SOURCE_REVIEW_NO_OPERATION",p.stdout)
    def test_watchdog_missing_packet_refused(self):
        p=subprocess.run([sys.executable,"-B",str(SRC),"--watchdog-recover"],
                          capture_output=True,text=True,timeout=10)
        self.assertEqual(p.returncode,3)
        self.assertIn("WATCHDOG_ONLY_PACKET_AND_HASH_ARGUMENTS",p.stdout)
    def test_watchdog_cannot_supply_approval_arg(self):
        p=subprocess.run([sys.executable,"-B",str(SRC),"--watchdog-recover",
            "--request","/root/fake","--request-sha","a"*64,
            "--approval-comment-id","6791234567"],
            capture_output=True,text=True,timeout=10)
        self.assertEqual(p.returncode,3)
        self.assertIn("WATCHDOG_ONLY_PACKET_AND_HASH_ARGUMENTS",p.stdout)
    def test_nonce_binds_unique_worker_and_rescue(self):
        m=self.m
        tag=m.sha(REQ["nonce"].encode())[:12]
        self.assertEqual(m.worker_name(REQ),m.WORKER_PREFIX+tag+".service")
        self.assertEqual(m.rescue_base(REQ),m.WATCHDOG_PREFIX+tag)
    def test_nonce_illegal_characters_refused(self):
        with self.assertRaisesRegex(RuntimeError,"NONCE_WRONG_SHAPE"):
            self.m.nonce_tag({"nonce":"-not-hex/"})
    def test_central_scope_explicit_watchdog(self):
        m=self.m
        base={"nonce":"a"*40,"protected_host":{"boot_id":"fixture-boot"}}
        x=m.approval_expectation(base,"1"*64,"2"*64)
        self.assertTrue(x["independent_systemd_watchdog_required"])
        self.assertTrue(x["watchdog_may_only_restore_original_steam_timer"])
        self.assertEqual(x["watchdog_delay_seconds"],115)
        self.assertEqual(x["worker_runtime_max_seconds"],85)
        for k in ("financial_authorized","web_activation_authorized",
                  "v22_install_authorized","manager_reload_authorized"):
            self.assertIs(x[k],False)
        self.assertEqual(set(x)|{"expires_utc"},set(m.APPROVAL_KEYS))
    def test_supervised_worker_denies_unsupervised_cgroup(self):
        m=self.m
        with patch.object(m.Path,"read_text",return_value="0::/system.slice/not-ours.service"):
            with self.assertRaisesRegex(RuntimeError,"WORKER_NOT_IN_NONCE_BOUND"):
                m.require_supervised_worker(REQ)
    def test_production_systemd_worker_runtime_source_gates(self):
        source=inspect.getsource(self.m.require_supervised_worker)
        for needle in ("KillMode","RuntimeMaxUSec","ControlGroup","MainPID",
                       "WORKER_NOT_IN_NONCE_BOUND","WORKER_RUNTIME_MAX_NOT_85S"):
            self.assertIn(needle,source)
    def test_prearm_before_original_stop_source_order(self):
        source=inspect.getsource(self.m.perform)
        self.assertLess(source.index("arm_independent_watchdog("),
                        source.index('bound_process(["systemctl","stop",TIMER]'))
        self.assertLess(source.index("NONCE_CONSUMED_ONCE_BEFORE_TIMER_MUTATION"),
                        source.index("arm_independent_watchdog("))
        self.assertIn("INDEPENDENT_WATCHDOG_NOT_ARMED_BEFORE_STOP",source)
    def test_watchdog_requires_independent_pid1_timer(self):
        source=inspect.getsource(self.m.arm_independent_watchdog)
        for needle in ("/usr/bin/systemd-run","--on-active=",
                       "--timer-property=AccuracySec=1us",
                       "--watchdog-recover","Triggers","WATCHDOG_NOT_PHYSICALLY_PREARMED"):
            self.assertIn(needle,source)
        self.assertNotIn("daemon-reload",source)
    def test_watchdog_recovery_requires_exact_boot_packet_intent(self):
        source=inspect.getsource(self.m.watchdog_recover)
        for needle in ("WATCHDOG_PACKET_SHA_DRIFT","WATCHDOG_BOOT_CHANGED",
                       "WATCHDOG_NOT_IN_INDEPENDENT_PID1_SERVICE",
                       "WATCHDOG_ORIGINAL_CONSUMED_INTENT_DRIFT",
                       "WATCHDOG_ORIGINAL_V20_UNIT_BYTES_DRIFT",
                       'bound_process(["systemctl","start",TIMER]'):
            self.assertIn(needle,source)
    def test_watchdog_fences_worker_before_native_timer(self):
        source=inspect.getsource(self.m.watchdog_recover)
        self.assertLess(source.index('bound_process(["systemctl","stop",worker]'),
                        source.index('bound_process(["systemctl","start",TIMER]'))
        self.assertIn("WATCHDOG_WORKER_NOT_FENCED",source)
    def test_watchdog_only_original_timer_or_dedicated_worker(self):
        source=inspect.getsource(self.m.watchdog_recover)
        self.assertNotIn("nft -f",source)
        self.assertNotIn("systemctl daemon-reload",source)
        self.assertNotIn("aoe2hdbets-web",source)
        self.assertNotIn("wolochain-mainnet-settlement",source)
    def test_runtime_budget_guard_precedes_nft_commit(self):
        source=inspect.getsource(self.m.perform)
        self.assertLess(source.index("WORKER_INSUFFICIENT_TIME_FOR_BATCH_AND_TIMER_RESTORE"),
                        source.index('bound_process(["nft","-f","-"]'))
    def test_watchdog_cancel_only_after_original_restored(self):
        source=inspect.getsource(self.m.restore_receipt_and_cancel)
        self.assertLess(source.index('unit_timer_active(TIMER)'),source.index('"stop",watchdog_timer'))
        self.assertIn("WATCHDOG_NOT_CANCELLED_AFTER_ORIGINAL_RESTORED",source)
    def test_emergency_restore_preserves_source_integrity(self):
        source=inspect.getsource(self.m.watchdog_recover)
        self.assertIn("TIMER_UNIT_SHA",source)
        self.assertIn("V20_UNIT_SHA",source)
        self.assertIn("finance",source.lower())
    def test_prepare_does_not_arm_or_stop_timer(self):
        source=inspect.getsource(self.m.prepare)
        self.assertNotIn("arm_independent_watchdog",source)
        self.assertNotIn("systemctl",source)
        self.assertNotIn("nft -f",source)
if __name__=="__main__":unittest.main()

class FinancialPortBoundaryTests(unittest.TestCase):
    def test_physical_postflight_detects_financial_listeners(self):
        import re
        m=load()
        source=inspect.getsource(m.protected_postflight)
        self.assertIn('r"\\s"',source)
        self.assertNotIn('r"\\\\s"',source)
        for port in (8092,8093,8094,8095):
            self.assertTrue(re.search(r":"+str(port)+r"\s",
                 "LISTEN 0 128 127.0.0.1:"+str(port)+" 0.0.0.0:*"))
        self.assertFalse(re.search(r":8092\s",
            "LISTEN 0 128 127.0.0.1:80920 0.0.0.0:*"))
