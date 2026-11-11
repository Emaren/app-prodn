#!/usr/bin/env python3
"""Source-reviewed, explicit-Central-admission-only one-use V22 installer.
Import and ordinary/no-argument invocation are inert; no implicit authority.
"""
import hashlib, ipaddress, json, os, re, secrets, stat, subprocess, time, argparse, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
HOST="steamcommunity.com"
ROOT=Path("/root/aoe2war-public-player-6662c33a-v22-install-input")
STAGED=Path("/var/lib/aoe2war-public-player-6662c33a-one-use-v1/events/0003.json")
NEW_EVENT="0be22cb597993307ab855443ae89e87dae25d542354e70474c98d5d673f87a45"
OLD_UNIT="b976a10d5cc8b3c199974f1b85a912a67323e8b57b4f69325a1061428d20deb2"
V22="c6e633538fc17dad6fe887452516cb2ba1095855a0aab6f4bdda47f5985f6edc"
V22_UNIT="44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a"
PIDS={"aoe2hdbets-web-prod.service":701398,"aoe2hdbets-web.service":2625090,"r25-c03-emergency-3033.service":4136606,"kingdom-traders-paper.service":779129,"wolochaind-mainnet.service":1009,"ssh.service":3727528,"nginx.service":3727665}
def hold(code):
    raise RuntimeError("HOLD:"+code)
def run(argv,timeout=12,ok=(0,)):
    p=subprocess.run(argv,text=True,capture_output=True,timeout=timeout)
    if p.returncode not in ok:hold("COMMAND_"+argv[0].split("/")[-1]+"_"+str(p.returncode)+"_"+p.stderr.strip()[-90:])
    return p.stdout,p.stderr,p.returncode
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def check(b,why):
    if not b:hold(why)
def uname_check():
    check(Path("/proc/sys/kernel/random/boot_id").read_text().strip()=="6fdc01cb-8eb6-448d-9a5a-b62b66e0fe34","BOOT_ID")
    check(os.uname().nodename=="ubuntu-4gb-hel1-11","HOST")
def unit(name):
    o,_,_=run(["systemctl","show",name,"-p","MainPID","-p","ActiveState","-p","LoadState","-p","NeedDaemonReload","-p","UnitFileState"])
    return dict(line.split("=",1) for line in o.splitlines() if "=" in line)
def dns_query(server,typ):
    raw,err,rc=run(["/usr/bin/dig","@"+server,HOST,typ,"+time=2","+tries=1","+noall","+comments","+answer"],timeout=6)
    check("status: NOERROR" in raw,"DNS_STATUS_"+server+"_"+typ)
    m=re.search(r"ANSWER: (\d+)",raw)
    check(bool(m),"DNS_NO_ANSWER_COUNT_"+server+"_"+typ)
    rows=set()
    for line in raw.splitlines():
        if line.startswith(";") or not line.strip():continue
        fields=line.split()
        if len(fields)>=5 and fields[0].rstrip(".").lower()==HOST and fields[3]==typ:
            rows.add(str(ipaddress.ip_address(fields[4])))
    check(len(rows)==int(m.group(1)),"DNS_ANSWER_SHAPE_"+server+"_"+typ)
    return {"status":"NOERROR","answer_count":len(rows),"addresses":sorted(rows)}
def system_dns(typ):
    o,e,rc=run(["resolvectl","query","--type="+typ,HOST],timeout=8,ok=(0,1))
    if typ=="AAAA" and rc==1:
        check("does not have any RR of the requested type" in e+o,"SYSTEM_AAAA_FAILURE_NOT_NODATA")
        return []
    check(rc==0,"SYSTEM_DNS_"+typ)
    addrs=set()
    for line in o.splitlines():
        m=re.search(r"\b"+re.escape(HOST)+r"\s+IN\s+"+typ+r"\s+([0-9a-fA-F:.]+)",line)
        if m:addrs.add(str(ipaddress.ip_address(m.group(1))))
    check(bool(addrs) if typ=="A" else True,"SYSTEM_NO_A")
    return sorted(addrs)
def tls(ip,ver):
    address=ip if ver==4 else "["+ip+"]"
    o,e,rc=run(["curl","--silent","--show-error","--location","--output","/dev/null",
            "--max-time","11","--connect-timeout","6","--noproxy","*",
            "--resolve",HOST+":443:"+address,
            "--write-out","%{ssl_verify_result} %{remote_ip} %{http_code}",
            "https://"+HOST+"/"],timeout=14)
    parts=o.strip().split()
    check(len(parts)==3 and parts[0]=="0" and parts[1].strip("[]")==ip
          and parts[2].isdigit() and 200<=int(parts[2])<500,
          "CA_SNI_TLS_FAIL_"+ip)
    return {"address":ip,"ca_verify_result":0,"remote_ip":parts[1],"http_status":int(parts[2])}
