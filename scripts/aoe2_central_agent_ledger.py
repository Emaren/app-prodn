#!/usr/bin/env python3
"""Central Agent Ledger v1: append-only evidence and non-repeating agent prompts.

LOCAL repository tool. Never starts agents, deploys, SSHes or edits production.
Commit appended event logs through normal reviewed Git history for persistence.
"""
from __future__ import annotations
import argparse, datetime, fcntl, hashlib, json, os, pathlib, re, stat, sys

BASE=pathlib.Path(__file__).resolve().parents[1]/"docs/central-agent-ledger"
SEED=BASE/"r25-seed.json"
LOG=BASE/"events.jsonl"
MAX_BYTES=16*1024*1024
MAX_EVENTS=50000
MAX_AGENTS=1000
LANE=re.compile(r"[A-Z][A-Z0-9_-]{0,31}\Z")
SHA=re.compile(r"[0-9a-f]{40}\Z")
URL=re.compile(r"https://github[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(?:issues|pull)/[0-9]+(?:#issuecomment-[0-9]+)?\Z")
KINDS={"ASSIGN","EVIDENCE","DECISION","COMPLETE","FAIL","PHASE"}
CI={"PASS","FAIL","RUNNING","QUEUED","CANCELLED","UNMEASURED"}
RESULT={"ASSIGNED_NOT_CONFIRMED_ACTIVE","HOLD","PASS","FAIL","SOURCE_ONLY","LIVE_VERIFIED"}
ZERO="0"*64
class LedgerHold(Exception):pass
def need(ok,reason):
    if not ok:raise LedgerHold(reason)
def canon(o):return json.dumps(o,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode()
def digest(raw):return hashlib.sha256(raw).hexdigest()
def no_dupes(pairs):
    d={}
    for k,v in pairs:
        need(k not in d,"DUPLICATE_JSON_KEY")
        d[k]=v
    return d
def parsed(raw):
    return json.loads(raw,object_pairs_hook=no_dupes,
                      parse_constant=lambda _ : (_ for _ in ()).throw(LedgerHold("NONFINITE_JSON")))
def utc(value):
    need(type(value)is str and value.endswith("Z"),"TIMESTAMP_MUST_BE_UTC")
    v=datetime.datetime.fromisoformat(value.replace("Z","+00:00"))
    need(v.utcoffset()==datetime.timedelta(0),"TIMESTAMP_OFFSET_NOT_UTC")
    return v
def seed_load(path=SEED):
    s=parsed(pathlib.Path(path).read_bytes())
    need(s.get("schema")=="aoe2war.central-agent-ledger.seed.v1" and
         s.get("version")==1 and isinstance(s.get("assignments"),list),
         "SEED_SCHEMA_UNKNOWN")
    lanes=set()
    for item in s["assignments"]:
        lane=item.get("lane")
        need(type(lane)is str and LANE.fullmatch(lane) and lane not in lanes,
             "SEED_DUPLICATE_OR_INVALID_LANE")
        lanes.add(lane)
        need(item.get("active_session_verified") is False and
             item.get("result")=="ASSIGNED_NOT_CONFIRMED_ACTIVE" and
             item.get("source")==s["dispatch"]["source"],"SEED_CLAIMS_UNVERIFIED_ACTIVITY")
        utc(item["assigned_at"])
    need(len(lanes)<=MAX_AGENTS,"SEED_AGENT_LIMIT")
    for d in s.get("decisions",[]):
        need(type(d.get("statement"))is str and d.get("source") and d.get("at"),
             "UNSOURCED_SEED_DECISION")
        utc(d["at"])
    return s
def check_event(event):
    required={"id","kind","lane","at","source","source_sha","ci","ci_url",
              "evidence_at","assignment","priority","capability","dependency",
              "next_operation","deploy_phase","result","diagnostic_key","details"}
    need(type(event)is dict and set(event)==required,"EVENT_SCHEMA_V1_EXACT_FIELDS")
    need(type(event["id"])is str and 1<=len(event["id"])<=100 and
         re.fullmatch(r"[A-Za-z0-9._:-]+",event["id"]),"EVENT_ID_INVALID")
    need(event["kind"] in KINDS,"UNKNOWN_EVENT_KIND")
    need(type(event["lane"])is str and LANE.fullmatch(event["lane"]),"LANE_ID_INVALID")
    utc(event["at"])
    need(type(event["source"])is str and URL.fullmatch(event["source"]),
         "EVENT_SOURCE_NOT_GITHUB_PERMALINK")
    need(event["source_sha"] is None or
         type(event["source_sha"])is str and SHA.fullmatch(event["source_sha"]),
         "SHA_NOT_EXACT_OR_UNMEASURED")
    need(type(event["ci"])is str and event["ci"] in CI,"CI_VERDICT_INVALID")
    need(event["ci_url"] is None or
         type(event["ci_url"])is str and event["ci_url"].startswith("https://github.com/"),
         "CI_URL_INVALID")
    need(event["evidence_at"] is None or
         isinstance(event["evidence_at"],str),"EVIDENCE_TIMESTAMP_INVALID")
    if event["evidence_at"] is not None:utc(event["evidence_at"])
    for key in ("assignment","priority","capability","dependency","next_operation",
                "deploy_phase","details"):
        need(type(event[key])is str and len(event[key])<=4096,"EVENT_FIELD_INVALID:"+key)
    need(event["result"] in RESULT,"EVENT_RESULT_INVALID")
    need(event["diagnostic_key"] is None or
         type(event["diagnostic_key"])is str and
         re.fullmatch(r"[A-Z0-9_.:-]{1,120}",event["diagnostic_key"]),
         "DIAGNOSTIC_KEY_INVALID")
    if event["result"] in ("PASS","LIVE_VERIFIED") or event["kind"]=="COMPLETE":
        need(event["evidence_at"] and event["source_sha"] and
             event["ci"]=="PASS" and event["ci_url"] and
             event["result"] in ("PASS","LIVE_VERIFIED"),
             "SUCCESS_REQUIRES_SOURCE_CI_TIMESTAMP_AND_LINK")
    if event["kind"]=="COMPLETE":
        need(event["diagnostic_key"],"COMPLETE_REQUIRES_DIAGNOSTIC_KEY")
    if event["result"]=="LIVE_VERIFIED":
        need(event["kind"]=="EVIDENCE" and "HEL1_ROOT_" in event["details"] and
             "PUBLIC_HTTP_" in event["details"] and
             "FINANCE_UNCHANGED_" in event["details"] and
             "ROLLBACK_" in event["details"],
             "LIVE_VERIFIED_REQUIRES_PHYSICAL_EVIDENCE_FIELDS")
def read_events(path=LOG):
    p=pathlib.Path(path)
    if not p.exists():return []
    st=p.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_size<=MAX_BYTES and
         not stat.S_ISLNK(st.st_mode),"UNSAFE_LEDGER_FILE")
    raw=p.read_bytes()
    need(not raw or raw.endswith(b"\n"),"TRUNCATED_JSONL_ENTRY")
    events=[];previous=ZERO;seen=set();done=set()
    for line in raw.splitlines():
        need(len(events)<MAX_EVENTS and 0<len(line)<=16384,"EVENT_LOG_BOUNDS")
        item=parsed(line)
        need(type(item)is dict and
             set(item)=={"seq","prev_sha256","sha256","event"},"EVENT_CHAIN_SCHEMA")
        event=item["event"];check_event(event)
        need(item["seq"]==len(events)+1 and item["prev_sha256"]==previous,
             "NONMONOTONIC_OR_REWRITTEN_HISTORY")
        expected=digest(bytes.fromhex(previous)+canon(event)+
                        str(item["seq"]).encode())
        need(item["sha256"]==expected,"LEDGER_HASH_CHAIN_BROKEN")
        need(event["id"] not in seen,"DUPLICATE_EVENT_ID")
        seen.add(event["id"])
        key=event["diagnostic_key"]
        need(not(key and key in done and event["kind"] in ("ASSIGN","COMPLETE")),
             "COMPLETED_DIAGNOSTIC_REASSIGNED")
        if event["kind"]=="COMPLETE":done.add(key)
        previous=expected
        events.append(item)
    return events
