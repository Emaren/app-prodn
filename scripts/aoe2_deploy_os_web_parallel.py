#!/usr/bin/env python3
"""Deployment OS v1: additive 3031 website-only admission, NO deployment actions.

F's separately reviewed trusted witness bridge is mandatory. This module
cannot authenticate HEL1 merely from JSON fields and never invokes ssh/nginx,
financial jobs, systemd or the original in-place release/rollback engines.
"""
from __future__ import annotations
import argparse, fcntl, hashlib, json, os, re, stat, sys
from datetime import datetime, timezone
from pathlib import Path

POLICY="aoe2war.deploy-os.website-parallel.v1"
LEDGER="aoe2war.deploy-os.decision.v1"
TASK="aoe2war.deploy-os.agent-task.v1"
SITE="0cee3c836c4b0760478280c145e02e81e470ce0e"
CONTROLLER="18052e01a191b15525664c1a058de80d7a8bc150"
OLD_RSA="3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"
LOCK=[2064,6185747,1000,0o644]
STATES=("SOURCE","STAGED","ISOLATED","RUNNING","ROUTED","VERIFIED","CERTIFIED","HOLD","ROLLED_BACK")
NEXT=dict(zip(STATES[:6],STATES[1:7]))
ROLES={"SOURCE":("F_SOURCE_PIN",),"STAGED":("C_SOURCE_BUILD","E_ROLLBACK_CAPACITY"),
       "ISOLATED":("B_ISOLATED",),
       "RUNNING":("C_3031_RUNNING","B_RUNTIME"),
       "ROUTED":("F_NGINX_ROUTE","OWNER_CONSENT","B_CONTINUITY"),
       "VERIFIED":("G_PUBLIC_INTERNAL","G_BUILD_PID","B_CONTINUITY"),
       "CERTIFIED":("F_ROLLBACK","G_PUBLIC_INTERNAL","G_BUILD_PID","B_CONTINUITY"),
       "ROLLED_BACK":("F_RESTORE_NGINX","G_OLD_BUILD","B_CONTINUITY")}
PRIORITY={"P0":"WEBSITE_TO_LIVE_VERIFIED","P1":"P0_SCOPE_BLOCKER",
          "P2":"APPROVED_ENGINEERING_QUEUE","P3":"NONBLOCKING_AGENT_OS"}
HEX40=re.compile(r"[0-9a-f]{40}\Z")
HEX64=re.compile(r"[0-9a-f]{64}\Z")
HEX32=re.compile(r"[0-9a-f]{32}\Z")

class Hold(RuntimeError): pass
def need(p,code):
    if not p: raise Hold("DEPLOY_OS_HOLD:"+code)
def canon(x):
    return json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode("ascii")
def digest(x): return hashlib.sha256(canon(x)).hexdigest()
def hashstr(x): return hashlib.sha256(x.encode("utf-8")).hexdigest()
def h40(x): return type(x) is str and HEX40.fullmatch(x) is not None
def h64(x): return type(x) is str and HEX64.fullmatch(x) is not None
def shape(x,expected,reason):
    need(type(x) is dict and set(x)==set(expected),reason)
def utc(): return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
def plan_check(p):
    shape(p,("schema","policy","attempt_id","candidate_sha","controller_sha",
             "old_sha","old_build_id","old_pid","old_start_ticks",
             "old_service","old_port","new_service","new_port",
             "original_lock","original_owner_rsa_spki","nginx_preimage_sha256",
             "source_reviews"),"PLAN_SHAPE")
    need(p["schema"]==1 and p["policy"]==POLICY and
         type(p["attempt_id"]) is str and HEX32.fullmatch(p["attempt_id"]) is not None and
         p["candidate_sha"]==SITE and p["controller_sha"]==CONTROLLER and
         h40(p["old_sha"]) and p["old_sha"]!=SITE and
         type(p["old_build_id"]) is str and bool(p["old_build_id"]) and
         type(p["old_pid"]) is int and p["old_pid"]>0 and
         type(p["old_start_ticks"]) is int and p["old_start_ticks"]>0,
         "EXACT_SOURCE_OR_OLD_PID_REQUIRED")
    need((p["old_service"],p["old_port"],p["new_service"],p["new_port"])==
         ("aoe2hdbets-web.service",3030,"aoe2hdbets-web-r24.service",3031) and
         p["original_lock"]==LOCK and p["original_owner_rsa_spki"]==OLD_RSA and
         h64(p["nginx_preimage_sha256"]),"ROOT_LOCK_OR_NGINX_DRIFT")
    shape(p["source_reviews"],("B","C","D","E","F","G"),"REVIEW_LANES")
    need(all(h40(v) for v in p["source_reviews"].values()),"SIX_LANE_SOURCE_REVIEWS_MISSING")
    # Six *review commits* are not six imaginary cryptographic signers.
    return digest(p)
