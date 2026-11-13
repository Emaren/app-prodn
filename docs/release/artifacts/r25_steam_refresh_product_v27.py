#!/usr/bin/python3
"""Steam HTTPS nft egress renewal for only existing web UID 990.

PRODUCT maintenance ONLY. No PostgreSQL, payments, financial service changes,
new listeners, Steam tokens, TLS bypasses, or broad firewall policy. Root unit
runs CAP_NET_ADMIN+CAP_SETUID+CAP_SETGID, NNP=1. Does not relax W1 masks.
"""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

SOURCE=Path("/usr/local/lib/aoe2war-web-prod/r25_c_start_root.py")
SOURCE_SHA="9799d8c9042dbd1875a2096ee1df6b8751347206cf8761d695aecf1e61894707"
WEB_UNIT=Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
BASE_WEB_UNIT=Path("/var/lib/aoe2war-product-release-v1/2a5544f855dc/factory-web-unit.service")
BASE_WEB_UNIT_SHA="ecfada72f510d5737200b199911acd239cdab50e4bda41aad27296c9377f1fc3"
BASE_WEB_DIR="/var/lib/aoe2war-web-prod-2a5544f855dc"
STEAM_UNIT=Path("/etc/systemd/system/aoe2war-steam-egress-refresh.service")
STEAM_UNIT_SHA="44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a"
FIN_MASKS=(
 "aoe2hdbets-bet-stake-reconcile.service",
 "aoe2hdbets-bet-stake-reconcile.timer",
 "aoe2hdbets-staking-rewards.service",
 "aoe2hdbets-staking-rewards.timer",
 "wolochain-mainnet-settlement.service",
 "wolochain-founder-rewards-settlement.service",
)
PROTECTED_SERVICES=(
 "aoe2hdbets-web.service",
 "r25-c03-emergency-3033.service",
 "kingdom-traders-paper.service",
 "wolochaind-mainnet.service",
)
NFT_SHAPE_SHA="985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af"
LOCK=Path("/etc/aoe2war/web-prod-v22/steam-refresh-v22.lock")
NAMES=("steam4","steam6")

def need(ok,code):
    if not ok: raise RuntimeError(code)
def sha(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for p in iter(lambda:f.read(2*1024*1024),b""):h.update(p)
    return h.hexdigest()
def pin(path,digest):
    s=path.lstat()
    need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and
         not(path.is_symlink()) and not (stat.S_IMODE(s.st_mode)&0o022),
         "PINNED_SOURCE_OWNER_MODE_DRIFT")
    need(sha(path)==digest,"PINNED_SOURCE_SHA_DRIFT")
def output(*args):
    p=subprocess.run(args,capture_output=True,text=True,timeout=12)
    need(p.returncode==0,"READ_ONLY_QUERY_FAILED")
    return p.stdout.strip()
def show(unit,field):
    return output("/usr/bin/systemctl","show",unit,"-p",field,"--value")
def guarded_marker(path,maxsize=128):
    s=path.lstat()
    need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1
         and not path.is_symlink() and not(stat.S_IMODE(s.st_mode)&0o022)
         and 0<s.st_size<=maxsize,"RELEASE_MARKER_UNTRUSTED")
    return path.read_text().strip()

def unit_path_only_diff(installed,baseline,runtime):
    need(re.fullmatch(r"/var/lib/aoe2war-web-prod-[0-9a-f]{12}",runtime) is not None,
         "WEB_RUNTIME_PATH_UNTRUSTED")
    needle=runtime.encode()
    original=BASE_WEB_DIR.encode()
    need(baseline.count(original)==4 and installed.count(needle)==4 and
         installed.replace(needle,original)==baseline,"WEB_UNIT_SECURITY_PROFILE_CHANGED")
    return True

