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


# The immutable original systemd controller accepts no masked finance oneshot.
# Extend its read-only snapshot only for W1's four source-pinned masks. All
# other services still use the original controller byte-for-byte.
ORIGINAL_UNIT_PROPERTIES = (
    "Id", "Type", "TriggeredBy", "NeedDaemonReload", "Result",
    "ActiveState", "MainPID", "ExecMainStartTimestampMonotonic",
    "User", "WorkingDirectory", "ExecStart", "FragmentPath", "DropInPaths",
)


MASKED_SERVICE_FIELDS = frozenset((
    "Id", "Type", "TriggeredBy", "NeedDaemonReload", "Result",
    "ActiveState", "MainPID", "ExecMainStartTimestampMonotonic",
    "User", "WorkingDirectory", "FragmentPath", "DropInPaths",
))
MASKED_TIMER_FIELDS = frozenset((
    "Id", "TriggeredBy", "NeedDaemonReload", "Result",
    "ActiveState", "FragmentPath", "DropInPaths",
))


def _masked_snapshot_row(m, unit: str, trusted: dict) -> dict:
    """Return an original-shaped row from ACTUAL systemd data, not invented old DDL."""
    raw = m.run(["/usr/bin/systemctl", "show", unit, "--no-pager",
                 "--property=" + ",".join(ORIGINAL_UNIT_PROPERTIES)],
                maximum=65536)
    pairs = distinct_json(line.split("=", 1)
                          for line in raw.decode("utf-8").splitlines()
                          if "=" in line)
    expected = MASKED_SERVICE_FIELDS if unit.endswith(".service") else MASKED_TIMER_FIELDS
    require(set(pairs) == expected, "ORIGINAL_MASKED_SNAPSHOT_FIELDS")
    require(pairs["Id"] == unit
            and pairs["FragmentPath"] == trusted["FragmentPath"]
            and pairs["ActiveState"] == trusted["ActiveState"]
            and pairs["Result"] == trusted["Result"]
            and pairs.get("Type", "") == ""
            and pairs["TriggeredBy"] == ""
            and pairs.get("MainPID", "0") == "0"
            and "ExecStart" not in pairs,
            "MASKED_EFFECTIVE_UNIT_DRIFT")
    # systemctl does not emit ExecStart on ANY accepted masked source.
    # Preserve that absence in the original-shaped canonical unit row.
    cat = m.run(["/usr/bin/systemctl", "cat", unit, "--no-pager"],
                maximum=131072)
    require(b"masked" in cat.lower() and len(cat) <= 131072,
            "MASKED_EFFECTIVE_CONFIG_NOT_VERIFIED")
    return {"properties": pairs, "start_ticks": None,
            "unit_config_sha256": m.sha(cat)}


def attach_to_original_protected_chain(m, *, attestor=None) -> None:
    """Wrap, never remove, V22->C03->C04's original FULL-system snapshot.

    Source-only until independently signed W1 post-C01 and pre-C01 digests
    are admitted by V23. Neither a newly observed hash nor this helper itself
    may grant production activation. No systemctl mutation in this module.
    """
    require(callable(m.unit_state) and callable(m.production_protected),
            "ORIGINAL_FULL_CHAIN_MISSING")
    require(not getattr(m, "_w1_quarantine_attached", False),
            "DUPLICATE_W1_ATTACHMENT")
    inspect = attestor or observe
    original_unit = m.unit_state
    original_protected = m.production_protected

    def full_protected():
        before = inspect()
        require(before.get("state") == "PASS_PHYSICAL_W1_MASK_ONLY"
                and before.get("receipt_sha256") == RECEIPT_SHA256
                and before.get("financial_authorized") is False
                and set(before.get("units", {})) == set(UNITS),
                "W1_ATTESTATION_NOT_ACCEPTED")
        masked = {}
        def routed_unit_state(name):
            if name not in UNITS:
                return original_unit(name)
            row = _masked_snapshot_row(m, name, before["units"][name])
            masked[name] = row
            return row
        m.unit_state = routed_unit_state
        try:
            snap = original_protected()
        finally:
            m.unit_state = original_unit
        require(type(snap) is dict and type(snap.get("units")) is dict,
                "ORIGINAL_SNAPSHOT_NOT_PRESENT")
        require(set(masked) == set(UNITS)
                and all(snap["units"].get(k) == masked[k] for k in UNITS),
                "FOUR_MASKS_NOT_IN_FULL_SNAPSHOT")
        after = inspect()
        require(before == after, "W1_MASK_TOCTOU_DRIFT")
        return snap

    m.production_protected = full_protected
    m._w1_quarantine_attached = True


def inspect_only_full_fingerprint(m) -> dict:
    """Read-only candidate fingerprint. NEVER an independent approval."""
    require(getattr(m, "_w1_quarantine_attached", False),
            "UNATTESTED_FINGERPRINT_PROPOSAL")
    snapshot = m.production_protected()
    return {"status": "CANDIDATE_POST_W1_FINGERPRINT_REVIEW_REQUIRED",
            "snapshot_sha256": m.sha(m.canonical(snapshot)),
            "unit_count": len(snapshot["units"]),
            "financial_authorized": False, "root_stage_authorized": False}


