"""Adversarial separation of C macOS UID650 development from B Linux release."""
from __future__ import annotations
import copy
import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"scripts/release/r25_b_c_dev_to_linux_release_contract_v2.py"
sp=importlib.util.spec_from_file_location("b_linux_v2",SRC)
m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
ARC=b"fake test bytes not a Next runtime: must not be deployed"
def cdev():
    return {"schema":m.C_SCHEMA,"repo":m.REPO,"commit":"a"*40,
            "tree":"b"*40,"dev_os":"darwin","dev_arch":"arm64",
            "node":"v24.4.1","artifact_class":"SOURCE_ONLY_NOT_LINUX_RUNTIME",
            "root_deploy_authority":False,"financial_deploy_authority":False,
            "lockfile_sha256":"c"*64,"source_archive_sha256":"d"*64,
            "source_archive_bytes":512}
def witness():
    return {"uid":650,"gid":650,"source_commit":"a"*40,
            "kernel_financial_denial":True,"private_recovery_denial":True,
            "uid501_automation_escape_closed":True,
            "macos_root_witness_verified_by_B":True}
def linux():
    return {"schema":m.B_SCHEMA,"repo":m.REPO,
            "source_commit":"a"*40,"source_tree":"b"*40,"lockfile_sha256":"c"*64,
            "builder":"github-actions-ubuntu-24.04","os":"linux","arch":"x86_64",
            "node":"v22.22.0","npm_ci":True,"production_build":True,
            "private_keys_embedded":False,"finance_db_credentials_present":False,
            "financial_write_capability":False,"target_3032":True,
            "run_id":42848226522,
            "runtime_archive":{"name":"runtime.tar.gz","sha256":m.sha(ARC),"bytes":len(ARC)},
            "runtime_manifest_sha256":"f"*64,
            "build_id":"source-build-test-A",
            "acceptance_features":sorted(m.RESTRICTED_FEATURES)}
def ci():return {"head_sha":"a"*40,"run_id":42848226522,
                 "event":"pull_request","conclusion":"success",
                 "verified_by_B_via_GitHub_API":True}
def builder():return {"run_id":42848226522,"os":"linux",
                       "arch":"x86_64","node":"v22.22.0",
                       "checked_by_B_independently":True}
def checkdev(c=None,w=None):
    return m.qualify_c_dev_source(c or cdev(),
        git_tree_from_b="b"*40,root_uid650_witness=w or witness())
def checklinux(c=None,l=None,w=None,ci_data=None,data=ARC):
    return m.qualify_b_linux_build(c or cdev(),l or linux(),
        independent_git_tree="b"*40,b_runner_witness=w or builder(),
        ci_exact_head=ci_data or ci(),
        independently_streamed_archive_sha=m.sha(data),
        independently_streamed_archive_bytes=len(data),
        streamed_runtime_manifest_sha="f"*64)