def append(event,path=LOG,dry_run=False,seed_path=SEED):
    seed=seed_load(seed_path);check_event(event)
    path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    need(not path.is_symlink(),"LEDGER_SYMLINK")
    fd=os.open(path,os.O_CREAT|os.O_RDWR|os.O_APPEND|os.O_NOFOLLOW,0o600)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX)
        rows=read_events(path)
        need(event["id"] not in {r["event"]["id"] for r in rows},
             "EVENT_ALREADY_RECORDED")
        completed={r["event"]["diagnostic_key"] for r in rows
                   if r["event"]["kind"]=="COMPLETE"}
        need(not(event["diagnostic_key"] in completed and
                 event["kind"] in ("ASSIGN","COMPLETE")),
             "COMPLETED_DIAGNOSTIC_REASSIGNED")
        lanes={a["lane"] for a in seed["assignments"]}
        lanes.update(r["event"]["lane"] for r in rows if r["event"]["kind"]=="ASSIGN")
        need(event["lane"] in lanes or
             (event["kind"]=="ASSIGN" and len(lanes)<MAX_AGENTS),
             "UNKNOWN_OR_EXCESS_AGENT_LANE")
        prev=rows[-1]["sha256"] if rows else ZERO
        seq=len(rows)+1
        item={"seq":seq,"prev_sha256":prev,
              "sha256":digest(bytes.fromhex(prev)+canon(event)+str(seq).encode()),
              "event":event}
        if not dry_run:
            line=canon(item)+b"\n"
            need(os.fstat(fd).st_size+len(line)<=MAX_BYTES,"LEDGER_SIZE_LIMIT")
            os.write(fd,line);os.fsync(fd)
        return item
    finally:
        fcntl.flock(fd,fcntl.LOCK_UN);os.close(fd)
