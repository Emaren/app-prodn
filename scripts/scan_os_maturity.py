#!/usr/bin/env python3
"""Original Scan OS 0–100 maturity rubric: evidence-bound ranges, never guessed 100.

Only local structural/profile criteria can pass automatically. Host, financial,
recovery, production, and signed-owner gates require original independent
verifiers and remain UNKNOWN rather than inheriting arbitrary JSON flags.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import stat

from scan_os_learning import learning_summary, owned_private
from organization_os import graph, load_links, project, VIEWS
from scan_os import load_catalog

ROOT = Path(__file__).resolve().parents[1]
RUBRIC = ROOT / "config/scan-os-maturity-rubric.v1.json"
LOCAL_VALID = {"LOCAL_PROFILE_TRIAD", "LOCAL_INCREMENTAL_REUSE",
               "LOCAL_BOUNDED_DEEP", "LOCAL_STATISTICAL_SAMPLE",
               "LOCAL_GRAPH_VALID", "LOCAL_ORIGINAL_PRODUCERS",
               "LOCAL_EIGHT_VIEWS"}
MAX_BYTES = 65536


class MaturityHold(ValueError):
    pass


def need(cond, code):
    if not cond:
        raise MaturityHold("MATURITY_HOLD_" + code)


def rubric(file=RUBRIC):
    file = Path(file)
    need(file.is_file() and not file.is_symlink()
         and file.stat().st_size <= MAX_BYTES, "RUBRIC_SOURCE")
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1, "RUBRIC_FD")
        raw = os.read(fd, MAX_BYTES + 1)
        after = os.fstat(fd)
        need((before.st_ino, before.st_size, before.st_mtime_ns) ==
             (after.st_ino, after.st_size, after.st_mtime_ns),
             "RUBRIC_RACE")
    finally:
        os.close(fd)
    def unique(pairs):
        d = {}
        for k, v in pairs:
            need(k not in d, "DUPLICATE_JSON_FIELD")
            d[k] = v
        return d
    data = json.loads(raw, object_pairs_hook=unique)
    need(type(data) is dict and set(data) ==
         {"schema", "authority", "scoring", "dimensions", "proof_classes"} and
         data["schema"] == "aoe2war.scan-os.maturity-rubric.v1" and
         data["authority"] == "MEASURED_LOCAL_LOWER_BOUND_NOT_PRODUCTION_CERTIFICATION",
         "RUBRIC_SCHEMA")
    cfg = data["scoring"]
    need(cfg["dimensions"] == 7 and cfg["criteria_per_dimension"] == 5 and
         cfg["weight_per_criterion"] == 20 and cfg["max_dimension_score"] == 100
         and cfg["missing"] == "UNKNOWN_NOT_ZERO_OR_PASS" and
         cfg["no_unverified_boolean_to_score"] is True and
         len(data["dimensions"]) == 7, "RUBRIC_WEIGHT")
    ids = set()
    for d in data["dimensions"]:
        need(type(d["id"]) is str and len(d["gates"]) == 5, "DIMENSION_COUNT")
        for gate in d["gates"]:
            need(type(gate) is dict and
                 set(gate) == {"id", "description", "evidence", "weight"} and
                 re.fullmatch(r"[A-Z][A-Z0-9]{1,5}", gate["id"]) and
                 gate["id"] not in ids and gate["weight"] == 20 and
                 type(gate["description"]) is str and gate["description"],
                 "GATE_DUPLICATE_OR_WRONG_WEIGHT")
            ids.add(gate["id"])
    need(len(ids) == 35, "RUBRIC_35_DISTINCT_GATES")
    return data


def score(*, benchmark_dir=None):
    config = rubric()
    producer_catalog = load_catalog()
    org = graph(load_links(), producer_catalog)
    view_ok = all(project(org, name)["delete_authorized"] is False for name in VIEWS)
    benchmark = None
    if benchmark_dir is not None:
        owned_private(benchmark_dir)
        benchmark = learning_summary(benchmark_dir)
    profiles = benchmark["profiles"] if benchmark else {}
    observed = {}
    if profiles:
        observed["LOCAL_PROFILE_TRIAD"] = all(
            profiles.get(p, {}).get("runs", 0) >= 1
            for p in ("HOT", "INCREMENTAL", "DEEP"))
        observed["LOCAL_INCREMENTAL_REUSE"] = (
            profiles.get("INCREMENTAL", {}).get("reused_hashes_total", 0) >= 1)
        observed["LOCAL_BOUNDED_DEEP"] = (
            profiles.get("DEEP", {}).get("bounded_deep_runs", 0) >= 1)
        observed["LOCAL_STATISTICAL_SAMPLE"] = all(
            profiles.get(p, {}).get("runs", 0) >= 5
            for p in ("HOT", "INCREMENTAL", "DEEP"))
    observed["LOCAL_GRAPH_VALID"] = True
    observed["LOCAL_ORIGINAL_PRODUCERS"] = (
        len(org["scans"]) == 8 and
        len({s["producer_group"] for s in org["scans"]}) == 6)
    observed["LOCAL_EIGHT_VIEWS"] = len(VIEWS) == 8 and view_ok
    by_dimension = []
    for dim in config["dimensions"]:
        details = []
        lower = 0
        unknown = 0
        for gate in dim["gates"]:
            kind = gate["evidence"]
            # A missing local benchmark is not a false test result.
            if kind not in LOCAL_VALID or kind not in observed:
                state = "UNKNOWN"
            elif observed[kind] is True:
                state = "LOCAL_PASS"
                lower += gate["weight"]
            else:
                state = "UNKNOWN"
            if state == "UNKNOWN":
                unknown += gate["weight"]
            details.append({"id": gate["id"], "status": state,
                            "evidence_type": kind, "weight": gate["weight"]})
        by_dimension.append({"dimension": dim["id"], "score_lower_bound": lower,
                             "score_upper_bound": lower + unknown,
                             "score_certified": None,
                             "unknown_weight": unknown, "criteria": details})
    return {
        "schema": "aoe2war.scan-os.maturity-score.v1",
        "authority": "LOCAL_READ_ONLY_LOWER_BOUNDS_NOT_CERTIFIED_PRODUCTION_SCORES",
        "rubric": config["schema"], "total_dimensions": 7,
        "overall_lower_bound_0_100": sum(d["score_lower_bound"] for d in by_dimension) / 7,
        "overall_upper_bound_0_100": sum(d["score_upper_bound"] for d in by_dimension) / 7,
        "overall_certified_0_100": None,
        "dimensions": by_dimension,
        "benchmark": benchmark,
        "unknown_is_not_failure_or_success": True,
        "never_grants_execution_authority": True,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--benchmark-dir", type=Path)
    a = ap.parse_args()
    try:
        result = score(benchmark_dir=a.benchmark_dir)
    except (MaturityHold, OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc),
                          "overall_certified_0_100": None}))
        return 3
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
