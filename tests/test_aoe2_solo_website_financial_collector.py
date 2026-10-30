"""Native reader regression suite: fake systemctl only, no HEL1 or money."""
from __future__ import annotations
import os,sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import aoe2_solo_website_financial_collector as collector
from aoe2_solo_website_financial_proof import (
 REQUIRED_UNITS,REQUIRED_SERVICES,FinancialProofHold,verify_writer_census)

PROPS={key:"" for key in collector.NATIVE_PROPS}
PROPS.update(LoadState="loaded",ActiveState="inactive",SubState="dead",
             Type="oneshot",MainPID="0",Result="success")
def simulated(argv):
 if argv[1]=="list-unit-files":
  return "".join(name+" enabled\n" for name in sorted(REQUIRED_UNITS)).encode()
 if argv[1]=="cat":return ("[Unit]\nDescription="+argv[2]+"\n").encode()
 if argv[1]=="show":
  name=argv[2];p=dict(PROPS);p["Id"]=name
  if name.endswith(".timer"):
   p["Type"]="timer";p["Unit"]=name[:-6]+".service"
   p["LastTriggerUSec"]="2026-10-28 23:00:00 UTC"
   p["NextElapseUSecRealtime"]="2026-10-29 00:00:00 UTC"
  return ("".join(k+"="+p[k]+"\n" for k in collector.NATIVE_PROPS)).encode()
 raise AssertionError("unsupported fake native systemctl argv")

class NativeCollectorGuards(unittest.TestCase):
 def test_full_25_named_actual_hel1_units_discovered(self):
  with patch.object(collector,"run",side_effect=simulated):
   names,_=collector.unit_names()
  self.assertEqual(set(names),REQUIRED_UNITS)
  self.assertIn("aoe2hdbets-staking-rewards.service",names)
  self.assertIn("wolochain-founder-rewards-settlement.service",names)
  self.assertIn("wolochain-mainnet-settlement.service",names)

 def test_missing_staking_or_settlement_never_passes(self):
  for gone in ("aoe2hdbets-staking-rewards.service",
               "wolochain-mainnet-settlement.service",
               "wolochain-founder-rewards-settlement.service"):
   def fake(argv):
    data=simulated(argv)
    return data.replace((gone+" enabled\n").encode(),b"") if argv[1]=="list-unit-files" else data
   with self.subTest(gone=gone),patch.object(collector,"run",side_effect=fake):
    with self.assertRaisesRegex(FinancialProofHold,"missing required unit"):
     collector.unit_names()

 def test_idle_oneshots_and_timer_have_real_state_not_invented_pid(self):
  with patch.object(collector,"run",side_effect=simulated):
   service=collector.observe_unit("aoe2hdbets-staking-rewards.service")
   timer=collector.observe_unit("aoe2hdbets-staking-rewards.timer")
  self.assertEqual(service["main_pid"],0)
  self.assertEqual(service["start_time_ticks"],0)
  self.assertIsNone(service["executable_sha256"])
  self.assertEqual(timer["trigger_unit"],"aoe2hdbets-staking-rewards.service")
  self.assertEqual(len(timer["last_trigger_sha256"]),64)

 def test_active_persistent_settlement_requires_real_proc_identity(self):
  def fake(argv):
   result=simulated(argv)
   if argv[1]=="show":
    return result.replace(b"ActiveState=inactive",b"ActiveState=active")
  with patch.object(collector,"run",side_effect=fake):
   with self.assertRaisesRegex(FinancialProofHold,"main PID"):
    collector.observe_unit("wolochain-founder-rewards-settlement.service")

 def test_capture_is_partial_never_signed_native_certificate(self):
  with patch.object(collector,"run",side_effect=simulated),\
       patch.object(collector.os,"geteuid",return_value=0),\
       patch.object(collector.socket,"gethostname",return_value=collector.HOST),\
       patch.object(collector.sys,"platform","linux"):
   snapshot=collector.capture()
  self.assertEqual(snapshot["status"],"UNSIGNED_PARTIAL_OBSERVATION")
  self.assertIn("database_writers",snapshot["unverified_edges"])
  self.assertEqual(set(snapshot["units"]),REQUIRED_UNITS)
  with self.assertRaises(FinancialProofHold):
   verify_writer_census({"protected":{"writers":{"native_census":snapshot}}})

 def test_command_disallows_all_other_binaries(self):
  with self.assertRaises(FinancialProofHold):
   collector.run(["/bin/sh","-c","echo bad"])

if __name__=="__main__":unittest.main()