def nft_sets():
    o,e,rc=run(["nft","-j","list","table","inet","aoe2war_web_prod"],timeout=10)
    table=json.loads(o);sets={}
    for item in table.get("nftables",[]):
        v=item.get("set",{})
        name=v.get("name")
        if name not in ("steam4","steam6"):continue
        check(name not in sets and v.get("table")=="aoe2war_web_prod" and v.get("family")=="inet" and
          v.get("type")==("ipv4_addr" if name=="steam4" else "ipv6_addr") and
          v.get("flags")==["timeout"] and v.get("timeout")==300,"NFT_SET_SHAPE_"+name)
        vals={}
        for entry in v.get("elem") or []:
            value=entry.get("elem",{})
            ip=str(ipaddress.ip_address(value.get("val")))
            ttl=value.get("expires")
            check(type(ttl)==int and 0<ttl<=300,"NFT_TTL_"+ip)
            check(ip not in vals,"NFT_DUPLICATE_"+ip)
            vals[ip]=ttl
        sets[name]=vals
    check(set(sets)=={"steam4","steam6"},"NFT_SET_NAMES")
    check(0<len(sets["steam4"])+len(sets["steam6"])<=16,"NFT_TOTAL")
    return sets

# SESSION B — ONE USE PHYSICAL INSTALL_ONLY. Appended to reviewed read-only witness helpers.
import sys, hashlib, json, os, re, stat, subprocess, time, ipaddress, datetime
from pathlib import Path
REQ=None
REQ_SHA=None
INTENT=None
R=Path("/root/aoe2war-public-player-6662c33a-v22-install-input")
DEST=Path("/etc/aoe2war/web-prod-v22")
V22SRC=Path("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_two_web_builds_v22.py")
STEAM_UNIT=Path("/etc/systemd/system/aoe2war-steam-egress-refresh.service")
STEAM_TIMER=Path("/etc/systemd/system/aoe2war-steam-egress-refresh.timer")
WEB_UNIT=Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
HOST_BOOT="6fdc01cb-8eb6-448d-9a5a-b62b66e0fe34"
DROP_DIR=Path("/etc/systemd/system/aoe2war-steam-egress-refresh.service.d")
DROP_FILE=DROP_DIR/"50-r25-v22-lock-only.conf"
DROP_BYTES=("[Service]"+chr(10)+"ReadWritePaths=/etc/aoe2war/web-prod-v22/steam-refresh-v22.lock"+chr(10)).encode()
DROP_SHA="34d66d8b1684ed23c3ddae2fb3cc66ca3b1ab26bc4f6bb1fae378012f03e5920"
assert hashlib.sha256(DROP_BYTES).hexdigest()==DROP_SHA

EXPECTED={
"review-manifest.json":"918ad5714200b450c8a1ba4a9f72b4301dea0370fddeaeacbae9a8dbe8285183",
"v22-source.py":"c6e633538fc17dad6fe887452516cb2ba1095855a0aab6f4bdda47f5985f6edc",
"candidate-v22-timer.service":"44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a",
"original-3032-unit.service":"f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a",
"original-v20-timer.service":"b976a10d5cc8b3c199974f1b85a912a67323e8b57b4f69325a1061428d20deb2",
"stage-event-0003.json":"0be22cb597993307ab855443ae89e87dae25d542354e70474c98d5d673f87a45",
"stage-only-permit.json":"b7c101de347dee44c5ab9da2743f76b80a20b343eb321f7824f928012c610641",
"artifact.json":"1101e3ca5cc9c1ecefabadc848e5d7a20793d6d0d89031a13780558c33c91349",
"activate-only-permit.json":"ded0d1e25b188846333552df2393f58f0bd2876d1947f55ca99f13adc95500d3"
}
CRITICAL={
"aoe2hdbets-web-prod.service":701398,"aoe2hdbets-web.service":2625090,
"kingdom-traders-paper.service":779129,"r25-c03-emergency-3033.service":4136606,
"wolochaind-mainnet.service":1009,"ssh.service":3727528,"nginx.service":3727665
}
AUTHORIZATION_CTX=None
started=None
def pass_step(s, **info):
    print("PASS:"+s+" "+json.dumps(info,sort_keys=True),flush=True)
