#!/usr/bin/env python3
"""R22 F one-owner-action HEL1 root-helper INSTALL+VERIFY bridge.

Run as tony UID1000 on HEL1 only, after using authentic owner RSA signer on
separately controlled key-custody device. Never execute a tony-writable Python
file as root: installer is loaded into isolated root Python from exact SHA256
verified bytes and has its original INSTALL consent/receipt/VERIFY intact.
"""
import base64
import getpass
import hashlib
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys
import tempfile

HOST="ubuntu-4gb-hel1-11"
STAGE=Path("/home/tony/aoe2war-r22-source-only-staging")
CONTROLLER="18052e01a191b15525664c1a058de80d7a8bc150"
WEBSITE="0cee3c836c4b0760478280c145e02e81e470ce0e"
INSTALLER="9569b449f6905d49ab0cd19e36b5b18dad527d3681b668ee598236c79b794040"
MANIFEST="874a27ecac946360e492420390fceb7e8b2409047033a0be641003c0da3408dc"
BUNDLE="dc316868e684fb7ea430d80c1fedca0a28d3e42b238eafb22cab67aceefc7c74"
KEY_FP="3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"

# Separate SHA-pinned in-memory root loader. Runs only after sudo auth and
# independently re-reads+verifies all four original unprivileged FDs. No
# arbitrary shell, no root executing a filesystem Python pathname.
ROOT=r'''
import base64, hashlib, json, os, pathlib, socket, stat, subprocess, sys, tempfile
from datetime import datetime, timedelta, timezone

def hold(s):
    print("HOLD:R22_ROOT:"+s,file=sys.stderr,flush=True);sys.exit(2)
if socket.gethostname()!="ubuntu-4gb-hel1-11" or not sys.platform.startswith("linux") or os.geteuid()!=0:
    hold("EXPECTED_HEL1_ROOT")
if os.environ.get("SUDO_UID")!="1000" or os.environ.get("SUDO_USER")!="tony":
    hold("ORIGINAL_TONY_SUDO_REQUIRED")
if len(sys.argv)!=5:hold("FOUR_INPUTS_REQUIRED")
pins=("9569b449f6905d49ab0cd19e36b5b18dad527d3681b668ee598236c79b794040",
      "874a27ecac946360e492420390fceb7e8b2409047033a0be641003c0da3408dc",
      "dc316868e684fb7ea430d80c1fedca0a28d3e42b238eafb22cab67aceefc7c74",None)
limits=(524288,65536,12582912,32768)
raws=[]
for name,pin,limit in zip(sys.argv[1:],pins,limits):
    path=pathlib.Path(name)
    if not path.is_absolute() or path.is_symlink():hold("UNSAFE_INPUT_PATH")
    try:fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    except OSError:hold("INPUT_OPEN_FAILURE")
    try:
        a=os.fstat(fd)
        if not stat.S_ISREG(a.st_mode) or not 0<a.st_size<=limit:hold("INPUT_SIZE_TYPE")
        b=os.read(fd,limit+1);z=os.fstat(fd)
        if len(b)!=a.st_size or (a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns)!=(z.st_dev,z.st_ino,z.st_size,z.st_mtime_ns):hold("INPUT_RACE")
        if pin and hashlib.sha256(b).hexdigest()!=pin:hold("PIN_MISMATCH")
        raws.append(b)
    finally:os.close(fd)
try:manifest=json.loads(raws[1]);envelope=json.loads(raws[3])
except ValueError:hold("INVALID_JSON")
if manifest.get("controller_commit")!="18052e01a191b15525664c1a058de80d7a8bc150" or manifest.get("w1_safe_candidate")!="0cee3c836c4b0760478280c145e02e81e470ce0e" or manifest.get("financial_release_authorized") is not False or manifest.get("root_install_authorized") is not False:
    hold("INVALID_MANIFEST_AUTHORITY_OR_SOURCE")
if type(envelope)!=dict or set(envelope)!={"schema","payload","signature_base64"} or envelope["schema"]!="aoe2war.hel1.root-install.permit.v2":hold("INVALID_PERMIT_ENVELOPE")
body=envelope["payload"]
if type(body)!=dict or set(body)!={"operation","manifest_sha256","controller_commit","issued_at","expires_at"}:hold("INVALID_PERMIT_BODY")
if body["operation"]!="install" or body["manifest_sha256"]!="874a27ecac946360e492420390fceb7e8b2409047033a0be641003c0da3408dc" or body["controller_commit"]!="18052e01a191b15525664c1a058de80d7a8bc150":hold("WRONG_PERMIT_SCOPE")
try:
    start=datetime.fromisoformat(body["issued_at"].removesuffix("Z")+"+00:00")
    end=datetime.fromisoformat(body["expires_at"].removesuffix("Z")+"+00:00")
    signature=base64.b64decode(envelope["signature_base64"],validate=True)
except Exception:hold("PERMIT_TIME_OR_SIGNATURE_ENCODING")
now=datetime.now(timezone.utc)
if not (body["issued_at"].endswith("Z") and body["expires_at"].endswith("Z") and start<=now<=end and timedelta(0)<end-start<=timedelta(minutes=15)):
    hold("PERMIT_TIME_EXPIRED_OR_INVALID")
try:
    ns={"__name__":"r22_exact_frozen_install_module","__file__":"<FROZEN_INSTALLER_MEMORY>"}
    exec(compile(raws[0],"<FROZEN_INSTALLER_MEMORY>","exec"),ns)
    orig_key=ns["KEY"];orig_approval=ns["APPROVAL"]
    ns["protected"](orig_key,file=True)
    key=ns["read_file"](orig_key,16384,trusted=True)
    with tempfile.TemporaryDirectory(prefix="r22-root-verify-") as td:
        p=pathlib.Path(td);(p/"owner.pub").write_bytes(key)
        (p/"signature").write_bytes(signature)
        (p/"intent").write_bytes(ns["DOM"]+ns["canonical"](body))
        der=subprocess.run(["/usr/bin/openssl","pkey","-pubin","-in",str(p/"owner.pub"),"-outform","DER"],capture_output=True,timeout=8)
        if der.returncode or hashlib.sha256(der.stdout).hexdigest()!="3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd":hold("OWNER_RSA_KEY_PIN")
        ver=subprocess.run(["/usr/bin/openssl","dgst","-sha256","-verify",str(p/"owner.pub"),"-signature",str(p/"signature"),str(p/"intent")],capture_output=True,timeout=8)
        if ver.returncode:hold("OWNER_SIGNATURE_NOT_VALID")
    # Owner authority now verified. Never clobber an existing root approval.
    if orig_approval.exists() or orig_approval.is_symlink():hold("ROOT_APPROVAL_ALREADY_EXISTS_NEEDS_DISTINCT_REVIEW")
    ns["write_new"](orig_approval,raws[3]+b"\n")
    print("PASS:R22_ORIGINAL_OWNER_RSA_PERMIT_VERIFIED_AND_ROOT_PROTECTED",flush=True)
    # Retain original file's exact main/permit/typed TTY consent implementation.
    manifest_path,bundle_path=sys.argv[2],sys.argv[3]
    for mode in ("install","verify"):
        sys.argv=["<FROZEN_INSTALLER_MEMORY>",mode,
                 "--manifest",manifest_path,"--bundle",bundle_path,
                 "--controller-sha","18052e01a191b15525664c1a058de80d7a8bc150",
                 "--approved-manifest-sha256","874a27ecac946360e492420390fceb7e8b2409047033a0be641003c0da3408dc"]
        ns["main"]()
    print("PASS:R22_INSTALL_AND_INDEPENDENT_NATIVE_VERIFY; NO_STAGE_NO_FINANCE",flush=True)
except SystemExit:raise
except Exception as e:hold("INSTALL_OR_VERIFY:"+type(e).__name__+":"+str(e)[:160])
'''

