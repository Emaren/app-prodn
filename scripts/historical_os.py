#!/usr/bin/env python3
"""Historical OS: independent, unprivileged source/history classification.

Never authorizes COPY, ROOT unlink, recovery deletion, scans, or archival.
It consumes immutable source identities only; physical claims remain UNKNOWN
until an original signed and independently tested producer supplies them.
"""
from __future__ import annotations

import argparse
import json
import re

from kingdom_scorecard_os import read_source
from scan_os import load_catalog
from organization_os import graph,load_links
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CLASSES=ROOT/"config/historical-os-classification.v1.json"
COHORTS=ROOT/"config/historical-os-cohorts.v1.json"
LEVELS={"L1","L2","L3","L4","L5","UNKNOWN"}
SURFACES={"HEL1_ROOT","HEL1_DATA","M1_DEV","INTEL_COLD","GITHUB_SOURCE","UNKNOWN"}
ROLES={"LIVE","HOT","COLD","SOLE","PROOF","SOURCE","UNKNOWN"}
HEX40=re.compile(r"^[a-f0-9]{40}$")
SHA256=re.compile(r"^[a-f0-9]{64}$")
ID=re.compile(r"^[A-Z][A-Z0-9_]{4,79}$")


class HistoricalHold(ValueError):
    pass


def need(condition,reason):
    if not condition:
        raise HistoricalHold("HISTORICAL_HOLD_"+reason)


def validate_classes(m):
    need(type(m) is dict and m.get("schema")==
         "aoe2war.historical-os.classification.v1" and
         m.get("authority")=="SOURCE_ONLY_NON_EXECUTABLE_HISTORY_DECISION" and
         m.get("version")=="2026-11-22.v1" and
         m.get("source_issue")=="Emaren/app-prodn/issues/1468",
         "CLASSES_SCHEMA_AND_SOURCE")
    types=m.get("object_types")
    need(type(types) is list and len(types)==17 and
         len({t.get("id") for t in types})==17,"ORIGINAL_HISTORY_TYPE_SET")
    need(m.get("legal_retirement_rule")=="NO_SOURCE_ONLY_MODEL_CAN_GRANT_RETIRE_READY" and
         m.get("change_policy")=="ONE_SOURCE_VERSION_PER_MEANING_AND_GIT_IMMUTABLE_HISTORY",
         "NO_AUTO_RETIRE_AND_VERSION")
    need(m.get("classification_levels")==["L1","L2","L3","L4","L5","UNKNOWN"],
         "CLASS_LEVELS")
    need(m.get("surface_links")==["HEL1_ROOT","HEL1_DATA","M1_DEV","INTEL_COLD",
                                    "GITHUB_SOURCE","UNKNOWN"],"FOUR_SURFACES_AND_GITHUB")
    need(type(m.get("signed_copy_requires")) is list and
         type(m.get("signed_retire_requires")) is list and
         len(m["signed_retire_requires"])>=8 and
         "COPY_NEVER_RETIRE" in m.get("safety",[]) and
         "L5_ALWAYS_DENY" in m.get("safety",[]) and
         "L4_HUMAN_ONLY" in m.get("safety",[]),"SIGNED_COPY_RETIRE_SPLIT")
    return m


def validate_cohorts(m,model,orgids):
    need(type(m) is dict and m.get("schema")==
         "aoe2war.historical-os.source-cohorts.v1" and
         m.get("authority")=="SOURCE_ONLY_SNAPSHOT_NOT_LIVE_FILESYSTEM_CENSUS" and
         m.get("version")==model["version"] and
         m.get("no_automatic_retire") is True,"COHORT_SOURCE_ONLY")
    rows=m.get("objects")
    need(type(rows) is list and 1<=len(rows)<=128,"COHORT_BOUNDS")
    known={t["id"] for t in model["object_types"]}
    seen=set()
    for r in rows:
        need(type(r) is dict and type(r.get("id")) is str and
             ID.fullmatch(r["id"]) and r["id"] not in seen,"OBJECT_UNIQUE_ID")
        seen.add(r["id"])
        need(r.get("type") in known and r.get("surface") in SURFACES and
             r.get("role") in ROLES and r.get("level") in LEVELS,
             "CLASS_ROLE_LEVEL")
        need(r.get("evidence_source")==m.get("source_issue") and
             r.get("evidence_status")=="SOURCE_RECORDED_NOT_CURRENT_HOST_ATTESTED",
             "EVIDENCE_IS_NOT_LIVE")
        need(r.get("source_sha") is None or
             type(r["source_sha"]) is str and HEX40.fullmatch(r["source_sha"]),
             "OBJECT_SOURCE_SHA")
        need(r.get("reported_gross_bytes") is None or
             type(r["reported_gross_bytes"]) is int and
             0<=r["reported_gross_bytes"]<=10**15 and
             r.get("gross_unit")=="SOURCE_REPORTED_GROSS_NOT_UNIQUE",
             "GROSS_NOT_UNIQUE")
        need(r.get("verified_unique_bytes") is None and
             r.get("verified_physical_reclaimed_bytes") is None and
             r.get("signed_copy_capability") is None and
             r.get("signed_retire_capability") is None and
             r.get("recipient_ack_sha256") is None and
             r.get("independent_restore_sha256") is None,
             "FORGED_SIGNED_OR_UNIQUE_PROOF")
        need(r.get("fs_uuid") is None and
             r.get("device") is None and r.get("inode") is None and
             r.get("last_live_verified_at") is None,
             "FORGED_CURRENT_HOST_ID")
        need(r.get("copies") is None and
             r.get("original_locator")=="PRIVATE_OWNER_SOURCE_NOT_EXPORTED",
             "NO_INVENTED_COPIES_OR_PRIVATE_PATH")
        need(type(r.get("consumers")) is list and
             len(r["consumers"])<=16 and
             len(r["consumers"])==len(set(r["consumers"])),
             "CONSUMER_LIST")
        need(r.get("organization_ref") in orgids,"UNKNOWN_SHARED_ORGANIZATION_ID")
        if r["role"] in ("LIVE","HOT","SOLE"):
            need(r["level"] in ("L5","UNKNOWN"),
                 "L4_CANNOT_OVERRIDE_ACTIVE_ROLLBACK")
        if r["type"] in ("CHAIN_STATE","PERSONAL_OR_EVIDENCE",
                          "PG_DATABASE_WAL"):
            need(r["level"]=="L5","HARD_PROTECTED_TYPE")
    need("BAE_CURRENT_890D" in seen and
         "DBCEB_T5_T8_PREDECESSOR" in seen and
         "GITHUB_WEBSITE_SOURCE" in seen,"CANONICAL_COHORT_MISSING")
    return rows


