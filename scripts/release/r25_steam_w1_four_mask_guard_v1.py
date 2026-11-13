#!/usr/bin/env python3
"""Read-only attestation of W1's exact signed four-unit timer quarantine.

This is a prerequisite for a newly pinned Steam snapshot; it does NOT loosen
the V22/V23 financial topology guard, mutate systemd, or authorize finance.
Only the exact independently accepted 2026-11-13 physical W1 receipt can pass.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess

ROOT = Path("/var/lib/wolo-financial-timer-quarantine")
CONTROL = Path("/etc/systemd/system.control")
RECEIPT_SHA256 = "493578195936de435dd06b2f72d77e59c673e9de62639cb7fedc8fc2c4340022"
W1_CONTROLLER_SHA256 = "9c9ac5a4ae5ac30587c4f30d7e1c0e0b7068cdd7b5145bc7875d8d85fad79f3a"
UNITS = tuple(sorted((
    "aoe2hdbets-bet-stake-reconcile.timer",
    "aoe2hdbets-bet-stake-reconcile.service",
    "aoe2hdbets-staking-rewards.timer",
    "aoe2hdbets-staking-rewards.service",
)))
PROPS = ("Id", "LoadState", "UnitFileState", "FragmentPath", "ActiveState",
         "SubState", "Result", "MainPID", "ControlPID", "Type", "TriggeredBy",
         "NextElapseUSecRealtime", "NextElapseUSecMonotonic")


class Hold(RuntimeError):
    pass


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise Hold("HOLD_W1_QUARANTINE_" + reason)


def distinct_json(pairs):
    data = {}
    for key, value in pairs:
        require(key not in data, "DUPLICATE_JSON_KEY")
        data[key] = value
    return data


def root_metadata(path: Path, *, is_dir: bool, uid: int = 0) -> os.stat_result:
    item = path.lstat()
    require(item.st_uid == uid and not item.st_mode & 0o022, "UNTRUSTED_OWNER_MODE")
    require((stat.S_ISDIR(item.st_mode) if is_dir else
             stat.S_ISREG(item.st_mode) and item.st_nlink == 1),
            "UNTRUSTED_FILE_TYPE")
    return item


def accepted_receipt(root: Path = ROOT, *, uid: int = 0,
                     expected_sha: str = RECEIPT_SHA256) -> dict:
    root_metadata(root, is_dir=True, uid=uid)
    require(stat.S_IMODE(root.lstat().st_mode) == 0o700, "PRIVATE_ROOT_MODE")
    matches = []
    entries = sorted(root.iterdir())
    require(len(entries) <= 256, "UNBOUNDED_JOURNAL")
    for directory in entries:
        if directory.is_symlink() or not directory.is_dir():
            continue
        root_metadata(directory, is_dir=True, uid=uid)
        candidate = directory / "QUARANTINED.json"
        if not candidate.exists() or candidate.is_symlink():
            continue
        meta = root_metadata(candidate, is_dir=False, uid=uid)
        require(stat.S_IMODE(meta.st_mode) == 0o600 and 1 <= meta.st_size <= 65536,
                "RECEIPT_MODE_OR_SIZE")
        fd = os.open(candidate, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        with os.fdopen(fd, "rb") as stream:
            before = os.fstat(stream.fileno())
            raw = stream.read(65537)
            after = os.fstat(stream.fileno())
        require((before.st_ino, before.st_dev, before.st_size, before.st_mtime_ns) ==
                (after.st_ino, after.st_dev, after.st_size, after.st_mtime_ns),
                "RECEIPT_CHANGED_DURING_READ")
        if hashlib.sha256(raw).hexdigest() == expected_sha:
            matches.append(json.loads(raw, object_pairs_hook=distinct_json))
    require(len(matches) == 1, "EXACT_ACCEPTED_RECEIPT_NOT_UNIQUE")
    record = matches[0]
    require(type(record) is dict and record.get("state") == "QUARANTINED"
            and record.get("manual_start_denied") == list(UNITS)
            and set(record.get("masked_runtime_states", {})) == set(UNITS)
            and record.get("original_files_unchanged") is True
            and record.get("financial_writer_fence") is False
            and record.get("funded_operations") == "DENIED",
            "RECEIPT_SCOPE_MISMATCH")
    return record


def _native_show(unit: str) -> dict:
    cp = subprocess.run(["/usr/bin/systemctl", "show", unit, "--no-pager",
                         "--property=" + ",".join(PROPS)],
                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                        timeout=10, check=True, text=True)
    pairs = distinct_json(line.split("=", 1) for line in cp.stdout.splitlines()
                          if "=" in line)
    return pairs


def _native_enabled(unit: str) -> str:
    cp = subprocess.run(["/usr/bin/systemctl", "is-enabled", unit],
                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                        timeout=10, text=True)
    require(cp.returncode in (0, 1), "UNITFILE_QUERY_ERROR")
    return cp.stdout.strip()


def validate_four_masked(receipt: dict, show=_native_show,
                         enabled=_native_enabled, control: Path = CONTROL,
                         mask_uid: int = 0) -> dict:
    require(type(receipt) is dict and receipt.get("state") == "QUARANTINED"
            and receipt.get("manual_start_denied") == list(UNITS)
            and set(receipt.get("masked_runtime_states", {})) == set(UNITS),
            "UNTRUSTED_RECEIPT")
    states = {}
    for name in UNITS:
        p = control / name
        require(p.is_symlink() and os.readlink(p) == "/dev/null"
                and p.lstat().st_uid == mask_uid, "CONTROL_MASK_MISSING")
        state = show(name)
        require(state.get("Id") == name
                and state.get("LoadState") == "masked"
                and state.get("UnitFileState") == "masked"
                and state.get("FragmentPath") == str(p)
                and not state.get("TriggeredBy")
                and enabled(name) == "masked", "SYSTEMD_MASK_IDENTITY")
        if name.endswith(".service"):
            require(state.get("ActiveState") == "inactive"
                    and state.get("SubState") == "dead"
                    and state.get("MainPID") == "0"
                    and state.get("ControlPID") == "0"
                    and state.get("Result") == "success"
                    and not state.get("Type"), "SERVICE_RESUMED_OR_UNSAFE")
        else:
            require(state.get("ActiveState") == "failed"
                    and state.get("SubState") == "failed"
                    and state.get("Result") == "resources"
                    and state.get("NextElapseUSecMonotonic") == "infinity"
                    and state.get("NextElapseUSecRealtime") in ("", "0"),
                    "TIMER_REARMED_OR_CHANGED")
        states[name] = {k: state.get(k, "") for k in PROPS}
    return {"schema": "aoe2war.steam.w1-four-mask.v1", "state": "PASS_PHYSICAL_W1_MASK_ONLY",
            "receipt_sha256": RECEIPT_SHA256, "financial_authorized": False,
            "units": states}


def observe() -> dict:
    """Never invoke systemctl start/restart/unmask; read only."""
    receipt = accepted_receipt()
    return validate_four_masked(receipt)


if __name__ == "__main__":
    import sys
    try:
        result = observe()
        print(json.dumps({"status": result["state"], "financial_authorized": False,
                          "receipt_sha256": RECEIPT_SHA256}, sort_keys=True))
    except Exception:
        print('{"status":"HOLD_W1_QUARANTINE","financial_authorized":false}')
        sys.exit(3)