def hold(reason):
    print("HOLD:R22:"+reason, file=sys.stderr, flush=True)
    return 2

def read_exact(p,maximum):
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        a=os.fstat(fd)
        if not stat.S_ISREG(a.st_mode) or not 0<a.st_size<=maximum:raise ValueError("BAD_INPUT_TYPE_OR_SIZE")
        b=os.read(fd,maximum+1);z=os.fstat(fd)
        if len(b)!=a.st_size or (a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns)!=(z.st_dev,z.st_ino,z.st_size,z.st_mtime_ns):raise ValueError("INPUT_CHANGED")
        return b
    finally:os.close(fd)

def main():
    if sys.platform!="linux" or socket.gethostname()!=HOST or os.getuid()!=1000 or os.geteuid()!=1000:
        return hold("EXACT_ORIGINAL_HEL1_TONY_REQUIRED")
    if len(sys.argv)!=1:return hold("NO_EXTRA_PARAMETERS")
    st=STAGE.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_uid!=1000 or stat.S_IMODE(st.st_mode)&0o077:
        return hold("STAGING_DIR_OWNER_OR_MODE")
    found={}
    scanned=0
    for p in STAGE.iterdir():
        scanned+=1
        if scanned>16:return hold("UNBOUNDED_STAGING_ENTRIES")
        if p.is_symlink() or not p.is_file():return hold("UNEXPECTED_NONFILE_STAGING_ENTRY")
        s=p.stat()
        if s.st_uid!=1000 or stat.S_IMODE(s.st_mode)&0o077:return hold("STAGING_FILE_OWNER_OR_MODE")
        data=read_exact(p,12582912)
        h=hashlib.sha256(data).hexdigest()
        if h in (INSTALLER,MANIFEST,BUNDLE):
            if h in found:return hold("DUPLICATED_HASHED_INPUT")
            found[h]=p
    if set(found)!={INSTALLER,MANIFEST,BUNDLE}:return hold("MISSING_STAGED_EXACT_ARTIFACT")
    m=json.loads(read_exact(found[MANIFEST],65536))
    if m.get("controller_commit")!=CONTROLLER or m.get("w1_safe_candidate")!=WEBSITE:
        return hold("STAGING_MANIFEST_IDENTITY_DRIFT")
    print("PASS:R22_THREE_EXACT_STAGED_ARTIFACTS; NO_REBUILD",flush=True)
    print("Owner must provide CURRENT signed INSTALL permit from the original independent RSA key-custody machine.",flush=True)
    encoded=getpass.getpass("Paste R22_INSTALL_PERMIT_BASE64 (input hidden): ").strip()
    if encoded.startswith("R22_INSTALL_PERMIT_BASE64="):
        encoded=encoded.split("=",1)[1]
    if not encoded:return hold("ORIGINAL_OWNER_SIGNED_INSTALL_PERMIT_NOT_SUPPLIED")
    if len(encoded)>44000:return hold("UNBOUNDED_SIGNED_PERMIT")
    try:
        approval=base64.b64decode(encoded,validate=True)
        if not 0<len(approval)<=32768:return hold("INVALID_ENVELOPE_LENGTH")
        x=json.loads(approval)
        if not isinstance(x,dict) or not isinstance(x.get("payload"),dict):
            return hold("INVALID_OWNER_PERMIT_JSON_SHAPE")
        if x["payload"].get("manifest_sha256")!=MANIFEST or x["payload"].get("operation")!="install":
            return hold("BAD_PERMIT_INTENT")
    except (ValueError, TypeError, KeyError) as e:
        return hold("INVALID_OWNER_PERMIT_JSON:"+type(e).__name__)
    except Exception as e:
        return hold("INVALID_OWNER_PERMIT_BASE64:"+type(e).__name__)
    with tempfile.TemporaryDirectory(prefix="aoe2war-r22-install-input-") as td:
        path=Path(td)/"owner-install-envelope.json"
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,"wb") as f:f.write(approval)
        try:
            with open("/dev/tty","rb",buffering=0) as tty:
                print("Authenticating original sudo session; root installer STILL requires separate typed confirmation.",flush=True)
                auth=subprocess.run(["/usr/bin/sudo","-v"],stdin=tty,check=False)
                if auth.returncode:return hold("OWNER_SUDO_AUTH_DENIED")
                print("PASS:R22_INTERACTIVE_SUDO_AUTH; EXACT ROOT INSTALLER EXECUTION",flush=True)
                cmd=["/usr/bin/sudo","-n","/usr/bin/python3","-I","-B","-c",ROOT,
                     str(found[INSTALLER]),str(found[MANIFEST]),str(found[BUNDLE]),str(path)]
                proc=subprocess.run(cmd,stdin=tty,check=False)
                if proc.returncode:return hold("ROOT_INSTALL_VERIFY_FAILED_RC_"+str(proc.returncode))
                return 0
        finally:
            subprocess.run(["/usr/bin/sudo","-k"],stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL,check=False)

if __name__=="__main__":
    try:sys.exit(main())
    except (OSError,ValueError,TypeError,KeyError,subprocess.TimeoutExpired) as e:
        sys.exit(hold(type(e).__name__+":"+str(e)[:160]))
