"""Source-only C01 V21 proposal; synthetic witnesses are never host admission."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "scripts/release/r25_steam_c01_next_admission_v1.py"
SPEC = importlib.util.spec_from_file_location("steam_c01_v21_proposal", SOURCE)
p = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(p)


def inert_unit(pin):
    return dict(pin, active_state="inactive", main_pid=0, start_ticks=None,
                result="success", need_daemon_reload="no", funded_actions=0,
                signer_permission=False,
                manual_activation_condition="CODEX_ONE_USE_INERT_CONDITION")


def fixture(unit="wolo-reviewer-c01.service"):
    before = {
        "source": p.R25_SOURCE_SHA,
        "steam": {"source_sha256": p.V20_STEAM_SOURCE_SHA256,
                  "unit_sha256": p.V20_STEAM_UNIT_SHA256,
                  "c01_inert_snapshot_sha256": p.V20_C01_INERT_SNAPSHOT_SHA256},
        "web": {"3032_source_sha": p.R25_SOURCE_SHA, "3032_pid": 701398,
                "3030_pid": 2625090},
        "ports": {port: [] for port in p.PROTECTED_PORTS},
        "rollback": "PRESERVED_CANDIDATE_TO_ORIGINAL_TO_CANDIDATE",
        "nft": "PROTECTED_PINNED_STEAM_V20_LEASE",
        "units": {name: inert_unit(pin) for name, pin in p.UNIT_PINS.items()},
        "funded_operations": 0, "ledger_mutations": 0,
    }
    after = copy.deepcopy(before)
    after["units"][unit].update(active_state="active", main_pid=123456,
                                start_ticks=9123456)
    review = {
        "transition_unit": unit,
        "pre_state_sha256": p.digest(before),
        "post_state_sha256": p.digest(after),
        "approval_id": "C01-V21-SOURCEONLY001",
        "owner_approval_receipt_sha256": "a" * 64,
        "codex_zero_funds_receipt_sha256": "b" * 64,
        "previous_one_use_receipt_consumed": False,
        "observed_v20_policy_action": "HOLD_UNTIL_SEPARATE_V21_ADMISSION",
    }
    return before, after, review


class SourceOnlyV21(unittest.TestCase):
    def assess(self, change=None, unit="wolo-reviewer-c01.service"):
        b, a, r = fixture(unit)
        if change:
            change(b, a, r)
        return p.candidate_transition(b, a, r)

    def denies(self, fn, label=None):
        with self.assertRaisesRegex(p.AdmissionHold, "HOLD:V21_C01_PROPOSAL_" + (label or "")):
            self.assess(fn)

    def test_approved_proposed_reviewer_start_stages_only(self):
        result = self.assess()
        self.assertEqual(result["status"], "STAGED_FOR_CODEX_AND_CENTRAL_REVIEW_ONLY")
        self.assertFalse(result["deployment_authorized"])
        self.assertFalse(result["funded_operations_authorized"])
        self.assertTrue(result["v20_must_still_hold"])
        self.assertEqual(result["unit"], "wolo-reviewer-c01.service")
        self.assertEqual(len(result["required_physical_checks"]), 8)

    def test_approved_proposed_satchel_start_stages_only(self):
        self.assertEqual(self.assess(unit="wolo-satchel-c01.service")["unit"],
                         "wolo-satchel-c01.service")

    def test_two_starts_in_one_admission_rejected(self):
        self.denies(lambda b, a, r: a["units"]["wolo-satchel-c01.service"].update(
            active_state="active", main_pid=234, start_ticks=678),
            "ONLY_ONE_SERVICE")

    def test_previously_active_service_rejected_even_with_matching_digest(self):
        def changed(b, a, r):
            b["units"][r["transition_unit"]]["active_state"] = "active"
            b["units"][r["transition_unit"]]["main_pid"] = 123
            b["units"][r["transition_unit"]]["start_ticks"] = 999
            r["pre_state_sha256"] = p.digest(b)
        self.denies(changed, "SERVICE_ALREADY_STARTED")

    def test_replay_marked_consumed_rejected(self):
        self.denies(lambda b, a, r: r.update(previous_one_use_receipt_consumed=True),
                    "ONE_USE_REPLAY")

    def test_missing_or_forged_witness_digest_rejected(self):
        self.denies(lambda b, a, r: r.update(post_state_sha256="d"*64),
                    "SNAPSHOT_BINDING")

    def test_missing_independent_receipt_rejected(self):
        self.denies(lambda b, a, r: r.update(codex_zero_funds_receipt_sha256="a"*64),
                    "INDEPENDENT_RECEIPTS")

    def test_wrong_transition_unit_rejected(self):
        self.denies(lambda b, a, r: r.update(transition_unit="wolo-satchel-c01.service"),
                    "REVIEW_UNIT")

    def test_v20_must_hold_transition_until_v21_admitted(self):
        self.denies(lambda b, a, r: r.update(observed_v20_policy_action="ACCEPTED"),
                    "V20_PROTECTION_BYPASS")

    def test_money_and_ledger_change_rejected(self):
        for field in ("funded_operations", "ledger_mutations"):
            for which in ("before", "after"):
                with self.subTest(field=field, which=which):
                    self.denies(lambda b,a,r,f=field,w=which: (b if w=="before" else a).__setitem__(f,1),
                                "FUNDS_CHANGED")

    def test_finance_port_8094_unauthorized_start_rejected(self):
        self.denies(lambda b,a,r: a["ports"]["8094"].append("0.0.0.0:8094"),
                    "DRIFT_PORTS")

    def test_roll_back_and_steam_pin_change_rejected(self):
        self.denies(lambda b,a,r: a.update(rollback="DISABLED"), "DRIFT_ROLLBACK")
        self.denies(lambda b,a,r: a["steam"].update(source_sha256="a"*64),
                    "STEAM_V20_PINS")

    def test_source_and_web_pid_changes_rejected(self):
        self.denies(lambda b,a,r: a.update(source="other"), "R25_SOURCE")
        self.denies(lambda b,a,r: a["web"].update({"3032_pid": 9913}), "DRIFT_WEB")

    def test_unit_user_config_binary_exec_and_permission_drift_rejected(self):
        for key, value in [
            ("user","root"), ("working_directory","/"), ("binary_sha256","1"*64),
            ("effective_exec_sha256","2"*64), ("unit_config_sha256","3"*64),
            ("signer_permission",True), ("funded_actions",1),
            ("manual_activation_condition","BYPASSED")
        ]:
            with self.subTest(key=key):
                self.denies(lambda b,a,r,k=key,v=value: a["units"][r["transition_unit"]].update({k:v}),
                            "POST_UNIT_PIN_OR_PROTECTION_CHANGED")

    def test_zero_or_inconsistent_pid_and_start_tick_rejected(self):
        for key, value in [("main_pid",0),("main_pid",True),("start_ticks",0),("start_ticks",False)]:
            with self.subTest(key=key,value=value):
                self.denies(lambda b,a,r,k=key,v=value: a["units"][r["transition_unit"]].update({k:v}),
                            "NOT_BOUNDED_ZERO_FUNDS_START")

    def test_additional_unit_and_metadata_rejected(self):
        self.denies(lambda b,a,r: a["units"].update({"wolo-third.service": {}}),
                    "EXACT_TWO_UNITS")
        self.denies(lambda b,a,r: r.update({"auto_permit":True}), "REVIEW_METADATA")

    def test_inert_noop_is_not_a_start(self):
        self.denies(lambda b,a,r: a["units"].update(
            {r["transition_unit"]: copy.deepcopy(b["units"][r["transition_unit"]])}),
            "ONLY_ONE_SERVICE")

    def test_determinism_and_no_live_process_access(self):
        first = self.assess()
        second = self.assess()
        self.assertEqual(json.dumps(first, sort_keys=True), json.dumps(second, sort_keys=True))
        src=SOURCE.read_text()
        for forbidden in ("subprocess", "os.system", "socket.", "requests.", "httpx.",
                          "systemctl", "daemon-reload", "nft add", "GRANT ", "ALTER ROLE",
                          "private_key", "wallet_secret"):
            self.assertNotIn(forbidden, src)


if __name__ == "__main__":
    unittest.main()