def attest_web_unit_from_root_preimage():
    pin(BASE_WEB_UNIT,BASE_WEB_UNIT_SHA)
    pin(WEB_UNIT,sha(WEB_UNIT))
    # The already-admitted original Factory unit is the immutable security
    # profile. A new release may replace only its four runtime path references.
    installed=WEB_UNIT.read_bytes()
    baseline=BASE_WEB_UNIT.read_bytes()
    runtime=show("aoe2hdbets-web-prod.service","WorkingDirectory")
    unit_path_only_diff(installed,baseline,runtime)
    need(show("aoe2hdbets-web-prod.service","NeedDaemonReload")=="no" and
         show("aoe2hdbets-web-prod.service","ActiveState")=="active" and
         show("aoe2hdbets-web-prod.service","User")=="aoe2war-web-prod" and
         show("aoe2hdbets-web-prod.service","Group")=="aoe2war-web-prod" and
         show("aoe2hdbets-web-prod.service","MemoryMax")=="3355443200",
         "WEB_LOADED_SANDBOX_OR_IDENTITY_DRIFT")
    root=Path(runtime)
    s=root.lstat()
    need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not root.is_symlink() and
         not (stat.S_IMODE(s.st_mode)&0o022),"WEB_RUNTIME_DIRECTORY_UNTRUSTED")
    source=guarded_marker(root/".aoe2war-source-sha")
    build=guarded_marker(root/".next/BUILD_ID")
    need(re.fullmatch(r"[a-f0-9]{40}",source) is not None and
         source.startswith(root.name.removeprefix("aoe2war-web-prod-")) and
         re.fullmatch(r"[A-Za-z0-9_-]{8,64}",build) is not None,
         "WEB_RUNTIME_SOURCE_BUILD_IDENTITY")
    pid=show("aoe2hdbets-web-prod.service","MainPID")
    need(pid.isdecimal() and int(pid)>100 and
         (Path("/proc")/pid).stat().st_uid==990,"WEB_UID_OR_PID_DRIFT")
    return (pid,source,build,runtime)

def guard_site_and_finance():
    pin(STEAM_UNIT,STEAM_UNIT_SHA)
    pin(SOURCE,SOURCE_SHA)
    identity=attest_web_unit_from_root_preimage()
    protected=[]
    for unit in PROTECTED_SERVICES:
        pid=show(unit,"MainPID")
        need(pid.isdecimal() and int(pid)>100 and
             show(unit,"ActiveState")=="active",
             "OTHER_PROTECTED_SERVICE_NOT_ACTIVE")
        protected.append((unit,pid))
    for unit in FIN_MASKS:
        p=subprocess.run(["/usr/bin/systemctl","is-enabled",unit],
                         capture_output=True,text=True,timeout=10)
        need(p.stdout.strip()=="masked" and p.returncode in (0,1),
             "FINANCIAL_UNIT_NOT_MASKED")
    p=subprocess.run(["/usr/bin/ss","-H","-ltn"],
                     capture_output=True,text=True,timeout=10)
    need(p.returncode==0,"FINANCIAL_SOCKET_CENSUS_FAILED")
    for row in p.stdout.splitlines():
        f=row.split()
        if len(f)>=4:
            need(not any(f[3].endswith(":"+str(port)) for port in range(8092,8096)),
                 "FINANCIAL_LISTENER_OPEN")
    # C03 is a separate FINANCIAL admission monitor: it is NOT a website or
    # Steam-transport release authority. Never unmask, restart or suppress it.
    return (identity,tuple(protected))

def original_source():
    spec=importlib.util.spec_from_file_location("pinned_steam_egress_primitives",SOURCE)
    need(spec is not None and spec.loader is not None,"PRIMITIVE_MODULE_UNAVAILABLE")
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    need(m.PROD_STEAM=="steamcommunity.com" and
         m.PROD_UID==990 and m.PROD_GID==984,
         "STEAM_PRIMITIVE_AUTHORITY_DRIFT")
    return m
def exact_nft(m):
    need(m.production_nft_shape()==NFT_SHAPE_SHA,
         "STEAM_FIREWALL_RULE_SHAPE_DRIFT")
def observe(m):
    for i in range(3):
        try:return m.production_live_steam_entries()
        except m.Hold as e:
            if str(e)!="STEAM_SET_UNBOUNDED_OR_EXPIRED" or i==2:raise
            import time;time.sleep(0.25)
    raise RuntimeError("STEAM_SET_INCOMPLETE")
