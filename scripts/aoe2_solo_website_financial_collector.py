#!/usr/bin/env python3
"""Read-only HEL1 unit/process census input to independent financial auditor.

Never signs its own output, never claims CLOSED_WORLD_VERIFIED. Separate native
auditor MUST close cron, ingress, database, source and GET/prewarm side effects.
No service starts/stops, no database requests, no env/secret values emitted.
"""
from __future__ import annotations
import hashlib, json, os, pathlib, pwd, re, socket, stat, subprocess, sys
from aoe2_solo_website_financial_proof import (
 HOST,REQUIRED_UNITS,REQUIRED_SERVICES,REQUIRED_TIMERS,ONESHOT_SERVICES,
 canonical,FinancialProofHold,require)
MAX_CMD_BYTES=2_000_000
PREFIXES=("aoe2hdbets-","aoe2dewarwagers-","wolochain-","wolochaind-",
          "aoe2-wolo-","aoe2war-prewarm.")
NATIVE_PROPS=("Id","LoadState","ActiveState","SubState","Type","MainPID",
 "User","Group","FragmentPath","DropInPaths","ExecStart","Environment",
 "EnvironmentFiles","ControlGroup","InvocationID","Result",
 "ExecMainStatus","ExecMainStartTimestampMonotonic","ExecMainExitTimestampMonotonic",
 "LastTriggerUSec","NextElapseUSecRealtime","Unit")
UNIT=re.compile(r"[A-Za-z0-9_@.-]+\.(?:service|timer)\Z")

def sha(raw):return hashlib.sha256(raw).hexdigest()

def run(argv):
 require(type(argv)is list and argv and argv[0]=="/usr/bin/systemctl",
         "unexpected native command")
 p=subprocess.run(argv,capture_output=True,timeout=12,check=False)
 require(p.returncode==0 and len(p.stdout)<=MAX_CMD_BYTES,
         "incomplete native systemd observation")
 return p.stdout

def props(raw):
 result={}
 for row in raw.decode("utf8","strict").splitlines():
  key,sep,value=row.partition("=")
  require(sep and key not in result and key in NATIVE_PROPS,
          "noncanonical native unit property")
  result[key]=value
 require(set(result)==set(NATIVE_PROPS),"missing native unit properties")
 return result

def proc_identity(pid):
 """One /proc start-tick snapshot; no process commandline/env disclosure."""
 pid=int(pid)
 require(pid>1,"bad process PID")
 base=pathlib.Path("/proc")/str(pid)
 try:
  before=(base/"stat").read_text()
  idx=before.rfind(")")
  require(idx>0,"invalid proc stat")
  start=int(before[idx+2:].split()[19])
  status=(base/"status").read_text()
  uid=next(int(x.split()[1]) for x in status.splitlines()
           if x.startswith("Uid:"))
  cgroup=(base/"cgroup").read_bytes()
  exe=(base/"exe").resolve(strict=True)
  # Identity is captured from actual executable bytes, not a pasted name.
  h=hashlib.sha256()
  with exe.open("rb") as fp:
   while True:
    block=fp.read(1024*1024)
    if not block:break
    h.update(block)
  after=(base/"stat").read_text()
  idx2=after.rfind(")")
  require(idx2>0 and int(after[idx2+2:].split()[19])==start,
          "PID recycled during native capture")
 except (OSError,StopIteration,IndexError,ValueError) as exc:
  raise FinancialProofHold("unstable native /proc observation")from exc
 return {"main_pid":pid,"start_time_ticks":start,"uid":uid,
         "executable_sha256":h.hexdigest(),"cgroup_sha256":sha(cgroup)}

def unit_names():
 """Discover unit files, not just active units; idle timers/oneshots matter."""
 raw=run(["/usr/bin/systemctl","list-unit-files","--all","--type=service",
          "--type=timer","--no-legend","--no-pager"])
 names=set()
 for line in raw.decode("utf8","strict").splitlines():
  fields=line.split()
  if not fields:continue
  name=fields[0]
  if not UNIT.fullmatch(name):continue
  if name.startswith(PREFIXES):names.add(name)
 # Never treat missing an inactive/disabled finance unit as nonexistence.
 require(REQUIRED_UNITS<=names,
         "HEL1 native discovery missing required unit: "+
         ",".join(sorted(REQUIRED_UNITS-names)))
 return sorted(names),sha(raw)

