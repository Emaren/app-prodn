"""Adversarial exact V22 SOURCE_INSTALL root-admission policy — synthetic only."""
from __future__ import annotations

import copy
import datetime as dt
import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/"scripts/release/r25_v22_root_install_admission_REVIEW_ONLY.py"
spec=importlib.util.spec_from_file_location("b_v22_root_admit", PATH)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
NOW=dt.datetime(2026,11,11,21,0,tzinfo=dt.timezone.utc)
def iso(t):return t.isoformat().replace("+00:00","Z")

def fixture():
    packet={
      "schema":"aoe2war.b.v22.three-source-central-install-request.v1",
      "reviewed_source_head_sha256":"1"*40,
      "root_modules_sha256":{
        "r25_b_v22_linux_host_adapter_REVIEW_ONLY.py":"e"*64,
        "r25_b_v22_source_install_coordinator_REVIEW_ONLY.py":"a"*64,
        "r25_v22_root_install_admission_REVIEW_ONLY.py":"b"*64,
        "r25_b_v22_central_signature_REVIEW_ONLY.py":"f"*64,
        "r25_v22_three_source_transaction_REVIEW_ONLY.py":"c"*64,
      },
      "central_comment_id":6809999999,
      "central_signer_public_sha256":"9"*64,
      "operation":"SOURCE_INSTALL_ONLY_NO_PUBLIC_ACTIVATION",
      "request_state":"UNADMITTED_REQUIRE_INDEPENDENT_CENTRAL",
      "source_ref_sha256":m.BASE_HEAD,
      "stage0003_sha256":m.STAGE_EVENT_SHA,
      "v20_source_sha256":m.V20_SHA,
      "original_3032_unit_sha256":m.WEB_ORIGINAL_UNIT_SHA,
      "service_unit_sha256":m.V22_STEAM_SERVICE_UNIT_SHA,
      "timer_unit_sha256":m.V22_TIMER_UNIT_SHA,
      "lock_dropin_sha256":m.V22_LOCK_DROPIN_SHA,
      "source_install_fence_sha256":m.FENCE_SHA,
      "source_install_fence_path":m.FENCE,
      "source_install_sentinel_path":m.SENTINEL,
      "old_new_sha256":{k:list(pair) for k,pair in m.PINNED.items()},
      "executor_sha256":"e"*64,
      "boot_id":m.BOOT_REVIEW, "host":m.HOST_REVIEW,
      "original_seven_pids":copy.deepcopy(m.PID_BASE),
      "financial_authorized":False, "public_cutover_authorized":False,
      "steam_auth_contract_change_authorized":False, "add_runtime_authorized":False,
      "nonce":"a"*32,
      "issued_at":iso(NOW-dt.timedelta(minutes=2)),
      "expires_at":iso(NOW+dt.timedelta(minutes=10)),
      "owner_receipt_sha256":"b"*64,
    }
    approval={
      "decision":"CENTRAL_SOURCE_INSTALL_ONLY_APPROVED",
      "packet_sha256":"c"*64,
      "nonce_sha256":m.digest(packet["nonce"].encode()),
      "executor_sha256":packet["executor_sha256"],
      "reviewed_source_head_sha256":packet["reviewed_source_head_sha256"],
      "root_modules_sha256":packet["root_modules_sha256"],
      "central_signer_public_sha256":packet["central_signer_public_sha256"],
      "owner_receipt_sha256":packet["owner_receipt_sha256"],
      "stage0003_sha256":m.STAGE_EVENT_SHA,
      "boot_id":m.BOOT_REVIEW,
      "fence_sha256":m.FENCE_SHA,
      "no_public_activation":True, "no_financial_authority":True,
    }
    comment={
        "id":6809999999,
        "url":"https://api.github.com/repos/Emaren/app-prodn/issues/comments/6809999999",
        "issue_url":m.CENTRAL_ISSUE,
        "user":{"login":"Emaren"},
        "created_at":iso(NOW-dt.timedelta(minutes=1)),
        "updated_at":iso(NOW-dt.timedelta(minutes=1)),
        "body":m.CENTRAL_PREFIX+m.canonical(approval).decode(),
    }
    return packet,comment

def admit(packet,comment,**kwargs):
    params={"now":NOW,"root_bytes_sha":"e"*64,"actual_boot":m.BOOT_REVIEW,
      "actual_host":m.HOST_REVIEW,"central_comment":comment,
      "packet_sha":"c"*64,"owner_receipt_sha":"b"*64,
      "actual_module_shas":packet["root_modules_sha256"],
      "actual_signer_key_sha":"9"*64,
      "signed_central_proof":{
        "status":"PASS_CENTRAL_OFFLINE_SIGNED_SOURCE_INSTALL_MESSAGE",
        "public_key_sha256":"9"*64,
        "signed_message_sha256":m.digest(comment["body"].encode()),
        "github_comment_exact":True,
      }}
    params.update(kwargs)
    return m.validate_packet(packet,**params)

