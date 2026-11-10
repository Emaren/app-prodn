"""Foundry F10: allowlisted, short-lived, read-only host probes.

Source-only, manual library calls. No daemon, timer, network, model or
free-form command execution. Fixed systemctl show argv is the ONLY process
invocation; no user-supplied command, path or environment interpolation.
Local filesystem metrics and unit status are NOT externally attested.
Every envelope produces a permanent F8 source-UNKNOWN/F1 HOLD receipt.
"""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import os
import re
import subprocess
import sys

from foundry import Rejected
from nightforge import SYSTEMD, _utc
from nightforge_collectors import (
    SCHEMA, LOCAL_MODE, canonical, review_snapshot,
)

# No arbitrary units. In particular: no financial or reviewer services.
HOST_SYSTEMD = frozenset((
    "kingdom-traders-paper.service", "r25-website.service",
    "nginx.service", "traffic-collector.timer",
    "watcher-watchdog.timer", "storage-os.timer",
))
# Explicit local host platform contracts, not user-selectable filesystem
# paths. HEL1 volume cannot be probed until its independent mount is pinned.
VOLUMES = {
    "M1_MAC_LOCAL": ("mac", "/System/Volumes/Data"),
    "HEL1_ROOT_LOCAL": ("hel1-root", "/"),
}
HOST_IDENTITIES = frozenset(("M1_MAC_LOCAL", "HEL1_ROOT_LOCAL"))
UNIT_STATES = frozenset(("active", "inactive", "failed", "unknown"))
UNIT_LOAD = frozenset(("loaded", "not-found", "masked", "error"))
UNTRUSTED_SHA = "unknown"
MAX_PROBE_OUTPUT_BYTES = 2048
MAX_FREE_MIB = 1_000_000_000
MAX_HELPER_TIME = 2
HASH_SHA256 = re.compile(r"[0-9a-f]{64}\Z")
MACHINE_ID = re.compile(r"[0-9a-f]{32}\Z")


