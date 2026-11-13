#!/usr/bin/env python3
"""Steam-only egress refresh for the exact 4c14 nonfinancial public runtime.

Repairs V22's obsolete two-build+PID policy after an owner-authorized same-slot
3032 deployment, without changing Steam OpenID logic, financial roles, native
nft rules, keys, listeners or any other service.

The existing immutable V22 -> V5z -> C03/C04/C01 chain supplies ALL protected
financial/kernel checks and ALL nft command construction. This thin adapter
rebinds only the expected live website release identity.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time

V22 = Path("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_two_web_builds_v22.py")
V22_SHA = "c6e633538fc17dad6fe887452516cb2ba1095855a0aab6f4bdda47f5985f6edc"
W1_HELPER = Path("/usr/local/lib/aoe2war-web-prod/r25_steam_w1_four_mask_guard_v1.py")
W1_HELPER_SHA = "97b93c24eee5ddd21bc909bb4d7babe3a9986daf93b41df0ee628501b1ad1e23"
W1_RECEIPT_SHA = "493578195936de435dd06b2f72d77e59c673e9de62639cb7fedc8fc2c4340022"
W1_POST_C01_SHA = "5fdaa394f3a193e056a9a2ec19473502ba250a6532f0c695c43ce804565126a2"
W1_PRE_C01_SHA = "3ff109b85184593a6f2e4fe072273410c6c34a49b93c1258b56cb031afa8c496"
SELF = Path("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_current_product_v23.py")
UNIT = Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
UNIT_SHA = "fb68d4f9165208d13586815fa05d73ec0794dbfac072417fa377333b742f74b8"
STEAM_UNIT = Path("/etc/systemd/system/aoe2war-steam-egress-refresh.service")
STEAM_UNIT_SHA = "44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a"
STAGE = Path("/var/lib/aoe2war-web-prod-9f7b56f536ba")
SOURCE = "9f7b56f536ba51b4678ac43baebfae140ada6479"
BUILD = "anGaZQRUjWiDs5PXhJ8cr"
BUILD_VERSION = "20261112224108-783d42e05c"
SERVICE = "aoe2hdbets-web-prod.service"
PROTECTED = ("aoe2hdbets-web.service","r25-c03-emergency-3033.service",
             "kingdom-traders-paper.service","wolochaind-mainnet.service")
ORIGINAL_PIDS = (2625090, 4136606, 779129, 1009)
SOURCE_SELF_SHA = None  # installed-file identity is bound by root installer
HTTP_SCOPE = "STEAM_ONLY_EXISTING_UID990_NFT_SETS"
CHECKPOINT = "WEB_IDENTITY"

def need(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError("HOLD:" + message)

def sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def pinned_file(path: Path, digest: str, mode: int | None = None) -> None:
    st = path.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid == 0 and st.st_nlink == 1
         and not (stat.S_IMODE(st.st_mode) & 0o022), "PROTECTED_SOURCE_OWNERSHIP")
    if mode is not None:
        need(stat.S_IMODE(st.st_mode) == mode, "PROTECTED_SOURCE_MODE")
    need(sha_file(path) == digest, "EXACT_SOURCE_DRIFT")

def show(unit: str, field: str) -> str:
    p = subprocess.run(["/usr/bin/systemctl","show",unit,
                        "-p",field,"--value"],
                       capture_output=True,text=True,timeout=10)
    need(p.returncode == 0, "SYSTEMD_QUERY_FAILED")
    return p.stdout.strip()

def validate_current_web() -> tuple[int, str]:
    pinned_file(UNIT, UNIT_SHA, 0o644)
    pinned_file(STEAM_UNIT, STEAM_UNIT_SHA, 0o644)
    pinned_file(V22, V22_SHA, 0o644)
    need(STAGE.is_dir() and not STAGE.is_symlink() and STAGE.stat().st_uid == 0,
         "CURRENT_ROOT_RUNTIME_REQUIRED")
    for relative, expected in (("/.aoe2war-source-sha",SOURCE),
                               ("/.next/BUILD_ID",BUILD),
                               ("/.aoe2war-build-version",BUILD_VERSION)):
        path = Path(str(STAGE) + relative)
        st = path.lstat()
        need(stat.S_ISREG(st.st_mode) and st.st_uid == 0 and st.st_nlink == 1
             and not (stat.S_IMODE(st.st_mode) & 0o022)
             and path.read_text().strip() == expected,"EXACT_DEPLOYED_BUILD_IDENTITY")
    need(show(SERVICE,"User") == "aoe2war-web-prod", "CURRENT_WEB_WRONG_UID_NAME")
    need(show(SERVICE,"WorkingDirectory") == str(STAGE), "CURRENT_WEB_WRONG_STAGE")
    need(show(SERVICE,"ActiveState") == "active", "CURRENT_WEB_NOT_ACTIVE")
    ptext = show(SERVICE,"MainPID")
    need(ptext.isdecimal() and int(ptext) > 100, "CURRENT_WEB_PID_MISSING")
    pid = int(ptext)
    proc = Path("/proc") / str(pid)
    need(proc.exists() and proc.stat().st_uid == 990,"CURRENT_WEB_WRONG_KERNEL_UID")
    # A capability-limited Steam-only systemd oneshot is intentionally
    # denied ptrace-style access to another UID's /proc/PID/cwd and /exe.
    # Those readlinks work in an interactive root shell but fail in the real
    # NoNewPrivileges sandbox.  Bind to the kernel PID UID and the sealed
    # root-owned systemd unit, exact source, BUILD_ID and WorkingDirectory
    # above; do not request extra ptrace capabilities or loosen sandboxing.
    for unit, expected in zip(PROTECTED,ORIGINAL_PIDS):
        need(show(unit,"MainPID") == str(expected),"OTHER_PROTECTED_PID_CHANGED")
    for unit in ("wolochain-mainnet-settlement.service",
                 "wolochain-founder-rewards-settlement.service"):
        p = subprocess.run(["/usr/bin/systemctl","is-enabled",unit],
                           capture_output=True,text=True,timeout=10)
        need(p.stdout.strip() == "masked" and p.returncode in (0,1),
             "FINANCIAL_SETTLEMENT_UNMASKED")
    p = subprocess.run(["/usr/bin/ss","-H","-ltn"],
                       capture_output=True,text=True,timeout=8)
    need(p.returncode == 0,"LISTENER_INSPECTION_FAILED")
    for line in p.stdout.splitlines():
        fields = line.split()
        if len(fields) >= 4:
            need(not any(fields[3].endswith(":" + str(port))
                         for port in range(8092,8096)),
                 "FINANCIAL_EXECUTOR_LISTENER")
    return pid, BUILD

def load_v22():
    spec = importlib.util.spec_from_file_location("original_v22_exact_binary",str(V22))
    need(spec is not None and spec.loader is not None,"V22_IMPORT_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    need(module.FIN_SNAPSHOT ==
         "3a24b53d356d6ac406999fbabed66c5144d74e538503840d407feb4d5f365f15",
         "ORIGINAL_FIN_SNAPSHOT_DRIFT")
    need(module.PRE_C01_FIN_SNAPSHOT ==
         "2dec2527fad7a53730a998898e26bc94b6d2c8c930db80aa7de1b44578a20f42",
         "ORIGINAL_PRE_C01_FIN_SNAPSHOT_DRIFT")
    need(module.NFT_SHAPE ==
         "985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af",
         "ORIGINAL_NFT_SCOPE_DRIFT")
    # The original V22/V5z/C03/C04/C01 files remain byte-for-byte immutable.
    # No global monitor exclusion: W1 wraps only the four receipt-pinned
    # masked rows inside the original FULL 63-unit protected snapshot.
    pinned_file(W1_HELPER, W1_HELPER_SHA, 0o644)
    ws = importlib.util.spec_from_file_location("accepted_w1_four_masks", str(W1_HELPER))
    need(ws is not None and ws.loader is not None, "W1_HELPER_IMPORT_FAILED")
    w1 = importlib.util.module_from_spec(ws)
    ws.loader.exec_module(w1)
    need(w1.RECEIPT_SHA256 == W1_RECEIPT_SHA
         and set(w1.UNITS) == {
             "aoe2hdbets-bet-stake-reconcile.timer",
             "aoe2hdbets-bet-stake-reconcile.service",
             "aoe2hdbets-staking-rewards.timer",
             "aoe2hdbets-staking-rewards.service",
         }, "UNREVIEWED_W1_QUARANTINE_SCOPE")
    original_loader = module.load_original
    def loaded_original_with_w1():
        original = original_loader()
        unchanged_immutable_loader = original.load_immutable_original
        def load_full_original_w1_guarded():
            m = unchanged_immutable_loader()
            w1.attach_to_original_protected_chain(m)
            return m
        original.load_immutable_original = load_full_original_w1_guarded
        return original
    module.load_original = loaded_original_with_w1
    # These hashes came from the actual HEL1 root read-only 63-unit probe
    # and C01 exact original three-field inverse; never from untrusted
    # current-state acceptance at runtime.
    module.FIN_SNAPSHOT = W1_POST_C01_SHA
    module.PRE_C01_FIN_SNAPSHOT = W1_PRE_C01_SHA
    return module

def read_protected_after_c03_observer_completion(reader, pause=time.sleep):
    """Retry only genuine *active* C03 observer, never certify it while active.

    The original root-reviewed C03 identity guard explicitly permits a new
    observation after its read-only oneshot completes. One hourly timer can
    start in the same second as Steam's minute timer. Re-run the unmodified
    complete protected observer every attempt; never reuse its old result.
    Five attempts/at most four bounded 0.75s waits. All other errors HOLD.
    """
    global CHECKPOINT
    for attempt in range(5):
        try:
            return reader()
        except RuntimeError as exc:
            if str(exc) != "C03_OBSERVER_TEMPORARILY_ACTIVE" or attempt == 4:
                raise
            CHECKPOINT = "C03_OBSERVER_CLEAN_COMPLETION_RETRY"
            pause(0.75)
    raise AssertionError("unreachable")


def recover_verified_lease_expiry_once(m, original, validated, observed,
                                       protected_before, web_pid, nft_shape):
    """Close only a validated-IP expiry race between pre/post nft observations.

    V5z's original command builder never extends a still-live lease. If an
    already TLS-verified address falls out of nft in that gap, one narrowly
    bounded re-add of just the now-absent verified address is permitted.
    No flush, arbitrary address, new tables, extra capabilities or timer tweak.
    """
    global CHECKPOINT
    missing = sorted(set(validated) - (observed["steam4"] | observed["steam6"]))
    if not missing:
        return observed
    CHECKPOINT = "EXPIRED_VERIFIED_STEAM_LEASE_RETRY"
    need(len(missing) <= 16, "STEAM_RETRY_ADDRESS_SCOPE")
    commands = m.production_steam_union_commands(missing, observed)
    need(0 < len(commands) <= 2 and sum(map(len, commands)) < 8192,
         "STEAM_RETRY_COMMAND_SCOPE")
    need(validate_current_web()[0] == web_pid,
         "STEAM_RETRY_WEB_IDENTITY_CHANGED")
    need(read_protected_after_c03_observer_completion(
        m.production_protected) == protected_before
         and m.production_nft_shape() == nft_shape,
         "STEAM_RETRY_PROTECTED_BASELINE_CHANGED")
    CHECKPOINT = "EXPIRED_VERIFIED_STEAM_LEASE_NFT_ADD"
    m.run(["/usr/sbin/nft", "-f", "-"],
          data=("\n".join(commands) + "\n").encode(), maximum=8192)
    CHECKPOINT = "EXPIRED_VERIFIED_STEAM_LEASE_FINAL_OBSERVATION"
    final = original.observe_strict_steam_set_with_bounded_retry(m)
    need(set(validated).issubset(final["steam4"] | final["steam6"]),
         "STEAM_EGRESS_LEASE_NOT_INSTALLED_AFTER_BOUNDED_RETRY")
    return final


def only_steam_refresh():
    global CHECKPOINT
    CHECKPOINT = "WEB_IDENTITY"
    before_pid, _ = validate_current_web()
    CHECKPOINT = "LOAD_IMMUTABLE_V22"
    v22 = load_v22()
    original = v22.load_original()
    CHECKPOINT = "RESTRICTED_CAPABILITIES"
    original.get_caps_or_hold()  # root, NNP=1, CAP_NET_ADMIN/SETUID/SETGID
    def transaction():
        global CHECKPOINT
        CHECKPOINT = "PROTECTED_FINANCIAL_SNAPSHOT"
        # Original immutable sources enforce all finance source/role/NFT masks.
        _, m, financial_snapshot = read_protected_after_c03_observer_completion(
            v22.native_snapshot)
        need(financial_snapshot == v22.FIN_SNAPSHOT, "PROTECTED_FINANCIAL_SNAPSHOT")
        need(m.production_nft_shape() == v22.NFT_SHAPE, "NFT_FIREWALL_SHAPE_DRIFT")
        before = read_protected_after_c03_observer_completion(m.production_protected)
        CHECKPOINT = "STEAM_TLS_DESTINATION_VALIDATION"
        validated = m.production_steam_dns_diversity(m.production_steam_addresses())
        CHECKPOINT = "STEAM_NFT_LEASE_OBSERVATION"
        current = original.observe_strict_steam_set_with_bounded_retry(m)
        commands = m.production_steam_union_commands(validated,current)
        CHECKPOINT = "PROTECTED_PRE_WRITE_REVALIDATION"
        need(len(commands) <= 16 and sum(len(x) for x in commands) < 8192,
             "STEAM_NFT_COMMANDS_UNBOUNDED")
        need(validate_current_web()[0] == before_pid,
             "WEB_RESTART_DURING_STEAM_REFRESH")
        need(read_protected_after_c03_observer_completion(
            m.production_protected) == before
             and m.production_nft_shape() == v22.NFT_SHAPE,
             "PROTECTED_BASELINE_CHANGED_BEFORE_STEAM_NFT")
        CHECKPOINT = "STEAM_ONLY_NFT_WRITE"
        if commands:
            m.run(["/usr/sbin/nft","-f","-"],
                  data=("\n".join(commands)+"\n").encode(),maximum=8192)
        CHECKPOINT = "PROTECTED_POST_WRITE_REVALIDATION"
        after = original.observe_strict_steam_set_with_bounded_retry(m)
        after = recover_verified_lease_expiry_once(
            m, original, validated, after, before, before_pid, v22.NFT_SHAPE)
        need(set(validated).issubset(after["steam4"] | after["steam6"]),
             "STEAM_EGRESS_LEASE_NOT_INSTALLED")
        need(m.production_nft_shape() == v22.NFT_SHAPE
             and read_protected_after_c03_observer_completion(
                 m.production_protected) == before,
             "PROTECTED_BASELINE_CHANGED_AFTER_STEAM_NFT")
        validate_current_web()
        print(json.dumps({
            "status":"PASS_STEAM_ONLY_REFRESH","schema":"aoe2war.steam.current-product.v23",
            "validated_destination_count":len(validated),
            "nft_entries":sum(len(x) for x in after.values()),
            "ttl_seconds":300,"financial_authorized":False,
            "allowed_operation":HTTP_SCOPE,"build_id":BUILD,
        },sort_keys=True),flush=True)
    CHECKPOINT = "STEAM_EXCLUSIVE_LEASE_LOCK"
    return v22.v22_timer_exclusive_lock(transaction)

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase",required=True,choices=("inspect","refresh"))
    args = parser.parse_args()
    try:
        pid, _ = validate_current_web()
        if args.phase == "inspect":
            print(json.dumps({"status":"PASS_EXACT_NONFINANCIAL_WEB_SOURCE",
                              "build_id":BUILD,"pid":pid,
                              "finance_authorized":False,
                              "firewall_changed":False},sort_keys=True))
        else:
            need(os.geteuid()==0,"RESTRICTED_SYSTEMD_ROOT_REQUIRED")
            only_steam_refresh()
        return 0
    except Exception as exc:
        reason = str(exc)
        if not re.fullmatch(r"(?:HOLD:)?[A-Z0-9_]{3,100}",reason):
            reason = "HOLD:NONIDENTIFYING_" + type(exc).__name__.upper() + "_AT_" + CHECKPOINT
        print(json.dumps({"status":"HOLD_STEAM_CURRENT_PRODUCT_V23",
                          "reason":reason,"financial_authorized":False},
                         sort_keys=True),flush=True)
        return 3

if __name__ == "__main__":
    sys.exit(main())
