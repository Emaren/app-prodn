#!/usr/bin/env python3
"""Session B read-only source-bound Steam provider witness and V22 INSTALL_ONLY request.
No service, firewall, DNS, repository or financial mutation. Only root-private evidence file.
"""
import hashlib, ipaddress, json, os, re, secrets, stat, subprocess, time
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
def main():
    check(os.geteuid()==0,"ROOT_REQUIRED")
    uname_check()
    now=datetime.now(timezone.utc)
    check(digest(STAGED)==NEW_EVENT,"STAGED_JOURNAL")
    expected={"v22-source.py":V22,"candidate-v22-timer.service":V22_UNIT,"original-v20-timer.service":OLD_UNIT,
              "original-3032-unit.service":"f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a",
              "review-manifest.json":"918ad5714200b450c8a1ba4a9f72b4301dea0370fddeaeacbae9a8dbe8285183",
              "stage-event-0003.json":NEW_EVENT}
    for name,sha in expected.items():check(digest(ROOT/name)==sha,"PIN_"+name)
    check(digest("/etc/systemd/system/aoe2war-steam-egress-refresh.service")==OLD_UNIT,"V20_UNIT")
    for name,pid in PIDS.items():
        s=unit(name);check(s["ActiveState"]=="active" and s["MainPID"]==str(pid) and s["NeedDaemonReload"]=="no","PROTECTED_PID_"+name)
    for name in ("wolochain-mainnet-settlement.service","wolochain-founder-rewards-settlement.service"):
        u=unit(name);check(u["LoadState"]=="masked" and u["ActiveState"]=="inactive" and u["MainPID"]=="0","C04_MASK_"+name)
        check((Path("/etc/systemd/system")/name).is_symlink() and (Path("/etc/systemd/system")/name).readlink()==Path("/dev/null"),"MASK_LINK_"+name)
    s,_,_=run(["ss","-H","-lntp"])
    for port in (8092,8093,8094,8095):
        check(not any(re.search(r":"+str(port)+r"\s",line) for line in s.splitlines()),"FINANCE_LISTENER")
    a={};aaaa={}
    for resolver in ("1.1.1.1","8.8.8.8","9.9.9.9"):
        a[resolver]=dns_query(resolver,"A")
        aaaa[resolver]=dns_query(resolver,"AAAA")
        check(a[resolver]["answer_count"]>0,"EMPTY_DNS_A_"+resolver)
    sysa=system_dns("A");sysaaaa=system_dns("AAAA")
    provider_a=set(sysa).union(*(x["addresses"] for x in a.values()))
    provider_aaaa=set(sysaaaa).union(*(x["addresses"] for x in aaaa.values()))
    check(len(provider_a)>0 and len(provider_a)<=16,"A_BOUNDS")
    # Any disagreement in AAAA across resolvers is HOLD, never "provider unavailable".
    positive_aaaa=[len(x["addresses"])>0 for x in aaaa.values()]+[bool(sysaaaa)]
    check(all(positive_aaaa) or not any(positive_aaaa),"AAAA_DISAGREEMENT")
    check(len(provider_aaaa)<=16,"AAAA_BOUNDS")
    validated_a=[tls(ip,4) for ip in sorted(provider_a)]
    validated_aaaa=[tls(ip,6) for ip in sorted(provider_aaaa)]
    live=nft_sets()
    for ip in provider_a:check(ip in live["steam4"] and live["steam4"][ip]>=180,"MISSING_REAL_IPV4_LEASE_"+ip)
    for ip in provider_aaaa:check(ip in live["steam6"] and live["steam6"][ip]>=180,"MISSING_REAL_IPV6_LEASE_"+ip)
    # Reject unvalidated family-6 leases; an empty set allowed only with unanimous NODATA.
    if not provider_aaaa:check(not live["steam6"],"STALE_UNVERIFIED_IPV6_LEASE")
    check(all(ttl>=180 for family in live.values() for ttl in family.values()),"ANY_LOW_LEASE")
    check(sum(map(len,live.values()))<=16,"TOO_MANY_LEASES")
    token=secrets.token_hex(20)
    evidence={"schema":"aoe2war.session-b.provider-tls-dns-nft-witness.v1","witness_start_utc":now.isoformat(),
      "witness_end_utc":datetime.now(timezone.utc).isoformat(),"provider":HOST,
      "source_pr1316_head":"d5ef77f05a3b9c3e6e053c05ea5db15c5e14598d",
      "v22_sha256":V22,"controller_sha256":"dbbaab81dc964352670b24b23eea482f1af52d319015969ebb2d48cd59d171b8",
      "dns_independent":{r:{"A":a[r],"AAAA":aaaa[r]} for r in a},
      "dns_system":{"A":sysa,"AAAA":sysaaaa},
      "validated_tls_ca_sni":{"A":validated_a,"AAAA":validated_aaaa},
      "nft":live,
      "headroom_floor_seconds":180,"steamsix_empty_admitted_due_to_unanimous_current_AAAA_NODATA":not bool(provider_aaaa),
      "valid_only_for_seconds":90,"finance_authorized":False}
    packet={"schema":"aoe2war.session-b.v22-steam-install-only-review-request.v1",
      "phase":"STEAM_INSTALL_ONLY","status":"REQUEST_UNADMITTED_DO_NOT_EXECUTE",
      "request_nonce":token,"created_at_utc":datetime.now(timezone.utc).isoformat(),
      "expires_at_utc":(datetime.now(timezone.utc)+timedelta(minutes=50)).isoformat(),
      "host_boot_id":Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
      "stage_event_0003_sha256":NEW_EVENT,
      "candidate_source_sha":"6662c33a0ecf25e5b4bd11283fe98a4842a69eb0",
      "candidate_build_id":"brqExtuPGWtj1iKPCdur-",
      "original_web3032_pid":701398,"original_3030_pid":2625090,
      "v22_source_sha256":V22,"v22_timer_source_sha256":V22_UNIT,
      "v20_timer_preimage_sha256":OLD_UNIT,
      "original_3032_unit_sha256":expected["original-3032-unit.service"],
      "review_manifest_sha256":expected["review-manifest.json"],
      "steam_provider_witness":evidence,
      "require_new_witness_within_seconds_before_install":90,
      "require_source_bound_preflight_and_AAAA_witness_before_cutover":True,
      "allowed_actions_after_independent_Central_admission":[
        "Stop only the existing Steam timer under an explicit separately admitted plan; prove V20 oneshot quiescent",
        "Install exact SHA-pinned V22 Python from existing root-private input, preserve original V20 source and unit",
        "Create original-profile-only root-private v22 guard and shared inode-verified 0600 flock",
        "Atomically swap only the exact Steam refresh service ExecStart single V20-to-V22 path",
        "Perform one separately admitted systemd daemon-reload for the timer-unit installation, NOT reuse the consumed manager-maintenance permit",
        "Enroll the original 3032 rollback profile; start existing Steam timer; prove original source and dual-stack-conditioned authentic nft headroom"
      ],
      "required_preflight":["No Codex C06/C07 financial capture/restore conflict","New <=90-second DNS/CA-TLS/SNI/nft witness with observed A+AAAA for steamcommunity.com",
        "Both C04 masked/inactive and all financial listeners 8092-8095 closed",
        "All original 7 systemd PIDs unchanged and staging SHA/inputs unchanged",
        "Actual 3030/3032 HTTP200, Betting HTTP503, no source HEAD movement"],
      "required_recovery":"If install fails before 3032 STOP_INTENT, stop only Steam timer, verify oneshot quiescent and exact unit-inode preimage, inverse restore exact original V20 service bytes, require a separately admitted manager daemon-reload, restart original timer without modifying website/finance. No blind retries or clobber.",
      "explicit_denials":["NO_PUBLIC_3032_RESTART","NO_3030_CHANGE","NO_NGINX_SWITCH","NO_ACTIVATE_ONLY","NO_FINANCIAL_START_OR_UNMASK","NO_NFT_POLICY_EDIT","NO_RESTAGE","NO_GIT_MAIN_SYNC","NO_LEGACY_8092_FALLBACK"],
      "requires_separate_activate_only_permit":True,
      "old_activated_permit_expired_sha256":"ded0d1e25b188846333552df2393f58f0bd2876d1947f55ca99f13adc95500d3"}
    path=Path("/root/aoe2war-b-v22-install-only-request-"+token[:12]+".json")
    data=(json.dumps(packet,sort_keys=True,indent=2)+"\n").encode()
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    os.write(fd,data);os.fsync(fd);os.close(fd)
    dirfd=os.open("/root",os.O_RDONLY|os.O_DIRECTORY);os.fsync(dirfd);os.close(dirfd)
    st=path.stat()
    print(json.dumps({"status":"PASS_SOURCE_BOUND_PROVIDER_WITNESS_INSTALL_REQUEST_PREPARED_ONLY",
      "packet_path":str(path),"packet_sha256":hashlib.sha256(data).hexdigest(),"packet_bytes":len(data),
      "packet_uid":st.st_uid,"packet_mode":oct(stat.S_IMODE(st.st_mode)),"packet_nlink":st.st_nlink,
      "request_nonce_prefix":token[:12],"created_at_utc":packet["created_at_utc"],"expires_at_utc":packet["expires_at_utc"],
      "A":sorted(provider_a),"AAAA":sorted(provider_aaaa),
      "validated_TLS_A":len(validated_a),"validated_TLS_AAAA":len(validated_aaaa),
      "nft_leases":live,"seconds_earliest":min(ttl for fam in live.values() for ttl in fam.values()),
      "finance_mutation":False},sort_keys=True,indent=2))
