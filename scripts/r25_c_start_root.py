#!/usr/bin/env python3
"""Existing R25 start controller with an explicit production-profile extension.

Legacy 3031 START remains PRESTART-gated and never installs or changes Nginx/DB.
Separate production-* phases admit a CI artifact and scoped auth profile on 3032
under exact one-use owner authority. They preserve the old site and preview.
No phase authorizes public cutover or financial mutation.
"""
from __future__ import annotations
import argparse
import base64
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys
import time
import types
import urllib.request
import urllib.error
import datetime
import grp
import hmac
import ipaddress
import pwd
import secrets
import ssl
import tarfile
import urllib.parse
import zipfile

TARGET = "0cee3c836c4b0760478280c145e02e81e470ce0e"
HOST = "ubuntu-4gb-hel1-11"
OLD_UNIT = "aoe2hdbets-web.service"
NEW_UNIT = "aoe2hdbets-web-r24.service"
OLD_PID = 2625090
OLD_TICKS = 103836850
USER = "aoe2war-r24-web"
UID = 993
STAGE = Path("/var/lib/aoe2war-r25-web-0cee3c836c4b")
C_AUDIT = Path("/var/lib/aoe2war-r25-c-additive")
JOURNAL = C_AUDIT / "start-3031-v1"
BUILD_ID = "-dJl5VyecHu5BKNvfErJe"
VERSION = "20261031171526-148d3df911"
TREE_SHA = "5b0de1da545447f64cd1021839692060f5cf308210c19dbd7153f2f25090056d"
SOURCE_RECEIPT_SHA = "f16aafea49903202df5d8a96720d83d2c7ba4d537fc1854d14b26a8936fea757"
BUILD_RECEIPT_SHA = "17352fe0eb046a985c07c17220435c68095c46710e27b52474a7dadba1b64a20"
ARCHIVE_SHA = "c906c75d18ca56871bfdb9fbcdb6173e2c7643ae8f58e5f44735103c530f0101"
B_REPAIR_SHA = "c4301d6faa0d3b9f763168f3883473425c8f2ca6f9b3e6ea03bdfbc079f6e749"
B_WITNESS_SHA = "a72f96668bc6beeaacc90d089cbd7b3a3815caca7b69d4ef7e7be68da6c6ef90"
B_GUARD_SHA = "dead2815b3f20b311ede29dfd99086cbb81dfd6a73f1a71f2b7b57ccd74e809d"
B_PHYSICAL_REPAIR_REPORT_SHA = "fb67157f40cf75cbe467ee6ed1221252bae1ce935aec8b97b74ffa60421b9442"
E_CAMPAIGN = "r25-e-20261031T204421Z-276babc395a0a07a32c3"
E_BASE = Path("/mnt/HC_Volume_105319120/aoe2war/rollbacks") / E_CAMPAIGN
E_COPY_SHA = "20fb31a9d21196c960321fde0d94cfd3a6f3ecdaeaa996f38cc98e94d6bd6873"
E_CERT_SHA = "9a4b8b441d87556bd0ed8b9fb50916aff91da7c6975096ae7e1edc6f84290b2d"
OLD_BUILD_ID = "DQ2jMprNQ_Njq6QM8GHju"
LOCK = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
LOCK_ID = (2064, 6185747, 1000, 0o644)
PREFIXES = ("aoe2", "wolo", "tokenchain", "traffic", "radio", "postgresql", "postgres")
# Exact existing timer/oneshot pairs observed in the saved/current read-only
# plans. Their completed-run metadata is not loaded command/config authority.
# Active jobs and all unlisted units retain strict runtime identity checks.
MONITOR_ONESHOT_TIMERS = {
    "aoe2-wolo-transfer-heartbeat.service": "aoe2-wolo-transfer-heartbeat.timer",
    "aoe2hdbets-bet-stake-reconcile.service": "aoe2hdbets-bet-stake-reconcile.timer",
    "aoe2hdbets-challenge-reconcile.service": "aoe2hdbets-challenge-reconcile.timer",
    "aoe2hdbets-replay-auto-recovery.service": "aoe2hdbets-replay-auto-recovery.timer",
    "aoe2war-prewarm.service": "aoe2war-prewarm.timer",
    "traffic-ingest.service": "traffic-ingest.timer",
    "traffic-project-daily-rollups-aoe2hdbets.service": "traffic-project-daily-rollups-aoe2hdbets.timer",
    "traffic-v2-forward-ledger-aoe2hdbets.service": "traffic-v2-forward-ledger-aoe2hdbets.timer",
    "traffic-watchdog.service": "traffic-watchdog.timer",
    "wolo-mainnet-health.service": "wolo-mainnet-health.timer",
}
INDEPENDENT_REVIEWERS = ("/root/security_review", "/root/start_fix_review")
H64 = re.compile(r"[a-f0-9]{64}\Z")
H40 = re.compile(r"[a-f0-9]{40}\Z")

class Hold(RuntimeError):
    pass

def need(ok, reason):
    if not ok:
        raise Hold(reason)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

def parse(raw):
    def unique(pairs):
        out = {}
        for key, value in pairs:
            need(key not in out, "DUPLICATE_JSON_FIELD")
            out[key] = value
        return out
    return json.loads(raw, object_pairs_hook=unique,
        parse_constant=lambda _: (_ for _ in ()).throw(Hold("NONFINITE_JSON")))

def run(argv, timeout=20, data=None, maximum=1048576):
    p = subprocess.run(argv, input=data, stdout=subprocess.PIPE,
                       stderr=subprocess.DEVNULL, timeout=timeout)
    need(p.returncode == 0 and len(p.stdout) <= maximum,
         "NATIVE_COMMAND_FAILED:" + Path(argv[0]).name)
    return p.stdout

def directory(path):
    for p in (path, *path.parents):
        s = p.lstat()
        need(stat.S_ISDIR(s.st_mode) and s.st_uid == 0 and not s.st_mode & 0o022,
             "ROOT_DIRECTORY_UNTRUSTED")

def root_file(path, maximum=65536, mode=None):
    directory(path.parent)
    s = path.lstat()
    need(stat.S_ISREG(s.st_mode) and s.st_uid == 0 and not s.st_mode & 0o022
         and s.st_nlink == 1 and 0 < s.st_size <= maximum, "ROOT_FILE_UNTRUSTED")
    if mode is not None:
        need(stat.S_IMODE(s.st_mode) == mode, "ROOT_FILE_MODE")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        a = os.fstat(fd)
        need((s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns) ==
             (a.st_dev, a.st_ino, a.st_size, a.st_mtime_ns), "ROOT_FILE_OPEN_RACE")
        chunks = []
        remaining = a.st_size
        while remaining:
            chunk = os.read(fd, min(1048576, remaining))
            need(bool(chunk), "ROOT_FILE_SHORT_READ")
            chunks.append(chunk)
            remaining -= len(chunk)
        b = os.fstat(fd)
        need((a.st_dev, a.st_ino, a.st_size, a.st_mtime_ns) ==
             (b.st_dev, b.st_ino, b.st_size, b.st_mtime_ns), "ROOT_FILE_READ_RACE")
        return b"".join(chunks)
    finally:
        os.close(fd)

def canonical_receipt(obj, field, expected):
    base = dict(obj)
    actual = base.pop(field, None)
    need(actual == expected and sha(canonical(base)) == expected,
         "ACCEPTED_CANONICAL_RECEIPT_CHANGED")

def pinned_module(encoded, expected, size, name):
    data = base64.b64decode(encoded, validate=True)
    need(len(data) == size and sha(data) == expected, "PINNED_B_SOURCE_DRIFT")
    module = types.ModuleType(name)
    exec(compile(data, name, "exec"), module.__dict__)
    return module

def reviewed(payload):
    body = payload["review_body"]
    need(isinstance(body, str) and len(body.encode()) <= 32768 and
         sha(body.encode()) == payload["review_body_sha256"], "REVIEW_BODY_DIGEST")
    block = re.fullmatch(r"R25_START_INDEPENDENT_REVIEW\n```json\n(.+)\n```\n?", body, re.S)
    need(bool(block), "REVIEW_MANIFEST_FORMAT")
    record = parse(block[1])
    need(record.get("schema") == "aoe2war.r25.c.start-source-review.v1"
         and record.get("decision") == "ACCEPT"
         and record.get("scope") == "START_3031_ONLY"
         and record.get("independent_review") is True
         and record.get("reviewer") in INDEPENDENT_REVIEWERS
         and record.get("publisher_is_reviewer_identity") is False,
         "INDEPENDENT_SOURCE_REVIEW_REQUIRED")
    need(bool(H40.fullmatch(payload["source_sha"])) and
         record.get("source_sha") == payload["source_sha"] and
         record.get("operator_sha256") == payload["operator_sha256"] and
         record.get("operator_size") == payload["operator_size"] and
         record.get("operator_blob") == payload["operator_blob"] and
         bool(H64.fullmatch(payload["operator_sha256"])) and
         bool(H40.fullmatch(payload["operator_blob"])) and
         1000 < payload["operator_size"] < 196608,
         "EXACT_REVIEWED_SOURCE_PIN_REQUIRED")
    need(re.fullmatch(r"https://github.com/Emaren/app-prodn/pull/1084#issuecomment-[0-9]+",
                      payload["review_url"]) is not None, "REVIEW_RECORD_LOCATION")
    need(payload.get("review_author") == "Emaren"
         and payload.get("review_issue_url") == "https://api.github.com/repos/Emaren/app-prodn/issues/1084",
         "AUTHENTICATED_MAC_REVIEW_METADATA_REQUIRED")
    ci = record.get("exact_head_ci", {})
    need(type(ci.get("run_id")) is int and ci["run_id"] > 0
         and ci.get("head_sha") == payload["source_sha"]
         and ci.get("conclusion") == "success"
         and ci.get("all_three_jobs_success") is True, "EXACT_HEAD_FULL_CI_REQUIRED")
    return record

def effective_unit(witness):
    state = witness.systemd(NEW_UNIT)
    need(state.get("ProtectSystem") == "strict" and state.get("ProtectHome") in ("yes", "read-only")
         and state.get("NoNewPrivileges") == "yes" and state.get("PrivateTmp") == "yes"
         and state.get("CapabilityBoundingSet") in ("", " "), "EFFECTIVE_SANDBOX_DRIFT")
    raw = run(["/usr/bin/systemctl", "show", NEW_UNIT, "--no-pager",
               "--property=NeedDaemonReload,ExecStart,ExecStartPre,User,Group,WorkingDirectory"], maximum=32768).decode()
    values = dict(line.split("=", 1) for line in raw.splitlines() if "=" in line)
    need(values.get("NeedDaemonReload") == "no" and values.get("User") == USER
         and values.get("Group") == USER and values.get("WorkingDirectory") == str(STAGE),
         "EFFECTIVE_UNIT_NOT_LOADED_FROM_REVIEWED_FILES")
    start = values.get("ExecStart", "")
    pre = values.get("ExecStartPre", "")
    need(start.count("{ path=") == 1 and start.startswith("{ path=/usr/bin/node ; ")
         and "argv[]=/usr/bin/node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3031 ;" in start,
         "EFFECTIVE_EXECSTART_NOT_EXACT")
    argv = "/usr/bin/python3 -I -B /etc/aoe2war/r24-parallel-web/approved-runtime-prestart.py --phase prestart --expected-guard-sha256 " + B_GUARD_SHA
    need(pre.count("{ path=") == 1 and pre.startswith("{ path=/usr/bin/python3 ; ")
         and ("argv[]=" + argv + " ;") in pre, "EFFECTIVE_EXECSTARTPRE_NOT_EXACT")
    witness.validate_filesystem_wall(state)
    return sha(raw.encode())

def b_prestart(payload):
    repair = pinned_module(payload["b_repair_b64"], B_REPAIR_SHA, 14001, "reviewed_b_repair")
    witness = pinned_module(payload["b_witness_b64"], B_WITNESS_SHA, 22310, "reviewed_b_witness")
    roots = repair.host_admission(witness, repaired=True)
    rec = repair.json_root(repair.JOURNAL / "receipt.json")
    need(rec.get("status") == "WITNESS_ONLY_REPAIR_COMPLETE_NOT_PRESTART_AUTHORITY"
         and rec.get("report_sha256") == repair.canonical_sha(rec)
         and rec.get("report_sha256") == B_PHYSICAL_REPAIR_REPORT_SHA
         and rec.get("installed_witness_sha256") == B_WITNESS_SHA
         and rec.get("original_install_report_sha256") == repair.INSTALL_SHA
         and (rec.get("original_started_file_sha256"), rec.get("original_receipt_file_sha256")) == roots
         and sha(repair.trusted(repair.JOURNAL / "old-witness.py", mode=0o600)) == repair.OLD_SHA,
         "AUTHENTIC_B_REPAIR_RECEIPT_REQUIRED")
    need(rec.get("new_service_started") is False and rec.get("public_cutover_authorized") is False
         and rec.get("no_installer_rerun") is True, "B_REPAIR_SCOPE_CHANGED")
    # Separate native PRESTART subprocess, not POSTSTART or an invented receipt.
    raw = run(["/usr/bin/python3", "-I", "-B", str(repair.OLD),
               "--phase", "prestart", "--expected-guard-sha256", B_GUARD_SHA],
              timeout=30, maximum=16000)
    native = parse(raw)
    need(native.get("schema") == "aoe2war.r25.b.hel1.positive-prestart-gate.v1"
         and native.get("status") == "PASS_B_PRESTART_FINANCIAL_CONTROLS_NOT_LIVE_NOT_RELEASE_AUTHORITY"
         and native.get("old_web_pid") == OLD_PID and native.get("new_uid") == UID
         and native.get("target_sha") == TARGET and native.get("guard_sha256") == B_GUARD_SHA
         and native.get("new_service") == NEW_UNIT and native.get("release_authorized") is False
         and native.get("no_financial_operation_executed") is True,
         "NATIVE_PRESTART_NOT_POSITIVE")
    effective_sha = effective_unit(witness)
    return witness, {"native": native, "native_stdout_sha256": sha(raw),
                     "effective_unit_sha256": effective_sha,
                     "repair_report_sha256": rec["report_sha256"],
                     "original_install_report_sha256": repair.INSTALL_SHA,
                     "runtime_env_sha256": sha(root_file(repair.OLD.parent / "readonly-runtime.env", 8192, 0o600))}

