#!/usr/bin/python3 -I
"""D R17: independent per-role source attestor; never a release controller.

Runs as the enrolled producer's NON-ROOT UID. An F/C-approved owner RSA intent
and separately reviewed collector are required. Private keys stay in their
own identity domain. Its output is UNADMITTED until C intake and F audit pass.
"""
from __future__ import annotations
import argparse
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys
import tempfile

ROLES=("doctor","recovery","finance","host","source","stage")
PHASES=("PRE_STAGE","PRE_ACTIVATE","POST_ACTIVATE","POST_ROLLBACK")
HEX40=re.compile(r"[0-9a-f]{40}\Z")
HEX64=re.compile(r"[0-9a-f]{64}\Z")
INTENT_DOMAIN=b"AOE2WAR.SOLO_WEBSITE.PRODUCER_INTENT.V1\n"
RECEIPT_DOMAIN=b"AOE2WAR.SOLO_WEBSITE.NATIVE_PRODUCER_RECEIPT.V1\n"
FROZEN_W1="b46a51f1592c9f296839924ae55e722618b10d35"
ROOT_PREISSUE_POLICY="aoe2war.solo-owner.website.admission.v1"
OWNER_RSA_SPKI="3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"
MANIFEST_ROOT=Path("/etc/aoe2war/solo-producer-v1")
MAX=262144
HOST="ubuntu-4gb-hel1-11"

class Hold(RuntimeError):
    pass

def need(value,reason):
    if not value: raise Hold("D_R17_SIGNER_HOLD:"+reason)

def canonical(obj):
    return json.dumps(obj,sort_keys=True,separators=(",",":"),
                      allow_nan=False,ensure_ascii=True).encode("ascii")

def digest(data):
    return hashlib.sha256(data).hexdigest()

def unique(pairs):
    d={}
    for k,v in pairs:
        need(k not in d,"DUPLICATE_JSON_PROPERTY")
        d[k]=v
    return d

def parse(raw):
    need(type(raw) is bytes and 0<len(raw)<=MAX,"INVALID_JSON_SIZE")
    try:
        obj=json.loads(raw,object_pairs_hook=unique,
            parse_constant=lambda x: (_ for _ in ()).throw(Hold("NONFINITE_JSON")))
    except (UnicodeError,ValueError,TypeError) as exc:
        raise Hold("INVALID_JSON_BYTES") from exc
    need(type(obj) is dict,"EXPECTED_JSON_OBJECT")
    return obj

def timestamp(value):
    need(type(value) is str and value.endswith("Z"),"UTC_REQUIRED")
    try: result=datetime.fromisoformat(value[:-1]+"+00:00")
    except ValueError as exc: raise Hold("INVALID_UTC_TIME") from exc
    need(result.tzinfo is not None and result.utcoffset()==timedelta(0),"NON_UTC")
    return result