class V2(unittest.TestCase):
    def test_non_executable(self):
        p=subprocess.run([sys.executable,"-B",str(SRC)],capture_output=True,text=True)
        self.assertEqual(p.returncode,3)
    def test_uid650_mac_is_source_only(self):
        self.assertFalse(checkdev()["release_runtime_authorized"])
    def test_uid650_cannot_supply_linux_runtime(self):
        c=cdev();c["artifact_class"]="LINUX_RUNTIME"
        with self.assertRaisesRegex(m.Hold,"C_NO_BUILD"):checkdev(c=c)
    def test_wrong_c_tree_denied(self):
        c=cdev();c["tree"]="1"*40
        with self.assertRaisesRegex(m.Hold,"C_SOURCE_GIT_TREE"):checkdev(c=c)
    def test_c_node22_is_not_source_mac_node24(self):
        c=cdev();c["node"]="v22.22.0"
        with self.assertRaisesRegex(m.Hold,"C_MACOS"):checkdev(c=c)
    def test_c_uid501_automation_escape_denied(self):
        w=witness();w["uid501_automation_escape_closed"]=False
        with self.assertRaisesRegex(m.Hold,"C_UID650"):checkdev(w=w)
    def test_c_root_claim_without_trusted_witness_denied(self):
        w=witness();w["macos_root_witness_verified_by_B"]=False
        with self.assertRaisesRegex(m.Hold,"C_UID650"):checkdev(w=w)
    def test_linux_independent_runtime_contract_is_still_not_release_permit(self):
        r=checklinux()
        self.assertFalse(r["can_install"])
        self.assertFalse(r["can_activate_3032"])
    def test_linux_arm64_build_rejected(self):
        l=linux();l["arch"]="arm64"
        with self.assertRaisesRegex(m.Hold,"B_TRUSTED_LINUX"):checklinux(l=l)
    def test_linux_node24_rejected(self):
        l=linux();l["node"]="v24.4.1"
        with self.assertRaisesRegex(m.Hold,"B_TRUSTED_LINUX"):checklinux(l=l)
    def test_fake_runner_os_rejected(self):
        w=builder();w["os"]="darwin"
        with self.assertRaisesRegex(m.Hold,"B_UNVERIFIED_LINUX_RUNNER"):checklinux(w=w)
    def test_ci_other_commit_rejected(self):
        ci_data=ci();ci_data["head_sha"]="e"*40
        with self.assertRaisesRegex(m.Hold,"B_UNVERIFIED_EXACT_HEAD"):checklinux(ci_data=ci_data)
    def test_ci_unverified_by_B_rejected(self):
        ci_data=ci();ci_data["verified_by_B_via_GitHub_API"]=False
        with self.assertRaisesRegex(m.Hold,"B_UNVERIFIED_EXACT_HEAD"):checklinux(ci_data=ci_data)
    def test_ci_wrong_run_id_rejected(self):
        w=builder();w["run_id"]=2
        with self.assertRaisesRegex(m.Hold,"B_UNVERIFIED_LINUX_RUNNER"):checklinux(w=w)
    def test_ci_missing_build_pass_denied(self):
        l=linux();l["production_build"]=False
        with self.assertRaisesRegex(m.Hold,"B_TRUSTED_LINUX"):checklinux(l=l)
    def test_lockfile_drift_denied(self):
        l=linux();l["lockfile_sha256"]="0"*64
        with self.assertRaisesRegex(m.Hold,"B_LOCKFILE"):checklinux(l=l)
    def test_archive_bytes_mutation_denied(self):
        with self.assertRaisesRegex(m.Hold,"B_STREAMED_RUNTIME"):checklinux(data=ARC+b"bad")
    def test_archive_hash_mutation_denied(self):
        l=linux();l["runtime_archive"]["sha256"]="0"*64
        with self.assertRaisesRegex(m.Hold,"B_STREAMED_RUNTIME"):checklinux(l=l)
    def test_finance_credentials_denied(self):
        l=linux();l["finance_db_credentials_present"]=True
        with self.assertRaisesRegex(m.Hold,"B_NO_FINANCIAL"):checklinux(l=l)
    def test_stage_binds_trusted_linux_not_c_dev_claims(self):
        b=checklinux()
        s={"source_commit":"a"*40,"source_tree":"b"*40,
           "artifact_sha256":m.sha(ARC),"manifest_sha256":"f"*64,
           "build_id":"source-build-test-A","trusted_linux_build_run_id":42848226522,
           "uid":0,"mode":0o400,"nlink":1,"no_symlink_ancestors":True,
           "stage0003_untouched":True,"stage_slot":"new-b-linux-release-slot"}
        self.assertFalse(m.qualify_root_stage_b_only(s,b)["release_authority"])
        s["trusted_linux_build_run_id"]=987
        with self.assertRaisesRegex(m.Hold,"STAGE_TO_LINUX"):m.qualify_root_stage_b_only(s,b)
    def test_root_stage_rejects_stage0003(self):
        b=checklinux()
        s={"source_commit":"a"*40,"source_tree":"b"*40,
           "artifact_sha256":m.sha(ARC),"manifest_sha256":"f"*64,
           "build_id":"source-build-test-A","trusted_linux_build_run_id":42848226522,
           "uid":0,"mode":0o400,"nlink":1,"no_symlink_ancestors":True,
           "stage0003_untouched":True,"stage_slot":"STAGE0003"}
        with self.assertRaisesRegex(m.Hold,"STAGE_ROOT"):m.qualify_root_stage_b_only(s,b)
if __name__=="__main__":unittest.main()
