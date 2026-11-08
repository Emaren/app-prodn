#!/usr/bin/env python3
"""Exact original C03 observer identity proof for protected Steam snapshot v9.

The active C03 V1 observer is a completed timer-driven oneshot (expected exit 3).
Only its run timestamp and systemd ExecStart completion metadata may vary.
Every loaded command/source/ACL/port/process remains inside the original guard.
This module never modifies systemd, nftables, Postgres or protected services.
"""
from __future__ import annotations
import hashlib
import re
from pathlib import Path

UNIT = "wolo-c03-observer.service"
TIMER = "wolo-c03-observer.timer"
SOURCE = Path("/usr/local/libexec/wolo-c03-observer/settlement_c03_observer_watchdog.py")
UNIT_FILE = Path("/etc/systemd/system/wolo-c03-observer.service")
TIMER_FILE = Path("/etc/systemd/system/wolo-c03-observer.timer")
ORIGINAL_UNIT_SHA256 = "e3f0effe2d7781b98f0584f3458c2fe269d4c17c94f9400587c9dc90bc2b3849"
ORIGINAL_TIMER_SHA256 = "5c2c9043338d1d31bfb9bd5d1da540b19ecb3c1a03d23aa33b01dc1b9524cd6e"
ORIGINAL_SOURCE_SHA256 = "f2df45b3efe7868c130d864e348a3c50da8fcf21d06d67dd478f88994398b707"
LOADED_UNIT_CAT_SHA256 = "69673676c27f2d0f5924653916636307b15b8303596883f8f2ba8c5e60382749"
LOADED_TIMER_CAT_SHA256 = "568a19b49ed75120afd662c1e017dddbe284a1619f8c29e9d4ba7e088e26bb34"
LOADED_EXEC_COMMAND_SHA256 = "15b8b9d7c9a1a6d04ae420750b6f74339149ca9b5025090a26b06b87438c90ed"
PROPERTIES = ("Id","Type","TriggeredBy","NeedDaemonReload","Result",
              "ActiveState","MainPID","ExecMainStatus","User",
              "WorkingDirectory","ExecStart","FragmentPath","DropInPaths")

class C03IdentityHold(RuntimeError):
    pass

def require(ok: bool, code: str):
    if not ok:
        raise C03IdentityHold(code)

def sha(raw: bytes):
    return hashlib.sha256(raw).hexdigest()

def parsed_properties(raw: bytes):
    lines = raw.decode("utf8").splitlines()
    props = {}
    for line in lines:
        k, sep, v = line.partition("=")
        require(bool(sep) and k not in props, "C03_SYSTEMD_PROPERTIES_UNRECOGNIZED")
        props[k] = v
    return props

def attest(m):
    """Use only the original audited root-file and native command reader."""
    require(sha(m.root_file(UNIT_FILE, 65536, 0o644)) == ORIGINAL_UNIT_SHA256,
            "C03_ORIGINAL_UNIT_SOURCE_DRIFT")
    require(sha(m.root_file(TIMER_FILE, 65536, 0o644)) == ORIGINAL_TIMER_SHA256,
            "C03_ORIGINAL_TIMER_SOURCE_DRIFT")
    require(sha(m.root_file(SOURCE, 196608, 0o600)) == ORIGINAL_SOURCE_SHA256,
            "C03_ORIGINAL_OBSERVER_SOURCE_DRIFT")
    cat_unit = m.run(["/usr/bin/systemctl","cat",UNIT,"--no-pager"],maximum=131072)
    cat_timer = m.run(["/usr/bin/systemctl","cat",TIMER,"--no-pager"],maximum=131072)
    require(sha(cat_unit) == LOADED_UNIT_CAT_SHA256 and
            sha(cat_timer) == LOADED_TIMER_CAT_SHA256,
            "C03_LOADED_UNIT_OR_TIMER_CONFIG_DRIFT")
    service = parsed_properties(m.run(
        ["/usr/bin/systemctl","show",UNIT,"--no-pager",
         "--property=" + ",".join(PROPERTIES)],maximum=65536))
    require(all(k in service for k in PROPERTIES), "C03_SERVICE_PROPERTIES_MISSING")
    require(service["Id"] == UNIT and service["Type"] == "oneshot" and
            service["TriggeredBy"] == TIMER and
            service["NeedDaemonReload"] == "no" and
            service["FragmentPath"] == str(UNIT_FILE) and
            service["DropInPaths"] == "" and
            service["User"] == "" and
            service["WorkingDirectory"] == "",
            "C03_OBSERVER_EXECUTION_IDENTITY_DRIFT")
    command = service["ExecStart"]
    stable = re.match(
        r"\{\s*path=[^;]+;\s*argv\[\]=.*;\s*ignore_errors=(?:yes|no)\s*;\s*(?=start_time=)",
        command,re.S)
    require(stable is not None and command.count("{ path=") == 1 and
            sha(stable.group(0).encode()) == LOADED_EXEC_COMMAND_SHA256,
            "C03_LOADED_EXEC_COMMAND_DRIFT")
    timer = parsed_properties(m.run(
        ["/usr/bin/systemctl","show",TIMER,"--no-pager",
         "--property=Id,Unit,NeedDaemonReload,ActiveState,FragmentPath,DropInPaths"],
        maximum=65536))
    require(timer == {"Id":TIMER,"Unit":UNIT,"NeedDaemonReload":"no",
                      "ActiveState":"active","FragmentPath":str(TIMER_FILE),
                      "DropInPaths":""}, "C03_TIMER_IDENTITY_OR_ACTIVATION_DRIFT")
    # A genuinely executing observer can be retried once it completes.
    # It cannot become normalized while executing, even with exact source.
    active=service["ActiveState"]
    if active in ("activating","deactivating","active"):
        raise C03IdentityHold("C03_OBSERVER_TEMPORARILY_ACTIVE")
    require(active == "inactive" and service["MainPID"] == "0" and
            service["Result"] == "success" and
            service["ExecMainStatus"] == "3",
            "C03_COMPLETED_ONESHOT_RESULT_DRIFT")
    return True

def guarded_snapshot(m, snapshot_factory=None):
    """Extend exactly one pre-existing reviewed oneshot normalization in memory."""
    existing = m.MONITOR_ONESHOT_TIMERS.get(UNIT)
    require(existing is None or existing == TIMER,
            "C03_MONITOR_PAIR_ALREADY_ALTERED")
    attest(m)
    if existing is None:
        m.MONITOR_ONESHOT_TIMERS[UNIT] = TIMER
    try:
        snapshot = (snapshot_factory or m.production_protected)()
        # TOCTOU: repeat identity/source/config and status checks after read.
        attest(m)
        return snapshot
    finally:
        if existing is None:
            del m.MONITOR_ONESHOT_TIMERS[UNIT]