def checked_file(path,owner,*,limit=MAX,mode=None,regular=True):
    """No symlink/path substitution, read only, exact inode/time stability."""
    need(path.is_absolute(),"RELATIVE_PATH")
    for parent in path.parents:
        st=parent.lstat()
        need(stat.S_ISDIR(st.st_mode) and st.st_uid in (0,owner) and
             not st.st_mode&0o022,"UNPROTECTED_ANCESTOR")
    before=path.lstat()
    need((stat.S_ISREG(before.st_mode) if regular else stat.S_ISDIR(before.st_mode)) and
         before.st_uid==owner and not before.st_mode&0o022 and
         (mode is None or stat.S_IMODE(before.st_mode)==mode) and
         0<before.st_size<=limit,"UNPROTECTED_FILE")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        a=os.fstat(fd)
        data=os.read(fd,limit+1)
        b=os.fstat(fd);c=path.lstat()
        identity=lambda s:(s.st_dev,s.st_ino,s.st_uid,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
        need(identity(before)==identity(a)==identity(b)==identity(c) and
             len(data)==before.st_size,"REPLACED_OR_INCOMPLETE_FILE")
        return data
    finally:os.close(fd)

def openssl(argv,*,stdin=None,timeout=8):
    try:
        p=subprocess.run(["/usr/bin/openssl",*argv],input=stdin,
                         capture_output=True,timeout=timeout)
    except (OSError,subprocess.TimeoutExpired) as exc:
        raise Hold("CRYPTO_TOOL_UNAVAILABLE") from exc
    need(p.returncode==0,"CRYPTO_VERIFY_FAILED")
    return p.stdout

def validate_manifest(manifest,role,uid,hostname):
    need(type(manifest) is dict and
         set(manifest)=={"schema","role","uid","origin_host","failure_domain_id",
                        "controller_sha","candidate_sha","owner_public_key_path",
                        "producer_public_key_path","private_key_path",
                        "public_spki_sha256","collector_path","collector_sha256",
                        "output_dir","authorities"} and
         manifest["schema"]=="aoe2war.solo.producer-enrollment.v1",
         "UNREVIEWED_ENROLLMENT_SCHEMA")
    need(role in ROLES and manifest["role"]==role and uid>0 and
         type(manifest["uid"]) is int and uid==manifest["uid"] and
         manifest["origin_host"]==hostname and
         type(manifest["candidate_sha"]) is str and
         bool(HEX40.fullmatch(manifest["candidate_sha"])) and
         manifest["candidate_sha"]!=FROZEN_W1 and
         type(manifest["controller_sha"]) is str and
         HEX40.fullmatch(manifest["controller_sha"]) and
         type(manifest["failure_domain_id"]) is str and
         8<=len(manifest["failure_domain_id"])<=128,
         "NOT_ENROLLED_IN_THIS_SOURCE_HOST_UID")
    authorities=manifest["authorities"]
    need(type(authorities) is dict and set(authorities)==set(ROLES),
         "SIX_DISTINCT_AUTHORITIES_MISSING")
    uids=[];fingerprints=[];domains=[]
    for name in ROLES:
        record=authorities[name]
        need(type(record) is dict and
             set(record)=={"uid","public_spki_sha256","failure_domain_id","origin_host"} and
             type(record["uid"]) is int and record["uid"]>0 and
             type(record["public_spki_sha256"]) is str and
             HEX64.fullmatch(record["public_spki_sha256"]) and
             type(record["failure_domain_id"]) is str and
             8<=len(record["failure_domain_id"])<=128 and
             type(record["origin_host"]) is str and record["origin_host"],
             "INVALID_AUTHORITY_ENROLLMENT")
        uids.append(record["uid"]);fingerprints.append(record["public_spki_sha256"])
        domains.append(record["failure_domain_id"])
    need(len(set(uids))==6 and len(set(fingerprints))==6 and
         len(set(domains))==6,"SHARED_UID_KEY_OR_FAILURE_DOMAIN")
    need(authorities[role]=={"uid":uid,
        "public_spki_sha256":manifest["public_spki_sha256"],
        "failure_domain_id":manifest["failure_domain_id"],
        "origin_host":hostname},"ROLE_AUTHORITY_NOT_SELF")
    for name in ("owner_public_key_path","producer_public_key_path",
                 "private_key_path","collector_path","output_dir"):
        need(type(manifest[name]) is str and
             Path(manifest[name]).is_absolute(),"INVALID_ENROLLMENT_PATH")
    for key in ("collector_sha256","public_spki_sha256"):
        need(type(manifest[key]) is str and bool(HEX64.fullmatch(manifest[key])),
             "UNPINNED_ENROLLMENT")
    return True

def verify_identity(manifest,uid):
    owner_pub=Path(manifest["owner_public_key_path"])
    pub=Path(manifest["producer_public_key_path"])
    key=Path(manifest["private_key_path"])
    collector=Path(manifest["collector_path"])
    # Root owns the pinned public keys and reviewed collector; producer owns
    # exclusively its private key. No key material is printed or exported.
    checked_file(owner_pub,0,limit=16384)
    checked_file(pub,0,limit=16384)
    checked_file(collector,0,limit=262144)
    # Do not read private-key bytes in Python. Prove inode/owner/mode and
    # delegate key access exclusively to the producer-owned OpenSSL process.
    need(key.is_absolute(),"RELATIVE_PRIVATE_KEY")
    for ancestor in key.parents:
        a=ancestor.lstat()
        need(stat.S_ISDIR(a.st_mode) and a.st_uid in (0,uid) and
             not a.st_mode&0o022,"UNPROTECTED_PRIVATE_KEY_ANCESTOR")
    st=key.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==uid and
         stat.S_IMODE(st.st_mode)==0o600 and 0<st.st_size<=16384,
         "PRIVATE_KEY_PERMISSION_OR_TYPE")
    owner_der=openssl(["pkey","-pubin","-in",str(owner_pub),"-outform","DER"])
    need(digest(owner_der)==OWNER_RSA_SPKI,"OWNER_RSA_KEY_MISMATCH")
    producer_der=openssl(["pkey","-pubin","-in",str(pub),"-outform","DER"])
    need(len(producer_der)==44 and producer_der.startswith(
         bytes.fromhex("302a300506032b6570032100")) and
         digest(producer_der)==manifest["public_spki_sha256"],
         "NOT_ENROLLED_ED25519_PUBLIC_IDENTITY")
    derived=openssl(["pkey","-in",str(key),"-pubout","-outform","DER"])
    need(derived==producer_der,"PRODUCER_PRIVATE_KEY_DOES_NOT_MATCH_ENROLLMENT")
    need(digest(checked_file(collector,0,limit=262144))==
         manifest["collector_sha256"],"COLLECTOR_BINARY_DRIFT")
    return True