def disposition(r):
    """Classification is advice only; never proves a signed runtime grant."""
    if r["level"]=="L5" or r["role"] in ("LIVE","HOT","SOLE"):
        action="KEEP_PROTECTED"
        blocker="LIVE_HOT_UNIQUE_FINANCIAL_OR_USER_SOURCE_DO_NOT_RETIRE"
    elif r["level"]=="L4":
        action="COLD_COPY_REVIEW_HUMAN_HOLD"
        blocker="L4_HUMAN_APPROVAL_AND_ORIGINAL_SOURCE_RECOVERY_AUTHORITY_ABSENT"
    elif r["level"]=="UNKNOWN":
        action="SOURCE_CLASSIFICATION_AND_COPY_REVIEW_HOLD"
        blocker="STRONGEST_HISTORICAL_CLASS_UNADMITTED"
    else:
        action="COPY_REVIEW_ONLY"
        blocker="NO_ORIGINAL_SIGNED_COPY_AND_INDEPENDENT_RESTORE"
    return {"id":r["id"],"organization_ref":r["organization_ref"],
            "type":r["type"],"role":r["role"],"surface":r["surface"],
            "level":r["level"],"posture":action,
            "reported_gross_bytes":r["reported_gross_bytes"],
            "physical_unique_bytes":None,"physical_reclaimed_bytes":None,
            "source_sha":r["source_sha"],"build_id":r["build_id"],
            "consumer_refs":r["consumers"],
            "copies":"UNKNOWN_NOT_ZERO","signed_copy":"UNKNOWN_NOT_ENROLLED",
            "isolated_restoration":"UNKNOWN_NOT_ATTESTED",
            "retire_ready":False,"retire_authorized":False,
            "why_hold":blocker,"evidence_source":r["evidence_source"],
            "verification_stage":"SOURCE_RECORDED_ONLY",
            "owner_next_action":"ORIGINAL_SOURCE_OWNER_INSPECT_AND_ISSUE_ONLY_VALID_INDEPENDENT_PROOFS"}


def build(model,cohorts,*,only_id=None):
    validate_classes(model)
    original=graph(load_links(),load_catalog())
    orgids={n["id"] for n in original["objects"]}
    rows=validate_cohorts(cohorts,model,orgids)
    records=[disposition(r) for r in rows if only_id is None or r["id"]==only_id]
    need(records,"OBJECT_NOT_IN_ORIGINAL_SOURCE_CATALOG")
    return {"schema":"aoe2war.historical-os.read-only-projection.v1",
            "version":model["version"],"source_issue":model["source_issue"],
            "authority":"SOURCE_ONLY_NOT_CURRENT_HOST_ATTESTATION",
            "shared_organization_graph_schema":original["schema"],
            "objects":records,
            "source_record_count":len(rows),
            "verified_total_unique_reclaim_bytes":None,
            "native_net_reclaim_bytes":None,
            "unmeasured_residual":cohorts["missing_coverage"],
            "source_copy_equals_restoration":False,
            "retire_permit_issued":False,
            "root_mutation_authorized":False,
            "historical_ui_live":False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--object-id")
    a=parser.parse_args()
    try:
        obj=build(read_source(CLASSES),read_source(COHORTS),only_id=a.object_id)
    except (HistoricalHold,OSError,ValueError,KeyError,TypeError) as exc:
        print(json.dumps({"status":"HOLD","reason":str(exc),
                          "root_mutation_authorized":False}))
        return 3
    print(json.dumps(obj,indent=2,sort_keys=True))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
