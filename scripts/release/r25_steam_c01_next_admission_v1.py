#!/usr/bin/env python3
"""V21 C01 *proposal classifier*. Pure, source-only, no host admission.

This does not issue operational approval. External Codex/Central authority must
authenticate one-use receipts and perform physical post-state observation.
It never invokes systemd, opens a financial socket or reads signer material.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re

R25_SOURCE_SHA = "b1ef050b954be734c9f34147361e0d02d7c89b19"
V20_STEAM_SOURCE_SHA256 = "7d432066f370b9eeb7f931f2143a12f2695177e6c174775b4400617e00909c4c"
V20_STEAM_UNIT_SHA256 = "b976a10d5cc8b3c199974f1b85a912a67323e8b57b4f69325a1061428d20deb2"
V20_C01_INERT_SNAPSHOT_SHA256 = "3a24b53d356d6ac406999fbabed66c5144d74e538503840d407feb4d5f365f15"
PROTECTED_PORTS = ("8092", "8093", "8094", "8095")
UNIT_PINS = {
    "wolo-satchel-c01.service": {
        "user": "wolo-satchel",
        "working_directory": "/var/lib/wolo-financial-role-state/v1/custody",
        "unit_config_sha256": "09345231256daf861f20c0a1440663e2f2bda7f409446f249982f58337748bc6",
        "effective_exec_sha256": "8b279b760e8f6c254eadd362bc87eb69758b7fb1683745ec4cbdaa4b998d89e2",
        "binary_sha256": "0e9692c124269866f53f9b2b28b7eac59f5ad384970876b143b6ef61470b525e",
    },
    "wolo-reviewer-c01.service": {
        "user": "wolo-reviewer",
        "working_directory": "/var/lib/wolo-financial-role-state/v1/reviewer",
        "unit_config_sha256": "4f03387b9ab2f4f27cb34e5089916a66b0af46ec60cb5a1195de273ed325aa3d",
        "effective_exec_sha256": "6ed24456a25429e90a1708bfc4c6aa6d9bdf50c383a8a7195f8ca8ebceec06ef",
        "binary_sha256": "17165fa6c590da1d20e761546bffc4795e884cf4bce8310e333373e9bfdf36de",
    },
}
MUTABLE_RUNTIME_FIELDS = frozenset(("active_state", "main_pid", "start_ticks"))
HEX64 = re.compile(r"^[0-9a-f]{64}$")
HOLD_PREFIX = "HOLD:V21_C01_PROPOSAL_"


class AdmissionHold(ValueError):
    pass


def require(ok, reason):
    if not ok:
        raise AdmissionHold(HOLD_PREFIX + reason)


def digest(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":"),
                                     allow_nan=False).encode()).hexdigest()


def unit_inert(unit, pin):
    require(type(unit) is dict and set(unit) == (set(pin) | set(MUTABLE_RUNTIME_FIELDS)
            | {"result", "need_daemon_reload", "funded_actions", "signer_permission",
               "manual_activation_condition"}), "UNIT_FIELDS")
    for name, expected in pin.items():
        require(unit[name] == expected, "PIN_" + name.upper())
    require(unit["result"] == "success" and unit["need_daemon_reload"] == "no"
            and unit["funded_actions"] == 0 and unit["signer_permission"] is False
            and unit["manual_activation_condition"] == "CODEX_ONE_USE_INERT_CONDITION",
            "UNIT_PROTECTIVE_PROPERTIES")
    require(unit["active_state"] == "inactive" and unit["main_pid"] == 0
            and unit["start_ticks"] is None, "SERVICE_ALREADY_STARTED")


def candidate_transition(before, after, reviewed):
    """Return reviewable, nondeployable proposal only when *exactly one* service changes.

    Reviewed metadata describes a planned Codex/owner signoff; it is NOT
    authenticated here. The unchanged V20 protector must reject the transition.
    Only a separately built/qualified next-version observer could admit it.
    """
    require(type(before) is dict and type(after) is dict and type(reviewed) is dict, "SCHEMA")
    expected_keys = {"source", "steam", "web", "ports", "rollback", "nft",
                     "units", "funded_operations", "ledger_mutations"}
    require(set(before) == expected_keys and set(after) == expected_keys, "SNAPSHOT_FIELDS")
    require(before["source"] == after["source"] == R25_SOURCE_SHA, "R25_SOURCE")
    require(before["steam"] == after["steam"] == {
        "source_sha256": V20_STEAM_SOURCE_SHA256,
        "unit_sha256": V20_STEAM_UNIT_SHA256,
        "c01_inert_snapshot_sha256": V20_C01_INERT_SNAPSHOT_SHA256,
    }, "STEAM_V20_PINS")
    for key in ("web", "ports", "rollback", "nft"):
        require(before[key] == after[key], "DRIFT_" + key.upper())
    require(type(before["web"]) is dict and
            before["web"].get("3032_source_sha") == R25_SOURCE_SHA and
            type(before["web"].get("3032_pid")) is int and before["web"]["3032_pid"] > 0 and
            type(before["web"].get("3030_pid")) is int and before["web"]["3030_pid"] > 0 and
            before["rollback"] == "PRESERVED_CANDIDATE_TO_ORIGINAL_TO_CANDIDATE" and
            before["nft"] == "PROTECTED_PINNED_STEAM_V20_LEASE", "WEB_ROLLBACK")
    require(before["ports"] == after["ports"] ==
            {port: [] for port in PROTECTED_PORTS}, "FINANCE_PORTS")
    require(before["funded_operations"] == after["funded_operations"] == 0 and
            before["ledger_mutations"] == after["ledger_mutations"] == 0, "FUNDS_CHANGED")
    require(type(before["units"]) is dict and type(after["units"]) is dict and
            set(before["units"]) == set(after["units"]) == set(UNIT_PINS),
            "EXACT_TWO_UNITS")

    changed = []
    for name, pin in UNIT_PINS.items():
        pre = before["units"][name]
        post = after["units"][name]
        unit_inert(pre, pin)
        require(type(post) is dict and set(post) == set(pre), "POST_FIELDS")
        for key in set(pre) - MUTABLE_RUNTIME_FIELDS:
            require(pre[key] == post[key], "POST_UNIT_PIN_OR_PROTECTION_CHANGED")
        if post != pre:
            require(post["active_state"] == "active" and
                    type(post["main_pid"]) is int and post["main_pid"] > 0 and
                    type(post["start_ticks"]) is int and post["start_ticks"] > 0,
                    "NOT_BOUNDED_ZERO_FUNDS_START")
            changed.append(name)
    require(len(changed) == 1, "ONLY_ONE_SERVICE_PER_ONE_USE_APPROVAL")
    require(set(reviewed) == {"transition_unit", "pre_state_sha256",
                             "post_state_sha256", "approval_id",
                             "owner_approval_receipt_sha256",
                             "codex_zero_funds_receipt_sha256",
                             "previous_one_use_receipt_consumed",
                             "observed_v20_policy_action"}, "REVIEW_METADATA")
    require(reviewed["transition_unit"] == changed[0], "REVIEW_UNIT")
    require(reviewed["pre_state_sha256"] == digest(before) and
            reviewed["post_state_sha256"] == digest(after), "SNAPSHOT_BINDING")
    require(type(reviewed["approval_id"]) is str and
            re.fullmatch(r"C01-V21-[A-Z0-9]{12,64}", reviewed["approval_id"]),
            "OWNER_APPROVAL_ID")
    for k in ("owner_approval_receipt_sha256", "codex_zero_funds_receipt_sha256"):
        require(type(reviewed[k]) is str and HEX64.fullmatch(reviewed[k]) and
                reviewed[k] != "0" * 64, "RECEIPT_ID")
    require(reviewed["owner_approval_receipt_sha256"] !=
            reviewed["codex_zero_funds_receipt_sha256"], "INDEPENDENT_RECEIPTS")
    require(reviewed["previous_one_use_receipt_consumed"] is False,
            "ONE_USE_REPLAY")
    require(reviewed["observed_v20_policy_action"] == "HOLD_UNTIL_SEPARATE_V21_ADMISSION",
            "V20_PROTECTION_BYPASS")

    return {"schema": "aoe2war.steam-v21.c01-zero-funds-source-proposal.v1",
            "status": "STAGED_FOR_CODEX_AND_CENTRAL_REVIEW_ONLY",
            "source_only": True, "deployment_authorized": False,
            "funded_operations_authorized": False,
            "v20_must_still_hold": True, "unit": changed[0],
            "before_sha256": digest(before), "after_sha256": digest(after),
            "approval_id": reviewed["approval_id"],
            "required_physical_checks": [
                "Codex authenticates owner and finance receipts (not by this function)",
                "Codex consumes persistent one-use nonce before any start",
                "Codex verifies audited exact unit, binary, config and effective ExecStart",
                "Codex proves isolated zero-funds signer permissions and zero ledger writes",
                "V21 Steam code exact-head CI, systemd sandbox and V20 negative controls",
                "New service PID/start tick witnessed with 3032, 3030, NFT and 8092-8095 invariants",
                "Independent rollback/replay/drift stop path demonstrated",
                "Central signs distinct V21 activation after those checks",
            ]}


if __name__ == "__main__":
    print("SOURCE_ONLY: no systemd, network, financial DB, signer or funding access")