def c_build():
    source = root_file(C_AUDIT / "SOURCE_STAGED.json", mode=0o600)
    built = root_file(C_AUDIT / "BUILD_STAGED.json", mode=0o600)
    need(sha(source) == SOURCE_RECEIPT_SHA and sha(built) == BUILD_RECEIPT_SHA,
         "EXACT_HISTORICAL_C_RECEIPTS_REQUIRED")
    s, b = parse(source), parse(built)
    need(s.get("candidate_sha") == TARGET and s.get("git_archive_sha256") == ARCHIVE_SHA
         and b.get("status") == "BUILD_STAGED" and b.get("candidate_sha") == TARGET
         and b.get("source_git_archive_sha256") == ARCHIVE_SHA
         and b.get("build_id") == BUILD_ID and b.get("build_version") == VERSION
         and b.get("tree_sha256") == TREE_SHA and b.get("files") == 87038
         and b.get("root_sealed") is True and b.get("new_service_started") is False,
         "HISTORICAL_C_BINDINGS_CHANGED")
    directory(STAGE)
    for d in (STAGE / ".next", STAGE / "node_modules"):
        directory(d)
    need(root_file(STAGE / ".next/BUILD_ID", 256).strip().decode() == BUILD_ID
         and root_file(STAGE / ".aoe2war-build-version", 256).strip().decode() == VERSION
         and root_file(STAGE / "r24-source-sha", 256).strip().decode() == TARGET,
         "C_BUILD_ID_VERSION_OR_SOURCE_DRIFT")
    # Manifest-only read: 87,038 files were already independently rehashed.
    # Do not repeat the full artifact scan or accepted E old-tree readback.
    manifest = parse(root_file(C_AUDIT / "BUILD_FILES.json", 128 * 1024 * 1024, 0o600))
    rows = manifest.get("rows")
    need(manifest.get("schema") == "aoe2war.r25.c.full-artifact-files.v1"
         and isinstance(rows, list) and len(rows) == 87038
         and sha(canonical(rows)) == TREE_SHA, "C_MANIFEST_IDENTITY_DRIFT")
    return {"source_receipt_sha256": sha(source), "build_receipt_sha256": sha(built),
            "build_id": BUILD_ID, "build_version": VERSION, "tree_sha256": TREE_SHA}

def e_rollback(certificate):
    canonical_receipt(certificate, "certificate_sha256", E_CERT_SHA)
    copy = parse(root_file(E_BASE / "COPY_VERIFIED.json", mode=0o600))
    canonical_receipt(copy, "receipt_sha256", E_COPY_SHA)
    need(copy.get("campaign") == E_CAMPAIGN and copy.get("original_pid") == OLD_PID
         and copy.get("original_start_ticks") == OLD_TICKS
         and copy.get("old_build_id") == OLD_BUILD_ID and copy.get("c_build_id") == BUILD_ID
         and copy.get("c_tree_sha256") == TREE_SHA
         and copy.get("destination") == str(E_BASE / "prior-next")
         and certificate.get("phase") == "RECOVERY_READY"
         and certificate.get("storage_admission") == "PASS_E_READONLY_CAPACITY"
         and certificate.get("release_authorized") is False,
         "ACCEPTED_E_FINAL_BINDINGS_CHANGED")
    # Only original and durable BUILD_ID + device/reserve checks, no tree scan.
    old = Path("/var/www/AoE2HDBets/app-prodn/.next/BUILD_ID")
    need(old.is_file() and not old.is_symlink() and old.read_text().strip() == OLD_BUILD_ID,
         "ORIGINAL_BUILD_ID_CHANGED")
    need(root_file(E_BASE / "prior-next/BUILD_ID", 256).strip().decode() == OLD_BUILD_ID,
         "PROTECTED_E_ROLLBACK_BUILD_ID_CHANGED")
    vol = E_BASE.parents[2]
    need(vol == Path("/mnt/HC_Volume_105319120") and os.path.ismount(vol)
         and Path("/").stat().st_dev == 2049 and vol.stat().st_dev == 2064,
         "E_SEPARATE_DEVICE_CHANGED")
    for mount in (Path("/"), vol):
        fs = os.statvfs(mount)
        need(fs.f_bavail * fs.f_frsize >= 4 * 1024 ** 3, "E_EXISTING_RESERVE_UNAVAILABLE")
    return {"campaign": E_CAMPAIGN, "copy_receipt_sha256": E_COPY_SHA,
            "accepted_final_certificate_sha256": E_CERT_SHA}

def ticks(pid):
    raw = (Path("/proc") / str(pid) / "stat").read_text()
    return int(raw[raw.rfind(")") + 2:].split()[19])

def unit_state(unit):
    props = "Id,Type,TriggeredBy,NeedDaemonReload,Result,ActiveState,MainPID,ExecMainStartTimestampMonotonic,User,WorkingDirectory,ExecStart,FragmentPath,DropInPaths"
    data = run(["/usr/bin/systemctl", "show", unit, "--no-pager", "--property=" + props], maximum=65536)
    pairs = dict(line.split("=", 1) for line in data.decode().splitlines() if "=" in line)
    need(pairs.get("Id") == unit, "SYSTEMD_STATE_UNKNOWN")
    # Completed timer oneshots naturally refresh last-run timestamps/counters.
    # Only these exact inactive pairs normalize them. Preserve the effective
    # loaded command, disk config, Result and every other native property.
    if unit in MONITOR_ONESHOT_TIMERS:
        need(pairs.get("Type") == "oneshot"
             and pairs.get("TriggeredBy") == MONITOR_ONESHOT_TIMERS[unit]
             and pairs.get("NeedDaemonReload") == "no"
             and type(pairs.get("Result")) is str and bool(pairs["Result"])
             and pairs.get("ActiveState") == "inactive"
             and pairs.get("MainPID") == "0", "MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT")
        command = pairs.get("ExecStart", "")
        stable = re.match(r"\{\s*path=[^;]+;\s*argv\[\]=.*;\s*ignore_errors=(?:yes|no)\s*;\s*(?=start_time=)", command, re.S)
        need(stable is not None and command.count("{ path=") == 1,
             "MONITOR_EFFECTIVE_COMMAND_UNRECOGNIZED")
        pairs["ExecStart_command_sha256"] = sha(stable.group(0).encode())
        pairs.pop("ExecMainStartTimestampMonotonic", None)
        pairs.pop("ExecStart", None)
    elif "ExecStart" in pairs:
        # Never disclose protected finance argv: preserve digest for all others.
        pairs["ExecStart_sha256"] = sha(pairs.pop("ExecStart").encode())
    if unit.endswith(".service"):
        need(pairs.get("MainPID", "").isdecimal(), "SYSTEMD_SERVICE_PID_UNKNOWN")
        pid = int(pairs["MainPID"])
    else:
        need(unit.endswith((".timer", ".socket")), "UNREVIEWED_UNIT_TYPE")
        pid = None  # Native timers/sockets have no MainPID; do not invent one.
    return {"properties": pairs, "start_ticks": ticks(pid) if pid is not None and pid > 1 else None,
            "unit_config_sha256": sha(run(["/usr/bin/systemctl", "cat", unit, "--no-pager"], maximum=131072))}

def protected_snapshot():
    raw = run(["/usr/bin/systemctl", "list-unit-files", "--type=service", "--type=timer",
               "--type=socket", "--all", "--no-legend", "--no-pager"])
    loaded = run(["/usr/bin/systemctl", "list-units", "--type=service", "--type=timer",
                  "--type=socket", "--all", "--plain", "--no-legend", "--no-pager"])
    names = sorted(set(row.split()[0] for row in (raw + b"\n" + loaded).decode().splitlines() if row.split()
        and row.split()[0].lower().startswith(PREFIXES)
        and row.split()[0].endswith((".service", ".timer", ".socket"))))
    need(25 <= len(names) <= 200 and OLD_UNIT in names and NEW_UNIT in names,
         "FINANCE_UNIT_CENSUS_INCOMPLETE")
    templates = {name: sha(run(["/usr/bin/systemctl", "cat", name, "--no-pager"], maximum=131072))
                 for name in names if re.search(r"@\.(?:service|timer|socket)$", name)}
    states = {name: unit_state(name) for name in names if name != NEW_UNIT and name not in templates}
    need(any(name.startswith(("postgresql", "postgres"))
             and state["properties"].get("ActiveState") == "active"
             and int(state["properties"].get("MainPID") or "0") > 1
             for name, state in states.items()), "ACTIVE_POSTGRESQL_INSTANCE_NOT_CAPTURED")
    old = states[OLD_UNIT]
    need(old["properties"].get("ActiveState") == "active"
         and old["properties"].get("MainPID") == str(OLD_PID)
         and old["start_ticks"] == OLD_TICKS, "ORIGINAL_PID_START_IDENTITY_CHANGED")
    sockets = run(["/usr/bin/ss", "-H", "-ltnpe"], maximum=1048576).decode()
    ports = {}
    for port in (3030, 8092, 8093, 5432):
        rows = [row for row in sockets.splitlines() if re.search(":" + str(port) + r"\s", row)]
        if port == 5432:
            need(1 <= len(rows) <= 2 and any("127.0.0.1:5432" in row for row in rows),
                 "POSTGRESQL_LISTENER_UNAVAILABLE")
        else:
            need(len(rows) == 1, "PROTECTED_LISTENER_NOT_UNIQUE")
        # Queue counters change under legitimate traffic. Bind stable listener
        # address, process/UID, socket inode and cgroup, never backlog counters.
        ports[str(port)] = sorted(" ".join(row.split()[3:]) for row in rows)
    return {"units": states, "template_config_sha256": templates,
            "unit_names": names, "protected_sockets": ports}

def admit(payload):
    need(sys.platform == "linux" and os.geteuid() == 0 and
         socket.gethostname().split(".")[0] == HOST, "EXACT_HEL1_ROOT_REQUIRED")
    reviewed(payload)
    need(not JOURNAL.exists() and not JOURNAL.is_symlink()
         and not (C_AUDIT / "CANDIDATE_START_ATTEMPT.json").exists()
         and not (C_AUDIT / "CANDIDATE_RUNNING.json").exists(), "START_ALREADY_ATTEMPTED_NO_REPLAY")
    witness, b = b_prestart(payload)
    c = c_build()
    e = e_rollback(payload["e_certificate"])
    snapshot = protected_snapshot()
    directory(C_AUDIT)
    need(stat.S_IMODE(C_AUDIT.stat().st_mode) == 0o700, "C_AUDIT_NOT_PRIVATE")
    return witness, {"schema": "aoe2war.r25.c.start-plan.v1", "candidate_sha": TARGET,
        "B_native_prestart": b, "C_build": c, "E_final": e,
        "protected_before": snapshot, "source_sha": payload["source_sha"],
        "operator_sha256": payload["operator_sha256"],
        "review_body_sha256": payload["review_body_sha256"],
        "public_cutover_authorized": False, "financial_authorized": False}

def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def seal(path, obj):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(canonical(obj) + b"\n")
        f.flush()
        os.fsync(f.fileno())
    fsync_directory(path.parent)

def candidate_port_present():
    for name in ("tcp", "tcp6"):
        rows = (Path("/proc/net") / name).read_text().splitlines()
        need(rows and "local_address" in rows[0], "SOCKET_TABLE_UNAVAILABLE")
        for row in rows[1:]:
            fields = row.split()
            need(len(fields) >= 10, "SOCKET_TABLE_MALFORMED")
            if fields[3] == "0A" and int(fields[1].split(":")[1], 16) == 3031:
                return True
    return False

