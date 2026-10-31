#!/usr/bin/env python3
"""R25 Kingdom Run-Up: bounded read-only source-backed projection, no polling.

Input: #1090 canonical architecture registry, #1086 agent ledger, optional
already-collected F/C/B/E/G receipt JSONL. Neither input can start agents or
promote unverified host information into a LIVE production claim.
"""
from __future__ import annotations
import argparse, datetime, importlib.util, json, pathlib, re, sys

ROOT=pathlib.Path(__file__).resolve().parents[1]
REGISTRY=ROOT/"config/aoe2war-os-registry.v1.json"
BINDINGS=ROOT/"config/central-agent-os-bindings.v1.json"
LEDGER=ROOT/"scripts/aoe2_central_agent_ledger.py"
RECEIPT_MAX=2*1024*1024
SOURCE="0cee3c836c4b0760478280c145e02e81e470ce0e"
SOURCE_REPORT="https://github.com/Emaren/app-prodn/issues/1089"
CENSUS_SOURCE="https://github.com/Emaren/app-prodn/pull/1090"
RUNUP_PHASES=("SOURCE_RECEIVED","SOURCE_EXTRACTED","BUILD_STAGED",
              "FINANCIALLY_ISOLATED","PARALLEL_RUNNING","ROUTE_READY",
              "PUBLIC_ROUTED","LIVE_VERIFIED")
PHASE_SET=set(RUNUP_PHASES)
ALLOWED_VERDICTS={"PASS","HOLD","FAIL","UNKNOWN","STALE"}
ALLOWED_KINDS={"SOURCE_CI","OWNER_REPORTED","HOST_NATIVE","PUBLIC_HTTP",
               "ROLLOUT_RECEIPT","ROLLBACK_RECEIPT"}
HEX40=re.compile(r"[0-9a-f]{40}\Z")
HEX64=re.compile(r"[0-9a-f]{64}\Z")
class ReadModelHold(Exception):pass
def need(ok,why):
    if not ok:raise ReadModelHold(why)
def unambiguous(items):
    out={}
    for key,value in items:
        need(key not in out,"DUPLICATE_READ_MODEL_KEY")
        out[key]=value
    return out
def parse(raw,maxbytes=RECEIPT_MAX):
    need(0<len(raw)<=maxbytes,"UNBOUNDED_INPUT")
    return json.loads(raw,object_pairs_hook=unambiguous,
                      parse_constant=lambda _ : (_ for _ in ()).throw(ReadModelHold("NONFINITE_JSON")))
def iso(v):
    need(type(v)is str and v.endswith("Z"),"NOT_EXPLICIT_UTC")
    d=datetime.datetime.fromisoformat(v.replace("Z","+00:00"))
    need(d.utcoffset()==datetime.timedelta(0),"BAD_UTC_OFFSET")
    return d
def ledger_module():
    spec=importlib.util.spec_from_file_location("r25_agent_ledger",LEDGER)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
def canonical(registry=REGISTRY,bindings=BINDINGS):
    reg=parse(pathlib.Path(registry).read_bytes(),1048576)
    cross=parse(pathlib.Path(bindings).read_bytes(),1048576)
    need(reg.get("schema")=="aoe2war.os.census.v1" and
         cross.get("schema")=="aoe2war.central-agent-os-bindings.v1",
         "CANONICAL_OS_SCHEMA")
    need(cross["source_registry_sha"]=="8b275229c16f67dc65f9d3bd4b500faf11aa72a0",
         "OS_REGISTRY_PR_REVIEW_SHA_CHANGED")
    records=reg.get("subordinate_os")
    need(isinstance(records,list) and len(records)==14 and
         reg.get("umbrella",{}).get("id")=="aoe2war",
         "PROVISIONAL_1090_OS_ID_COUNT_DRIFT")
    by_id={}
    for x in records:
        ident=x.get("id")
        need(type(ident)is str and ident not in by_id and
             x.get("kind")=="subordinate-os","DUPLICATE_OR_UNKNOWN_OS_KIND")
        by_id[ident]=x
        need(x.get("independent_live_worker_proven") is False,
             "UNREVIEWED_REGISTRY_WORKER_CLAIM")
    expected={"release","documentation","storage","host","recovery",
              "workspace","speed","replay-truth","central-command",
              "deployment","orchestra","agent","swarm","wolochain"}
    need(set(by_id)==expected,"CANONICAL_OS_IDS_DRIFT")
    roles=reg.get("supervisory_roles",[])
    need({r.get("id") for r in roles}=={"system-doctor","system-shepherd","system-composer"} and
         all(r.get("kind")!="subordinate-os" for r in roles),
         "SUPERVISORY_ROLE_CONFLATED_WITH_OS")
    bindings_list=cross.get("bindings",[])
    need({r.get("lane") for r in bindings_list}==set("BCDEFG"),
         "AGENT_LANE_BINDINGS_NOT_EXACT")
    for row in bindings_list:
        need(isinstance(row.get("os_ids"),list) and
             len(row["os_ids"])==len(set(row["os_ids"])) and
             set(row["os_ids"])<=set(by_id),"LANE_UNKNOWN_OS_ID")
    return reg,cross,by_id
