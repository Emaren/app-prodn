#!/usr/bin/env python3
"""Nonfinancial C UID650 -> B 3032 immutable artifact interface and admission.

Pure immutable receipt checks and same-slot state transitions; no remote access,
root mutation, Steam login, network, timers, SQL, secrets or service controls.
A root-owned B adapter must independently attest C's actual UID650 build/process
and the build's exact Git commit/tree; receipt fields alone cannot prove UID650.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys

SOURCE_REPO="Emaren/app-prodn"
PORT=3032
FORBIDDEN_PORTS={3030,3033,9447,8092,8093,8094,8095}
HEX40=re.compile(r"[0-9a-f]{40}\Z")
HEX64=re.compile(r"[0-9a-f]{64}\Z")
NONCE=re.compile(r"[0-9a-f]{32}\Z")
BUILD_ID=re.compile(r"[A-Za-z0-9_-]{8,64}\Z")
ALLOWED_FEATURES={
    "kingdom_menu_original_order",
    "managed_portrait_bytes",
    "canonical_traffic_131_points",
    "featured_warriors_rotation",
    "authenticated_admin",
    "authenticated_nonadmin",
    "api_failclosed",
    "steam_session_no_new_registration",
}
C_ARTIFACT_SCHEMA="aoe2war.c-uid650-product-artifact.v1"
B_STAGE_SCHEMA="aoe2war.b-immutable-product-stage.v1"
B_PERMIT_SCHEMA="aoe2war.b-3032-serial-same-slot-permit.v1"

class Hold(ValueError):
    pass

def require(condition,why):
    if not condition:raise Hold("HOLD:PRODUCT_3032_"+why)
def sha(blob:bytes)->str:
    return hashlib.sha256(blob).hexdigest()
def canonical(obj:object)->bytes:
    return json.dumps(obj,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()

def validate_c_artifact(receipt, *, source_tree_lookup, archive_sha,
                        archive_bytes, attested_runner, external_ci):
    """C's manifest is untrusted until root-side source/UID/CI verification.

    source_tree_lookup: independently fetched authoritative Git tree.
    archive_sha/bytes: independently streamed by B, not fields copied from C.
    attested_runner: B-verified *root-controlled UID650 launch* receipt.
    external_ci: B independently verified exact-head check results.
    """
    require(type(receipt) is dict
            and receipt.get("schema")==C_ARTIFACT_SCHEMA
            and receipt.get("source_repo")==SOURCE_REPO,"C_ARTIFACT_SCHEMA")
    source=receipt.get("source_commit")
    tree=receipt.get("source_tree")
    require(type(source) is str and HEX40.fullmatch(source)
            and type(tree) is str and HEX40.fullmatch(tree)
            and tree==source_tree_lookup,"SOURCE_TREE_MISMATCH")
    require(type(receipt.get("build_id")) is str
            and BUILD_ID.fullmatch(receipt["build_id"]),"BUILD_ID")
    artifact=receipt.get("archive")
    require(type(artifact) is dict
            and artifact.get("name")=="runtime.tar.gz"
            and type(artifact.get("sha256")) is str
            and HEX64.fullmatch(artifact["sha256"])
            and artifact["sha256"]==archive_sha
            and type(artifact.get("bytes")) is int
            and artifact["bytes"]==archive_bytes and archive_bytes>0,
            "ARCHIVE_BYTES_OR_HASH")
    require(receipt.get("architecture")=="linux-x86_64"
            and receipt.get("node")=="v22.22.0","RUNTIME_ABI")
    require(receipt.get("application_port")==PORT
            and receipt.get("no_financial_source") is True
            and receipt.get("private_keys_embedded") is False
            and receipt.get("writes_to_financial_db") is False,
            "FINANCIAL_CAPABILITY")
    require(type(attested_runner) is dict
            and attested_runner.get("uid")==650
            and attested_runner.get("gid")==650
            and attested_runner.get("kernel_financial_denial") is True
            and attested_runner.get("uid501_automation_escape_closed") is True
            and attested_runner.get("source_commit")==source
            and attested_runner.get("artifact_sha256")==archive_sha
            and attested_runner.get("attested_by_root") is True,
            "RUNNER_PHYSICAL_PROVENANCE")
    require(type(external_ci) is dict
            and external_ci.get("source_commit")==source
            and external_ci.get("conclusion")=="success"
            and external_ci.get("verified_by_B") is True,
            "EXTERNAL_SOURCE_CI")
    features=receipt.get("declared_acceptance_features")
    require(type(features) is list and set(features)==ALLOWED_FEATURES
            and len(features)==len(ALLOWED_FEATURES),"ACCEPTANCE_SCOPE")
    return {
        "status":"PASS_C_ARTIFACT_IMMUTABLE_SOURCE_CONTRACT_ONLY",
        "source_commit":source,"source_tree":tree,"archive_sha256":archive_sha,
        "build_id":receipt["build_id"],"financial_authority":False,
        "deployment_authorized":False,
    }

def validate_root_stage(stage, c_receipt, *, independent_archive_sha,
                        independent_manifest_sha):
    """Original C-owned bytes are copied into B root-owned immutable stage."""
    require(type(stage) is dict and stage.get("schema")==B_STAGE_SCHEMA,
            "ROOT_STAGE_SCHEMA")
    require(stage.get("root_owned") is True
            and stage.get("mode")==0o400
            and stage.get("nlink")==1
            and stage.get("no_symlink_ancestors") is True
            and stage.get("prepared_by_B") is True,
            "ROOT_STAGE_PERMISSION")
    require(stage.get("artifact_sha256")==independent_archive_sha ==
            c_receipt.get("archive",{}).get("sha256")
            and stage.get("source_commit")==c_receipt.get("source_commit")
            and stage.get("source_tree")==c_receipt.get("source_tree")
            and stage.get("manifest_sha256")==independent_manifest_sha,
            "ROOT_STAGE_SOURCE_DRIFT")
    require(stage.get("stage_slot")!="STAGE0003"
            and stage.get("stage0003_touched") is False,
            "IMMUTABLE_STAGE0003")
    return {"status":"PASS_ROOT_STAGE_DATA_BINDING_ONLY",
            "release_authority":False,"public_cutover":False}

def validate_b_permit(permit, *, root_stage, original_unit_sha,
                      previous_nonce_sha256, steam_compat):
    """Distinct B/Central one-use 3032 ACTIVATE_ONLY permit per cycle."""
    require(type(permit) is dict and permit.get("schema")==B_PERMIT_SCHEMA
            and permit.get("phase")=="ACTIVATE_ONLY"
            and permit.get("central_independent_approval") is True
            and permit.get("owner_terminal_approved") is True
            and permit.get("replay_consumed") is False,
            "NO_INDEPENDENT_ACTIVATION_APPROVAL")
    require(permit.get("web_port")==PORT
            and permit.get("no_new_next_runtime") is True
            and permit.get("allowed_unit")=="aoe2hdbets-web-prod.service"
            and permit.get("allowed_nginx_selector_change") is False,
            "SAME_SLOT_ONLY")
    require(permit.get("immutable_stage_sha256")==root_stage.get("artifact_sha256")
            and permit.get("source_commit")==root_stage.get("source_commit")
            and permit.get("source_tree")==root_stage.get("source_tree")
            and permit.get("original_3032_unit_sha256")==original_unit_sha,
            "ARTIFACT_INVERSE_BINDING")
    require(permit.get("original_3030_preserved") is True
            and permit.get("emergency_3033_preserved") is True
            and permit.get("paper_9447_preserved") is True
            and permit.get("financial_authorized") is False
            and permit.get("steam_auth_contract_change") is False,
            "PROTECTED_RUNTIME_SCOPE")
    require(type(permit.get("nonce")) is str and NONCE.fullmatch(permit["nonce"])
            and sha(permit["nonce"].encode())!=previous_nonce_sha256,
            "REPLAY_OR_DUPLICATE_NONCE")
    require(type(steam_compat) is dict
            and steam_compat.get("exact_source_commit")==permit["source_commit"]
            and steam_compat.get("exact_build_id")==permit.get("build_id")
            and steam_compat.get("source_version_signed") is True
            and steam_compat.get("original_rollback_profile_preserved") is True,
            "STEAM_V22_EXACT_PROFILE_NOT_ADMITTED")
    return {
        "status":"PASS_B_ACTIVATE_ONLY_DATA_CONTRACT",
        "nonce_sha256":sha(permit["nonce"].encode()),
        "same_slot_only":True,"public_release_executed":False,
    }

STATES=(
    "SOURCE_ATTESTED",
    "ROOT_STAGED",
    "RELEASE_ADMITTED",
    "STOP_INTENT",
    "ORIGINAL_3032_STOPPED",
    "CANDIDATE_STARTED",
    "STEAM_CANDIDATE_ENROLLED",
    "ADMIN_ACCEPTED",
    "ORDINARY_ACCEPTED",
    "PUBLIC_NONFINANCIAL_ACCEPTED",
    "ROLLBACK_INTENT",
    "ORIGINAL_3032_RESTORED",
    "STEAM_ORIGINAL_REENROLLED",
    "ROLLBACK_VERIFIED",
)
ALLOWED_NEXT={a:b for a,b in zip(STATES,STATES[1:])}
ALLOW_FAIL_RECOVERY={
    "STOP_INTENT","ORIGINAL_3032_STOPPED","CANDIDATE_STARTED",
    "STEAM_CANDIDATE_ENROLLED","ADMIN_ACCEPTED","ORDINARY_ACCEPTED",
    "PUBLIC_NONFINANCIAL_ACCEPTED",
}

class SameSlotCycle:
    """Immutable one-use stage transition planner, not a process controller."""
    def __init__(self, *, nonce_sha256, source_commit, original_unit_sha,
                 candidate_unit_sha):
        require(HEX64.fullmatch(nonce_sha256) and HEX40.fullmatch(source_commit)
                and HEX64.fullmatch(original_unit_sha)
                and HEX64.fullmatch(candidate_unit_sha)
                and original_unit_sha!=candidate_unit_sha,"CYCLE_PINS")
        self.nonce_sha256=nonce_sha256
        self.source_commit=source_commit
        self.original_unit_sha=original_unit_sha
        self.candidate_unit_sha=candidate_unit_sha
        self.events=[]

    def append(self, event, evidence):
        require(event in STATES and type(evidence) is dict, "CYCLE_EVENT")
        current=self.events[-1]["event"] if self.events else None
        next_linear=current is not None and ALLOWED_NEXT.get(current)==event
        emergency_rollback=(event=="ROLLBACK_INTENT" and
                            current in ALLOW_FAIL_RECOVERY)
        require((current is None and event==STATES[0]) or
                next_linear or emergency_rollback,
                "CYCLE_ORDER_OR_REPLAY")
        require(evidence.get("nonce_sha256")==self.nonce_sha256
                and evidence.get("source_commit")==self.source_commit,
                "CYCLE_SOURCE_OR_NONCE")
        if event in ("CANDIDATE_STARTED","ORIGINAL_3032_RESTORED"):
            require(evidence.get("unit_sha256")==(
                    self.candidate_unit_sha if event=="CANDIDATE_STARTED"
                    else self.original_unit_sha), "CYCLE_UNIT_INVERSE")
        if event in ("ADMIN_ACCEPTED","ORDINARY_ACCEPTED"):
            expected="admin" if event=="ADMIN_ACCEPTED" else "ordinary"
            require(evidence.get("role")==expected
                    and evidence.get("session_existing") is True
                    and evidence.get("registered_new_user") is False
                    and evidence.get("steam_auth_boundary_unchanged") is True,
                    "SESSION_ROLE_OR_REGISTRATION")
        if event=="PUBLIC_NONFINANCIAL_ACCEPTED":
            require(evidence.get("checks_passed")==sorted(ALLOWED_FEATURES)
                    and evidence.get("finance_api_status")==503
                    and evidence.get("nft_finance_ports_closed") is True,
                    "PUBLIC_ACCEPTANCE_INCOMPLETE")
        if event=="ROLLBACK_VERIFIED":
            require(evidence.get("original_3032_sha256")==self.original_unit_sha
                    and evidence.get("original_3030_unchanged") is True
                    and evidence.get("finance_unchanged") is True,
                    "ROLLBACK_INVERSE_INCOMPLETE")
        self.events.append({"event":event,"evidence":evidence})
        return len(self.events)

    def can_repeat(self):
        return bool(self.events and self.events[-1]["event"]=="ROLLBACK_VERIFIED")

    def plan_fault_recovery(self):
        require(self.events and self.events[-1]["event"] in ALLOW_FAIL_RECOVERY,
                "NO_POST_STOP_RECOVERY_SCOPE")
        return {"status":"HOLD_SIGNED_ROLLBACK_REQUIRED",
                "expected_original_unit_sha256":self.original_unit_sha,
                "public_nginx_reroute_forbidden":True,
                "recovery_requires_independent_b_controller":True}

def allow_second_cycle(first, second):
    require(first.can_repeat(), "FIRST_CYCLE_NOT_ROLLED_BACK")
    require(first.nonce_sha256!=second.nonce_sha256,
            "SECOND_CYCLE_MUST_HAVE_NEW_ONE_USE_NONCE")
    require(first.original_unit_sha==second.original_unit_sha,
            "ORIGINAL_UNIT_CHANGED")
    return {"status":"PASS_SECOND_INDEPENDENT_CYCLE_PLANNED",
            "actual_second_release_executed":False}

if __name__=="__main__":
    print("HOLD:ARTIFACT_CONTRACT_NOT_PUBLIC_RELEASE_RUNNER")
    sys.exit(3)