def ready_http(witness, pid, expected_ticks, deadline):
    """Type=simple can become active before Next binds; retry only absence/IO."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while True:
        state = witness.systemd(NEW_UNIT)
        need(state.get("ActiveState") == "active" and state.get("MainPID") == str(pid),
             "NEW_PID_CHANGED_WHILE_AWAITING_READINESS")
        proc = witness.proc(pid)
        need(proc["start_ticks"] == expected_ticks and proc["uid"] == UID
             and proc["cwd"] == str(STAGE) and proc["exe"] == "/usr/bin/node",
             "NEW_PROCESS_CHANGED_WHILE_AWAITING_READINESS")
        group = "/system.slice/" + NEW_UNIT
        need(state.get("ControlGroup") == group and
             (Path("/proc") / str(pid) / "cgroup").read_text().splitlines() == ["0::" + group],
             "NEW_CGROUP_CHANGED_WHILE_AWAITING_READINESS")
        if candidate_port_present():
            # A conflicting/wildcard/IPv6/other-owned listener is never retried.
            socket_sha = witness.tcp3031(pid)
            try:
                with opener.open("http://127.0.0.1:3031/api/deployment-version", timeout=4) as response:
                    need(response.status == 200, "NEW_VERSION_GET_NOT_200")
                    data = response.read(8193)
                    need(len(data) <= 8192, "NEW_VERSION_REPLY_UNBOUNDED")
                    version = parse(data)
                need(version.get("buildVersion") == VERSION, "NEW_HTTP_VERSION_DRIFT")
                return socket_sha
            except urllib.error.HTTPError:
                raise Hold("NEW_VERSION_HTTP_ERROR")
            except (urllib.error.URLError, TimeoutError, socket.timeout) as exc:
                reason = getattr(exc, "reason", exc)
                need(isinstance(reason, (TimeoutError, socket.timeout))
                     or isinstance(reason, OSError) and reason.errno == errno.ECONNREFUSED,
                     "NEW_VERSION_NONTRANSIENT_IO_FAILURE")
        need(time.monotonic() < deadline, "NEW_READINESS_DEADLINE")
        time.sleep(0.2)

def start(payload):
    witness, plan = admit(payload)
    need(payload.get("plan_sha256") == sha(canonical(plan)), "APPROVED_PLAN_CHANGED")
    nonce = payload.get("nonce", "")
    need(re.fullmatch(r"[a-f0-9]{32}", nonce) is not None, "OWNER_START_NONCE_REQUIRED")
    phrase = "START-R25-3031-ONLY " + nonce + " " + payload["plan_sha256"]
    need(payload.get("owner_consent") == phrase, "SEPARATE_TYPED_START_ONLY_CONSENT_REQUIRED")
    # First persistent mutation atomically prevents all retries. Existing release
    # lock remains byte-identical and locked throughout admission/start/proof.
    os.mkdir(JOURNAL, 0o700)
    fsync_directory(C_AUDIT)
    seal(JOURNAL / "started.json", {"status": "START_ENTERED_DO_NOT_RETRY",
        "plan": plan, "plan_sha256": payload["plan_sha256"], "nonce": nonce,
        "review_url": payload["review_url"], "review_body": payload["review_body"],
        "review_author": payload["review_author"], "review_issue_url": payload["review_issue_url"],
        "owner_consent": phrase})
    attempted = False
    try:
        need(protected_snapshot() == plan["protected_before"], "PROTECTED_PREIMAGE_CHANGED")
        # Mark invocation BEFORE calling: even timeout/nonzero may have started it.
        attempted = True
        run(["/usr/bin/systemctl", "start", NEW_UNIT], timeout=95)
        deadline = time.monotonic() + 30
        while True:
            state = witness.systemd(NEW_UNIT)
            pid = int(state.get("MainPID") or "0")
            if state.get("ActiveState") == "active" and pid > 1:
                break
            need(time.monotonic() < deadline, "NEW_SERVICE_NOT_RUNNING")
            time.sleep(0.2)
        need(state.get("User") == USER and state.get("WorkingDirectory") == str(STAGE),
             "NEW_SYSTEMD_IDENTITY")
        need(state.get("ProtectSystem") == "strict" and state.get("ProtectHome") in ("yes", "read-only")
             and state.get("NoNewPrivileges") == "yes" and state.get("PrivateTmp") == "yes"
             and state.get("CapabilityBoundingSet") in ("", " "), "NEW_SYSTEMD_SANDBOX_DRIFT")
        witness.validate_filesystem_wall(state)
        effective_unit(witness)
        proc = witness.proc(pid)
        ids = (Path("/proc") / str(pid) / "status").read_text().splitlines()
        uids = next(row.split()[1:] for row in ids if row.startswith("Uid:"))
        need(uids == [str(UID)] * 4, "NEW_PROCESS_ALL_UIDS_NOT_ISOLATED")
        need(proc["uid"] == UID and proc["cwd"] == str(STAGE)
             and proc["exe"] == "/usr/bin/node"
             and set(proc["env"]).issubset(witness.ENV_ALLOW)
             and all(proc["env"].get(k) == v for k, v in witness.EXPECTED.items()),
             "NEW_PROCESS_UID_EXE_OR_ENV_DRIFT")
        cgroup = (Path("/proc") / str(pid) / "cgroup").read_text()
        expected_group = "/system.slice/" + NEW_UNIT
        need(state.get("ControlGroup") == expected_group
             and cgroup.splitlines() == ["0::" + expected_group], "NEW_PROCESS_CGROUP_DRIFT")
        socket_sha = ready_http(witness, pid, proc["start_ticks"], deadline)
        nft_sha = witness.nft_policy(UID)
        need(root_file(STAGE / ".next/BUILD_ID", 256).strip().decode() == BUILD_ID,
             "NEW_BUILD_ID_DRIFT")
        need(protected_snapshot() == plan["protected_before"], "PROTECTED_CONTINUITY_FAILED")
        report = {"schema": "aoe2war.r25.c.started-3031.v1", "status": "STARTED_3031_PENDING_B_POSTSTART_C_RUNTIME_ACCEPT",
            "candidate_sha": TARGET, "build_id": BUILD_ID, "build_version": VERSION,
            "candidate_pid": pid, "candidate_start_ticks": proc["start_ticks"],
            "candidate_uid": UID, "candidate_cgroup_sha256": proc["cgroup_sha256"],
            "socket_sha256": socket_sha, "nft_sha256": nft_sha,
            "plan_sha256": payload["plan_sha256"], "nonce": nonce,
            "old_web_pid": OLD_PID, "public_cutover_authorized": False,
            "financial_authorized": False, "B_poststart_proven": False,
            "C_independent_runtime_accept": False}
        seal(JOURNAL / "running.json", report)
        return report
    except BaseException as exc:
        stopped = False
        if attempted:
            try:
                run(["/usr/bin/systemctl", "stop", NEW_UNIT], timeout=45)
                witness_state = witness.systemd(NEW_UNIT)
                stopped = witness_state.get("ActiveState") == "inactive" and witness_state.get("MainPID") == "0"
            except BaseException:
                stopped = False
        seal(JOURNAL / "hold.json", {"status": "HOLD_NO_REPLAY",
            "reason_type": type(exc).__name__, "new_service_stop_proven": stopped,
            "only_new_service_stop_attempted": attempted, "public_cutover_authorized": False})
        raise

PROD_PROFILE = "nonfinancial-production-v1"
PROD_UNIT = "aoe2hdbets-web-prod.service"
PROD_USER = "aoe2war-web-prod"
PROD_UID = 990
PROD_GID = 984
PROD_PORT = 3032
PROD_DB_ROLE = "aoe2war_web_prod"
PROD_DB_OWNER = "aoe2war_auth_owner"
PROD_BASE = Path("/etc/aoe2war/web-prod-v1")
PROD_LIB = Path("/usr/local/lib/aoe2war-web-prod")
PROD_AUDIT = Path("/var/lib/aoe2war-app-production-v1")
PROD_GUARD = PROD_LIB / "r25_b_guard_production_v1.cjs"
PROD_POLICY = PROD_BASE / "approved-profile.json"
PROD_ENV = PROD_BASE / "runtime.env"
PROD_PROXY = Path("/etc/nginx/conf.d/aoe2war-web-prod-readonly-api.conf")
PROD_STEAM = "steamcommunity.com"
PROD_ASSET_DIR = Path("/mnt/HC_Volume_105319120/aoe2-downloads")
PROD_ASSET_OWNERS = (0,1000)
PROD_SOURCE_FILES = ("scripts/r25_c_start_root.py", "scripts/r25_c_start_owner_mac.py",
    "scripts/r25_b_guard_production_v1.cjs", "config/nonfinancial-production-auth.sql",
    "config/nonfinancial-production-watcher-assets.json")
PROD_OWNED_UNITS = (PROD_UNIT, "aoe2war-steam-egress-refresh.service", "aoe2war-steam-egress-refresh.timer")
PROD_NGINX_PREIMAGE = "d8f55532ae9a1b8463ed6f0998f8a92343677e442218d1bdaef1b6e547478ad8"
PROD_SCOPE = "STAGE_AND_START_NONFINANCIAL_PRODUCTION_3032"
PROD_DEFINERS = ["aoe2war_auth_v1.complete_steam_login", "aoe2war_auth_v1.read_user", "aoe2war_auth_v1.touch_session"]
PROD_READ_TABLES = ("game_stats", "replay_player_snapshots", "replay_player_metrics", "replay_game_metrics",
    "replay_player_metric_aggregates", "replay_player_identity_projections", "player_identity_aliases", "warriors", "platform_accounts",
    "platform_name_observations", "warrior_platform_links", "tournaments", "tournament_entries", "tournament_matches", "chat_messages",
    "chat_message_reactions", "game_watch_streams", "game_watch_retained_demo", "page_change_revisions")
PROD_COLUMN_READS = {
    "users": ("id", "uid", "in_game_name", "verified", "lock_name", "created_at", "last_seen", "steam_id", "steam_persona_name",
        "verification_level", "verification_method", "verified_at", "preferred_language", "twitch_stream_url", "represented_country",
        "represented_country_updated_at", "gender_division", "gender_division_updated_at"),
    "replay_result_adjudications": ("id", "game_stats_id", "idempotency_key", "decision_status", "affects_stats", "affects_bets",
        "actor_display_name_snapshot", "actor_role", "team_assignments", "winning_team_key", "winning_player_keys", "reason", "evidence",
        "source_replay_hash", "source_parse_iteration", "source_roster_hash", "source_proposition_hash", "created_at")}


def production_github(endpoint):
    return parse(run(["/usr/bin/gh", "api", "repos/Emaren/app-prodn/" + endpoint],
                     timeout=25, maximum=524288))

def production_source(payload, name):
    need(name in PROD_SOURCE_FILES and type(payload.get("source_sha")) is str and
         H40.fullmatch(payload["source_sha"]), "PRODUCTION_EXACT_SOURCE_REQUIRED")
    expected = payload.get("source_hashes", {}).get(name)
    size = payload.get("source_sizes", {}).get(name)
    need(type(size) is int and 0 < size <= 196608, "PRODUCTION_EXACT_SOURCE_SIZE_REQUIRED")
    need(type(expected) is str and H64.fullmatch(expected), "PRODUCTION_SOURCE_HASH_REQUIRED")
    item = production_github("contents/" + name + "?ref=" + payload["source_sha"])
    need(item.get("type") == "file" and item.get("encoding") == "base64", "PRODUCTION_COMMITTED_SOURCE_REQUIRED")
    raw = base64.b64decode(item["content"].replace("\n", ""), validate=True)
    need(len(raw) == size and sha(raw) == expected, "PRODUCTION_SOURCE_BYTES_DRIFT")
    return raw

def production_original_identity():
    before = ticks(OLD_PID)
    need(before == OLD_TICKS, "ORIGINAL_SESSION_PROCESS_CHANGED")
    raw = (Path("/proc") / str(OLD_PID) / "environ").read_bytes()
    need(0 < len(raw) <= 65536 and raw.endswith(b"\0"), "ORIGINAL_ENVIRONMENT_BOUNDED_REQUIRED")
    values = {}
    for row in raw[:-1].split(b"\0"):
        key, sep, value = row.partition(b"=")
        need(sep and key not in values, "ORIGINAL_ENVIRONMENT_INTEGRITY")
        values[key] = value
    key = values.get(b"SESSION_SECRET") or values.get(b"NEXTAUTH_SECRET")
    need(type(key) is bytes and re.fullmatch(rb"[A-Za-z0-9_./+=:-]{32,4096}", key),
         "ORIGINAL_SESSION_SAFE_EXACT_BYTES_REQUIRED")
    database = values.get(b"DATABASE_URL", b"").decode("utf-8")
    database = urllib.parse.urlsplit(database.replace("postgresql+asyncpg://", "postgresql://"))
    dbname = urllib.parse.unquote(database.path[1:])
    need(re.fullmatch(r"[A-Za-z0-9_]{1,63}", dbname) and ticks(OLD_PID) == before,
         "ORIGINAL_DATABASE_OR_SESSION_IDENTITY_CHANGED")
    return key, dbname

def production_protected_once():
    original_pairs = dict(MONITOR_ONESHOT_TIMERS)
    try:
        MONITOR_ONESHOT_TIMERS.update({"aoe2hdbets-staking-rewards.service": "aoe2hdbets-staking-rewards.timer",
            "aoe2hdbets-trophy-tributes.service": "aoe2hdbets-trophy-tributes.timer"})
        snapshot = protected_snapshot()
    finally:
        MONITOR_ONESHOT_TIMERS.clear(); MONITOR_ONESHOT_TIMERS.update(original_pairs)
    snapshot["unit_names"] = [n for n in snapshot["unit_names"] if n not in PROD_OWNED_UNITS]
    snapshot["units"] = {n: v for n, v in snapshot["units"].items() if n not in PROD_OWNED_UNITS}
    snapshot["preview"] = unit_state(NEW_UNIT)
    need(snapshot["preview"]["properties"].get("MainPID") == "1483304", "PRESERVED_PREVIEW_PID_DRIFT")
    snapshot["preview_nft_sha256"] = sha(run(["/usr/sbin/nft", "list", "table", "inet", "aoe2war_r25_b"], maximum=65536))
    return snapshot

def production_protected():
    deadline = time.monotonic() + 5
    while True:
        try: return production_protected_once()
        except Hold as exc:
            # Only a known monitor oneshot's normal in-flight run is retried.
            # The final inactive snapshot still must equal its immutable plan.
            if str(exc) != "MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT" or time.monotonic() >= deadline:
                raise
            time.sleep(0.2)

def production_proxy_bytes():
    return b'''# Exact production read-only replay health boundary; never public.
server {
 listen 127.0.0.1:3331;
 server_name localhost;
 access_log off;
 location = /api/health {
  if ($request_method !~ ^(GET|HEAD)$) { return 405; }
  proxy_pass_request_body off;
  proxy_set_header Content-Length "";
  proxy_set_header Cookie "";
  proxy_set_header Authorization "";
  proxy_method GET;
  proxy_pass http://127.0.0.1:3330/api/health?;
 }
 location = /api/chain-id {
  if ($request_method !~ ^(GET|HEAD)$) { return 405; }
  proxy_pass_request_body off;
  proxy_set_header Content-Length "";
  proxy_set_header Cookie "";
  proxy_set_header Authorization "";
  proxy_method GET;
  proxy_pass http://127.0.0.1:3330/api/chain-id?;
 }
 location / { return 403; }
}
'''

def production_steam_addresses():
    addresses = sorted(set(row[4][0] for row in socket.getaddrinfo(PROD_STEAM, 443, type=socket.SOCK_STREAM)))
    need(0 < len(addresses) <= 16, "STEAM_DNS_ADDRESS_BOUND")
    accepted = []
    context = ssl.create_default_context()
    for address in addresses:
        ip = ipaddress.ip_address(address)
        need(ip.is_global and not ip.is_multicast, "STEAM_DNS_NONPUBLIC_ADDRESS")
        try:
            with socket.create_connection((address, 443), timeout=3) as raw:
                with context.wrap_socket(raw, server_hostname=PROD_STEAM) as connection:
                    need(connection.version() in ("TLSv1.2", "TLSv1.3"), "STEAM_TLS_VERSION")
                    accepted.append(str(ip))
        except (OSError, ssl.SSLError):
            pass  # An unreachable family never receives an allow rule.
    need(0 < len(accepted) <= 16, "STEAM_DNS_TLS_NO_VERIFIED_ADDRESS")
    return accepted

def production_nft_bytes(addresses):
    checked = [ipaddress.ip_address(address) for address in addresses]
    need(0 < len(checked) <= 16 and all(a.is_global and not a.is_multicast for a in checked),
         "PRODUCTION_STEAM_ADDRESS_POLICY")
    sets = []
    for version in (4, 6):
        elements = ", ".join(str(a) + " timeout 300s" for a in checked if a.version == version)
        sets.append(" set steam%d { type ipv%d_addr; flags timeout; timeout 300s; %s }" %
                    (version, version, "elements = { " + elements + " };" if elements else ""))
    return ("table inet aoe2war_web_prod {\n" + "\n".join(sets) + '''
 chain output {
  type filter hook output priority -11; policy accept;
  meta skuid 990 ip daddr 127.0.0.1 tcp dport { 5432, 3331 } accept
  meta skuid 990 ip daddr 127.0.0.53 udp dport 53 accept
  meta skuid 990 ip daddr 127.0.0.53 tcp dport 53 accept
  meta skuid 990 ip daddr @steam4 tcp dport 443 accept
  meta skuid 990 ip6 daddr @steam6 tcp dport 443 accept
  meta skuid 990 ip daddr 127.0.0.1 tcp sport 3032 ct state established accept
  meta skuid 990 drop
 }
}
''').encode()

def production_unit_bytes(stage):
    need(type(stage) is Path or isinstance(stage, Path), "PRODUCTION_STAGE_PATH_REQUIRED")
    need(stage.parent == Path("/var/lib") and re.fullmatch(r"aoe2war-web-prod-[0-9a-f]{12}", stage.name),
         "PRODUCTION_STAGE_NAMESPACE_REQUIRED")
    return ("[Unit]\nDescription=AoE2WAR nonfinancial production web\nAfter=network.target postgresql.service\n"
      "[Service]\nType=simple\nUser=" + PROD_USER + "\nGroup=" + PROD_USER + "\nWorkingDirectory=" + str(stage) +
      "\nEnvironmentFile=" + str(PROD_ENV) + "\nEnvironment=NODE_ENV=production WARGRAPH_RUNTIME_DISABLED=true "
      "AOE2WAR_RUNTIME_PROFILE=" + PROD_PROFILE + " AOE2WAR_R25_ISOLATED_WEB=true AOE2WAR_PROD_DB_PREVIEW=false "
      "AOE2_BACKEND_UPSTREAM=http://127.0.0.1:3331 HOSTNAME=127.0.0.1 PORT=3032 NEXT_TELEMETRY_DISABLED=1 "
      "NODE_OPTIONS=--require=" + str(PROD_GUARD) +
      "\nUnsetEnvironment=HTTP_PROXY HTTPS_PROXY ALL_PROXY NODE_TLS_REJECT_UNAUTHORIZED NODE_EXTRA_CA_CERTS "
      "NEXTAUTH_SECRET CACHE_DIRECTORY MEMORY_PRESSURE_WATCH MEMORY_PRESSURE_WRITE\n"
      "ExecStart=/usr/bin/node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3032\n"
      "Restart=no\nNoNewPrivileges=yes\nCapabilityBoundingSet=\nProtectSystem=strict\nProtectHome=yes\n"
      "PrivateTmp=yes\nPrivateDevices=yes\nProtectKernelTunables=yes\nProtectKernelModules=yes\n"
      "ProtectControlGroups=yes\nRestrictSUIDSGID=yes\nRestrictRealtime=yes\nLockPersonality=yes\n"
      "RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX\nTemporaryFileSystem=/run:ro\n"
      "InaccessiblePaths=/etc/aoe2hdbets /var/lib/postgresql /var/www/AoE2HDBets/app-prodn "
      "/var/www/WoloChain-wolo-1 /mnt/HC_Volume_105319120\nReadOnlyPaths=" + str(stage) +
      "\nCacheDirectory=aoe2war-web-prod\nCacheDirectoryMode=0700\n"
      "BindPaths=/var/cache/aoe2war-web-prod:" + str(stage / ".next/cache") +
      "\nBindReadOnlyPaths=" + str(PROD_ASSET_DIR) + ":" + str(stage / "public/downloads") +
      "\nMemoryMax=1500M\nCPUQuota=150%\nUMask=0077\n[Install]\nWantedBy=multi-user.target\n").encode()

def production_grant(payload, plan):
    comment_id = payload.get("owner_comment_id")
    expected = payload.get("owner_comment_sha256")
    need(type(comment_id) is int and comment_id > 0 and type(expected) is str and H64.fullmatch(expected),
         "PRODUCTION_OWNER_GRANT_PIN_REQUIRED")
    item = production_github("issues/comments/" + str(comment_id))
    body = item.get("body", "")
    need(item.get("id") == comment_id and item.get("user", {}).get("login") == "Emaren" and
         item.get("user", {}).get("id") == 15059910 and item.get("html_url") ==
         "https://github.com/Emaren/app-prodn/issues/1108#issuecomment-" + str(comment_id) and
         item.get("issue_url") == "https://api.github.com/repos/Emaren/app-prodn/issues/1108" and
         item.get("created_at") == item.get("updated_at") and type(body) is str and sha(body.encode()) == expected,
         "PRODUCTION_ACTUAL_UNEDITED_OWNER_REQUIRED")
    match = re.fullmatch(r"APP_PRODUCTION_PROFILE_GRANT\n```json\n(.+)\n```\n?", body, re.S)
    need(match is not None, "PRODUCTION_OWNER_GRANT_FORMAT")
    grant = parse(match[1])
    need(grant.get("schema") == "aoe2war.app.production-profile-grant.v1" and grant.get("decision") == "AUTHORIZE" and
         grant.get("scope") == PROD_SCOPE and grant.get("nonce") == payload.get("nonce") and
         grant.get("source_sha") == payload["source_sha"] and grant.get("plan_sha256") == sha(canonical(plan)) and
         grant.get("financial_authorized") is False and grant.get("public_cutover_authorized") is False and
         grant.get("rollback_authorized") is True and grant.get("delegated_ai_authorship_disclosed") is True and
         grant.get("release_authority") == "OWNER_ONLY_NONFINANCIAL" and
         grant.get("owner_delegated_decisions") is True and grant.get("independent_review") is False and
         type(grant.get("max_uses")) is int and grant["max_uses"] == 1, "PRODUCTION_OWNER_SCOPE_DRIFT")
    def stamp(value):
        need(type(value) is str and re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", value), "PRODUCTION_UTC_TIMESTAMP")
        return datetime.datetime.fromisoformat(value[:-1] + "+00:00")
    issued, expiry, created = [stamp(value) for value in (grant.get("issued_at"), grant.get("expires_at"), item.get("created_at"))]
    need(0 < (expiry - issued).total_seconds() <= 600 and issued <= created <= datetime.datetime.now(datetime.timezone.utc) <= expiry,
         "PRODUCTION_OWNER_GRANT_EXPIRED")
    ci = grant.get("exact_head_ci", {})
    need(type(ci.get("run_id")) is int and ci["run_id"] > 0 and ci.get("head_sha") == payload["source_sha"] and
         ci["run_id"] == plan["ci_artifact"]["run_id"], "PRODUCTION_EXACT_HEAD_CI_REQUIRED")
    actual = production_github("actions/runs/" + str(ci["run_id"]))
    jobs = production_github("actions/runs/" + str(ci["run_id"]) + "/jobs?filter=latest&per_page=100")
    expected_jobs = {"Release and documentation control plane", "Type, contract, and production build", "Isolated Steam-rating PostgreSQL chronology"}
    need(actual.get("name") == "AoE2WAR CI" and actual.get("head_sha") == payload["source_sha"] and
         actual.get("status") == "completed" and actual.get("conclusion") == "success" and
         jobs.get("total_count") == 3 and len(jobs.get("jobs", [])) == 3 and
         {job.get("name") for job in jobs["jobs"]} == expected_jobs and
         all(job.get("conclusion") == "success" and job.get("status") == "completed" for job in jobs["jobs"]),
         "PRODUCTION_THREE_JOB_CI_NOT_PASS")
    need(datetime.datetime.now(datetime.timezone.utc) <= expiry, "PRODUCTION_GRANT_EXPIRED_DURING_CI")
    return {"comment_id": comment_id, "body_sha256": expected, "ci_run": ci["run_id"],
            "expires_at": grant["expires_at"], "grant": grant}

def production_psql(database, sql, password=None, maximum=262144):
    args = ["/usr/bin/psql", "-X", "-qAt", "--set", "ON_ERROR_STOP=1", "--dbname", database]
    environment = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
    if password is None:
        args = ["/usr/sbin/runuser", "-u", "postgres", "--"] + args
    else:
        args += ["--host", "127.0.0.1", "--port", "5432", "--username", PROD_DB_ROLE, "--no-password"]
        environment["PGPASSWORD"] = password
    result = subprocess.run(args, input=sql.encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            env=environment, timeout=35, check=False)
    need(result.returncode == 0 and len(result.stdout) <= maximum, "PRODUCTION_POSTGRES_OPERATION_REFUSED")
    return result.stdout

def production_database_preimage(database):
    raw = production_psql(database, """BEGIN READ ONLY;
