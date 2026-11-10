"""Additive hostile evidence tests for V21 proposal. Never touch live units."""
import importlib.util
from pathlib import Path
import unittest
import copy

ORIGINAL=Path(__file__).resolve().parent/"test_r25_steam_c01_next_admission_v1.py"
SPEC=importlib.util.spec_from_file_location("steam_v21_orig_fixture",ORIGINAL)
orig=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(orig)
p=orig.p

class ExtraNegativeV21(unittest.TestCase):
    def reject(self, edit, why=None):
        b,a,r=orig.fixture()
        edit(b,a,r)
        with self.assertRaisesRegex(p.AdmissionHold,"HOLD:V21_C01_PROPOSAL_"+(why or "")):
            p.candidate_transition(b,a,r)

    def test_post_restart_of_existing_reviewer_cannot_be_re_admitted(self):
        def changed(b,a,r):
            name=r["transition_unit"]
            b["units"][name].update(active_state="active",main_pid=999,start_ticks=123)
            r["pre_state_sha256"]=p.digest(b)
            a["units"][name].update(active_state="active",main_pid=1000,start_ticks=124)
            r["post_state_sha256"]=p.digest(a)
        self.reject(changed,"SERVICE_ALREADY_STARTED")

    def test_stale_start_tick_does_not_prove_a_new_first_start(self):
        self.reject(lambda b,a,r: a["units"][r["transition_unit"]].update(start_ticks=None),
                    "NOT_BOUNDED_ZERO_FUNDS_START")

    def test_restarted_second_service_in_same_approval_is_rejected(self):
        def changed(b,a,r):
            name="wolo-satchel-c01.service"
            a["units"][name].update(active_state="active",main_pid=123124,start_ticks=9123457)
            r["post_state_sha256"]=p.digest(a)
        self.reject(changed,"ONLY_ONE_SERVICE")

    def test_missing_or_zero_owner_permit_is_a_hold(self):
        for key in ("owner_approval_receipt_sha256","codex_zero_funds_receipt_sha256"):
            for value in ("",None,"0"*64):
                with self.subTest(key=key,value=value):
                    self.reject(lambda b,a,r,k=key,v=value:r.update({k:v}),"RECEIPT_ID")

    def test_fake_duplicate_approval_receipts_are_a_hold(self):
        self.reject(lambda b,a,r:r.update(codex_zero_funds_receipt_sha256="a"*64),
                    "INDEPENDENT_RECEIPTS")

    def test_replay_and_nonce_reuse_denied(self):
        self.reject(lambda b,a,r:r.update(previous_one_use_receipt_consumed=True),
                    "ONE_USE_REPLAY")
        self.reject(lambda b,a,r:r.update(approval_id="C01-V21-INVALID NONCE"),
                    "OWNER_APPROVAL_ID")

    def test_native_and_legacy_ports_all_fail_even_when_prestate_claims_open(self):
        for port in p.PROTECTED_PORTS:
            with self.subTest(port=port):
                def changed(b,a,r):
                    b["ports"][port]=["127.0.0.1:"+port]
                    a["ports"][port]=["127.0.0.1:"+port]
                    r["pre_state_sha256"]=p.digest(b)
                    r["post_state_sha256"]=p.digest(a)
                self.reject(changed,"FINANCE_PORTS")

    def test_binary_config_and_execstart_replacements_fail(self):
        for field in ("unit_config_sha256","effective_exec_sha256","binary_sha256"):
            with self.subTest(field=field):
                def changed(b,a,r):
                    k=r["transition_unit"]
                    b["units"][k][field]="f"*64
                    a["units"][k][field]="f"*64
                    r["pre_state_sha256"]=p.digest(b)
                    r["post_state_sha256"]=p.digest(a)
                self.reject(changed,"PIN_")

    def test_steamed_policy_weakening_even_with_matching_snapshot_fails(self):
        def changed(b,a,r):
            b["nft"]="NO_PROTECTION"
            a["nft"]="NO_PROTECTION"
            r["pre_state_sha256"]=p.digest(b)
            r["post_state_sha256"]=p.digest(a)
        self.reject(changed,"WEB_ROLLBACK")
        self.reject(lambda b,a,r:r.update(observed_v20_policy_action="PASS_OVERRIDE"),
                    "V20_PROTECTION_BYPASS")

    def test_unauthorized_state_or_granted_signer_permissions_fail(self):
        self.reject(lambda b,a,r:a["units"][r["transition_unit"]].update(signer_permission=True),
                    "POST_UNIT_PIN_OR_PROTECTION_CHANGED")
        self.reject(lambda b,a,r:a["units"][r["transition_unit"]].update(funded_actions=1),
                    "POST_UNIT_PIN_OR_PROTECTION_CHANGED")
        self.reject(lambda b,a,r:a["units"][r["transition_unit"]].update(manual_activation_condition="OPERATOR_BYPASS"),
                    "POST_UNIT_PIN_OR_PROTECTION_CHANGED")

    def test_stale_source_and_rollback_pid_rejected(self):
        self.reject(lambda b,a,r:a["web"].update({"3030_pid":999999}),
                    "DRIFT_WEB")
        self.reject(lambda b,a,r:a.update(source="0"*40),"R25_SOURCE")

    def test_positive_is_still_only_a_proposal_without_restart_authority(self):
        b,a,r=orig.fixture()
        result=p.candidate_transition(b,a,r)
        self.assertFalse(result["deployment_authorized"])
        self.assertFalse(result["funded_operations_authorized"])
        self.assertTrue(result["v20_must_still_hold"])
        self.assertNotIn("start_approved",result)

if __name__=="__main__":unittest.main()
