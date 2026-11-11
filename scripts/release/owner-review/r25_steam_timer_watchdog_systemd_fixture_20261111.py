#!/usr/bin/env python3
"""Disposable ROOT USER systemd-manager fixture, not system manager.

All fixture timer files live only in /run/user/0/systemd/user. The ONLY reload
is systemctl --user daemon-reload: production systemd PID1 is never reloaded.
The established disposable nft fixture separately tests kernel 6.8 nft.
The original fixture timer is persistent, unlike a transient timer that
systemd automatically unloads on stop: exercises stop/start after SIGKILL.
"""
import datetime
import hashlib
import os
from pathlib import Path
import secrets
import subprocess
import time

PREFIX="aoe2war-b-fixture-wd-"
ROOT_USER_UNITS=Path("/run/user/0/systemd/user")
ENV={**os.environ,"XDG_RUNTIME_DIR":"/run/user/0",
     "DBUS_SESSION_BUS_ADDRESS":"unix:path=/run/user/0/bus"}
assert os.geteuid()==0 and ROOT_USER_UNITS.parent.is_dir()
assert Path("/proc/sys/kernel/osrelease").read_text().strip().startswith("6.8.")
def sh(*args,timeout=15,ok=True):
    if args[0]=="systemctl" and args[1]=="--user":
        verb=args[2]
        if verb in ("stop","start","kill","reset-failed"):
            assert args[-1].startswith(PREFIX),("HOLD_NON_FIXTURE_MUTATION",args)
    if args[0]=="systemd-run" and args[1]=="--user":
        assert any(a.startswith("--unit="+PREFIX) for a in args)
    p=subprocess.run(args,capture_output=True,text=True,timeout=timeout,env=ENV)
    if ok and p.returncode:raise AssertionError((args,p.returncode,p.stdout,p.stderr))
    return p
def user(*args,**kw):return sh("systemctl","--user",*args,**kw)
def state(unit,key="ActiveState"):return user("show",unit,"-p",key,"--value").stdout.strip()
def system_state(unit,key="ActiveState"):
    return sh("systemctl","show",unit,"-p",key,"--value").stdout.strip()
def protected_pre_post():
    units=("aoe2hdbets-web-prod","aoe2hdbets-web","kingdom-traders-paper",
           "r25-c03-emergency-3033","wolochaind-mainnet","ssh","nginx")
    pids={u:(system_state(u+".service","MainPID"),system_state(u+".service","NRestarts"),
             system_state(u+".service")) for u in units}
    c04={u:(system_state(u,"LoadState"),system_state(u)) for u in
         ("wolochain-mainnet-settlement.service",
          "wolochain-founder-rewards-settlement.service")}
    return (pids,c04)