def require_f_original_preissue(reply, payload, now):
    """Bind F's original-FD200 root reservation to separately signed intent.

    The root response is not signed. C MUST authenticate the original lease
    command channel independently; only the distinct owner RSA signature
    over preissue_sha256 binds this exact reservation to authorized collection.
    """
    need(type(reply) is dict and
         set(reply)=={"status","candidate_sha","phase","attempt_id",
                      "reserved_at","expires_at","preissue_sha256",
                      "owner_authorized","financial_release_authorized"} and
         reply["status"]=="ROOT_PREISSUED_NOT_AUTHORIZED" and
         reply["phase"]=="PRE_STAGE" and
         reply["owner_authorized"] is False and
         reply["financial_release_authorized"] is False,
         "ORIGINAL_FD200_PREISSUE_RESPONSE_REQUIRED")
    need(payload["phase"]=="PRE_STAGE" and
         all(reply[k]==payload[k] for k in ("candidate_sha","attempt_id","phase")) and
         type(reply["preissue_sha256"]) is str and
         bool(HEX64.fullmatch(reply["preissue_sha256"])) and
         reply["preissue_sha256"]==payload["preissue_sha256"],
         "PREISSUE_SCOPE_OR_OWNER_HASH_MISMATCH")
    reserved=timestamp(reply["reserved_at"])
    expiry=timestamp(reply["expires_at"])
    issued=timestamp(payload["issued_at"])
    need(expiry-reserved==timedelta(minutes=10) and
         reserved<=issued<=now<expiry and
         timestamp(payload["expires_at"])<=expiry,
         "ROOT_PREISSUE_EXPIRED_OR_WRONG_EPOCH")
    reservation={"schema":1,"policy":ROOT_PREISSUE_POLICY,
                 "status":"ROOT_PREISSUED_NOT_AUTHORIZED",
                 "phase":"PRE_STAGE","candidate_sha":reply["candidate_sha"],
                 "attempt_id":reply["attempt_id"],
                 "reserved_at":reply["reserved_at"],
                 "expires_at":reply["expires_at"],
                 "financial_release_authorized":False}
    need(digest(canonical(reservation))==reply["preissue_sha256"],
         "ROOT_PREISSUE_RESERVATION_HASH_MISMATCH")
    return True


