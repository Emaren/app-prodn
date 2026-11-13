#!/usr/bin/env python3
"""Append-only PRODUCT observations. This ledger grants no release authority."""
import datetime as dt
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import time
import uuid

SCHEMA = "aoe2war.product.release-event.v1"
RUN_ID = str(uuid.uuid4())
EVENTS = {"T" + str(n) for n in range(11)} | {
    "download", "transport", "stage", "activate", "rollback", "reactivate", "hold"
}
STATES = {"pending", "running", "pass", "hold", "fail", "unknown"}
LABELS = [
    "Engineering observation", "Source edit", "PR opened", "CI and security",
    "Independent artifact", "HEL1 receipt", "Candidate staged", "First HTTPS proof",
    "Previous HTTPS proof", "Candidate HTTPS proof", "Sealed acceptance",
]
CLOCKS = {
    "python.datetime.now(UTC)", "owner-declared", "codex-app-turn-metadata",
    "github-actions", "historical-receipt", "unknown",
}
SAFE_EVIDENCE = {
    "proofSha256", "runId", "artifactId", "buildId", "provenanceUrl", "reason",
    "startKind", "clockSource", "precisionMs", "uncertaintyMs", "bytes", "totalBytes",
    "throughputBps", "elapsedMs", "retryCount", "resumedBytes", "expectedSha256",
    "verification",
}
NUMERIC = {
    "runId", "artifactId", "precisionMs", "uncertaintyMs", "bytes", "totalBytes",
    "throughputBps", "elapsedMs", "retryCount", "resumedBytes",
}


def require(ok, reason):
    if not ok:
        raise RuntimeError("HOLD_PRODUCT_LEDGER_" + reason)


def utcnow():
    return dt.datetime.now(dt.timezone.utc).isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")


def canonical(obj):
    return json.dumps(
        obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False
    ).encode()


def stamp(value):
    if value is None:
        return None
    require(type(value) is str and value.endswith("Z"), "UTC_REQUIRED")
    value = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(value.utcoffset() == dt.timedelta(0), "UTC_REQUIRED")
    return value


def clean_evidence(evidence):
    require(type(evidence) is dict and set(evidence) <= SAFE_EVIDENCE,
            "UNSAFE_EVIDENCE_FIELDS")
    require(len(canonical(evidence)) <= 4096, "EVIDENCE_SIZE")
    for key, value in evidence.items():
        if key in NUMERIC:
            require(
                (key == "uncertaintyMs" and value is None)
                or (type(value) in (int, float) and math.isfinite(value) and value >= 0),
                "NUMERIC_EVIDENCE",
            )
        elif key in ("proofSha256", "expectedSha256"):
            require(type(value) is str and re.fullmatch("[0-9a-f]{64}", value),
                    "DIGEST_EVIDENCE")
        elif key == "buildId":
            require(type(value) is str and re.fullmatch("[A-Za-z0-9_-]{8,64}", value),
                    "BUILD_EVIDENCE")
        elif key == "provenanceUrl":
            require(
                type(value) is str and len(value) <= 500 and re.fullmatch(
                    r"https://github\.com/Emaren/app-prodn/(?:issues|pull|actions)/[A-Za-z0-9/#?=._-]+",
                    value,
                ), "PROVENANCE_URL",
            )
        elif key == "reason":
            require(type(value) is str and re.fullmatch("[A-Z0-9_:. -]{1,140}", value),
                    "REASON_MUST_BE_BOUNDED_CODE")
        elif key == "clockSource":
            require(value in CLOCKS, "CLOCK_SOURCE")
        elif key == "startKind":
            require(value in ("observed-engineering", "declared-request", "unknown"),
                    "START_KIND")
        elif key == "verification":
            require(value in ("pending", "pass", "fail", "unknown"), "VERIFICATION")
    return evidence


def validate(events, source=None):
    require(type(events) is list and len(events) <= 5000, "EVENT_LIMIT")
    previous = "0" * 64
    expected_source = source
    for index, event in enumerate(events):
        require(type(event) is dict and set(event) == {
            "schema", "seq", "releaseId", "sourceSha", "event", "state", "at",
            "previousHash", "clock", "evidence", "eventHash",
        }, "EVENT_FIELDS")
        require(event["schema"] == SCHEMA and event["seq"] == index + 1,
                "SEQUENCE_OR_SCHEMA")
        require(event["previousHash"] == previous, "CHAIN_PREIMAGE")
        require(type(event["sourceSha"]) is str and
                re.fullmatch("[0-9a-f]{40}", event["sourceSha"]), "SOURCE")
        if expected_source is None:
            expected_source = event["sourceSha"]
        require(event["sourceSha"] == expected_source, "SOURCE_CHANGED")
        require(event["releaseId"] == expected_source[:12], "RELEASE_ID")
        require(event["event"] in EVENTS and event["state"] in STATES, "EVENT_OR_STATE")
        stamp(event["at"])
        clock = event["clock"]
        require(type(clock) is dict and set(clock) == {
            "source", "precisionMs", "uncertaintyMs", "monotonicNs", "runId",
        }, "CLOCK_FIELDS")
        require(clock["source"] in CLOCKS, "CLOCK_SOURCE")
        require(type(clock["precisionMs"]) in (int, float) and
                clock["precisionMs"] >= 0, "CLOCK_PRECISION")
        require(clock["uncertaintyMs"] is None or (
            type(clock["uncertaintyMs"]) in (int, float) and
            clock["uncertaintyMs"] >= 0
        ), "CLOCK_UNCERTAINTY")
        require(
            (clock["monotonicNs"] is None and clock["runId"] is None)
            or (type(clock["monotonicNs"]) is int and clock["monotonicNs"] >= 0
                and type(clock["runId"]) is str
                and re.fullmatch("[0-9a-f-]{36}", clock["runId"])),
            "MONOTONIC_CLOCK",
        )
        clean_evidence(event["evidence"])
        body = {k: v for k, v in event.items() if k != "eventHash"}
        require(hashlib.sha256(canonical(body)).hexdigest() == event["eventHash"],
                "EVENT_DIGEST")
        previous = event["eventHash"]
    return events


