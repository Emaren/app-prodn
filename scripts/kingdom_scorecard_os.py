#!/usr/bin/env python3
"""Kingdom Scorecard OS: nine independent, directional standards.

Source-only extension of Scan OS V2 and Organization OS. Neither a JSON flag
nor a score authorizes host access, capacity reclaim, signing or retirement.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat

from scan_os import load_catalog
from organization_os import graph, load_links
from scan_os_maturity import score as original_maturity

ROOT=Path(__file__).resolve().parents[1]
STANDARDS=ROOT/"config/kingdom-scorecard-standards.v1.json"
HISTORY=ROOT/"config/kingdom-scorecard-grade-history.v1.json"
NAMES=("strength","necessity","relevance","redundancy_risk",
       "storage_efficiency","cost_complexity_risk","recovery","security","operator_value")
RISK=frozenset(("redundancy_risk","cost_complexity_risk"))
MAX_BYTES=180000


class ScorecardHold(ValueError):
    pass


def need(ok,why):
    if not ok:
        raise ScorecardHold("SCORECARD_HOLD_"+why)


def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()


def fingerprint(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def read_source(path):
    path=Path(path)
    need(path.is_file() and not path.is_symlink(), "NOT_REGULAR_SOURCE")
    s=path.lstat()
    need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and
         1<=s.st_size<=MAX_BYTES and
         not(stat.S_IMODE(s.st_mode)&0o022), "SOURCE_MODE_SIZE")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        b=os.fstat(fd)
        need((b.st_dev,b.st_ino,b.st_size,b.st_mtime_ns)==
             (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns), "SOURCE_FD_RACE")
        raw=os.read(fd,MAX_BYTES+1)
        c=os.fstat(fd)
        need((c.st_ino,c.st_size,c.st_mtime_ns)==
             (b.st_ino,b.st_size,b.st_mtime_ns), "SOURCE_READ_RACE")
        need(len(raw)==s.st_size,"SOURCE_SHORT_READ")
    finally:
        os.close(fd)
    def no_repeat(pairs):
        out={}
        for k,v in pairs:
            need(k not in out, "DUPLICATE_JSON_FIELD")
            out[k]=v
        return out
    return json.loads(raw,object_pairs_hook=no_repeat)


def validate_standard(s):
    need(type(s) is dict and s.get("schema")==
         "aoe2war.kingdom.scorecard.standards.v1", "STANDARD_SCHEMA")
    need(s.get("authority")==
         "SOURCE_ONLY_GRADE_DEFINITIONS_NOT_SIGNED_EVIDENCE", "STANDARD_AUTHORITY")
    need(s.get("root_maturity_rubric")==
         "config/scan-os-maturity-rubric.v1.json", "ORIGINAL_RUBRIC_LINK")
    need(s.get("composite")=="DISABLED_DIRECTIONAL_AND_NECESSITY_FACETS_NOT_INTERCHANGEABLE" and
         s.get("unknown_value") is None and s.get("gate_points")==20 and
         s.get("security_and_recovery_veto")=="NO_GREEN_WITH_FAILED_CRITICAL_EVIDENCE",
         "RISK_DIRECTION_GUARDS")
    need(type(s.get("version")) is str and re.fullmatch(r"2026-11-22\.v[1-9][0-9]*",s["version"]),
         "VERSION")
    require_time(s.get("effective_at_utc"))
    dims=s.get("dimensions")
    need(type(dims) is list and len(dims)==len(NAMES) and
         tuple(d["id"] for d in dims)==NAMES,"DIMENSION_COUNT_OR_ID")
    gates=set()
    for d in dims:
        need(type(d.get("title")) is str and
             type(d.get("meaning_of_100")) is str and
             len(d["meaning_of_100"])>=35,"EXPLICIT_MEANING_OF_100")
        need(d.get("effective_at_utc")==s["effective_at_utc"] and
             d.get("direction")==("higher_is_worse" if d["id"] in RISK else
                                   "higher_means_more_necessary" if d["id"]=="necessity" else
                                   "higher_means_more_relevant_now" if d["id"]=="relevance" else
                                   "higher_is_better"),"DIRECTION_OR_DATE")
        need(d.get("gate_points")==20 and
             type(d.get("gates")) is list and len(d["gates"])==5,"FIVE_EQUAL_GATES")
        for i,g in enumerate(d["gates"],1):
            expected=d["id"].upper()+"_"+str(i)
            need(type(g) is dict and g.get("gate_id")==expected and
                 g.get("requires")=="ORIGINAL_INDEPENDENT_EVIDENCE_VERIFIER" and
                 type(g.get("description")) is str and len(g["description"])>=15 and
                 expected not in gates,"GATE_STANDARD_DRIFT")
            gates.add(expected)
    need(len(gates)==45,"FORTY_FIVE_GATES")
    return s


def require_time(value):
    need(type(value) is str and value.endswith("Z"),"UTC_DATE")
    try:
        d=dt.datetime.fromisoformat(value.replace("Z","+00:00"))
        need(d.utcoffset()==dt.timedelta(0),"UTC_OFFSET")
    except ValueError as exc:
        raise ScorecardHold("SCORECARD_HOLD_BAD_DATE") from exc


def validate_grade_history(history,standards):
    need(type(history) is dict and history.get("schema")==
         "aoe2war.kingdom.scorecard.grade-history.v1" and
         history.get("authority")=="SOURCE_ONLY_IMMUTABLE_VERSIONED_SCORE_RECEIPTS",
         "HISTORY_SCHEMA")
    rows=history.get("snapshots")
    need(type(rows) is list and len(rows)<=1024,"HISTORY_BOUNDED")
    previous=None
    seen=set()
    for r in rows:
        need(type(r) is dict and set(r)=={
             "snapshot_id","feature_id","dimension_id","value","grade_status",
             "standard_version","standard_sha256","standard_effective_at_utc",
             "snapshot_at_utc","evidence_refs","source_commit"}, "HISTORY_EXACT_FIELDS")
        need(type(r["snapshot_id"]) is str and r["snapshot_id"] not in seen,
             "HISTORY_REWRITE_OR_DUPLICATE_ID")
        seen.add(r["snapshot_id"])
        require_time(r["snapshot_at_utc"])
        require_time(r["standard_effective_at_utc"])
        need(r["grade_status"] in ("UNKNOWN","CERTIFIED","LOCAL_ONLY","PROVISIONAL") and
             (r["value"] is None or type(r["value"]) is int and 0<=r["value"]<=100) and
             (r["grade_status"]!="UNKNOWN" or r["value"] is None) and
             type(r["evidence_refs"]) is list and
             type(r["standard_sha256"]) is str and
             re.fullmatch(r"[0-9a-f]{64}",r["standard_sha256"]),
             "HISTORY_VALUE_OR_DIGEST")
        need(type(r["source_commit"]) is str and
             re.fullmatch(r"[a-f0-9]{40}",r["source_commit"]),
             "HISTORY_COMMIT")
        if previous is not None:
            need((r["snapshot_at_utc"],r["snapshot_id"])>
                 (previous["snapshot_at_utc"],previous["snapshot_id"]),
                 "HISTORY_OUT_OF_ORDER")
        previous=r
    # Original standards are part of git history; records preserve their own
    # source hash, effective date, grade and evidence rather than being rescored.
    return history


def grade_dimension(feature,standard,claims=None,verifier=None,as_of=None):
    """claims alone never count. A separately source-owned verifier is mandatory.

    No CLI receives a verifier. This function is only an isolated arithmetic
    engine for independently admitted future producer adapters and tests.
    """
    need(type(feature) is str and feature, "FEATURE_ID")
    claims=claims or {}
    need(type(claims) is dict,"CLAIMS_SHAPE")
    as_of=as_of or dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00","Z")
    require_time(as_of)
    points=0
    omitted=0
    gates=[]
    evidence=[]
    for gate in standard["gates"]:
        k=gate["gate_id"]
        raw=claims.get(k)
        if raw is None or verifier is None:
            result="UNKNOWN"
        else:
            need(type(raw) is dict and
                 set(raw)=={"gate_id","observed","original_evidence_ref"} and
                 raw.get("gate_id")==k and type(raw.get("observed")) is bool and
                 type(raw.get("original_evidence_ref")) is str and
                 raw["original_evidence_ref"],"UNTRUSTED_CLAIM_SHAPE")
            # Callable verifier is an independent trusted *read-only*
            # adapter, not a permission or a signed-root verification.
            admitted=verifier(feature,k,raw["original_evidence_ref"],as_of) is True
            result=("OBSERVED_TRUE" if raw["observed"] else "OBSERVED_FALSE") if admitted else "UNKNOWN"
        if result=="UNKNOWN":
            omitted+=20
        else:
            if result=="OBSERVED_TRUE":
                points+=20
            evidence.append(raw["original_evidence_ref"])
        gates.append({"gate_id":k,"evidence_status":result,
                      "weight":20,"why_missing":gate["description"] if result=="UNKNOWN" else None})
    exact=(points if omitted==0 else None)
    return {"feature_id":feature,"dimension_id":standard["id"],
            "standard_version":None,"effective_at_utc":standard["effective_at_utc"],
            "meaning_of_100":standard["meaning_of_100"],
            "direction":standard["direction"],
            "score":exact,"grade_status":"SOURCE_LOCAL_ONLY" if exact is not None else "UNKNOWN",
            "supported_lower_bound":points,"possible_upper_bound":points+omitted,
            "unmeasured_weight":omitted,"missing_points_reason":[
                g["why_missing"] for g in gates if g["why_missing"]],
            "improvement":"Admit independent source receipt for each missing gate; test impact before changing standard",
            "improvement_cost_estimate":None,"primary_issue":"Emaren/app-prodn/issues/1467",
            "as_of_utc":as_of,"evidence_refs":evidence,"gates":gates,
            "production_certified":False,"mutations_authorized":False}


def render(standard,history,*,only_id=None):
    validate_standard(standard)
    validate_grade_history(history,standard)
    g=graph(load_links(),load_catalog())
    nodes=[x for x in g["objects"] if only_id is None or x["id"]==only_id]
    need(nodes,"NO_SUCH_REGISTERED_OBJECT")
    records=[]
    for n in nodes:
        for dim in standard["dimensions"]:
            row=grade_dimension(n["id"],dim)
            row["standard_version"]=standard["version"]
            row["object_source"]={"repo":n["repo"],"path":n["path"],
                                  "owner":n["owner"],"producer":n["producer"]}
            records.append(row)
    return {"schema":"aoe2war.kingdom.scorecard.current.v1",
            "authority":"READ_ONLY_UNCERTIFIED_NO_OWNER_APPROVAL",
            "rubric_sha256":fingerprint(standard),
            "standard_version":standard["version"],
            "effective_at_utc":standard["effective_at_utc"],
            "current_scores":records,"historic_snapshots":history["snapshots"],
            "historical_versions_must_not_be_rewritten":True,
            "composite_score":None,
            "prior_subjective_54_overall": "PROVISIONAL_NOT_CERTIFIED_NOT_USED",
            "critical_green_veto":True,"retire_authorized":False}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--feature-id")
    a=p.parse_args()
    try:
        result=render(read_source(STANDARDS),read_source(HISTORY),only_id=a.feature_id)
    except (ScorecardHold,OSError,ValueError,KeyError,TypeError) as exc:
        print(json.dumps({"status":"HOLD","reason":str(exc),"retire_authorized":False}))
        return 3
    print(json.dumps(result,sort_keys=True,indent=2))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