def owner_text(p,route_sha):
    ph=plan_check(p)
    need(h64(route_sha),"ROUTE_SHA_MISSING")
    return "AUTHORIZE AOE2WAR WEB ONLY "+SITE+" ATTEMPT "+p["attempt_id"]+" PLAN "+ph+" ROUTE "+route_sha

def verified(role,ref,plan,verify):
    ph=plan_check(plan)
    need(h64(ref),"EVIDENCE_DIGEST_REQUIRED:"+role)
    need(callable(verify),"TRUSTED_F_EVIDENCE_VERIFIER_REQUIRED")
    x=verify(role,ref,ph)
    shape(x,("role","record_sha256","plan_sha256","review_source_sha","facts"),"VERIFIED_WITNESS_ABI")
    lane="F" if role=="OWNER_CONSENT" else role[0]
    need(x["role"]==role and x["record_sha256"]==ref and x["plan_sha256"]==ph and
         x["review_source_sha"]==plan["source_reviews"][lane] and type(x["facts"]) is dict,
         "WITNESS_NOT_SOURCE_OR_PLAN_BOUND:"+role)
    # Integration MUST ensure the callback cryptographically/provenance verifies
    # a root-controlled receipt, never relays a user-supplied success dict.
    return x["facts"]

def gate(stage,p,f,prior):
    def get(role,name):
        need(role in f and name in f[role],"MISSING_FACT:"+role+":"+name)
        return f[role][name]
    if stage=="SOURCE":
        need(get("F_SOURCE_PIN","candidate_sha")==SITE and
             get("F_SOURCE_PIN","old_pid")==p["old_pid"],"F_SOURCE_FREEZE")
    if stage=="STAGED":
        need(get("C_SOURCE_BUILD","candidate_sha")==SITE and
             h64(get("C_SOURCE_BUILD","artifact_sha256")) and
             type(get("C_SOURCE_BUILD","next_build_id")) is str and
             bool(get("C_SOURCE_BUILD","next_build_id")),"C_STAGED_SOURCE")
        available=get("E_ROLLBACK_CAPACITY","root_available_bytes")
        peak=get("E_ROLLBACK_CAPACITY","candidate_peak_bytes")
        reserve=get("E_ROLLBACK_CAPACITY","reserve_bytes")
        need(all(type(v) is int for v in (available,peak,reserve)) and peak>0 and reserve>=0 and
             available>=peak+reserve and
             h64(get("E_ROLLBACK_CAPACITY","rollback_sha256")) and
             get("E_ROLLBACK_CAPACITY","rollback_sha256")==get("E_ROLLBACK_CAPACITY","readback_sha256"),
             "E_ACTUAL_CAPACITY_OR_DURABLE_ROLLBACK")
    if stage=="ISOLATED":
        need(get("B_ISOLATED","candidate_sha")==SITE and
             get("B_ISOLATED","db_role")=="SELECT_ONLY" and
             get("B_ISOLATED","wargraph_disabled") is True and
             get("B_ISOLATED","finance_secrets") is False and
             get("B_ISOLATED","finance_write_routes")==[] and
             get("B_ISOLATED","unknown_startup_edges")==[],
             "B_NONFINANCIAL_ISOLATION_UNPROVEN")
    if stage=="RUNNING":
        need(get("C_3031_RUNNING","new_port")==3031 and
             get("C_3031_RUNNING","new_service")=="aoe2hdbets-web-r24.service" and
             get("C_3031_RUNNING","new_pid")>0 and
             get("C_3031_RUNNING","old_pid")==p["old_pid"] and
             get("C_3031_RUNNING","old_start_ticks")==p["old_start_ticks"] and
             get("B_RUNTIME","db_role")=="SELECT_ONLY" and
             get("B_RUNTIME","finance_secrets") is False,"C_PARALLEL_PID_OR_B_BOUNDARY")
    if stage=="ROUTED":
        route=get("F_NGINX_ROUTE","route_receipt_sha256")
        need(h64(route) and get("F_NGINX_ROUTE","nginx_preimage_sha256")==p["nginx_preimage_sha256"] and
             get("F_NGINX_ROUTE","public_port")==3031 and
             get("F_NGINX_ROUTE","old_route_preserved") is True and
             get("F_NGINX_ROUTE","old_pid")==p["old_pid"] and
             get("OWNER_CONSENT","typed_phrase_sha256")==hashstr(owner_text(p,route)) and
             get("OWNER_CONSENT","root_nonce_verified") is True and
             get("OWNER_CONSENT","original_release_lock_held") is True,
             "F_ROUTE_OR_EXPLICIT_OWNER_CONSENT_MISSING")
    if stage in ("VERIFIED","CERTIFIED"):
        need(get("G_PUBLIC_INTERNAL","public_get_ok") is True and
             get("G_PUBLIC_INTERNAL","internal_get_ok") is True and
             get("G_BUILD_PID","candidate_sha")==SITE and
             get("G_BUILD_PID","new_port")==3031 and
             get("G_BUILD_PID","old_pid")==p["old_pid"],"G_ACTUAL_LIVE_NOT_VERIFIED")
    if stage in ("ROUTED","VERIFIED","CERTIFIED","ROLLED_BACK"):
        need(get("B_CONTINUITY","finance_processes_unchanged") is True and
             get("B_CONTINUITY","listeners_8092_8093_unchanged") is True and
             get("B_CONTINUITY","old_pid")==p["old_pid"],"FINANCIAL_OR_WOLO_DRIFT")
    if stage=="CERTIFIED":
        need(get("F_ROLLBACK","rollback_exercised") is True and
             get("F_ROLLBACK","route_restorable") is True and
             h64(get("F_ROLLBACK","rollback_receipt_sha256")),"F_ROLLBACK_NOT_CERTIFIED")
    if stage=="ROLLED_BACK":
        need(get("F_RESTORE_NGINX","public_port")==3030 and
             get("F_RESTORE_NGINX","old_pid")==p["old_pid"] and
             get("G_OLD_BUILD","public_build_id")==p["old_build_id"],"ORIGINAL_ROUTE_NOT_RESTORED")
    stage_record=next((h["bindings"] for h in reversed(prior)
                       if h["to_state"]=="STAGED"),None)
    if stage in ("RUNNING","VERIFIED","CERTIFIED"):
        require_role="C_3031_RUNNING" if stage=="RUNNING" else "G_BUILD_PID"
        need(stage_record is not None and
             get(require_role,"next_build_id")==stage_record["next_build_id"] and
             get(require_role,"artifact_sha256")==stage_record["artifact_sha256"],
             "STAGED_ARTIFACT_BUILD_MISMATCH")
    if stage=="CERTIFIED":
        need(get("F_ROLLBACK","rollback_sha256")==stage_record["rollback_sha256"],
             "CERT_ROLLBACK_SOURCE_CHANGED")
    if stage=="STAGED":
        return {"artifact_sha256":get("C_SOURCE_BUILD","artifact_sha256"),
                "next_build_id":get("C_SOURCE_BUILD","next_build_id"),
                "rollback_sha256":get("E_ROLLBACK_CAPACITY","rollback_sha256")}
    return {}