SELECT json_build_object(
 'roles_absent', NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('aoe2war_web_prod','aoe2war_auth_owner')),
 'schema_absent', NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='aoe2war_auth_v1'),
 'users_admin_default_false', EXISTS(SELECT 1 FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
   WHERE d.adrelid='public.users'::regclass AND a.attname='is_admin' AND pg_get_expr(d.adbin,d.adrelid)='false'),
 'no_users_triggers', NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.users'::regclass AND NOT tgisinternal),
 'no_existing_definers', NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema')),
 'users_schema_sha256', encode(sha256(convert_to((SELECT string_agg(attname||':'||atttypid::text||':'||attnotnull::text,',' ORDER BY attnum)
   FROM pg_attribute WHERE attrelid='public.users'::regclass AND attnum>0 AND NOT attisdropped),'UTF8')),'hex')
);ROLLBACK;""")
    result = parse(raw)
    need(all(result.get(key) is True for key in ("roles_absent", "schema_absent", "users_admin_default_false",
         "no_users_triggers", "no_existing_definers")), "PRODUCTION_DATABASE_BASELINE_NOT_ADMITTED")
    return result

def production_archive(payload):
    artifact = payload.get("artifact", {})
    need(type(artifact) is dict and artifact.get("schema") == "aoe2war.runtime-artifact.v1" and
         artifact.get("source_sha") == payload.get("source_sha") and artifact.get("format") == "tar.gz" and
         artifact.get("archive") == "runtime.tar.gz" and artifact.get("machine") == "x86_64" and
         artifact.get("readonly_backend_upstream") == "http://127.0.0.1:3331" and
         type(artifact.get("node_version")) is str and re.fullmatch(r"v22\.[0-9]+\.[0-9]+", artifact["node_version"]),
         "PRODUCTION_CI_RUNTIME_ARTIFACT_REQUIRED")
    for field in ("sha256", "tree_sha256", "manifest_sha256"):
        need(type(artifact.get(field)) is str and H64.fullmatch(artifact[field]), "PRODUCTION_ARTIFACT_DIGEST_REQUIRED")
    for field in ("build_id", "build_version"):
        need(type(artifact.get(field)) is str and re.fullmatch(r"[A-Za-z0-9_-]{8,128}", artifact[field]), "PRODUCTION_ARTIFACT_BUILD_REQUIRED")
    need(type(artifact.get("bytes")) is int and 0 < artifact["bytes"] <= 4 * 1024**3 and
         type(artifact.get("files")) is int and 1000 <= artifact["files"] <= 200000, "PRODUCTION_ARTIFACT_SIZE_BOUND")
    ci = payload.get("ci_artifact", {})
    need(type(ci) is dict and type(ci.get("id")) is int and ci["id"] > 0 and
         type(ci.get("run_id")) is int and ci["run_id"] > 0, "PRODUCTION_GITHUB_ARTIFACT_ID_REQUIRED")
    path = Path(ci.get("archive_path", ""))
    need(str(path) == "/var/lib/aoe2war-runtime-artifacts/" + payload["source_sha"] + "/runtime.zip",
         "PRODUCTION_ROOT_ARTIFACT_NAMESPACE_REQUIRED")
    production_artifact_stat(path)
    provenance = production_ci_zip(payload, path)
    actual_node = run(["/usr/bin/node", "--version"], maximum=256).decode().strip()
    need(re.fullmatch(r"v22\.[0-9]+\.[0-9]+", actual_node) is not None and os.uname().machine == "x86_64",
         "PRODUCTION_RUNTIME_ABI_FAMILY_MISMATCH")
    return path, artifact, provenance

def production_artifact_stat(path):
    directory(path.parent)
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022 and
         info.st_nlink == 1 and 0 < info.st_size <= 4 * 1024**3 + 1048576, "PRODUCTION_ROOT_ARTIFACT_INTEGRITY")
    return info


def production_ci_zip(payload, path):
    ci = payload["ci_artifact"]
    item = production_github("actions/artifacts/" + str(ci["id"]))
    run_info = production_github("actions/runs/" + str(ci["run_id"]))
    need(item.get("id") == ci["id"] and item.get("expired") is False and
         item.get("name") == "aoe2war-runtime-" + payload["source_sha"] and
         item.get("workflow_run",{}).get("id") == ci["run_id"] and
         item.get("workflow_run",{}).get("head_sha") == payload["source_sha"] and
         run_info.get("id") == ci["run_id"] and run_info.get("head_sha") == payload["source_sha"] and
         run_info.get("name") == "AoE2WAR CI" and run_info.get("status") == "completed" and
         run_info.get("conclusion") == "success", "PRODUCTION_ACTUAL_CI_ARTIFACT_SOURCE_MISMATCH")
    digest = item.get("digest", "")
    need(type(digest) is str and re.fullmatch(r"sha256:[a-f0-9]{64}",digest), "PRODUCTION_GITHUB_ARTIFACT_DIGEST_REQUIRED")
    value = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda:source.read(1048576),b""):value.update(block)
    need(value.hexdigest() == digest[7:], "PRODUCTION_AUTHENTICATED_CI_ZIP_DIGEST_MISMATCH")
    with zipfile.ZipFile(path) as archive:
        members = archive.infolist()
        need(len(members) == 2 and {row.filename for row in members} == {"artifact.json","runtime.tar.gz"} and
             all(not row.is_dir() and not row.flag_bits & 1 and stat.S_IFMT(row.external_attr >> 16) in (0,stat.S_IFREG)
                 for row in members), "PRODUCTION_CI_ZIP_ENTRIES_UNSAFE")
        metadata = archive.getinfo("artifact.json"); runtime = archive.getinfo("runtime.tar.gz")
        need(0 < metadata.file_size <= 32768 and runtime.file_size == payload["artifact"]["bytes"] and
             0 < runtime.file_size <= 4 * 1024**3, "PRODUCTION_CI_ZIP_SIZE_DRIFT")
        need(parse(archive.read(metadata)) == payload["artifact"], "PRODUCTION_CI_ZIP_METADATA_DRIFT")
        value=hashlib.sha256(); size=0
        with archive.open(runtime) as source:
            for block in iter(lambda:source.read(1048576),b""):
                size+=len(block);need(size <= runtime.file_size,"PRODUCTION_CI_ZIP_EXPANSION_DRIFT");value.update(block)
        need(size == payload["artifact"]["bytes"] and value.hexdigest() == payload["artifact"]["sha256"],
             "PRODUCTION_CI_ZIP_RUNTIME_BYTES_MISMATCH")
    return {"id":ci["id"],"run_id":ci["run_id"] ,"archive_path":str(path),"zip_sha256":digest[7:]}


def production_materialize_runtime(plan):
    path = Path(plan["artifact_path"])
    production_artifact_stat(path)
    value=hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda:source.read(1048576),b""):value.update(block)
    need(value.hexdigest() == plan["ci_artifact"]["zip_sha256"], "PRODUCTION_ADMITTED_CI_ZIP_CHANGED")
    target = path.parent / "runtime.tar.gz"
    fd = os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o400)
    with os.fdopen(fd,"wb") as output,zipfile.ZipFile(path) as archive,archive.open("runtime.tar.gz") as source:
        value=hashlib.sha256();size=0
        for block in iter(lambda:source.read(1048576),b""):
            size+=len(block);need(size <= plan["artifact"]["bytes"],"PRODUCTION_RUNTIME_EXPANSION_DRIFT")
            output.write(block);value.update(block)
        output.flush();os.fsync(output.fileno())
    need(size == plan["artifact"]["bytes"] and value.hexdigest() == plan["artifact"]["sha256"],
         "PRODUCTION_MATERIALIZED_RUNTIME_DRIFT")
    fsync_directory(path.parent)
    return target

def production_extract(path, artifact, stage):
    need(not stage.exists() and not stage.is_symlink(), "PRODUCTION_STAGE_ALREADY_EXISTS")
    with tarfile.open(path, "r:gz") as archive:
        members = archive.getmembers()
        need(1000 < len(members) <= 200002, "PRODUCTION_ARCHIVE_ENTRY_BOUND")
        names = [member.name for member in members]
        need(all(member.uid == 0 and member.gid == 0 for member in members), "PRODUCTION_ARCHIVE_OWNER_UNSAFE")
        need(len(names) == len(set(names)), "PRODUCTION_ARCHIVE_DUPLICATE")
        by_name = {member.name: member for member in members}
        manifest_member = by_name.get(".aoe2war-runtime-manifest.json")
        need(manifest_member is not None and manifest_member.isfile() and manifest_member.size <= 67108864 and
             by_name.get(".aoe2war-source-sha") is not None and by_name[".aoe2war-source-sha"].isfile(),
             "PRODUCTION_RUNTIME_MANIFEST_REQUIRED")
        raw = archive.extractfile(manifest_member).read(67108865)
        need(sha(raw) == artifact["manifest_sha256"], "PRODUCTION_RUNTIME_MANIFEST_BYTES_MISMATCH")
        manifest = parse(raw); rows = manifest.get("rows")
        need(type(rows) is list and len(rows) == artifact["files"] and sha(canonical(rows)) == artifact["tree_sha256"],
             "PRODUCTION_RUNTIME_TREE_DIGEST_MISMATCH")
        for field in ("schema", "source_sha", "build_id", "build_version", "files", "machine", "node_version", "readonly_backend_upstream"):
            need(manifest.get(field) == artifact[field], "PRODUCTION_MANIFEST_METADATA_DRIFT")
        need(set(names) == {row.get("path") for row in rows} | {".aoe2war-runtime-manifest.json", ".aoe2war-source-sha"},
             "PRODUCTION_ARCHIVE_UNINVENTORIED_BYTES")
        links = set(); total = 0
        for row in rows:
            name = row.get("path"); relative = Path(name) if type(name) is str else Path("/")
            need(type(name) is str and name not in ("", ".") and not relative.is_absolute() and
                 ".." not in relative.parts and ".git" not in relative.parts and
                 not (any(part.startswith(".env") for part in relative.parts) and name != ".env.production.example"), "PRODUCTION_ARCHIVE_PATH_UNSAFE")
            need(type(row.get("mode")) is int and not row["mode"] & 0o7000, "PRODUCTION_ARCHIVE_MODE_UNSAFE")
            item = by_name[name]
            if row.get("type") == "symlink":
                need(item.issym() and item.linkname == row.get("target") and
                     type(row.get("target")) is str and not Path(row["target"]).is_absolute(), "PRODUCTION_SYMLINK_UNSAFE")
                links.add(relative)
            else:
                need(row.get("type") == "file" and item.isfile() and item.size == row.get("size") and
                     not row["mode"] & 0o022 and type(row.get("sha256")) is str and H64.fullmatch(row["sha256"]), "PRODUCTION_REGULAR_FILE_REQUIRED")
                total += item.size
        need(total <= 8 * 1024**3 and all(not any(parent in links for parent in Path(row["path"]).parents) for row in rows),
             "PRODUCTION_SYMLINK_PARENT_OR_EXPANSION")
        free = os.statvfs(stage.parent)
        need(free.f_bavail * free.f_frsize >= total + 8 * 1024**3, "PRODUCTION_ROOT_HEADROOM_REQUIRED")
        stage.mkdir(mode=0o755)
        # Never descend through an archive-created symlink. Add links last.
        for row in rows:
            if row["type"] != "file": continue
            target = stage / row["path"]; target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            file = archive.extractfile(by_name[row["path"]]); value = hashlib.sha256(); size = 0
            fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, "wb") as output:
                while True:
                    chunk = file.read(1048576)
                    if not chunk: break
                    size += len(chunk); need(size <= row["size"], "PRODUCTION_FILE_EXPANSION_DRIFT")
                    value.update(chunk); output.write(chunk)
                output.flush(); os.fsync(output.fileno())
            need(size == row["size"] and value.hexdigest() == row["sha256"], "PRODUCTION_EXTRACTED_FILE_BYTES_DRIFT")
            os.chmod(target, row["mode"] & 0o755)
        for row in rows:
            if row["type"] != "symlink": continue
            target = stage / row["path"]; target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            os.symlink(row["target"], target)
        for row in rows:
            if row["type"] == "symlink":
                target = (stage / row["path"]).resolve(strict=True)
                need(target.is_relative_to(stage.resolve(strict=True)), "PRODUCTION_EXTRACTED_SYMLINK_ESCAPE")
        for name in (".aoe2war-runtime-manifest.json", ".aoe2war-source-sha"):
            data = archive.extractfile(by_name[name]).read(67108865)
            if name.endswith("source-sha"): need(data == (artifact["source_sha"] + "\n").encode(), "PRODUCTION_SOURCE_MARKER_DRIFT")
            fd = os.open(stage / name, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o444)
            with os.fdopen(fd, "wb") as output: output.write(data); output.flush(); os.fsync(output.fileno())
        need((stage / ".next/BUILD_ID").read_text().strip() == artifact["build_id"] and
             (stage / ".aoe2war-build-version").read_text().strip() == artifact["build_version"], "PRODUCTION_EXTRACTED_BUILD_IDENTITY_DRIFT")
        (stage / ".next/cache").mkdir(mode=0o700, exist_ok=False)
        fsync_directory(stage)
    return {"files": len(rows), "expanded_bytes": total, "tree_sha256": artifact["tree_sha256"]}

def production_plan(payload):
    need(sys.platform == "linux" and os.geteuid() == 0 and socket.gethostname().split(".")[0] == HOST,
         "PRODUCTION_ORIGINAL_HEL1_ROOT_REQUIRED")
    need(type(payload.get("nonce")) is str and re.fullmatch(r"[a-f0-9]{32}", payload["nonce"]), "PRODUCTION_FRESH_NONCE_REQUIRED")
    need(type(payload.get("source_hashes")) is dict and set(payload["source_hashes"]) == set(PROD_SOURCE_FILES) and
         type(payload.get("source_sizes")) is dict and set(payload["source_sizes"]) == set(PROD_SOURCE_FILES),
         "PRODUCTION_COMPLETE_SOURCE_SET_REQUIRED")
    for filename in PROD_SOURCE_FILES: production_source(payload, filename)
    path, artifact, provenance = production_archive(payload)
    stage = Path("/var/lib/aoe2war-web-prod-" + payload["source_sha"][:12])
    journal = PROD_AUDIT / ("prod-" + payload["nonce"])
    for item in (stage, journal, PROD_BASE, PROD_LIB, PROD_PROXY, Path("/etc/systemd/system") / PROD_UNIT,
                 Path("/etc/systemd/system/aoe2war-steam-egress-refresh.service"), Path("/etc/systemd/system/aoe2war-steam-egress-refresh.timer")):
        need(not item.exists() and not item.is_symlink(), "PRODUCTION_RESOURCE_EXISTS_NO_REPLAY")
    for find, value in ((pwd.getpwnam, PROD_USER), (pwd.getpwuid, PROD_UID), (grp.getgrnam, PROD_USER), (grp.getgrgid, PROD_GID)):
        try: find(value)
        except KeyError: continue
        raise Hold("PRODUCTION_UID_OR_GROUP_COLLISION")
    tables = run(["/usr/sbin/nft", "list", "tables"], maximum=32768)
    need(b"table inet aoe2war_web_prod\n" not in tables, "PRODUCTION_NFT_TABLE_ALREADY_EXISTS")
    need(sha(root_file(Path("/etc/nginx/sites-available/aoe2war.com"), 131072)) == PROD_NGINX_PREIMAGE,
         "PRODUCTION_PUBLIC_NGINX_PREIMAGE_DRIFT")
    need("127.0.0.53" in Path("/etc/resolv.conf").read_text(), "PRODUCTION_REVIEWED_DNS_STUB_REQUIRED")
    need(re.search(r":(?:3032|3331)\s", run(["/usr/bin/ss", "-H", "-lnt"], maximum=65536).decode()) is None,
         "PRODUCTION_PORT_ALREADY_LISTENING")
    _, database = production_original_identity()
    database_preimage = production_database_preimage(database)
    protected = production_protected()
    addresses = production_steam_addresses()
    assets = production_published_assets(parse(production_source(payload,"config/nonfinancial-production-watcher-assets.json")))
    return {"schema": "aoe2war.app.production-profile-plan.v1", "profile": PROD_PROFILE,
      "nonce": payload["nonce"], "source_sha": payload["source_sha"], "source_hashes": payload["source_hashes"], "source_sizes": payload["source_sizes"],
      "artifact": artifact, "artifact_path": str(path), "ci_artifact": provenance, "stage": str(stage), "unit": PROD_UNIT,
      "uid": PROD_UID, "gid": PROD_GID, "port": PROD_PORT, "protected_snapshot_sha256": sha(canonical(protected)),
      "public_nginx_preimage_sha256": PROD_NGINX_PREIMAGE, "database_preimage": database_preimage,
      "steam_addresses": addresses, "published_assets": assets, "nft_sha256": sha(production_nft_bytes(addresses)),
      "private_proxy_sha256": sha(production_proxy_bytes()), "unit_sha256": sha(production_unit_bytes(stage)),
      "refresh_service_sha256": sha(production_refresh_units()[0]), "refresh_timer_sha256": sha(production_refresh_units()[1]),
      "enable_only_new_profile_on_boot": True, "original_session_identity_present": True, "secret_values_or_fingerprints_disclosed": False,
      "financial_authorized": False, "public_cutover_authorized": False}

def production_public_asset(path, expected, prior=None):
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and info.st_uid in PROD_ASSET_OWNERS and not info.st_mode & 0o022 and
         info.st_nlink == 1 and info.st_size == expected["bytes"], "PRODUCTION_PUBLISHED_ASSET_METADATA_DRIFT")
    identity = {"device":info.st_dev,"inode":info.st_ino,"bytes":info.st_size,"mtime_ns":info.st_mtime_ns,"uid":info.st_uid,"mode":stat.S_IMODE(info.st_mode)}
    if prior is None or prior.get("identity") != identity or prior.get("sha256") != expected["sha256"]:
        value=hashlib.sha256();size=0
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
        with os.fdopen(fd,"rb") as source:
            opened=os.fstat(source.fileno())
            need((opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns) ==
                 (info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns),"PRODUCTION_PUBLISHED_ASSET_OPEN_RACE")
            for block in iter(lambda:source.read(1048576),b""):
                size+=len(block);need(size<=expected["bytes"],"PRODUCTION_PUBLISHED_ASSET_SIZE_DRIFT");value.update(block)
            after=os.fstat(source.fileno())
        need((after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns) ==
             (info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns) and size == expected["bytes"] and
             value.hexdigest() == expected["sha256"],"PRODUCTION_PUBLISHED_ASSET_BYTES_CHANGED")
    return {"path":expected["path"],"identity":identity,"sha256":expected["sha256"]}


def production_published_assets(config, prior=None):
    need(config.get("schema") == "aoe2war.app.published-watcher-assets.v1" and
         config.get("directory") == str(PROD_ASSET_DIR) and config.get("version") == "1.6.5" and
         type(config.get("publisher_source_sha")) is str and H40.fullmatch(config["publisher_source_sha"]) and
         type(config.get("runtime_source_sha")) is str and H40.fullmatch(config["runtime_source_sha"]),
         "PRODUCTION_EXACT_PUBLISHED_WATCHER_CONFIG_REQUIRED")
    rows=config.get("files")
    need(type(rows) is list and len(rows) == 5 and len({row.get("path") for row in rows}) == 5,
         "PRODUCTION_WATCHER_FIVE_ASSETS_REQUIRED")
    publisher=config.get("publisher_manifest",{})
    need(publisher.get("path") == str(PROD_ASSET_DIR / "watcher-release-manifest-1.6.5.json"),
         "PRODUCTION_PUBLISHED_MANIFEST_NAMESPACE")
    results=[]
    old={row["path"]:row for row in (prior or {}).get("files",[])}
    for row in [publisher] + rows:
        need(type(row.get("bytes")) is int and 0 < row["bytes"] <= 512*1024**2 and
             type(row.get("sha256")) is str and H64.fullmatch(row["sha256"]),"PRODUCTION_PUBLISHED_ASSET_EXACT_PINS_REQUIRED")
        if row is publisher:
            path=Path(row["path"]);previous=(prior or {}).get("publisher_manifest")
        else:
            need(type(row.get("path")) is str and Path(row["path"]).name == row["path"] and row["path"] not in ("", ".", ".."),
                 "PRODUCTION_PUBLISHED_ASSET_PATH_UNSAFE")
            path=PROD_ASSET_DIR / row["path"];previous=old.get(row["path"])
        proof=production_public_asset(path,row,previous)
        if row is publisher:publisher_proof=proof
        else:results.append(proof)
    return {"directory":str(PROD_ASSET_DIR),"config_sha256":sha(canonical(config)),"publisher_manifest":publisher_proof,"files":results}


def production_published_mount(pid, stage, assets):
    target=stage / "public/downloads"
    mounts=(Path("/proc") / str(pid) / "mountinfo").read_text().splitlines()
    matches=[row.split(" - ",1)[0].split() for row in mounts if len(row.split(" - ",1)[0].split())>=6 and
             row.split(" - ",1)[0].split()[4] == str(target)]
    need(len(matches)==1 and "ro" in matches[0][5].split(","),"PRODUCTION_PUBLISHED_ASSETS_READONLY_BIND_REQUIRED")
    namespace=Path("/proc") / str(pid) / "root" / str(target).lstrip("/")
    for row in assets["files"]:
        info=(namespace / row["path"]).stat()
        need((info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns) ==
             tuple(row["identity"][key] for key in ("device","inode","bytes","mtime_ns")),
             "PRODUCTION_PUBLISHED_BIND_IDENTITY_DRIFT")
    return {"readonly":True,"files":5,"same_published_inodes":True}

def production_nft_shape():
    value = parse(run(["/usr/sbin/nft", "-j", "list", "table", "inet", "aoe2war_web_prod"], maximum=131072))
    rows = []
    for row in value.get("nftables", []):
        if "metainfo" in row: continue
        copy = parse(canonical(row))
        for item in copy.values():
            if type(item) is dict:
                item.pop("handle", None)
                if "elem" in item: item.pop("elem")
        rows.append(copy)
    need(any("chain" in row for row in rows) and sum("rule" in row for row in rows) == 7,
         "PRODUCTION_NFT_RULE_CENSUS")
    return sha(canonical(rows))

def production_refresh():
    need(sys.platform == "linux" and os.geteuid() == 0 and socket.gethostname().split(".")[0] == HOST,
         "PRODUCTION_REFRESH_ROOT_REQUIRED")
    policy = parse(root_file(PROD_POLICY, 32768, 0o400))
    need(policy.get("schema") == "aoe2war.app.approved-production-profile.v1" and policy.get("profile") == PROD_PROFILE and
         sha(root_file(PROD_LIB / "r25_c_start_root.py", 196608, 0o644)) == policy.get("controller_sha256") and
         production_nft_shape() == policy.get("nft_shape_sha256"), "PRODUCTION_REFRESH_POLICY_DRIFT")
    before = production_protected()
    need(sha(canonical(before)) == policy["protected_snapshot_sha256"], "PRODUCTION_REFRESH_PROTECTED_DRIFT")
    addresses = production_steam_addresses()
    commands = ["flush set inet aoe2war_web_prod steam4", "flush set inet aoe2war_web_prod steam6"]
    for version in (4, 6):
        selected = [a for a in addresses if ipaddress.ip_address(a).version == version]
        if selected:
            commands.append("add element inet aoe2war_web_prod steam%d { %s }" %
                            (version, ", ".join(a + " timeout 300s" for a in selected)))
    run(["/usr/sbin/nft", "-f", "-"], data=("\n".join(commands) + "\n").encode(), maximum=8192)
    need(production_nft_shape() == policy["nft_shape_sha256"] and production_protected() == before,
         "PRODUCTION_REFRESH_CHANGED_NON_STEAM_STATE")
    return {"schema": "aoe2war.app.steam-egress-refresh.v1", "status": "VALIDATED_STEAM_IP_SETS_REFRESHED",
            "addresses": len(addresses), "timeout_seconds": 300, "financial_authorized": False}

def production_admission_steam_refresh():
    """Revalidate exact Steam TLS endpoints just before the real Node POST.

    The first one-use 3032 START failed while its destination set was absent;
    the ordinary timer cannot run until the complete production profile is
    admitted. Only isolated UID990 Steam sets may change during this refresh.
    """
    before_shape = production_nft_shape()
    before_protected = sha(canonical(production_protected()))
    addresses = production_steam_addresses()
    commands = ["flush set inet aoe2war_web_prod steam4", "flush set inet aoe2war_web_prod steam6"]
    for version in (4, 6):
        members = [a for a in addresses if ipaddress.ip_address(a).version == version]
        if members:
            commands.append("add element inet aoe2war_web_prod steam%d { %s }" %
                            (version, ", ".join(a + " timeout 300s" for a in members)))
    run(["/usr/sbin/nft", "-f", "-"], data=("\n".join(commands) + "\n").encode(), maximum=8192)
    need(production_nft_shape() == before_shape and
         sha(canonical(production_protected())) == before_protected,
         "PRODUCTION_ADMISSION_STEAM_REFRESH_CHANGED_OTHER_STATE")
    return addresses

def production_refresh_units():
    service = ("[Unit]\nDescription=Validate Steam TLS destinations for isolated app profile\n"
      "[Service]\nType=oneshot\nUser=root\nExecStart=/usr/bin/python3 -I -B " + str(PROD_LIB / "r25_c_start_root.py") +
      " --phase production-refresh-steam\nNoNewPrivileges=yes\nProtectHome=yes\nPrivateTmp=yes\n"
      "ProtectSystem=strict\nCapabilityBoundingSet=CAP_NET_ADMIN\nRestrictAddressFamilies=AF_INET AF_INET6 AF_NETLINK AF_UNIX\n").encode()
    timer = b"[Unit]\nDescription=Bounded Steam destination refresh\n[Timer]\nOnBootSec=30s\nOnUnitActiveSec=60s\nAccuracySec=5s\n[Install]\nWantedBy=timers.target\n"
    return service, timer

def production_install_database(database, sql, password, journal):
    # Suppress statement/error SQL logging in this privileged session before
    # introducing its new password. No credential enters argv or receipts.
    backup = run(["/usr/sbin/runuser", "-u", "postgres", "--", "/usr/bin/pg_dump",
                  "--format=custom", "--table=public.users", "--dbname=" + database], maximum=67108864)
    fd = os.open(journal / "users-before.pgdump", os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o400)
    with os.fdopen(fd, "wb") as output: output.write(backup); output.flush(); os.fsync(output.fileno())
    need(re.fullmatch(r"[A-Za-z0-9_-]{48,128}", password), "PRODUCTION_GENERATED_PASSWORD_FORMAT")
    create = "BEGIN;SET LOCAL log_statement='none';SET LOCAL log_min_error_statement='PANIC';\n"
    create += "CREATE ROLE aoe2war_auth_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;\n"
    create += "CREATE ROLE aoe2war_web_prod LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '" + password + "';\n"
    create += "GRANT CONNECT ON DATABASE \"" + database + "\" TO aoe2war_web_prod;\n"
    create += "GRANT USAGE ON SCHEMA public TO aoe2war_web_prod;\n"
    create += "ALTER ROLE aoe2war_web_prod SET statement_timeout='20000';ALTER ROLE aoe2war_web_prod SET lock_timeout='2000';\n"
    create += sql.decode("utf-8") + "\nCOMMIT;\n"
    production_psql(database, create)
    seal(journal / "database-admission.json", {"schema": "aoe2war.app.production-auth-database.v1",
        "status": "EXACT_NEW_AUTH_SCHEMA_COMMITTED", "sql_sha256": sha(sql),
        "new_runtime_role": PROD_DB_ROLE, "new_function_owner": PROD_DB_OWNER,
        "runtime_direct_table_writes_authorized": False, "financial_authorized": False})

def production_database_witness(database, password):
    # F/G call this read-only catalog observation. No auth function invocation,
    # INSERT, UPDATE, synthetic user or rolled-back write is permitted here.
    sql = """BEGIN READ ONLY;
