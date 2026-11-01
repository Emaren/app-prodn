#!/usr/bin/env python3
"""One-use R25 3031 START; PRESTART admits startup, POSTSTART gates cutover.

Executed only by the separately reviewed Mac launcher over strict existing SSH.
No installation, daemon-reload, build, Nginx, database or old-service mutation.
Read-only plan authenticates the native repaired B PRESTART and accepted E FINAL.
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
         1000 < payload["operator_size"] < 65536,
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
        stable = re.match(r"\{\s*path=[^;]+;\s*argv\[\]=.*?;\s*ignore_errors=(?:yes|no)\s*;", command, re.S)
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

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=("plan", "start"), required=True)
    args = ap.parse_args()
    raw = sys.stdin.buffer.read(131073)
    need(0 < len(raw) <= 131072, "INPUT_SIZE")
    payload = parse(raw)
    s = LOCK.lstat()
    need(stat.S_ISREG(s.st_mode) and
         (s.st_dev, s.st_ino, s.st_uid, stat.S_IMODE(s.st_mode)) == LOCK_ID,
         "ORIGINAL_RELEASE_LOCK_CHANGED")
    fd = os.open(LOCK, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd)
        need((opened.st_dev, opened.st_ino) == (s.st_dev, s.st_ino), "RELEASE_LOCK_OPEN_RACE")
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.phase == "plan":
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
    except (RuntimeError, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc)[:160],
                          "no_blind_retry": True, "public_cutover_authorized": False}, sort_keys=True))
        sys.exit(2)
