#!/usr/bin/env python3
"""Separate, strict solo-owner website phase driver (frozen W1 is untouched).

This is a REAL stage/activate adapter to the preserved W1 remote script and
receipt logic; no normal source release command or old signer stub is used.
It may dispatch ONLY under pinned actual HEL1 root journal, authentic owner
RSA signature, continuous original UID1000 release.lock and all live gates.
Any unknown evidence/SSH loss consumes or HOLDS, never redispatches.
"""
from __future__ import annotations
import argparse, base64, fcntl, hashlib, importlib.util, json, os
from pathlib import Path
import shlex, socket, subprocess, sys, time

ROOT=Path(__file__).resolve().parents[1]
HERE=Path(__file__).resolve().parent
W1="b46a51f1592c9f296839924ae55e722618b10d35"
POST="fa5c350b35cba7ace8d4515a7ad52ba4e1534295"
POLICY="aoe2war.solo-owner.website.admission.v1"
HOST="root@157.180.114.124"
LOCK=Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
ROOT_PHASE="/usr/local/libexec/aoe2war/solo-v1-root-phase"

class Hold(RuntimeError):pass
def check(ok,msg):
    if not ok:raise Hold("SOLO_WEBSITE_ENGINE_HOLD: "+msg)
def load_json(path):
    check(path.is_absolute() and path.is_file() and not path.is_symlink(),
          "absolute unlinked owner packet required")
    check(path.stat().st_size<=262144,"packet too large")
    def unique(pairs):
        result={}
        for k,v in pairs:
            check(k not in result,"duplicate JSON property")
            result[k]=v
        return result
    return json.loads(path.read_bytes(),object_pairs_hook=unique)
def exact_candidate(root):
    from aoe2_solo_website_engine_source import validate_candidate
    check(sys.platform=="darwin" and os.uname().machine=="arm64",
          "operator must use owner M1 Mac")
    return validate_candidate(root)
def fresh_import(candidate, name, source=None):
    scripts=str(candidate/"scripts")
    if scripts not in sys.path:sys.path.insert(0,scripts)
    if source is None:
        return __import__(name)
    spec=importlib.util.spec_from_file_location(name,HERE/source)
    check(spec is not None and spec.loader is not None,"external adapter not installed")
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module
def engine_context(candidate):
    os.environ["AOE2_SOLO_WEBSITE_CANDIDATE_ROOT"]=str(candidate)
    release=fresh_import(candidate,"aoe2_release")
    ship=fresh_import(candidate,"aoe2_release_ship")
    stage=fresh_import(candidate,"aoe2_solo_website_stage_engine",
                       "aoe2_solo_website_stage_engine.py")
    activation=fresh_import(candidate,"aoe2_solo_website_activation_engine",
                       "aoe2_solo_website_activation_engine.py")
    gate=fresh_import(candidate,"aoe2_release_gate")
    check(all(getattr(v,"ROOT",None)==candidate for v in
              (release,ship,stage,activation,gate)),
          "mixed source controller imports")
    return release,ship,stage,activation,gate
def root_issue(phase,target,attempt,lease,stage_sha):
    args=["/usr/bin/ssh","-T","-n","-o","BatchMode=yes",
          "-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=8",
          HOST,"python3 "+shlex.quote(ROOT_PHASE)+" issue "+
          " ".join(shlex.quote(x)for x in
                   ([phase,target]if phase=="PRE_STAGE" else
                    [phase,target,attempt,lease,stage_sha]))]
    p=subprocess.run(args,capture_output=True,text=True,timeout=30)
    check(p.returncode==0,"no real root HEL1 issued phase challenge: "+p.stderr[-500:])
    item=json.loads(p.stdout)
    check(item.get("status")=="ROOT_ISSUED_NOT_AUTHORIZED",
          "HEL1 challenge not issued")
    return item
def assert_owner_packet_shape(signed,phase,sha):
    check(type(signed) is dict and type(signed.get("payload")) is dict,
          "signed owner packet not provided")
    payload=signed["payload"]
    check(payload.get("phase")==phase and payload.get("candidate_sha")==sha and
          signed.get("policy")==POLICY,
          "owner phase or source mismatch")
