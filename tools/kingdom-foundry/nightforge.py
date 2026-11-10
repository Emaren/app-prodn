"""Nightforge F3: deterministic, source-bound, NONEXECUTING diagnostics.

Consumes only strict sanitized observation schemas, never raw logs, SQL,
HTTP bodies, headers, cookies, customer identities or protected wallets.
Emits F0-schema events and bounded fixture evidence for the F1 ledger.
"""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
import re

from foundry import Rejected, SCHEMA

HEAD = re.compile(r"(?:unknown|[0-9a-f]{40})\Z")
UTC = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\Z")
DAY = re.compile(r"\d{4}-\d{2}-\d{2}\Z")
ALLOWED_LANES = frozenset(("PRODUCT_B", "PRODUCT_C"))

# A contract with explicit keys prevents smuggling raw telemetry fields,
# personal IDs, source credentials or finance records.
CONTRACTS = {
    "systemd": frozenset(("unit", "active", "timer_age_sec")),
    "github": frozenset(("repo", "pr", "draft", "check")),
    "steam": frozenset(("admin_authenticated", "ordinary_authenticated")),
    "watcher": frozenset(("version", "connected", "monitoring", "heartbeat_age_sec")),
    "traffic": frozenset(("certified_through", "expected_through", "missing_certified_days")),
    "storage": frozenset(("plane", "available_mib", "visual_signed")),
    "paper": frozenset(("source_age_sec", "native_crc", "orders_halted")),
    "media": frozenset(("asset_group", "missing_count")),
    "routes": frozenset(("route", "status_code", "expected_denial")),
}
SYSTEMD = frozenset((
    "kingdom-traders-paper.service", "r25-website.service",
    "nginx.service", "traffic-collector.timer", "watcher-watchdog.timer",
    "storage-os.timer",
))
REPOS = frozenset(("app-prodn", "kingdom-traders", "traffic-api", "traffic-app"))
PLANES = frozenset(("mac", "hel1-root", "hel1-volume-105319120"))
ROUTES = frozenset(("profiles","avatars","appearance","traffic","watcher",
                    "navigation","kingdom-traders"))
MEDIA = frozenset(("managed-portraits","sniper-portrait","featured-warriors"))
CHECKS = frozenset(("success","failure","pending","cancelled","unknown"))


def _integer(value, maximum=1_000_000):
    if type(value) is not int or not 0 <= value <= maximum:
        raise Rejected("HOLD_INVALID_OBSERVATION_NUMBER")
    return value


def _boolean(value):
    if type(value) is not bool:
        raise Rejected("HOLD_INVALID_OBSERVATION_BOOLEAN")
    return value


def _utc(value):
    if type(value) is not str or not UTC.fullmatch(value):
        raise Rejected("HOLD_INVALID_OBSERVATION_UTC")
    try:
        dt = datetime.fromisoformat(value.replace("Z","+00:00"))
        if dt.strftime("%Y-%m-%dT%H:%M:%SZ") != value:
            raise ValueError()
        return dt
    except ValueError:
        raise Rejected("HOLD_UNREAL_OBSERVATION_UTC") from None


def _day(value):
    if type(value) is not str or not DAY.fullmatch(value):
        raise Rejected("HOLD_INVALID_TRAFFIC_DAY")
    try:
        dt = datetime.strptime(value,"%Y-%m-%d")
        if dt.strftime("%Y-%m-%d") != value:
            raise ValueError()
        return dt
    except ValueError:
        raise Rejected("HOLD_UNREAL_TRAFFIC_DAY") from None


