"""C->B artifact and protected one-slot two-cycle contract; source fixtures."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"scripts/release/r25_b_c_product_artifact_and_same_slot_v1.py"
spec=importlib.util.spec_from_file_location("c_b_handoff",SRC)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
SOURCE="a"*40
TREE="b"*40
ARCHIVE="c"*64
ORIGINAL="d"*64
CANDIDATE="e"*64

def receipt():
    return {
        "schema":m.C_ARTIFACT_SCHEMA, "source_repo":m.SOURCE_REPO,
        "source_commit":SOURCE,"source_tree":TREE,"build_id":"test-source-build-A",
        "archive":{"name":"runtime.tar.gz","sha256":ARCHIVE,"bytes":10240},
        "architecture":"linux-x86_64","node":"v22.22.0",
        "application_port":3032,"no_financial_source":True,
        "private_keys_embedded":False,"writes_to_financial_db":False,
        "declared_acceptance_features":sorted(m.ALLOWED_FEATURES),
    }
def runner():
    return {"uid":650,"gid":650,"kernel_financial_denial":True,
            "uid501_automation_escape_closed":True,
            "source_commit":SOURCE,"artifact_sha256":ARCHIVE,
            "attested_by_root":True}
def ci():
    return {"source_commit":SOURCE,"conclusion":"success","verified_by_B":True}
def artifact(r=None,**kwargs):
    return m.validate_c_artifact(r or receipt(),
      source_tree_lookup=kwargs.get("source_tree_lookup",TREE),
      archive_sha=kwargs.get("archive_sha",ARCHIVE),
      archive_bytes=kwargs.get("archive_bytes",10240),
      attested_runner=kwargs.get("attested_runner",runner()),
      external_ci=kwargs.get("external_ci",ci()))
def stage():
    return {"schema":m.B_STAGE_SCHEMA,
        "root_owned":True,"mode":0o400,"nlink":1,
        "no_symlink_ancestors":True,"prepared_by_B":True,
        "artifact_sha256":ARCHIVE,"source_commit":SOURCE,"source_tree":TREE,
        "manifest_sha256":"f"*64,"stage_slot":"C-ARTIFACT-1",
        "stage0003_touched":False}
def permit(nonce="1"*32):
    return {"schema":m.B_PERMIT_SCHEMA,"phase":"ACTIVATE_ONLY",
        "central_independent_approval":True,"owner_terminal_approved":True,
        "replay_consumed":False,"web_port":3032,"no_new_next_runtime":True,
        "allowed_unit":"aoe2hdbets-web-prod.service",
        "allowed_nginx_selector_change":False,
        "immutable_stage_sha256":ARCHIVE,"source_commit":SOURCE,"source_tree":TREE,
        "original_3032_unit_sha256":ORIGINAL,
        "original_3030_preserved":True,"emergency_3033_preserved":True,
        "paper_9447_preserved":True,"financial_authorized":False,
        "steam_auth_contract_change":False,"nonce":nonce,"build_id":"test-source-build-A"}
def steam():
    return {"exact_source_commit":SOURCE,"exact_build_id":"test-source-build-A",
            "source_version_signed":True,"original_rollback_profile_preserved":True}
def base_cycle(nonce="1"*32):
    return m.SameSlotCycle(nonce_sha256=m.sha(nonce.encode()),
                           source_commit=SOURCE,original_unit_sha=ORIGINAL,
                           candidate_unit_sha=CANDIDATE)
def ev(c,state):
    e={"nonce_sha256":c.nonce_sha256,"source_commit":SOURCE}
    if state=="CANDIDATE_STARTED":e["unit_sha256"]=CANDIDATE
    if state=="ORIGINAL_3032_RESTORED":e["unit_sha256"]=ORIGINAL
    if state=="ADMIN_ACCEPTED" or state=="ORDINARY_ACCEPTED":
        e.update(role="admin" if state=="ADMIN_ACCEPTED" else "ordinary",
                 session_existing=True,registered_new_user=False,
                 steam_auth_boundary_unchanged=True)
    if state=="PUBLIC_NONFINANCIAL_ACCEPTED":
        e.update(checks_passed=sorted(m.ALLOWED_FEATURES),
                 finance_api_status=503,nft_finance_ports_closed=True)
    if state=="ROLLBACK_VERIFIED":
        e.update(original_3032_sha256=ORIGINAL,
                 original_3030_unchanged=True,finance_unchanged=True)
    return e
def full_cycle(c):
    for event in m.STATES:
        c.append(event,ev(c,event))

class CtoBTests(unittest.TestCase):
    def test_source_cli_denies(self):
        x=subprocess.run([sys.executable,"-B",str(SRC)],capture_output=True,text=True)
        self.assertEqual(x.returncode,3)
    def test_exact_artifact_data_contract_passes_without_release(self):
        self.assertFalse(artifact()["deployment_authorized"])
    def test_wrong_git_tree_denied(self):
        with self.assertRaisesRegex(m.Hold,"SOURCE_TREE"):artifact(source_tree_lookup="0"*40)
    def test_wrong_archive_sha_denied(self):
        with self.assertRaisesRegex(m.Hold,"ARCHIVE"):artifact(archive_sha="0"*64)
    def test_wrong_archive_size_denied(self):
        with self.assertRaisesRegex(m.Hold,"ARCHIVE"):artifact(archive_bytes=10241)
    def test_unrestricted_uid501_runner_denied(self):
        r=runner();r["uid"]=501
        with self.assertRaisesRegex(m.Hold,"RUNNER_PHYSICAL"):artifact(attested_runner=r)
    def test_uid650_without_kernel_denial_denied(self):
        r=runner();r["kernel_financial_denial"]=False
        with self.assertRaisesRegex(m.Hold,"RUNNER_PHYSICAL"):artifact(attested_runner=r)
    def test_unclosed_uid501_automation_escape_denied(self):
        r=runner();r["uid501_automation_escape_closed"]=False
        with self.assertRaisesRegex(m.Hold,"RUNNER_PHYSICAL"):artifact(attested_runner=r)
    def test_unverified_ci_denied(self):
        x=ci();x["verified_by_B"]=False
        with self.assertRaisesRegex(m.Hold,"EXTERNAL_SOURCE_CI"):artifact(external_ci=x)
    def test_financial_mutation_capability_denied(self):
        r=receipt();r["writes_to_financial_db"]=True
        with self.assertRaisesRegex(m.Hold,"FINANCIAL_CAPABILITY"):artifact(r)
    def test_stage003_reuse_denied(self):
        x=stage();x["stage_slot"]="STAGE0003"
        with self.assertRaisesRegex(m.Hold,"IMMUTABLE_STAGE0003"):
            m.validate_root_stage(x,receipt(),independent_archive_sha=ARCHIVE,independent_manifest_sha="f"*64)
    def test_root_stage_byte_binding_passes_without_approval(self):
        self.assertFalse(m.validate_root_stage(stage(),receipt(),
            independent_archive_sha=ARCHIVE,independent_manifest_sha="f"*64)["release_authority"])
    def test_no_permit_leak_from_stage_receipt(self):
        p=permit();p["central_independent_approval"]=False
        with self.assertRaisesRegex(m.Hold,"NO_INDEPENDENT"):
            m.validate_b_permit(p,root_stage=stage(),original_unit_sha=ORIGINAL,
                                previous_nonce_sha256="0"*64,steam_compat=steam())
    def test_cannot_reuse_nonce(self):
        p=permit()
        with self.assertRaisesRegex(m.Hold,"REPLAY_OR_DUPLICATE_NONCE"):
            m.validate_b_permit(p,root_stage=stage(),original_unit_sha=ORIGINAL,
                                previous_nonce_sha256=m.sha(p["nonce"].encode()),steam_compat=steam())
    def test_unadmitted_steam_profile_denied(self):
        s=steam();s["source_version_signed"]=False
        with self.assertRaisesRegex(m.Hold,"STEAM_V22_EXACT_PROFILE_NOT_ADMITTED"):
            m.validate_b_permit(permit(),root_stage=stage(),
                                original_unit_sha=ORIGINAL,previous_nonce_sha256="0"*64,
                                steam_compat=s)
    def test_wrong_public_port_denied(self):
        p=permit();p["web_port"]=3033
        with self.assertRaisesRegex(m.Hold,"SAME_SLOT_ONLY"):
            m.validate_b_permit(p,root_stage=stage(),original_unit_sha=ORIGINAL,
                                previous_nonce_sha256="0"*64,steam_compat=steam())
    def test_honest_source_only_permit_contract(self):
        r=m.validate_b_permit(permit(),root_stage=stage(),original_unit_sha=ORIGINAL,
                               previous_nonce_sha256="0"*64,steam_compat=steam())
        self.assertFalse(r["public_release_executed"])
    def test_full_single_cycle_administration_and_inverse_receipts(self):
        c=base_cycle();full_cycle(c)
        self.assertTrue(c.can_repeat())
        self.assertEqual(len(c.events),len(m.STATES))
    def test_candidate_only_cannot_be_called_a_rollback(self):
        c=base_cycle()
        for state in m.STATES[:6]:c.append(state,ev(c,state))
        self.assertFalse(c.can_repeat())
    def test_admin_before_candidate_denied(self):
        c=base_cycle()
        c.append("SOURCE_ATTESTED",ev(c,"SOURCE_ATTESTED"))
        with self.assertRaisesRegex(m.Hold,"CYCLE_ORDER"):
            c.append("ADMIN_ACCEPTED",ev(c,"ADMIN_ACCEPTED"))
    def test_nonadmin_new_registration_denied(self):
        c=base_cycle()
        for event in m.STATES[:8]:c.append(event,ev(c,event))
        e=ev(c,"ORDINARY_ACCEPTED");e["registered_new_user"]=True
        with self.assertRaisesRegex(m.Hold,"SESSION_ROLE"):
            c.append("ORDINARY_ACCEPTED",e)
    def test_public_acceptance_without_finance_503_denied(self):
        c=base_cycle()
        for event in m.STATES[:9]:c.append(event,ev(c,event))
        e=ev(c,"PUBLIC_NONFINANCIAL_ACCEPTED");e["finance_api_status"]=200
        with self.assertRaisesRegex(m.Hold,"PUBLIC_ACCEPTANCE"):
            c.append("PUBLIC_NONFINANCIAL_ACCEPTED",e)
    def test_rollback_source_bytes_must_match_original(self):
        c=base_cycle()
        for event in m.STATES[:10]:c.append(event,ev(c,event))
        c.append("ROLLBACK_INTENT",ev(c,"ROLLBACK_INTENT"))
        e=ev(c,"ORIGINAL_3032_RESTORED");e["unit_sha256"]="0"*64
        with self.assertRaisesRegex(m.Hold,"CYCLE_UNIT_INVERSE"):
            c.append("ORIGINAL_3032_RESTORED",e)
    def test_failure_at_candidate_start_can_request_rollback(self):
        c=base_cycle()
        for event in m.STATES[:6]:c.append(event,ev(c,event))
        self.assertEqual(c.plan_fault_recovery()["status"],"HOLD_SIGNED_ROLLBACK_REQUIRED")
        for event in m.STATES[10:]:
            c.append(event,ev(c,event))
        self.assertTrue(c.can_repeat())
    def test_second_cycle_new_nonce_and_original_unit(self):
        first=base_cycle("1"*32);full_cycle(first)
        second=base_cycle("2"*32)
        self.assertEqual(m.allow_second_cycle(first,second)["status"],"PASS_SECOND_INDEPENDENT_CYCLE_PLANNED")
        with self.assertRaisesRegex(m.Hold,"NEW_ONE_USE_NONCE"):
            m.allow_second_cycle(first,base_cycle("1"*32))
    def test_no_second_cycle_before_real_rollback_receipt(self):
        with self.assertRaisesRegex(m.Hold,"FIRST_CYCLE_NOT_ROLLED_BACK"):
            m.allow_second_cycle(base_cycle(),base_cycle("2"*32))

if __name__=="__main__":unittest.main()