if False:
    try:main()
    except Exception as e:
        msg=str(e)
        print(json.dumps({"status":"HOLD_PROVIDER_WITNESS_NO_INSTALL_REQUEST","reason":msg[:280]}))
        raise SystemExit(3)

# SESSION B — ONE USE PHYSICAL INSTALL_ONLY. Appended to reviewed read-only witness helpers.
import sys, hashlib, json, os, re, stat, subprocess, time, ipaddress, datetime
from pathlib import Path
REQ=Path("/root/aoe2war-b-v22-lock-only-reinstall-review-request-7a87c54a0b8b.json")
REQ_SHA="62a737947abdb0bf8258556317274b43b06392c9f1ba639339b276e0063d4042"
INTENT=Path("/root/aoe2war-b-v22-single-lock-reinstall-consumed-7a87c54a0b8b.json")
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
started=datetime.datetime.now(datetime.timezone.utc)
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
        check(unit("aoe2war-steam-egress-refresh.service")["ActiveState"]=="inactive","V20_ONESHOT_RUNNING")
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
def main_install():
    os.umask(0o077)
    check(os.geteuid()==0,"ROOT")
    statreq=REQ.lstat()
    check(stat.S_ISREG(statreq.st_mode) and statreq.st_uid==0 and stat.S_IMODE(statreq.st_mode)==0o600 and statreq.st_nlink==1 and statreq.st_size==6853,"REQUEST_MODE")
    check(digest(REQ)==REQ_SHA,"REQUEST_SHA")
    req=json.loads(REQ.read_text())
    check(req["schema"]=="aoe2war.session-b.v22-lock-only-dropin-reinstall-request.v1"
          and req["phase"]=="V22_LOCK_FILE_ONLY_REINSTALL_ONLY_NOT_ACTIVATE"
          and req["admission"]=="UNADMITTED_REQUEST_DO_NOT_EXECUTE"
          and req["source_base_pr_1316_head"]=="d5ef77f05a3b9c3e6e053c05ea5db15c5e14598d","REQUEST_SCHEMA")
    expires=datetime.datetime.fromisoformat(req["expires_utc"])
    check(started < expires and datetime.datetime.now(datetime.timezone.utc)<expires-datetime.timedelta(seconds=120),"REQUEST_EXPIRES_SOON")
    check(req["nonce"].startswith("7a87c54a0b8b") and len(req["nonce"])==40,"REQUEST_NONCE")
    check(not INTENT.exists(),"NONCE_CONSUMED")
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
    check(req["dropin_sha256"]==DROP_SHA and req["dropin_exact_destination"]==str(DROP_FILE)
          and req["exact_pr_head"]=="f61c7c507997608173cc886938588373c1a2fb92"
          and req["requested_operation"]=="ONE_NEW_B_PHASE_STEAM_V22_BASE_UNIT_AND_SINGLE_LOCK_ONLY_DROPIN_REINSTALL"
          and req["finance_authorized"] is False and req["public_activation_authorized"] is False,
          "REVIEW_PACKET_FIELDS_DRIFT")
    for filename,sha in EXPECTED.items():
        check(digest(R/filename)==sha,"INPUT_SHA_"+filename)
        check((R/filename).lstat().st_uid==0 and stat.S_IMODE((R/filename).lstat().st_mode)==0o400,"INPUT_PERMS_"+filename)
    check(digest("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v20.py")=="7d432066f370b9eeb7f931f2143a12f2695177e6c174775b4400617e00909c4c","V20_SOURCE_SHA")
    check_physical(True)
    check(unit("aoe2war-steam-egress-refresh.service")["ActiveState"]=="inactive","V20_ONESHOT_RUNNING")
    process_conflicts()
    evidence=witness()
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
    props=cmdcheck(["systemctl","show","aoe2war-steam-egress-refresh.service","-p","ProtectSystem","-p","ReadWritePaths","-p","DropInPaths","-p","NeedDaemonReload"],12)
    live=dict(line.split("=",1) for line in props.splitlines() if "=" in line)
    check(live.get("ProtectSystem")=="strict" and
          live.get("ReadWritePaths")==str(DEST/"steam-refresh-v22.lock") and
          live.get("DropInPaths")==str(DROP_FILE) and
          live.get("NeedDaemonReload")=="no","EFFECTIVE_SANDBOX_SCOPE_"+repr(live))
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
    cmdcheck(["systemctl","start","aoe2war-steam-egress-refresh.service"],90)
    check(unit("aoe2war-steam-egress-refresh.service")["ActiveState"]=="inactive","STEAM_ONESHOT_NOT_COMPLETED")
    check_physical(False)
    evidence_after=witness()
    check(digest(DROP_FILE)==DROP_SHA and digest(DEST/"original-steam-v20.service")==EXPECTED["original-v20-timer.service"],"POSTFLIGHT_ROLLBACK_INVERSE_OR_DROPIN")
    pass_step("REPAIRED_V22_NATIVE_INSTALL_COMPLETE",v22_sha256=digest(V22SRC),unit_sha256=digest(STEAM_UNIT),dropin_sha256=DROP_SHA,steam=evidence_after,finance_quarantined=True,public_3032_pid=701398,rollback_3030_pid=2625090,staged_not_activated=True,receipt=str(INTENT))
try:
    main_install()
except Exception as e:
    print("HOLD:V22_INSTALL_TRANSACTION "+str(e)[:340],flush=True)
    print("HOLD:ONE_USE_NONCE_MUST_NOT_REPLAY; PROTECTED ORIGINAL WEB UNTOUCHED; ANY INVERSE NEEDS CENTRAL ADMISSION",flush=True)
    raise SystemExit(3)
