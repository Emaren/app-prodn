#!/usr/bin/env python3
"""Source-only C macOS DEV -> independent B Linux RELEASE artifact contract.

No build, install, shell, credentials or deployment operations. All evidence
objects are untrusted until independently fetched by B's privileged verifier.
V1 C 'runtime artifact' is intentionally NOT a release-grade path.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys

REPO="Emaren/app-prodn"
C_SCHEMA="aoe2war.c.uid650.macos-source-handoff.v2"
B_SCHEMA="aoe2war.b.linux-x86_64-node22-release-build.v2"
PIN_NODE_C="v24."
PIN_NODE_B="v22.22.0"
HEX40=re.compile(r"[0-9a-f]{40}\Z")
HEX64=re.compile(r"[0-9a-f]{64}\Z")
BUILD_ID=re.compile(r"[a-zA-Z0-9_-]{8,64}\Z")
RESTRICTED_FEATURES=frozenset({
 "kingdom_menu_original_order","managed_portrait_bytes",
 "canonical_traffic_131_points","featured_warriors_rotation",
 "authenticated_admin","authenticated_nonadmin","api_failclosed",
 "steam_session_no_new_registration",
})

class Hold(ValueError):pass
def need(ok,label):
    if not ok:raise Hold("HOLD:C_B_V2_"+label)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(obj):return json.dumps(obj,sort_keys=True,separators=(",",":")).encode()

def sha40(value):return type(value) is str and bool(HEX40.fullmatch(value))
def sha64(value):return type(value) is str and bool(HEX64.fullmatch(value))

def qualify_c_dev_source(c, *, git_tree_from_b, root_uid650_witness):
    """C supplies only a source snapshot; NO C-built runtime enters HEL1."""
    need(type(c) is dict and c.get("schema")==C_SCHEMA
         and c.get("repo")==REPO, "C_SOURCE_SCHEMA")
    need(sha40(c.get("commit")) and sha40(c.get("tree"))
         and c["tree"]==git_tree_from_b, "C_SOURCE_GIT_TREE")
    need(c.get("dev_os")=="darwin" and c.get("dev_arch")=="arm64"
         and type(c.get("node")) is str and c["node"].startswith(PIN_NODE_C),
         "C_MACOS_DEV_ONLY")
    need(c.get("artifact_class")=="SOURCE_ONLY_NOT_LINUX_RUNTIME"
         and c.get("root_deploy_authority") is False
         and c.get("financial_deploy_authority") is False,
         "C_NO_BUILD_OR_DEPLOY_AUTHORITY")
    need(sha64(c.get("lockfile_sha256"))
         and sha64(c.get("source_archive_sha256"))
         and type(c.get("source_archive_bytes")) is int
         and c["source_archive_bytes"]>0,"C_SOURCE_ARCHIVE")
    w=root_uid650_witness
    need(type(w) is dict and w.get("uid")==650 and w.get("gid")==650
         and w.get("source_commit")==c["commit"]
         and w.get("kernel_financial_denial") is True
         and w.get("private_recovery_denial") is True
         and w.get("uid501_automation_escape_closed") is True
         and w.get("macos_root_witness_verified_by_B") is True,
         "C_UID650_REAL_DENIAL_WITNESS")
    return {"status":"PASS_C_UID650_SOURCE_ONLY_CONTRACT",
            "commit":c["commit"],"tree":c["tree"],
            "lockfile_sha256":c["lockfile_sha256"],
            "release_runtime_authorized":False}

def qualify_b_linux_build(c, linux, *, independent_git_tree,
                          b_runner_witness, ci_exact_head,
                          independently_streamed_archive_sha,
                          independently_streamed_archive_bytes,
                          streamed_runtime_manifest_sha):
    """Trusted Linux CI may produce runtime; C ARM64 built bytes are forbidden.

    B must fetch GitHub runner/commit/CI and stream archived bytes separately:
    all inputs to this policy are injected, not claims of physical verification.
    """
    need(type(c) is dict and c.get("schema")==C_SCHEMA, "C_FIRST_REQUIRED")
    need(type(linux) is dict and linux.get("schema")==B_SCHEMA
         and linux.get("repo")==REPO, "B_BUILD_SCHEMA")
    need(linux.get("source_commit")==c.get("commit")
         and linux.get("source_tree")==c.get("tree")==independent_git_tree
         and sha40(independent_git_tree), "B_GIT_TREE")
    need(linux.get("lockfile_sha256")==c.get("lockfile_sha256"),
         "B_LOCKFILE_CHANGED")
    need(linux.get("builder")=="github-actions-ubuntu-24.04"
         and linux.get("os")=="linux"
         and linux.get("arch")=="x86_64"
         and linux.get("node")==PIN_NODE_B
         and linux.get("locked_dependency_install")=="yarn-frozen-lockfile"
         and linux.get("lockfile_name")=="yarn.lock"
         and linux.get("production_build") is True,
         "B_TRUSTED_LINUX_BUILD")
    need(linux.get("private_keys_embedded") is False
         and linux.get("finance_db_credentials_present") is False
         and linux.get("financial_write_capability") is False
         and linux.get("target_3032") is True,
         "B_NO_FINANCIAL_AUTHORITY")
    need(type(linux.get("run_id")) is int and linux["run_id"]>0
         and type(ci_exact_head) is dict
         and ci_exact_head.get("head_sha")==linux["source_commit"]
         and ci_exact_head.get("run_id")==linux["run_id"]
         and ci_exact_head.get("event") in ("push","workflow_dispatch","pull_request")
         and ci_exact_head.get("conclusion")=="success"
         and ci_exact_head.get("verified_by_B_via_GitHub_API") is True,
         "B_UNVERIFIED_EXACT_HEAD_CI")
    w=b_runner_witness
    need(type(w) is dict and w.get("run_id")==linux["run_id"]
         and w.get("os")=="linux" and w.get("arch")=="x86_64"
         and w.get("node")==PIN_NODE_B
         and w.get("checked_by_B_independently") is True,
         "B_UNVERIFIED_LINUX_RUNNER")
    archive=linux.get("runtime_archive")
    need(type(archive) is dict and archive.get("name")=="runtime.tar.gz"
         and sha64(archive.get("sha256"))
         and type(archive.get("bytes")) is int
         and archive["bytes"]>0
         and sha64(independently_streamed_archive_sha)
         and archive["sha256"]==independently_streamed_archive_sha
         and type(independently_streamed_archive_bytes) is int
         and archive["bytes"]==independently_streamed_archive_bytes,
         "B_STREAMED_RUNTIME_SHA_AND_SIZE")
    need(sha64(linux.get("runtime_manifest_sha256"))
         and linux["runtime_manifest_sha256"]==streamed_runtime_manifest_sha
         and type(linux.get("build_id")) is str
         and BUILD_ID.fullmatch(linux["build_id"]),
         "B_RUNTIME_INNER_MANIFEST_OR_BUILD_ID")
    need(linux.get("acceptance_features")==sorted(RESTRICTED_FEATURES),
         "B_ACCEPTANCE_MATRIX")
    return {"status":"PASS_LINUX_BUILD_SOURCE_AND_BYTES_CONTRACT_ONLY",
            "source_commit":linux["source_commit"],"source_tree":linux["source_tree"],
            "archive_sha256":archive["sha256"],"archive_bytes":archive["bytes"],
            "runtime_manifest_sha256":linux["runtime_manifest_sha256"],
            "build_id":linux["build_id"],"builder_run_id":linux["run_id"],
            "node":PIN_NODE_B,"os":"linux","arch":"x86_64",
            "can_install":False,"can_activate_3032":False,
            "finance_authorized":False}

def qualify_root_stage_b_only(stage, approved):
    need(type(stage) is dict and type(approved) is dict
         and approved.get("status")==
            "PASS_LINUX_BUILD_SOURCE_AND_BYTES_CONTRACT_ONLY",
         "NO_TRUSTED_LINUX_BUILD")
    need(stage.get("source_commit")==approved.get("source_commit")
         and stage.get("source_tree")==approved.get("source_tree")
         and stage.get("artifact_sha256")==approved.get("archive_sha256")
         and stage.get("manifest_sha256")==approved.get("runtime_manifest_sha256")
         and stage.get("build_id")==approved.get("build_id")
         and stage.get("trusted_linux_build_run_id")==approved.get("builder_run_id"),
         "STAGE_TO_LINUX_BUILD_DRIFT")
    need(stage.get("uid")==0 and stage.get("mode")==0o400
         and stage.get("nlink")==1 and stage.get("no_symlink_ancestors") is True
         and stage.get("stage0003_untouched") is True
         and stage.get("stage_slot") not in (None,"STAGE0003",""),
         "STAGE_ROOT_IMMUTABLE_AND_FROZEN_STAGE")
    return {"status":"PASS_B_ROOT_STAGE_LINUX_PROVENANCE_ONLY",
            "source":approved["source_commit"],"release_authority":False}

if __name__=="__main__":
    print("HOLD:C_DEV_SOURCE_IS_NOT_A_LINUX_RELEASE_ARTIFACT")
    sys.exit(3)
