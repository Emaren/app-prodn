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
JOURNAL = C_AUDIT / "start-3031-v7"
PREV_JOURNAL = C_AUDIT / "start-3031-v6"
V5_JOURNAL = C_AUDIT / "start-3031-v5"
V4_JOURNAL = C_AUDIT / "start-3031-v4"
V3_JOURNAL = C_AUDIT / "start-3031-v3"
V2_JOURNAL = C_AUDIT / "start-3031-v2"
V1_JOURNAL = C_AUDIT / "start-3031-v1"
V1_STARTED_SHA = "cbb0e36523991cf39a8b7562268141ed8fbde5109d60d59abdcf16923e783a53"
V1_HOLD_SHA = "55a8d3310361330cf04b0070caaf844ce9f7f7160019d0bf88f111bf571a1e22"
V2_STARTED_SHA = "b584ce8a73097b1aa9cd575c96ffdbf2ee10eb61aed0cb9719dd65a80e060232"
V2_STAGED_SHA = "10685b859e9638eba82b17d3811ffc273a3fd0c1d4a0538a8e70e1f210afd4da"
V2_HOLD_SHA = "1ad48d5a0419ed9c09e37b04653192386dbd044049b1553774668b23b6709863"
V3_STARTED_SHA = "4a773aada3424f2669c30083ed202136da5d2a922d9cd2102128a975a7a20496"
V3_STAGED_SHA = "dd16194827938b688fe27d1a1f4290142dc8f44f3789ba1664ba2d13d8ad200b"
V3_HOLD_SHA = "53033a73172667a40344873e4d71e3813f208bfec91f77cc0a409fba65d263ae"
V4_STARTED_SHA = "7f103a16b0e6151005b0313fe1553a9cc800e40128e3e165149f8510654d1a1d"
V4_STAGED_SHA = "3fa553a2a283d01785059e2aec142df91d3b81453a79af9d0abc38c93868ba3c"
V4_HOLD_SHA = "a44c5461fde1ca1c80eba79954c5b7cc50b77938abf144386820b7520f7de744"
V5_STARTED_SHA = "0fa650bd705d606852a1317d1b304cd931934725d59addd8e7b3d64606784e2f"
V5_STAGED_SHA = "c14c270e3f7bb527216d54f510cf38bf529c870f9df46d35ef05bc338b57a7b6"
V5_HOLD_SHA = "88903bf9f2abc8a6ceaa1bd779d40c89eaa5a26a7fa080322f177e1f7ad3e887"
V6_STARTED_SHA = "103983ebaf3f3113899e54a2caa24d762c0fbda70679c164b67790b9a71b8bda"
V6_STAGED_SHA = "34d140cb9cbc86814b81accc02347995399664aa6615d31fd67e847c64d02faa"
V6_HOLD_SHA = "1ad48d5a0419ed9c09e37b04653192386dbd044049b1553774668b23b6709863"
V2_WITNESS_SHA = "8f6a30172a089aca7de4b5941791c1d1301a40486e872cc8b6efadc386acccda"
V2_WITNESS_SIZE = 23853
V2_DROPIN_SHA = "f24656b3120484327e17c59f449ad0125f7014869fa8018fe1c4c05d26f65f74"
V2_DROPIN_SIZE = 1182
V2_WITNESS_PATH = Path("/etc/aoe2war/r24-parallel-web/approved-runtime-namespace-v2.py")
V2_DROPIN_PATH = Path("/etc/systemd/system/aoe2hdbets-web-r24.service.d/95-r25-ns-recovery.conf")
V3_DROPIN_PATH = Path("/etc/systemd/system/aoe2hdbets-web-r24.service.d/96-r25-prestart-host-mount.conf")
V7_DROPIN_PATH = Path("/etc/systemd/system/aoe2hdbets-web-r24.service.d/97-r25-systemd-env.conf")
V7_ENV_KEYS = ("CACHE_DIRECTORY", "MEMORY_PRESSURE_WATCH", "MEMORY_PRESSURE_WRITE")
V7_DROPIN_SIZE = 318
V7_DROPIN_SHA = "3d67fc109138040c527b529ef16dc03642f75b4eb0312fce7cfff2fb39c578f9"
V3_DROPIN_SIZE = 783
V3_DROPIN_SHA = "84cbb2e8563bb3355a4304b3feab563617b1164a8f1caf1608f592af1ef8aaac"
V4_WITNESS_SIZE = 23869
V4_WITNESS_SHA = "437e87fbd91073d157fc1ca15f58a4e9d5aa4f144b7c8d04ae1549132ac3c522"
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
    owner_mode = body.startswith("R25_START_V7_OWNER_NONFINANCIAL_ACCEPT\n")
    header = "R25_START_V7_OWNER_NONFINANCIAL_ACCEPT" if owner_mode else "R25_START_V7_INDEPENDENT_REVIEW"
    block = re.fullmatch(re.escape(header) + r"\n" + re.escape('```') +
                         r"json\n(.+)\n" + re.escape('```') + r"\n?", body, re.S)
    need(bool(block), "OWNER_OR_OPTIONAL_REVIEW_MANIFEST_FORMAT")
    record = parse(block[1])
    need(record.get("decision") == "ACCEPT"
         and record.get("scope") == "RECOVERY_START_3031_V7_ONLY",
         "EXACT_RELEASE_SCOPE_REQUIRED")
    if owner_mode:
        need(record.get("schema") == "aoe2war.r25.c.owner-nonfinancial-release.v1"
             and record.get("release_authority") == "OWNER_ONLY_NONFINANCIAL"
             and record.get("owner_login") == "Emaren"
             and record.get("owner_accepts_no_independent_review") is True
             and record.get("independent_review") is False
             and record.get("nonfinancial_only") is True
             and record.get("public_cutover_authorized") is False
             and record.get("financial_authorized") is False
             and "reviewer" not in record and "github_review_provenance" not in record,
             "AUTHENTIC_OWNER_NONFINANCIAL_RELEASE_REQUIRED")
    else:
        need(record.get("schema") == "aoe2war.r25.c.start-source-review.v7"
             and record.get("independent_review") is True
             and record.get("reviewer") in INDEPENDENT_REVIEWERS
             and record.get("publisher_is_reviewer_identity") is False,
             "OPTIONAL_INDEPENDENT_SOURCE_REVIEW_REQUIRED")
    need(bool(H40.fullmatch(payload["source_sha"])) and
         record.get("source_sha") == payload["source_sha"] and
         record.get("operator_sha256") == payload["operator_sha256"] and
         record.get("operator_size") == payload["operator_size"] and
         record.get("operator_blob") == payload["operator_blob"] and
         bool(H64.fullmatch(payload["operator_sha256"])) and
         bool(H40.fullmatch(payload["operator_blob"])) and
         1000 < payload["operator_size"] < 65536,
         "EXACT_REVIEWED_SOURCE_PIN_REQUIRED")
    need(re.fullmatch(r"https://github.com/Emaren/app-prodn/pull/1119#issuecomment-[0-9]+",
                      payload["review_url"]) is not None, "REVIEW_RECORD_LOCATION")
    need(payload.get("review_author") == "Emaren"
         and payload.get("review_issue_url") == "https://api.github.com/repos/Emaren/app-prodn/issues/1119",
         "AUTHENTICATED_MAC_REVIEW_METADATA_REQUIRED")
    proof = payload.get("github_review_proof", {})
    if owner_mode:
        need(isinstance(proof, dict)
             and proof.get("mode") == "OWNER_ONLY_NONFINANCIAL"
             and proof.get("owner_login") == "Emaren"
             and proof.get("owner_comment_sha256") == sha(body.encode())
             and proof.get("review_commit") == payload["source_sha"],
             "OWNER_NONFINANCIAL_GITHUB_PROOF_REQUIRED")
    else:
        pin = record.get("github_review_provenance", {})
        designated = pin.get("reviewer_login") if isinstance(pin, dict) else None
        need(isinstance(pin, dict) and isinstance(proof, dict)
             and proof.get("mode") == "OPTIONAL_INDEPENDENT_REVIEW"
             and isinstance(designated, str)
             and bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,38}", designated))
             and designated != "Emaren"
             and type(pin.get("review_id")) is int and pin["review_id"] > 0
             and proof.get("review_id") == pin["review_id"]
             and proof.get("reviewer_login") == designated
             and bool(H64.fullmatch(str(pin.get("review_body_sha256", ""))))
             and proof.get("review_body_sha256") == pin["review_body_sha256"]
             and proof.get("review_commit") == payload["source_sha"]
             and isinstance(proof.get("review_submitted_at"), str)
             and len(proof["review_submitted_at"]) >= 20,
             "AUTHENTIC_OPTIONAL_INDEPENDENT_GITHUB_REVIEW_PROOF_REQUIRED")
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

