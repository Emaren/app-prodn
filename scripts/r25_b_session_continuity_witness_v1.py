#!/usr/bin/env python3
"""Narrow session-continuity extension of the immutable installed B witness.

The original witness and journals stay untouched. The new isolated process
receives a symmetric session authentication key, which can also sign sessions;
this is not a verification-only capability. Financial authority stays disabled.
No secret value, key digest, raw environment or session token is reported.
"""
import argparse
import hashlib
import hmac
import json
import os
import pathlib
import re
import socket
import stat
import sys
import types

BASE_WITNESS = pathlib.Path("/etc/aoe2war/r24-parallel-web/approved-runtime-namespace-v2.py")
BASE_WITNESS_SHA256 = "8f6a30172a089aca7de4b5941791c1d1301a40486e872cc8b6efadc386acccda"
BASE_WITNESS_SIZE = 23853
RECOVERED_BASE_SHA256 = "437e87fbd91073d157fc1ca15f58a4e9d5aa4f144b7c8d04ae1549132ac3c522"
RECOVERED_BASE_SIZE = 23869
WITNESS = pathlib.Path("/etc/aoe2war/r24-parallel-web/approved-runtime-session-v2.py")
SESSION_ENV = pathlib.Path("/etc/aoe2war/r24-parallel-web/session-runtime.env")
DB_ENV = pathlib.Path("/etc/aoe2war/r24-parallel-web/readonly-runtime.env")
JOURNAL_ROOT = pathlib.Path("/var/lib/aoe2war-r25-c-additive")
OLD_PID = 2625090
OLD_TICKS = 103836850
SECRET = re.compile(rb"[A-Za-z0-9_./+=:-]{32,4096}\Z")


def hold(reason):
    raise RuntimeError("R25_B_SESSION_HOLD:" + reason)


def require_host():
    if sys.platform != "linux" or os.geteuid() != 0 or socket.gethostname().split(".")[0] != "ubuntu-4gb-hel1-11":
        hold("EXACT_HEL1_ROOT_REQUIRED")


def sealed_bytes(path, mode, maximum=32768):
    if not path.is_absolute():
        hold("ABSOLUTE_ROOT_PATH_REQUIRED")
    for parent in path.parents:
        item = parent.lstat()
        if not stat.S_ISDIR(item.st_mode) or item.st_uid != 0 or item.st_mode & 0o022:
            hold("ROOT_ANCESTOR_NOT_PROTECTED")
    before = path.lstat()
    if (not stat.S_ISREG(before.st_mode) or before.st_uid != 0
        or stat.S_IMODE(before.st_mode) != mode or before.st_nlink != 1
        or not 0 < before.st_size <= maximum):
        hold("ROOT_FILE_MODE_TYPE_OR_SIZE")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd)
        raw = os.read(fd, maximum + 1)
        after = os.fstat(fd)
        identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_uid, s.st_mode, s.st_nlink)
        if identity(before) != identity(opened) or identity(opened) != identity(after) or len(raw) != before.st_size:
            hold("ROOT_FILE_CHANGED_DURING_READ")
        return raw
    finally:
        os.close(fd)


def load_base():
    installed = sealed_bytes(BASE_WITNESS, 0o644)
    if len(installed) != BASE_WITNESS_SIZE or hashlib.sha256(installed).hexdigest() != BASE_WITNESS_SHA256:
        hold("IMMUTABLE_INSTALLED_B_V2_SOURCE_CHANGED")
    # HEL1 still has immutable V2. Materialize the already reviewed V4 two-line
    # NameError repair in memory, and require its exact complete source digest.
    # Neither the installed V2 file nor its historical receipts are rewritten.
    raw = installed.replace(
        b'    need(isinstance(pid,int) and pid>1, "CANDIDATE_PID_REQUIRED_FOR_RUN_WALL")\n',
        b'    if not isinstance(pid,int) or pid<=1:\n        hold("CANDIDATE_PID_REQUIRED_FOR_RUN_WALL")\n', 1).replace(
        b'    need(proc_run.is_dir() and not (proc_run/"postgresql").exists(),\n         "HOST_POSTGRESQL_UNIX_SOCKET_EXPOSED")\n',
        b'    if not proc_run.is_dir() or (proc_run/"postgresql").exists():\n        hold("HOST_POSTGRESQL_UNIX_SOCKET_EXPOSED")\n', 1)
    if len(raw) != RECOVERED_BASE_SIZE or hashlib.sha256(raw).hexdigest() != RECOVERED_BASE_SHA256:
        hold("EXACT_REVIEWED_B_V4_SOURCE_NOT_MATERIALIZED")
    base = types.ModuleType("r25_b_original_pinned_v4")
    base.__file__ = str(BASE_WITNESS)
    exec(compile(raw, str(BASE_WITNESS), "exec"), base.__dict__)
    return base


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            hold("DUPLICATE_SESSION_JOURNAL_FIELD")
        result[key] = value
    return result


