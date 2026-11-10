#!/usr/bin/env python3
"""R25 canonical Traffic archival certification gate, read-only.

This does NOT calculate human classes, read private IPs, backfill traffic,
alter the publisher, substitute raw visits, or grant publication. A trusted
out-of-band verifier must qualify any future signed daily-classification
receipts. Mere ledger capture/rollup timestamps are not such proof.
"""
from __future__ import annotations
from datetime import date,datetime,timedelta,timezone
from urllib.request import Request,build_opener,HTTPRedirectHandler
import argparse
import json
import re

PUBLIC_ORIGIN="http://127.0.0.1:3345"
PUBLIC_PATH="/api/projects/aoe2hdbets/public-audience-series"
PROJECT="aoe2hdbets"
FIRST_DAY=date(2026,6,11)
OLD_LAST_DAY=date(2026,10,19)
EXPECTED_KEYS=("confirmedHuman","suspectedHuman","totalTraffic")
MAX_BYTES=262144
H64=re.compile(r"^[0-9a-f]{64}$")

class Hold(ValueError):
    pass

def require(ok:bool,reason:str):
    if not ok:raise Hold("HOLD_TRAFFIC_CANONICAL_"+reason)

def exact_day(value:object) -> date:
    require(isinstance(value,str) and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}",value) is not None,"DAY_FORMAT")
    try:return date.fromisoformat(value)
    except ValueError:raise Hold("HOLD_TRAFFIC_CANONICAL_DAY_INVALID")

def positive_counts(point:dict):
    require(isinstance(point,dict) and set(point)==set(EXPECTED_KEYS),"AUDIENCE_SERIES_EXACT_SHAPE")
    t=point["totalTraffic"]; s=point["suspectedHuman"]; c=point["confirmedHuman"]
    require(all(type(x) is int and x>=0 for x in (t,s,c)) and c<=s<=t,
            "CLASSIFIED_AUDIENCE_HIERARCHY")

def verify_public_history(report:dict, today:date) -> dict:
    require(isinstance(report,dict) and report.get("ok") is True and
            report.get("project_slug")==PROJECT, "CANONICAL_ORIGIN_PROJECT")
    require(exact_day(report.get("coverage_started_at"))==FIRST_DAY,"CERTIFIED_FIRST_DAY_CHANGED")
    original=report.get("points")
    require(isinstance(original,list) and len(original)>=131 and len(original)<=4000,
            "PUBLIC_DAY_COUNT_UNVERIFIED")
    previous=None
    for idx,row in enumerate(original):
        require(isinstance(row,dict) and
                set(row)=={"date","calculatedAt","values"},"CANONICAL_ROW_SHAPE")
        day=exact_day(row["date"])
        require(day==FIRST_DAY+timedelta(days=idx),"CANONICAL_GAP_OR_DUPLICATE")
        require(day<today,"INCOMPLETE_TODAY_OR_FUTURE")
        t=row["calculatedAt"]
        require(isinstance(t,str) and t and ("+" in t or t.endswith("Z")),
                "CANONICAL_CLASSIFICATION_TIMESTAMP")
        try: timestamp=datetime.fromisoformat(t.replace("Z","+00:00"))
        except ValueError:raise Hold("HOLD_TRAFFIC_CANONICAL_CLASSIFICATION_TIMESTAMP")
        require(timestamp.tzinfo is not None and timestamp.utcoffset() is not None and
                timestamp.astimezone(timezone.utc).date()>=day+timedelta(days=1),
                "PREMATURE_OR_NAIVE_CLASSIFICATION")
        positive_counts(row["values"])
        previous=day
    require(previous==exact_day(report.get("coverage_ended_at")),
            "COVERAGE_END_MISMATCH")
    require(previous>=OLD_LAST_DAY,"OLD_CERTIFIED_HISTORY_LOST")
    days=(today-timedelta(days=1)-previous).days
    missing=[(previous+timedelta(days=x)).isoformat() for x in range(1,max(0,days)+1)]
    return {"project":PROJECT,"first":FIRST_DAY.isoformat(),"last_certified":previous.isoformat(),
            "certified_day_count":len(original),"missing_closed_days":missing,
            "missing_count":len(missing),"today_excluded":today.isoformat(),
            "original_three_series_preserved":True}