class BRootSourceReview(unittest.TestCase):
    def test_review_cli_inert(self):
        p=subprocess.run([sys.executable,"-B",str(PATH)],capture_output=True,text=True)
        self.assertEqual(p.returncode,3)
        self.assertIn("REVIEW_ONLY",p.stdout)
    def test_exact_synthetic_positive_requires_independent_fetch_in_real_adapter(self):
        p,c=fixture()
        self.assertEqual(admit(p,c)["status"],"PASS_EXACT_CENTRAL_SOURCE_INSTALL_POLICY_ONLY")
    def test_public_activation_explicitly_denied(self):
        p,c=fixture()
        p["public_cutover_authorized"]=True
        with self.assertRaisesRegex(m.Hold,"SCOPE_WIDENING"): admit(p,c)
    def test_finance_authority_denied(self):
        p,c=fixture()
        p["financial_authorized"]=True
        with self.assertRaisesRegex(m.Hold,"SCOPE_WIDENING"): admit(p,c)
    def test_auth_contract_mutation_denied(self):
        p,c=fixture()
        p["steam_auth_contract_change_authorized"]=True
        with self.assertRaisesRegex(m.Hold,"SCOPE_WIDENING"): admit(p,c)
    def test_unapproved_extra_runtime_denied(self):
        p,c=fixture()
        p["add_runtime_authorized"]=True
        with self.assertRaisesRegex(m.Hold,"SCOPE_WIDENING"): admit(p,c)
    def test_replay_denied(self):
        p,c=fixture()
        with self.assertRaisesRegex(m.Hold,"NONCE_REPLAY"): admit(p,c,consumed=True)
    def test_expiry_denied(self):
        p,c=fixture()
        with self.assertRaisesRegex(m.Hold,"PACKET_EXPIRED"):admit(p,c,now=NOW+dt.timedelta(hours=3))
    def test_window_too_broad_denied(self):
        p,c=fixture()
        p["expires_at"]=iso(NOW+dt.timedelta(hours=2))
        with self.assertRaisesRegex(m.Hold,"PACKET_EXPIRED"):admit(p,c)
    def test_wrong_boot_denied(self):
        p,c=fixture()
        with self.assertRaisesRegex(m.Hold,"BOOT_OR_HOST"):admit(p,c,actual_boot="d"*36)
    def test_wrong_immutable_installed_executor_denied(self):
        p,c=fixture()
        with self.assertRaisesRegex(m.Hold,"REVIEWED_EXECUTOR"):admit(p,c,root_bytes_sha="0"*64)
    def test_wrong_staged_event_denied(self):
        p,c=fixture()
        p["stage0003_sha256"]="0"*64
        with self.assertRaisesRegex(m.Hold,"SOURCE_OR_STAGE"):admit(p,c)
    def test_v20_source_change_denied(self):
        p,c=fixture()
        p["v20_source_sha256"]="0"*64
        with self.assertRaisesRegex(m.Hold,"SOURCE_OR_STAGE"):admit(p,c)
    def test_new_controller_sha_change_denied(self):
        p,c=fixture()
        p["old_new_sha256"]["controller"][1]="0"*64
        with self.assertRaisesRegex(m.Hold,"EXACT_THREE"):admit(p,c)
    def test_no_fence_or_wrong_fence_denied(self):
        p,c=fixture()
        p["source_install_fence_sha256"]="0"*64
        with self.assertRaisesRegex(m.Hold,"FENCE_OR_TIMER"):admit(p,c)
    def test_wrong_owner_receipt_denied(self):
        p,c=fixture()
        with self.assertRaisesRegex(m.Hold,"OWNER_RECEIPT"):admit(p,c,owner_receipt_sha="0"*64)
    def test_untrusted_central_comment_author_denied(self):
        p,c=fixture()
        c["user"]["login"]="session-b"
        with self.assertRaisesRegex(m.Hold,"CENTRAL_COMMENT_PROVENANCE"):admit(p,c)
    def test_central_comment_wrong_issue_denied(self):
        p,c=fixture()
        c["issue_url"]=c["issue_url"].replace("/1280","/1316")
        with self.assertRaisesRegex(m.Hold,"CENTRAL_COMMENT_PROVENANCE"):admit(p,c)
    def test_central_comment_edited_denied(self):
        p,c=fixture()
        c["updated_at"]=iso(NOW)
        with self.assertRaisesRegex(m.Hold,"CENTRAL_COMMENT_TIME"):admit(p,c)
    def test_central_comment_before_packet_denied(self):
        p,c=fixture()
        c["created_at"]=c["updated_at"]=iso(NOW-dt.timedelta(minutes=9))
        with self.assertRaisesRegex(m.Hold,"CENTRAL_COMMENT_TIME"):admit(p,c)
    def test_central_body_partial_claim_denied(self):
        p,c=fixture()
        c["body"]="Central approved"
        with self.assertRaisesRegex(m.Hold,"CENTRAL_APPROVAL_EXACT"):admit(p,c)
    def test_comment_old_nonce_denied(self):
        p,c=fixture()
        p["nonce"]="f"*32
        with self.assertRaisesRegex(m.Hold,"CENTRAL_APPROVAL_EXACT"):admit(p,c)
    def test_seven_pid_pin_mismatch_denied(self):
        p,c=fixture()
        p["original_seven_pids"]["nginx.service"]=1
        with self.assertRaisesRegex(m.Hold,"SEVEN_PID"):admit(p,c)
    def test_sequence_contains_durable_boot_fence_before_swap(self):
        events=m.source_install_sequence()
        self.assertLess(events.index("ROOT_INSTALL_EXACT_SYSTEMD_CONDITION_DROPIN_THEN_DAEMON_RELOAD"),
                        events.index("ROOT_PERSIST_OLD_BYTES_AND_INVERSE_AND_PREPARED_RECEIPT"))
        self.assertLess(events.index("ROOT_CREATE_DURABLE_SOURCE_INSTALL_SENTINEL_BEFORE_FIRST_SWAP"),
                        events.index("ROOT_ATOMIC_THREE_SOURCE_SWAP_WITH_DURABLE_EVENT_AFTER_EACH"))

if __name__=="__main__":unittest.main()
