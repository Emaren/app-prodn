"""R10 adversarial original-FD200 issuance contracts; no HEL1 or finance."""
from __future__ import annotations
import ast
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
import aoe2_solo_website_command_channel as channel
import aoe2_solo_website_engine_v1 as engine
import aoe2_solo_website_root_phase as root
from aoe2_solo_website_nonce_ledger import Journal

class OriginalFd200Issue(unittest.TestCase):
    def test_hel1_remote_code_compiles_and_issue_verb_is_narrowly_bounded(self):
        ast.parse(channel.REMOTE)
        self.assertIn("if verb=='issue':",channel.REMOTE)
        self.assertIn("len(parts) not in (5,8)",channel.REMOTE)
        self.assertIn("native issue requires unused original FD200 channel",channel.REMOTE)
        self.assertIn("activation issue not bound to prior stage",channel.REMOTE)
        self.assertNotIn("['/bin/bash','-lc',source]",channel.REMOTE)

    def test_root_issue_refuses_missing_original_fd200_before_native_audit(self):
        with patch.object(root,"Journal") as mocked,patch.object(
                root,"native",return_value={"mounted":True,
                    "free_bytes":40*2**30,"effective_used_pct":85,
                    "finish_used_pct":86,"source_sha":root.TRAINS["W1"][1],
                    "build_id":"old-build","web_service":"active"}),patch(
                "aoe2_solo_website_native_audit_adapter.audit") as audit:
            mocked.return_value.inherited_lease_fd.side_effect=root.Hold(
                "original FD200 absent")
            with self.assertRaisesRegex(root.Hold,"original FD200 absent"):
                root.issue(["PRE_STAGE",root.TRAINS["W1"][0]])
            audit.assert_not_called()

    def test_journal_issue_uses_inherited_fd200_and_no_nested_exclusive(self):
        with tempfile.TemporaryDirectory() as tmp:
            base=pathlib.Path(tmp)
            state=base/"state"
            state.mkdir(mode=0o700)
            lock=base/"release.lock"
            lock.touch(mode=0o600)
            journal=Journal(state,lock,test_mode=True)
            with patch.object(journal,"inherited_lease_fd") as inherited,patch.object(
                    journal,"exclusive",side_effect=AssertionError(
                        "nested independent flock prohibited")):
                challenge=journal.issue("PRE_STAGE","b"*40,
                                        under_original_lease=True)
                inherited.assert_called_once()
                self.assertEqual(challenge["phase"],"PRE_STAGE")
            self.assertTrue((state/(challenge["attempt_id"]+
                                    "-PRE_STAGE-issue.json")).is_file())

    def test_owner_m1_issuer_uses_original_command_channel_not_direct_ssh(self):
        runner=MagicMock()
        runner.run.return_value=subprocess.CompletedProcess(
            ["protected"],0,stdout='{"status":"ROOT_ISSUED_NOT_AUTHORIZED","challenge":{}}',
            stderr="")
        class Guard:
            def __enter__(self):return runner
            def __exit__(self,*exc):return False
        with patch.object(channel,"command_lease",return_value=Guard()) as lease:
            result=engine.root_issue("PRE_STAGE",engine.W1,None,None,None)
        self.assertEqual(result["status"],"ROOT_ISSUED_NOT_AUTHORIZED")
        lease.assert_called_once()
        self.assertIn(" issue PRE_STAGE "+engine.W1,runner.run.call_args.args[0])

    def test_issue_command_cannot_fabricate_activation_attempt(self):
        runner=MagicMock()
        class Never:
            def __enter__(self):return runner
            def __exit__(self,*exc):return False
        with patch.object(channel,"command_lease",return_value=Never()):
            with self.assertRaises(engine.Hold):
                engine.root_issue("PRE_ACTIVATE",engine.W1,None,"a"*64,"b"*64)
        runner.run.assert_not_called()

if __name__=="__main__":
    unittest.main()