def view(seed,events):
    agents={a["lane"]:dict(a) for a in seed["assignments"]}
    decisions=list(seed.get("decisions",[]));history={}
    for row in events:
        e=row["event"];lane=e["lane"]
        if e["kind"]=="DECISION":
            decisions.append({"key":e["id"],"source":e["source"],
                              "at":e["at"],"statement":e["details"]})
        if lane not in agents:
            agents[lane]={"lane":lane,"active_session_verified":False,
                          "result":"ASSIGNED_NOT_CONFIRMED_ACTIVE"}
        obj=agents[lane]
        for key in ("priority","capability","assignment","dependency","next_operation",
                    "deploy_phase","result"):
            if e[key]:obj[key]=e[key]
        obj["source"]=e["source"];obj["source_sha"]=e["source_sha"]
        obj["ci"]={"verdict":e["ci"],"url":e["ci_url"]}
        obj["evidence_at"]=e["evidence_at"]
        obj["last_event_at"]=e["at"]
        history.setdefault(lane,[]).append({"id":e["id"],"kind":e["kind"],
                                           "at":e["at"],"source":e["source"]})
    complete=sorted({r["event"]["diagnostic_key"] for r in events
                     if r["event"]["kind"]=="COMPLETE"})
    return {"schema":"aoe2war.central-agent-ledger.view.v1",
            "agent_count":len(agents),"agent_capacity":MAX_AGENTS,
            "agents":agents,"decisions":decisions,
            "completed_diagnostic_keys":complete,"history":history,
            "source_event_count":len(events),"agents_confirmed_active":False}
def prompt(state,lane):
    need(lane in state["agents"],"UNKNOWN_AGENT")
    a=state["agents"][lane]
    lines=[f"# CENTRAL AGENT {lane} — SOURCE-GROUNDED TASK",
      f"Priority: {a.get('priority','UNMEASURED')}",
      f"Assignment: {a.get('assignment','UNMEASURED')}",
      f"Capability: {a.get('capability','UNMEASURED')}",
      f"Dependency: {a.get('dependency','UNMEASURED')}",
      f"Next operation: {a.get('next_operation','UNMEASURED')}",
      f"Phase: {a.get('deploy_phase','UNMEASURED')}",
      f"Result: {a.get('result','UNMEASURED')}",
      f"Source: {a.get('source','UNMEASURED')}",
      f"Source SHA: {a.get('source_sha') or 'UNMEASURED'}",
      f"CI: {a.get('ci') or 'UNMEASURED'}",
      f"Evidence timestamp: {a.get('evidence_at') or 'UNMEASURED'}",
      "Session activity is NOT confirmed by this ledger.",
      "Do not repeat completed diagnostic keys: "+
          (", ".join(state["completed_diagnostic_keys"]) or "(none recorded)"),
      "Preserve decisions below; new proof must be appended, never overwrite prior entries."]
    lines += [f"- {d['at']} {d['statement']} ({d['source']})"
              for d in state["decisions"]]
    if a.get("priority")=="P3":
        lines.append("P3 is additive; never block P0 production.")
    return "\n".join(lines)+"\n"
def main():
    p=argparse.ArgumentParser()
    p.add_argument("action",choices=("validate","status","append","prompt"))
    p.add_argument("--seed",type=pathlib.Path,default=SEED)
    p.add_argument("--log",type=pathlib.Path,default=LOG)
    p.add_argument("--event",type=pathlib.Path)
    p.add_argument("--lane")
    p.add_argument("--dry-run",action="store_true")
    a=p.parse_args()
    try:
        seed=seed_load(a.seed)
        events=read_events(a.log)
        if a.action=="validate":
            print(json.dumps({"status":"PASS","events":len(events),
                              "lanes":len(view(seed,events)["agents"])},sort_keys=True))
        elif a.action=="status":print(json.dumps(view(seed,events),indent=2,sort_keys=True))
        elif a.action=="prompt":
            need(a.lane is not None,"PROMPT_LANE_REQUIRED")
            print(prompt(view(seed,events),a.lane),end="")
        else:
            need(a.event is not None,"APPEND_EVENT_PATH_REQUIRED")
            row=append(parsed(a.event.read_bytes()),a.log,a.dry_run,a.seed)
            print(json.dumps({"status":"DRY_RUN_PASS" if a.dry_run else "APPENDED",
                              "seq":row["seq"],"sha256":row["sha256"]},sort_keys=True))
        return 0
    except (LedgerHold,KeyError,TypeError,ValueError,OSError) as exc:
        print("HOLD:CENTRAL_AGENT_LEDGER:"+
              (str(exc) if isinstance(exc,LedgerHold) else type(exc).__name__),
              file=sys.stderr)
        return 2
if __name__=="__main__":raise SystemExit(main())
