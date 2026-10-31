"""R24 D website-only policy negative tests; fixtures are synthetic, not HEL1 proof."""
import copy
import importlib.util
from pathlib import Path
from unittest import TestCase, mock

P=Path(__file__).resolve().parents[1]/"scripts"/"aoe2_r24_d_website_only_policy.py"
spec=importlib.util.spec_from_file_location("r24_d_web_policy", P)
p=importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
H="a"*64
REVIEW={"B_FINANCE_REVIEW_SHA":"b"*40,"C_ROOT_OPERATOR_SHA":"c"*40,
        "E_CAPACITY_REVIEW_SHA":"d"*40,"F_REVIEW_AUTHORITY_SHA":"e"*40}


def facts():
    finance={"origin":"C_AUTHENTICATED_HEL1_ROOT","root_observation_sha256":H,
             "unit_identities":{"unit"+str(i):H for i in range(25)},
             "process_identities":{"unit"+str(i):H for i in range(25)},
             "financial_state_sha256":H,"cron_db_ingress_sha256":H,
             "unresolved_root_processes":[],"unresolved_writers":[],
             "listeners":{str(port):{"pid":port,"start_ticks":400,
                           "socket_inode":port+1000,
                           "executable_sha256":H} for port in (8092,8093)}}
    rb={"source_sha":"9"*40,"build_id":"old-build",
        "artifact_sha256":"2"*64,"entrypoint_sha256":H,
        "durable":True,"readback_verified":True}
    capacity={"mount_device":2064,"free_bytes":22*2**30,
              "new_build_peak_bytes":2*2**30,"rollback_bytes":2*2**30,
              "required_remaining_bytes":5*2**30,"native_measurement_sha256":H}
    before={"origin":"C_AUTHENTICATED_HEL1_ROOT","host":p.HOST,"euid":0,
            "release_lock":list(p.OLD_LOCK),"old_owner_spki":p.OLD_OWNER_RSA_SPKI,
            "old_owner_trust_unchanged":True,"source_sha":"9"*40,
            "build_id":"old-build","web_unit":p.WEB,"web_pid":1234,
            "web_start_ticks":200,"web_artifact_sha256":"1"*64,
            "rollback":rb,"capacity":capacity,"finance":finance}
    isolation={"candidate_sha":p.SITE,"status":"B_INDEPENDENT_FINANCE_ISOLATED_REVIEW",
               "b_review_sha256":H,"http_method_graph_sha256":H,
               "startup_graph_sha256":H,"web_db_acl_sha256":H,
               "systemd_boundary_sha256":H,"finance_write_routes":[],
               "startup_finance_writers":[],"web_financial_credentials":[],
               "unresolved_edges":[],"proposed_financial_restarts":[]}
    plan={"schema":1,"policy":p.POLICY,"candidate_sha":p.SITE,
          "controller_source_sha":p.OLD_CONTROLLER,"prior_sha":"9"*40,
          "prior_build_id":"old-build","target_build_id":"new-build",
          "target_artifact_sha256":"3"*64,
          "rollback_artifact_sha256":"2"*64,"attempt_id":H,
          "web_unit":p.WEB,"isolation":isolation,
          "allowed":["isolated_build","isolated_stage","web_only_switch",
                     "read_only_health","web_only_rollback"],
          "forbidden":["money","database_migration","financial_unit_restart",
                       "wolo_restart","source_reset","snapshot_delete",
                       "legacy_release_lock_bypass","old_owner_key_replacement"]}
    after=copy.deepcopy(before)
    after.update({"source_sha":p.SITE,"build_id":"new-build","web_pid":4321,
                  "web_start_ticks":300,"web_artifact_sha256":"3"*64})
    return plan,before,after


