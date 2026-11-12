"""Review-only V22 old-state inverse after actual reboot/PID reallocation."""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
P=ROOT/"scripts/release/r25_v22_root_install_admission_REVIEW_ONLY.py"
spec=importlib.util.spec_from_file_location("b_v22_reboot_policy",P)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

NEXT_BOOT="12345678-1234-1234-1234-123456789abc"
def snapshot(boot=NEXT_BOOT):
    pid={name:i+5000 for i,name in enumerate(m.PID_BASE)}
    return {
        "host":m.HOST_REVIEW,
        "boot":boot,
        "pids":pid if boot!=m.BOOT_REVIEW else dict(m.PID_BASE),
        "nrestarts":{name:0 for name in m.PID_BASE},
        "c04_masked":{
            "wolochain-mainnet-settlement.service":True,
            "wolochain-founder-rewards-settlement.service":True,
        },
        "finance_listeners":[],
        "nginx_selectors":6,
        "original_unit_sha256":m.WEB_ORIGINAL_UNIT_SHA,
        "stage0003_sha256":m.STAGE_EVENT_SHA,
        "v20_sha256":m.V20_SHA,
        "steam_unit_sha256":m.V22_STEAM_SERVICE_UNIT_SHA,
        "steam_timer_unit_sha256":m.V22_TIMER_UNIT_SHA,
        "steam_lock_dropin_sha256":m.V22_LOCK_DROPIN_SHA,
        "public_3032_http":200,
        "original_3030_http":200,
        "public_bets_http":503,
        "emergency_3033_http":503,
        "manager_reload_pending":False,
        "steam_source_sha256":m.PINNED["v22"][1],
        "steam_timer_active":False,
    }

class BRebootRecoveryPolicy(unittest.TestCase):
    def test_new_boot_with_current_seven_pids_safe_source_inverse_accepted(self):
        before=snapshot()
        after=copy.deepcopy(before)
        after["steam_source_sha256"]=m.PINNED["v22"][0]
        self.assertEqual(m.validate_recovery_protected_snapshot(
            before,after,timer_restored=False)["status"],
            "PASS_REBOOT_SAFE_EXACT_ORIGINAL_RECOVERY_PROTECTION_ONLY")
        after["steam_timer_active"]=True
        self.assertEqual(m.validate_recovery_protected_snapshot(
            before,after,timer_restored=True)["financial_authority"],False)

    def test_crashed_before_first_swap_accepts_original_v22_for_recovery(self):
        before=snapshot()
        before["steam_source_sha256"]=m.PINNED["v22"][0]
        after=copy.deepcopy(before)
        self.assertEqual(m.validate_recovery_protected_snapshot(
            before,after,timer_restored=False)["public_cutover"],False)

    def test_recovery_requires_exact_original_sha_after(self):
        before=snapshot()
        after=copy.deepcopy(before)
        with self.assertRaisesRegex(m.Hold,"RECOVERY_REQUIRES_EXACT_ORIGINAL_V22"):
            m.validate_recovery_protected_snapshot(before,after,timer_restored=False)

    def test_no_actual_protected_process_restarts_or_pid_change_during_inverse(self):
        before=snapshot()
        after=copy.deepcopy(before)
        after["steam_source_sha256"]=m.PINNED["v22"][0]
        name=next(iter(m.PID_BASE))
        after["pids"][name]+=100
        with self.assertRaisesRegex(m.Hold,"RECOVERY_BOOT_OR_PROTECTED_PID_CHANGED"):
            m.validate_recovery_protected_snapshot(before,after,timer_restored=False)

    def test_invalid_or_old_boot_bypass_denied(self):
        before=snapshot("garbage")
        after=copy.deepcopy(before)
        after["steam_source_sha256"]=m.PINNED["v22"][0]
        with self.assertRaisesRegex(m.Hold,"RECOVERY_BEFORE_BOOT_SHAPE"):
            m.validate_recovery_protected_snapshot(before,after,timer_restored=False)
        before=snapshot(m.BOOT_REVIEW)
        after=copy.deepcopy(before)
        after["pids"][next(iter(after["pids"]))]=9999
        with self.assertRaises(m.Hold):
            m.validate_recovery_protected_snapshot(before,after,timer_restored=False)

    def test_financial_open_ports_or_unmasked_settlement_denied(self):
        for mutation in (
            ("finance_listeners",[8094]),
            ("c04_masked",{
                "wolochain-mainnet-settlement.service":False,
                "wolochain-founder-rewards-settlement.service":True}),
        ):
            before=snapshot()
            after=copy.deepcopy(before)
            after["steam_source_sha256"]=m.PINNED["v22"][0]
            after[mutation[0]]=mutation[1]
            with self.subTest(mutation=mutation[0]):
                with self.assertRaisesRegex(m.Hold,"RECOVERY_AFTER_FINANCIAL_FENCE"):
                    m.validate_recovery_protected_snapshot(before,after,timer_restored=False)

    def test_original_3032_unit_or_bets_source_drift_denied(self):
        for key,value in (
            ("original_unit_sha256","0"*64),
            ("steam_lock_dropin_sha256","1"*64),
            ("public_bets_http",200),
        ):
            before=snapshot()
            after=copy.deepcopy(before)
            after["steam_source_sha256"]=m.PINNED["v22"][0]
            after[key]=value
            with self.subTest(key=key):
                with self.assertRaisesRegex(m.Hold,"RECOVERY_AFTER_"):
                    m.validate_recovery_protected_snapshot(before,after,timer_restored=False)

    def test_direct_new_install_remains_pinned_to_original_boot(self):
        policy=P.read_text()
        self.assertIn('packet.get("boot_id") == actual_boot == BOOT_REVIEW',policy)
        wrapper=(ROOT/"scripts/release/r25_b_hel1_source_install_entrypoint_REVIEW_ONLY.py").read_text()
        self.assertIn('argv==["source-install"]',wrapper)
        self.assertIn('["recover-exact-original"]',wrapper)

if __name__=="__main__":unittest.main()
