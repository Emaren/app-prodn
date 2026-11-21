#!/usr/bin/env python3
"""Source-only, read-only B/OS admission witness for the Ember appearance writer.
This tool DOES NOT install user/unit/secret/HBA, start the service, or issue a
permit. Exit 0 only for the requested phase's exact independent observations.
Run by existing B authorized root operator, never the nonfinancial UID650 app.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import grp
import socket
import stat
import subprocess
import sys
from datetime import datetime, timezone

HEAD = "f50ead889c6101115aaf678ebdfa70650b691552"
BIN_GIT_BLOB = "ef0dfbc5f0fc65802e73be4b9f0b885f328c3897"
RUN = Path("/var/lib/aoe2war-web-prod-" + HEAD[:12])
UNIT = Path("/etc/systemd/system/aoe2war-appearance-writer.service")
SECRET = Path("/etc/aoe2war/appearance-writer-v1.env")
SOCKET_DIR = Path("/run/aoe2war-appearance-writer")
SOCKET = SOCKET_DIR / "appearance.sock"
WRITER = "aoe2war-appearance"
WEB = "aoe2war-web-prod"
GROUP = "aoe2war-web-prod"

def run(*cmd):
    return subprocess.run(cmd, text=True, capture_output=True, timeout=7, check=False)

def view(path):
    try:
        st=path.lstat()
        return st
    except FileNotFoundError:
        return None

def blob(path):
    data=path.read_bytes()
    return hashlib.sha1(b"blob "+str(len(data)).encode()+b"\x00"+data).hexdigest()

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--phase", required=True, choices=("prestage","stage","active"))
    args=p.parse_args()
    evidence=[]
    def check(label, ok):
        evidence.append({"gate":label,"result":"PASS" if ok else "HOLD"})
    check("root_observer",os.geteuid()==0)
    web=pwd.getpwnam(WEB)
    grpweb=grp.getgrnam(GROUP)
    check("UID990_web",web.pw_uid==990)
    check("web_group_primary",web.pw_gid==grpweb.gr_gid)
    check("web_group_no_extra_members",len(grpweb.gr_mem)==0)
    r=run("/usr/bin/systemctl","show","aoe2hdbets-web-prod.service",
       "-p","ActiveState","-p","MainPID","-p","NRestarts","--no-pager")
    props=dict(x.split("=",1) for x in r.stdout.splitlines() if "=" in x)
    check("old_web_active",props.get("ActiveState")=="active" and
          props.get("MainPID","0").isdigit() and int(props.get("MainPID","0"))>0)
    ports=run("/usr/bin/ss","-ltnH")
    def listening(port):
        return any(":"+str(port)+" " in line for line in ports.stdout.splitlines())
    check("protected_ports_present",all(listening(x) for x in (3030,3032,3033,9447)))
    check("financial_ports_closed",all(not listening(x) for x in (8092,8093,8094,8095)))
    unit=view(UNIT); env=view(SECRET); so=view(SOCKET); parent=view(SOCKET_DIR)
    try:writer=pwd.getpwnam(WRITER)
    except KeyError:writer=None
    check("separate_writer_uid_or_absent",
      writer is None if args.phase=="prestage" else
      writer is not None and writer.pw_uid not in (0,990) and
      writer.pw_gid==grpweb.gr_gid and writer.pw_shell=="/usr/sbin/nologin")
    if args.phase=="prestage":
        check("no_installed_unit",unit is None)
        check("no_writer_env",env is None)
        check("no_writer_socket_parent",parent is None)
        check("no_writer_socket",so is None)
    else:
        check("approved_source_runtime_root",RUN.is_dir() and
              RUN.stat().st_uid==0 and not RUN.is_symlink())
        source=RUN/".aoe2war-source-sha"
        check("runtime_source_marker_exact",source.is_file()
              and source.read_text().strip()==HEAD)
        b=RUN/"bin/appearance-writer.mjs"
        st=view(b)
        check("exact_node_source_blob",st is not None and
              stat.S_ISREG(st.st_mode) and not stat.S_ISLNK(st.st_mode) and
              st.st_uid==0 and st.st_nlink==1 and
              not (stat.S_IMODE(st.st_mode)&0o022) and blob(b)==BIN_GIT_BLOB)
        check("unit_root_owned",unit is not None and
              stat.S_ISREG(unit.st_mode) and not stat.S_ISLNK(unit.st_mode)
              and unit.st_uid==0 and unit.st_nlink==1 and
              stat.S_IMODE(unit.st_mode)==0o644)
        check("secret_file_custody",env is not None and
              stat.S_ISREG(env.st_mode) and not stat.S_ISLNK(env.st_mode)
              and env.st_uid==0 and env.st_nlink==1 and
              stat.S_IMODE(env.st_mode)==0o600)
        webUnit=run("/usr/bin/systemctl","show",
          "aoe2hdbets-web-prod.service","-p","EnvironmentFiles","--no-pager")
        check("web_environment_no_writer_secret",str(SECRET) not in webUnit.stdout)
        unitStatus=run("/usr/bin/systemctl","show",
          "aoe2war-appearance-writer.service","-p","User","-p","Group",
          "-p","ActiveState","-p","LoadState","-p","UnitFileState","--no-pager")
        info=dict(x.split("=",1) for x in unitStatus.stdout.splitlines() if "=" in x)
        check("effective_independent_service_identity",
          info.get("User")==WRITER and info.get("Group")==GROUP and
          info.get("LoadState")=="loaded")
        check("never_enabled",info.get("UnitFileState") in ("disabled","static"))
        if args.phase=="stage":
            check("stage_service_not_active",info.get("ActiveState")=="inactive")
            check("stage_socket_not_created",so is None)
        else:
            check("writer_service_active",info.get("ActiveState")=="active")
            check("socket_parent_owner_group",parent is not None and
                  stat.S_ISDIR(parent.st_mode) and not stat.S_ISLNK(parent.st_mode)
                  and parent.st_uid==writer.pw_uid and
                  parent.st_gid==grpweb.gr_gid and
                  stat.S_IMODE(parent.st_mode)==0o710)
            check("socket_owner_group_mode",so is not None and
                  stat.S_ISSOCK(so.st_mode) and not stat.S_ISLNK(so.st_mode)
                  and so.st_uid==writer.pw_uid and so.st_gid==grpweb.gr_gid and
                  stat.S_IMODE(so.st_mode)==0o660)
    report={"schema":"aoe2war.ember-b-os-readonly-admission.v1",
            "utc":datetime.now(timezone.utc).isoformat(),
            "phase":args.phase,"sourceSha":HEAD,"checks":evidence,
            "status":"PASS" if all(x["result"]=="PASS" for x in evidence) else "HOLD",
            "changesMade":False,"financialAuthorized":False}
    print(json.dumps(report,sort_keys=True,separators=(",",":")))
    return 0 if report["status"]=="PASS" else 2

if __name__=="__main__":
    try:sys.exit(main())
    except Exception:
        print(json.dumps({"status":"HOLD","reason":"OBSERVER_EXCEPTION","changesMade":False}))
        sys.exit(2)