def b_recovery_historical_admission(payload):
    """Sealed v1 B provenance, but verify the presently effective v2 wall.

    Historical original-B witnesses checked a now-replaced /run layout.
    Preserve original receipts, signed source, finance network and database
    evidence without applying superseded filesystem assumptions to a live unit.
    A separate exact-pinned v2 witness enforces the current private /run:ro
    wall. V3 positive PRESTART still requires native proof after installation.
    """
    repair = pinned_module(payload["b_repair_b64"], B_REPAIR_SHA, 14001, "reviewed_b_repair")
    witness = pinned_module(payload["b_witness_b64"], B_WITNESS_SHA, 22310, "reviewed_b_witness")
    roots = repair.original_receipt()
    rec = repair.json_root(repair.JOURNAL / "receipt.json")
    need(rec.get("status") == "WITNESS_ONLY_REPAIR_COMPLETE_NOT_PRESTART_AUTHORITY"
         and rec.get("report_sha256") == repair.canonical_sha(rec)
         and rec.get("report_sha256") == B_PHYSICAL_REPAIR_REPORT_SHA
         and rec.get("installed_witness_sha256") == B_WITNESS_SHA
         and rec.get("original_install_report_sha256") == repair.INSTALL_SHA
         and (rec.get("original_started_file_sha256"), rec.get("original_receipt_file_sha256")) == roots
         and sha(repair.trusted(repair.JOURNAL / "old-witness.py", mode=0o600)) == repair.OLD_SHA
         and rec.get("new_service_started") is False
         and rec.get("public_cutover_authorized") is False
         and rec.get("no_installer_rerun") is True, "AUTHENTIC_B_HISTORICAL_RECEIPTS_REQUIRED")
    need(repair.pwd.getpwnam(repair.USER).pw_uid == UID, "B_DEDICATED_UID_CHANGED")
    for file, expected, mode in ((repair.GUARD, repair.GUARD_SHA, None),
                                (repair.DROPIN, repair.DROPIN_SHA, 0o644),
                                (repair.BASE, repair.BASE_SHA, 0o644),
                                (repair.OLD, B_WITNESS_SHA, 0o644)):
        raw = (repair.trusted(file, mode=mode, max_size=32768)
               if mode is not None else repair.trusted(file, max_size=8192))
        need(sha(raw) == expected, "B_INSTALLED_SOURCE_PIN_DRIFT")
    old, new = witness.systemd(OLD_UNIT), witness.systemd(NEW_UNIT)
    need(old.get("ActiveState") == "active" and old.get("MainPID") == str(OLD_PID)
         and Path("/proc/2625090").is_dir(),
         "B_ORIGINAL_WEB_FINANCIAL_PID_CHANGED")
    need(new.get("LoadState") == "loaded" and new.get("ActiveState") == "failed"
         and new.get("MainPID") == "0" and new.get("User") == USER
         and new.get("WorkingDirectory") == str(STAGE), "B_V1_FAILED_UNIT_STATE_REQUIRED")
    # The original B witness is retained for immutable historical receipts,
    # finance egress and SQL checks, NOT for validating today's candidate wall.
    # Its old /run InaccessiblePaths contract is incompatible with the
    # separately reviewed v2 private read-only tmpfs, causing a false HOLD.
    # Validate the live unit using the exact source-pinned v2 witness instead.
    current_witness = pinned_module(payload["v2_witness_b64"],
                                    V2_WITNESS_SHA, V2_WITNESS_SIZE,
                                    "reviewed_b_v2_historical_current_wall")
    effective = effective_unit_v3(current_witness)
    repair.port_free()
    need(repair.C_PATH.is_file() and not repair.C_PATH.is_symlink()
         and repair.C_PATH.read_text().strip() == repair.C_BUILD,
         "B_C_SEALED_BUILD_DRIFT")
    need(witness.c_archive_source_identity() == TARGET, "B_STAGE_SOURCE_DRIFT")
    nft = witness.nft_policy(UID)
    db = witness.db_proof(witness.root_db_envfile(), UID)
    need(db.get("role") == "aoe2war_r25_web_ro"
         and db.get("server_transaction_ro") is True,
         "B_SELECT_ONLY_DATABASE_ROLE_UNPROVEN")
    return {"status":"PASS_B_HISTORICAL_V1_RECEIPTS_AND_FAILED_UNIT_PREPARED_FOR_V2",
            "original_install_report_sha256":repair.INSTALL_SHA,
            "B_repair_report_sha256":rec["report_sha256"],
            "original_started_sha256":roots[0],"original_receipt_sha256":roots[1],
            "old_web_pid":OLD_PID,"new_uid":UID,"target_sha":TARGET,
            "current_v2_wall_effective_sha256":effective, "pg_role":db["role"],
            "pg_proof_sha256":sha(canonical(db)), "kernel_uid_egress_sha256":nft,
            "positive_v2_prestart_executed":False, "public_cutover_authorized":False,
            "financial_authorized":False}

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
    need(sys.platform=="linux" and os.geteuid()==0
         and socket.gethostname().split(".")[0]==HOST,"EXACT_HEL1_ROOT_REQUIRED")
    reviewed(payload)
    need(not JOURNAL.exists() and not JOURNAL.is_symlink()
         and not (C_AUDIT/"CANDIDATE_START_ATTEMPT.json").exists()
         and not (C_AUDIT/"CANDIDATE_RUNNING.json").exists(),
         "V7_ALREADY_ATTEMPTED_NO_REPLAY")
    history=(
        (V1_JOURNAL/"started.json",V1_STARTED_SHA,131072),
        (V1_JOURNAL/"hold.json",V1_HOLD_SHA,32768),
        (V2_JOURNAL/"started.json",V2_STARTED_SHA,131072),
        (V2_JOURNAL/"staged.json",V2_STAGED_SHA,32768),
        (V2_JOURNAL/"hold.json",V2_HOLD_SHA,32768),
        (V3_JOURNAL/"started.json",V3_STARTED_SHA,131072),
        (V3_JOURNAL/"staged.json",V3_STAGED_SHA,32768),
        (V3_JOURNAL/"hold.json",V3_HOLD_SHA,32768),
        (V4_JOURNAL/"started.json",V4_STARTED_SHA,131072),
        (V4_JOURNAL/"staged.json",V4_STAGED_SHA,32768),
        (V4_JOURNAL/"hold.json",V4_HOLD_SHA,32768),
        (V5_JOURNAL/"started.json",V5_STARTED_SHA,131072),
        (V5_JOURNAL/"staged.json",V5_STAGED_SHA,32768),
        (V5_JOURNAL/"hold.json",V5_HOLD_SHA,32768),
        (PREV_JOURNAL/"started.json",V6_STARTED_SHA,131072),
        (PREV_JOURNAL/"staged.json",V6_STAGED_SHA,32768),
        (PREV_JOURNAL/"hold.json",V6_HOLD_SHA,32768))
    for file,expected,limit in history:
        need(sha(root_file(file,limit,0o600))==expected,
             "CONSUMED_V1_TO_V6_JOURNAL_EXACT_BYTES_CHANGED")
    v1started=parse(root_file(V1_JOURNAL/"started.json",131072,0o600))
    v1hold=parse(root_file(V1_JOURNAL/"hold.json",32768,0o600))
    v2started=parse(root_file(V2_JOURNAL/"started.json",131072,0o600))
    v2staged=parse(root_file(V2_JOURNAL/"staged.json",32768,0o600))
    v2hold=parse(root_file(V2_JOURNAL/"hold.json",32768,0o600))
    v3started=parse(root_file(V3_JOURNAL/"started.json",131072,0o600))
    v3staged=parse(root_file(V3_JOURNAL/"staged.json",32768,0o600))
    v3hold=parse(root_file(V3_JOURNAL/"hold.json",32768,0o600))
    v4started=parse(root_file(V4_JOURNAL/"started.json",131072,0o600))
    v4staged=parse(root_file(V4_JOURNAL/"staged.json",32768,0o600))
    v4hold=parse(root_file(V4_JOURNAL/"hold.json",32768,0o600))
    v5started=parse(root_file(V5_JOURNAL/"started.json",131072,0o600))
    v5staged=parse(root_file(V5_JOURNAL/"staged.json",32768,0o600))
    v5hold=parse(root_file(V5_JOURNAL/"hold.json",32768,0o600))
    v6started=parse(root_file(PREV_JOURNAL/"started.json",131072,0o600))
    v6staged=parse(root_file(PREV_JOURNAL/"staged.json",32768,0o600))
    v6hold=parse(root_file(PREV_JOURNAL/"hold.json",32768,0o600))
    need(v1started.get("status")=="START_ENTERED_DO_NOT_RETRY"
         and v1hold.get("status")=="HOLD_NO_REPLAY"
         and v1hold.get("reason_type")=="ProcessLookupError"
         and v2started.get("status")=="START_ENTERED_DO_NOT_RETRY"
         and v2staged.get("status")=="V2_REVIEWED_WALL_STAGED_NOT_STARTED"
         and v2staged.get("v2_witness_sha256")==V2_WITNESS_SHA
         and v2staged.get("v2_dropin_sha256")==V2_DROPIN_SHA
         and v2hold.get("status")=="HOLD_NO_REPLAY"
         and v2hold.get("reason_type")=="Hold"
         and v3started.get("status")=="START_ENTERED_DO_NOT_RETRY"
         and v3started.get("plan",{}).get("schema")=="aoe2war.r25.c.start-plan.v3"
         and v3staged.get("status")=="V3_ROOT_PRESTART_STAGED_NOT_STARTED"
         and v3staged.get("v3_dropin_sha256")==V3_DROPIN_SHA
         and v3hold.get("status")=="HOLD_NO_REPLAY"
         and v3hold.get("reason_type")=="NameError"
         and v3hold.get("new_service_stop_proven") is True
         and v3hold.get("only_new_service_stop_attempted") is True
         and v4started.get("status")=="START_ENTERED_DO_NOT_RETRY"
         and v4started.get("plan",{}).get("schema")=="aoe2war.r25.c.start-plan.v4"
         and v4staged.get("status")=="V4_PRESERVED_V3_WALL_PRESTART_PROVEN"
         and v4staged.get("v4_witness_sha256")==V4_WITNESS_SHA
         and v4hold.get("status")=="HOLD_NO_REPLAY"
         and v4hold.get("reason_type")=="Hold"
         and v4hold.get("only_new_service_stop_attempted") is False
         and v4hold.get("new_service_stop_proven") is False
         and v5started.get("status")=="START_ENTERED_DO_NOT_RETRY"
         and v5started.get("plan",{}).get("schema")=="aoe2war.r25.c.start-plan.v5"
         and v5staged.get("status")=="V5_PRESERVED_V4_WALL_PRESTART_PROVEN"
         and v5staged.get("v4_witness_sha256")==V4_WITNESS_SHA
         and v5hold.get("status")=="HOLD_NO_REPLAY"
         and v5hold.get("reason_type")=="RuntimeError"
         and v5hold.get("new_service_stop_proven") is True
         and v5hold.get("only_new_service_stop_attempted") is True
         and v6started.get("status")=="START_ENTERED_DO_NOT_RETRY"
         and v6started.get("plan",{}).get("schema")=="aoe2war.r25.c.start-plan.v6"
         and v6staged.get("status")=="V6_PRESERVED_V5_WALL_PRESTART_PROVEN"
         and v6staged.get("v4_witness_sha256")==V4_WITNESS_SHA
         and v6hold.get("status")=="HOLD_NO_REPLAY"
         and v6hold.get("reason_type")=="Hold"
         and v6hold.get("only_new_service_stop_attempted") is True
         and v6hold.get("new_service_stop_proven") is False
         and all(x.get("public_cutover_authorized") is False for x in (v1hold,v2hold,v3hold,v4hold,v5hold,v6hold))
         and all(not (journal/"running.json").exists() for journal in
             (V1_JOURNAL,V2_JOURNAL,V3_JOURNAL,V4_JOURNAL,V5_JOURNAL,PREV_JOURNAL)),
         "EXACT_PRESERVED_V1_TO_V6_FAILURE_HISTORY_REQUIRED")
    approved_v2_sources(payload)
    approved_v3_dropin(payload)
    approved_v4_witness(payload)
    approved_v7_dropin(payload)
    need(not V7_DROPIN_PATH.exists() and not V7_DROPIN_PATH.is_symlink(),
         "V7_NEW_CANDIDATE_DROPIN_ALREADY_PRESENT")
    need(sha(root_file(V2_WITNESS_PATH,65536,0o644))==V2_WITNESS_SHA
         and sha(root_file(V2_DROPIN_PATH,32768,0o644))==V2_DROPIN_SHA
         and sha(root_file(V3_DROPIN_PATH,32768,0o644))==V3_DROPIN_SHA,
         "EXISTING_V2_V3_INSTALL_IDENTITY_CHANGED")
    raw=run(["/usr/bin/systemctl","show",NEW_UNIT,"--no-pager",
             "--property=ActiveState,MainPID,Result,NeedDaemonReload"]).decode()
    state=dict(row.split("=",1) for row in raw.splitlines() if "=" in row)
    need(state.get("ActiveState")=="failed" and state.get("MainPID")=="0"
         and state.get("Result")=="exit-code" and state.get("NeedDaemonReload")=="no"
         and not candidate_port_present(),
         "V6_CANDIDATE_FAILED_NO_LISTENER_REQUIRED")
    witness=pinned_module(payload["v4_witness_b64"],V4_WITNESS_SHA,V4_WITNESS_SIZE,
                          "reviewed_b_v4")
    effective_unit_v3(witness)
    b=b_recovery_historical_admission(payload)
    c=c_build()
    e=e_rollback(payload["e_certificate"])
    snapshot=protected_snapshot()
    directory(C_AUDIT)
    need(stat.S_IMODE(C_AUDIT.stat().st_mode)==0o700,"C_AUDIT_NOT_PRIVATE")
    hashes={file.parent.name+"_"+file.name:expected for file,expected,_ in history}
    return None, {"schema":"aoe2war.r25.c.start-plan.v7",
        "candidate_sha":TARGET,"historical_receipts":hashes,
        "v2_witness_sha256":V2_WITNESS_SHA,"v2_dropin_sha256":V2_DROPIN_SHA,
        "v3_dropin_sha256":V3_DROPIN_SHA,"v4_witness_sha256":V4_WITNESS_SHA,
        "v7_dropin_sha256":V7_DROPIN_SHA,
        "B_native_prestart":b,"C_build":c,"E_final":e,
        "protected_before":snapshot,"source_sha":payload["source_sha"],
        "operator_sha256":payload["operator_sha256"],
        "review_body_sha256":payload["review_body_sha256"],
        "public_cutover_authorized":False,"financial_authorized":False}


