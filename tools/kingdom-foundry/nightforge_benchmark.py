"""F4 offline known-answer Nightforge benchmark; NO model download/call.

Measures deterministic baseline classification, false positives and actual
Python latency/peak traced memory on bounded sanitized fixtures. Optional
predictions from a future separately qualified model are plain output codes
only; this harness NEVER loads model weights, opens sockets or starts a daemon.
"""
from __future__ import annotations

from dataclasses import dataclass
from statistics import median
import json
import time
import tracemalloc

from foundry import Rejected
from nightforge import diagnose

SOURCE_SHA = "a"*40
TIME = "2026-11-10T05:30:00Z"


@dataclass(frozen=True)
class KnownAnswer:
    id: str
    kind: str
    fields: dict
    expected_code: str
    expected_severity: str


CASES = (
    KnownAnswer("traffic_gap","traffic",{
        "certified_through":"2026-10-19","expected_through":"2026-11-09",
        "missing_certified_days":2},"TRAFFIC_CANONICAL_GAP","error"),
    KnownAnswer("traffic_reconciled","traffic",{
        "certified_through":"2026-11-09","expected_through":"2026-11-09",
        "missing_certified_days":0},
        "TRAFFIC_CANDIDATE_CONTINUOUS_NOT_CERTIFIED","info"),
    KnownAnswer("watcher_stale","watcher",{
        "version":"1.6.5","connected":True,"monitoring":False,
        "heartbeat_age_sec":5000},"WATCHER_SOURCE_STALE","warning"),
    KnownAnswer("watcher_connect_not_monitor","watcher",{
        "version":"1.6.5","connected":True,"monitoring":False,
        "heartbeat_age_sec":2},"WATCHER_MONITORING_NOT_PROVEN","warning"),
    KnownAnswer("storage_low","storage",{
        "plane":"mac","available_mib":15000,"visual_signed":True},
        "STORAGE_BELOW_RESEARCH_FLOOR","warning"),
    KnownAnswer("storage_visual_only","storage",{
        "plane":"hel1-root","available_mib":24000,"visual_signed":True},
        "STORAGE_CAPACITY_VISUAL_ONLY","info"),
    KnownAnswer("ci_failed","github",{
        "repo":"app-prodn","pr":1291,"draft":True,"check":"failure"},
        "GITHUB_CHECK_FAILED","error"),
    KnownAnswer("ci_passed","github",{
        "repo":"app-prodn","pr":1291,"draft":True,"check":"success"},
        "GITHUB_CHECK_NOT_FAILURE","info"),
    KnownAnswer("media_missing","media",{
        "asset_group":"sniper-portrait","missing_count":4},
        "MANAGED_MEDIA_MISSING","error"),
    KnownAnswer("paper_halt","paper",{
        "source_age_sec":2,"native_crc":True,"orders_halted":True},
        "PAPER_HALT_REMAINS_ACTIVE","info"),
    KnownAnswer("paper_halt_breach","paper",{
        "source_age_sec":2,"native_crc":True,"orders_halted":False},
        "PAPER_HALT_BREACH","critical"),
    KnownAnswer("auth_denied_expected","routes",{
        "route":"profiles","status_code":403,"expected_denial":True},
        "EXPECTED_AUTH_DENIAL","info"),
)


def evaluate_codes(predictions: dict[str, str], *, cases=CASES):
    """One prediction per case, with strict all-known IDs and code bounds."""
    if (type(predictions) is not dict or type(cases) is not tuple or
        not 1<=len(cases)<=64 or set(predictions)!={c.id for c in cases}):
        raise Rejected("HOLD_UNTRUSTED_BENCHMARK_PREDICTIONS")
    code_set={c.expected_code for c in cases}
    counts={"correct":0,"fp":0,"fn":0,"tp":0,"tn":0}
    for case in cases:
        response=predictions[case.id]
        if type(response) is not str or response not in code_set:
            raise Rejected("HOLD_BENCHMARK_UNKNOWN_CODE")
        expected_positive=case.expected_severity!="info"
        predicted_positive=response in {
            c.expected_code for c in cases if c.expected_severity!="info"}
        counts["correct"]+=int(response==case.expected_code)
        counts["fp"]+=int(predicted_positive and not expected_positive)
        counts["fn"]+=int(expected_positive and not predicted_positive)
        counts["tp"]+=int(expected_positive and predicted_positive)
        counts["tn"]+=int(not expected_positive and not predicted_positive)
    n=len(cases)
    counts.update({
        "schema":"kingdom.nightforge.benchmark.v1",
        "cases":n,
        "accuracy":round(counts["correct"]/n,6),
        "falsePositiveRate":round(counts["fp"]/max(1,counts["fp"]+counts["tn"]),6),
        "falseNegativeRate":round(counts["fn"]/max(1,counts["fn"]+counts["tp"]),6),
        "modelWeightsLoaded":False,
        "llmCalls":0,"executionEnabled":False,"productionInferenceAdmitted":False,
    })
    return counts


def run_deterministic_baseline(*, loops=10):
    if type(loops) is not int or not 1<=loops<=100:
        raise Rejected("HOLD_UNBOUNDED_BENCHMARK")
    answers={}
    latency=[]
    tracemalloc.start()
    try:
        for _ in range(loops):
            for case in CASES:
                start=time.perf_counter_ns()
                result=diagnose(case.kind,case.fields,
                    lane="PRODUCT_C",source_sha=SOURCE_SHA,observed_utc=TIME)
                latency.append(time.perf_counter_ns()-start)
                answers[case.id]=result["code"]
                if result["severity"]!=case.expected_severity:
                    raise Rejected("HOLD_BASELINE_SEVERITY_MISMATCH")
        _,peak=tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    result=evaluate_codes(answers)
    result.update({
        "engine":"DETERMINISTIC_NO_MODEL",
        "evaluatedObservations":len(CASES)*loops,
        "medianLatencyMs":round(median(latency)/1_000_000,4),
        "peakPythonTracedMemoryBytes":peak,
        "gpuUsed":False,
        "weightDownloadBytes":0,
        "hel1ResidentInference":"HOLD",
    })
    return result


def render_benchmark_json(result):
    if result.get("schema")!="kingdom.nightforge.benchmark.v1":
        raise Rejected("HOLD_BENCHMARK_UNKNOWN_RESULT")
    return json.dumps(result,sort_keys=True,separators=(",",":"))