def dispatch(phase,candidate,signed,receipt_path):
    from aoe2_solo_website_command_channel import command_lease
    from aoe2_solo_website_phase_authority import prove_consumed
    release,ship,stage,activation,gate=engine_context(candidate)
    data=release.collect()
    check(data["local"].get("head") in (W1,POST) and
          data["local"].get("dirty_count")==0,
          "candidate not exact clean release source")
    sha=data["local"]["head"]
    packet=signed["payload"]
    assert_owner_packet_shape(signed,phase,sha)
    manifest_path,manifest,manifest_sha=ship.load_manifest(sha)
    gate_path,gate_sha=ship.gate_integrity(manifest)
    check(manifest.get("migration_paths")==[],
          "website-only phase refuses database migrations")
    prior=None;stage_receipt=None
    if phase=="PRE_ACTIVATE":
        check(receipt_path is not None,"real stage receipt required")
        rp,stage_receipt,stage_sha,*_=ship.load_stage_receipt(str(receipt_path))
        check(stage_sha==packet["stage_receipt_sha256"],
              "local stage differs from signed owner SHA")
        # Authentic prior owner packet must be provided as a separate input.
        prev=os.getenv("AOE2_SOLO_PRE_STAGE_PACKET", "")
        check(bool(prev),"actual prior signed PRE_STAGE packet required")
        prior=load_json(Path(prev))
    # Mac local lock and original HEL1 lease are acquired once and preserved.
    local=candidate/".aoe2war-release"/"deploy.lock"
    check(local.parent.is_dir()and not local.is_symlink(),
          "operator local lock root missing")
    fd=os.open(local,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        holder=json.dumps({"policy":POLICY,"phase":phase,"sha":sha,
            "pid":os.getpid(),"attempt":packet["attempt_id"]},sort_keys=True)
        with command_lease(LOCK,holder,host=HOST) as runner:
            runner.assert_alive()
            # The verified owner packet is sent to a root phase helper UNDER
            # original lease FD200; no local one-use filesystem claim counts.
            encoded=base64.b64encode(json.dumps(
                signed,sort_keys=True,separators=(",",":")).encode()).decode()
            cmd="python3 "+shlex.quote(ROOT_PHASE)+" consume "+shlex.quote(encoded)
            answer=runner.run(cmd,timeout=20)
            check(answer.returncode==0,
                  "root declined owner-signed nonce, no deployment: "+
                  (answer.stderr or "")[-500:])
            cap=prove_consumed(phase,signed,runner.run,
                manifest_path.read_bytes(),gate_path.read_bytes(),
                stage_receipt=stage_receipt,prior_packet=prior)
            runner.assert_alive()
            if phase=="PRE_STAGE":
                result=stage.stage_release(data,json_output=True,
                    remote_runner=runner.run,signed_capability=cap)
            else:
                result=activation.activate_release(data,
                    stage_receipt=str(receipt_path),dry_run=False,
                    json_output=True,remote_runner=runner.run,
                    signed_capability=cap)
            runner.assert_alive()
            check(result==0,"protected remote phase not CERTIFIED; consumed, reconcile")
            # Do not silently call the next phase: separate owner consent.
            return {"status":"PROTECTED_ENGINE_RETURNED_REVIEW_NATIVE_RECEIPTS",
                "phase":phase,"candidate_sha":sha,"attempt_id":packet["attempt_id"],
                "financial_release_authorized":False,
                "must_verify_live_artifact_and_finance_before_complete":True}
    finally:
        os.close(fd)
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("mode",choices=["issue-stage","issue-activation","stage","activate"])
    ap.add_argument("--candidate",required=True,type=Path)
    ap.add_argument("--signed-packet",type=Path)
    ap.add_argument("--stage-receipt",type=Path)
    ap.add_argument("--attempt-id")
    ap.add_argument("--lease-id")
    ap.add_argument("--stage-sha256")
    a=ap.parse_args()
    candidate,sha=exact_candidate(a.candidate)
    if a.mode.startswith("issue-"):
        phase="PRE_STAGE"if a.mode=="issue-stage"else"PRE_ACTIVATE"
        x=root_issue(phase,sha,a.attempt_id,a.lease_id,a.stage_sha256)
    else:
        check(a.signed_packet is not None,"no explicit signed owner permit")
        phase="PRE_STAGE"if a.mode=="stage"else"PRE_ACTIVATE"
        x=dispatch(phase,candidate,load_json(a.signed_packet),a.stage_receipt)
    print(json.dumps(x,indent=2,sort_keys=True))
if __name__=="__main__":
    try:main()
    except (Hold,RuntimeError,OSError,ValueError,KeyError,
            subprocess.TimeoutExpired,subprocess.SubprocessError)as e:
        print(json.dumps({"status":"HOLD","error":str(e),
            "financial_release_authorized":False,"redispatch_permitted":False}))
        raise SystemExit(2)