def cmdcheck(args,timeout=35):
    p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if p.returncode:hold("COMMAND_"+args[0]+"_RC_"+str(p.returncode)+"_"+p.stderr.strip()[-120:])
    return p.stdout
def check_physical(before=True):
    check(Path("/proc/sys/kernel/random/boot_id").read_text().strip()==HOST_BOOT,"BOOT")
    for name,pid in CRITICAL.items():
        data=unit(name)
        check(data["MainPID"]==str(pid) and data["ActiveState"]=="active" and data["NeedDaemonReload"]=="no","PID_"+name)
        check(cmdcheck(["systemctl","show",name,"-p","NRestarts","--value"],10).strip()=="0","RESTART_COUNT_"+name)
    for name in ("wolochain-mainnet-settlement.service","wolochain-founder-rewards-settlement.service"):
        data=unit(name)
        link=Path("/etc/systemd/system")/name
        check(data["MainPID"]=="0" and data["ActiveState"]=="inactive" and data["LoadState"]=="masked" and data["NeedDaemonReload"]=="no" and link.is_symlink() and os.readlink(link)=="/dev/null","C04_"+name)
    listeners=cmdcheck(["ss","-H","-lntp"],10)
    for port in (8092,8093,8094,8095):
        check(not any(re.search(r":"+str(port)+r"\s",s) for s in listeners.splitlines()),"FINANCE_LISTENER_"+str(port))
    for port,path,status in [(3030,"/players",200),(3032,"/players",200),(3032,"/api/bets",503)]:
        p=subprocess.run(["curl","-sS","-m","12","-o","/dev/null","-w","%{http_code}",f"http://127.0.0.1:{port}{path}"],capture_output=True,text=True,timeout=16)
        check(p.returncode==0 and p.stdout==str(status),"HTTP_"+str(port)+path)
    check(digest("/var/lib/aoe2war-public-player-6662c33a-one-use-v1/events/0003.json")==EXPECTED["stage-event-0003.json"],"STAGE")
    check(digest(WEB_UNIT)==EXPECTED["original-3032-unit.service"],"WEB_UNIT_SHA")
    check(digest(STEAM_TIMER)=="d3f4ce6fbbf6b2aad826a57e10e62859b82ce6e175b0ac99e6c5aa6f776413fc","TIMER_SHA")
    if before:
        check(digest(STEAM_UNIT)==EXPECTED["original-v20-timer.service"],"ORIGINAL_V20_UNIT")
        check(unit("aoe2war-steam-egress-refresh.timer")["ActiveState"]=="active","STEAM_TIMER_ACTIVE")
        require_native_steam_quiescent(unit("aoe2war-steam-egress-refresh.service"))
    else:
        check(digest(STEAM_UNIT)==EXPECTED["candidate-v22-timer.service"],"V22_UNIT_SHA")
        check(digest(V22SRC)==EXPECTED["v22-source.py"],"V22_SOURCE_SHA")
    return True
def process_conflicts():
    p=subprocess.run(["ps","-eo","pid=,comm=,args="],capture_output=True,text=True,timeout=10)
    check(p.returncode==0,"PS_UNAVAILABLE")
    conflicts=[]
    for line in p.stdout.splitlines():
        fields=line.strip().split(None,2)
        if len(fields)<3:continue
        pid=int(fields[0]);comm=fields[1];args=fields[2]
        if pid==os.getpid():continue
        # Do not inspect contents of financial archives, only running process metadata.
        if re.search(r"\b(pg_dump|pg_restore|wolo-c06|wolo-c07|wolo-restore|wolo-backup|systemctl daemon-reload|systemctl daemon-reexec)\b",comm+" "+args,re.I):
            conflicts.append((pid,comm))
    check(not conflicts,"CODEX_CAPTURE_OR_MANAGER_CONFLICT_"+repr(conflicts[:5]))