def signed_intent(intent,owner_pub,manifest,now,preissue):
    need(type(intent) is dict and
         set(intent)=={"schema","payload","signature_base64"} and
         intent["schema"]=="aoe2war.solo.producer-intent.v1" and
         type(intent["payload"]) is dict,"MISSING_F_ORIGINAL_LEASE_INTENT")
    p=intent["payload"]
    need(set(p)=={"candidate_sha","controller_sha","attempt_id","phase","host",
                 "issued_at","expires_at","preissue_sha256",
                 "finance_authorized","release_authorized"},
         "INTENT_SHAPE")
    need(p["candidate_sha"]==manifest["candidate_sha"] and
         p["candidate_sha"]!=FROZEN_W1 and
         p["controller_sha"]==manifest["controller_sha"] and
         p["host"]==HOST and type(p["attempt_id"]) is str and
         HEX64.fullmatch(p["attempt_id"]) and p["phase"] in PHASES and
         p["finance_authorized"] is False and p["release_authorized"] is False,
         "FOREIGN_OR_UNSAFE_OWNER_INTENT")
    issued=timestamp(p["issued_at"]);expiry=timestamp(p["expires_at"])
    need(timedelta(0)<=now-issued<=timedelta(seconds=90) and
         now<=expiry and timedelta(0)<expiry-issued<=timedelta(seconds=90),
         "INTENT_EXPIRED_OR_FUTURE")
    try: sig=base64.b64decode(intent["signature_base64"],validate=True)
    except (ValueError,TypeError) as exc:raise Hold("INVALID_OWNER_INTENT_SIGNATURE") from exc
    need(64<=len(sig)<=8192,"BAD_OWNER_INTENT_SIGNATURE_SIZE")
    with tempfile.TemporaryDirectory(prefix="aoe2-d-intent-") as tmp:
        message=Path(tmp)/"message";signature=Path(tmp)/"signature"
        message.write_bytes(INTENT_DOMAIN+canonical(p))
        signature.write_bytes(sig)
        openssl(["dgst","-sha256","-verify",str(owner_pub),
                 "-signature",str(signature),str(message)])
    require_f_original_preissue(preissue,p,now)
    return p