def transition(p,history,to_state,refs=None,verify=None,blocker=None,resolution_ref=None):
    ph=plan_check(p)
    need(type(history) is list,"HISTORY_REQUIRED")
    current=history[-1]["to_state"] if history else None
    need(to_state in STATES,"UNKNOWN_STAGE")
    if to_state=="HOLD":
        need(current not in (None,"HOLD","ROLLED_BACK","CERTIFIED") and
             type(blocker) is dict and set(blocker)=={"subsystem","code","evidence_sha256"} and
             blocker["subsystem"] in ("WEBSITE","FINANCE","WOLO","STORAGE","CONTROLLER","NGINX","OWNER","G") and
             type(blocker["code"]) is str and bool(blocker["code"]) and
             (blocker["evidence_sha256"] is None or h64(blocker["evidence_sha256"])),
             "P1_SCOPED_BLOCKER_REQUIRED")
        return dict(from_state=current,to_state="HOLD",refs={},blocker=blocker,priority="P1",bindings={})
    if current=="HOLD":
        prior=history[-1]["from_state"]
        need(to_state==prior and h64(resolution_ref),"P1_REOPEN_ONLY_PREVIOUS_STAGE")
        x=verified("F_BLOCKER_RESOLUTION",resolution_ref,p,verify)
        need(x.get("resolved_code")==history[-1]["blocker"]["code"],"P1_RESOLUTION_UNVERIFIED")
        return dict(from_state=current,to_state=prior,refs={"F_BLOCKER_RESOLUTION":resolution_ref},
                    blocker=None,priority="P1",bindings={})
    allowed=(current is None and to_state=="SOURCE") or NEXT.get(current)==to_state or (
        to_state=="ROLLED_BACK" and current in ("ROUTED","VERIFIED","CERTIFIED"))
    need(allowed,"ILLEGAL_STAGE_TRANSITION")
    need(type(refs) is dict and set(refs)==set(ROLES[to_state]),"MISSING_REQUIRED_EVIDENCE_ROLES")
    facts={role:verified(role,refs[role],p,verify) for role in ROLES[to_state]}
    bindings=gate(to_state,p,facts,history)
    return dict(from_state=current,to_state=to_state,refs=dict(refs),blocker=None,
                priority="P0",bindings=bindings)