def approved_v2_sources(payload):
    pins = ((payload.get("v2_witness_b64"), V2_WITNESS_SHA, V2_WITNESS_SIZE),
            (payload.get("v2_dropin_b64"), V2_DROPIN_SHA, V2_DROPIN_SIZE))
    outputs = []
    for encoded, digest, size in pins:
        need(isinstance(encoded, str), "V2_SOURCE_NOT_PRESENT")
        data = base64.b64decode(encoded, validate=True)
        need(len(data) == size and sha(data) == digest, "V2_EXACT_REVIEWED_SOURCE_DRIFT")
        outputs.append(data)
    dropin = outputs[1].decode()
    need(dropin.count("TemporaryFileSystem=/run:ro") == 1
         and dropin.count("InaccessiblePaths=") == 2
         and "ExecStart=/usr/bin/node" not in dropin
         and "approved-runtime-namespace-v2.py --phase prestart" in dropin,
         "V2_SANDBOX_AND_PRESTART_CONTRACT")
    return outputs

def approved_v3_dropin(payload):
    encoded = payload.get("v3_dropin_b64")
    need(isinstance(encoded, str), "V3_PINNED_SOURCE_REQUIRED")
    data = base64.b64decode(encoded, validate=True)
    need(len(data) == V3_DROPIN_SIZE and sha(data) == V3_DROPIN_SHA,
         "V3_EXACT_NEW_DROPIN_SOURCE_DRIFT")
    text = data.decode("utf-8")
    commands = [line for line in text.splitlines()
                if line and not line.startswith("#")]
    expected = "/usr/bin/nsenter --target 1 --mount -- /usr/bin/python3 -I -B " + str(V2_WITNESS_PATH) + " --phase prestart --expected-guard-sha256 " + B_GUARD_SHA
    need(commands == ["[Service]", "ExecStartPre=", "ExecStartPre=+" + expected]
         and "TemporaryFileSystem=" not in text and "ExecStart=" not in text
         and "ReadWritePaths=" not in text and "BindPaths=" not in text
         and "InaccessiblePaths=" not in text and "BindReadOnlyPaths=" not in text,
         "V3_PRESTART_ONLY_NO_SANDBOX_WEAKENING")
    return data

