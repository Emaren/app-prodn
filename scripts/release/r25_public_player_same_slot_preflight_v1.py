#!/usr/bin/env python3
"""Read-only HEL1 3032 same-slot release-admission preflight for PR1300.

No --apply, --install or --rollback. Does not inspect FINANCIAL workspace,
read environment secrets, run a web server, modify systemd or Nginx, or touch SQL.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

BASELINE="b1ef050b954be734c9f34147361e0d02d7c89b19"
BASE_BUILD="QVzgMJiQwhFvwrRbY9oZW"
CANDIDATE="6662c33a0ecf25e5b4bd11283fe98a4842a69eb0"
CAND_BUILD="brqExtuPGWtj1iKPCdur-"
ORIGINAL_DIR="/var/lib/aoe2war-web-prod-b1ef050b954b"
CANDIDATE_DIR="/var/lib/aoe2war-web-prod-6662c33a0ecf25e5"
UNIT="/etc/systemd/system/aoe2hdbets-web-prod.service"
UNIT_SHA="f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a"
PRELOADER_SHA="5edf4485be0884922935295600adf7c8b3c17fe697b962d31e7f17b09e8f3ec3"
STEAM_SCRIPT_SHA="7d432066f370b9eeb7f931f2143a12f2695177e6c174775b4400617e00909c4c"
STEAM_UNIT_SHA="b976a10d5cc8b3c199974f1b85a912a67323e8b57b4f69325a1061428d20deb2"
PIN={
    "source":BASELINE,"build":BASE_BUILD,"web_pid":"701398",
    "rollback_pid":"2625090","paper_pid":"779129",
    "unit_sha":UNIT_SHA,"preloader_sha":PRELOADER_SHA,
    "steam_script_sha":STEAM_SCRIPT_SHA,"steam_unit_sha":STEAM_UNIT_SHA,
    "web_user":"aoe2war-web-prod","web_group":"aoe2war-web-prod",
    "web_memory_limit":3355443200,"web_selector_count":6,
    "old_path":ORIGINAL_DIR,"new_path":CANDIDATE_DIR,
}
class Hold(ValueError):
    pass
def need(cond: bool, message: str):
    if not cond: raise Hold("HOLD:R25_PLAYER_SAME_SLOT_"+message)
def checksum(x:bytes): return hashlib.sha256(x).hexdigest()

def evaluate(facts:dict, unit_bytes:bytes, pins=PIN):
    """Pure fail-closed predicate; returns a non-authorizing plan only."""
    for field in ("source","build","web_pid","rollback_pid","paper_pid",
                  "unit_sha","preloader_sha","steam_script_sha","steam_unit_sha",
                  "web_user","web_group"):
        need(facts.get(field)==pins[field],"PIN_"+field.upper())
    need(type(unit_bytes) is bytes and checksum(unit_bytes)==pins["unit_sha"],"UNIT_BYTES")
    old=pins["old_path"].encode();new=pins["new_path"].encode()
    need(unit_bytes.count(old)==4 and unit_bytes.count(new)==0,
         "FOUR_EXACT_RUNTIME_REFERENCES")
    need(b"WorkingDirectory="+old in unit_bytes and
         b"ExecStart=/usr/bin/node" in unit_bytes and
         b"--port 3032" in unit_bytes,"WEBSITE_SAME_SLOT_UNIT")
    need(b"ProtectHome=yes" in unit_bytes and b"ProtectSystem=strict" in unit_bytes and
         b"MemoryMax=3200M" in unit_bytes,"UNIT_PROTECTION_DRIFT")
    need(not any(str(p).encode() in unit_bytes for p in (8092,8093,8094,8095)),
         "FINANCIAL_UNIT_PORT_DRIFT")
    need(facts.get("web_state")=="active" and facts.get("rollback_state")=="active" and
         facts.get("paper_state")=="active","ACTIVE_RUNTIME_STATE")
    need(all(facts.get(k)=="0" for k in ("web_restarts","rollback_restarts","paper_restarts")),
         "SERVICE_RESTART_DRIFT")
    need(facts.get("steam_timer")=="active","STEAM_TIMER_STATE")
    need(facts.get("financial_listeners")==[],"PROTECTED_FINANCE_LISTENER")
    need(facts.get("selector_count")==pins["web_selector_count"],"NGINX_SELECTOR_DRIFT")
    need(facts.get("web_memory_limit")==pins["web_memory_limit"],"WEB_MEMORY_LIMIT")
    need(isinstance(facts.get("available_mem_kib"),int) and
         facts["available_mem_kib"] >= 1_250_000,"MEMORY_HEADROOM")
    need(isinstance(facts.get("root_free_bytes"),int) and
         facts["root_free_bytes"]>=15*(1024**3),"ROOT_DISK_HEADROOM")
    need(isinstance(facts.get("volume_free_bytes"),int) and
         facts["volume_free_bytes"]>=30*(1024**3),"VOLUME_DISK_HEADROOM")
    new_unit=unit_bytes.replace(old,new)
    need(new_unit.count(new)==4 and new_unit.count(old)==0,"CANDIDATE_UNIT_TRANSFORM")
    # Neither proposed candidate unit nor old unit is installed or modified.
    return {
        "status":"PASS_SOURCE_ONLY_READ_ONLY_SAME_SLOT_PREFLIGHT",
        "current_source":pins["source"],"candidate_source":CANDIDATE,
        "current_build":pins["build"],"candidate_build":CAND_BUILD,
        "old_unit_sha256":pins["unit_sha"],
        "proposed_candidate_unit_sha256":checksum(new_unit),
        "old_path_references_replaced":4,
        "web_pid":pins["web_pid"],"rollback_3030_preserved":True,
        "rollback_policy":"RESTORE_ORIGINAL_RESTRICTED_3032_UNIT_NOT_NGINX_TO_LEGACY_3030",
        "allowed_service_change_if_later_centrally_approved":"ONLY_aoe2hdbets-web-prod.service",
        "steam_v20_identity_preserved":True,"finance_ports_quarantined":True,
        "third_web_runtime_authorized":False,"deployment_authorized":False,
        "rollback_executed":False,"root_only_approval_still_required":True,
    }

def read_file_sha(path):
    data=Path(path).read_bytes()
    return checksum(data)

def process(argv):
    p=subprocess.run(argv,capture_output=True,timeout=9)
    need(p.returncode==0,"READ_ONLY_PROBE_FAILED")
    return p.stdout.decode(errors="replace").strip()
def systemd(unit,field):
    return process(["systemctl","show",unit,"-p",field,"--value"])
def stat_free(path):
    v=os.statvfs(path);return v.f_bavail*v.f_frsize

def collect():
    # No environment values, cookies, SQL, SSH material or archive bytes read.
    path=Path(UNIT)
    s=path.lstat()
    need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and
         (s.st_mode&0o022)==0 and s.st_nlink==1,"WEBSITE_UNIT_PERMISSIONS")
    unit=path.read_bytes()
    runtime=Path(ORIGINAL_DIR)
    need(runtime.is_dir() and not runtime.is_symlink(),"CURRENT_RUNTIME_DIRECTORY")
    web="aoe2hdbets-web-prod.service"
    roll="aoe2hdbets-web.service"
    paper="kingdom-traders-paper.service"
    text=Path("/proc/meminfo").read_text()
    memory=int(next(line.split()[1] for line in text.splitlines()
                    if line.startswith("MemAvailable:")))
    ss=process(["ss","-H","-lnt"]).splitlines()
    occupied=[]
    for number in (8092,8093,8094,8095):
        if any(len(line.split())>=4 and
               re.search(r":"+str(number)+r"$",line.split()[3]) for line in ss):
            occupied.append(number)
    nginx=process(["nginx","-T"]).count("proxy_pass http://127.0.0.1:3032")
    facts={
        "source":(runtime/".aoe2war-source-sha").read_text().strip(),
        "build":(runtime/".next/BUILD_ID").read_text().strip(),
        "unit_sha":checksum(unit),
        "preloader_sha":read_file_sha("/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs"),
        "steam_script_sha":read_file_sha("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v20.py"),
        "steam_unit_sha":read_file_sha("/etc/systemd/system/aoe2war-steam-egress-refresh.service"),
        "web_pid":systemd(web,"MainPID"),"rollback_pid":systemd(roll,"MainPID"),
        "paper_pid":systemd(paper,"MainPID"),
        "web_state":systemd(web,"ActiveState"),"rollback_state":systemd(roll,"ActiveState"),
        "paper_state":systemd(paper,"ActiveState"),
        "web_restarts":systemd(web,"NRestarts"),"rollback_restarts":systemd(roll,"NRestarts"),
        "paper_restarts":systemd(paper,"NRestarts"),
        "web_user":systemd(web,"User"),"web_group":systemd(web,"Group"),
        "web_memory_limit":int(systemd(web,"MemoryMax")),
        "steam_timer":systemd("aoe2war-steam-egress-refresh.timer","ActiveState"),
        "selector_count":nginx,"financial_listeners":occupied,
        "available_mem_kib":memory,
        "root_free_bytes":stat_free("/"),
        "volume_free_bytes":stat_free("/mnt/HC_Volume_105319120"),
    }
    return facts,unit

def main():
    need(len(sys.argv)==2 and sys.argv[1]=="--inspect","READ_ONLY_INSPECT_ONLY")
    try:
        facts,unit=collect()
        result=evaluate(facts,unit)
        result["utc"]=dt.datetime.now(dt.timezone.utc).isoformat()
        print(json.dumps(result,sort_keys=True))
    except (Hold,OSError,subprocess.SubprocessError,ValueError,StopIteration) as exc:
        print(json.dumps({"status":"HOLD_PUBLIC_PLAYER_SAME_SLOT",
                          "why":str(exc)[:240],"deployment_authorized":False},sort_keys=True))
        raise SystemExit(2)

if __name__=="__main__":main()