def plan(m,validated,existing):
    checked=[ipaddress.ip_address(s) for s in validated]
    need(all(ip.is_global and not ip.is_multicast for ip in checked)
         and 0<len(set(map(str,checked)))==len(checked)<=16,
         "TLS_VERIFIED_DESTINATION_BOUNDS")
    need(set(existing)==set(NAMES) and
         len(set(existing["steam4"])|set(existing["steam6"])|set(validated))<=16,
         "STEAM_SET_MAX_MEMBERS")
    actions=[]
    for name,ver in (("steam4",4),("steam6",6)):
        fresh=sorted(str(p) for p in checked if p.version==ver)
        overlap=sorted(set(fresh)&set(existing[name]))
        if overlap:
            actions.append("delete element inet aoe2war_web_prod "+name+
                           " { "+", ".join(overlap)+" }")
        if fresh:
            actions.append("add element inet aoe2war_web_prod "+name+
                           " { "+", ".join(x+" timeout 300s" for x in fresh)+" }")
    need(1<=len(actions)<=4 and sum(map(len,actions))<8192,
         "STEAM_ATOMIC_RENEWAL_BOUNDS")
    return actions
def capabilities():
    need(os.geteuid()==0,"ROOT_SERVICE_REQUIRED")
    fields=dict((line.split(":",1)[0],line.split(":",1)[1].strip())
                for line in Path("/proc/self/status").read_text().splitlines()
                if ":" in line)
    have=int(fields["CapEff"],16)
    expected=(1<<12)|(1<<6)|(1<<7)
    need(fields.get("NoNewPrivs")=="1" and have==expected,
         "SERVICE_CAPABILITIES_NOT_EXACT")

def refresh():
    capabilities()
    fd=os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW)
    try:
        s=os.fstat(fd)
        need(s.st_uid==0 and stat.S_IMODE(s.st_mode)==0o600 and
             stat.S_ISREG(s.st_mode),"LOCK_IDENTITY")
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        web_identity=guard_site_and_finance()
        m=original_source()
        exact_nft(m)
        validated=m.production_steam_dns_diversity(m.production_steam_addresses())
        current=observe(m)
        actions=plan(m,validated,current)
        need(guard_site_and_finance()==web_identity,"PRE_WRITE_DRIFT")
        exact_nft(m)
        # One nftables netlink transaction: delete+readd only CA verified
        # Steam IPs for the same five-minute owner-UID-990 sets. No flush,
        # table/chain/rule change, whitelist expansion or perpetual lease.
        batch=("\n".join(actions)+"\n").encode()
        verified=subprocess.run(["/usr/sbin/nft","-c","-f","-"],
             input=batch,capture_output=True,timeout=10)
        need(verified.returncode==0,"STEAM_ATOMIC_BATCH_SYNTAX")
        p=subprocess.run(["/usr/sbin/nft","-f","-"],
             input=batch,capture_output=True,timeout=10)
        need(p.returncode==0,"STEAM_ATOMIC_BATCH_REJECTED")
        exact_nft(m)
        after=observe(m)
        need(set(validated).issubset(after["steam4"]|after["steam6"]),
             "STEAM_TLS_VERIFIED_IP_NOT_ALLOWED")
        need(guard_site_and_finance()==web_identity,"POST_WRITE_DRIFT")
        print(json.dumps({"status":"PASS_STEAM_ONLY_UID990_RENEWAL",
          "schema":"aoe2war.steam.product.compat.v27",
          "build_id":web_identity[0][2],"tls_verified_addresses":len(validated),
          "nft_atomic_commands":len(actions),"ttl_seconds":300,
          "financial_authorized":False,"web_restarted":False},sort_keys=True))
    finally:os.close(fd)

def inspect():
    identity=guard_site_and_finance()[0]
    m=original_source()
    exact_nft(m)
    print(json.dumps({"status":"PASS_STEAM_SOURCE_ONLY_PRECHECK",
       "web_pid":identity[0],"build":identity[2],"source":identity[1],"financial_authorized":False},sort_keys=True))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--phase",required=True,choices=("inspect","refresh"))
    args=p.parse_args()
    try:
        (inspect if args.phase=="inspect" else refresh)()
    except Exception as e:
        s=str(e)
        if not re.fullmatch(r"[A-Z0-9_]{4,100}",s):s="NONIDENTIFYING_"+type(e).__name__.upper()
        print(json.dumps({"status":"HOLD_STEAM_PRODUCT_COMPAT_V27",
              "reason":s,"financial_authorized":False},sort_keys=True))
        sys.exit(3)
