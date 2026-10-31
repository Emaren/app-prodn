#!/usr/bin/env python3
"""R23 owner-root-SSH trust recovery V1: enroll INACTIVE public trust only.

This is a NEW independently reviewed source proposal, NOT old RSA permit,
not replacement of /etc/aoe2war/website-owner-v4/owner.pem, and NOT authority
to install the frozen 14 helpers, enroll SSH roles, or change live services.
Root-SSH proves *channel*, separately typed owner consent proves *intent*,
and a distinct owner's new private-key signature proves *key possession*.
"""
from __future__ import annotations
import argparse, base64, fcntl, hashlib, json, os, pathlib, re, socket
import stat, subprocess, sys, tempfile, uuid
from datetime import datetime, timedelta, timezone

HOST = "ubuntu-4gb-hel1-11"
OLD = "3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"
LOCK = pathlib.Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
LOCK_ID = (2064,6185747,1000,0o644)
OLD_PUB = pathlib.Path("/etc/aoe2war/website-owner-v4/owner.pem")
OLD_CONFIG = pathlib.Path("/etc/aoe2war/solo-owner-website-v1")
OLD_APPROVAL = OLD_CONFIG/"root-helper-install-v2-approval.json"
OLD_RECEIPT = OLD_CONFIG/"root-helper-install-v2-receipt.json"
ROOT_NEW = pathlib.Path("/etc/aoe2war/solo-owner-recovery-v1")
AUDIT_PARENT = pathlib.Path("/var/lib/aoe2war-owner-rotations")
DOM = b"AOE2WAR.R23.ROOT_SSH.TRUST_RECOVERY.ENROLL_INACTIVE.V1\n"
SCHEMA = "aoe2war.root-ssh-trust-recovery.enroll-inactive.v1"
MAX_ENVELOPE = 16384

class Hold(Exception): pass
def need(x,why):
    if not x: raise Hold(why)
def canon(x): return json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode("ascii")
def sha(x): return hashlib.sha256(x).hexdigest()
def no_dupes(pairs):
    result={}
    for key,val in pairs:
        need(key not in result,"DUPLICATE_JSON_FIELD")
        result[key]=val
    return result
def parse(data):
    return json.loads(data,object_pairs_hook=no_dupes,
                      parse_constant=lambda v: (_ for _ in ()).throw(Hold("NONFINITE_JSON")))
def run(args, *, data=None, timeout=20):
    p=subprocess.run(args,input=data,capture_output=True,timeout=timeout)
    need(p.returncode==0,"CRYPTO_OR_TRANSPORT_FAILED:"+pathlib.Path(args[0]).name)
    return p.stdout
def public_spki(pem):
    need(0<len(pem)<=2048 and pem.startswith(b"-----BEGIN PUBLIC KEY-----"),"NEW_PUBLIC_PEM_FORMAT")
    with tempfile.TemporaryDirectory(prefix="r23-public-") as td:
        path=pathlib.Path(td)/"new.pem";path.write_bytes(pem)
        info=run(["/usr/bin/openssl","pkey","-pubin","-in",str(path),"-text_pub","-noout"])
        need(b"Public-Key: (3072 bit)" in info and b"Modulus:" in info,
             "NEW_RSA_3072_KEY_REQUIRED")
        return sha(run(["/usr/bin/openssl","pkey","-pubin","-in",str(path),
                        "-outform","DER"]))
def verify_possession(pem,body,signature):
    with tempfile.TemporaryDirectory(prefix="r23-verify-") as td:
        d=pathlib.Path(td)
        (d/"pub").write_bytes(pem)
        (d/"msg").write_bytes(DOM+canon(body))
        (d/"sig").write_bytes(signature)
        run(["/usr/bin/openssl","dgst","-sha256","-verify",str(d/"pub"),
             "-signature",str(d/"sig"),str(d/"msg")])