def session_journal(path):
    path = pathlib.Path(path)
    if path.parent != JOURNAL_ROOT or not re.fullmatch(r"session-repair-[0-9a-f]{32}", path.name):
        hold("EXACT_SESSION_JOURNAL_REQUIRED")
    record = json.loads(sealed_bytes(path / "staged.json", 0o600), object_pairs_hook=unique,
                        parse_constant=lambda _: hold("NONFINITE_SESSION_JOURNAL_FIELD"))
    if (type(record) is not dict or record.get("schema") != "aoe2war.r25.c.session-continuity.v1"
        or record.get("status") != "SESSION_AUTH_STAGED_NOT_STARTED"
        or record.get("nonce") != path.name.removeprefix("session-repair-")
        or record.get("original_pid") != OLD_PID or record.get("original_start_ticks") != OLD_TICKS
        or record.get("session_env_path") != str(SESSION_ENV)
        or record.get("readonly_db_env_path") != str(DB_ENV)
        or record.get("only_session_secret") is not True
        or record.get("financial_authorized") is not False):
        hold("SESSION_JOURNAL_SCOPE_OR_ORIGINAL_IDENTITY")
    pin = record.get("witness_sha256", "")
    if not re.fullmatch(r"[0-9a-f]{64}", pin) or hashlib.sha256(sealed_bytes(WITNESS, 0o644)).hexdigest() != pin:
        hold("SESSION_WITNESS_SOURCE_NOT_REVIEWED")
    return path, record


def original_effective_secret(base):
    status = base.systemd(base.OLD_UNIT)
    if status.get("ActiveState") != "active" or status.get("MainPID") != str(OLD_PID):
        hold("ORIGINAL_WEB_PROCESS_CHANGED")
    original = base.proc(OLD_PID)
    if original.get("pid") != OLD_PID or original.get("start_ticks") != OLD_TICKS:
        hold("ORIGINAL_WEB_START_IDENTITY_CHANGED")
    # Match frozen lib/session.ts exactly: SESSION_SECRET || NEXTAUTH_SECRET.
    raw = original["env"].get("SESSION_SECRET") or original["env"].get("NEXTAUTH_SECRET")
    if type(raw) is not str or not SECRET.fullmatch(raw.encode("utf8")):
        hold("ORIGINAL_EFFECTIVE_SESSION_SECRET_UNAVAILABLE_OR_UNSUPPORTED")
    return raw.encode("utf8")


def configured_session(base, journal):
    _, record = session_journal(journal)
    raw = sealed_bytes(SESSION_ENV, 0o600, 8192)
    prefix = b"SESSION_SECRET="
    if not raw.startswith(prefix) or not raw.endswith(b"\n") or not SECRET.fullmatch(raw[len(prefix):-1]):
        hold("SESSION_ENV_MUST_HAVE_EXACTLY_ONE_SAFE_UNQUOTED_KEY")
    configured = raw[len(prefix):-1]  # No strip, normalization, quoting or re-encoding.
    original = original_effective_secret(base)
    if not hmac.compare_digest(configured, original):
        hold("SESSION_ENV_DOES_NOT_MATCH_ORIGINAL_EFFECTIVE_SECRET")
    db = str(DB_ENV) + " (ignore_errors=no)"
    session = str(SESSION_ENV) + " (ignore_errors=no)"
    actual = base.run(["/usr/bin/systemctl", "show", base.UNIT, "--value", "--property=EnvironmentFiles"]).decode().splitlines()
    if actual != [db, db, session]:
        hold("EXACT_TWO_DATABASE_AND_ONE_SESSION_ENVFILES_REQUIRED")
    base.root_db_envfile()  # Retains the original strict one-DATABASE_URL format.
    return configured, record


