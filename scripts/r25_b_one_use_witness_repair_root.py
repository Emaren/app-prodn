#!/usr/bin/env python3
"""R25 B: independent one-use, new-witness-only repair. Never reruns B INSTALL.

Input is JSON {witness_b64: reviewed new witness bytes}, on stdin.
All host admission is repeated immediately before the single atomic replacement.
'plan' and 'prestart' are read-only; 'repair' requires separately typed Mac consent.
No daemon reload, service start, PG grant, nft write, C-stage or Nginx mutation.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import pwd
import socket
import stat
import subprocess
import sys
import types

HOST = "ubuntu-4gb-hel1-11"
OLD = Path("/etc/aoe2war/r24-parallel-web/approved-runtime-prestart.py")
GUARD = Path("/usr/local/lib/aoe2war-r25/r25_b_guard.cjs")
DROPIN = Path("/etc/systemd/system/aoe2hdbets-web-r24.service.d/90-r25-b-isolation.conf")
BASE = Path("/etc/systemd/system/aoe2hdbets-web-r24.service")
SETUP = Path("/var/lib/aoe2war-r25-b-setup")
JOURNAL = SETUP / "witness-repair-v1"
RECEIPT = SETUP / "receipt.json"
STARTED = SETUP / "started.json"
NEW_SHA = "edf1b42ea7cc8001da83d7076d8aa08f924860fd9a40f97431e60ad8528a30dc"
OLD_SHA = "de8981ba8c79c276a1ddd1b6c89efea0eaff8d9f11bd1514a724deacde6fc86a"
GUARD_SHA = "dead2815b3f20b311ede29dfd99086cbb81dfd6a73f1a71f2b7b57ccd74e809d"
DROPIN_SHA = "43ac0aca8fd68ec04851c19ea6cde913cef9c104db1557d5d0b1d8464ac0e9fd"
BASE_SHA = "1d1cb28dae9b775004eb136bb0c3328f8cce7562aa6b872d4227b07a6de0a747"
INSTALL_SHA = "41be908123b5f13e349b3ad093ebea7a7908149c9c646041969556d3e0cc1cd2"
CONSENT = "REPAIR-R25-B-WITNESS-ONLY-87d340314e46"
SOURCE_COMMIT = "87d340314e46032fce68e5cfdcc268b8e6593a82"
UNIT = "aoe2hdbets-web-r24.service"
USER = "aoe2war-r24-web"
EXPECTED_UID = 993
C_BUILD = "-dJl5VyecHu5BKNvfErJe"
C_PATH = Path("/var/lib/aoe2war-r25-web-0cee3c836c4b/.next/BUILD_ID")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def hold(reason):
    raise RuntimeError("HOLD:R25_B_REPAIR:" + reason)


def trusted(path, *, mode=None, max_size=65536):
    """Reject a symlink or non-root/writable ancestor and return bounded bytes."""
    for p in (path, *path.parents):
        try:
            st = p.lstat()
        except OSError:
            hold("MISSING_PROTECTED_PATH")
        if st.st_uid != 0 or st.st_mode & 0o022 or stat.S_ISLNK(st.st_mode):
            hold("UNTRUSTED_ROOT_PATH")
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_size < 1 or st.st_size > max_size:
        hold("INVALID_ROOT_FILE")
    if mode is not None and stat.S_IMODE(st.st_mode) != mode:
        hold("ROOT_FILE_MODE_DRIFT")
    return path.read_bytes()


def json_root(path):
    try:
        return json.loads(trusted(path, mode=0o600))
    except (ValueError, UnicodeError):
        hold("ROOT_JSON_INVALID")


def canonical_sha(record):
    data = dict(record)
    data.pop("report_sha256", None)
    return sha(json.dumps(data, sort_keys=True, separators=(",", ":")).encode())


def original_receipt():
    start = json_root(STARTED)
    rec = json_root(RECEIPT)
    if (start.get("schema") != "aoe2war.r25.b.additive-3031-setup.v1"
        or start.get("status") != "INSTALL_STARTED_NOT_CERTIFIED"
        or start.get("source_commit") != SOURCE_COMMIT
        or start.get("old_web_pid") != 2625090
        or start.get("database_name") != "aoe2hd_db"
        or start.get("no_retry_without_independent_repair") is not True):
        hold("ORIGINAL_STARTED_JOURNAL_DRIFT")
    if (rec.get("schema") != start["schema"]
        or rec.get("status") != "PASS_B_NEW_ONLY_SETUP_NOT_RUNTIME_OR_CUTOVER"
        or rec.get("report_sha256") != INSTALL_SHA
        or canonical_sha(rec) != INSTALL_SHA
        or rec.get("source_commit") != SOURCE_COMMIT
        or rec.get("old_web_mainpid") != 2625090
        or rec.get("uid") != EXPECTED_UID
        or rec.get("unit") != UNIT or rec.get("database_name") != "aoe2hd_db"
        or rec.get("db_role") != "aoe2war_r25_web_ro"
        or rec.get("new_guard_sha256") != GUARD_SHA
        or rec.get("new_witness_sha256") != OLD_SHA
        or rec.get("new_dropin_sha256") != DROPIN_SHA
        or rec.get("new_baseunit_sha256") != BASE_SHA
        or rec.get("candidate_started") is not False
        or rec.get("financial_authorized") is not False
        or rec.get("public_cutover_authorized") is not False
        or rec.get("secret_values_disclosed") is not False):
        hold("ORIGINAL_INSTALL_RECEIPT_DRIFT")
    return sha(trusted(STARTED, mode=0o600)), sha(trusted(RECEIPT, mode=0o600))


def new_witness(data):
    if len(data) != 22062 or sha(data) != NEW_SHA:
        hold("REVIEWED_NEW_WITNESS_SHA_OR_SIZE_MISMATCH")
    try:
        compile(data, "reviewed-r25-b-witness", "exec")
    except (SyntaxError, ValueError):
        hold("NEW_WITNESS_INVALID")
    mod = types.ModuleType("reviewed_r25_b_host_witness")
    exec(compile(data, "reviewed-r25-b-witness", "exec"), mod.__dict__)
    return mod


def port_free():
    for p in (Path("/proc/net/tcp"), Path("/proc/net/tcp6")):
        if not p.is_file():
            hold("LISTENER_CENSUS_UNAVAILABLE")
        for line in p.read_text().splitlines()[1:]:
            cols = line.split()
            if cols[3] == "0A" and int(cols[1].split(":")[1], 16) == 3031:
                hold("3031_LISTENER_PRESENT")


def host_admission(w, *, repaired):
    if sys.platform != "linux" or os.geteuid() != 0 or socket.gethostname().split(".")[0] != HOST:
        hold("WRONG_HEL1_ROOT_HOST")
    a, b = original_receipt()
    if pwd.getpwnam(USER).pw_uid != EXPECTED_UID:
        hold("DEDICATED_UID_DRIFT")
    if sha(trusted(GUARD, max_size=8192)) != GUARD_SHA:
        hold("ORIGINAL_GUARD_DRIFT")
    if sha(trusted(DROPIN, mode=0o644, max_size=8192)) != DROPIN_SHA:
        hold("NEW_UNIT_DROPIN_DRIFT")
    if sha(trusted(BASE, mode=0o644, max_size=8192)) != BASE_SHA:
        hold("NEW_UNIT_C_BASE_DRIFT")
    old = w.systemd("aoe2hdbets-web.service")
    new = w.systemd(UNIT)
    if old.get("ActiveState") != "active" or old.get("MainPID") != "2625090":
        hold("ORIGINAL_3030_MAINPID_CHANGED")
    if not Path("/proc/2625090").is_dir():
        hold("ORIGINAL_3030_PROC_MISSING")
    if (new.get("LoadState") != "loaded" or new.get("ActiveState") != "inactive"
        or new.get("MainPID") != "0" or new.get("User") != USER
        or new.get("WorkingDirectory") != str(w.SOURCE)):
        hold("NEW_3031_NOT_INACTIVE_OR_UNIT_DRIFT")
    w.validate_filesystem_wall(new)
    port_free()
    if not C_PATH.is_file() or C_PATH.is_symlink() or C_PATH.read_text().strip() != C_BUILD:
        hold("C_SEALED_BUILD_DRIFT")
    w.c_archive_source_identity()
    # Read-only kernel verification; do not modify nftables or PostgreSQL.
    w.nft_policy(EXPECTED_UID)
    db = w.db_proof(w.root_db_envfile(), EXPECTED_UID)
    if db["role"] != "aoe2war_r25_web_ro":
        hold("SELECT_ONLY_ROLE_NOT_PROVEN")
    actual = sha(trusted(OLD, mode=0o644, max_size=32768))
    if actual != (NEW_SHA if repaired else OLD_SHA):
        hold("INSTALLED_WITNESS_UNEXPECTED")
    return a, b


def write_new(path, data, mode):
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb", closefd=False) as f:
            f.write(data)
            f.flush()
            os.fsync(fd)
    finally:
        os.close(fd)


def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def seal(path, payload):
    data = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode() + b"\n"
    write_new(path, data, 0o600)


def repair(w, data):
    # All admission must complete BEFORE journal creation or any host write.
    roots = host_admission(w, repaired=False)
    if JOURNAL.exists() or JOURNAL.is_symlink():
        hold("REPAIR_ALREADY_STARTED_NO_REPLAY")
    old_stat = OLD.lstat()
    old_data = trusted(OLD, mode=0o644, max_size=32768)
    if sha(old_data) != OLD_SHA:
        hold("OLD_WITNESS_CHANGED")
    # Atomic one-use directory creation is the first persistent mutation.
    os.mkdir(JOURNAL, mode=0o700)
    os.chmod(JOURNAL, 0o700)
    fsync_directory(SETUP)  # durable journal directory entry before any replacement
    seal(JOURNAL / "started.json", {
        "schema": "aoe2war.r25.b.witness-repair.v1",
        "status": "STARTED_DO_NOT_RETRY", "old_sha256": OLD_SHA,
        "new_sha256": NEW_SHA, "original_install_report_sha256": INSTALL_SHA,
        "original_started_file_sha256": roots[0],
        "original_receipt_file_sha256": roots[1],
    })
    write_new(JOURNAL / "old-witness.py", old_data, 0o600)
    if sha(trusted(JOURNAL / "old-witness.py", mode=0o600)) != OLD_SHA:
        hold("OLD_WITNESS_BACKUP_MISMATCH")
    fsync_directory(JOURNAL)  # preserve BOTH started marker and old bytes before rename
    staging = OLD.parent / ".r25-b-witness-repair-v1.stage"
    write_new(staging, data, 0o644)
    if sha(trusted(staging, mode=0o644)) != NEW_SHA:
        hold("NEW_WITNESS_STAGED_MISMATCH")
    fsync_directory(OLD.parent)  # stage is durable before atomic replace
    now = OLD.lstat()
    if (now.st_ino != old_stat.st_ino or now.st_dev != old_stat.st_dev
        or now.st_size != old_stat.st_size or now.st_mtime_ns != old_stat.st_mtime_ns
        or sha(trusted(OLD, mode=0o644)) != OLD_SHA):
        hold("OLD_WITNESS_RACED")
    # ONLY replacement target: the already installed NEW service witness.
    os.replace(staging, OLD)
    fsync_directory(OLD.parent)
    if sha(trusted(OLD, mode=0o644)) != NEW_SHA:
        hold("ATOMIC_WITNESS_READBACK_MISMATCH")
    # Preserve the original root installation records byte-for-byte.
    if (sha(trusted(STARTED, mode=0o600)), sha(trusted(RECEIPT, mode=0o600))) != roots:
        hold("ORIGINAL_INSTALL_RECORDS_CHANGED")
    report = {
        "schema": "aoe2war.r25.b.witness-repair.v1",
        "status": "WITNESS_ONLY_REPAIR_COMPLETE_NOT_PRESTART_AUTHORITY",
        "original_install_report_sha256": INSTALL_SHA,
        "original_started_file_sha256": roots[0],
        "original_receipt_file_sha256": roots[1],
        "historical_witness_sha256": OLD_SHA,
        "installed_witness_sha256": NEW_SHA,
        "guard_sha256": GUARD_SHA,
        "dropin_sha256": DROPIN_SHA,
        "old_web_mainpid": 2625090, "new_uid": EXPECTED_UID,
        "new_service_started": False, "public_cutover_authorized": False,
        "no_installer_rerun": True, "old_witness_private_backup": str(JOURNAL / "old-witness.py"),
    }
    report["report_sha256"] = canonical_sha(report)
    seal(JOURNAL / "receipt.json", report)
    fsync_directory(JOURNAL)
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", required=True, choices=("plan", "repair", "prestart"))
    ap.add_argument("--consent", default="")
    args = ap.parse_args()
    try:
        if args.phase == "repair" and args.consent != CONSENT:
            hold("FRESH_OWNER_REPAIR_CONSENT_REQUIRED")
        if args.phase == "prestart":
            data = trusted(OLD, mode=0o644)
            w = new_witness(data)
            roots = host_admission(w, repaired=True)
            rec = json_root(JOURNAL / "receipt.json")
            if (rec.get("status") != "WITNESS_ONLY_REPAIR_COMPLETE_NOT_PRESTART_AUTHORITY"
                or rec.get("report_sha256") != canonical_sha(rec)
                or rec.get("installed_witness_sha256") != NEW_SHA
                or rec.get("original_install_report_sha256") != INSTALL_SHA
                or (rec.get("original_started_file_sha256"), rec.get("original_receipt_file_sha256")) != roots
                or sha(trusted(JOURNAL / "old-witness.py", mode=0o600)) != OLD_SHA):
                hold("REPAIR_RECEIPT_NOT_SEALED")
            actual = subprocess.run(
                ["/usr/bin/python3", "-I", "-B", str(OLD),
                 "--phase", "prestart", "--expected-guard-sha256", GUARD_SHA],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                timeout=25, check=False,
            )
            if actual.returncode or len(actual.stdout) > 16000:
                hold("NATIVE_PRESTART_EXECUTION_HOLD")
            result = json.loads(actual.stdout)
            if (result.get("status") != "PASS_B_PRESTART_FINANCIAL_CONTROLS_NOT_LIVE_NOT_RELEASE_AUTHORITY"
                or result.get("old_web_pid") != 2625090
                or result.get("new_uid") != EXPECTED_UID
                or result.get("guard_sha256") != GUARD_SHA
                or result.get("release_authorized") is not False):
                hold("NATIVE_PRESTART_NOT_POSITIVE")
            print(json.dumps({"status": "PASS_B_REPAIRED_WITNESS_NATIVE_PRESTART_READ_ONLY",
                              "native": result, "public_cutover_authorized": False}, sort_keys=True))
        else:
            incoming = json.load(sys.stdin)
            data = base64.b64decode(incoming["witness_b64"], validate=True)
            w = new_witness(data)
            if args.phase == "plan":
                host_admission(w, repaired=False)
                if JOURNAL.exists() or JOURNAL.is_symlink():
                    hold("REPAIR_JOURNAL_ALREADY_EXISTS")
                print(json.dumps({"status": "PASS_B_WITNESS_REPAIR_PLAN_READ_ONLY",
                                  "new_sha256": NEW_SHA, "old_sha256": OLD_SHA,
                                  "public_cutover_authorized": False}, sort_keys=True))
            else:
                print(json.dumps(repair(w, data), sort_keys=True))
        return 0
    except (RuntimeError, OSError, ValueError, KeyError, TypeError,
            json.JSONDecodeError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc).splitlines()[0][:160],
                          "one_use_no_replay": True, "public_cutover_authorized": False}, sort_keys=True))
        return 2


if __name__ == "__main__":
    sys.exit(main())