def diagnose(kind, data, *, lane, source_sha, observed_utc):
    """A candidate event and digest-addressed *synthetic* evidence only.

    Neither an active daemon nor a certified production telemetry adapter.
    """
    if (kind not in CONTRACTS or lane not in ALLOWED_LANES or
        type(source_sha) is not str or not HEAD.fullmatch(source_sha) or
        type(data) is not dict or set(data)!=CONTRACTS[kind]):
        raise Rejected("HOLD_OBSERVATION_SCHEMA_OR_SOURCE")
    if len(json.dumps(data,ensure_ascii=True))>2048:
        raise Rejected("HOLD_OVERSIZED_OBSERVATION")
    _utc(observed_utc)
    code,level,source,event_kind = "UNKNOWN","info","source-tests","test_failure"
    if kind=="systemd":
        if data["unit"] not in SYSTEMD or data["active"] not in (
            "active","inactive","failed","unknown"):
            raise Rejected("HOLD_UNKNOWN_SYSTEMD_UNIT_OR_STATE")
        age=data["timer_age_sec"]
        if age is not None:_integer(age,86_400*30)
        code=("SYSTEMD_UNIT_UNHEALTHY" if data["active"]!="active"
              else "SYSTEMD_TIMER_STALE" if age is not None and age>3600
              else "SYSTEMD_ACTIVE_NOT_SERVICE_CERTIFICATION")
        level="error" if data["active"]=="failed" else (
            "warning" if code!="SYSTEMD_ACTIVE_NOT_SERVICE_CERTIFICATION"
            else "info")
    elif kind=="github":
        if (data["repo"] not in REPOS or
            not 1<=_integer(data["pr"],10_000_000) or
            data["check"] not in CHECKS):
            raise Rejected("HOLD_UNKNOWN_GITHUB_PR")
        _boolean(data["draft"])
        source,event_kind="github-ci","ci_failure"
        code=("GITHUB_CHECK_FAILED" if data["check"]=="failure"
              else "GITHUB_PR_NO_LONGER_DRAFT" if not data["draft"]
              else "GITHUB_CHECK_PENDING" if data["check"]=="pending"
              else "GITHUB_CHECK_NOT_FAILURE")
        level=("error" if code in ("GITHUB_CHECK_FAILED",
                                   "GITHUB_PR_NO_LONGER_DRAFT")
               else "warning" if code=="GITHUB_CHECK_PENDING" else "info")
    elif kind=="steam":
        admin=_boolean(data["admin_authenticated"])
        ordinary=_boolean(data["ordinary_authenticated"])
        code="AUTH_MATRIX_INCOMPLETE" if not(admin and ordinary) else (
             "AUTH_MATRIX_REPORTED_NOT_PHYSICALLY_VERIFIED")
        level="warning" if not(admin and ordinary) else "info"
    elif kind=="watcher":
        if type(data["version"]) is not str or data["version"] not in ("1.6.4","1.6.5","unknown"):
            raise Rejected("HOLD_UNKNOWN_WATCHER_VERSION")
        connected=_boolean(data["connected"])
        monitoring=_boolean(data["monitoring"])
        age=data["heartbeat_age_sec"]
        if age is not None:_integer(age,86_400*30)
        source,event_kind="watcher","watcher_drift"
        code=("WATCHER_SOURCE_STALE" if age is None or age>600
              else "WATCHER_VERSION_DRIFT" if data["version"]!="1.6.5"
              else "WATCHER_DISCONNECTED" if not connected
              else "WATCHER_MONITORING_NOT_PROVEN" if not monitoring
              else "WATCHER_REPORTED_NOT_CERTIFIED")
        level="warning" if code!="WATCHER_REPORTED_NOT_CERTIFIED" else "info"
    elif kind=="traffic":
        a=_day(data["certified_through"])
        b=_day(data["expected_through"])
        count=_integer(data["missing_certified_days"],1500)
        if a>b:raise Rejected("HOLD_TRAFFIC_CERTIFICATION_IN_FUTURE")
        source,event_kind="traffic-rollup","traffic_gap"
        code="TRAFFIC_CANONICAL_GAP" if count>0 or a<b else (
             "TRAFFIC_CANDIDATE_CONTINUOUS_NOT_CERTIFIED")
        level="error" if count>0 else "warning" if a<b else "info"
    elif kind=="storage":
        if data["plane"] not in PLANES:raise Rejected("HOLD_UNKNOWN_STORAGE_PLANE")
        free=_integer(data["available_mib"],1_000_000_000)
        signed=_boolean(data["visual_signed"])
        source,event_kind="storage-os","storage_pressure"
        floor=30*1024 if data["plane"]=="mac" else 8*1024
        code=("STORAGE_VISUAL_SOURCE_NOT_TRUSTED" if not signed
              else "STORAGE_BELOW_RESEARCH_FLOOR" if free<floor
              else "STORAGE_CAPACITY_VISUAL_ONLY")
        level="warning" if code!="STORAGE_CAPACITY_VISUAL_ONLY" else "info"
    elif kind=="paper":
        age=data["source_age_sec"]
        if age is not None:_integer(age,86_400*30)
        crc=_boolean(data["native_crc"])
        halted=_boolean(data["orders_halted"])
        source,event_kind="kingdom-traders-paper","paper_source_stale"
        code=("PAPER_HALT_BREACH" if not halted
              else "PAPER_SOURCE_NOT_CURRENT_NATIVE" if age is None or
               age>5 or not crc else "PAPER_HALT_REMAINS_ACTIVE")
        level="critical" if not halted else (
            "warning" if code=="PAPER_SOURCE_NOT_CURRENT_NATIVE" else "info")
    elif kind=="media":
        if data["asset_group"] not in MEDIA:
            raise Rejected("HOLD_UNTRUSTED_MEDIA_GROUP")
        number=_integer(data["missing_count"],1000)
        source,event_kind="app-media","website_media_missing"
        code="MANAGED_MEDIA_MISSING" if number else "MEDIA_REPORTED_PRESENT_NOT_VERIFIED"
        level="error" if number else "info"
    elif kind=="routes":
        if (data["route"] not in ROUTES or
            data["status_code"] not in (200,401,403,404,405,429,500,503)):
            raise Rejected("HOLD_UNTRUSTED_ROUTE_REPORT")
        denied=_boolean(data["expected_denial"])
        http=data["status_code"]
        code=("EXPECTED_AUTH_DENIAL" if denied and http in (401,403)
              else "PRODUCT_ROUTE_ERROR" if http>=400
              else "ROUTE_REPORTED_SUCCESS_NOT_AUTH_ACCEPTANCE")
        level="error" if code=="PRODUCT_ROUTE_ERROR" else "info"
    # Derive all output text from an audited fixed lookup. No report-supplied
    # strings are copied into a prompt or shell command.
    summary="Nightforge observation "+code
    evidence=json.dumps({"schema":"kingdom.foundry.evidence.v1",
        "source":source,
        "status":"FAILED" if level in ("error","critical") else
                 "UNKNOWN" if level=="warning" else "OBSERVED"},
        sort_keys=True,separators=(",",":")).encode()
    digest=sha256(evidence).hexdigest()
    fingerprint=sha256(json.dumps(
        [kind,lane,source_sha,observed_utc,data],
        sort_keys=True,separators=(",",":"),ensure_ascii=True).encode()).hexdigest()
    event={
        "schema_version":SCHEMA,
        "event_id":"nightforge-"+fingerprint[:40],
        "observed_utc":observed_utc,
        "source":source,"lane":lane,"kind":event_kind,
        "severity":level,"source_sha":source_sha,
        "summary":summary,
        "evidence_ref":"receipt://event/"+digest,
    }
    return {"code":code,"severity":level,"status":"PROPOSE_INVESTIGATION_ONLY",
            "event":event,"evidence_bytes":evidence,
            "execution_enabled":False,"originalMetricsCertified":False}


def group_findings(findings):
    if type(findings) is not tuple or len(findings)>200:
        raise Rejected("HOLD_UNBOUNDED_TRIAGE")
    counts={}
    for x in findings:
        if (type(x) is not dict or x.get("status")!="PROPOSE_INVESTIGATION_ONLY"
            or x.get("execution_enabled") is not False or
            x.get("severity") not in ("info","warning","error","critical")
            or not re.fullmatch(r"[A-Z_]{4,80}",x.get("code",""))):
            raise Rejected("HOLD_UNTRUSTED_TRIAGE_INPUT")
        key=(x["severity"],x["code"])
        counts[key]=counts.get(key,0)+1
    return {"schema":"kingdom.nightforge.triage.v1",
            "groups":[{"severity":severity,"code":code,"count":count}
                for (severity,code),count in sorted(counts.items())],
            "execution_enabled":False,"finance":"DENIED","model_calls":0}