def proof(base, journal, candidate=None):
    configured, _ = configured_session(base, journal)
    if candidate is not None:
        env = candidate["env"]
        # No NEXTAUTH_SECRET, preview identity or additional key is admitted.
        if set(env) - (base.ENV_ALLOW | {"SESSION_SECRET"}):
            hold("CANDIDATE_ENV_OUTSIDE_ORIGINAL_WALL_AND_SESSION_SECRET")
        actual = env.get("SESSION_SECRET")
        if type(actual) is not str or not SECRET.fullmatch(actual.encode("utf8")):
            hold("CANDIDATE_EFFECTIVE_SESSION_SECRET_ABSENT")
        if not hmac.compare_digest(actual.encode("utf8"), configured):
            hold("CANDIDATE_SESSION_SECRET_DOES_NOT_MATCH_ORIGINAL")
        if not hmac.compare_digest(env.get("DATABASE_URL", "").encode("utf8"), base.root_db_envfile().encode("utf8")):
            hold("CANDIDATE_DEDICATED_DB_ENV_CHANGED")
    # A second native read closes the original PID/key race without reporting it.
    if not hmac.compare_digest(configured, original_effective_secret(base)):
        hold("ORIGINAL_SESSION_SECRET_CHANGED_DURING_WITNESS")
    return {
        "schema": "aoe2war.r25.b.session-auth-continuity.v1",
        "session_env_root_0600": True, "only_session_secret": True,
        "original_effective_secret_present": True, "session_file_matches_original": True,
        "candidate_runtime_observed": candidate is not None,
        "candidate_effective_secret_present": candidate is not None,
        "candidate_secret_matches_original": candidate is not None,
        "readonly_db_env_only_one_key": True,
        "candidate_database_matches_original_ro_envfile": candidate is not None,
        "session_key_is_symmetric_signing_capability": True,
        "authenticated_browser_roles_verified": False, "financial_authorized": False,
    }


def prestart(expected_guard_sha, session_auth_journal):
    require_host()
    base = load_base()
    auth = proof(base, session_auth_journal)
    result = base.prestart(expected_guard_sha)
    proof(base, session_auth_journal)
    result["session_auth_continuity"] = auth
    return result


def observe(expected_guard_sha, session_auth_journal):
    require_host()
    base = load_base()
    status = base.systemd(base.UNIT)
    pid = int(status.get("MainPID") or 0)
    if pid <= 1:
        hold("CANDIDATE_PROCESS_REQUIRED")
    candidate = base.proc(pid)
    auth = proof(base, session_auth_journal, candidate)
    base.ENV_ALLOW = base.ENV_ALLOW | {"SESSION_SECRET"}
    result = base.observe(expected_guard_sha)
    if result.get("candidate_pid") != pid or result.get("candidate_start_ticks") != candidate["start_ticks"]:
        hold("CANDIDATE_PROCESS_CHANGED_DURING_WITNESS")
    # Re-read the live process after the complete original B confinement witness.
    after = base.proc(pid)
    if after.get("pid") != pid or after.get("start_ticks") != candidate["start_ticks"]:
        hold("CANDIDATE_PROCESS_CHANGED_DURING_WITNESS")
    proof(base, session_auth_journal, after)
    result["session_auth_continuity"] = auth
    result.pop("report_sha256", None)
    result["report_sha256"] = hashlib.sha256(json.dumps(result, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=("prestart", "poststart"), required=True)
    parser.add_argument("--expected-guard-sha256", required=True)
    parser.add_argument("--session-auth-journal", required=True)
    args = parser.parse_args()
    try:
        result = (prestart(args.expected_guard_sha256, args.session_auth_journal) if args.phase == "prestart"
                  else observe(args.expected_guard_sha256, args.session_auth_journal))
        print(json.dumps(result, sort_keys=True))
    except (RuntimeError, OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"schema": "aoe2war.r25.b.session-auth-continuity.v1", "status": "HOLD",
                          "reason": str(error)[:160], "financial_authorized": False}, sort_keys=True))
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
