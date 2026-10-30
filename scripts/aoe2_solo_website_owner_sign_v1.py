#!/usr/bin/env python3
"""Sign ONE fresh owner-approved website-only phase using an EXISTING Mac RSA key.

Never creates private keys, never moves funds, never issues a root nonce,
never stages or activates. The root-issued challenge must be authenticated
from pinned HEL1 SSH and match genuine live data. Default is HOLD.
"""
from __future__ import annotations
import argparse, base64, json, os, pathlib, stat, subprocess, sys, tempfile
from datetime import datetime, timezone
from aoe2_solo_website_admission import (
    POLICY, DOMAIN, TRAINS, OWNER_PUBLIC, OPENSSL,
    canonical, digest, Hold, verify_inputs, verify_owner_signature,
    parse, reviewed_scope
)
from aoe2_solo_website_host_observer import read_authenticated_hel1
from aoe2_solo_website_engine_source import validate_candidate

def need(ok,msg):
    if not ok: raise Hold("SOLO_OWNER_SIGNING_HOLD: "+msg)

def load_file(path):
    need(path is not None and path.is_absolute() and not path.is_symlink() and
         path.is_file() and path.stat().st_size<=262144,"missing owner evidence file")
    return parse(path.read_bytes())

def existing_owner_key(key):
    need(key.is_absolute() and not key.is_symlink() and key.is_file(),
         "existing owner private key path missing")
    info=key.stat()
    need(info.st_uid==os.geteuid() and stat.S_IMODE(info.st_mode)&0o077==0
         and 0<info.st_size<65536,
         "private key must remain existing owner-held 0600/0400")
    return key

def sign_payload(payload,key):
    existing_owner_key(key)
    with tempfile.TemporaryDirectory(prefix="aoe2-solo-owner-sign-") as t:
        data=pathlib.Path(t)/"payload"
        sig=pathlib.Path(t)/"signature"
        data.write_bytes(DOMAIN+canonical(payload))
        result=subprocess.run(
            [OPENSSL,"dgst","-sha256","-sign",str(key),
             "-out",str(sig),str(data)],
            stdin=None,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            timeout=30,check=False)
        need(result.returncode==0 and sig.is_file(),
             "existing owner key could not sign exact new phase")
        out=base64.b64encode(sig.read_bytes()).decode("ascii")
    return out

def prepare(phase,candidate,challenge,observation,manifest_raw,gate_raw,
            prior=None,stage_receipt=None):
    sha=candidate
    need(phase in ("PRE_STAGE","PRE_ACTIVATE"),"unknown phase")
    need(sha in [entry[0] for entry in TRAINS.values()],"candidate not allowed")
    train=next(n for n,v in TRAINS.items() if v[0]==sha)
    manifest=parse(manifest_raw);gate=parse(gate_raw)
    for name in ("attempt_id","nonce","lease_id","issued_at","expires_at"):
        need(type(challenge.get(name))is str,"root challenge missing "+name)
    need(challenge.get("policy")==POLICY and challenge.get("phase")==phase and
         challenge.get("candidate_sha")==sha,
         "root-issued challenge belongs to another release")
    need(type(observation)is dict and observation.get("host")==
         "ubuntu-4gb-hel1-11","native HEL1 observation absent")
    signed_prior=None
    stage_sha=build=None
    prior_hash=None
    if phase=="PRE_ACTIVATE":
        need(type(prior)is dict and type(stage_receipt)is dict,
             "activation requires real old signed owner packet and stage")
        signed_prior=prior
        stage_sha=digest(canonical(stage_receipt))
        build=stage_receipt.get("staged_build_id")
        prior_hash=digest(canonical(prior))
        need(stage_sha==observation.get("durable_stage_receipt_sha256") and
             build==observation.get("staged_build_id"),
             "local stage does not match HEL1 immutable receipt")
    else:
        need(prior is None and stage_receipt is None,
             "PRE_STAGE may not be reused for activation")
    review=pathlib.Path("/private/etc/aoe2war/solo-owner-website-v1/source-reviews")/(sha+".json")
    need(review.is_file() and not review.is_symlink(),
         "real independently accepted source closure not enrolled")
    review_digest=digest(review.read_bytes())
    reviewed_scope(sha,manifest,review_digest)
    p={
      "phase":phase,"train":train,"candidate_sha":sha,
      "previous_sha":TRAINS[train][1],
      "attempt_id":challenge["attempt_id"],"nonce":challenge["nonce"],
      "lease_id":challenge["lease_id"],
      "issued_at":challenge["issued_at"],"expires_at":challenge["expires_at"],
      "manifest_sha256":digest(manifest_raw),
      "gate_sha256":digest(gate_raw),
      "scope_sha256":manifest.get("scope_sha256"),
      "active_build_id":observation.get("build_id"),
      "rollback_build_id":observation.get("rollback_build_id"),
      "host_observation_sha256":digest(canonical(observation)),
      "finance_fingerprint_sha256":observation.get("finance_fingerprint_sha256"),
      "financial_movement_authorized":False,
      "custody_authorized":False,"migration_paths":[],
      "scope_review_sha256":review_digest,
      "stage_receipt_sha256":stage_sha,
      "staged_build_id":build,
      "pre_stage_packet_sha256":prior_hash,
    }
    return p