SELECT json_build_object(
 'session_user',session_user,
 'user_projection_callable',NOT EXISTS(SELECT 1 FROM aoe2war_auth_v1.read_user('u_00000000000000000000000000000000')),
 'restricted_role',(SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit
     AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname=session_user),
 'restricted_auth_owner',EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aoe2war_auth_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls),
 'no_auth_owner_memberships',NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='aoe2war_auth_owner')),
 'definers_pinned_owner_searchpath',NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.prosecdef AND n.nspname='aoe2war_auth_v1' AND (pg_get_userbyid(p.proowner)<>'aoe2war_auth_owner' OR
    p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[])),
 'definer_identity_sha256',encode(sha256(convert_to((SELECT COALESCE(string_agg(pg_get_userbyid(p.proowner)||':'||COALESCE(p.proconfig::text,'')||':'||pg_get_functiondef(p.oid),',' ORDER BY p.oid::regprocedure::text),'')
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prosecdef AND n.nspname='aoe2war_auth_v1'),'UTF8')),'hex'),
 'no_memberships',NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=session_user)),
 'no_database_create',NOT has_database_privilege(current_database(),'CREATE'),
 'no_schema_create',NOT EXISTS(SELECT 1 FROM pg_namespace WHERE left(nspname,8)<>'pg_temp_' AND has_schema_privilege(oid,'CREATE')),
 'no_direct_table_mutation',NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind IN ('r','p','v','m','f') AND left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema' AND
    (has_table_privilege(c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
     has_any_column_privilege(c.oid,'INSERT,UPDATE,REFERENCES'))),
 'no_users_secret_select',NOT has_table_privilege('public.users','SELECT') AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['token','email','wallet_address','is_admin','can_review_own_replay_results']) AS secret(name) WHERE has_column_privilege('public.users',secret.name,'SELECT')),
 'no_unreviewed_table_select',NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind IN ('r','p','v','m','f') AND left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema' AND
   has_table_privilege(c.oid,'SELECT') AND
   NOT(n.nspname='public' AND c.relname=ANY(ARRAY[__SAFE_READ_TABLES__]))),
 'no_unreviewed_column_select',NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
   AND left(n.nspname,3)<>'pg_' AND n.nspname<>'information_schema' AND has_column_privilege(c.oid,a.attnum,'SELECT') AND
   NOT(n.nspname='public' AND (c.relname=ANY(ARRAY[__SAFE_READ_TABLES__]) OR __SAFE_COLUMN_READS__))),
 'read_acl_sha256',encode(sha256(convert_to((SELECT COALESCE(string_agg(n.nspname||'.'||c.relname||'.'||a.attname,',' ORDER BY n.nspname,c.relname,a.attnum),'')
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
   WHERE c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped AND left(n.nspname,3)<>'pg_'
   AND n.nspname<>'information_schema' AND has_column_privilege(c.oid,a.attnum,'SELECT')),'UTF8')),'hex'),
 'no_sequence_mutation',NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S'
   AND left(n.nspname,3)<>'pg_' AND (has_sequence_privilege(c.oid,'USAGE') OR has_sequence_privilege(c.oid,'UPDATE'))),
 'callable_definers',(SELECT json_agg(n.nspname||'.'||p.proname ORDER BY n.nspname,p.proname)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prosecdef AND left(n.nspname,3)<>'pg_'
   AND n.nspname<>'information_schema' AND has_function_privilege(p.oid,'EXECUTE')),
 'no_other_volatile_functions',NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.provolatile='v' AND left(n.nspname,3)<>'pg_' AND n.nspname NOT IN ('information_schema','aoe2war_auth_v1')
   AND has_function_privilege(p.oid,'EXECUTE') AND NOT(p.prorettype='pg_catalog.trigger'::regtype AND NOT p.prosecdef
     AND p.prokind='f' AND p.pronargs=0 AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')))
);ROLLBACK;
"""
    sql = sql.replace("__SAFE_READ_TABLES__", ",".join("'" + name + "'" for name in PROD_READ_TABLES))
    columns = ["(c.relname='"+table+"' AND a.attname=ANY(ARRAY["+",".join("'"+column+"'" for column in values)+"]))"
               for table, values in PROD_COLUMN_READS.items()]
    sql = sql.replace("__SAFE_COLUMN_READS__", " OR ".join(columns))
    proof = parse(production_psql(database, sql, password))
    need(all(type(proof.get(key)) is str and H64.fullmatch(proof[key]) for key in ("read_acl_sha256","definer_identity_sha256")), "PRODUCTION_READ_ACL_DIGEST_REQUIRED")
    need(proof.get("session_user") == PROD_DB_ROLE and proof.get("callable_definers") == PROD_DEFINERS and
         all(proof.get(key) is True for key in ("restricted_role", "restricted_auth_owner", "no_auth_owner_memberships", "definers_pinned_owner_searchpath", "no_memberships", "no_database_create", "no_schema_create", "user_projection_callable",
          "no_direct_table_mutation", "no_users_secret_select", "no_unreviewed_table_select", "no_unreviewed_column_select", "no_sequence_mutation", "no_other_volatile_functions")),
         "PRODUCTION_NATIVE_AUTH_DATABASE_BOUNDARY_FAILED")
    return proof


def production_database_admission(database, password):
    # Once per authorized new profile. Transaction rolls back all synthetic
    # identity/nonce/last_seen changes; its immutable receipt is later observed.
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") + secrets.token_hex(12)
    uid = "u_" + secrets.token_hex(16)
    steam = "7656119" + str(secrets.randbelow(10**10)).zfill(10)
    sql = """BEGIN;