def witness():
    a={};aaaa={}
    for resolver in ("1.1.1.1","8.8.8.8","9.9.9.9"):
        a[resolver]=dns_query(resolver,"A")
        aaaa[resolver]=dns_query(resolver,"AAAA")
        check(bool(a[resolver]["addresses"]),"DNS_NO_A_"+resolver)
    sa=system_dns("A");s6=system_dns("AAAA")
    v4=set(sa).union(*(x["addresses"] for x in a.values()))
    v6=set(s6).union(*(x["addresses"] for x in aaaa.values()))
    plus=[bool(x["addresses"]) for x in aaaa.values()]+[bool(s6)]
    check(all(plus) or not any(plus),"AAAA_RESOLVER_DISAGREEMENT")
    check(bool(v4) and len(v4)+len(v6)<=16,"DNS_SCOPE")
    verified4=[tls(ip,4) for ip in sorted(v4)]
    verified6=[tls(ip,6) for ip in sorted(v6)]
    leases=nft_sets()
    for ip in v4:check(ip in leases["steam4"] and leases["steam4"][ip]>=180,"STEAM4_MISSING_OR_EXPIRED_"+ip)
    for ip in v6:check(ip in leases["steam6"] and leases["steam6"][ip]>=180,"STEAM6_MISSING_OR_EXPIRED_"+ip)
    if not v6:check(len(leases["steam6"])==0,"UNVALIDATED_STEAM6")
    check(all(ttl>=180 for fam in leases.values() for ttl in fam.values()),"STEAM_ANY_STALE_TTL")
    return {"host":"steamcommunity.com","A":sorted(v4),"AAAA":sorted(v6),
            "resolver_AAAA_NODATA":not bool(v6),"CA_TLS_SNI_IPV4":len(verified4),"CA_TLS_SNI_IPV6":len(verified6),
            "leases":leases,"min_headroom":min(ttl for fam in leases.values() for ttl in fam.values()),
            "at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat()}
def write_exact(source,target,mode):
    s=Path(source).read_bytes()
    check(not target.exists() and not target.is_symlink(),"TARGET_ALREADY_EXISTS_"+str(target))
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,"wb") as f:f.write(s);f.flush();os.fsync(f.fileno())
    os.chmod(target,mode)
    check(digest(target)==hashlib.sha256(s).hexdigest(),"INSTALLED_SHA_"+str(target))