def qualify_external_daily_receipt(history:dict, approval:dict|None,
                                   verify_independent_authority=None) -> dict:
    """A signed authority adapter must be passed out-of-band; never trust receipt claims."""
    if not history["missing_closed_days"]:
        return {"status":"SOURCE_CONTRACT_NO_BACKFILL_NEEDED_NOT_PUBLICATION_AUTHORITY",
                "publish_authorized":False}
    require(type(approval) is dict and callable(verify_independent_authority),
            "INDEPENDENT_CLASSIFIER_AND_OWNER_APPROVAL_REQUIRED")
    require(set(approval)=={"schema","project","classified_days","classifier_sha256",
                             "canonical_source_root_sha256","owner_signature_sha256",
                             "scope","all_history_immutable"}, "CERTIFICATION_MANIFEST_FIELDS")
    require(approval["schema"]=="aoe2war.traffic.canonical-day-certification.v1" and
            approval["project"]==PROJECT and
            approval["scope"]=="CLASSIFIED_CANONICAL_HISTORY_ONLY" and
            approval["all_history_immutable"] is True, "CERTIFICATION_SCOPE")
    for field in ("classifier_sha256","canonical_source_root_sha256","owner_signature_sha256"):
        require(isinstance(approval[field],str) and H64.fullmatch(approval[field]) and
                approval[field]!="0"*64, "CERTIFICATION_PINS")
    days=approval["classified_days"]
    require(isinstance(days,list) and len(days)==history["missing_count"],"BACKFILL_DAY_COUNT")
    for expected,raw in zip(history["missing_closed_days"],days):
        require(isinstance(raw,dict) and set(raw)=={"date","values","classification_sha256",
                                                    "source_receipt_sha256","finalized_at_utc"},
                "DAY_RECEIPT_FIELDS")
        require(raw["date"]==expected, "DAY_NOT_EXACT_CONTINUATION")
        positive_counts(raw["values"])
        for field in ("classification_sha256","source_receipt_sha256"):
            require(isinstance(raw[field],str) and H64.fullmatch(raw[field]) and
                    raw[field]!="0"*64,"DAILY_EVIDENCE_HASH")
        require(isinstance(raw["finalized_at_utc"],str) and
                raw["finalized_at_utc"].endswith("+00:00"),"DAILY_FINALITY_UTC")
        try:final=datetime.fromisoformat(raw["finalized_at_utc"])
        except ValueError:raise Hold("HOLD_TRAFFIC_CANONICAL_FINALITY_TIMESTAMP")
        require(final.date()>exact_day(expected),"DAILY_FINALITY_PREMATURE")
    # This adapter MUST independently verify actual signatures and CLASSIFICATION
    # against the append-only authenticated ledger, not only report shape.
    try:auth=verify_independent_authority(approval)
    except Exception:raise Hold("HOLD_TRAFFIC_CANONICAL_INDEPENDENT_VERIFIER_FAILED")
    require(auth is True,"INDEPENDENT_VERIFIER_REJECTED")
    return {"status":"SOURCE_CONTRACT_ELIGIBLE_PENDING_PUBLISHER_AND_CENTRAL",
            "publish_authorized":False, "candidate_count":len(days),
            "verified_source_sha256":approval["canonical_source_root_sha256"]}

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        raise Hold("HOLD_TRAFFIC_CANONICAL_UNEXPECTED_REDIRECT")

def read_canonical_public():
    request=Request(PUBLIC_ORIGIN+PUBLIC_PATH,headers={"Accept":"application/json",
                                      "Cache-Control":"no-store"})
    with build_opener(NoRedirect()).open(request,timeout=8) as response:
        require(response.status==200 and response.headers.get("Content-Type","").startswith("application/json"),
                "PUBLIC_HTTP")
        data=response.read(MAX_BYTES+1)
        require(0<len(data)<=MAX_BYTES,"PUBLIC_RESPONSE_BOUNDS")
    try:return json.loads(data)
    except (ValueError,UnicodeError):raise Hold("HOLD_TRAFFIC_CANONICAL_PUBLIC_JSON")

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--probe",action="store_true",required=True)
    args=parser.parse_args()
    try:
        report=verify_public_history(read_canonical_public(),datetime.now(timezone.utc).date())
        if report["missing_count"]:
            report.update(status="HOLD_TRAFFIC_CANONICAL_DAILY_CLASSIFICATION_NOT_PUBLISHED",
                          publish_authorized=False)
            print(json.dumps(report,sort_keys=True))
            return 2
        report.update(status="PASS_HISTORY_CONTINUITY_SOURCE_ONLY_NOT_RELEASE_AUTHORITY",
                      publish_authorized=False)
        print(json.dumps(report,sort_keys=True))
        return 0
    except Hold as e:
        print(json.dumps({"status":str(e),"publish_authorized":False,"private_data_read":False}))
        return 3

if __name__=="__main__":raise SystemExit(main())
