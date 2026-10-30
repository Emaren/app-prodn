#!/usr/bin/env python3
"""Owner-signed phase capability, verified by HEL1 root under ORIGINAL lease.

This module never issues or fakes a consumed nonce. Phase dispatch requires
both live pinned HEL1 observation and a second root-journal proof through
the same held command channel as the protected W1 remote operation.
"""
from __future__ import annotations
import json, re, shlex
from dataclasses import dataclass
from aoe2_solo_website_admission import verify_inputs, canonical, digest, Hold

HEX64=re.compile(r"[a-f0-9]{64}\Z")
ROOT_HELPER="/usr/local/libexec/aoe2war/solo-v1-root-phase"
POLICY="aoe2war.solo-owner.website.admission.v1"

@dataclass(frozen=True)
class PhaseCapability:
    phase:str
    packet_sha256:str
    nonce:str
    attempt_id:str
    candidate_sha:str
    manifest_sha256:str
    gate_sha256:str
    active_build_id:str
    stage_sha256:str|None
    runner_id:int

def required(ok,why):
    if not ok: raise Hold("SOLO_WEBSITE_PHASE_HOLD: "+why)

def prove_consumed(phase, signed_packet, runner, manifest_raw, gate_raw, *,
                   stage_receipt=None, prior_packet=None):
    required(runner is not None and callable(runner),"missing original lease command channel")
    # All external evidence inputs are independently checked (never an
    # operator-supplied host callback or unverified gate status).
    receipt=verify_inputs(signed_packet,manifest_raw,gate_raw,
        previous_stage=prior_packet,stage_receipt=stage_receipt)
    required(receipt.get("status")=="INPUTS_VERIFIED_ONLY_NOT_AUTHORIZED" and
             receipt.get("phase")==phase,"owner signed exact phase not verified")
    p=signed_packet["payload"]
    packet_sha=digest(canonical(signed_packet))
    # The root helper checks authentic owner public-key signature, issued
    # challenge, real host observation, and atomic single-use consume. This
    # query MUST run via the original command channel holding release.lock.
    query="python3 "+shlex.quote(ROOT_HELPER)+" consumed-proof "+shlex.quote(
        p["attempt_id"])+" "+shlex.quote(phase)+" "+shlex.quote(packet_sha)
    result=runner(query,timeout=20)
    required(result.returncode==0,"no root consumed nonce proof")
    try: data=json.loads((result.stdout or "").strip())
    except (TypeError,ValueError) as exc:raise Hold("SOLO_WEBSITE_PHASE_HOLD: invalid root proof") from exc
    required(type(data) is dict and set(data)=={
        "policy","status","phase","attempt_id","nonce","lease_id",
        "candidate_sha","packet_sha256","host_observation_sha256",
        "manifest_sha256","gate_sha256","active_build_id",
        "stage_receipt_sha256"}, "root proof shape")
    required(data["policy"]==POLICY and data["status"]=="ROOT_CONSUMED_SINGLE_USE" and
        data["phase"]==phase and data["attempt_id"]==p["attempt_id"] and
        data["nonce"]==p["nonce"] and data["lease_id"]==p["lease_id"] and
        data["candidate_sha"]==p["candidate_sha"] and
        data["packet_sha256"]==packet_sha and
        data["host_observation_sha256"]==p["host_observation_sha256"] and
        data["manifest_sha256"]==p["manifest_sha256"] and
        data["gate_sha256"]==p["gate_sha256"] and
        data["active_build_id"]==p["active_build_id"] and
        data["stage_receipt_sha256"]==p["stage_receipt_sha256"],
        "root nonce proof unrelated to owner packet")
    return PhaseCapability(phase,packet_sha,p["nonce"],p["attempt_id"],
            p["candidate_sha"],p["manifest_sha256"],p["gate_sha256"],
            p["active_build_id"],p["stage_receipt_sha256"],
            id(getattr(runner, "__self__", runner)))

def require_phase_capability(phase,capability,remote_runner,*,manifest,
                             manifest_sha,gate_sha,active_build_id,
                             stage_receipt=None,stage_sha=None,dry_run=False):
    required(type(capability) is PhaseCapability and
             capability.phase==phase and
             capability.runner_id==id(getattr(remote_runner, "__self__", remote_runner)),
             "no exact current live lease capability")
    required(phase in ("PRE_STAGE","PRE_ACTIVATE") and not dry_run,
             "no stage/activate mutation without actual phase")
    required(capability.candidate_sha==manifest.get("release_sha") and
             capability.manifest_sha256==manifest_sha and
             capability.gate_sha256==gate_sha and
             capability.active_build_id==active_build_id,
             "source, gate or active BUILD_ID changed after owner admission")
    if phase=="PRE_ACTIVATE":
        required(type(stage_receipt) is dict and
                 capability.stage_sha256==stage_sha,"stage receipt changed")
    else:
        required(capability.stage_sha256 is None and
                 stage_receipt is None and not stage_sha,
                 "PRE_STAGE may not use later artifact")
    return True
