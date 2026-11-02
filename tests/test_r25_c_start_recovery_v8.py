"""V8: exact two completed timer oneshots preserve command identity."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock
ROOT=Path(__file__).resolve().parents[1]
def load(name,relative):
 spec=importlib.util.spec_from_file_location(name,ROOT/relative)
 mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
s=load("v8_root","scripts/r25_c_start_recovery_v8_root.py")
mac=load("v8_mac","scripts/r25_c_start_recovery_v8_mac.py")
class V8(unittest.TestCase):
 def test_seven_sealed_one_use_attempts(self):
  self.assertEqual([p.name for p in (s.JOURNAL,s.PREV_JOURNAL,s.V6_JOURNAL,s.V5_JOURNAL,s.V4_JOURNAL,s.V3_JOURNAL,s.V2_JOURNAL,s.V1_JOURNAL)],
    ["start-3031-v8","start-3031-v7","start-3031-v6","start-3031-v5","start-3031-v4","start-3031-v3","start-3031-v2","start-3031-v1"])
  self.assertEqual(s.V7_STARTED_SHA,"d69655177e7c046ec452a133833aca480abbdd02727738b20f461bd850d4254f")
  self.assertEqual(s.V7_STAGED_SHA,"d60805dfac5ac628e29546438d9164695d4605e5108ef4125e9efa8b6a27e9b9")
  self.assertEqual(s.V7_HOLD_SHA,"5fc2d25827fc281b2a9623dcf838c3de96f2630dc47b3b9ba7a94f31d768bd72")
  with tempfile.TemporaryDirectory() as td:
   journal=Path(td)/"v8";journal.mkdir()
   with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",journal):
    with self.assertRaisesRegex(s.Hold,"V8_ALREADY_ATTEMPTED_NO_REPLAY"):
     s.admit({})
   journal.rmdir()
   with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",journal),mock.patch.object(s,"root_file",return_value=b"tampered"):
    with self.assertRaisesRegex(s.Hold,"CONSUMED_V1_TO_V7_JOURNAL_EXACT_BYTES_CHANGED"):
     s.admit({})
 def test_exact_two_new_timer_pairs(self):
  for svc,timer in (
   ("aoe2hdbets-staking-rewards.service","aoe2hdbets-staking-rewards.timer"),
   ("aoe2hdbets-trophy-tributes.service","aoe2hdbets-trophy-tributes.timer")
  ):
   self.assertEqual(s.MONITOR_ONESHOT_TIMERS[svc],timer)
  self.assertEqual(len(s.MONITOR_ONESHOT_TIMERS),12)
 def test_only_clock_metadata_normalized_command_and_source_sha_stable(self):
  name="aoe2hdbets-staking-rewards.service"
  timer=s.MONITOR_ONESHOT_TIMERS[name]
  props="Id={n}\nType=oneshot\nTriggeredBy={timer}\nNeedDaemonReload=no\nResult=success\nActiveState=inactive\nMainPID=0\nExecMainStartTimestampMonotonic={time}\nExecStart={{ path=/bin/true ; argv[]=/bin/true ; ignore_errors=no ; start_time={time} ; stop_time={time} ; pid={time} ; code=exited ; status=0 }}\n".format(n=name,timer=timer,time="{time}")
  def sample(time):
   def run(argv,**kwargs):
    if "show" in argv:return props.replace("{time}",str(time)).encode()
    if "cat" in argv:return b"[Service]\nType=oneshot\nExecStart=/bin/true\n"
    raise AssertionError(argv)
   with mock.patch.object(s,"run",side_effect=run):
    return s.unit_state(name)
  before=sample(123456)
  after=sample(654321)
  self.assertEqual(before["unit_config_sha256"],after["unit_config_sha256"])
  self.assertEqual(before["properties"]["ExecStart_command_sha256"],after["properties"]["ExecStart_command_sha256"])
  self.assertEqual(before,after)
  self.assertNotIn("ExecStart_sha256",before["properties"])
  def bad_run(argv,**kwargs):
   if "show" in argv:
    return props.replace("Type=oneshot","Type=simple").replace("{time}","123456").encode()
   if "cat" in argv:return b"unit"
   raise AssertionError(argv)
  with mock.patch.object(s,"run",side_effect=bad_run):
   with self.assertRaisesRegex(s.Hold,"MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"):s.unit_state(name)
 def test_existing_hardened_v7_wall_not_reinstalled(self):
  src=(ROOT/"scripts/r25_c_start_recovery_v8_root.py").read_text()
  launcher=(ROOT/"scripts/r25_c_start_recovery_v8_mac.py").read_text()
  self.assertNotIn("exclusive_root_source(V7_DROPIN_PATH,approved_v7_dropin(payload))",src)
  self.assertNotIn('run(["/usr/bin/systemctl","daemon-reload"]',src)
  self.assertIn('sha(root_file(V7_DROPIN_PATH,32768,0o644))==V7_DROPIN_SHA',src)
  self.assertIn("effective_unit_v7(witness)",src)
  self.assertIn("witness.runtime_private_run(pid)",src)
  self.assertIn('v7hold.get("reason_type")=="Hold"',src)
  for t in (src,launcher):
   self.assertIn("R25_START_V8_OWNER_NONFINANCIAL_ACCEPT",t)
   self.assertIn("RECOVER-START-R25-3031-V8",t)
   self.assertIn("1120",t)
  plan={"schema":"aoe2war.r25.c.start-plan.v8","protected_before":{}}
  digest=s.sha(s.canonical(plan))
  with mock.patch.object(s,"admit",return_value=(None,plan)),mock.patch.object(s.os,"mkdir") as created:
   with self.assertRaises(s.Hold):
    s.start({"plan_sha256":digest,"nonce":"a"*32,"owner_consent":"v7"})
   created.assert_not_called()
if __name__=="__main__":unittest.main()