def record_intent(obj):
    blob=(json.dumps(obj,sort_keys=True,indent=2)+"\n").encode()
    fd=os.open(INTENT,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:f.write(blob);f.flush();os.fsync(f.fileno())
    d=os.open("/root",os.O_RDONLY|os.O_DIRECTORY);os.fsync(d);os.close(d)
def require_native_steam_quiescent(state):
    """An executing V20 timer tick forbids the one-use installation."""
    check(state.get("ActiveState")=="inactive" and state.get("MainPID")=="0",
          "V20_ONESHOT_RUNNING")

def require_unconsumed(path):
    check(not path.exists() and not path.is_symlink(),"ONE_USE_PREVIOUSLY_CONSUMED")
def require_real_lease_headroom(leases):
    check(bool(leases.get("steam4") or leases.get("steam6")) and
          all(type(ttl) is int and ttl>=180 and ttl<=300
              for family in leases.values() for ttl in family.values()),
          "STEAM_GENUINE_TTL_UNDER_180")

def main_install():
    global started
    check(AUTHORIZATION_CTX is not None and AUTHORIZATION_CTX.get("decision")=="CENTRAL_INSTALL_ONLY_APPROVED",
          "NO_INDEPENDENT_CENTRAL_AUTHORIZATION")
    started=datetime.datetime.now(datetime.timezone.utc)
    os.umask(0o077)
    check(os.geteuid()==0,"ROOT")
    statreq=REQ.lstat()
    check(stat.S_ISREG(statreq.st_mode) and statreq.st_uid==0 and stat.S_IMODE(statreq.st_mode)==0o600 and statreq.st_nlink==1 and 1024<=statreq.st_size<=16384,"REQUEST_MODE")
    check(digest(REQ)==REQ_SHA,"REQUEST_SHA")
    req=json.loads(REQ.read_text())
    check(req["schema"]=="aoe2war.session-b.v22-lock-only-dropin-reinstall-request.v1"
          and req["phase"]=="V22_LOCK_FILE_ONLY_REINSTALL_ONLY_NOT_ACTIVATE"
          and req["admission"]=="UNADMITTED_REQUEST_DO_NOT_EXECUTE"
          and req["source_base_pr_1316_head"]=="d5ef77f05a3b9c3e6e053c05ea5db15c5e14598d","REQUEST_SCHEMA")
    expires=datetime.datetime.fromisoformat(req["expires_utc"])
    check(started < expires and datetime.datetime.now(datetime.timezone.utc)<expires-datetime.timedelta(seconds=120),"REQUEST_EXPIRES_SOON")
    check(re.fullmatch(r"[0-9a-f]{40}",req["nonce"]) is not None and REQ.name.endswith(req["nonce"][:12]+".json"),"REQUEST_NONCE")
    require_unconsumed(INTENT)
    check(DEST.is_dir() and not DEST.is_symlink() and DEST.stat().st_uid==0 and
          stat.S_IMODE(DEST.stat().st_mode)==0o500,"V22_ROOT_DRIFT")
    check(V22SRC.is_file() and digest(V22SRC)==EXPECTED["v22-source.py"],"V22_FORENSIC_PY_DRIFT")
    old=DEST/"original-steam-v20.service"
    check(digest(old)==EXPECTED["original-v20-timer.service"] and
          old.stat().st_uid==0 and stat.S_IMODE(old.stat().st_mode)==0o400,"V20_INVERSE_DRIFT")
    lock=DEST/"steam-refresh-v22.lock"
    check(lock.is_file() and not lock.is_symlink() and lock.stat().st_uid==0 and
          stat.S_IMODE(lock.stat().st_mode)==0o600 and lock.stat().st_nlink==1 and
          lock.stat().st_ino==1150281 and lock.stat().st_size==0,"LOCK_INODE_DRIFT")
    check(not DROP_DIR.exists() and not DROP_DIR.is_symlink(),"DROPIN_DIR_ALREADY_PRESENT")
    check(req["boot_id"]==HOST_BOOT and req["reviewed_seven_pids"]==CRITICAL
          and req["c04_both_masked"] is True and req["finance_port_listeners"]==[]
          and req["reviewed_v22_source_sha256"]==EXPECTED["v22-source.py"]
          and req["reviewed_v22_unit_sha256"]==EXPECTED["candidate-v22-timer.service"]
          and req["v20_active_unit_sha256"]==EXPECTED["original-v20-timer.service"]
          and req["staged_event_0003_unchanged_sha256"]==EXPECTED["stage-event-0003.json"],
          "APPROVED_PACKET_PROTECTED_SCOPE_FIELDS")
    check(req["dropin_sha256"]==DROP_SHA and req["dropin_exact_destination"]==str(DROP_FILE)
          and req["exact_pr_head"]=="f61c7c507997608173cc886938588373c1a2fb92"
          and req["requested_operation"]=="ONE_NEW_B_PHASE_STEAM_V22_BASE_UNIT_AND_SINGLE_LOCK_ONLY_DROPIN_REINSTALL"
          and req["financial_authorized"] is False and req["public_activation_authorized"] is False,
          "REVIEW_PACKET_FIELDS_DRIFT")
    for filename,sha in EXPECTED.items():
        check(digest(R/filename)==sha,"INPUT_SHA_"+filename)
        check((R/filename).lstat().st_uid==0 and stat.S_IMODE((R/filename).lstat().st_mode)==0o400,"INPUT_PERMS_"+filename)
    check(digest("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v20.py")=="7d432066f370b9eeb7f931f2143a12f2695177e6c174775b4400617e00909c4c","V20_SOURCE_SHA")
    check_physical(True)
    require_native_steam_quiescent(unit("aoe2war-steam-egress-refresh.service"))
    before_sandbox_raw=cmdcheck(["systemctl","show","aoe2war-steam-egress-refresh.service",
      "-p","NoNewPrivileges","-p","PrivateTmp","-p","ProtectHome",
      "-p","CapabilityBoundingSet","-p","RestrictAddressFamilies","-p","ProtectSystem"],12)
    before_sandbox=dict(x.split("=",1) for x in before_sandbox_raw.splitlines() if "=" in x)
    check(before_sandbox.get("NoNewPrivileges")=="yes" and
      before_sandbox.get("PrivateTmp")=="yes" and
      before_sandbox.get("ProtectHome")=="yes" and
      before_sandbox.get("ProtectSystem")=="strict" and
      before_sandbox.get("CapabilityBoundingSet")=="cap_setgid cap_setuid cap_net_admin" and
      before_sandbox.get("RestrictAddressFamilies")=="AF_INET AF_INET6 AF_NETLINK AF_UNIX",
      "CURRENT_SOURCES_SANDBOX_BASELINE_"+repr(before_sandbox))
    process_conflicts()
    evidence=witness()
    require_real_lease_headroom(evidence["leases"])
    check((datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(evidence["at_utc"])).total_seconds()<90,"PROVIDER_WITNESS_STALE")
    pass_step("FRESH_ONE_USE_INSTALL_PREFLIGHT",evidence=evidence)
    check(datetime.datetime.now(datetime.timezone.utc)<expires-datetime.timedelta(seconds=120),"EXPIRES_WITHIN_120S")
    marker={"schema":"aoe2war.b.v22.install.one-use-consumed.v1","request_sha256":REQ_SHA,
       "nonce":req["nonce"],"at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
       "state":"ONE_USE_CONSUMED_INTENT_FAIL_SHUT_ON_ANY_LATER_ERROR",
       "source_sha256":EXPECTED["v22-source.py"],"stage_sha256":EXPECTED["stage-event-0003.json"],
       "provider_witness":evidence,"finance_authorized":False,"public_3032_restart_authorized":False}
    record_intent(marker)
    pass_step("ONE_USE_INSTALL_CONSUMED",receipt=str(INTENT))
    # EXACT permitted transaction. Stop only existing Steam timer.
    cmdcheck(["systemctl","stop","aoe2war-steam-egress-refresh.timer"],30)
    check(unit("aoe2war-steam-egress-refresh.timer")["ActiveState"]=="inactive","TIMER_NOT_STOPPED")
    check(unit("aoe2war-steam-egress-refresh.service")["ActiveState"]=="inactive","ONESHOT_STILL_EXECUTING")
    pass_step("V20_TIMER_QUIESCED")
    # Existing V22 root and forensic source, inode and V20 inverse MUST remain untouched.
    check(digest(V22SRC)==EXPECTED["v22-source.py"],"EXISTING_V22_SOURCE_DRIFT")
    os.mkdir(DROP_DIR,0o755)
    os.chmod(DROP_DIR,0o755)
    fd=os.open(DROP_FILE,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
    with os.fdopen(fd,"wb") as f:f.write(DROP_BYTES);f.flush();os.fsync(f.fileno())
    os.chmod(DROP_FILE,0o644)
    check(digest(DROP_FILE)==DROP_SHA,"DROPIN_SHA")
    d=os.open(DROP_DIR,os.O_RDONLY|os.O_DIRECTORY);os.fsync(d);os.close(d)
    pass_step("EXACT_ONE_LOCK_FILE_DROPIN_INSTALLED",sha256=DROP_SHA)
    check(digest(STEAM_UNIT)==EXPECTED["original-v20-timer.service"],"V20_UNIT_MUTATED_DURING_PREP")
    payload=(R/"candidate-v22-timer.service").read_bytes()
    tmp=STEAM_UNIT.with_name(".aoe2war-v22-unit-once-"+req["nonce"][:12])
    fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
    with os.fdopen(fd,"wb") as f:f.write(payload);f.flush();os.fsync(f.fileno())
    os.chmod(tmp,0o644)
    check(digest(tmp)==EXPECTED["candidate-v22-timer.service"],"TEMP_SOURCE_NOT_EXACT")
    os.replace(tmp,STEAM_UNIT)
    d=os.open("/etc/systemd/system",os.O_RDONLY|os.O_DIRECTORY);os.fsync(d);os.close(d)
    check(digest(STEAM_UNIT)==EXPECTED["candidate-v22-timer.service"],"NEW_UNIT_SHA")
    pass_step("V22_SOURCE_UNIT_STAGED_TIMER_INACTIVE")
    # Single separate V22-install-phase manager reload admitted by Central.
    cmdcheck(["systemctl","daemon-reload"],60)
    pass_step("ONE_INSTALL_PHASE_DAEMON_RELOAD")
    props=cmdcheck(["systemctl","show","aoe2war-steam-egress-refresh.service",
      "-p","ProtectSystem","-p","ReadWritePaths","-p","DropInPaths","-p","NeedDaemonReload",
      "-p","NoNewPrivileges","-p","PrivateTmp","-p","ProtectHome",
      "-p","CapabilityBoundingSet","-p","RestrictAddressFamilies","-p","ExecStart"],12)
    live=dict(line.split("=",1) for line in props.splitlines() if "=" in line)
    check(live.get("ProtectSystem")=="strict" and
          live.get("ReadWritePaths")==str(DEST/"steam-refresh-v22.lock") and
          live.get("DropInPaths")==str(DROP_FILE) and
          live.get("NeedDaemonReload")=="no" and
          all(live.get(key)==value for key,value in before_sandbox.items()) and
          "/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_two_web_builds_v22.py --phase refresh" in live.get("ExecStart",""),
          "EFFECTIVE_SANDBOX_SCOPE_"+repr(live))
    pass_step("EFFECTIVE_UNIT_SANDBOX_SCOPE",properties=live)
    check_physical(False)
    check(unit("aoe2war-steam-egress-refresh.timer")["ActiveState"]=="inactive","TIMER_UNEXPECTED_START")
    # No direct candidate enrollment or 3032 restart.
    selftest=cmdcheck(["/usr/bin/python3","-I","-B",str(V22SRC),"--phase","selftest"],65)
    pass_step("V22_SELFTEST",output=selftest.strip()[-350:])
    enrolled=cmdcheck(["/usr/bin/python3","-I","-B",str(V22SRC),"--phase","enroll","--profile","rollback"],90)
    check("PASS_EXACT_STEAM_V22_DUAL_BUILD_ADMISSION" in enrolled,"ORIGINAL_PROFILE_NOT_ENROLLED")
    pass_step("V22_ORIGINAL_ONLY_ENROLLED",output=enrolled.strip()[-1300:])
    cmdcheck(["systemctl","start","aoe2war-steam-egress-refresh.timer"],35)
    check(unit("aoe2war-steam-egress-refresh.timer")["ActiveState"]=="active","TIMER_NOT_RESUMED")
    check_physical(False)
    ins=cmdcheck(["/usr/bin/python3","-I","-B",str(V22SRC),"--phase","inspect"],65)
    pass_step("V22_ORIGINAL_RUNTIME_PROTECTED_INSPECT",output=ins.strip()[-1300:])
    # Native V22 refresh, no synthetic lease or firewall write.
    cmdcheck(["systemctl","start","aoe2war-steam-egress-refresh.service"],180)
    check(unit("aoe2war-steam-egress-refresh.service")["ActiveState"]=="inactive","STEAM_ONESHOT_NOT_COMPLETED")
    check_physical(False)
    evidence_after=witness()
    check(digest(DROP_FILE)==DROP_SHA and digest(DEST/"original-steam-v20.service")==EXPECTED["original-v20-timer.service"],"POSTFLIGHT_ROLLBACK_INVERSE_OR_DROPIN")
    pass_step("REPAIRED_V22_NATIVE_INSTALL_COMPLETE",v22_sha256=digest(V22SRC),unit_sha256=digest(STEAM_UNIT),dropin_sha256=DROP_SHA,steam=evidence_after,finance_quarantined=True,public_3032_pid=701398,rollback_3030_pid=2625090,staged_not_activated=True,receipt=str(INTENT))


import datetime as _dt
APPROVAL_SCHEMA="aoe2war.central.install-only-admission.v1"
APPROVAL_DECISION="CENTRAL_INSTALL_ONLY_APPROVED"
EXACT_OPERATION="ONE_NEW_B_PHASE_STEAM_V22_BASE_UNIT_AND_SINGLE_LOCK_ONLY_DROPIN_REINSTALL"
APPROVAL_KEYS=frozenset({"schema","decision","request_sha256","executor_sha256",
 "nonce_sha256","host","boot_id","operation","expires_utc","one_use",
 "max_manager_reloads","financial_authorized","public_activation_authorized"})
def approval_fields(req,request_sha,executor_sha):
    return {"schema":APPROVAL_SCHEMA,"decision":APPROVAL_DECISION,
      "request_sha256":request_sha,"executor_sha256":executor_sha,
      "nonce_sha256":hashlib.sha256(req["nonce"].encode()).hexdigest(),
      "host":"ubuntu-4gb-hel1-11","boot_id":req["boot_id"],
      "operation":EXACT_OPERATION,"one_use":True,"max_manager_reloads":1,
      "financial_authorized":False,"public_activation_authorized":False}
def validate_central_approval(req,request_sha,executor_sha,comment,now=None):
    """Pure negative-testable real-GitHub Central decision validation."""
    now=now or _dt.datetime.now(_dt.timezone.utc)
    check(comment.get("id") is not None and
       comment.get("user",{}).get("login")=="Emaren" and
       comment.get("html_url")=="https://github.com/Emaren/app-prodn/pull/1316#issuecomment-"+str(comment["id"]),
       "CENTRAL_GITHUB_COMMENT_IDENTITY")
    check(comment.get("updated_at")==comment.get("created_at"),"CENTRAL_COMMENT_EDITED")
    created=_dt.datetime.fromisoformat(comment["created_at"].replace("Z","+00:00"))
    check(created<=now and (now-created).total_seconds()<=2700,"CENTRAL_COMMENT_NOT_FRESH")
    body=comment.get("body","")
    ticks=chr(96)*3
    matches=re.findall(re.escape(ticks)+r"json\s*(\{.*?\})\s*"+re.escape(ticks),body,flags=re.S)
    check(len(matches)==1,"CENTRAL_APPROVAL_FORMAT")
    approval=json.loads(matches[0])
    check(set(approval)==APPROVAL_KEYS,"CENTRAL_APPROVAL_FIELDS")
    expected=approval_fields(req,request_sha,executor_sha)
    check(all(type(approval[k])==type(v) and approval[k]==v for k,v in expected.items()),
          "CENTRAL_APPROVAL_SCOPE_HASH_NONCE_OR_DENIAL")
    permitted_until=_dt.datetime.fromisoformat(approval["expires_utc"].replace("Z","+00:00"))
    request_until=_dt.datetime.fromisoformat(req["expires_utc"].replace("Z","+00:00"))
    check(created<=permitted_until<=request_until and
          now<permitted_until-_dt.timedelta(seconds=120) and
          now<request_until-_dt.timedelta(seconds=120),
          "CENTRAL_OR_REQUEST_EXPIRY")
    return approval
def central_comment_from_github(comment_id):
    check(re.fullmatch(r"[1-9][0-9]{6,16}",str(comment_id)) is not None,
          "CENTRAL_COMMENT_ID_INVALID")
    url="https://api.github.com/repos/Emaren/app-prodn/issues/comments/"+str(comment_id)
    raw,_,_=run(["curl","--silent","--show-error","--fail-with-body",
       "--noproxy","*","--max-time","12",
       "--header","Accept: application/vnd.github+json",url],timeout=16)
    check(len(raw)<131072,"CENTRAL_COMMENT_TOO_LARGE")
    return json.loads(raw)
def explicit_execution_entry(argv=None):
    """No argument, import, and ordinary review NEVER call main_install."""
    global REQ,REQ_SHA,INTENT,AUTHORIZATION_CTX
    argv=list(sys.argv[1:] if argv is None else argv)
    if not argv:
        print("HOLD:REVIEW_ONLY_NO_EXPLICIT_EXECUTION",flush=True)
        return 3
    parser=argparse.ArgumentParser(description="One-use CENTRAL-admitted Steam V22 installation")
    parser.add_argument("--execute",action="store_true")
    parser.add_argument("--request",required=True)
    parser.add_argument("--request-sha",required=True)
    parser.add_argument("--central-approval-comment-id",required=True)
    args=parser.parse_args(argv)
    check(args.execute,"EXECUTE_FLAG_ABSENT")
    check(re.fullmatch(r"[a-f0-9]{64}",args.request_sha) is not None,"REQUEST_SHA_ARGUMENT")
    check(re.fullmatch(r"[1-9][0-9]{6,16}",args.central_approval_comment_id) is not None,
          "CENTRAL_COMMENT_ID")
    check(os.geteuid()==0,"ROOT_REQUIRED")
    src=Path(__file__)
    st=src.lstat()
    check(src.parent==Path("/root") and src.name.startswith("aoe2war-b-v22-reviewed-executor-") and
          src.name.endswith(".py") and stat.S_ISREG(st.st_mode) and
          st.st_uid==0 and st.st_nlink==1 and
          stat.S_IMODE(st.st_mode)==0o400,"EXECUTOR_ROOT_STORAGE_PREIMAGE")
    executor_sha=digest(src)
    check(src.name=="aoe2war-b-v22-reviewed-executor-"+executor_sha[:12]+".py",
          "EXECUTOR_FILE_SHA_NAME")
    path=Path(args.request)
    check(path.parent==Path("/root") and
          re.fullmatch(r"aoe2war-b-v22-lock-only-reinstall-review-request-[a-f0-9]{12}\.json",path.name)
          is not None,"UNAPPROVED_REQUEST_PATH")
    st=path.lstat()
    check(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and
          stat.S_IMODE(st.st_mode)==0o600,"REQUEST_ROOT_PREIMAGE")
    check(digest(path)==args.request_sha,"REQUEST_PINNED_SHA")
    req=json.loads(path.read_text())
    check(re.fullmatch(r"[a-f0-9]{40}",req["nonce"]) is not None and
          path.name.endswith(req["nonce"][:12]+".json"),"REQUEST_NONCE_PATH_BINDING")
    intent=Path("/root/aoe2war-b-v22-single-lock-reinstall-consumed-"+req["nonce"][:12]+".json")
    require_unconsumed(intent)
    comment=central_comment_from_github(args.central_approval_comment_id)
    approval=validate_central_approval(req,args.request_sha,executor_sha,comment)
    REQ=path;REQ_SHA=args.request_sha;INTENT=intent;AUTHORIZATION_CTX=approval
    try:
        main_install()
    except Exception as ex:
        print("HOLD:V22_INSTALL_TRANSACTION "+str(ex)[:340],flush=True)
        print("HOLD:NO_REPLAY_NO_UNAPPROVED_INVERSE_NO_3032_ACTIVATION",flush=True)
        return 3
    return 0

if __name__=="__main__":
    try:
        raise SystemExit(explicit_execution_entry())
    except Exception as exc:
        print("HOLD:NOT_ADMITTED "+str(exc)[:300],flush=True)
        raise SystemExit(3)
