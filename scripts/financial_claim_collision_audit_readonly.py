#!/usr/bin/env python3
"""Offline, privacy-safe 61-hash collision receipt validator. NEVER authorizes payouts.

Input is 21-column pipe-separated rows from the exact reviewed read-only SQL.
Prints only claim IDs and nonidentifying aggregates; no chain/network/DB calls.
Valid report exit=3 (NONAUTHORIZING); inconsistent or unsafe input exit=2.
"""
from __future__ import annotations
import argparse
from collections import Counter
from decimal import Decimal, InvalidOperation
import json
import os
from pathlib import Path
import re
import stat
import sys

FIELDS = ("row_no priority_pair structural_class claim_ids claim_rows claimed_wolo "
          "indexed_rows indexed_mainnet_wolo market_count kind_count group_key_count "
          "linked_user_count unlinked_rows player_key_count missing_game_rows attempted_rows "
          "market_key_rows founder_key_rows jims_rule_rows integrity_rows foreign_rows").split()
PRIORITIES = {"777/8082": {777,8082}, "782/8086": {782,8086},
              "712/7001": {712,7001}, "2712/2760": {2712,2760},
              "710/6866": {710,6866}}
CLASSES = {"LOCAL_INDEX_MISSING", "CHAIN_OR_DENOM_REVIEW", "CROSS_KIND_REVIEW",
           "CROSS_MARKET_REVIEW", "CLAIM_GROUP_REVIEW", "REUSED_HASH_REVIEW"}
MAX_BYTES = 262144
DIGITS = re.compile(r"(?:0|[1-9][0-9]*)\Z")
DECIMAL = re.compile(r"(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?\Z")
CLAIM_IDS = re.compile(r"[1-9][0-9]*(?:,[1-9][0-9]*)*\Z")

class Hold(ValueError): pass
def need(ok, reason):
    if not ok: raise Hold(reason)

def load_bounded(path: Path) -> str:
    need(path.is_absolute() and not path.is_symlink(), "ABSOLUTE_NONSYMLINK_REQUIRED")
    before = path.lstat()
    need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
         0 < before.st_size <= MAX_BYTES, "UNSAFE_INPUT_SIZE_OR_TYPE")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        opened = os.fstat(fd)
        raw = os.read(fd, MAX_BYTES+1)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    need((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns) ==
         (opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns) and
         (opened.st_size,opened.st_mtime_ns,opened.st_ctime_ns) ==
         (after.st_size,after.st_mtime_ns,after.st_ctime_ns) and
         len(raw)==before.st_size, "INPUT_CHANGED")
    try: return raw.decode("ascii")
    except UnicodeDecodeError: raise Hold("NONASCII_INPUT") from None

def num(raw: str) -> int:
    need(DIGITS.fullmatch(raw) is not None, "BAD_INTEGER")
    return int(raw)

def amount(raw: str) -> Decimal:
    need(DECIMAL.fullmatch(raw) is not None, "BAD_DECIMAL")
    try: return Decimal(raw)
    except InvalidOperation: raise Hold("BAD_DECIMAL") from None

def classify(row):
    if row["indexed_rows"] == 0: return "LOCAL_INDEX_MISSING"
    if row["foreign_rows"] > 0: return "CHAIN_OR_DENOM_REVIEW"
    if row["kind_count"] > 1: return "CROSS_KIND_REVIEW"
    if row["market_count"] > 1: return "CROSS_MARKET_REVIEW"
    if row["group_key_count"] > 1: return "CLAIM_GROUP_REVIEW"
    return "REUSED_HASH_REVIEW"