def approved_v4_witness(payload):
    encoded=payload.get("v4_witness_b64")
    need(isinstance(encoded,str),"V4_WITNESS_SOURCE_REQUIRED")
    data=base64.b64decode(encoded,validate=True)
    need(len(data)==V4_WITNESS_SIZE and sha(data)==V4_WITNESS_SHA,
         "V4_EXACT_REVIEWED_WITNESS_SOURCE_DRIFT")
    need(b"def runtime_private_run(pid):" in data
         and b'hold("HOST_POSTGRESQL_UNIX_SOCKET_EXPOSED")' in data
         and b'hold("CANDIDATE_PID_REQUIRED_FOR_RUN_WALL")' in data,
         "V4_PRIVATE_RUN_WITNESS_REQUIRED")
    return data

def approved_v7_dropin(payload):
    encoded=payload.get("v7_dropin_b64")
    need(isinstance(encoded,str),"V7_DROPIN_SOURCE_REQUIRED")
    data=base64.b64decode(encoded,validate=True)
    need(len(data)==V7_DROPIN_SIZE and sha(data)==V7_DROPIN_SHA,
         "V7_EXACT_ENV_DROPIN_SOURCE_DRIFT")
    directives=[line.strip() for line in data.decode().splitlines()
                if line.strip() and not line.lstrip().startswith("#")]
    need(directives==["[Service]","UnsetEnvironment="+" ".join(V7_ENV_KEYS)],
         "V7_ONLY_THREE_SYSTEMD_ENV_UNSETS_ALLOWED")
    return data

