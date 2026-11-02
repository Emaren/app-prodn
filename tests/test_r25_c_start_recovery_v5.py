"""V5: consumed v1-v4 exact receipts and no redundant reset-failed."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,ROOT/path)
 obj=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(obj)
 return obj
s=load("v5_root","scripts/r25_c_start_recovery_v5_root.py")
mac=load("v5_mac","scripts/r25_c_start_recovery_v5_mac.py")
class V5OneUse(unittest.TestCase):
 def test_four_consumed_journals_and_exact_v4_hashes(self):
  self.assertEqual([p.name for p in (s.JOURNAL,s.PREV_JOURNAL,s.V3_JOURNAL,s.V2_JOURNAL,s.V1_JOURNAL)],
                   ["start-3031-v5","start-3031-v4","start-3031-v3","start-3031-v2","start-3031-v1"])
  self.assertEqual(s.V4_STARTED_SHA,"7f103a16b0e6151005b0313fe1553a9cc800e40128e3e165149f8510654d1a1d")
  self.assertEqual(s.V4_STAGED_SHA,"3fa553a2a283d01785059e2aec142df91d3b81453a79af9d0abc38c93868ba3c")
  self.assertEqual(s.V4_HOLD_SHA,"a44c5461fde1ca1c80eba79954c5b7cc50b77938abf144386820b7520f7de744")
 def test_no_blind_replay_or_reset_and_exact_status(self):
  root=(ROOT/"scripts/r25_c_start_recovery_v5_root.py").read_text()
  self.assertNotIn('"/usr/bin/systemctl","reset-failed"',root)
  self.assertNotIn('"/usr/bin/systemctl","daemon-reload"',root)
  self.assertNotIn('exclusive_root_source(V3_DROPIN_PATH, approved_v3_dropin(payload))',root)
  self.assertIn('v4hold.get("only_new_service_stop_attempted") is False',root)
  self.assertIn('v4hold.get("reason_type")=="Hold"',root)
  self.assertIn('v3hold.get("reason_type")=="NameError"',root)
  self.assertIn('run(["/usr/bin/systemctl", "start", NEW_UNIT]',root)
  self.assertIn('witness.runtime_private_run(pid)',root)
 def test_existing_and_corrupt_journal_rejected(self):
  with tempfile.TemporaryDirectory() as td:
   journal=Path(td)/"already-consumed-v5"
   journal.mkdir()
   with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",journal):
    with self.assertRaisesRegex(s.Hold,"V5_ALREADY_ATTEMPTED_NO_REPLAY"):s.admit({})
   journal.rmdir()
   with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",journal),mock.patch.object(s,"root_file",return_value=b"forged"):
    with self.assertRaisesRegex(s.Hold,"CONSUMED_V1_V2_V3_V4_JOURNAL_EXACT_BYTES_CHANGED"):s.admit({})
 def test_fresh_consent_must_precede_journal(self):
  plan={"schema":"aoe2war.r25.c.start-plan.v5","protected_before":{}}
  h=s.sha(s.canonical(plan));nonce="c"*32
  phrase="RECOVER-START-R25-3031-V5 "+nonce+" "+h
  for altered in ({"nonce":"invalid"},{"plan_sha256":"a"*64},{"owner_consent":"v4"}):
   payload={"plan_sha256":h,"nonce":nonce,"owner_consent":phrase,**altered}
   with mock.patch.object(s,"admit",return_value=(None,plan)),mock.patch.object(s.os,"mkdir") as created:
    with self.assertRaises(s.Hold):s.start(payload)
    created.assert_not_called()
 def test_pinned_protection_and_owner_source_contract(self):
  root=(ROOT/"scripts/r25_c_start_recovery_v5_root.py").read_text()
  launch=(ROOT/"scripts/r25_c_start_recovery_v5_mac.py").read_text()
  for x in (root,launch):
   self.assertIn("R25_START_V5_OWNER_NONFINANCIAL_ACCEPT",x)
   self.assertIn("RECOVER-START-R25-3031-V5",x)
   self.assertIn("1117",x)
  self.assertEqual(mac.V4_WITNESS_SHA,s.V4_WITNESS_SHA)
  self.assertIn('"financial_authorized":False',root)
  self.assertIn('"public_cutover_authorized":False',root)
if __name__=="__main__":unittest.main()
