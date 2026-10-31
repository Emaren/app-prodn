"""Negative contract tests for the separate signed website-only engine."""
from __future__ import annotations
import importlib.util, pathlib, sys, tempfile, unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
S=ROOT/"scripts"
if str(S) not in sys.path:sys.path.insert(0,str(S))
import aoe2_solo_website_engine_source as source
import aoe2_solo_website_phase_authority as phase
import aoe2_solo_website_native_audit_adapter as native
import aoe2_solo_website_root_phase as root

class Guards(unittest.TestCase):
    def test_root_issued_observation_carries_mount_truth(self):
        native_data={"source_sha":root.TRAINS["W1"][1],
                     "build_id":"DQ2jMprNQ_Njq6QM8GHju",
                     "web_service":"active","mounted":True,
                     "free_bytes":38*2**30,
                     "effective_used_pct":86.0,"finish_used_pct":89.0}
        protected={"8092":{"pid":1001},"8093":{"pid":1002},
                   "writers":{}}
        report={
            "observed_at":"2026-10-30T07:00:00Z",
            "finance":{"protected":protected,"wolo_finance_p1":"HOLD",
                       "exposure":{"balances_sha256":"a"*64},
                       "native_receipt_sha256":"b"*64},
            "doctor":{"p0":0,"p1":0,"signed":True},
            "recovery":{"isolated_restored_classes":[
                "APP_DB","TRAFFIC_SQLITE_WAL","WOLO_CONSENSUS_FINANCE",
                "LOOP4_FINANCIAL","WATCHER_REPLAY_MEDIA",
                "RELEASE_ROLLBACK_CONFIG"],"status":"PHYSICALLY_ACCEPTED"},
            "stage":{"origin":"UNKNOWN","receipt":None},
            "rollback":{"preserved":True,"active_build_id":"rollback-build"},
        }
        with patch.object(root,"native",return_value=native_data):
            observed=root.native_observation_for_owner(report)
        self.assertIs(observed["mounted"],True)
        self.assertEqual(observed["source_sha"],native_data["source_sha"])
        self.assertEqual(observed["finance_fingerprint_sha256"],
                         root.digest(root.canonical(protected)))

    def test_native_issue_requires_original_fd200_same_server_lease(self):
        from aoe2_solo_website_command_channel import REMOTE
        import aoe2_solo_website_engine_v1 as engine
        import aoe2_solo_website_native_audit_adapter as adapter
        import aoe2_solo_website_forced_ssh as forced
        from unittest.mock import MagicMock
        issue=("PRE_STAGE",engine.W1_SAFE,"a"*64,None,None)
        fake=MagicMock(unsafe=True)
        fake.run.return_value=__import__("subprocess").CompletedProcess(
            ["protected"],0,'{"status":"ROOT_ISSUED_NOT_AUTHORIZED"}',"")
        fake.assert_alive.return_value=None
        class Lease:
            def __enter__(self):return fake
            def __exit__(self,*args):return False
        with patch("aoe2_solo_website_command_channel.command_lease",
                   return_value=Lease()) as command:
            result=engine.root_issue(*issue)
        self.assertEqual(result["status"],"ROOT_ISSUED_NOT_AUTHORIZED")
        self.assertTrue(command.called)
        cmd=fake.run.call_args.args[0]
        self.assertIn(" issue PRE_STAGE "+engine.W1_SAFE+" "+"a"*64,cmd)
        self.assertIn("preissue",REMOTE)
        self.assertIn("original FD200 root issuance HOLD",
                      __import__("inspect").getsource(engine.root_issue))
        self.assertIn("'issue':None",REMOTE)
        self.assertIn("issue_dispatched=True",REMOTE)
        self.assertIn("issuance-only lease",REMOTE)
        self.assertNotIn("aoe2war-solo-issue",__import__("inspect").getsource(forced.main))
        audit=__import__("inspect").getsource(adapter.audit)
        self.assertIn("pass_fds=(200,)",audit)

    def test_native_issue_root_whitelist_blocks_extra_args_or_shell(self):
        import aoe2_solo_website_command_channel as channel
        code=channel.REMOTE
        self.assertIn("stage issue needs original root-preissued attempt",code)
        self.assertIn("invalid activation issue identity",code)
        self.assertIn("unallowlisted SSH root verb",
                      (S/"aoe2_solo_website_forced_ssh.py").read_text())

    def test_root_nonce_consume_exact_argument_contract(self):
        import inspect
        from aoe2_solo_website_nonce_ledger import Journal
        sig=inspect.signature(Journal.consume_under_existing_lock)
        self.assertIn("host_sha",sig.parameters)
        source_text=(S/"aoe2_solo_website_root_phase.py").read_text()
        self.assertIn('l.consume_under_existing_lock(issued,packet_sha,',source_text)
        self.assertNotIn('expected_observation_sha256=',source_text)

    def test_root_remote_channel_never_executes_unbounded_root_shell(self):
        source_text=(S/"aoe2_solo_website_command_channel.py").read_text()
        self.assertIn("root phase helper only",source_text)
        self.assertIn("unknown protected root verb",source_text)
        self.assertIn("argv=['/usr/bin/python3',helper,verb]+parts[3:]",source_text)
        self.assertIn("if x['run_as']=='tony':",source_text)
        self.assertNotIn("else:argv=['/bin/bash','-lc',source]",source_text)

    def test_activation_rollback_root_command_never_uses_arbitrary_shell(self):
        code=(S/"aoe2_solo_website_command_channel.py").read_text()
        self.assertIn("'reconcile-rollback':5",code)
        self.assertIn("foreign activation rollback path",code)
        self.assertIn("argv=['/usr/bin/python3',helper,verb]+parts[3:]",code)
        self.assertNotIn("else:argv=['/bin/bash','-lc',source]",code)

    def test_original_fd200_rollback_must_be_same_live_activation_session(self):
        # Execute the actual predicate extracted from the protected remote
        # command loop; a new flock on the same inode has NO phase state.
        import ast
        import aoe2_solo_website_command_channel as channel
        tree=ast.parse(channel.REMOTE)
        node=next(x for x in tree.body if isinstance(x,ast.FunctionDef)
                  and x.name=="same_lease_rollback")
        env={}
        exec(compile(ast.Module(body=[node],type_ignores=[]),
                     "remote-lease-policy","exec"),env)
        allow=env["same_lease_rollback"]
        attempt="a"*64
        phase=(attempt,"PRE_ACTIVATE","b"*64)
        self.assertTrue(allow(phase,True,True,False,attempt))
        for args in (
            (None,False,False,False,attempt), # NEW SSH/FD200 lease
            (phase,False,True,False,attempt), # owner proof absent
            (phase,True,False,False,attempt), # no W1 action dispatched
            (phase,True,True,True,attempt),  # already tried reconciliation
            (phase,True,True,False,"c"*64),  # different nonce/attempt
            ((attempt,"PRE_STAGE","b"*64),True,True,False,attempt),
        ):
            with self.subTest(args=args):
                self.assertFalse(allow(*args))
        remote=channel.REMOTE
        self.assertIn("if not same_lease_rollback(",remote)
        self.assertIn("rollback_dispatched=True",remote)
        self.assertLess(remote.index("rollback_dispatched=True"),
                        remote.index("  outcome=run(x)"))
        self.assertIn("phase[1]=='PRE_ACTIVATE'",remote)

    def test_reconcile_rollback_rejects_untrusted_path_without_live_io(self):
        for path in ("/tmp/activate-fake",
                     "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/stage-fake",
                     "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/activate-fake/../secret"):
            with self.subTest(path=path), self.assertRaises(root.Hold):
                root.reconcile_activation_rollback(["a"*64,path])

    def test_reconcile_rollback_without_original_fd200_holds(self):
        dirname="/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/activate-20261030T090000Z-a123456789ab"
        with patch.object(root,"Journal") as journal:
            journal.return_value.inherited_lease_fd.side_effect=root.Hold(
                "no original inherited release lease")
            with self.assertRaises(root.Hold):
                root.reconcile_activation_rollback(["a"*64,dirname])

    def test_signed_pre_activation_audit_sealed_before_nonce_consume(self):
        code=(S/"aoe2_solo_website_root_phase.py").read_text()
        before=code.index('write_once(STATE/(a+"-PRE_ACTIVATE-native-before.json"),report)')
        consume=code.index('l.consume_under_existing_lock(issued,packet_sha,')
        self.assertLess(before,consume)
        self.assertIn("rollback_finance_status",code)
        self.assertIn("signed post-rollback finance not preserved",code)

    def test_post_rollback_staged_receipt_is_cryptographically_bound(self):
        candidate="a"*40
        receipt={"artifact_sha256":"b"*64,
                 "candidate_node_modules_sha256":"c"*64,
                 "staged_build_id":"actual-next-build",
                 "release_sha":candidate}
        stage={"status":"STAGED","origin":"HEL1_DURABLE_PROTECTED_STORE",
               "release_sha":candidate,"receipt":receipt,
               "staged_build_id":"actual-next-build",
               "receipt_sha256":"d"*64,"artifact_sha256":"b"*64,
               "node_modules_sha256":"c"*64}
        self.assertTrue(native.validate_stage_boundary(
            stage,"POST_ROLLBACK",candidate,post_stage=True))
        for changed in ({"status":"NOT_STAGED"},
                        {**stage,"artifact_sha256":"f"*64},
                        {**stage,"staged_build_id":"foreign-build"},
                        {**stage,"release_sha":"f"*40}):
            with self.subTest(changed=changed),self.assertRaises(native.Hold):
                native.validate_stage_boundary(
                    changed,"POST_ROLLBACK",candidate,post_stage=True)
        with self.assertRaises(native.Hold):
            native.validate_stage_boundary(stage,"PRE_STAGE",candidate)

    def test_activation_completion_requires_separate_signed_post_activation(self):
        import inspect
        src=inspect.getsource(root.complete_activation)
        self.assertIn('report=audit(candidate,"POST_ACTIVATE",attempt,post_stage=True)',src)
        self.assertNotIn('report=audit(candidate,"PRE_ACTIVATE",attempt)',src)
        self.assertIn('write_once(STATE/(attempt+"-POST_ACTIVATE-native-after.json"),report)',src)
        self.assertIn('post_activation_native_sha256',src)

    def test_root_post_rollback_requests_post_stage_native_boundary(self):
        import inspect
        src=inspect.getsource(root.reconcile_activation_rollback)
        self.assertIn('after=audit(issued["candidate_sha"],"POST_ROLLBACK",attempt,post_stage=True)',src)

    def test_no_candidate_environment(self):
        with patch.dict("os.environ",{},clear=True):
            with self.assertRaises(source.Hold):
                source.exact_candidate_script_dir()
    def test_root_phase_has_no_auto_signing(self):
        with self.assertRaises(root.Hold):
            root.verify_signature({
                "schema":1,"policy":root.POLICY,"payload":{},
                "signature_base64":"this-is-not-an-owner-signature!"})
    def test_no_physical_native_audit_approval(self):
        with patch.object(native,"owner_approved_installed_binary",
                          side_effect=native.Hold("owner-pinned root audit absent")):
            with self.assertRaises(native.Hold):
                native.audit(root.TRAINS["W1"][0],"PRE_STAGE","a"*64)
    def test_stage_capability_requires_original_lease(self):
        with self.assertRaises(phase.Hold):
            phase.require_phase_capability("PRE_STAGE",None,None,
                manifest={"release_sha":root.TRAINS["W1"][0]},
                manifest_sha="b"*64,gate_sha="c"*64,
                active_build_id="expected-build")
    def test_root_lease_cannot_be_faked_by_packet(self):
        from aoe2_solo_website_nonce_ledger import Journal,Hold
        with tempfile.TemporaryDirectory() as t:
            d=pathlib.Path(t)
            state=d/"state";state.mkdir(mode=0o700)
            lock=d/"release.lock";lock.touch(mode=0o600)
            ledger=Journal(state,lock,test_mode=True)
            with self.assertRaises(Hold):
                ledger.inherited_lease_fd()
    def test_bad_phase_must_not_consume(self):
        with self.assertRaises(root.Hold):
            root.consume(["not-valid-base64"])

if __name__=="__main__":
    unittest.main()