class Journal:
    """Append-only O_EXCL/fsync, root-owned protected directory. No host actions."""
    def __init__(self,path,owner_uid=0):
        self.path=Path(path);self.uid=owner_uid
    def directory(self):
        st=self.path.lstat()
        need(stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode) and
             st.st_uid==self.uid and stat.S_IMODE(st.st_mode)==0o700,"UNTRUSTED_LEDGER_ROOT")
        return os.open(self.path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
    def read(self):
        fd=self.directory()
        try:
            names=sorted(n for n in os.listdir(self.path) if n.endswith(".json"))
            need(len(names)<=4096,"LEDGER_TOO_LONG")
            out=[];prev="0"*64
            for i,name in enumerate(names):
                need(name==f"{i:08d}.json","LEDGER_GAP")
                f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=fd)
                try:
                    st=os.fstat(f)
                    need(stat.S_ISREG(st.st_mode) and st.st_uid==self.uid and
                         stat.S_IMODE(st.st_mode)==0o600 and st.st_size<=32768,"UNTRUSTED_EVENT")
                    raw=os.read(f,32769)
                finally: os.close(f)
                need(len(raw)<=32768 and raw.endswith(b"\n"),"PARTIAL_EVENT")
                value=json.loads(raw,object_pairs_hook=_no_dupes)
                need(value.get("schema")==LEDGER and value.get("sequence")==i and
                     value.get("previous_sha256")==prev and
                     value.get("event_sha256")==digest({k:v for k,v in value.items() if k!="event_sha256"}),
                     "LEDGER_HASH_CHAIN_INVALID")
                prev=value["event_sha256"];out.append(value)
            return out
        finally:os.close(fd)
    def append(self,p,to_state,refs=None,verify=None,blocker=None,resolution_ref=None):
        need(os.geteuid()==self.uid,"ROOT_JOURNAL_WRITER_REQUIRED")
        ph=plan_check(p);dfd=self.directory()
        try:
            lock=os.open(".lock",os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW|os.O_CLOEXEC,0o600,dir_fd=dfd)
            try:
                st=os.fstat(lock)
                need(st.st_uid==self.uid and stat.S_IMODE(st.st_mode)==0o600,"UNTRUSTED_JOURNAL_LOCK")
                fcntl.flock(lock,fcntl.LOCK_EX)
                history=self.read()
                need(all(x["plan_sha256"]==ph for x in history),"ATTEMPT_PLAN_CHANGED")
                decision=transition(p,history,to_state,refs,verify,blocker,resolution_ref)
                n=len(history)
                need(n<4096,"LEDGER_FULL")
                e=dict(schema=LEDGER,sequence=n,previous_sha256=history[-1]["event_sha256"] if history else "0"*64,
                       timestamp=utc(),plan_sha256=ph,**decision)
                e["event_sha256"]=digest(e)
                fd=os.open(f"{n:08d}.json",os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,0o600,dir_fd=dfd)
                try:
                    data=memoryview(canon(e)+b"\n")
                    while data:
                        w=os.write(fd,data);need(w>0,"WRITE_FAILED");data=data[w:]
                    os.fsync(fd)
                finally:os.close(fd)
                os.fsync(dfd)
                return e
            finally:os.close(lock)
        finally:os.close(dfd)

