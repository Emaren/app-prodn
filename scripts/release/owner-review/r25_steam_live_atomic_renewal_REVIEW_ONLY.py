#!/usr/bin/env python3
"""Source-review-only, isolated Steam nft lease renewal maintenance.

Import/no args inert. --prepare creates an owner-root PRIVATE request, never
operates on systemd or nft. --execute requires a NEW independent Central GitHub
comment bound to exact executable/request/nonce/host/boot/expiry and may then
stop ONLY the V20 Steam TIMER, atomically renew same real TLS-verified members
in one nft transaction, then restore that timer. No website, finance or unit
change. Never run without a separately posted exact Central authority.
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import time

EXEC_SHA="fd5df6d05038566a6e836b5d56de6ce4b17e5faaa42dbedffe64095986e14da6"
EXEC_SOURCE=Path("/root/aoe2war-b-v22-reviewed-executor-fd5df6d05038.py")
HOST="ubuntu-4gb-hel1-11"
TIMER="aoe2war-steam-egress-refresh.timer"
SERVICE="aoe2war-steam-egress-refresh.service"
TABLE="aoe2war_web_prod"
STAGE_SHA="0be22cb597993307ab855443ae89e87dae25d542354e70474c98d5d673f87a45"
V20_UNIT_SHA="b976a10d5cc8b3c199974f1b85a912a67323e8b57b4f69325a1061428d20deb2"
TIMER_UNIT_SHA="d3f4ce6fbbf6b2aad826a57e10e62859b82ce6e175b0ac99e6c5aa6f776413fc"
PACKET_SCHEMA="aoe2war.session-b.steam-only-atomic-lease-maintenance-request.v1"
CENTRAL_SCHEMA="aoe2war.central.steam-lease-maintenance-admission.v1"
OPERATION="ONE_USE_V20_TIMER_QUIESCED_SAME_VERIFIED_IPS_NFT_ATOMIC_LEASE_RENEWAL_ONLY"
DECISION="CENTRAL_STEAM_LEASE_MAINTENANCE_APPROVED"
PK_PREFIX="/root/aoe2war-b-steam-lease-maintenance-request-"
INTENT_PREFIX="/root/aoe2war-b-steam-lease-maintenance-consumed-"
APPROVAL_KEYS=frozenset({
 "schema","decision","operation","packet_sha256","executor_sha256",
 "nonce_sha256","boot_id","host","expires_utc","one_use","nft_batch_limit",
 "financial_authorized","web_activation_authorized","v22_install_authorized",
 "manager_reload_authorized"
})
def check(ok,reason):
    if not ok:raise RuntimeError("HOLD:"+reason)
def sha(blob):return hashlib.sha256(blob).hexdigest()
def file_sha(path):return sha(Path(path).read_bytes())
def utc():return dt.datetime.now(dt.timezone.utc)
def parse_time(s):return dt.datetime.fromisoformat(str(s).replace("Z","+00:00"))
def root_file(path,mode,limit=32768):
    p=Path(path)
    st=p.lstat()
    check(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1
          and stat.S_IMODE(st.st_mode)==mode and st.st_size<=limit,
          "ROOT_FILE_OR_MODE_"+p.name)
    check(p.parent==Path("/root"),"NOT_ROOT_PRIVATE")
    return p.read_bytes()
def bound_process(argv,limit=35,stdin=None):
    p=subprocess.run(argv,input=stdin,text=True,capture_output=True,timeout=limit)
    check(p.returncode==0,"COMMAND_FAIL_"+argv[0]+"_"+p.stderr.strip()[-130:])
    return p.stdout
def reviewed():
    s=root_file(EXEC_SOURCE,0o400,40000)
    check(sha(s)==EXEC_SHA,"REVIEWED_INERT_EXECUTOR_SHA")
    spec=importlib.util.spec_from_file_location("b_imported_reviewed_inert",str(EXEC_SOURCE))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    check(module.AUTHORIZATION_CTX is None,"IMPORTED_EXECUTOR_NOT_INERT")
    return module
def nft_table():
    return json.loads(bound_process(["nft","-j","list","table","inet",TABLE],limit=15))["nftables"]
def static_shape(rows):
    fixed=[]
    for item in rows:
        if "metainfo" in item:continue
        obj=json.loads(json.dumps(item))
        if "set" in obj:obj["set"].pop("elem",None)
        if "rule" in obj:
            for entry in obj["rule"].get("expr",[]):
                if "counter" in entry:
                    entry["counter"].pop("packets",None)
                    entry["counter"].pop("bytes",None)
        fixed.append(obj)
    return fixed
def shape_sha():
    blob=json.dumps(static_shape(nft_table()),sort_keys=True,separators=(",",":")).encode()
    return sha(blob)
def provider(m):
    a={};aaaa={}
    for server in ("1.1.1.1","8.8.8.8","9.9.9.9"):
        a[server]=m.dns_query(server,"A")["addresses"]
        aaaa[server]=m.dns_query(server,"AAAA")["addresses"]
        check(bool(a[server]),"EMPTY_PUBLIC_A_"+server)
    ha=m.system_dns("A");h6=m.system_dns("AAAA")
    v4=sorted(set(ha).union(*(set(x) for x in a.values())))
    v6=sorted(set(h6).union(*(set(x) for x in aaaa.values())))
    check(bool(v4) and len(v4)+len(v6)<=16,"DNS_IP_SCOPE")
    check(all(bool(x) for x in [h6,*aaaa.values()]) or
          not any(bool(x) for x in [h6,*aaaa.values()]),
          "AAAA_RESOLVERS_DISAGREE")
    check(all(ipaddress.ip_address(x).is_global for x in v4+v6),"NONPUBLIC_ADDRESS")
    proof4=[m.tls(ip,4) for ip in v4]
    proof6=[m.tls(ip,6) for ip in v6]
    check(all(x["ca_verify_result"]==0 for x in proof4+proof6),"TLS_CA_FAILURE")
    sets=m.nft_sets()
    # Never extend stale unrelated or absent elements. An initial new Steam IP
    # must first be admitted by the natural V20 validated-only timer, not by us.
    check(set(sets["steam4"])==set(v4) and set(sets["steam6"])==set(v6),
          "STALE_OR_MISSING_PROVIDER_NFT_MEMBER")
    check(all(25<=ttl<=300 for fam in sets.values() for ttl in fam.values()),
          "TTL_TOO_CLOSE_TO_EXPIRY_FOR_ATOMIC_RENEWAL")
    return {"at_utc":utc().isoformat(),"DNS_A":a,"DNS_AAAA":aaaa,"host_A":ha,
            "host_AAAA":h6,"A":v4,"AAAA":v6,"tls_verified_count":len(proof4)+len(proof6),
            "lease_preimage":sets,"shape_sha256":shape_sha()}
def host_preflight(m):
    check(os.geteuid()==0,"ROOT")
    check(os.uname().nodename.split(".")[0]==HOST,"HOST_IDENTITY")
    check(m.check_physical(True),"PROTECTED_HOST_PHYSICAL")
    m.process_conflicts()
    check(file_sha("/etc/systemd/system/"+SERVICE)==V20_UNIT_SHA,"V20_SHA")
    check(file_sha("/etc/systemd/system/"+TIMER)==TIMER_UNIT_SHA,"TIMER_UNIT_SHA")
    check(file_sha("/var/lib/aoe2war-public-player-6662c33a-one-use-v1/events/0003.json")==STAGE_SHA,"STAGE_SHA")
    return {"boot_id":Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
            "seven_protected_pids":m.CRITICAL,"v20_unit_sha256":V20_UNIT_SHA,
            "timer_unit_sha256":TIMER_UNIT_SHA,"staged_event_sha256":STAGE_SHA,
            "finance_denied":True,"manager_reload_denied":True}
def protected_postflight(m):
    """Original V20 native service may run immediately after timer restoration.
    Preserve every protected boundary WITHOUT demanding that one-shot idle.
    """
    for name,pid in m.CRITICAL.items():
        state=m.unit(name)
        check(state["MainPID"]==str(pid) and state["ActiveState"]=="active"
              and state["NeedDaemonReload"]=="no"
              and bound_process(["systemctl","show",name,"-p","NRestarts","--value"],10).strip()=="0",
              "PROTECTED_PID_RESTART_"+name)
    for name in ("wolochain-mainnet-settlement.service",
                 "wolochain-founder-rewards-settlement.service"):
        state=m.unit(name)
        link=Path("/etc/systemd/system")/name
        check(state["LoadState"]=="masked" and state["ActiveState"]=="inactive"
              and state["MainPID"]=="0" and link.is_symlink() and
              os.readlink(link)=="/dev/null", "C04_MASK_"+name)
    listeners=bound_process(["ss","-H","-lntp"],limit=10)
    for port in (8092,8093,8094,8095):
        check(not any(re.search(r":"+str(port)+r"\\s",line)
                      for line in listeners.splitlines()),"FINANCE_PORT_"+str(port))
    for port,path,status in ((3030,"/players",200),(3032,"/players",200),(3032,"/api/bets",503)):
        result=bound_process(["curl","-sS","-m","12","-o","/dev/null",
                "-w","%{http_code}","http://127.0.0.1:"+str(port)+path],limit=16)
        check(result==str(status),"PROTECTED_HTTP_"+str(port)+path)
    check(file_sha("/etc/systemd/system/"+SERVICE)==V20_UNIT_SHA,"V20_UNIT_DRIFT")
    check(file_sha("/etc/systemd/system/"+TIMER)==TIMER_UNIT_SHA,"STEAM_TIMER_UNIT_DRIFT")
    check(file_sha("/var/lib/aoe2war-public-player-6662c33a-one-use-v1/events/0003.json")==STAGE_SHA,
          "IMMUTABLE_STAGE_DRIFT")
    check(m.unit(TIMER)["ActiveState"]=="active","NATIVE_TIMER_NOT_RESTORED")
    check(m.unit(TIMER)["NeedDaemonReload"]=="no","UNAUTHORIZED_MANAGER_RELOAD")
    return True
def exact_executor_source():
    source=Path(__file__).resolve()
    b=root_file(source,0o400,65536)
    checksum=sha(b)
    check(source.name=="aoe2war-b-steam-lease-maintenance-"+checksum[:12]+".py",
          "EXECUTOR_SHA_NAMING")
    return checksum
def write_once(path,content,mode):
    p=Path(path)
    check(not p.exists() and not p.is_symlink(),"ONE_USE_FILE_EXISTS")
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,"wb") as f:
        f.write(content);f.flush();os.fsync(f.fileno())
    os.chmod(p,mode)
    d=os.open(str(p.parent),os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(d)
    finally:os.close(d)
    check(file_sha(p)==sha(content),"FSYNCED_FILE_SHA")
def prepare():
    checksum=exact_executor_source()
    m=reviewed()
    identity=host_preflight(m)
    witness=provider(m)
    at=utc()
    nonce=secrets.token_hex(20)
    marker=sha(nonce.encode())[:12]
    path=Path(PK_PREFIX+marker+".json")
    check(not Path(INTENT_PREFIX+marker+".json").exists(),"NONCE_REPLAY")
    obj={
      "schema":PACKET_SCHEMA,"status":"UNADMITTED_REVIEW_REQUEST_NOT_AUTHORITY",
      "operation":OPERATION,"nonce":nonce,"created_utc":at.isoformat(),
      "expires_utc":(at+dt.timedelta(minutes=35)).isoformat(),
      "executor_sha256":checksum,"executor_root_path":str(Path(__file__).resolve()),
      "reviewed_v22_executor_sha256":EXEC_SHA,"protected_host":identity,
      "provider_witness":witness,"provider_witness_validated_before_request":True,
      "financial_authorized":False,"web_activation_authorized":False,
      "v22_install_authorized":False,"manager_reload_authorized":False,
      "max_atomic_batches":1,"native_v20_timer_original_restore_required":True,
      "no_exact_post_commit_ttl_inverse_claim":True
    }
    blob=(json.dumps(obj,sort_keys=True,indent=2)+"\n").encode()
    write_once(path,blob,0o600)
    print(json.dumps({"status":"PASS_ROOT_PRIVATE_MAINTENANCE_REQUEST_PREPARED_UNADMITTED",
       "request_path":str(path),"request_sha256":sha(blob),
       "executor_sha256":checksum,"expires_utc":obj["expires_utc"],
       "provider_count":len(witness["A"])+len(witness["AAAA"]),
       "root_private_nonce_not_disclosed":True},sort_keys=True),flush=True)
def approval_expectation(req,packet_sha,source_sha):
    return {"schema":CENTRAL_SCHEMA,"decision":DECISION,"operation":OPERATION,
      "packet_sha256":packet_sha,"executor_sha256":source_sha,
      "nonce_sha256":sha(req["nonce"].encode()),"boot_id":req["protected_host"]["boot_id"],
      "host":HOST,"one_use":True,"nft_batch_limit":1,
      "financial_authorized":False,"web_activation_authorized":False,
      "v22_install_authorized":False,"manager_reload_authorized":False}
def validate_approval(req,packet_sha,source_sha,comment,now=None):
    now=now or utc()
    check(comment.get("user",{}).get("login")=="Emaren"
          and comment.get("html_url")==
          "https://github.com/Emaren/app-prodn/pull/1316#issuecomment-"+str(comment.get("id")),
          "CENTRAL_INDEPENDENT_GITHUB_AUTHOR")
    check(comment.get("created_at")==comment.get("updated_at"),"CENTRAL_APPROVAL_EDITED")
    created=parse_time(comment["created_at"])
    check(created<=now and (now-created).total_seconds()<=1800,"CENTRAL_APPROVAL_STALE")
    tick=chr(96)*3
    bodies=re.findall(re.escape(tick)+r"json\s*(\{.*?\})\s*"+re.escape(tick),
             comment.get("body",""),re.S)
    check(len(bodies)==1,"CENTRAL_APPROVAL_STRUCTURED_FORMAT")
    approved=json.loads(bodies[0])
    check(set(approved)==APPROVAL_KEYS,"CENTRAL_APPROVAL_EXTRA_OR_MISSING_KEY")
    expected=approval_expectation(req,packet_sha,source_sha)
    check(all(type(approved.get(k))==type(value) and approved.get(k)==value
              for k,value in expected.items()),
          "CENTRAL_APPROVAL_OPERATION_OR_PACKET_OR_DENIAL")
    expiry=parse_time(approved["expires_utc"])
    req_expiry=parse_time(req["expires_utc"])
    check(created<=expiry<=req_expiry and now<expiry-dt.timedelta(seconds=90)
          and now<req_expiry-dt.timedelta(seconds=90),"CENTRAL_APPROVAL_EXPIRED")
    return approved
def atomic_commands(leases):
    result=[]
    for name in ("steam4","steam6"):
        for ip in sorted(leases[name]):
            p=ipaddress.ip_address(ip)
            check(p.is_global and p.version==(4 if name=="steam4" else 6),
                  "UNSAFE_NFT_IP_SCOPE")
            result.extend([
              f"delete element inet {TABLE} {name} {{ {ip} }}",
              f"add element inet {TABLE} {name} {{ {ip} timeout 300s }}"
            ])
    check(0<len(result)<=32,"NFT_ATOMIC_COMMAND_BUDGET")
    return result
def perform(args):
    source_sha=exact_executor_source()
    check(bool(re.fullmatch(r"[a-f0-9]{64}",args.request_sha)),"PACKET_SHA_ARGUMENT")
    check(bool(re.fullmatch(r"[1-9][0-9]{6,16}",args.approval_comment_id)),
          "CENTRAL_COMMENT_ID_FORMAT")
    p=Path(args.request)
    check(p.parent==Path("/root") and re.fullmatch(
          r"aoe2war-b-steam-lease-maintenance-request-[a-f0-9]{12}\.json",p.name),
          "PACKET_ROOT_PATH")
    b=root_file(p,0o600)
    check(sha(b)==args.request_sha,"PACKET_SHA_CHANGED")
    request=json.loads(b)
    check(request.get("schema")==PACKET_SCHEMA and
          request.get("status")=="UNADMITTED_REVIEW_REQUEST_NOT_AUTHORITY"
          and request.get("operation")==OPERATION and
          request.get("executor_sha256")==source_sha and
          request.get("max_atomic_batches")==1 and
          request.get("financial_authorized") is False and
          request.get("web_activation_authorized") is False and
          request.get("v22_install_authorized") is False and
          request.get("manager_reload_authorized") is False and
          isinstance(request.get("nonce"),str) and
          re.fullmatch(r"[0-9a-f]{40}",request["nonce"]) and
          p.name.endswith(sha(request["nonce"].encode())[:12]+".json"),
          "PACKET_AUTHORITY_AND_NONCE_BINDING")
    marker=Path(INTENT_PREFIX+sha(request["nonce"].encode())[:12]+".json")
    check(not marker.exists() and not marker.is_symlink(),"NONCE_ALREADY_CONSUMED")
    m=reviewed()
    comment=m.central_comment_from_github(args.approval_comment_id)
    validate_approval(request,args.request_sha,source_sha,comment)
    # Genuine new source-independent host inspection before *any* mutation.
    host=host_preflight(m)
    check(host==request["protected_host"],"HOST_PREIMAGE_CHANGED")
    current=provider(m)
    check(current["shape_sha256"]==request["provider_witness"]["shape_sha256"] and
          current["A"]==request["provider_witness"]["A"] and
          current["AAAA"]==request["provider_witness"]["AAAA"],
          "PROVIDER_OR_FIREWALL_SCOPE_DRIFT")
    # First allowed write: root-only O_EXCL fsynced nonce marker; never replay.
    write_once(marker,(json.dumps({"schema":"aoe2war.lease-maintenance.consumed.v1",
             "request_sha256":args.request_sha,"executor_sha256":source_sha,
             "central_comment_id":int(args.approval_comment_id),
             "at_utc":utc().isoformat()},sort_keys=True)+"\n").encode(),0o600)
    print("PASS:NONCE_CONSUMED_ONCE_BEFORE_TIMER_MUTATION",flush=True)
    timer_stop_attempted=False
    batch_committed=False
    try:
        timer_stop_attempted=True
        bound_process(["systemctl","stop",TIMER],limit=30)
        start=time.monotonic()
        while time.monotonic()-start<90:
            state=m.unit(SERVICE)
            if state["ActiveState"]=="inactive" and state["MainPID"]=="0":break
            time.sleep(2)
        else:raise RuntimeError("HOLD:NATIVE_V20_REFRESH_DID_NOT_QUIESCE")
        check(m.unit(TIMER)["ActiveState"]=="inactive","TIMER_NOT_QUIESCED")
        # After stopping V20 writer, validate DNS+CA/SNI and exact present
        # nft members *again*. Reject churn. Only existing true provider IPs.
        second=provider(m)
        check(second["A"]==current["A"] and second["AAAA"]==current["AAAA"]
              and second["shape_sha256"]==current["shape_sha256"],
              "POST_QUIESCE_DNS_OR_NFT_SHAPE_CHANGED")
        latest=m.nft_sets()
        check(latest==second["lease_preimage"],"CONCURRENT_OR_UNFENCED_NFT_WRITER")
        lines=atomic_commands(latest)
        # One nft -f kernel transaction. No flush, no rule, no table or policy write.
        bound_process(["nft","-f","-"],limit=15,stdin="\n".join(lines)+"\n")
        batch_committed=True
        after=m.nft_sets()
        check({k:set(v) for k,v in after.items()}==
              {k:set(v) for k,v in latest.items()},"AFTER_NFT_MEMBERSHIP_CHANGED")
        check(shape_sha()==second["shape_sha256"],"AFTER_NFT_RULE_OR_TIMEOUT_CHANGED")
        check(all(180<=ttl<=300 for fam in after.values() for ttl in fam.values()),
              "AFTER_NFT_LEASE_UNDER_180")
        proof=m.witness()
        check(proof["A"]==second["A"] and proof["AAAA"]==second["AAAA"] and
              proof["min_headroom"]>=180,"POSTRENEWAL_PROVIDER_NOT_AUTHENTICATED")
        print("PASS:REAL_STEAM_ONLY_ONE_ATOMIC_BATCH",json.dumps({
          "provider_count":len(proof["A"])+len(proof["AAAA"]),
          "min_headroom":proof["min_headroom"],"no_finance_or_web_mutations":True},sort_keys=True),
          flush=True)
    finally:
        if timer_stop_attempted:
            # A stop command may have changed state even if its client returned
            # failure. Restore original timer on every attempted-stop path.
            if m.unit(TIMER)["ActiveState"]!="active":
                bound_process(["systemctl","start",TIMER],limit=35)
            check(m.unit(TIMER)["ActiveState"]=="active","TIMER_NOT_RESTORED")
        # Native timer may legitimately run immediately after restart.
        check(protected_postflight(m),"PROTECTED_HOST_POSTFLIGHT")
        check(shape_sha()==current["shape_sha256"],"FIREWALL_SHAPE_POSTFLIGHT")
        print("PASS:ORIGINAL_V20_TIMER_PIDS_STAGE_C04_AND_NFT_SHAPE",flush=True)
    check(batch_committed,"NO_ATOMIC_BATCH_COMMITTED")
def main(argv=None):
    argv=sys.argv[1:] if argv is None else argv
    if not argv:
        print("HOLD:SOURCE_REVIEW_NO_OPERATION",flush=True)
        return 3
    parser=argparse.ArgumentParser()
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--prepare",action="store_true")
    mode.add_argument("--execute",action="store_true")
    parser.add_argument("--request")
    parser.add_argument("--request-sha")
    parser.add_argument("--approval-comment-id")
    args=parser.parse_args(argv)
    try:
        if args.prepare:
            check(not any((args.request,args.request_sha,args.approval_comment_id)),
                  "PREPARE_CANNOT_INCLUDE_AUTHORITY")
            prepare()
        else:
            check(all((args.request,args.request_sha,args.approval_comment_id)),
                  "EXECUTION_ARGS_MISSING")
            perform(args)
        return 0
    except Exception as exc:
        print("HOLD:STEAM_ONLY_MAINTENANCE_"+str(exc)[:340],flush=True)
        return 3
if __name__=="__main__":
    raise SystemExit(main())