def measure(collector,role,p,epoch,now):
    # Source pin is independently checked before invocation. Collector's
    # real evidence/side-effect contract is independently owned by B/C/E/F.
    try:
        res=subprocess.run([str(collector),"--collect",role,
            p["candidate_sha"],p["phase"],p["attempt_id"],p["issued_at"]],
            capture_output=True,timeout=12,check=False)
    except (OSError,subprocess.TimeoutExpired) as exc:
        raise Hold("REVIEWED_COLLECTOR_UNAVAILABLE") from exc
    need(res.returncode==0 and 0<len(res.stdout)<=MAX,
         "COLLECTOR_UNAVAILABLE_OR_UNRESOLVED")
    output=parse(res.stdout)
    need(set(output)=={"schema","class","collected_at","section","collector_sha256"} and
         output["schema"]=="aoe2war.solo.producer-measurement.v1" and
         output["class"]==role and type(output["section"]) is dict and
         output["collector_sha256"]==digest(checked_file(collector,0)),
         "SOURCE_COLLECTOR_REPORT_UNBOUND")
    captured=timestamp(output["collected_at"])
    # A collector runs AFTER the intent validation. Testing against its
    # pre-invocation time would reject every honest new measurement.
    finished=datetime.now(timezone.utc)
    need(abs((captured-epoch).total_seconds())<=15 and
         now-timedelta(seconds=1)<=captured<=finished+timedelta(seconds=1) and
         timedelta(0)<=finished-captured<=timedelta(seconds=90),
         "MEASUREMENT_TIME_OUTSIDE_SIGNED_EPOCH")
    section=output["section"]
    if role=="host":
        need(set(section)=={"mount","rollback"} and
             type(section["mount"]) is dict and type(section["rollback"]) is dict and
             section["mount"].get("rollback_sha256")==
             digest(canonical(section["rollback"])),"HOST_ROLLBACK_NOT_BOUND")
    # No synthetic healthy values are inserted or defaulted by this signer.
    need(len(canonical(section))<=MAX//2,"UNBOUNDED_EVIDENCE")
    return section

def make_signed_receipt(manifest,intent,section,*,now=None,signer=None):
    """Return only a genuine Ed25519 signature over the canonical F payload."""
    now=now or datetime.now(timezone.utc)
    p=intent["payload"]
    content=section["mount"] if manifest["role"]=="host" else section
    body={"producer":manifest["role"],"candidate_sha":p["candidate_sha"],
          "attempt_id":p["attempt_id"],"phase":p["phase"],"host":p["host"],
          "observed_at":p["issued_at"],"content_sha256":digest(canonical(content))}
    data=RECEIPT_DOMAIN+canonical(body)
    if signer is None:
        with tempfile.TemporaryDirectory(prefix="aoe2-d-sign-") as td:
            msg=Path(td)/"message";sig=Path(td)/"sig"
            msg.write_bytes(data)
            openssl(["pkeyutl","-sign","-inkey",manifest["private_key_path"],
                     "-rawin","-in",str(msg),"-out",str(sig)])
            raw=sig.read_bytes()
            need(len(raw)==64,"ED25519_SIGNATURE_NOT_64_BYTES")
            pub=Path(manifest["producer_public_key_path"])
            openssl(["pkeyutl","-verify","-pubin","-inkey",str(pub),"-rawin",
                     "-in",str(msg),"-sigfile",str(sig)])
    else:
        raw=signer(data)
    need(type(raw) is bytes and len(raw)==64,"INVALID_ED25519_SIGNATURE")
    return {"schema":"aoe2war.solo.native-issuer-input.v1",
            "class":manifest["role"],"section":section,
            "receipt":{"payload":body,"signature_base64":
                       base64.b64encode(raw).decode("ascii")}}

def write_once(destination,content,uid):
    root=destination.parent
    st=root.lstat()
    need(stat.S_ISDIR(st.st_mode) and st.st_uid==uid and
         stat.S_IMODE(st.st_mode)==0o700 and not root.is_symlink(),
         "UNPROTECTED_PRODUCER_SPOOL")
    need(not destination.is_symlink(),"SYMLINK_OUTPUT")
    # Pin parent inode during creation: no path-follow race or overwrite.
    directory_fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|
                         os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        live=os.fstat(directory_fd)
        need((live.st_dev,live.st_ino,live.st_uid)==
             (st.st_dev,st.st_ino,uid),"OUTPUT_PARENT_REPLACED")
        fd=os.open(destination.name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|
                   os.O_NOFOLLOW|os.O_CLOEXEC,0o600,dir_fd=directory_fd)
        with os.fdopen(fd,"wb") as out:
            out.write(content);out.flush();os.fsync(out.fileno())
        os.fsync(directory_fd)
    finally:os.close(directory_fd)

def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument("action",choices=("inspect","sign"))
    parser.add_argument("--role",choices=ROLES,required=True)
    parser.add_argument("--intent",required=True)
    parser.add_argument("--preissue",required=True,
        help="C-authenticated F original-FD200 root preissue response")
    args=parser.parse_args(argv)
    try:
        need(sys.platform=="linux" and os.geteuid()>0 and
             not any(k in os.environ for k in ("PYTHONPATH","PYTHONHOME")),
             "NONROOT_NATIVE_PRODUCER_ONLY")
        path=MANIFEST_ROOT/(args.role+".json")
        manifest=parse(checked_file(path,0,limit=32768))
        uid=os.geteuid()
        validate_manifest(manifest,args.role,uid,socket.gethostname().split(".")[0])
        verify_identity(manifest,uid)
        request=parse(checked_file(Path(args.intent),0,limit=16384))
        now=datetime.now(timezone.utc)
        reservation=parse(checked_file(Path(args.preissue),0,limit=16384))
        payload=signed_intent(request,Path(manifest["owner_public_key_path"]),
                              manifest,now,reservation)
        if args.action=="inspect":
            result={"status":"SIGNED_INTENT_VALID_UNADMITTED",
                    "producer":args.role,"intent_verified":True,
                    "receipt_issued":False,"release_authorized":False}
        else:
            section=measure(Path(manifest["collector_path"]),args.role,
                            payload,timestamp(payload["issued_at"]),now)
            envelope=make_signed_receipt(manifest,request,section,now=now)
            location=Path(manifest["output_dir"])
            destination=location/(payload["attempt_id"]+"-"+payload["phase"]+
                                  "-"+args.role+".json")
            need(destination.parent==location,"OUTPUT_SCOPE")
            write_once(destination,canonical(envelope)+b"\n",uid)
            result={"status":"PRODUCER_SIGNED_NOT_NATIVE_ADMITTED",
                    "role":args.role,"receipt_sha256":digest(canonical(envelope)+b"\n"),
                    "receipt_path":str(destination),"release_authorized":False,
                    "financial_authorized":False}
        print(canonical(result).decode("ascii"))
        return 0
    except (Hold,ValueError,TypeError,OSError,KeyError,subprocess.SubprocessError) as exc:
        print("HOLD:"+(str(exc) if isinstance(exc,Hold) else type(exc).__name__),
              file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
