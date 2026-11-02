"""V7: systemd injected keys filtered without relaxing financial protection."""
import base64
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,ROOT/path)
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
s=load("v7_root","scripts/r25_c_start_recovery_v7_root.py")
mac=load("v7_mac","scripts/r25_c_start_recovery_v7_mac.py")
DROP=ROOT/"deploy/r25-b-3031.systemd-env-v7.dropin.conf"
class V7(unittest.TestCase):
 def test_exact_pinned_candidate_only_three_key_filter(self):
  b=DROP.read_bytes()
  self.assertEqual(len(b),s.V7_DROPIN_SIZE)
  self.assertEqual(s.sha(b),s.V7_DROPIN_SHA)
  self.assertEqual(mac.V7_DROPIN_SHA,s.V7_DROPIN_SHA)
  self.assertEqual(mac.V7_DROPIN_SIZE,s.V7_DROPIN_SIZE)
  self.assertEqual(mac.blob(b),mac.V7_DROPIN_BLOB)
  self.assertEqual(s.approved_v7_dropin({"v7_dropin_b64":base64.b64encode(b).decode()}),b)
  for changed in [b+b"\n",b.replace(b"UnsetEnvironment=",b"Environment=",1),
                  b.replace(b"MEMORY_PRESSURE_WRITE",b"DATABASE_URL",1),
                  b.replace(b"MEMORY_PRESSURE_WATCH ",b"",1)]:
   with self.subTest(changed=changed[-60:]):
    with self.assertRaises(s.Hold):
     s.approved_v7_dropin({"v7_dropin_b64":base64.b64encode(changed).decode()})
  with self.assertRaises(s.Hold):s.approved_v7_dropin({})
 def test_live_effective_systemd_unchanged_wall_plus_exact_unset(self):
  witness=mock.Mock()
  expected=" ".join(s.V7_ENV_KEYS)
  raw=("NeedDaemonReload=no\nUnsetEnvironment="+expected+
       "\nDropInPaths=/etc/systemd/system/aoe2hdbets-web-r24.service.d/90-r25-b-isolation.conf "+
       str(s.V3_DROPIN_PATH)+" "+str(s.V7_DROPIN_PATH)+"\n").encode()
  with mock.patch.object(s,"effective_unit_v3",return_value="a"*64) as strict, mock.patch.object(s,"run",return_value=raw):
   self.assertEqual(len(s.effective_unit_v7(witness)),64)
   strict.assert_called_once_with(witness)
  for mutated in (raw.replace(b"MEMORY_PRESSURE_WRITE",b"DATABASE_URL"),
                  raw.replace(b"MEMORY_PRESSURE_WRITE",b""),
                  raw.replace(str(s.V7_DROPIN_PATH).encode(),b""),
                  raw.replace(b"NeedDaemonReload=no",b"NeedDaemonReload=yes")):
   with mock.patch.object(s,"effective_unit_v3",return_value="a"*64),mock.patch.object(s,"run",return_value=mutated):
    with self.assertRaisesRegex(s.Hold,"V7_EXACT_ENV_FILTER_NOT_LOADED"):
     s.effective_unit_v7(witness)
 def test_consumed_v1_v6_and_separate_v7_journal(self):
  self.assertEqual([x.name for x in (s.JOURNAL,s.PREV_JOURNAL,s.V5_JOURNAL,s.V4_JOURNAL,s.V3_JOURNAL,s.V2_JOURNAL,s.V1_JOURNAL)],
   ["start-3031-v7","start-3031-v6","start-3031-v5","start-3031-v4","start-3031-v3","start-3031-v2","start-3031-v1"])
  self.assertEqual(s.V6_STARTED_SHA,"103983ebaf3f3113899e54a2caa24d762c0fbda70679c164b67790b9a71b8bda")
  self.assertEqual(s.V6_STAGED_SHA,"34d140cb9cbc86814b81accc02347995399664aa6615d31fd67e847c64d02faa")
  self.assertEqual(s.V6_HOLD_SHA,"1ad48d5a0419ed9c09e37b04653192386dbd044049b1553774668b23b6709863")
  with tempfile.TemporaryDirectory() as td:
   j=Path(td)/"used";j.mkdir()
   with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",j):
    with self.assertRaisesRegex(s.Hold,"V7_ALREADY_ATTEMPTED_NO_REPLAY"):s.admit({})
   j.rmdir()
   with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",j),mock.patch.object(s,"root_file",return_value=b"forged"):
    with self.assertRaisesRegex(s.Hold,"CONSUMED_V1_TO_V6_JOURNAL_EXACT_BYTES_CHANGED"):s.admit({})
 def test_no_unreviewed_authorization_or_finance_mutation(self):
  src=(ROOT/"scripts/r25_c_start_recovery_v7_root.py").read_text()
  macsrc=(ROOT/"scripts/r25_c_start_recovery_v7_mac.py").read_text()
  self.assertIn("effective_unit_v7(witness)",src)
  self.assertIn("witness.runtime_private_run(pid)",src)
  self.assertIn('exclusive_root_source(V7_DROPIN_PATH,approved_v7_dropin(payload))',src)
  self.assertIn('"financial_authorized": False',src)
  self.assertIn('"public_cutover_authorized": False',src)
  self.assertIn('state.get("ActiveState")=="failed"',src)
  self.assertIn('v6hold.get("reason_type")=="Hold"',src)
  for t in (src,macsrc):
   self.assertIn("R25_START_V7_OWNER_NONFINANCIAL_ACCEPT",t)
   self.assertIn("RECOVER-START-R25-3031-V7",t)
   self.assertIn("1119",t)
  plan={"schema":"aoe2war.r25.c.start-plan.v7","protected_before":{}}
  sh=s.sha(s.canonical(plan))
  with mock.patch.object(s,"admit",return_value=(None,plan)),mock.patch.object(s.os,"mkdir") as mkdir:
   with self.assertRaises(s.Hold):s.start({"plan_sha256":sh,"nonce":"a"*32,"owner_consent":"v6"})
   mkdir.assert_not_called()
if __name__=="__main__":unittest.main()