def parse(content: str):
    rows=[]; seen_ids=set(); seen_priority=set()
    for line in content.splitlines():
        if not line.strip() or line in {"BEGIN","ROLLBACK"}: continue
        parts=line.split("|")
        need(len(parts)==len(FIELDS), "UNEXPECTED_MANIFEST_COLUMN_COUNT")
        d=dict(zip(FIELDS,parts))
        need(d["priority_pair"] in PRIORITIES or d["priority_pair"]=="-", "UNKNOWN_PRIORITY")
        need(d["structural_class"] in CLASSES, "UNKNOWN_CLASS")
        need(CLAIM_IDS.fullmatch(d["claim_ids"]) is not None, "INVALID_CLAIM_IDS")
        ids=[int(v) for v in d.pop("claim_ids").split(",")]
        need(ids==sorted(set(ids)), "UNSORTED_OR_DUPLICATE_GROUP")
        need(not seen_ids.intersection(ids), "CLAIM_PRESENT_IN_TWO_HASH_GROUPS")
        seen_ids.update(ids)
        for k in FIELDS:
            if k in {"priority_pair","structural_class","claim_ids","claimed_wolo","indexed_mainnet_wolo"}:continue
            d[k]=num(d[k])
        for k in ("claimed_wolo","indexed_mainnet_wolo"):
            d[k]=amount(d[k])
        need(d["row_no"]==len(rows)+1 and d["claim_rows"]==len(ids)>=2,
             "GROUP_ID_OR_CARDINALITY_INVALID")
        need(d["claimed_wolo"]>0 and d["kind_count"]>=1 and d["kind_count"]<=len(ids) and
             0<=d["market_count"]<=len(ids) and d["group_key_count"]>=1 and
             d["group_key_count"]<=len(ids) and
             0<=d["linked_user_count"]<=len(ids) and
             0<=d["unlinked_rows"]<=len(ids) and
             0<=d["player_key_count"]<=len(ids) and
             0<=d["attempted_rows"]<=len(ids) and
             0<=d["missing_game_rows"]<=len(ids) and
             d["foreign_rows"]<=d["indexed_rows"],"INVALID_COUNTS")
        need(sum(d[k] for k in ("market_key_rows","founder_key_rows",
                 "jims_rule_rows","integrity_rows"))<=len(ids),"FAMILY_COUNTS_INVALID")
        need(d["structural_class"]==classify(d),"CLASSIFICATION_MISMATCH")
        priority=d["priority_pair"]
        if priority!="-":
            need(priority not in seen_priority and set(PRIORITIES[priority]).issubset(ids),
                 "PRIORITY_IDENTITY_MISMATCH")
            seen_priority.add(priority)
        else:
            need(not any(pair.issubset(ids) for pair in PRIORITIES.values()),
                 "PRIORITY_OMITTED")
        # Claim IDs are internal row identities, not deduplication instructions.
        d["claim_ids"]=ids
        d["flags"]=[name for name,present in (
          ("LOCAL_INDEX_MISSING",d["indexed_rows"]==0),
          ("CROSS_CLAIM_KIND",d["kind_count"]>1),
          ("CROSS_MARKET",d["market_count"]>1),
          ("MULTIPLE_CLAIM_GROUPS",d["group_key_count"]>1),
          ("MULTIPLE_LINKED_USERS",d["linked_user_count"]>1),
          ("UNLINKED_CLAIM",d["unlinked_rows"]>0),
          ("FOREIGN_CHAIN_OR_DENOM",d["foreign_rows"]>0)) if present]
        rows.append(d)
    need(rows,"EMPTY_MANIFEST")
    return rows