def write_persistent_timer(base):
    path=ROOT_USER_UNITS/(base+"-original.timer")
    data=("[Unit]\nDescription=Test-only original Steam fixture timer\n"+
          "[Timer]\nOnActiveSec=300s\nAccuracySec=1us\n"+
          "[Install]\nWantedBy=timers.target\n").encode()
    path.parent.mkdir(parents=True,exist_ok=True)
    assert not path.exists()
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:f.write(data);f.flush();os.fsync(f.fileno())
    path_service=ROOT_USER_UNITS/(base+"-original.service")
    data_service=("[Unit]\nDescription=Test-only original Steam fixture service\n"+
        "[Service]\nType=oneshot\nExecStart=/usr/bin/true\n").encode()
    assert not path_service.exists()
    fd=os.open(path_service,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:f.write(data_service);f.flush();os.fsync(f.fileno())
    user("daemon-reload")
    return path,path_service,hashlib.sha256(data).hexdigest()
def arm(base):
    original=base+"-original"
    rescue=base+"-rescue"
    user("start",original+".timer")
    assert state(original+".timer")=="active"
    sh("systemd-run","--user","--unit="+rescue,"--on-active=8s",
       "--timer-property=AccuracySec=1us",
       "/usr/bin/systemctl","--user","start",original+".timer")
    assert state(rescue+".timer")=="active"
    return original,rescue
def launch_worker(base,original,mode):
    holder=base+"-holder"
    code="import subprocess,time\n"
    code+="subprocess.run(['systemctl','--user','stop','"+original+".timer'],check=True)\n"
    if mode=="sigkill":code+="time.sleep(60)\n"
    elif mode=="failure":code+="raise RuntimeError('INJECTED_FAILURE')\n"
    else:code+="time.sleep(3)\n"
    sh("systemd-run","--user","--unit="+holder,"--property=Type=exec",
       "--property=KillMode=control-group","--property=RuntimeMaxSec=6s",
       "/usr/bin/python3","-c",code)
    end=time.monotonic()+4
    while time.monotonic()<end:
        if state(original+".timer")=="inactive":break
        time.sleep(.1)
    assert state(original+".timer")=="inactive","HOLD_FIXTURE_TIMER_NOT_STOPPED"
    return holder
def restored(original,maxwait=13):
    end=time.monotonic()+maxwait
    while time.monotonic()<end:
        if state(original+".timer")=="active":return True
        time.sleep(.2)
    return False
def cleanup(units,files):
    for u in reversed(units):
        for typ in (".timer",".service"):
            user("stop",u+typ,ok=False,timeout=8)
    for p in files:
        p.unlink(missing_ok=True)
    user("daemon-reload")
    for u in units:
        for typ in (".service",".timer"):user("reset-failed",u+typ,ok=False)
def run():
    before=protected_pre_post()
    print("PASS_SYSTEM_MANAGER_UNTOUCHED_USER_FIXTURE_STARTED",
          datetime.datetime.now(datetime.timezone.utc).isoformat(),
          sh("systemctl","--version").stdout.splitlines()[0],flush=True)
    suffix=secrets.token_hex(3)
    for mode in ("sigkill","failure","normal"):
        base=PREFIX+suffix+"-"+mode
        units=[base+"-original",base+"-rescue",base+"-holder"]
        files=[]
        try:
            f0,f1,original_sha=write_persistent_timer(base)
            files=[f0,f1]
            original,rescue=arm(base)
            holder=launch_worker(base,original,mode)
            if mode=="sigkill":
                user("kill","--kill-who=all","--signal=SIGKILL",holder+".service")
                assert restored(original),"HOLD_SIGKILL_WATCHDOG_DID_NOT_RESTORE"
                print("PASS_REAL_USER_SYSTEMD_TIMER_RESTORED_AFTER_SIGKILL",flush=True)
            elif mode=="failure":
                assert restored(original),"HOLD_FAILED_WORKER_TIMER_NOT_RESTORED"
                print("PASS_REAL_USER_SYSTEMD_TIMER_RESTORED_AFTER_FAILED_WORKER",flush=True)
            else:
                user("start",original+".timer")
                assert state(original+".timer")=="active"
                user("stop",rescue+".timer")
                assert state(rescue+".timer")=="inactive"
                time.sleep(8.5)
                assert state(rescue+".timer")=="inactive" and state(original+".timer")=="active"
                print("PASS_NORMAL_RESTORE_WATCHDOG_CANCELLED_NO_LATE_TRIGGER",flush=True)
            assert hashlib.sha256(f0.read_bytes()).hexdigest()==original_sha
            print("PASS_IDENTICAL_PERSISTENT_ORIGINAL_TIMER_DEFINITION",mode,flush=True)
        finally:
            cleanup(units,files)
    after=protected_pre_post()
    assert before==after,("HOLD_SYSTEM_PROTECTED_PID_OR_C04_DRIFT",before,after)
    print("PASS_SEVEN_PROTECTED_PIDS_AND_C04_MASKS_UNCHANGED",flush=True)
    print("PASS_FIXTURE_ONLY_USER_MANAGER_RELOAD_NO_PID1_MANAGER_RELOAD",flush=True)
    print("PASS_NO_PRODUCTION_NFT_OR_WEB_OR_FINANCIAL_MUTATION",flush=True)
if __name__=="__main__":run()