class R24DPolicyTests(TestCase):
    def test_01_no_production_approval_seals(self):
        plan,before,_=facts()
        with self.assertRaisesRegex(p.Hold,"SOURCE_SEALS_ABSENT"):
            p.before_gate(plan,before)

    def test_02_synthetic_success_is_not_owner_or_public_verification(self):
        plan,before,after=facts()
        with mock.patch.multiple(p,**REVIEW):
            x=p.before_gate(plan,before)
            y=p.after_gate(plan,before,after)
        self.assertFalse(x["signed_six_origins_claimed"])
        self.assertFalse(y["financial_operation_authorized"])
        self.assertIn("NOT_OWNER_AUTHORIZED",x["status"])
        self.assertIn("NOT_PUBLIC_LIVE_VERIFIED",y["status"])

    def test_03_six_legacy_signers_not_fabricated(self):
        plan,before,_=facts()
        plan["signed_six_origins"]=[True]*6
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"WEB_ONLY_PLAN_SHAPE"):
                p.before_gate(plan,before)

    def test_04_owner_consent_is_plan_specific_not_auth(self):
        plan,_,_=facts()
        phrase=p.owner_phrase(plan)
        self.assertFalse(p.match_consent_text(plan,phrase)["release_authorized"])
        with self.assertRaisesRegex(p.Hold,"CONSENT_ABSENT"):
            p.match_consent_text(plan,phrase+" YES")
        plan["target_build_id"]="different-build"
        with self.assertRaisesRegex(p.Hold,"CONSENT_ABSENT"):
            p.match_consent_text(plan,phrase)

    def test_05_changed_wolo_pid_denied(self):
        plan,before,after=facts()
        after["finance"]["listeners"]["8092"]["pid"]+=1
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"FINANCIAL_PROCESS_OR_WOLO_DRIFT"):
                p.after_gate(plan,before,after)

    def test_06_missing_8093_socket_provenance_denied(self):
        plan,before,_=facts()
        before["finance"]["listeners"]["8093"]["socket_inode"]=None
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"WOLO_SOCKET_PID_NOT_PROVEN"):
                p.before_gate(plan,before)

    def test_07_unsigned_B_baseline_is_not_root_finance(self):
        plan,before,_=facts()
        before["finance"]["origin"]="UNSIGNED_OPERATOR_OBSERVATION"
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"FINANCE_REQUIRES_AUTHENTICATED_ROOT"):
                p.before_gate(plan,before)

    def test_08_missing_root_processes_denied(self):
        plan,before,_=facts()
        before["finance"]["unresolved_root_processes"]=["api"]
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"UNRESOLVED_FINANCIAL_ORIGINS"):
                p.before_gate(plan,before)

    def test_09_finance_http_path_denied(self):
        plan,before,_=facts()
        plan["isolation"]["finance_write_routes"]=["POST /api/bets"]
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"FINANCIAL_ISOLATION_UNPROVEN"):
                p.before_gate(plan,before)

    def test_10_startup_finance_writer_denied(self):
        plan,before,_=facts()
        plan["isolation"]["startup_finance_writers"]=["settlement"]
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"FINANCIAL_ISOLATION_UNPROVEN"):
                p.before_gate(plan,before)

    def test_11_web_finance_db_role_denied(self):
        plan,before,_=facts()
        plan["isolation"]["web_financial_credentials"]=["superuser"]
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"FINANCIAL_ISOLATION_UNPROVEN"):
                p.before_gate(plan,before)

    def test_12_extra_wolo_restart_denied(self):
        plan,before,_=facts()
        plan["allowed"].append("restart_wolo")
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"UNREVIEWED_OPERATION_SCOPE"):
                p.before_gate(plan,before)

    def test_13_rollback_missing_denied(self):
        plan,before,_=facts()
        before["rollback"]["readback_verified"]=False
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"ROLLBACK_NOT_USABLE"):
                p.before_gate(plan,before)

    def test_14_enough_space_measured_or_hold(self):
        plan,before,_=facts()
        before["capacity"]["free_bytes"]=1
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"CAPACITY_HOLD"):
                p.before_gate(plan,before)

    def test_15_original_lock_cannot_be_replaced(self):
        plan,before,after=facts()
        after["release_lock"][1]+=1
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"ROOT_LOCK_OR_RSA_TRUST_DRIFT"):
                p.after_gate(plan,before,after)

    def test_16_financial_balance_digest_immutable(self):
        plan,before,after=facts()
        after["finance"]["financial_state_sha256"]="f"*64
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"FINANCIAL_PROCESS_OR_WOLO_DRIFT"):
                p.after_gate(plan,before,after)

    def test_17_target_exact_sha_only(self):
        plan,before,_=facts()
        plan["candidate_sha"]="0"*40
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"SOURCE_OR_BUILD_OR_ATTEMPT_IDENTITY_DRIFT"):
                p.before_gate(plan,before)

    def test_18_missing_new_build_id_denied(self):
        plan,before,after=facts()
        after["build_id"]="unknown"
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"NEW_SOURCE_BUILD_AND_WEB_PID_NOT_LIVE"):
                p.after_gate(plan,before,after)

    def test_19_rollback_cannot_change_at_cutover(self):
        plan,before,after=facts()
        after["rollback"]["entrypoint_sha256"]="b"*64
        with mock.patch.multiple(p,**REVIEW):
            with self.assertRaisesRegex(p.Hold,"ROLLBACK_DRIFT"):
                p.after_gate(plan,before,after)