def source_seed_phase():
    # Recorded owner source-extraction report #1089; not a live root witness.
    return {"phase":"SOURCE_EXTRACTED","verdict":"PASS",
            "evidence_kind":"OWNER_REPORTED",
            "source_ref":SOURCE_REPORT,"candidate_sha":SOURCE,
            "observed_at":None,
            "host_cryptographically_verified":False,
            "release_certified":False,
            "detail":"Owner-reported 3494 source archive entries extracted; build/running/public not proven"}
def read_observations(path=None):
    if path is None:return []
    raw=pathlib.Path(path).read_bytes()
    need(len(raw)<=RECEIPT_MAX and (not raw or raw.endswith(b"\n")),
         "INPUT_RECEIPTS_UNBOUNDED_OR_TRUNCATED")
    rows=[];seen=set()
    for line in raw.splitlines():
        need(len(rows)<512 and 0<len(line)<=8192,"TOO_MANY_RECEIPTS")
        x=parse(line,8192)
        required={"schema","id","phase","verdict","evidence_kind",
                  "source_ref","source_sha","evidence_sha256","observed_at",
                  "expires_at","detail","verified_by"}
        need(type(x)is dict and set(x)==required and
             x["schema"]=="aoe2war.kingdom-runup.read-receipt.v1",
             "UNREVIEWED_OBSERVATION_SCHEMA")
        need(type(x["id"])is str and x["id"] not in seen and
             len(x["id"])<=120,"REPEATED_OBSERVATION")
        seen.add(x["id"])
        need(x["phase"] in PHASE_SET and x["verdict"] in ALLOWED_VERDICTS and
             x["evidence_kind"] in ALLOWED_KINDS and
             type(x["source_sha"])is str and HEX40.fullmatch(x["source_sha"]) and
             x["source_sha"]==SOURCE and
             type(x["evidence_sha256"])is str and HEX64.fullmatch(x["evidence_sha256"]) and
             type(x["source_ref"])is str and
             x["source_ref"].startswith("https://github.com/Emaren/") and
             type(x["detail"])is str and len(x["detail"])<=1024,
             "OBSERVATION_INCONSISTENT_OR_UNSOURCED")
        iso(x["observed_at"])
        if x["expires_at"] is not None:need(iso(x["expires_at"])>=iso(x["observed_at"]),
                                         "OBSERVATION_EXPIRY_BEFORE_CAPTURE")
        need(x["verified_by"] in ("NONE","SOURCE_REVIEW","F_POSTFLIGHT_REVIEW"),
             "UNREGISTERED_OBSERVER_AUTHORITY")
        # This reader never verifies host signatures: even F-labelled input
        # remains a reported observation pending actual backend verification.
        rows.append(x)
    return sorted(rows,key=lambda x:(x["observed_at"],x["id"]))