DO $probe$ DECLARE v_uid text; BEGIN
 SELECT aoe2war_auth_v1.complete_steam_login('%s',NULL,'%s','Production rollback probe','%s') INTO v_uid;
 IF NOT EXISTS(SELECT 1 FROM aoe2war_auth_v1.read_user(v_uid) WHERE uid=v_uid AND "isAdmin"=false)
   OR NOT aoe2war_auth_v1.touch_session(v_uid,NULL) THEN RAISE EXCEPTION 'AUTH_FUNCTION_POSITIVE_FAILED'; END IF;
 BEGIN PERFORM token FROM public.users LIMIT 1; RAISE EXCEPTION 'USER_TOKEN_SELECT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.users SET is_admin=is_admin WHERE false; RAISE EXCEPTION 'ADMIN_DIRECT_WRITE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.users SET steam_id=steam_id WHERE false; RAISE EXCEPTION 'USER_DIRECT_WRITE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN CREATE SCHEMA aoe2war_production_forbidden_probe; RAISE EXCEPTION 'SCHEMA_CREATE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN EXECUTE 'SET LOCAL ROLE aoe2war_auth_owner'; RAISE EXCEPTION 'OWNER_ROLE_ESCALATION_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $probe$;
SELECT json_build_object('auth_callback_read_touch_rolled_back',true,'user_token_select_denied',true,
 'admin_direct_write_denied',true,'user_direct_write_denied',true,'schema_create_denied',true,'role_escalation_denied',true);
