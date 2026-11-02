"""V6 runtime exec readiness before the financial mount witness."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,ROOT/path)
 mod=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(mod)
 return mod
s=load("v6_root","scripts/r25_c_start_recovery_v6_root.py")
mac=load("v6_mac","scripts/r25_c_start_recovery_v6_mac.py")
class RecoveryV6(unittest.TestCase):
 def test_exact_historical_receipts_and_new_journal(self):
  self.assertEqual([x.name for x in (s.JOURNAL,s.PREV_JOURNAL,s.V4_JOURNAL,s.V3_JOURNAL,s.V2_JOURNAL,s.V1_JOURNAL)],
      ["start-3031-v6","start-3031-v5","start-3031-v4","start-3031-v3","start-3031-v2","start-3031-v1"])
  self.assertEqual(s.V5_STARTED_SHA,"0fa650bd705d606852a1317d1b304cd931934725d59addd8e7b3d64606784e2f")
  self.assertEqual(s.V5_STAGED_SHA,"c14c270e3f7bb527216d54f510cf38bf529c870f9df46d35ef05bc338b57a7b6")
  self.assertEqual(s.V5_HOLD_SHA,"88903bf9f2abc8a6ceaa1bd779d40c89eaa5a26a7fa080322f177e1f7ad3e887")
  with tempfile.TemporaryDirectory() as td:
   existing=Path(td)/"v6";existing.mkdir()
   with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",existing):
    with self.assertRaisesRegex(s.Hold,"V6_ALREADY_ATTEMPTED_NO_REPLAY"):s.admit({})
   existing.rmdir()
   with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",existing),mock.patch.object(s,"root_file",return_value=b"forged"):
    with self.assertRaisesRegex(s.Hold,"CONSUMED_V1_V2_V3_V4_V5_JOURNAL_EXACT_BYTES_CHANGED"):s.admit({})
 def test_type_simple_exec_is_waited_before_mount_checks(self):
  witness=mock.Mock()
  witness.systemd.return_value={"ActiveState":"active","MainPID":"993"}
  with mock.patch.object(s,"ticks",return_value=77),mock.patch.object(s.os,"readlink",side_effect=["/usr/bin/true","/usr/bin/node"]) as exe,mock.patch.object(s.time,"monotonic",return_value=10),mock.patch.object(s.time,"sleep") as pause:
   self.assertEqual(s.wait_for_node_exec(witness,993,20),77)
   self.assertEqual(exe.call_count,2)
   pause.assert_called_once_with(0.1)
  witness.systemd.return_value={"ActiveState":"inactive","MainPID":"0"}
  with mock.patch.object(s,"ticks",return_value=77):
   with self.assertRaisesRegex(s.Hold,"CANDIDATE_PID_CHANGED_BEFORE_NODE_EXEC"):
    s.wait_for_node_exec(witness,993,20)
  witness.systemd.return_value={"ActiveState":"active","MainPID":"993"}
  with mock.patch.object(s,"ticks",side_effect=[77,78]):
   with self.assertRaisesRegex(s.Hold,"CANDIDATE_PROCESS_REUSED_BEFORE_NODE_EXEC"):
    s.wait_for_node_exec(witness,993,20)
  with mock.patch.object(s,"ticks",return_value=77),mock.patch.object(s.os,"readlink",return_value="/usr/bin/true"),mock.patch.object(s.time,"monotonic",return_value=21):
   with self.assertRaisesRegex(s.Hold,"CANDIDATE_NODE_EXEC_NOT_READY"):
    s.wait_for_node_exec(witness,993,20)
 def test_scope_security_and_no_unadmitted_start(self):
  root=(ROOT/"scripts/r25_c_start_recovery_v6_root.py").read_text()
  launch=(ROOT/"scripts/r25_c_start_recovery_v6_mac.py").read_text()
  self.assertIn("wait_for_node_exec(witness, pid, deadline)",root)
  self.assertLess(root.index("wait_for_node_exec(witness, pid, deadline)",root.index("def start(payload):")),
                  root.index("witness.runtime_private_run(pid)",root.index("def start(payload):")))
  self.assertNotIn('"/usr/bin/systemctl","reset-failed"',root)
  self.assertIn('v5hold.get("reason_type")=="RuntimeError"',root)
  self.assertIn('v5hold.get("only_new_service_stop_attempted") is True',root)
  for source in (root,launch):
   self.assertIn("R25_START_V6_OWNER_NONFINANCIAL_ACCEPT",source)
   self.assertIn("RECOVER-START-R25-3031-V6",source)
   self.assertIn("1118",source)
  self.assertEqual(mac.V4_WITNESS_SHA,s.V4_WITNESS_SHA)
  plan={"schema":"aoe2war.r25.c.start-plan.v6","protected_before":{}}
  sha=s.sha(s.canonical(plan))
  nonce="a"*32
  phrase="RECOVER-START-R25-3031-V6 "+nonce+" "+sha
  with mock.patch.object(s,"admit",return_value=(None,plan)),mock.patch.object(s.os,"mkdir") as created:
   with self.assertRaises(s.Hold):
    s.start({"plan_sha256":sha,"nonce":nonce,"owner_consent":"v5"})
   created.assert_not_called()
if __name__=="__main__":unittest.main()