def decode(raw, source=None):
    require(len(raw) <= 8 * 1024 * 1024 and
            (not raw or raw.endswith(b"\n")), "PARTIAL_OR_OVERSIZE")
    return validate([json.loads(line) for line in raw.splitlines()], source)


def read(path, source=None):
    path = Path(path)
    require(not path.is_symlink(), "SYMLINK")
    return decode(path.read_bytes() if path.exists() else b"", source)


def append(path, source, event, state, evidence=None, at="NOW", historical=False):
    require(type(source) is str and re.fullmatch("[0-9a-f]{40}", source), "SOURCE")
    require(event in EVENTS and state in STATES, "EVENT_OR_STATE")
    evidence = clean_evidence(evidence or {})
    path = Path(path)
    require(path.parent.is_dir() and not path.parent.is_symlink(), "PARENT")
    created = not path.exists()
    fd = os.open(path, os.O_RDWR | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        info = os.fstat(fd)
        current = path.lstat()
        require(
            stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid()
            and info.st_nlink == 1 and not stat.S_IMODE(info.st_mode) & 0o077
            and (info.st_dev, info.st_ino) == (current.st_dev, current.st_ino),
            "FILE_AUTHORITY",
        )
        os.lseek(fd, 0, os.SEEK_SET)
        blocks = []
        size = 0
        while True:
            block = os.read(fd, 65536)
            if not block:
                break
            blocks.append(block)
            size += len(block)
            require(size <= 8 * 1024 * 1024, "EVENT_LIMIT")
        events = decode(b"".join(blocks), source)
        require(len(events) < 5000, "EVENT_LIMIT")
        when = utcnow() if at == "NOW" else at
        stamp(when)
        # A declared or historical past UTC timestamp must never borrow NOW's
        # monotonic reading; doing so would undercount request-to-production.
        use_monotonic = not historical and at == "NOW"
        obj = {
            "schema": SCHEMA, "seq": len(events) + 1, "releaseId": source[:12],
            "sourceSha": source, "event": event, "state": state, "at": when,
            "previousHash": events[-1]["eventHash"] if events else "0" * 64,
            "clock": {
                "source": evidence.get("clockSource", "python.datetime.now(UTC)"),
                "precisionMs": evidence.get("precisionMs", 1),
                "uncertaintyMs": evidence.get("uncertaintyMs"),
                "monotonicNs": time.monotonic_ns() if use_monotonic else None,
                "runId": RUN_ID if use_monotonic else None,
            },
            "evidence": evidence,
        }
        obj["eventHash"] = hashlib.sha256(canonical(obj)).hexdigest()
        raw = canonical(obj) + b"\n"
        require(os.write(fd, raw) == len(raw), "SHORT_APPEND")
        os.fsync(fd)
        if created:
            parent = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(parent)
            finally:
                os.close(parent)
        return obj
    finally:
        os.close(fd)


def summary(events, build_id=None):
    validate(events)
    accepted = {}
    latest = {}
    for event in events:
        if event["event"].startswith("T"):
            latest[event["event"]] = event
            if event["state"] == "pass":
                accepted.setdefault(event["event"], event)

    def elapsed(left, right):
        a, b = accepted.get(left), accepted.get(right)
        if not a or not b or a["at"] is None or b["at"] is None:
            return None
        if a["clock"]["runId"] and a["clock"]["runId"] == b["clock"]["runId"]:
            value = (b["clock"]["monotonicNs"] - a["clock"]["monotonicNs"]) / 1e6
        else:
            value = (stamp(b["at"]) - stamp(a["at"])).total_seconds() * 1000
        # Clock reversal is UNKNOWN, never a fabricated zero.
        return value if value >= 0 else None

    stages = []
    for number, label in enumerate(LABELS):
        item = latest.get("T" + str(number))
        stages.append({
            "event": "T" + str(number), "label": label,
            "state": item["state"] if item else "unknown",
            "at": item["at"] if item else None,
            "durationMs": elapsed("T" + str(number - 1), "T" + str(number))
            if number and item and item["state"] == "pass" else None,
            "proofSha256": item["evidence"].get("proofSha256") if item else None,
        })
    first = accepted.get("T0", {})
    return {
        "schema": "aoe2war.product.release-summary.v1",
        "sourceSha": events[0]["sourceSha"] if events else None,
        "buildId": build_id, "generatedAt": utcnow(),
        "firstVerifiedProductionMs": elapsed("T0", "T7"),
        "finalAcceptedMs": elapsed("T0", "T10"),
        "startKind": first.get("evidence", {}).get("startKind", "unknown"),
        "stages": stages,
        "provenanceUrl": first.get("evidence", {}).get("provenanceUrl"),
        "clocksUncertaintyMs": None,
    }
