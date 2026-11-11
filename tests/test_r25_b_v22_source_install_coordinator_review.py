"""Executable isolated adapter-state tests, zero HEL1 mutations or credentials."""
from __future__ import annotations

from contextlib import contextmanager
import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"scripts/release/r25_b_v22_source_install_coordinator_REVIEW_ONLY.py"
spec=importlib.util.spec_from_file_location("b_v22_coordinator",SRC)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class FakeHost:
    def __init__(self, fail=None):
        self.history=[]
        self.fail=fail
        self.fence=False
        self.sentinel=False
        self.timer=True
        self.lock=False
        self.public_writes=0
    def fire(self,point):
        self.history.append(point)
        if self.fail == point:
            raise RuntimeError("CRASH_SIMULATED:"+point)
    @contextmanager
    def held_original_v22_flock(self):
        self.fire("flock_acquire")
        self.lock=True
        try:yield
        finally:
            self.lock=False
            self.history.append("flock_release")
    def require_immutable_root_executor(self):self.fire("immutable_root_executor")
    def require_root_recovery_executor(self):self.fire("root_recovery_executor")
    def validate_root_packet_and_independent_central(self):self.fire("external_central")
    def verify_seven_pid_c04_finance_original_preflight(self):self.fire("seven_pid_preflight")
    def require_steam_oneshot_quiescent(self):self.fire("oneshot_quiescent")
    def verify_root_v20_inverse(self):self.fire("original_v20")
    def install_exact_persistent_condition_guard(self):
        self.fire("fence_install")
        self.fence=True
    def daemon_reload_and_prove_negative_condition(self):
        self.fire("fence_loaded")
        assert self.fence
    def create_root_only_install_sentinel(self):
        self.fire("sentinel_install")
        self.sentinel=True
        assert self.fence
    def stop_only_existing_steam_timer(self):
        self.fire("timer_stop")
        assert self.sentinel and self.fence
        self.timer=False
    def native_new_v22_selftest_and_original_profile(self):
        self.fire("native_new_selftest")
        assert self.sentinel and self.fence and not self.timer
    def native_original_v22_selftest_and_v20_fallback(self):self.fire("native_old_selftest")
    def verify_seven_pid_c04_finance_original_postflight(self):
        self.fire("seven_pid_postflight")
        assert self.fence and self.sentinel
    def seal_source_install_receipt_no_activation(self):
        self.fire("source_receipt")
        assert self.sentinel
    def remove_exact_sentinel(self):
        self.fire("sentinel_remove")
        self.sentinel=False
    def remove_own_exact_condition_guard(self):
        self.fire("fence_remove")
        assert not self.sentinel
        self.fence=False
    def daemon_reload_restore_original_effective_unit(self):self.fire("fence_removed_reload")
    def restore_original_steam_timer(self):
        self.fire("timer_restore")
        self.timer=True
    def verify_original_seven_pid_and_steam_refresh(self):self.fire("final_seven_pid_and_steam")
    def verify_existing_root_transaction_receipt(self):self.fire("verify_inverse_receipt")
    def transaction_has_complete_inverse(self):return True
    def verify_no_swap_was_started(self):self.fire("verify_no_swap")
    def verify_original_recovery_protected_postflight(self):self.fire("original_recovery_postflight")
    def require_persistent_guard_and_sentinel(self):
        self.fire("verify_recovery_fence")
        assert self.fence and self.sentinel
    def seal_exact_inverse_receipt(self):self.fire("inverse_receipt")

class FakeTransaction:
    def __init__(self, host):
        self.host=host
        self.prepared=False
        self.mixed=False
        self.new=False
        self.inverse_called=False
    def prepare(self):
        self.host.fire("transaction_prepare")
        assert self.host.sentinel
        self.prepared=True
    def apply(self):
        self.host.fire("transaction_apply")
        assert self.host.sentinel and not self.host.timer
        self.mixed=True
        self.new=True
        self.mixed=False
    def inverse(self):
        self.host.fire("transaction_inverse")
        assert self.host.sentinel and not self.host.timer
        self.inverse_called=True
        self.new=False
        self.mixed=False

def coord(fail=None):
    h=FakeHost(fail)
    t=FakeTransaction(h)
    c=m.SourceInstallCoordinator(h,t,{"source_install_only":True,
                                     "public_activation":False,
                                     "financial_authority":False})
    return h,t,c