def candidate_full_pair_for_independent_review() -> dict:
    """Read-only HEL1-root source fingerprint proposal, NEVER an admission.

    Imports the existing byte-pinned V22/C03/C04/C01 chain and applies only
    W1's receipt-attested four-unit read adapter. No financial service start,
    daemon reload, SQL, nft write, or change to the production Steam helper.
    """
    import copy
    import importlib.util
    import sys

    require(sys.platform == "linux" and os.geteuid() == 0
            and os.uname().nodename == "ubuntu-4gb-hel1-11",
            "EXACT_READONLY_HEL1_ROOT_AUDITOR")
    v22_path = Path("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_two_web_builds_v22.py")
    v22_sha = "c6e633538fc17dad6fe887452516cb2ba1095855a0aab6f4bdda47f5985f6edc"
    root_metadata(v22_path, is_dir=False)
    require(hashlib.sha256(v22_path.read_bytes()).hexdigest() == v22_sha,
            "IMMUTABLE_V22_SOURCE_CHANGED")
    spec = importlib.util.spec_from_file_location("w1_readonly_v22", v22_path)
    require(spec is not None and spec.loader is not None, "ORIGINAL_V22_NOT_LOADABLE")
    v22 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(v22)
    require(v22.FIN_SNAPSHOT ==
            "3a24b53d356d6ac406999fbabed66c5144d74e538503840d407feb4d5f365f15",
            "OLD_FULL_FINANCE_PIN_CHANGED")
    original = v22.load_original()
    m = original.load_immutable_original()
    attach_to_original_protected_chain(m)
    current = m.production_protected()
    proposal_post = m.sha(m.canonical(current))
    delta = v22.load_c01_exact_delta_helper()
    require(set(delta.SERVICE_PROFILES) ==
            {"wolo-satchel-c01.service", "wolo-reviewer-c01.service"}
            and delta.POST_C01_SHA == v22.OLD_C01_POST_SHA256
            and delta.PRE_C01_SHA == v22.OLD_C01_PRE_SHA256,
            "IMMUTABLE_C01_DELTA_IDENTITY")
    prior = copy.deepcopy(current)
    for name, policy in delta.SERVICE_PROFILES.items():
        require(name in prior["units"]
                and set(("old_exec_sha", "old_config_sha")).issubset(policy),
                "C01_PREIMAGE_FIELDS_MISSING")
        row = prior["units"][name]
        require(type(row) is dict and type(row.get("properties")) is dict,
                "C01_PREIMAGE_ROW_MISSING")
        row["properties"]["ExecStart_sha256"] = policy["old_exec_sha"]
        row["properties"]["DropInPaths"] = ""
        row["unit_config_sha256"] = policy["old_config_sha"]
    proposal_pre = m.sha(m.canonical(prior))
    # Run EVERY original C01 source, executable and inverse preimage check,
    # substituting only a PROPOSED digest; the auditor grants no authority.
    delta.POST_C01_SHA = proposal_post
    delta.PRE_C01_SHA = proposal_pre
    proof = delta.reconstruct_pre_c01(m, current)
    require(proof.get("status") == "PASS_EXACT_TWO_C01_INERT_UNIT_DELTAS_ONLY"
            and proof.get("finance_authorized") is False,
            "ORIGINAL_C01_PREIMAGE_NOT_VERIFIED")
    require(m.sha(m.canonical(m.production_protected())) == proposal_post,
            "POST_W1_FULL_SYSTEM_SNAPSHOT_CHANGED")
    require(m.production_nft_shape() == v22.NFT_SHAPE,
            "ORIGINAL_NFT_SCOPE_DRIFT")
    return {
        "status": "CANDIDATE_POST_W1_FINGERPRINT_INDEPENDENT_REVIEW_REQUIRED",
        "post_c01_sha256": proposal_post,
        "pre_c01_sha256": proposal_pre,
        "protected_unit_count": len(current["units"]),
        "w1_receipt_sha256": RECEIPT_SHA256,
        "original_v22_sha256": v22_sha,
        "financial_authorized": False,
        "root_stage_authorized": False,
        "public_activation_authorized": False,
    }


def observe() -> dict:
    """Never invoke systemctl start/restart/unmask; read only."""
    receipt = accepted_receipt()
    return validate_four_masked(receipt)


if __name__ == "__main__":
    import sys
    try:
        if sys.argv[1:] == ["--read-only-fingerprint"]:
            result = candidate_full_pair_for_independent_review()
            print(json.dumps(result, sort_keys=True), flush=True)
        elif sys.argv[1:] == []:
            result = observe()
            print(json.dumps({"status": result["state"], "financial_authorized": False,
                              "receipt_sha256": RECEIPT_SHA256}, sort_keys=True))
        else:
            raise Hold("HOLD_W1_QUARANTINE_UNKNOWN_ACTION")
    except Exception:
        print('{"status":"HOLD_W1_QUARANTINE","financial_authorized":false}')
        sys.exit(3)