def write_once(value,attempt,phase):
    folder=pathlib.Path.home()/".aoe2war-release"/"solo-owner-packets-v1"
    folder.mkdir(mode=0o700,parents=True,exist_ok=True)
    need(not folder.is_symlink() and
         folder.stat().st_uid==os.geteuid() and
         stat.S_IMODE(folder.stat().st_mode)==0o700,
         "owner packet folder not private")
    path=folder/(attempt+"-"+phase+".json")
    data=canonical(value)
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as handle:
        handle.write(data);handle.flush();os.fsync(handle.fileno())
    d=os.open(folder,os.O_RDONLY)
    try:os.fsync(d)
    finally:os.close(d)
    return path

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("phase",choices=["PRE_STAGE","PRE_ACTIVATE"])
    ap.add_argument("--candidate",type=pathlib.Path,required=True)
    ap.add_argument("--owner-private-key",type=pathlib.Path,required=True)
    ap.add_argument("--prior-owner-packet",type=pathlib.Path)
    ap.add_argument("--stage-receipt",type=pathlib.Path)
    args=ap.parse_args()
    need(sys.platform=="darwin" and os.uname().machine=="arm64",
         "sign only on real M1 owner Mac")
    root,sha=validate_candidate(args.candidate)
    sys.path.insert(0,str(root/"scripts"))
    from aoe2_release_ship import load_manifest,gate_integrity
    manifest_path,manifest,manifest_sha=load_manifest(sha)
    gate_path,gate_sha=gate_integrity(manifest)
    obs,challenge=read_authenticated_hel1()
    need(challenge.get("phase")==args.phase and
         challenge.get("candidate_sha")==sha,
         "HEL1 does not have one exact fresh signed phase request")
    prior=load_file(args.prior_owner_packet) if args.prior_owner_packet else None
    stage=load_file(args.stage_receipt) if args.stage_receipt else None
    payload=prepare(args.phase,sha,challenge,obs,
                    manifest_path.read_bytes(),gate_path.read_bytes(),
                    prior=prior,stage_receipt=stage)
    # Preview exactly what the owner is approving. Approval is per phase
    # and candidate; never default YES or request a financial transfer.
    print("OWNER WEBSITE ONLY: "+args.phase)
    print("CANDIDATE="+sha)
    print("ATTEMPT="+payload["attempt_id"])
    print("HEL1_BUILD_ID="+str(payload["active_build_id"]))
    print("WOLO/CUSTODY/DB AUTHORIZATION=FALSE")
    print("CHALLENGE_EXPIRES="+payload["expires_at"])
    expected="AUTHORIZE "+args.phase+" "+sha[:12]
    print("To approve THIS PHASE type exactly: "+expected)
    entered=input("Owner approval: ").strip()
    need(entered==expected,"operator refused this separate phase")
    signature=sign_payload(payload,args.owner_private_key)
    signed={"schema":1,"policy":POLICY,
            "payload":payload,"signature_base64":signature}
    verify_owner_signature(signed)
    verified=verify_inputs(signed,manifest_path.read_bytes(),
        gate_path.read_bytes(),previous_stage=prior,stage_receipt=stage)
    need(verified.get("status")=="INPUTS_VERIFIED_ONLY_NOT_AUTHORIZED",
         "new phase signed but not authentic")
    output=write_once(signed,payload["attempt_id"],args.phase)
    print(json.dumps({"status":"REAL_OWNER_PHASE_SIGNED_NOT_DISPATCHED",
        "phase":args.phase,"candidate_sha":sha,
        "packet_path":str(output),"packet_sha256":digest(canonical(signed)),
        "financial_release_authorized":False},indent=2))
if __name__=="__main__":
    try:main()
    except (Hold,ValueError,OSError,EOFError,subprocess.TimeoutExpired,
            subprocess.SubprocessError,KeyError,TypeError)as exc:
        print("HOLD: "+str(exc),file=sys.stderr)
        raise SystemExit(2)