def _no_dupes(pairs):
    x={}
    for k,v in pairs:
        if k in x: raise Hold("DUPLICATE_RECEIPT_KEY")
        x[k]=v
    return x

def task_check(x):
    shape(x,("schema","task_id","lane","session_id","priority","objective","depends_on",
             "status","source_sha","evidence_refs","blockers","reviewed_by","timestamp"),"TASK_ABI")
    need(x["schema"]==TASK and x["lane"] in ("B","C","D","E","F","G","CENTRAL") and
         x["priority"] in PRIORITY and
         x["status"] in ("QUEUED","ASSIGNED","EVIDENCE_SUBMITTED","REVIEWED","BLOCKED","CLOSED") and
         type(x["task_id"]) is str and bool(x["task_id"]) and
         type(x["session_id"]) is str and bool(x["session_id"]) and
         type(x["objective"]) is str and bool(x["objective"]) and
         type(x["depends_on"]) is list and all(type(v) is str for v in x["depends_on"]) and
         len(set(x["depends_on"]))==len(x["depends_on"]) and
         (x["source_sha"] is None or h40(x["source_sha"])) and
         type(x["evidence_refs"]) is list and all(h64(v) for v in x["evidence_refs"]) and
         type(x["blockers"]) is list and
         all(type(v) is dict and set(v)=={"subsystem","code","evidence_sha256"} and
             v["subsystem"] in ("WEBSITE","FINANCE","WOLO","STORAGE","CONTROLLER","NGINX","OWNER","G","ORCHESTRATION") and
             type(v["code"]) is str and bool(v["code"]) and
             (v["evidence_sha256"] is None or h64(v["evidence_sha256"])) for v in x["blockers"]) and
         type(x["reviewed_by"]) is list and
         type(x["timestamp"]) is str and x["timestamp"].endswith("Z"),"TASK_INVALID")
    need(not (x["priority"]=="P0" and any(b["subsystem"]=="ORCHESTRATION" for b in x["blockers"])),
         "P3_MUST_NOT_BLOCK_P0")
    return digest(x)

def main(argv=None):
    a=argparse.ArgumentParser()
    a.add_argument("action",choices=("capabilities","operator-interface","task-schema","ledger-status"))
    a.add_argument("--journal-dir")
    x=a.parse_args(argv)
    if x.action=="capabilities":
        print(canon(dict(policy=POLICY,states=STATES,priority=PRIORITY,
                         old_port=3030,new_port=3031,
                         original_finance_certification_preserved=True,
                         authority="SOURCE_ONLY_NOT_DEPLOYMENT_AUTHORIZATION")).decode())
    elif x.action=="operator-interface":
        print("aoe2war deploy-os website-only parallel <status|plan|stage|isolate|run|route|verify|certify|rollback>")
        print("F/C root-authenticated adapter required for all production mutation")
    elif x.action=="task-schema":
        print(canon(dict(schema=TASK,lanes=("B","C","D","E","F","G","CENTRAL"),priority=PRIORITY)).decode())
    else:
        need(x.journal_dir is not None,"JOURNAL_DIR_REQUIRED")
        history=Journal(x.journal_dir).read()
        print(canon(dict(count=len(history),current=history[-1]["to_state"] if history else None,
                         last_sha256=history[-1]["event_sha256"] if history else None,
                         authority="READ_ONLY_NOT_LIVE_VERIFIED")).decode())
    return 0
if __name__=="__main__":
    try:sys.exit(main())
    except (Hold,OSError,ValueError) as e:
        print("HOLD:"+str(e),file=sys.stderr);sys.exit(2)