class SourceInstallCoordinatorFixture(unittest.TestCase):
    def test_no_direct_install_cli(self):
        p=subprocess.run([sys.executable,"-B",str(SRC)],capture_output=True,text=True)
        self.assertEqual(p.returncode,3)
        self.assertIn("REVIEW_ONLY",p.stdout)
    def test_full_accepted_injected_sequence_no_public_action(self):
        h,t,c=coord()
        self.assertEqual(c.install()["status"],"PASS_SOURCE_INSTALL_SEQUENCED_HOST_ADAPTER")
        self.assertFalse(h.fence or h.sentinel or h.lock)
        self.assertTrue(h.timer and t.new)
        self.assertEqual(h.public_writes,0)
        self.assertLess(h.history.index("fence_loaded"),h.history.index("sentinel_install"))
        self.assertLess(h.history.index("sentinel_install"),h.history.index("transaction_apply"))
        self.assertLess(h.history.index("native_new_selftest"),h.history.index("sentinel_remove"))
        self.assertLess(h.history.index("sentinel_remove"),h.history.index("timer_restore"))
    def test_missing_authority_never_acquires_lock(self):
        h,t,c=coord()
        c.admission={"source_install_only":False}
        with self.assertRaisesRegex(m.Hold,"NO_INDEPENDENT"):c.install()
        self.assertEqual(h.history,[])
    def test_public_widening_denied_before_host_access(self):
        h,t,c=coord()
        c.admission["public_activation"]=True
        with self.assertRaisesRegex(m.Hold,"SCOPE_WIDENED"):c.install()
        self.assertEqual(h.history,[])
    def test_financial_widening_denied_before_host_access(self):
        h,t,c=coord()
        c.admission["financial_authority"]=True
        with self.assertRaisesRegex(m.Hold,"SCOPE_WIDENED"):c.install()
        self.assertEqual(h.history,[])
    def test_before_first_guard_fault_has_no_source_mutation(self):
        for step in ("immutable_root_executor","external_central",
                     "seven_pid_preflight","flock_acquire","original_v20"):
            with self.subTest(step=step):
                h,t,c=coord(step)
                with self.assertRaises(RuntimeError):c.install()
                self.assertFalse(t.prepared or t.new or h.sentinel)
    def test_fence_install_or_reload_failure_no_source_change(self):
        for step in ("fence_install","fence_loaded"):
            with self.subTest(step=step):
                h,t,c=coord(step)
                with self.assertRaises(RuntimeError):c.install()
                self.assertFalse(t.prepared or t.new)
    def test_fault_after_sentinel_keeps_persistent_denial(self):
        for step in ("timer_stop","transaction_prepare","transaction_apply",
                     "native_new_selftest","seven_pid_postflight","source_receipt"):
            with self.subTest(step=step):
                h,t,c=coord(step)
                with self.assertRaises(RuntimeError):c.install()
                self.assertTrue(h.fence and h.sentinel)
                self.assertNotIn("timer_restore",h.history)
                self.assertNotIn("sentinel_remove",h.history)
    def test_failed_source_swap_requires_separate_root_inverse(self):
        h,t,c=coord("native_new_selftest")
        with self.assertRaisesRegex(m.Hold,"RECOVERY_REQUIRED"):c.install()
        self.assertTrue(t.new and h.fence and h.sentinel)
        h.fail=None
        result=c.recover_original()
        self.assertEqual(result["status"],"PASS_EXACT_OLD_SOURCE_INVERSE_AFTER_EXTERNAL_PROOF")
        self.assertTrue(t.inverse_called)
        self.assertFalse(t.new or h.fence or h.sentinel)
        self.assertTrue(h.timer)
        self.assertLess(h.history.index("transaction_inverse"),h.history.index("sentinel_remove"))
    def test_failure_at_timer_reenable_does_not_claim_complete(self):
        h,t,c=coord("timer_restore")
        with self.assertRaises(RuntimeError):c.install()
        self.assertNotEqual(c.phase,"SOURCE_INSTALL_COMPLETE_NO_ACTIVATION")
        self.assertTrue(t.new)
    def test_inverse_without_persistent_fence_denied(self):
        h,t,c=coord()
        with self.assertRaises(AssertionError):c.recover_original()
        self.assertFalse(t.inverse_called)

    def test_boot_recovery_quiesces_restarted_timer_behind_marker(self):
        h,t,c=coord()
        h.fence=True
        h.sentinel=True
        h.timer=True  # timer automatically resumed after host reboot
        result=c.recover_original()
        self.assertIn("PASS_EXACT_OLD",result["status"])
        self.assertLess(h.history.index("timer_stop"),h.history.index("transaction_inverse"))
        self.assertTrue(h.timer)

if __name__=="__main__":unittest.main()