def exclusive_root_source(path, data):
    directory(path.parent)
    need(not path.exists() and not path.is_symlink(), "V2_SOURCE_ALREADY_EXISTS")
    fd = os.open(path, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,0o644)
    with os.fdopen(fd,"wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    need(sha(root_file(path,65536,0o644)) == sha(data), "V2_FILE_INSTALL_NOT_IDENTICAL")
    fsync_directory(path.parent)

def effective_unit_v2(witness):
    state = witness.systemd(NEW_UNIT)
    need(state.get("ProtectSystem") == "strict" and state.get("ProtectHome") in ("yes", "read-only")
         and state.get("NoNewPrivileges") == "yes" and state.get("PrivateTmp") == "yes"
         and state.get("TemporaryFileSystem") == "/run:ro", "V2_EFFECTIVE_SANDBOX_DRIFT")
    witness.validate_filesystem_wall(state)
    raw = run(["/usr/bin/systemctl","show",NEW_UNIT,"--no-pager",
        "--property=NeedDaemonReload,ExecStart,ExecStartPre,User,Group,WorkingDirectory"],maximum=32768).decode()
    values = dict(row.split("=",1) for row in raw.splitlines() if "=" in row)
    need(values.get("NeedDaemonReload") == "no" and values.get("User") == USER
         and values.get("Group") == USER and values.get("WorkingDirectory") == str(STAGE),
         "V2_EFFECTIVE_UNIT_NOT_LOADED")
    start = values.get("ExecStart","")
    pre = values.get("ExecStartPre","")
    expected="/usr/bin/python3 -I -B "+str(V2_WITNESS_PATH)+" --phase prestart --expected-guard-sha256 "+B_GUARD_SHA
    need(start.count("{ path=")==1 and "argv[]=/usr/bin/node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3031 ;" in start
         and pre.count("{ path=")==1 and ("argv[]="+expected+" ;") in pre,
         "V2_EFFECTIVE_EXECUTION_SCOPE_DRIFT")
    return sha(raw.encode())

def effective_unit_v3(witness):
    state = witness.systemd(NEW_UNIT)
    need(state.get("ProtectSystem") == "strict" and state.get("ProtectHome") in ("yes", "read-only")
         and state.get("NoNewPrivileges") == "yes" and state.get("PrivateTmp") == "yes"
         and state.get("TemporaryFileSystem") == "/run:ro", "V3_EFFECTIVE_SANDBOX_DRIFT")
    witness.validate_filesystem_wall(state)
    raw = run(["/usr/bin/systemctl","show",NEW_UNIT,"--no-pager",
        "--property=NeedDaemonReload,ExecStart,ExecStartPre,User,Group,WorkingDirectory"],maximum=32768).decode()
    values = dict(row.split("=",1) for row in raw.splitlines() if "=" in row)
    need(values.get("NeedDaemonReload") == "no" and values.get("User") == USER
         and values.get("Group") == USER and values.get("WorkingDirectory") == str(STAGE),
         "V3_EFFECTIVE_UNIT_NOT_LOADED")
    start = values.get("ExecStart","")
    pre = values.get("ExecStartPre","")
    expected="/usr/bin/nsenter --target 1 --mount -- /usr/bin/python3 -I -B "+str(V2_WITNESS_PATH)+" --phase prestart --expected-guard-sha256 "+B_GUARD_SHA
    need(start.count("{ path=")==1 and "argv[]=/usr/bin/node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3031 ;" in start
         and pre.count("{ path=")==1 and ("argv[]="+expected+" ;") in pre,
         "V3_EFFECTIVE_EXECUTION_SCOPE_DRIFT")
    return sha(raw.encode())

def effective_unit_v7(witness):
    # Every v3 execution/finance protection persists. The sole new loaded
    # directive must remove the three verified systemd-injected names.
    parent=effective_unit_v3(witness)
    raw=run(["/usr/bin/systemctl","show",NEW_UNIT,"--no-pager",
             "--property=UnsetEnvironment,DropInPaths,NeedDaemonReload"],
            maximum=16384).decode()
    fields=dict(line.split("=",1) for line in raw.splitlines() if "=" in line)
    need(fields.get("NeedDaemonReload")=="no"
         and fields.get("UnsetEnvironment","").split()==list(V7_ENV_KEYS)
         and str(V7_DROPIN_PATH) in fields.get("DropInPaths","").split()
         and fields.get("DropInPaths","").split().count(str(V7_DROPIN_PATH))==1,
         "V7_EXACT_ENV_FILTER_NOT_LOADED")
    return sha((parent+"\n"+raw).encode())

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

def wait_for_node_exec(witness, pid, deadline):
    """Type=simple reports Active/MainPID before exec/mount setup is finished.

    Do NOT assess the financial mount wall on a pre-exec process. Require the
    exact same systemd PID and kernel start ticks throughout a bounded wait.
    The existing post-exec private /run + PostgreSQL-socket checks still run.
    """
    original_ticks = ticks(pid)
    while True:
        state = witness.systemd(NEW_UNIT)
        need(state.get("ActiveState") == "active"
             and state.get("MainPID") == str(pid), "CANDIDATE_PID_CHANGED_BEFORE_NODE_EXEC")
        need(ticks(pid) == original_ticks, "CANDIDATE_PROCESS_REUSED_BEFORE_NODE_EXEC")
        try:
            exe = os.readlink("/proc/" + str(pid) + "/exe")
        except OSError:
            exe = ""
        if exe == "/usr/bin/node":
            return original_ticks
        need(time.monotonic() < deadline, "CANDIDATE_NODE_EXEC_NOT_READY")
        time.sleep(0.1)

def start(payload):
    _, plan = admit(payload)
    need(payload.get("plan_sha256") == sha(canonical(plan)), "APPROVED_PLAN_CHANGED")
    nonce = payload.get("nonce", "")
    need(re.fullmatch(r"[a-f0-9]{32}", nonce) is not None, "OWNER_START_NONCE_REQUIRED")
    phrase = "RECOVER-START-R25-3031-V7 " + nonce + " " + payload["plan_sha256"]
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
        # V3 isolation and prestart are already installed and pinned.
        # V4 never overwrites prior witnesses, drop-ins, or journals.
        approved_v2_sources(payload)
        approved_v3_dropin(payload)
        approved_v4_witness(payload)
        approved_v7_dropin(payload)
        need(sha(root_file(V3_DROPIN_PATH,32768,0o644))==V3_DROPIN_SHA
             and not V7_DROPIN_PATH.exists() and not V7_DROPIN_PATH.is_symlink(),
             "INSTALLED_V3_WALL_OR_V7_PREIMAGE_CHANGED")
        witness = pinned_module(payload["v4_witness_b64"],V4_WITNESS_SHA,V4_WITNESS_SIZE,
                                "reviewed_b_v4")
        effective_unit_v3(witness)
        # Candidate-only 97-* drop-in removes exactly the 3 systemd-injected
        # env keys. Node's strict allowlist, /run:ro, finance egress and DB RO
        # are NOT changed. No old unit, guard or existing drop-in is modified.
        exclusive_root_source(V7_DROPIN_PATH,approved_v7_dropin(payload))
        run(["/usr/bin/systemctl","daemon-reload"],timeout=35)
        effective_unit_v7(witness)
        genuine = run(["/usr/bin/python3","-I","-B",str(V2_WITNESS_PATH),
           "--phase","prestart","--expected-guard-sha256",B_GUARD_SHA],timeout=40,maximum=20000)
        pre = parse(genuine)
        need(pre.get("status") == "PASS_B_PRESTART_FINANCIAL_CONTROLS_NOT_LIVE_NOT_RELEASE_AUTHORITY"
             and pre.get("new_uid") == UID and pre.get("target_sha") == TARGET,
             "V4_GENUINE_B_PRESTART_REQUIRED")
        seal(JOURNAL/"staged.json",{  "status":"V7_SYSTEMD_ENV_FILTER_AND_PRESTART_STAGED",
            "v2_witness_sha256":V2_WITNESS_SHA,"v2_dropin_sha256":V2_DROPIN_SHA,
            "v3_dropin_sha256":V3_DROPIN_SHA,"v4_witness_sha256":V4_WITNESS_SHA,
            "v7_dropin_sha256":V7_DROPIN_SHA,"prestart_stdout_sha256":sha(genuine),"public_cutover_authorized":False})
        # V4 did not call START. Its exact receipt and current inactive/success
        # state are prerequisites. reset-failed is unnecessary and refused.
        # No other systemd mutation occurs before the single candidate START.
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
        effective_unit_v7(witness)
        # Never test /proc/<pid>/mountinfo before Type=simple has completed
        # child exec; host /run can still be visible during the fork/exec gap.
        wait_for_node_exec(witness, pid, deadline)
        witness.runtime_private_run(pid)
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
        report = {"schema": "aoe2war.r25.c.started-3031.v7", "status": "STARTED_3031_PENDING_B_POSTSTART_C_RUNTIME_ACCEPT",
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