def observe_unit(name):
 require(UNIT.fullmatch(name),"unit name invalid")
 raw=run(["/usr/bin/systemctl","show",name,"--no-pager",
          "--property="+",".join(NATIVE_PROPS)])
 p=props(raw)
 require(p["Id"]==name and p["LoadState"]=="loaded",
         "native unit missing or transient/unloaded: "+name)
 kind="timer" if name.endswith(".timer") else "service"
 status=p["ActiveState"]
 require(status in ("active","inactive","failed","activating","deactivating"),
         "unknown native unit state")
 cat=run(["/usr/bin/systemctl","cat",name,"--no-pager"])
 drop=p["DropInPaths"].encode()
 env=(p["Environment"]+"\n"+p["EnvironmentFiles"]).encode()
 invocation=canonical({key:p[key] for key in (
  "InvocationID","Result","ExecMainStatus","ExecMainStartTimestampMonotonic",
  "ExecMainExitTimestampMonotonic")})
 record={"unit":name,"kind":kind,"state":status,\n  "main_pid":int(p["MainPID"] or "0") if kind=="timer" else int(p["MainPID"]),\n  "declared_user":p["User"],"declared_group":p["Group"],
  "unit_file_sha256":sha(cat),"dropins_sha256":sha(drop),
  "exec_sha256":sha(p["ExecStart"].encode()),
  "environment_sha256":sha(env),
  "cgroup_sha256":sha(p["ControlGroup"].encode()),
  "systemd_show_sha256":sha(raw),"last_invocation_sha256":sha(invocation),
  "start_time_ticks":0,"executable_sha256":None}
 if record["main_pid"]>0:
  proc=proc_identity(record["main_pid"])
  record["start_time_ticks"]=proc["start_time_ticks"]
  record["executable_sha256"]=proc["executable_sha256"]
  record["uid"]=proc["uid"]
  record["process_cgroup_sha256"]=proc["cgroup_sha256"]
  declared=p["User"] or "root"
  try:expected_uid=pwd.getpwnam(declared).pw_uid
  except KeyError as exc:raise FinancialProofHold("native declared service user missing")from exc
  require(proc["uid"]==expected_uid,
          "native process UID differs from systemd unit principal")
  # Captured cgroup MUST include systemd's current controlling group.
  require(p["ControlGroup"] and p["ControlGroup"].encode()in
          (pathlib.Path("/proc")/str(record["main_pid"])/"cgroup").read_bytes(),
          "systemd cgroup and PID disagree")
 if kind=="timer":
  record.update(trigger_unit=p["Unit"] or name[:-6]+".service",
   schedule_sha256=sha(cat),
   last_trigger_sha256=sha((p["LastTriggerUSec"]+"\n"+
                           p["NextElapseUSecRealtime"]).encode()))
 # Generic service is never allowed to impersonate distinct named writer.
 if status=="active" and name in REQUIRED_SERVICES and name not in ONESHOT_SERVICES:
  require(record["main_pid"]>1,"active writer process has no main PID")
 return record

def capture():
 require(sys.platform=="linux" and os.geteuid()==0 and
         socket.gethostname()==HOST,"not native root HEL1")
 names,files_sha=unit_names()
 units={name:observe_unit(name) for name in names}
 return {"schema":"aoe2war.financial-native-unit-observation.v1",
         "host":HOST,"source":"LIVE_ROOT_READ_ONLY",
         "unit_files_discovery_sha256":files_sha,
         "discovered_unit_names":names,
         "unit_inventory_sha256":sha(canonical(units)),
         "units":units,"status":"UNSIGNED_PARTIAL_OBSERVATION",
         "unverified_edges":["cron_at","external_ingress","database_writers",
           "http_get_head","prewarm_effects","source_dependency_graph",
           "finance_exposure","independent_signatures"]}

def main():
 try:
  result=capture()
  print(json.dumps(result,sort_keys=True,separators=(",",":")))
 except (FinancialProofHold,OSError,ValueError,IndexError,
         subprocess.TimeoutExpired) as exc:
  print("FINANCIAL_NATIVE_HOLD: "+str(exc),file=sys.stderr)
  raise SystemExit(2)
if __name__=="__main__":main()
