#!/usr/bin/env python3
"""B-owned SOURCE_INSTALL policy for an exact three-file V22 transaction.

Source-only. Explicitly NOT an admission authority. The physical root executor
must use this module via immutable installed source, independently confirm real
GitHub Central approval, and perform no mutation until ALL predicates pass.
Current module has no production-apply CLI and refuses direct invocation.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import sys

PINNED = {
    "v22": ("c6e633538fc17dad6fe887452516cb2ba1095855a0aab6f4bdda47f5985f6edc",
            "cd6ec295573329e26227109707b2a33104453f76ca57b5ee4d027906fd3d54df"),
    "controller": ("dbbaab81dc964352670b24b23eea482f1af52d319015969ebb2d48cd59d171b8",
                   "9e2262b0d1f1e428cdd18e2f1d7b1aab84247aadd01b88dbcfbc430aa3f85350"),
    "guard": ("70e5331d9920e5675f815ceb333f19236956f940adae4d106b0864fef60bd17c",
              "87314320dd4aee0730d619a512d3625ac45a67d2030d6a0930d22ecbb4396de2"),
}
BOOT_REVIEW = "6fdc01cb-8eb6-448d-9a5a-b62b66e0fe34"
HOST_REVIEW = "ubuntu-4gb-hel1-11"
BASE_HEAD = "f91e57c2602a1e0674819d17c59f7fd5677b6e91"
STAGE_EVENT_SHA = "0be22cb597993307ab855443ae89e87dae25d542354e70474c98d5d673f87a45"
V20_SHA = "7d432066f370b9eeb7f931f2143a12f2695177e6c174775b4400617e00909c4c"
WEB_ORIGINAL_UNIT_SHA = "f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a"
V22_STEAM_SERVICE_UNIT_SHA = "44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a"
V22_TIMER_UNIT_SHA = "d3f4ce6fbbf6b2aad826a57e10e62859b82ce6e175b0ac99e6c5aa6f776413fc"
V22_LOCK_DROPIN_SHA = "34d66d8b1684ed23c3ddae2fb3cc66ca3b1ab26bc4f6bb1fae378012f03e5920"
PID_BASE = {
    "aoe2hdbets-web-prod.service": 701398,
    "aoe2hdbets-web.service": 2625090,
    "r25-c03-emergency-3033.service": 4136606,
    "kingdom-traders-paper.service": 779129,
    "wolochaind-mainnet.service": 1009,
    "ssh.service": 3727528,
    "nginx.service": 3727665,
}
CENTRAL_PREFIX = "AOE2WAR_CENTRAL_SOURCE_INSTALL_V22_APPROVED_V1:"
CENTRAL_ISSUE = "https://api.github.com/repos/Emaren/app-prodn/issues/1280"
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
HEX32 = re.compile(r"[0-9a-f]{32}\Z")
FENCE = "/etc/systemd/system/aoe2war-steam-egress-refresh.service.d/60-r25-source-install-guard.conf"
SENTINEL = "/etc/aoe2war/web-prod-v22/.source-install-in-progress"
FENCE_BODY = ("[Unit]\n"
              "ConditionPathExists=!" + SENTINEL + "\n").encode()
FENCE_SHA = hashlib.sha256(FENCE_BODY).hexdigest()

class Hold(ValueError):
    pass

def require(condition, code):
    if not condition:
        raise Hold("HOLD:B_V22_" + code)

def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def utc(value):
    require(type(value) is str and value.endswith("Z"), "UTC_FORMAT")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        raise Hold("HOLD:B_V22_UTC_PARSE") from None
    require(parsed.tzinfo is not None, "UTC_OFFSET")
    return parsed

def validate_packet(packet, *, now, root_bytes_sha, actual_boot, actual_host,
                    central_comment, packet_sha, owner_receipt_sha,
                    actual_module_shas, actual_signer_key_sha,
                    signed_central_proof, consumed=False):
    """No caller-supplied 'approved' booleans: require native GitHub comment.

    central_comment must be HTTPS-fetched from api.github.com by an independently
    reviewed root adapter, not caller-provided copy or fixture. This pure
    function tests its content; the trusted fetch itself is a physical gate.
    """
    require(type(packet) is dict and type(central_comment) is dict, "RECORD_TYPE")
    expected_keys={
        "schema","operation","request_state","source_ref_sha256",
        "reviewed_source_head_sha256","root_modules_sha256","central_signer_public_sha256","stage0003_sha256",
        "v20_source_sha256","original_3032_unit_sha256",
        "service_unit_sha256","timer_unit_sha256","lock_dropin_sha256",
        "source_install_fence_sha256","source_install_fence_path",
        "source_install_sentinel_path","old_new_sha256","executor_sha256",
        "boot_id","host","original_seven_pids","financial_authorized",
        "public_cutover_authorized","steam_auth_contract_change_authorized",
        "add_runtime_authorized","nonce","issued_at","expires_at",
        "owner_receipt_sha256","central_comment_id",
    }
    require(set(packet)==expected_keys,"UNREVIEWED_EXTRA_OR_MISSING_PACKET_KEYS")
    require(packet.get("schema") == "aoe2war.b.v22.three-source-central-install-request.v1"
            and packet.get("operation") == "SOURCE_INSTALL_ONLY_NO_PUBLIC_ACTIVATION"
            and packet.get("request_state") == "UNADMITTED_REQUIRE_INDEPENDENT_CENTRAL",
            "PACKET_SCHEMA")
    require(packet.get("source_ref_sha256") == BASE_HEAD
            and packet.get("stage0003_sha256") == STAGE_EVENT_SHA
            and packet.get("v20_source_sha256") == V20_SHA
            and packet.get("original_3032_unit_sha256") == WEB_ORIGINAL_UNIT_SHA,
            "SOURCE_OR_STAGE_SCOPE")
    require(packet.get("service_unit_sha256") == V22_STEAM_SERVICE_UNIT_SHA
            and packet.get("timer_unit_sha256") == V22_TIMER_UNIT_SHA
            and packet.get("lock_dropin_sha256") == V22_LOCK_DROPIN_SHA
            and packet.get("source_install_fence_sha256") == FENCE_SHA
            and packet.get("source_install_fence_path") == FENCE
            and packet.get("source_install_sentinel_path") == SENTINEL,
            "FENCE_OR_TIMER_SCOPE")
    require(packet.get("old_new_sha256") ==
            {name: list(pair) for name, pair in PINNED.items()},
            "EXACT_THREE_SOURCE_BYTES")
    require(type(root_bytes_sha) is str and HEX64.fullmatch(root_bytes_sha)
            and packet.get("executor_sha256") == root_bytes_sha,
            "REVIEWED_EXECUTOR_BYTES")
    require(type(actual_module_shas) is dict and
            set(actual_module_shas)=={
                "r25_b_v22_linux_host_adapter_REVIEW_ONLY.py",
                "r25_b_v22_source_install_coordinator_REVIEW_ONLY.py",
                "r25_v22_root_install_admission_REVIEW_ONLY.py",
                "r25_b_v22_central_signature_REVIEW_ONLY.py",
                "r25_v22_three_source_transaction_REVIEW_ONLY.py",
            } and
            all(type(v) is str and HEX64.fullmatch(v)
                for v in actual_module_shas.values()) and
            packet.get("root_modules_sha256")==actual_module_shas and
            packet.get("executor_sha256")==actual_module_shas[
                "r25_b_v22_linux_host_adapter_REVIEW_ONLY.py"] and
            type(packet.get("reviewed_source_head_sha256")) is str and
            HEX40.fullmatch(packet["reviewed_source_head_sha256"]),
            "REVIEWED_ROOT_MODULE_SET")
    require(type(actual_signer_key_sha) is str and
            HEX64.fullmatch(actual_signer_key_sha) and
            packet.get("central_signer_public_sha256")==actual_signer_key_sha,
            "NO_INDEPENDENT_SIGNER_KEY_PIN")
    require(type(signed_central_proof) is dict and
            signed_central_proof.get("status")==
              "PASS_CENTRAL_OFFLINE_SIGNED_SOURCE_INSTALL_MESSAGE" and
            signed_central_proof.get("public_key_sha256")==actual_signer_key_sha and
            signed_central_proof.get("github_comment_exact") is True,
            "DETACHED_SIGNATURE_REQUIRED")
    require(packet.get("boot_id") == actual_boot == BOOT_REVIEW
            and packet.get("host") == actual_host == HOST_REVIEW,
            "BOOT_OR_HOST_DRIFT")
    require(packet.get("original_seven_pids") == PID_BASE, "SEVEN_PID_APPROVAL")
    require(packet.get("financial_authorized") is False
            and packet.get("public_cutover_authorized") is False
            and packet.get("steam_auth_contract_change_authorized") is False
            and packet.get("add_runtime_authorized") is False,
            "SCOPE_WIDENING")
    require(type(packet.get("nonce")) is str and HEX32.fullmatch(packet["nonce"])
            and consumed is False, "NONCE_REPLAY")
    issue_at, expire_at = utc(packet.get("issued_at")), utc(packet.get("expires_at"))
    require(0 < (expire_at - issue_at).total_seconds() <= 1800
            and issue_at <= now <= expire_at, "PACKET_EXPIRED_OR_BROAD")
    # The packet digest MUST be externally calculated from the actual root
    # 0600 file: never embed the packet's own hash into its JSON (circular).
    # The separately issued owner receipt exists before the packet and is not
    # allowed to reference the later packet hash either.
    require(type(packet_sha) is str and HEX64.fullmatch(packet_sha), "PACKET_HASH")
    require(type(owner_receipt_sha) is str and HEX64.fullmatch(owner_receipt_sha)
            and packet.get("owner_receipt_sha256") == owner_receipt_sha,
            "OWNER_RECEIPT_ROOT_FILE_UNPINNED")
    require(type(central_comment.get("id")) is int
            and central_comment.get("id")==packet.get("central_comment_id")
            and central_comment.get("url") ==
            f"https://api.github.com/repos/Emaren/app-prodn/issues/comments/{central_comment['id']}"
            and central_comment.get("issue_url") == CENTRAL_ISSUE
            and central_comment.get("user", {}).get("login") == "Emaren",
            "CENTRAL_COMMENT_PROVENANCE")
    require(central_comment.get("created_at") == central_comment.get("updated_at")
            and issue_at <= utc(central_comment.get("created_at"))
            and utc(central_comment["created_at"]) <= now, "CENTRAL_COMMENT_TIME")
    require(signed_central_proof.get("signed_message_sha256")==
            digest(central_comment.get("body","").encode()),
            "DETACHED_SIGNATURE_BODY_MISMATCH")
    expected_approval = {
        "decision": "CENTRAL_SOURCE_INSTALL_ONLY_APPROVED",
        "packet_sha256": packet_sha,
        "nonce_sha256": digest(packet["nonce"].encode()),
        "executor_sha256": root_bytes_sha,
        "reviewed_source_head_sha256": packet["reviewed_source_head_sha256"],
        "root_modules_sha256": actual_module_shas,
        "central_signer_public_sha256": actual_signer_key_sha,
        "owner_receipt_sha256": owner_receipt_sha,
        "stage0003_sha256": STAGE_EVENT_SHA,
        "boot_id": actual_boot,
        "fence_sha256": FENCE_SHA,
        "no_public_activation": True,
        "no_financial_authority": True,
    }
    require(central_comment.get("body") == CENTRAL_PREFIX +
            canonical(expected_approval).decode(),
            "CENTRAL_APPROVAL_EXACT_BYTE_SCOPE")
    return {
        "status": "PASS_EXACT_CENTRAL_SOURCE_INSTALL_POLICY_ONLY",
        "nonce_sha256": digest(packet["nonce"].encode()),
        "central_comment_id": central_comment["id"],
        "expires_at": packet["expires_at"],
        "source_install_only": True,
        "public_activation": False,
        "financial_authority": False,
    }

def validate_protected_snapshot(before, after, *, timer_can_be_paused=False):
    """Require seven protected PIDs, 2 masked settlement units, sealed ports."""
    for label, snap in (("BEFORE", before), ("AFTER", after)):
        require(type(snap) is dict, label + "_TYPE")
        require(snap.get("boot") == BOOT_REVIEW and snap.get("host") == HOST_REVIEW,
                label + "_BOOT")
        require(snap.get("pids") == PID_BASE, label + "_SEVEN_PIDS")
        require(snap.get("nrestarts") == {key: 0 for key in PID_BASE},
                label + "_RESTARTS")
        require(snap.get("finance_listeners") == [], label + "_FINANCE_PORTS")
        require(snap.get("c04_masked") == {
            "wolochain-mainnet-settlement.service": True,
            "wolochain-founder-rewards-settlement.service": True}, label + "_C04")
        require(snap.get("nginx_selectors") == 6, label + "_NGINX")
        require(snap.get("original_unit_sha256") == WEB_ORIGINAL_UNIT_SHA
                and snap.get("stage0003_sha256") == STAGE_EVENT_SHA
                and snap.get("v20_sha256") == V20_SHA,
                label + "_SOURCE_PROTECTION")
        require(snap.get("steam_unit_sha256") == V22_STEAM_SERVICE_UNIT_SHA
                and snap.get("steam_timer_unit_sha256") == V22_TIMER_UNIT_SHA
                and snap.get("steam_lock_dropin_sha256") == V22_LOCK_DROPIN_SHA,
                label + "_STEAM_UNIT_DRIFT")
        require(snap.get("public_3032_http") == 200
                and snap.get("original_3030_http") == 200
                and snap.get("public_bets_http") == 503
                and snap.get("emergency_3033_http") == 503,
                label + "_HTTP_PROTECTION")
        require(snap.get("manager_reload_pending") is False,
                label + "_SYSTEMD_RELOAD_DRIFT")
    if timer_can_be_paused:
        require(before.get("steam_timer_active") is True
                and after.get("steam_timer_active") is False,
                "STEAM_TIMER_NOT_EXCLUSIVELY_PAUSED")
    else:
        require(before.get("steam_timer_active") is True
                and after.get("steam_timer_active") is True,
                "STEAM_TIMER_RESTORED")
    require(before.get("steam_source_sha256") == PINNED["v22"][0]
            and after.get("steam_source_sha256") in PINNED["v22"],
            "V22_SOURCE_CHANGE_SCOPE")
    return {"status": "PASS_PROTECTED_READONLY_BEFORE_AFTER_SOURCE_SCOPE"}

def source_install_sequence():
    """Review contract. Crash recovery MUST reenter with persistent fence."""
    return (
        "ROOT_VERIFY_EXTERNAL_CENTRAL_APPROVAL_AND_EXACT_PACKET",
        "ROOT_VERIFY_ALL_SEVEN_PID_AND_C04_PREIMAGE",
        "ROOT_ACQUIRE_PINNED_INODE_V22_SHARED_FLOCK_NONBLOCKING",
        "ROOT_ENSURE_STEAM_SERVICE_INACTIVE_UNDER_LOCK",
        "ROOT_INSTALL_EXACT_SYSTEMD_CONDITION_DROPIN_THEN_DAEMON_RELOAD",
        "ROOT_VERIFY_FENCE_EFFECTIVE_IN_SYSTEMD_MANAGER",
        "ROOT_CREATE_DURABLE_SOURCE_INSTALL_SENTINEL_BEFORE_FIRST_SWAP",
        "ROOT_STOP_ONLY_STEAM_TIMER_AND_RECHECK_SERVICE_INACTIVE",
        "ROOT_PERSIST_OLD_BYTES_AND_INVERSE_AND_PREPARED_RECEIPT",
        "ROOT_ATOMIC_THREE_SOURCE_SWAP_WITH_DURABLE_EVENT_AFTER_EACH",
        "ROOT_RUN_NEW_V22_NATIVE_SELFTEST_AND_ORIGINAL_PROFILE",
        "ROOT_VERIFY_ALL_SEVEN_PID_AND_C04_POSTIMAGE",
        "ROOT_RECORD_INSTALLED_SOURCE_RECEIPT_WHILE_FENCED",
        "ROOT_REMOVE_SENTINEL_ONLY_AFTER_ALL_THREE_SOURCE_BYTES_COMPLETE",
        "ROOT_REMOVE_OWN_EXACT_FENCE_DROPIN_AND_RELOAD",
        "ROOT_REENABLE_OR_RESTART_ONLY_ORIGINAL_TIMER_STATE",
        "ROOT_VERIFY_FINAL_STEAM_NATIVE_REFRESH_UNDER_NEW_SOURCE",
        "ROOT_SEAL_SOURCE_INSTALL_ONLY_COMPLETE_NO_PUBLIC_ACTIVATION",
    )

if __name__ == "__main__":
    print("HOLD:REVIEW_ONLY_NOT_ROOT_SOURCE_INSTALL_EXECUTOR")
    sys.exit(3)
