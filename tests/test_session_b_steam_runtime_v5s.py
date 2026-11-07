"""Adversarial no-network tests for the R25 Steam-only restart admission.

No live host, nft, PostgreSQL, systemd, or financial service is accessed.
"""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest import mock

TARGET = Path(__file__).resolve().parents[1] / "scripts/release/r25_steam_refresh_v5s.py"
spec = importlib.util.spec_from_file_location("session_b_steam", TARGET)
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)

class FakeProc:
    uid = 990
    cmd = b"next-server"
    group = "0::/system.slice/aoe2hdbets-web-prod.service"
    def __init__(self, path):
        self.path = path
    def stat(self):
        return SimpleNamespace(st_uid=self.uid)
    def read_bytes(self):
        return self.cmd
    def read_text(self):
        return self.group

class AdmissionContract(unittest.TestCase):
    def setUp(self):
        self.proof={"pid3032": 1032308}
        self.receipt=b'{"source":"reviewed-public-commit"}'
        self.a={
          "schema":"aoe2war.app.steam-runtime-readmission.v5s",
          "old_public_pid":1032308,
          "current_public_pid":1766058,
          "start_ticks":999777,
          "source_sha":s.GIT_SHA,
          "build_version":s.RELEASE,
          "reviewed_protected_snapshot_sha256":"a"*64,
          "public_release_receipt_sha256":s.sha(self.receipt),
          "approval_scope":"STEAM_ONLY_EXISTING_UID990_NFT_SETS",
          "finance_authorized":False,
          "nonce":"b"*32,
        }
        self.state = lambda unit,key: (
            "1766058" if key=="MainPID"
            else (str(s.SOURCE_STAGE) if key=="WorkingDirectory" else "active"))
        self.patches=[
           mock.patch.object(s,"rawfile",side_effect=self.file),
           mock.patch.object(s,"state",side_effect=self.state),
           mock.patch.object(s,"proc_start_ticks",return_value=999777),
           mock.patch.object(s,"Path",side_effect=FakeProc),
        ]
        for patch in self.patches:patch.start()
        self.addCleanup(lambda:[p.stop() for p in reversed(self.patches)])
    def file(self,p,mode=None):
        if str(p)==str(s.ADMISSION):
            self.assertEqual(mode,0o400)
            return json.dumps(self.a).encode()
        if str(p)==str(s.RECEIPT):
            self.assertEqual(mode,0o600)
            return self.receipt
        raise AssertionError("unexpected file:"+str(p))
    def test_genuine_restart_with_distinct_review_is_permitted(self):
        self.assertEqual(s.bound_runtime_pid(self.proof)["current_public_pid"],1766058)
    def deny(self,k,v):
        self.a[k]=v
        with self.assertRaisesRegex(RuntimeError,"HOLD:"):
            s.bound_runtime_pid(self.proof)
    def test_stale_build_denied(self):self.deny("build_version","wrong")
    def test_stale_source_denied(self):self.deny("source_sha","e"*40)
    def test_unauthorized_finance_denied(self):self.deny("finance_authorized",True)
    def test_scope_widen_denied(self):self.deny("approval_scope","ANY_PORT")
    def test_old_pid_not_anchored_denied(self):self.deny("old_public_pid",42)
    def test_admission_receipt_mismatch_denied(self):self.deny("public_release_receipt_sha256","0"*64)
    def test_malformed_nonce_denied(self):self.deny("nonce","x")
    def test_extra_payload_fields_denied(self):self.deny("ignore_finance_drift",True)
    def test_runtime_pid_changed_denied(self):
        with mock.patch.object(s,"state",side_effect=lambda u,k:"1999" if k=="MainPID" else "active"):
            with self.assertRaisesRegex(RuntimeError,"R25_PUBLIC_RUNTIME_CHANGED"):
                s.bound_runtime_pid(self.proof)
    def test_proc_reuse_denied(self):
        with mock.patch.object(s,"proc_start_ticks",return_value=999778):
            with self.assertRaisesRegex(RuntimeError,"R25_RUNTIME_PROCESS_IDENTITY_CHANGED"):
                s.bound_runtime_pid(self.proof)
    def test_nonweb_uid_denied(self):
        FakeProc.uid=0
        try:
            with self.assertRaisesRegex(RuntimeError,"R25_RUNTIME_PROCESS_IDENTITY_CHANGED"):
                s.bound_runtime_pid(self.proof)
        finally:FakeProc.uid=990
    def test_wrong_cgroup_denied(self):
        FakeProc.group="0::/system.slice/wolo-satchel-c01.service"
        try:
            with self.assertRaisesRegex(RuntimeError,"R25_RUNTIME_PROCESS_IDENTITY_CHANGED"):
                s.bound_runtime_pid(self.proof)
        finally:FakeProc.group="0::/system.slice/aoe2hdbets-web-prod.service"
    def test_wrong_working_directory_denied(self):
        with mock.patch.object(s,"state",side_effect=lambda u,k:
                "/tmp/fake" if k=="WorkingDirectory"
                else ("1766058" if k=="MainPID" else "active")):
            with self.assertRaisesRegex(RuntimeError,"R25_RUNTIME_PROCESS_IDENTITY_CHANGED"):
                s.bound_runtime_pid(self.proof)
    def test_wrong_process_title_denied(self):
        FakeProc.cmd=b"other-server"
        try:
            with self.assertRaisesRegex(RuntimeError,"R25_RUNTIME_PROCESS_IDENTITY_CHANGED"):
                s.bound_runtime_pid(self.proof)
        finally:FakeProc.cmd=b"next-server"
    def test_protected_snapshot_drift_denied_before_any_network_mutation(self):
        class FakeM:
            def production_protected(self):return {"units":["changed-finance-service"]}
            def canonical(self,x):return json.dumps(x).encode()
            def sha(self,x):return s.sha(x)
        with mock.patch.object(s,"load_immutable_original",return_value=FakeM()),\
             mock.patch.object(s,"base_profile",return_value={}),\
             mock.patch.object(s,"bound_public_commit",return_value=(self.proof,"sha")):
            with self.assertRaisesRegex(RuntimeError,"PROTECTED_FINANCE_SNAPSHOT_CHANGED"):
                s.evidence()