def output(rows, historical=False):
    total=lambda key:sum((r[key] for r in rows),0)
    pri={r["priority_pair"]:r for r in rows if r["priority_pair"]!="-"}
    un=[r for r in rows if r["indexed_rows"]==0]
    gross=total("claimed_wolo");index=total("indexed_mainnet_wolo")
    priority_gap=sum((v["claimed_wolo"]-v["indexed_mainnet_wolo"] for v in pri.values()),Decimal(0))
    baseline={
      "group_count":61,"claim_rows":137,"gross_wolo":"64878",
      "local_index_event_rows":53,"local_index_wolo":"31379",
      "unindexed_groups":8,"unindexed_claim_rows":19,
      "unindexed_gross_wolo":"1900","descriptive_gap_wolo":"33499",
      "priority_count":5,"priority_descriptive_gap_wolo":"30500",
    }
    actual={
      "group_count":len(rows),"claim_rows":total("claim_rows"),
      "gross_wolo":str(gross),
      "local_index_event_rows":total("indexed_rows"),
      "local_index_wolo":str(index),
      "unindexed_groups":len(un),"unindexed_claim_rows":sum(r["claim_rows"] for r in un),
      "unindexed_gross_wolo":str(sum((r["claimed_wolo"] for r in un),Decimal(0))),
      "descriptive_gap_wolo":str(gross-index),
      "priority_count":len(pri),"priority_descriptive_gap_wolo":str(priority_gap),
    }
    def same(x,y):
        if isinstance(y,str):return Decimal(x)==Decimal(y)
        return x==y
    matched=all(same(actual[k],v) for k,v in baseline.items())
    summary={
       "schema":"aoe2war.claim-hash-collision-structural-audit.v1",
       "status":"HISTORICAL_BASELINE_MATCH_NONAUTHORIZING"
         if historical and matched else "HISTORICAL_BASELINE_DRIFT_HOLD" if historical
         else "OBSERVATION_ONLY_NONAUTHORIZING",
       "source_commit":"1eeffc6b82e5d3b79b09fa493a19e74fe208acd5",
       "counts":actual,"expected_historical":baseline if historical else None,
       "historical_baseline_matches":matched if historical else None,
       "classification_counts":dict(sorted(Counter(r["structural_class"] for r in rows).items())),
       "cross_kind_groups":sum(r["kind_count"]>1 for r in rows),
       "cross_market_groups":sum(r["market_count"]>1 for r in rows),
       "group_key_divergent_groups":sum(r["group_key_count"]>1 for r in rows),
       "priority_pairs":[{
          "pair":name,"claim_ids":pri[name]["claim_ids"],
          "classification":pri[name]["structural_class"],
          "claimed_wolo":str(pri[name]["claimed_wolo"]),
          "indexed_wolo":str(pri[name]["indexed_mainnet_wolo"]),
          "descriptive_gap_wolo":str(pri[name]["claimed_wolo"]-pri[name]["indexed_mainnet_wolo"]),
          "flags":pri[name]["flags"]} for name in PRIORITIES if name in pri],
       "all_groups":[{
          "row_no":r["row_no"],"claim_ids":r["claim_ids"],
          "structural_class":r["structural_class"],"flags":r["flags"],
          "claim_rows":r["claim_rows"],"gross_wolo":str(r["claimed_wolo"]),
          "local_index_wolo":str(r["indexed_mainnet_wolo"]),
          "priority_pair":r["priority_pair"],
          "chain_finality":"UNKNOWN","bank_effect":"UNKNOWN",
          "economic_entitlement":"UNRESOLVED_ATTRIBUTION"} for r in rows],
       "no_identity_or_tx_hash_output":True,
       "local_index_is_not_chain_finality":True,
       "financial_release_authorized":False,
       "payout_or_retry_authorized":False,
    }
    return summary,(3 if (not historical or matched) else 2)

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest",type=Path,required=True)
    ap.add_argument("--expect-historical",action="store_true")
    args=ap.parse_args()
    try:
        data=load_bounded(args.manifest)
        result,rc=output(parse(data),args.expect_historical)
        print(json.dumps(result,sort_keys=True,separators=(",",":")))
        return rc
    except (Hold,OSError) as e:
        print(json.dumps({"status":"HOLD_INVALID_RECEIPT",
           "reason":str(e) if isinstance(e,Hold) else "INPUT_UNAVAILABLE",
           "financial_release_authorized":False},sort_keys=True))
        return 2

if __name__=="__main__":raise SystemExit(main())
