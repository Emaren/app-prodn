"""Attack-matrix proof for only the restored V1 C03 observer pair."""
from __future__ import annotations
import hashlib, importlib.util
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import patch

path=Path(__file__).resolve().parents[1]/"scripts/release/r25_c03_observer_oneshot_guard_v9.py"
spec=importlib.util.spec_from_file_location("v9c03",path)
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

STABLE=("{ path=/usr/bin/python3 ; argv[]=/usr/bin/python3 -B "
        "/usr/local/libexec/wolo-c03-observer/settlement_c03_observer_watchdog.py "
        "--mode once ; ignore_errors=no ; ")
COMMAND=STABLE+"start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }"
GOOD_HASH={
 b"unit":g.ORIGINAL_UNIT_SHA256,b"timer":g.ORIGINAL_TIMER_SHA256,
 b"source":g.ORIGINAL_SOURCE_SHA256,b"unitcat":g.LOADED_UNIT_CAT_SHA256,
 b"timercat":g.LOADED_TIMER_CAT_SHA256,
 STABLE.encode():g.LOADED_EXEC_COMMAND_SHA256,
}
def hash_fixture(b):
 return GOOD_HASH.get(b,hashlib.sha256(b).hexdigest())

class Fake:
 def __init__(self):
  self.files={g.UNIT_FILE:b"unit",g.TIMER_FILE:b"timer",g.SOURCE:b"source"}
  self.cats={g.UNIT:b"unitcat",g.TIMER:b"timercat"}
  self.service={"Id":g.UNIT,"Type":"oneshot","TriggeredBy":g.TIMER,
    "NeedDaemonReload":"no","Result":"success","ActiveState":"inactive",
    "MainPID":"0","ExecMainStatus":"3","User":"","WorkingDirectory":"",
    "ExecStart":COMMAND,"FragmentPath":str(g.UNIT_FILE),"DropInPaths":""}
  self.timer={"Id":g.TIMER,"Unit":g.UNIT,"NeedDaemonReload":"no",
    "ActiveState":"active","FragmentPath":str(g.TIMER_FILE),"DropInPaths":""}
  self.MONITOR_ONESHOT_TIMERS={"recognized.service":"recognized.timer"}
  self.calls=0
 def root_file(self,path,maximum,mode):
  return self.files[path]
 def run(self,args,maximum):
  unit=args[2]
  if args[1]=="cat":return self.cats[unit]
  assert args[1]=="show"
  raw=self.service if unit==g.UNIT else self.timer
  keys=args[4].split("=",1)[1].split(",")
  return ("\n".join(k+"="+raw[k] for k in keys)+"\n").encode()
 def production_protected(self):
  self.calls+=1
  assert self.MONITOR_ONESHOT_TIMERS[g.UNIT]==g.TIMER
  return {"opaqueFinanceSnapshot":"unchanged"}

class C03OriginalPairExact(TestCase):
 def run_good(self,mutate=None):
  m=Fake()
  if mutate:mutate(m)
  with patch.object(g,"sha",side_effect=hash_fixture):
   return g.guarded_snapshot(m)
 def reject(self,mutate,reason):
  with self.assertRaisesRegex(g.C03IdentityHold,reason):
   self.run_good(mutate)
 def test_repeated_legitimate_completion(self):
  for _ in range(3):
   self.assertEqual(self.run_good(),{"opaqueFinanceSnapshot":"unchanged"})
 def test_changed_service_file(self):
  self.reject(lambda m:m.files.__setitem__(g.UNIT_FILE,b"mutated"),"ORIGINAL_UNIT_SOURCE_DRIFT")
 def test_changed_timer_file(self):
  self.reject(lambda m:m.files.__setitem__(g.TIMER_FILE,b"mutated"),"ORIGINAL_TIMER_SOURCE_DRIFT")
 def test_changed_observer_source(self):
  self.reject(lambda m:m.files.__setitem__(g.SOURCE,b"mutated"),"ORIGINAL_OBSERVER_SOURCE_DRIFT")
 def test_changed_loaded_unit_config(self):
  self.reject(lambda m:m.cats.__setitem__(g.UNIT,b"mutated"),"LOADED_UNIT_OR_TIMER_CONFIG_DRIFT")
 def test_changed_loaded_timer_config(self):
  self.reject(lambda m:m.cats.__setitem__(g.TIMER,b"mutated"),"LOADED_UNIT_OR_TIMER_CONFIG_DRIFT")
 def test_changed_loaded_exec_command(self):
  self.reject(lambda m:m.service.__setitem__("ExecStart",COMMAND.replace("--mode once","--mode mutate")),"LOADED_EXEC_COMMAND_DRIFT")
 def test_renamed_timer(self):
  self.reject(lambda m:m.service.__setitem__("TriggeredBy","other.timer"),"EXECUTION_IDENTITY_DRIFT")
 def test_disabled_timer(self):
  self.reject(lambda m:m.timer.__setitem__("ActiveState","inactive"),"TIMER_IDENTITY_OR_ACTIVATION_DRIFT")
 def test_unsupported_process_activity(self):
  self.reject(lambda m:m.service.update({"ActiveState":"active","MainPID":"920"}),"TEMPORARILY_ACTIVE")
 def test_exit_status_drift(self):
  self.reject(lambda m:m.service.__setitem__("ExecMainStatus","0"),"COMPLETED_ONESHOT_RESULT_DRIFT")
 def test_unexpected_service_identity(self):
  self.reject(lambda m:m.service.__setitem__("User","aoe2hd_user"),"EXECUTION_IDENTITY_DRIFT")
 def test_daemon_reload_pending(self):
  self.reject(lambda m:m.service.__setitem__("NeedDaemonReload","yes"),"EXECUTION_IDENTITY_DRIFT")
 def test_existing_pair_duplicate(self):
  self.reject(lambda m:m.MONITOR_ONESHOT_TIMERS.__setitem__(g.UNIT,"evil.timer"),"MONITOR_PAIR_ALREADY_ALTERED")
 def test_existing_reviewed_pair_is_not_overridden(self):
  m=Fake()
  m.MONITOR_ONESHOT_TIMERS[g.UNIT]=g.TIMER
  with patch.object(g,"sha",side_effect=hash_fixture):
   self.assertEqual(g.guarded_snapshot(m)["opaqueFinanceSnapshot"],"unchanged")
  self.assertEqual(m.MONITOR_ONESHOT_TIMERS[g.UNIT],g.TIMER)
 def test_cleanup_on_success(self):
  m=Fake()
  with patch.object(g,"sha",side_effect=hash_fixture):
   self.assertEqual(g.guarded_snapshot(m)["opaqueFinanceSnapshot"],"unchanged")
  self.assertNotIn(g.UNIT,m.MONITOR_ONESHOT_TIMERS)
  self.assertEqual(m.calls,1)
 def test_source_and_timer_rechecked_after_snapshot(self):
  m=Fake()
  def bad_after():
   m.calls+=1
   m.cats[g.UNIT]=b"mutated-after-read"
   return {"opaqueFinanceSnapshot":"prechange"}
  m.production_protected=bad_after
  with patch.object(g,"sha",side_effect=hash_fixture):
   with self.assertRaisesRegex(g.C03IdentityHold,"LOADED_UNIT_OR_TIMER_CONFIG_DRIFT"):
    g.guarded_snapshot(m)
  self.assertNotIn(g.UNIT,m.MONITOR_ONESHOT_TIMERS)
if __name__=="__main__":main()