class PreWriteProtectedDrift(unittest.TestCase):
    def test_protected_drift_after_dns_denies_nft_write(self):
        calls=[]
        good={"units":["before"]}
        changed={"units":["after"]}
        expected={"schema":"reviewed","nft_shape_sha256":"reviewed-shape"}
        class M:
            def production_steam_addresses(self):return ["steam"]
            def production_steam_dns_diversity(self,x):return ["127.0.0.8"]
            def production_live_steam_entries(self):
                return {"steam4":set(),"steam6":set()}
            def production_steam_union_commands(self,fresh,existing):
                return ["add element inet steam4 127.0.0.8"]
            def production_protected(self):return changed
            def run(self,*a,**k):
                calls.append("nft")
                raise AssertionError("nft must not be called on protected drift")
        def readfile(path,mode=None):
            if path==s.POLICY:return json.dumps(expected).encode()
            return (str(s.NEW_SELF)+" NoNewPrivileges=yes "
                "CapabilityBoundingSet=CAP_NET_ADMIN CAP_SETUID CAP_SETGID "
                "ProtectSystem=strict").encode()
        with mock.patch.object(s,"get_caps_or_hold"),\
             mock.patch.object(s,"rawfile",side_effect=readfile),\
             mock.patch.object(s,"evidence",return_value=(M(),good,"reviewed")),\
             mock.patch.object(s,"expected_policy",return_value=expected),\
             mock.patch.object(s,"bound_public_commit",return_value=({"pid3032":9},"sha")),\
             mock.patch.object(s,"bound_runtime_pid",return_value={"reviewed_protected_snapshot_sha256":"reviewed"}):
            with self.assertRaisesRegex(RuntimeError,"PROTECTED_FINANCE_SNAPSHOT_CHANGED_BEFORE_NFT"):
                s.refresh()
        self.assertEqual(calls,[])

class RestrictedKernelProbe(unittest.TestCase):
    def test_no_foreign_proc_cwd_readlink_is_in_trusted_source(self):
        raw=TARGET.read_text()
        self.assertNotIn('os.readlink(f"/proc/{pid}/cwd")',raw)
        self.assertIn('state("aoe2hdbets-web-prod.service","WorkingDirectory")',raw)
    def test_readonly_diagnose_is_nonzero_hold(self):
        raw=TARGET.read_text()
        self.assertIn('elif a.phase=="diagnose":diagnose();sys.exit(3)',raw)
        self.assertNotIn('except BaseException as exc:',raw)
        self.assertIn('except Exception as exc:',raw)
if __name__=="__main__":
    unittest.main(verbosity=2)