ROLLBACK;
""" % (steam, uid, stamp)
    proof = parse(production_psql(database, sql, password))
    need(set(proof) == {"auth_callback_read_touch_rolled_back", "user_token_select_denied", "admin_direct_write_denied",
         "user_direct_write_denied", "schema_create_denied", "role_escalation_denied"} and all(v is True for v in proof.values()),
         "PRODUCTION_AUTH_ADMISSION_POSITIVE_NEGATIVE_FAILED")
    return proof

def production_refresh_unit_identity():
    service, timer = production_refresh_units()
    for name, raw in (("aoe2war-steam-egress-refresh.service",service),("aoe2war-steam-egress-refresh.timer",timer)):
        need(root_file(Path("/etc/systemd/system") / name, 8192, 0o644) == raw,
             "PRODUCTION_REFRESH_UNIT_SOURCE_DRIFT")
        value = dict(row.split("=",1) for row in run(["/usr/bin/systemctl", "show", name, "--no-pager",
            "--property=NeedDaemonReload,FragmentPath,DropInPaths,ExecStart,User,Type,Triggers"], maximum=32768).decode().splitlines() if "=" in row)
        need(value.get("NeedDaemonReload") == "no" and value.get("DropInPaths") == "" and
             value.get("FragmentPath") == "/etc/systemd/system/" + name, "PRODUCTION_REFRESH_EFFECTIVE_CONFIG_DRIFT")
        if name.endswith(".service"):
            need(value.get("User") == "root" and value.get("Type") == "oneshot", "PRODUCTION_REFRESH_EFFECTIVE_IDENTITY")
            command = value.get("ExecStart", "")
            stable = re.match(r"\{\s*path=[^;]+;\s*argv\[\]=.*;\s*ignore_errors=(?:yes|no)\s*;\s*(?=start_time=)", command, re.S)
            need(stable is not None and command.count("{ path=") == 1 and
                 "--phase production-refresh-steam" in stable.group(0), "PRODUCTION_REFRESH_LOADED_COMMAND_UNRECOGNIZED")
            command_sha = sha(stable.group(0).encode())
        else:
            need(value.get("Triggers") == "aoe2war-steam-egress-refresh.service", "PRODUCTION_REFRESH_TIMER_TARGET_DRIFT")
    return {"service_sha256":sha(service),"timer_sha256":sha(timer),"effective_command_sha256":command_sha}


def production_critical_runtime(stage):
    manifest = parse(root_file(stage / ".aoe2war-runtime-manifest.json", 67108864))
    inventory = {row["path"]: row for row in manifest["rows"]}
    required = [".next/BUILD_ID", ".aoe2war-build-version", ".next/required-server-files.json",
        ".next/server/app-paths-manifest.json", ".next/build-manifest.json", ".next/server/instrumentation.js",
        ".next/server/app/page.js", ".next/server/app/admin/page.js", ".next/server/app/api/auth/steam/route.js",
        ".next/server/app/api/auth/session/route.js", ".next/server/app/api/user/me/route.js"]
    css = sorted(name for name in inventory if name.startswith(".next/static/") and name.endswith(".css"))[:3]
    js = sorted(name for name in inventory if name.startswith(".next/static/") and name.endswith(".js"))[:3]
    need(css and js, "PRODUCTION_CRITICAL_STATIC_BYTES_MISSING")
    selected = []
    for name in required + css + js:
        row = inventory.get(name)
        need(row is not None and row.get("type") == "file" and row.get("size",0) <= 16777216,
             "PRODUCTION_CRITICAL_RUNTIME_FILE_MISSING")
        need(sha(root_file(stage / name, 16777216)) == row["sha256"], "PRODUCTION_CRITICAL_RUNTIME_BYTES_CHANGED")
        selected.append({"path":name,"bytes":row["size"],"sha256":row["sha256"]})
    return selected


def production_current_steam_tls():
    raw = parse(run(["/usr/sbin/nft", "-j", "list", "table", "inet", "aoe2war_web_prod"], maximum=131072))
    addresses = []
    for row in raw.get("nftables", []):
        item = row.get("set", {})
        if item.get("name") not in ("steam4", "steam6"): continue
        for element in item.get("elem", []):
            need(type(element) is dict and type(element.get("elem")) is dict,
                 "PRODUCTION_STEAM_EXPIRY_UNOBSERVABLE")
            entry = element["elem"]
            need(type(entry.get("expires")) is int and entry["expires"] > 0,
                 "PRODUCTION_STEAM_SET_ELEMENT_EXPIRED")
            ip = ipaddress.ip_address(entry.get("val"))
            need(ip.is_global and not ip.is_multicast, "PRODUCTION_STEAM_SET_NONPUBLIC")
            addresses.append(str(ip))
    need(0 < len(addresses) <= 16, "PRODUCTION_CURRENT_STEAM_SET_EMPTY")
    probe = r'''import socket,ssl,ipaddress,json,sys,time
allowed=set(json.loads(sys.argv[1]));dns=set(row[4][0] for row in socket.getaddrinfo('steamcommunity.com',443,type=socket.SOCK_STREAM))
current=sorted(allowed & dns);deadline=time.monotonic()+8;verified=False
for address in current[:4]:
 if time.monotonic()>=deadline:break
 try:
  with socket.create_connection((address,443),timeout=2) as raw:
   with ssl.create_default_context().wrap_socket(raw,server_hostname='steamcommunity.com') as tls:
    if tls.version() in ('TLSv1.2','TLSv1.3'):verified=True;break
 except (OSError,ssl.SSLError):pass
print(json.dumps({'current_uid_tls_sni_verified':verified,'active_dns_set_intersection':len(current),'http_post_sent':False,'completed_user_sign_in':False}))
'''
    proof = parse(run(["/usr/sbin/runuser", "-u", PROD_USER, "--", "/usr/bin/python3", "-I", "-B", "-c", probe,
        json.dumps(addresses)], timeout=14, maximum=8192))
    need(proof.get("current_uid_tls_sni_verified") is True and type(proof.get("active_dns_set_intersection")) is int and
         proof["active_dns_set_intersection"] > 0 and proof.get("http_post_sent") is False,
         "PRODUCTION_CURRENT_STEAM_TLS_NOT_REACHABLE")
    return proof

def production_runtime_environment():
    raw = root_file(PROD_ENV, 16384, 0o600)
    lines = raw.splitlines()
    need(len(lines) == 2 and lines[0].startswith(b"DATABASE_URL=") and lines[1].startswith(b"SESSION_SECRET="),
         "PRODUCTION_ONLY_DATABASE_AND_SESSION_ENVIRONMENT")
    database = urllib.parse.urlsplit(lines[0][13:].decode())
    key = lines[1][15:]
    original, dbname = production_original_identity()
    need(database.scheme == "postgresql" and database.hostname == "127.0.0.1" and database.port == 5432 and
         database.username == PROD_DB_ROLE and database.password and database.path == "/" + dbname and
         not database.query and not database.fragment and hmac.compare_digest(key, original),
         "PRODUCTION_DATABASE_OR_SIGNING_IDENTITY_CHANGED")
    return {"DATABASE_URL": lines[0][13:].decode(), "SESSION_SECRET": key.decode()}, dbname, database.password

def production_wait(policy, seconds=60):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        try:
            state = unit_state(PROD_UNIT)
            pid = int(state["properties"].get("MainPID") or 0)
            if pid > 1 and state["properties"].get("ActiveState") == "active" and os.readlink("/proc/" + str(pid) + "/exe") == "/usr/bin/node":
                current_ticks = ticks(pid)
                with urllib.request.urlopen("http://127.0.0.1:3032/__aoe2war_production_guard", timeout=3) as response:
                    guard = parse(response.read(8192))
                with urllib.request.urlopen("http://127.0.0.1:3032/api/deployment-version", timeout=3) as response:
                    version = parse(response.read(8192))
                need(guard.get("schema") == "aoe2war.production.process-guard.v1" and guard.get("pid") == pid and
                     guard.get("uid") == PROD_UID and guard.get("profile") == PROD_PROFILE and
                     guard.get("source_sha") == policy["source_sha"] and guard.get("build_id") == policy["build_id"] and
                     version.get("buildVersion") == policy["build_version"], "PRODUCTION_SAME_PROCESS_READINESS_DRIFT")
                need(ticks(pid) == current_ticks and unit_state(PROD_UNIT)["properties"].get("MainPID") == str(pid),
                     "PRODUCTION_READINESS_PID_CHANGED")
                return pid, current_ticks
        except (OSError, ValueError, urllib.error.URLError, urllib.error.HTTPError):
            pass
        time.sleep(0.25)
    raise Hold("PRODUCTION_SAME_NODE_EXEC_READINESS_TIMEOUT")

def production_kernel_probe(addresses):
    # No HTTP bytes are sent to protected processes. This tests actual native
    # socket permission under the new UID, independently of JS monkeypatches.
    script = r'''import socket,json
result={}
for port in (3030,3031,3330,8092,8093,8094,8095):
 s=socket.socket();s.settimeout(.5)
 try:s.connect(('127.0.0.1',port));result[str(port)]=False
 except OSError:result[str(port)]=True
 finally:s.close()
for host,port,name in [('127.0.0.1',5432,'postgres'),('127.0.0.1',3331,'readonly_proxy')]:
 s=socket.socket();s.settimeout(2)
 try:s.connect((host,port));result[name]=True
 except OSError:result[name]=False
 finally:s.close()
s=socket.socket();s.settimeout(.5)
try:s.connect(('1.1.1.1',443));result['arbitrary_https_denied']=False
except OSError:result['arbitrary_https_denied']=True
finally:s.close()
print(json.dumps(result))
'''
    proof = parse(run(["/usr/sbin/runuser", "-u", PROD_USER, "--", "/usr/bin/python3", "-I", "-B", "-c", script], timeout=15, maximum=8192))
    need(all(value is True for value in proof.values()) and len(proof) == 10, "PRODUCTION_NATIVE_UID_EGRESS_BOUNDARY_FAILED")
    return proof

def production_steam_probe(environment, stage):
    need(isinstance(stage, Path) and re.fullmatch(r"/var/lib/aoe2war-web-prod-[a-f0-9]{12}", str(stage)),
         "PRODUCTION_STEAM_SEALED_STAGE_REQUIRED")
    probe = "fetch('https://steamcommunity.com/openid/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'openid.mode=check_authentication',redirect:'error',signal:AbortSignal.timeout(10000)}).then(async r=>{const s=await r.text();if(r.status!==200||!/^is_valid:false$/m.test(s))process.exit(2);console.log(JSON.stringify({steam_tls_verification_reachable:true,unauthenticated_probe_rejected:true,completed_user_sign_in:false}));}).catch(()=>process.exit(3));"
    env = {"PATH": "/usr/bin:/bin", "HOME": "/nonexistent", "LANG": "C.UTF-8", "USER": PROD_USER, "LOGNAME": PROD_USER,
      "NODE_ENV": "production", "WARGRAPH_RUNTIME_DISABLED": "true", "AOE2WAR_RUNTIME_PROFILE": PROD_PROFILE,
      "AOE2WAR_R25_ISOLATED_WEB": "true", "AOE2WAR_PROD_DB_PREVIEW": "false", "AOE2_BACKEND_UPSTREAM": "http://127.0.0.1:3331", "HOSTNAME": "127.0.0.1",
      "PORT": "3032", "NODE_OPTIONS": "--require=" + str(PROD_GUARD), **environment}
    result = subprocess.run(["/usr/sbin/runuser", "-u", PROD_USER, "--", "/usr/bin/node", "-e", probe],
        env=env, cwd=str(stage), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15, check=False)
    need(result.returncode == 0 and len(result.stdout) < 8192, "PRODUCTION_REAL_NODE_STEAM_TLS_PROBE_FAILED")
    proof = parse(result.stdout)
    need(proof == {"steam_tls_verification_reachable": True, "unauthenticated_probe_rejected": True, "completed_user_sign_in": False},
         "PRODUCTION_STEAM_REACHABILITY_PROOF_DRIFT")
    return proof

def production_witness(payload):
    need(payload.get("profile_path") == str(PROD_POLICY), "PRODUCTION_EXACT_PROFILE_REQUIRED")
    policy = parse(root_file(PROD_POLICY, 32768, 0o400))
    need(policy.get("schema") == "aoe2war.app.approved-production-profile.v1" and policy.get("profile") == PROD_PROFILE and
         policy.get("unit") == PROD_UNIT and policy.get("uid") == PROD_UID and policy.get("gid") == PROD_GID and policy.get("port") == PROD_PORT,
         "PRODUCTION_PROFILE_SCOPE_DRIFT")
    before = production_protected()
    need(sha(canonical(before)) == policy["protected_snapshot_sha256"], "PRODUCTION_ORIGINAL_OR_PREVIEW_CHANGED")
    need(sha(root_file(PROD_GUARD, 32768, 0o644)) == policy["guard_sha256"] and
         sha(root_file(Path("/etc/systemd/system") / PROD_UNIT, 16384, 0o644)) == policy["unit_sha256"] and
         sha(root_file(PROD_PROXY, 8192, 0o644)) == policy["private_proxy_sha256"] and
         sha(root_file(PROD_LIB / "nonfinancial-production-auth.sql", 65536, 0o400)) == policy["sql_sha256"] and
         production_nft_shape() == policy["nft_shape_sha256"], "PRODUCTION_SEALED_RUNTIME_POLICY_CHANGED")
    asset_config_raw=root_file(PROD_LIB / "nonfinancial-production-watcher-assets.json",32768,0o400)
    need(sha(asset_config_raw) == policy["assets_source_sha256"],"PRODUCTION_ASSET_CONFIG_SOURCE_DRIFT")
    assets=production_published_assets(parse(asset_config_raw),policy["published_assets"])
    stage = Path(policy["stage"])
    need(stage == Path("/var/lib/aoe2war-web-prod-" + policy["source_sha"][:12]) and
         (stage / ".next/BUILD_ID").read_text().strip() == policy["build_id"] and
         (stage / ".aoe2war-build-version").read_text().strip() == policy["build_version"] and
         sha(root_file(stage / ".aoe2war-runtime-manifest.json", 67108864)) == policy["manifest_sha256"],
         "PRODUCTION_ARTIFACT_BUILD_IDENTITY_CHANGED")
    pid, pid_ticks = production_wait(policy, seconds=15)
    process = Path("/proc") / str(pid)
    ids = process.joinpath("status").read_text().splitlines()
    need(next(row.split()[1:] for row in ids if row.startswith("Uid:")) == [str(PROD_UID)] * 4 and
         next(row.split()[1:] for row in ids if row.startswith("Gid:")) == [str(PROD_GID)] * 4,
         "PRODUCTION_PROCESS_UID_GID_DRIFT")
    need(os.readlink(process / "cwd") == str(stage) and process.joinpath("cgroup").read_text().splitlines() ==
         ["0::/system.slice/" + PROD_UNIT], "PRODUCTION_PROCESS_CWD_CGROUP_DRIFT")
    state = unit_state(PROD_UNIT)["properties"]
    need(state.get("NeedDaemonReload") == "no" and state.get("User") == PROD_USER and
         state.get("WorkingDirectory") == str(stage), "PRODUCTION_EFFECTIVE_UNIT_DRIFT")
    props = "ProtectSystem,ProtectHome,NoNewPrivileges,PrivateTmp,PrivateDevices,CapabilityBoundingSet,TemporaryFileSystem,ControlGroup"
    loaded = dict(row.split("=",1) for row in run(["/usr/bin/systemctl", "show", PROD_UNIT,
        "--no-pager", "--property=" + props], maximum=16384).decode().splitlines() if "=" in row)
    need(loaded.get("ProtectSystem") == "strict" and loaded.get("ProtectHome") == "yes" and
         loaded.get("NoNewPrivileges") == "yes" and loaded.get("PrivateTmp") == "yes" and
         loaded.get("PrivateDevices") == "yes" and loaded.get("CapabilityBoundingSet") in ("", " ") and
         loaded.get("TemporaryFileSystem") == "/run:ro" and loaded.get("ControlGroup") == "/system.slice/" + PROD_UNIT,
         "PRODUCTION_EFFECTIVE_SANDBOX_DRIFT")
    sockets = run(["/usr/bin/ss", "-H", "-ltnpe"], maximum=1048576).decode().splitlines()
    listening = [row for row in sockets if re.search(r":3032\s", row)]
    need(len(listening) == 1 and "127.0.0.1:3032" in listening[0] and "pid=" + str(pid) + "," in listening[0]
         and "uid:990" in listening[0], "PRODUCTION_LOOPBACK_PID_SOCKET_DRIFT")
    environment, database, password = production_runtime_environment()
    actual = dict(row.split(b"=", 1) for row in (Path("/proc") / str(pid) / "environ").read_bytes().split(b"\0") if b"=" in row)
    need(hmac.compare_digest(actual.get(b"SESSION_SECRET", b""), environment["SESSION_SECRET"].encode()) and
         hmac.compare_digest(actual.get(b"DATABASE_URL", b""), environment["DATABASE_URL"].encode()), "PRODUCTION_PROCESS_SECRET_IDENTITY_DRIFT")
    pg = production_database_witness(database, password)
    kernel = production_kernel_probe(policy["steam_addresses"])
    admission_raw = root_file(Path(policy["journal_path"]) / "runtime-admission.json", 32768, 0o600)
    need(sha(admission_raw) == policy["admission_sha256"], "PRODUCTION_NATIVE_ADMISSION_RECEIPT_DRIFT")
    admission = parse(admission_raw)
    need(admission.get("status") == "NATIVE_PRODUCTION_ADMISSION_PASS" and
         admission.get("source_sha") == policy["source_sha"] and admission.get("candidate_pid") == pid and
         admission.get("candidate_start_ticks") == pid_ticks and
         admission.get("public_cutover_authorized") is False and admission.get("financial_authorized") is False,
         "PRODUCTION_NATIVE_ADMISSION_BINDING_DRIFT")
    # GET-only negative route check. Unsafe method probes are sealed in the
    # one-time admission receipt, not repeated by observers.
    need(pg["read_acl_sha256"] == admission["catalog"]["read_acl_sha256"] and
         pg["definer_identity_sha256"] == admission["catalog"]["definer_identity_sha256"], "PRODUCTION_SEALED_READ_ACL_OR_DEFINER_DRIFT")
    steam = production_current_steam_tls()
    refresh = production_refresh_unit_identity()
    need(refresh == policy["refresh_units"], "PRODUCTION_REFRESH_SOURCE_OR_EFFECTIVE_DRIFT")
    need(type(policy.get("critical_runtime")) is list and 11 <= len(policy["critical_runtime"]) <= 17,
         "PRODUCTION_CRITICAL_RUNTIME_INVENTORY_REQUIRED")
    for row in policy["critical_runtime"]:
        need(type(row.get("path")) is str and not Path(row["path"]).is_absolute() and ".." not in Path(row["path"]).parts and
             type(row.get("bytes")) is int and 0 < row["bytes"] <= 16777216 and
             sha(root_file(stage / row["path"], 16777216)) == row["sha256"], "PRODUCTION_CRITICAL_RUNTIME_BYTES_CHANGED")
    for method, path, expected in (("GET", "/api/parse_replay", 403),):
        request = urllib.request.Request("http://127.0.0.1:3331" + path, method=method, data=b"" if method == "POST" else None)
        try: urllib.request.urlopen(request, timeout=3); raise Hold("PRODUCTION_READONLY_PROXY_BYPASS")
        except urllib.error.HTTPError as response: need(response.code == expected, "PRODUCTION_READONLY_PROXY_METHOD_DRIFT")
    for path in ("/api/health", "/api/chain-id"):
        with urllib.request.urlopen("http://127.0.0.1:3331" + path, timeout=5) as response:
            need(response.status == 200 and len(response.read(262145)) <= 262144, "PRODUCTION_READONLY_PROXY_HEALTH_FAILED")
    asset_mount=production_published_mount(pid,stage,assets)
    need(production_protected() == before and ticks(pid) == pid_ticks, "PRODUCTION_NATIVE_WITNESS_PROCESS_DRIFT")
    return {"schema": "aoe2war.app.production-witness.v1", "status": "NATIVE_PRODUCTION_PROFILE_PASS",
      "profile": PROD_PROFILE, "source_sha": policy["source_sha"], "build_id": policy["build_id"], "build_version": policy["build_version"],
      "stage": str(stage), "uid": PROD_UID, "gid": PROD_GID, "unit": PROD_UNIT, "port": PROD_PORT,
      "candidate_pid": pid, "candidate_start_ticks": pid_ticks, "original_pid": OLD_PID,
      "original_start_ticks": OLD_TICKS, "preview_pid": 1483304, "protected_snapshot_sha256": policy["protected_snapshot_sha256"],
      "postgres": pg, "kernel": kernel, "steam": steam, "historical_steam_admission": admission["steam"],
      "critical_runtime_sha256": sha(canonical(policy["critical_runtime"])), "refresh_units": refresh,
      "published_assets_sha256": sha(canonical(assets)), "published_assets_mount": asset_mount, "guard_sha256": policy["guard_sha256"],
      "unit_sha256": policy["unit_sha256"], "nft_shape_sha256": policy["nft_shape_sha256"], "manifest_sha256": policy["manifest_sha256"],
      "profile_sha256": sha(root_file(PROD_POLICY, 32768, 0o400)), "admission_sha256": policy["admission_sha256"],
      "read_only_observation": True, "signing_identity_equal_original": True, "secret_values_or_fingerprints_disclosed": False,
      "financial_authorized": False, "authenticated_browser_roles_verified": False, "public_cutover_authorized": False}

def production_write(path, raw, mode):
    need(isinstance(raw, bytes) and 0 < len(raw) <= 1048576, "PRODUCTION_INSTALL_BYTES_BOUND")
    directory(path.parent)
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, "wb") as output:
        output.write(raw); output.flush(); os.fsync(output.fileno())
    os.chmod(path, mode); fsync_directory(path.parent)


def production_start(payload):
    plan = production_plan(payload)
    need(payload.get("plan_sha256") == sha(canonical(plan)), "PRODUCTION_APPROVED_PLAN_CHANGED")
    grant = production_grant(payload, plan)
    journal = PROD_AUDIT / ("prod-" + payload["nonce"])
    # The first mutation consumes exactly this nonce, before any role/service/
    # filesystem installation. Failed or interrupted journals never replay.
    PROD_AUDIT.mkdir(mode=0o700, exist_ok=True); directory(PROD_AUDIT)
    journal.mkdir(mode=0o700); fsync_directory(PROD_AUDIT)
    seal(journal / "entered.json", {"schema": "aoe2war.app.production-entered.v1", "status": "CONSUMED_NO_REPLAY",
        "nonce": payload["nonce"], "plan": plan, "grant": grant, "financial_authorized": False,
        "public_cutover_authorized": False})
    service_attempted = False
    timer_attempted = False
    enable_attempted = False
    try:
        need(sha(canonical(production_protected())) == plan["protected_snapshot_sha256"], "PRODUCTION_PROTECTED_PREIMAGE_CHANGED")
        sources = {name: production_source(payload, name) for name in PROD_SOURCE_FILES}
        stage = Path(plan["stage"])
        extracted = production_extract(production_materialize_runtime(plan), plan["artifact"], stage)
        for base in (PROD_BASE.parent, PROD_LIB.parent):
            base.mkdir(mode=0o755, exist_ok=True); directory(base)
        PROD_BASE.mkdir(mode=0o700); PROD_LIB.mkdir(mode=0o755)
        for name, raw in sources.items():
            production_write(PROD_LIB / Path(name).name, raw, 0o400 if name.endswith((".sql",".json")) else 0o644)
        downloads=stage / "public/downloads"
        need(not downloads.is_symlink(),"PRODUCTION_ASSET_BIND_TARGET_SYMLINK")
        downloads.mkdir(mode=0o755,parents=True,exist_ok=True)
        password = secrets.token_urlsafe(48)
        signing_key, database = production_original_identity()
        production_install_database(database, sources["config/nonfinancial-production-auth.sql"], password, journal)
        production_write(PROD_ENV, ("DATABASE_URL=postgresql://" + PROD_DB_ROLE + ":" + password +
            "@127.0.0.1:5432/" + database + "\nSESSION_SECRET=").encode() + signing_key + b"\n", 0o600)
        run(["/usr/sbin/groupadd", "--gid", str(PROD_GID), PROD_USER])
        run(["/usr/sbin/useradd", "--uid", str(PROD_UID), "--gid", str(PROD_GID), "--no-create-home",
             "--home-dir", "/nonexistent", "--shell", "/usr/sbin/nologin", PROD_USER])
        production_write(Path("/etc/systemd/system") / PROD_UNIT, production_unit_bytes(stage), 0o644)
        production_write(PROD_PROXY, production_proxy_bytes(), 0o644)
        refresh_service, refresh_timer = production_refresh_units()
        production_write(Path("/etc/systemd/system/aoe2war-steam-egress-refresh.service"), refresh_service, 0o644)
        production_write(Path("/etc/systemd/system/aoe2war-steam-egress-refresh.timer"), refresh_timer, 0o644)
        run(["/usr/sbin/nft", "--check", "-f", "-"], data=production_nft_bytes(plan["steam_addresses"]))
        run(["/usr/sbin/nft", "-f", "-"], data=production_nft_bytes(plan["steam_addresses"]))
        run(["/usr/sbin/nginx", "-t"])
        need(sha(root_file(Path("/etc/nginx/sites-available/aoe2war.com"), 131072)) == PROD_NGINX_PREIMAGE,
             "PRODUCTION_PRIVATE_PROXY_CHANGED_PUBLIC_SELECTORS")
        run(["/usr/bin/systemctl", "reload", "nginx"], timeout=30)
        run(["/usr/bin/systemctl", "daemon-reload"])
        policy = {"schema": "aoe2war.app.approved-production-profile.v1", "profile": PROD_PROFILE,
            "source_sha": payload["source_sha"], "build_id": plan["artifact"]["build_id"],
            "build_version": plan["artifact"]["build_version"], "stage": str(stage), "uid": PROD_UID, "gid": PROD_GID,
            "unit": PROD_UNIT, "port": PROD_PORT, "artifact": plan["artifact"], "ci_artifact": plan["ci_artifact"], "manifest_sha256": plan["artifact"]["manifest_sha256"],
            "guard_sha256": sha(sources["scripts/r25_b_guard_production_v1.cjs"]), "unit_sha256": plan["unit_sha256"],
            "nft_shape_sha256": production_nft_shape(), "private_proxy_sha256": plan["private_proxy_sha256"],
            "sql_sha256": sha(sources["config/nonfinancial-production-auth.sql"]), "protected_snapshot_sha256": plan["protected_snapshot_sha256"],
            "native_plan_sha256": payload["plan_sha256"], "journal_path": str(journal),
            "controller_sha256": sha(sources["scripts/r25_c_start_root.py"]), "steam_addresses": plan["steam_addresses"],
            "refresh_units": production_refresh_unit_identity(), "critical_runtime": production_critical_runtime(stage),
            "published_assets": plan["published_assets"], "assets_source_sha256": sha(sources["config/nonfinancial-production-watcher-assets.json"])}
        # Mark attempted before invoking: a timeout/nonzero may still start it.
        service_attempted = True
        run(["/usr/bin/systemctl", "start", PROD_UNIT], timeout=95)
        pid, start_ticks = production_wait(policy)
        environment, database, password = production_runtime_environment()
        current_steam_addresses = production_admission_steam_refresh()
        admission = {"schema": "aoe2war.app.production-admission.v1", "status": "NATIVE_PRODUCTION_ADMISSION_PASS",
            "source_sha": payload["source_sha"], "candidate_pid": pid, "candidate_start_ticks": start_ticks,
            "postgres": production_database_admission(database, password), "users_identity_sequence_may_advance": True, "catalog": production_database_witness(database, password),
            "kernel": production_kernel_probe(current_steam_addresses), "steam": production_steam_probe(environment, Path(plan["stage"])),
            "financial_authorized": False, "public_cutover_authorized": False}
        request = urllib.request.Request("http://127.0.0.1:3331/api/health", method="POST", data=b"")
        try: urllib.request.urlopen(request, timeout=3); raise Hold("PRODUCTION_PRIVATE_PROXY_POST_ACCEPTED")
        except urllib.error.HTTPError as response: need(response.code == 405, "PRODUCTION_PRIVATE_PROXY_POST_STATUS")
        admission["private_proxy_post_denied"] = True
        seal(journal / "runtime-admission.json", admission)
        policy["admission_sha256"] = sha(root_file(journal / "runtime-admission.json", 32768, 0o600))
        production_write(PROD_POLICY, canonical(policy) + b"\n", 0o400)
        witness = production_witness({"profile_path": str(PROD_POLICY)})
        timer_attempted = True
        run(["/usr/bin/systemctl", "start", "aoe2war-steam-egress-refresh.timer"], timeout=30)
        need(sha(canonical(production_protected())) == plan["protected_snapshot_sha256"], "PRODUCTION_PROTECTED_CONTINUITY_FAILED")
        enable_attempted = True
        run(["/usr/bin/systemctl", "enable", PROD_UNIT, "aoe2war-steam-egress-refresh.timer"], timeout=30)
        complete = {"schema": "aoe2war.app.production-started.v1", "status": "PRODUCTION_3032_ADMITTED_NOT_PUBLIC",
            "nonce": payload["nonce"], "source_sha": payload["source_sha"], "build_id": policy["build_id"],
            "build_version": policy["build_version"], "candidate_pid": pid, "candidate_start_ticks": start_ticks,
            "uid": PROD_UID, "gid": PROD_GID, "unit": PROD_UNIT, "port": PROD_PORT,
            "profile_sha256": witness["profile_sha256"], "admission_sha256": policy["admission_sha256"],
            "plan_sha256": payload["plan_sha256"], "artifact": plan["artifact"], "extracted": extracted, "witness": witness,
            "financial_authorized": False, "public_cutover_authorized": False, "completed_real_steam_login": False,
            "authenticated_browser_roles_verified": False}
        seal(journal / "complete.json", complete)
        return complete
    except BaseException as exc:
        stopped = False
        if enable_attempted:
            try: run(["/usr/bin/systemctl", "disable", PROD_UNIT, "aoe2war-steam-egress-refresh.timer"], timeout=30)
            except BaseException: pass
        if timer_attempted:
            try: run(["/usr/bin/systemctl", "stop", "aoe2war-steam-egress-refresh.timer"], timeout=30)
            except BaseException: pass
        if service_attempted:
            try:
                run(["/usr/bin/systemctl", "stop", PROD_UNIT], timeout=45)
                current = unit_state(PROD_UNIT)["properties"]
                stopped = current.get("ActiveState") == "inactive" and current.get("MainPID") == "0"
            except BaseException: pass
        # Preserve installed bytes/PG additions and consumed journal for review;
        # never erase/pretend rollback of an ambiguous native transaction.
        seal(journal / "hold.json", {"status": "HOLD_NO_REPLAY", "reason_type": type(exc).__name__,
            "new_service_stop_attempted": service_attempted, "new_service_stop_proven": stopped,
            "financial_authorized": False, "public_cutover_authorized": False})
        raise

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=("plan", "start", "production-plan", "production-start", "production-witness", "production-refresh-steam"), required=True)
    args = ap.parse_args()
    if args.phase == "production-refresh-steam":
        print(json.dumps(production_refresh(), sort_keys=True)); return
    raw = sys.stdin.buffer.read(131073)
    need(0 < len(raw) <= 131072, "INPUT_SIZE")
    payload = parse(raw)
    if args.phase == "production-witness":
        # F may hold the mutation lock while requesting a genuine observer.
        # Observe its immutable identity, never reacquire or alter it.
        before_lock = LOCK.lstat()
        need(stat.S_ISREG(before_lock.st_mode) and (before_lock.st_dev, before_lock.st_ino, before_lock.st_uid,
             stat.S_IMODE(before_lock.st_mode)) == LOCK_ID, "ORIGINAL_RELEASE_LOCK_CHANGED")
        report = production_witness(payload)
        after_lock = LOCK.lstat()
        need((before_lock.st_dev,before_lock.st_ino,before_lock.st_size,before_lock.st_mtime_ns) ==
             (after_lock.st_dev,after_lock.st_ino,after_lock.st_size,after_lock.st_mtime_ns), "OBSERVER_RELEASE_LOCK_CHANGED")
        print(json.dumps(report, sort_keys=True)); return
    s = LOCK.lstat()
    need(stat.S_ISREG(s.st_mode) and
         (s.st_dev, s.st_ino, s.st_uid, stat.S_IMODE(s.st_mode)) == LOCK_ID,
         "ORIGINAL_RELEASE_LOCK_CHANGED")
    fd = os.open(LOCK, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd)
        need((opened.st_dev, opened.st_ino) == (s.st_dev, s.st_ino), "RELEASE_LOCK_OPEN_RACE")
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.phase == "production-plan":
            plan = production_plan(payload)
            report = {"status": "PASS_PRODUCTION_PROFILE_PLAN_READ_ONLY_NOT_START_AUTHORITY", "plan": plan, "plan_sha256": sha(canonical(plan))}
        elif args.phase == "production-start":
            report = production_start(payload)
        elif args.phase == "plan":
            _, report = admit(payload)
            report = {"status": "PASS_START_PLAN_READ_ONLY_NOT_START_AUTHORITY",
                      "plan": report, "plan_sha256": sha(canonical(report))}
        else:
            report = start(payload)
        print(json.dumps(report, sort_keys=True))
    finally:
        os.close(fd)

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, tarfile.TarError, zipfile.BadZipFile) as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc)[:160],
                          "no_blind_retry": True, "public_cutover_authorized": False}, sort_keys=True))
        sys.exit(2)