def protected_dir(p):
    while True:
        st=os.lstat(p)
        need(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,
             "ROOT_PROTECTED_DIR_INVALID:"+str(p))
        if p==pathlib.Path("/"):return
        p=p.parent
def protected_file(p,maxbytes=16384):
    protected_dir(p.parent)
    st=os.lstat(p)
    need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022
         and 0<st.st_size<=maxbytes,"ROOT_PROTECTED_FILE_INVALID:"+str(p))
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        before=os.fstat(fd);raw=os.read(fd,maxbytes+1);after=os.fstat(fd)
        need(len(raw)==before.st_size and
             (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==
             (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns),
             "ROOT_INPUT_CHANGED")
        return raw
    finally:os.close(fd)
def write_once(path,data,mode=0o400):
    protected_dir(path.parent)
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,"wb") as handle:
        handle.write(data);handle.flush();os.fsync(handle.fileno())
def sync_dir(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
def lock_shape():
    info=os.lstat(LOCK)
    need(stat.S_ISREG(info.st_mode) and
         (info.st_dev,info.st_ino,info.st_uid,stat.S_IMODE(info.st_mode))==LOCK_ID,
         "ORIGINAL_RELEASE_LOCK_DRIFT")
def original_shape():
    need(sys.platform.startswith("linux") and socket.gethostname()==HOST and os.geteuid()==0,
         "ONLY_ORIGINAL_HEL1_ROOT")
    protected_dir(OLD_CONFIG);protected_dir(AUDIT_PARENT)
    need(not OLD_APPROVAL.exists() and not OLD_APPROVAL.is_symlink()
         and not OLD_RECEIPT.exists() and not OLD_RECEIPT.is_symlink(),
         "FROZEN_ROOT_INSTALL_ALREADY_STARTED")
    lock_shape()
    need(public_spki(protected_file(OLD_PUB))==OLD,
         "ORIGINAL_RSA_ROOT_PUBLIC_PIN_CHANGED")
def validate_envelope(raw, operation="ENROLL_INACTIVE"):
    need(0<len(raw)<=MAX_ENVELOPE,"ENVELOPE_LENGTH")
    e=parse(raw)
    need(type(e)==dict and set(e)=={"schema","payload","new_public_base64","signature_base64"} and
         e["schema"]==SCHEMA,"RECOVERY_ENVELOPE_SCHEMA")
    b=e["payload"]
    need(type(b)==dict and set(b)=={"operation","host","old_rsa_spki","new_rsa_spki",
          "nonce","issued_at","expires_at","target_audit_id"},"RECOVERY_PAYLOAD_SCHEMA")
    need(b["operation"]==operation and b["host"]==HOST and b["old_rsa_spki"]==OLD,
         "RECOVERY_NOT_NEW_SOURCE_OR_WRONG_HOST")
    need(type(b["nonce"])==str and bool(re.fullmatch("[0-9a-f]{32}",b["nonce"])),
         "RECOVERY_NONCE")
    need(type(b["target_audit_id"])==str and
         (b["target_audit_id"]=="" if operation=="ENROLL_INACTIVE" else
          bool(re.fullmatch(r"r23-v1-[0-9a-f]{32}",b["target_audit_id"]))),
         "RECOVERY_TARGET_AUDIT_SCOPE")
    def utc(x):
        need(type(x)==str and x.endswith("Z"),"RECOVERY_TIMESTAMP")
        return datetime.fromisoformat(x[:-1]+"+00:00")
    start,end=utc(b["issued_at"]),utc(b["expires_at"])
    now=datetime.now(timezone.utc)
    need(timedelta(0)<end-start<=timedelta(minutes=5) and start<=now<=end,
         "RECOVERY_ENVELOPE_EXPIRED")
    try:
        pem=base64.b64decode(e["new_public_base64"],validate=True)
        sig=base64.b64decode(e["signature_base64"],validate=True)
    except Exception as err:raise Hold("RECOVERY_BASE64_INVALID") from err
    pub_id=public_spki(pem)
    need(pub_id==b["new_rsa_spki"] and pub_id!=OLD,
         "RECOVERY_NEW_RSA_PUBLIC_IDENTITY")
    verify_possession(pem,b,sig)
    return b,pem,pub_id
def do_enroll(encoded):
    original_shape()
    try:raw=base64.b64decode(encoded,validate=True)
    except ValueError as exc:raise Hold("RECOVERY_ENVELOPE_BASE64") from exc
    b,pem,pub_id=validate_envelope(raw)
    # Nothing can alter the original RSA public verifier / controller.
    need(not ROOT_NEW.exists() and not ROOT_NEW.is_symlink(),
         "RECOVERY_ALREADY_ATTEMPTED_OR_PARTIAL")
    aid="r23-v1-"+b["nonce"]
    audit=AUDIT_PARENT/aid
    need(not audit.exists() and not audit.is_symlink(),"RECOVERY_NONCE_REPLAY")
    fd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        fst=os.fstat(fd)
        need((fst.st_dev,fst.st_ino,fst.st_uid,stat.S_IMODE(fst.st_mode))==LOCK_ID,
             "RELEASE_LOCK_FD_DRIFT")
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as exc:raise Hold("LIVE_RELEASE_LOCK_HELD") from exc
        original_shape()
        # Create immutable intent FIRST: crash/replay is HOLD, never auto-retry.
        os.mkdir(audit,0o700);protected_dir(audit)
        write_once(audit/"intent.json",canon({"schema":SCHEMA,"payload":b,
            "old_public_sha256":sha(protected_file(OLD_PUB)),
            "new_public_sha256":sha(pem),"scope":"INACTIVE_ONLY",
            "old_controller_mutated":False,"financial_mutated":False})+b"\n")
        write_once(audit/"new-owner-public.pem",pem)
        sync_dir(audit);sync_dir(AUDIT_PARENT)
        os.mkdir(ROOT_NEW,0o700);protected_dir(ROOT_NEW)
        write_once(ROOT_NEW/"new-owner-public.pem",pem)
        write_once(ROOT_NEW/"new-owner-public.spki.sha256",(pub_id+"\n").encode())
        write_once(ROOT_NEW/"enrollment.json",canon({"audit_id":aid,
            "new_rsa_spki":pub_id,"intent_sha256":sha(protected_file(audit/"intent.json")),
            "status":"INACTIVE_ONLY"})+b"\n")
        sync_dir(ROOT_NEW)
        # Finished receipt is a separate one-use durable commit. An incomplete
        # directory is a forensic HOLD, not a legitimate committed recovery.
        original_shape()
        write_once(audit/"complete.json",canon({"status":"INACTIVE_RECOVERY_PUBLIC_ENROLLED_V1",
            "new_spki":pub_id,"intent_sha256":sha(protected_file(audit/"intent.json")),
            "public_sha256":sha(pem),"old_rsa_key_still_pinned":True,
            "old_controller_changed":False,"helper_install_authorized":False,
            "stage_or_activation_authorized":False})+b"\n")
        sync_dir(audit);sync_dir(AUDIT_PARENT)
        print("PASS: R23_INACTIVE_PUBLIC_TRUST_ENROLLED; NO_CONTROLLER_OR_HELPER_AUTHORITY")
        print("AUDIT_ID="+aid)
        print("NEW_PUBLIC_SPKI_SHA256="+pub_id)
        return 0
    finally:
        os.close(fd)

def do_abort(encoded):
    original_shape()
    try:raw=base64.b64decode(encoded,validate=True)
    except ValueError as exc:raise Hold("ABORT_ENVELOPE_BASE64") from exc
    b,pem,pub_id=validate_envelope(raw,operation="ABORT_INACTIVE")
    protected_dir(ROOT_NEW)
    record=parse(protected_file(ROOT_NEW/"enrollment.json"))
    need(record.get("audit_id")==b["target_audit_id"] and
         record.get("new_rsa_spki")==pub_id and record.get("status")=="INACTIVE_ONLY",
         "ABORT_ENROLLMENT_IDENTITY")
    need(protected_file(ROOT_NEW/"new-owner-public.pem")==pem,
         "ABORT_PUBLIC_BYTES_DIFFER")
    audit=AUDIT_PARENT/b["target_audit_id"];protected_dir(audit)
    complete=parse(protected_file(audit/"complete.json"))
    need(complete.get("new_spki")==pub_id and
         complete.get("status")=="INACTIVE_RECOVERY_PUBLIC_ENROLLED_V1",
         "ABORT_ORIGINAL_COMMIT_INVALID")
    need(not (ROOT_NEW/"aborted.json").exists() and
         not (audit/"aborted.json").exists(),"ABORT_ALREADY_EXECUTED_OR_PARTIAL")
    fd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        a=os.fstat(fd)
        need((a.st_dev,a.st_ino,a.st_uid,stat.S_IMODE(a.st_mode))==LOCK_ID,
             "ABORT_LOCK_IDENTITY")
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as exc:raise Hold("ABORT_RELEASE_LEASE_BUSY") from exc
        original_shape()
        # Kill the new inactive authority without deleting root-owned proof.
        # One-use abort marker is checked by all future source consumers.
        marker=canon({"status":"INACTIVE_RECOVERY_ABORTED_V1",
            "audit_id":b["target_audit_id"],"new_spki":pub_id,
            "new_controller_authority":False,"old_trust_unchanged":True,
            "owner_abort_intent_sha256":sha(DOM+canon(b))})+b"\n"
        write_once(ROOT_NEW/"aborted.json",marker)
        sync_dir(ROOT_NEW)
        write_once(audit/"aborted.json",marker)
        sync_dir(audit);sync_dir(AUDIT_PARENT)
        print("PASS: R23_INACTIVE_RECOVERY_ABORTED; IMMUTABLE_AUDIT_PRESERVED")
        return 0
    finally:os.close(fd)

def owner_main(private,public,source,source_sha,operation="ENROLL_INACTIVE",target=""):
    need(sys.platform=="darwin" and os.getuid()!=0,"ORIGINAL_OWNER_MAC_REQUIRED")
    p=pathlib.Path(private).expanduser();pub=pathlib.Path(public).expanduser()
    for f in (p,pub):
        st=os.lstat(f)
        need(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and
             not st.st_mode&0o077,"OWNER_KEY_FILE_NOT_PRIVATE_OR_LINKED")
    pem=pub.read_bytes();new_id=public_spki(pem)
    now=datetime.now(timezone.utc)
    def iso(x):return x.isoformat(timespec="seconds").replace("+00:00","Z")
    need(operation in ("ENROLL_INACTIVE","ABORT_INACTIVE"),"OWNER_OPERATION_SCOPE")
    need(target=="" if operation=="ENROLL_INACTIVE" else
         bool(re.fullmatch(r"r23-v1-[0-9a-f]{32}",target)),
         "OWNER_TARGET_AUDIT_ID")
    b={"operation":operation,"host":HOST,"old_rsa_spki":OLD,
       "new_rsa_spki":new_id,"nonce":uuid.uuid4().hex,"issued_at":iso(now),
       "expires_at":iso(now+timedelta(minutes=5)),"target_audit_id":target}
    with tempfile.TemporaryDirectory(prefix="r23-owner-sign-") as td:
        path=pathlib.Path(td)/"intent"
        path.write_bytes(DOM+canon(b))
        with open("/dev/tty","rb",buffering=0) as tty:
            sig=subprocess.run(["/usr/bin/openssl","dgst","-sha256","-sign",str(p),
                                str(path)],stdin=tty,stdout=subprocess.PIPE,timeout=50,
                               check=True).stdout
    verify_possession(pem,b,sig)
    # This is NOT approval by the lost old RSA: authority is the existing root
    # SSH identity plus new-key custody proof plus a distinct human consent.
    phrase=("AUTHORIZE R23 INACTIVE ROOT TRUST " if operation=="ENROLL_INACTIVE"
            else "ABORT R23 INACTIVE ROOT TRUST "+target+" ")+new_id
    print("R23 "+operation+"; original root RSA/controller remain unchanged.")
    print("No right to install 14 helpers, modify finance, or activate W1_SAFE.")
    with open("/dev/tty","r") as tty,open("/dev/tty","w") as out:
        out.write("Type exactly "+phrase+": ");out.flush()
        need(tty.readline().strip()==phrase,"OWNER_EXPLICIT_CONSENT_DENIED")
    envelope={"schema":SCHEMA,"payload":b,
              "new_public_base64":base64.b64encode(pem).decode(),
              "signature_base64":base64.b64encode(sig).decode()}
    # Read the reviewed local source into SSH standard input: no root invocation
    # of a tony-writable script, no private material in transit.
    src=pathlib.Path(source)
    raw=src.read_bytes()
    need(len(raw)<=65536 and len(raw)>0 and
         bool(re.fullmatch("[0-9a-f]{64}",source_sha)) and sha(raw)==source_sha,
         "OWNER_REVIEWED_SOURCE_SHA256_DRIFT")
    encoded=base64.b64encode(canon(envelope)).decode("ascii")
    cmd=["/usr/bin/ssh","-T","-o","BatchMode=yes",
         "-o","StrictHostKeyChecking=yes","-o","NumberOfPasswordPrompts=0",
         "-o","ConnectTimeout=10","root@hel1",
         "/usr/bin/python3","-I","-B","-",
         ("--root-enroll" if operation=="ENROLL_INACTIVE" else "--root-abort"),
         encoded]
    result=subprocess.run(cmd,input=raw,timeout=60,capture_output=True)
    need(result.returncode==0,"REMOTE_RECOVERY_FAILED_OR_UNCERTAIN_NO_RETRY")
    sys.stdout.write(result.stdout.decode(errors="replace"))
    expected=(b"PASS: R23_INACTIVE_PUBLIC_TRUST_ENROLLED" if operation=="ENROLL_INACTIVE"
              else b"PASS: R23_INACTIVE_RECOVERY_ABORTED")
    need(expected in result.stdout,"REMOTE_COMMIT_UNVERIFIED")
    return 0

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    g=ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--owner-enroll",action="store_true")
    g.add_argument("--root-enroll",action="store_true")
    g.add_argument("--owner-abort",action="store_true")
    g.add_argument("--root-abort",action="store_true")
    ap.add_argument("--private");ap.add_argument("--public")
    ap.add_argument("--reviewed-source");ap.add_argument("--reviewed-source-sha256")
    ap.add_argument("--recovery-id")
    ap.add_argument("envelope",nargs="?")
    a=ap.parse_args()
    if a.root_enroll or a.root_abort:
        need(a.envelope is not None and not a.private and not a.public and
             not a.recovery_id,"ROOT_INPUT_CONTRACT")
        return do_enroll(a.envelope) if a.root_enroll else do_abort(a.envelope)
    need(a.private and a.public and a.reviewed_source and
         a.reviewed_source_sha256 and a.envelope is None,"OWNER_INPUT_CONTRACT")
    return owner_main(a.private,a.public,a.reviewed_source,
                      a.reviewed_source_sha256,
                      "ABORT_INACTIVE" if a.owner_abort else "ENROLL_INACTIVE",
                      a.recovery_id or "")
if __name__=="__main__":
    try:sys.exit(main())
    except (Hold,OSError,ValueError,TypeError,subprocess.TimeoutExpired,
            subprocess.CalledProcessError) as exc:
        print("HOLD:R23:"+str(exc),file=sys.stderr)
        print("An uncertain or partially written root transaction must NOT be replayed.",
              file=sys.stderr)
        sys.exit(2)