def project(registry=REGISTRY,bindings=BINDINGS,receipts=None,at=None):
    reg,cross,by_id=canonical(registry,bindings)
    ledger=ledger_module()
    state=ledger.view(ledger.seed_load(),ledger.read_events())
    clock=iso(at) if at is not None else None
    observations=read_observations(receipts)
    stages={name:{"phase":name,"state":"UNKNOWN","confidence":"UNVERIFIED",
                  "source_ref":None,"observed_at":None} for name in RUNUP_PHASES}
    first=source_seed_phase()
    stages[first["phase"]].update(state="OWNER_REPORTED",confidence="REPORTED_NOT_NATIVE",
                                 source_ref=first["source_ref"])
    # Later observations update the rail deterministically, without inventing
    # cumulative completion of earlier steps or a percent-progress bar.
    for x in observations:
        stale=(clock is not None and x["expires_at"] is not None and
               clock>iso(x["expires_at"]))
        label="STALE" if stale else ("REPORTED_"+x["verdict"])
        if x["phase"]=="LIVE_VERIFIED":
            label="AWAITING_INDEPENDENT_RELEASE_CERTIFICATION" if not stale else "STALE"
        stages[x["phase"]].update(state=label,confidence="OBSERVATION_UNVERIFIED",
                                   source_ref=x["source_ref"],
                                   observed_at=x["observed_at"])
    # OS cards come from canonical registry, not from live process enumeration.
    cards=[{"os_id":osid,"name":row["name"],"kind":"source-os-card",
            "source_status":row["status"],"live_worker_status":"UNVERIFIED",
            "live_pid":None,"worker_heartbeat_verified":False}
           for osid,row in by_id.items()]
    supervisory=[{"role_id":x["id"],"name":x["name"],
                  "kind":x["kind"],"independent_worker_proven":False}
                 for x in reg["supervisory_roles"]]
    mapped={x["lane"]:x["os_ids"] for x in cross["bindings"]}
    assignments=[{"lane":lane,"mapped_os_ids":mapped[lane],
                  "assigned":True,"active_worker_proven":False,
                  "result":a.get("result","UNKNOWN"),
                  "priority":a.get("priority","UNKNOWN")}
                 for lane,a in sorted(state["agents"].items()) if lane in mapped]
    public={"schema":"aoe2war.kingdom-runup.public-read.v1",
            "candidate_sha_short":SOURCE[:12],
            "pipeline":list(stages.values()),
            "release_live_verified":False,
            "evidence_mode":"SOURCE_OWNER_REPORTED_NOT_HOST_CERTIFIED",
            "autonomous_workers_verified":None,
            "notice":"No production activation inferred from source, CI or UI cards"}
    admin={"schema":"aoe2war.kingdom-runup.admin-read.v1",
           "candidate_sha":SOURCE,
           "registry_source":CENSUS_SOURCE,
           "registry_review_sha":cross["source_registry_sha"],
           "ledger_source_sha":cross["source_ledger_sha"],
           "pipeline":list(stages.values()),
           "observations":observations,
           "os_cards":cards,
           "roles":supervisory,"existing_supervisory_ui_roles":2,
           "proposed_supervisory_roles":1,"assigned_lanes":assignments,
           "source_state":"SOURCE_EXTRACTED_OWNER_REPORTED",
           "host_state":"HOST_NATIVE_UNVERIFIED",
           "public_state":"PUBLIC_ROUTING_UNVERIFIED",
           "live_state":"LIVE_VERIFIED_NOT_ISSUED",
           "worker_processes_independently_verified":None,
           "evidence_count":len(observations),
           "polling_started":False,"agent_jobs_started":False,
           "deployment_authority_granted":False}
    need(len(cards)==14 and len(supervisory)==3 and
         len(assignments)==6,"RUNUP_CANONICAL_PROJECTION_INTEGRITY")
    return {"public":public,"admin":admin}
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--audience",choices=("public","admin"),default="public")
    p.add_argument("--receipts",type=pathlib.Path)
    p.add_argument("--at",help="Explicit UTC reference for STALE, optional")
    a=p.parse_args()
    try:
        print(json.dumps(project(receipts=a.receipts,at=a.at)[a.audience],
                         sort_keys=True,indent=2))
        return 0
    except (ReadModelHold,OSError,TypeError,KeyError,ValueError) as e:
        print("HOLD:KINGDOM_RUNUP_READ_MODEL:"+
              (str(e) if isinstance(e,ReadModelHold) else type(e).__name__),
              file=sys.stderr)
        return 2
if __name__=="__main__":raise SystemExit(main())