def _read_linux_machine_id() -> bytes:
    """One pinned, bounded Linux identifier; no arbitrary file opening."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    try:
        handle = os.open("/etc/machine-id", flags)
        try:
            raw = os.read(handle, 129)
        finally:
            os.close(handle)
    except OSError:
        raise Rejected("HOLD_HOST_MACHINE_ID_UNAVAILABLE") from None
    return raw


def _reported_clock(observed_utc: str) -> str:
    # An owner-supplied clock/host clock is NOT authenticated or signed.
    _utc(observed_utc)
    return observed_utc


def _sealed_local(kind: str, *, data: dict, lane: str,
                  observed_utc: str) -> bytes:
    # Only fixed host-specific schema and data are emitted; source SHA
    # stays "unknown" even if a Git checkout happens to be current.
    if lane not in ("PRODUCT_B", "PRODUCT_C"):
        raise Rejected("HOLD_HOST_PROBE_LANE")
    record = {
        "schema": SCHEMA,
        "kind": kind,
        "lane": lane,
        "observed_utc": _reported_clock(observed_utc),
        "data": data,
        "mode": LOCAL_MODE,
        "claimed_source_sha": UNTRUSTED_SHA,
    }
    out = canonical({**record,
        "snapshot_sha256": sha256(canonical(record)).hexdigest()})
    if len(out) > 4096:
        raise Rejected("HOLD_HOST_PROBE_ENVELOPE_OVERSIZE")
    return out


def _decode_systemctl(output: bytes, *, unit: str) -> str:
    if (type(output) is not bytes or not 0 < len(output) <= MAX_PROBE_OUTPUT_BYTES):
        raise Rejected("HOLD_HOST_SYSTEMD_OUTPUT_BOUNDS")
    try:
        text = output.decode("ascii")
    except UnicodeError:
        raise Rejected("HOLD_HOST_SYSTEMD_NONASCII") from None
    properties = {}
    for line in text.splitlines():
        if (not line or len(line) > 160 or line.count("=") != 1):
            raise Rejected("HOLD_HOST_SYSTEMD_MALFORMED")
        key, value = line.split("=", 1)
        if (key not in ("Id", "ActiveState", "LoadState") or
            key in properties or len(value) > 100):
            raise Rejected("HOLD_HOST_SYSTEMD_EXTRA_OR_DUPLICATE")
        properties[key] = value
    if (set(properties) != {"Id", "ActiveState", "LoadState"} or
        properties["Id"] != unit or
        properties["ActiveState"] not in UNIT_STATES or
        properties["LoadState"] not in UNIT_LOAD):
        raise Rejected("HOLD_HOST_SYSTEMD_ID_OR_STATE")
    # "not-found" or "masked" is never healthy, even if ActiveState
    # disagrees. Refuse inconsistent source claims instead of normalizing
    # them to "active".
    if (properties["LoadState"] != "loaded" and
        properties["ActiveState"] == "active"):
        raise Rejected("HOLD_HOST_SYSTEMD_INCONSISTENT")
    return properties["ActiveState"]


def probe_systemd_local(unit: str, *, lane: str, observed_utc: str,
                        runner=subprocess.run) -> bytes:
    """Only fixed read-only systemctl show of a literal allowlisted unit.

    Test runners inject a stub; no real systemctl is invoked in CI or
    by module import. Host-installed code MUST be admitted independently.
    """
    if type(unit) is not str or unit not in HOST_SYSTEMD:
        raise Rejected("HOLD_HOST_SYSTEMD_UNAUTHORIZED_UNIT")
    if runner is subprocess.run and sys.platform != "linux":
        raise Rejected("HOLD_HOST_SYSTEMD_NOT_LINUX")
    if type(lane) is not str or lane not in ("PRODUCT_B", "PRODUCT_C"):
        raise Rejected("HOLD_HOST_PROBE_LANE")
    _reported_clock(observed_utc)
    args = (
        "/usr/bin/systemctl", "--no-pager", "--no-legend",
        "show", "--property=Id,ActiveState,LoadState",
        "--", unit,
    )
    try:
        reply = runner(
            list(args), shell=False, capture_output=True, check=False,
            timeout=MAX_HELPER_TIME,
            env={
                "PATH": "/usr/bin:/bin",
                "LC_ALL": "C",
                "GIT_TERMINAL_PROMPT": "0",
            },
        )
    except (OSError, subprocess.TimeoutExpired):
        raise Rejected("HOLD_HOST_SYSTEMD_QUERY_UNAVAILABLE") from None
    if (type(reply.returncode) is not int or reply.returncode != 0 or
        type(reply.stdout) is not bytes or
        len(reply.stdout) > MAX_PROBE_OUTPUT_BYTES or
        type(reply.stderr) is not bytes or bool(reply.stderr)):
        raise Rejected("HOLD_HOST_SYSTEMD_RESPONSE_INVALID")
    state = _decode_systemctl(reply.stdout, unit=unit)
    # Timer freshness requires a separately authenticated timestamp;
    # ActiveState=active alone cannot certify that a timer ran.
    return _sealed_local("systemd",
        data={"unit": unit, "active":state, "timer_age_sec":None},
        lane=lane,observed_utc=observed_utc)


def probe_local_storage(platform: str, *, lane: str,
                        observed_utc: str, statvfs=os.statvfs,
                        approved_linux_machine_id_sha256: str | None = None,
                        machine_id_reader=_read_linux_machine_id) -> bytes:
    """Read free bytes from one fixed, platform-scoped local mount.

    A filesystem stat does not prove backup success, off-host replication,
    no hidden financial writes, or storage identity on HEL1.
    """
    if type(platform) is not str or platform not in VOLUMES:
        raise Rejected("HOLD_HOST_STORAGE_PLATFORM_NOT_ADMITTED")
    if type(lane) is not str or lane not in ("PRODUCT_B", "PRODUCT_C"):
        raise Rejected("HOLD_HOST_PROBE_LANE")
    _reported_clock(observed_utc)
    if ((platform == "M1_MAC_LOCAL" and sys.platform != "darwin") or
        (platform == "HEL1_ROOT_LOCAL" and sys.platform != "linux")):
        raise Rejected("HOLD_HOST_STORAGE_PLATFORM_MISMATCH")
    if platform == "HEL1_ROOT_LOCAL":
        # Explicit out-of-band host pin required before ANY Linux-root
        # status. An arbitrary GitHub CI runner must not be mislabelled
        # as HEL1 just because it has a root mount.
        if (type(approved_linux_machine_id_sha256) is not str or
            not HASH_SHA256.fullmatch(approved_linux_machine_id_sha256)):
            raise Rejected("HOLD_HOST_LINUX_PIN_REQUIRED")
        try:
            machine_id = machine_id_reader()
        except OSError:
            raise Rejected("HOLD_HOST_MACHINE_ID_UNAVAILABLE") from None
        if type(machine_id) is not bytes or len(machine_id)>128:
            raise Rejected("HOLD_HOST_MACHINE_ID_UNTRUSTED")
        try:
            identity=machine_id.strip().decode("ascii")
        except UnicodeError:
            raise Rejected("HOLD_HOST_MACHINE_ID_UNTRUSTED") from None
        if not MACHINE_ID.fullmatch(identity):
            raise Rejected("HOLD_HOST_MACHINE_ID_UNTRUSTED")
        if sha256(machine_id.strip()).hexdigest() != approved_linux_machine_id_sha256:
            raise Rejected("HOLD_HOST_LINUX_IDENTITY_MISMATCH")
    elif approved_linux_machine_id_sha256 is not None:
        raise Rejected("HOLD_HOST_WRONG_PLATFORM_IDENTITY_PIN")
    plane, path = VOLUMES[platform]
    target = Path(path)
    try:
        if (not target.is_dir() or target.is_symlink() or
            str(target.resolve(strict=True)) != path):
            raise Rejected("HOLD_HOST_STORAGE_PINNED_MOUNT_MISMATCH")
        stats = statvfs(path)
        block = stats.f_frsize
        available = stats.f_bavail
    except Rejected:
        raise
    except (OSError, ValueError, AttributeError):
        raise Rejected("HOLD_HOST_STORAGE_UNAVAILABLE") from None
    if (type(block) is not int or type(available) is not int or
        block <= 0 or block > 1_000_000_000 or
        available < 0 or available > 10**15):
        raise Rejected("HOLD_HOST_STORAGE_STAT_INVALID")
    free_mib = (block * available) // 1_048_576
    if free_mib > MAX_FREE_MIB:
        raise Rejected("HOLD_HOST_STORAGE_CAPACITY_IMPLAUSIBLE")
    return _sealed_local("storage",
        data={"plane":plane, "available_mib":free_mib,
              "visual_signed":False},
        lane=lane,observed_utc=observed_utc)


def evaluate_untrusted_local_probe(raw: bytes, *, owner_now_utc: str):
    """Immediate F8 normalization; ALWAYS a proposed HOLD observation."""
    result = review_snapshot(raw,owner_now_utc=owner_now_utc)
    if (result["sourceAttribution"] != "UNATTESTED_LOCAL_READONLY_PROBE" or
        result["sourceGitSHA"] != UNTRUSTED_SHA or
        result["dispatchAllowed"] is not False or
        result["executionEnabled"] is not False or
        result["financeAllowed"] is not False):
        raise Rejected("HOLD_HOST_SOURCE_ADMISSION_BREACH")
    return result
