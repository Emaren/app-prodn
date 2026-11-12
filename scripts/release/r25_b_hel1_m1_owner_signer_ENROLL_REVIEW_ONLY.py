#!/usr/bin/env python3
"""B HEL1-protection signing key under separate M1 OWNER-ROOT custody.

Never copy C's DEV-GO signer or private bytes. Source review is not a permit.
The only recognized installation path is a Central-approved root0600 copy
under this distinct root0700 directory, launched in the owner's native TTY.
Private PEM remains root0400 on the M1; no key output/secret logging.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import stat
import re
import subprocess
import sys

ROOT=Path("/private/var/root/.aoe2war-b-hel1-prod-sign-v1")
SELF=ROOT/"r25_b_hel1_m1_owner_signer_ENROLL_REVIEW_ONLY.py"
PRIV=ROOT/"hel1-prod-owner-ed25519.private.pem"
PUB=ROOT/"hel1-prod-owner-ed25519.public.pem"
OPENSSL="/opt/homebrew/bin/openssl"
# A distinct one-line exact post-enrollment source patch is required. Never
# bind this to C's existing UID650 DEVELOPMENT public SHA.
HEL1_PRODUCTION_PUBLIC_PEM_SHA256=None
APPROVAL_MESSAGE=ROOT/"central-source-install-comment-body.txt"
APPROVAL_SIGNATURE=ROOT/"central-source-install-comment-body.sig"
CENTRAL_PREFIX="AOE2WAR_CENTRAL_SOURCE_INSTALL_V22_APPROVED_V1:"
HEX64=re.compile(r"[0-9a-f]{64}\Z")
ROOT_MODULES=frozenset((
  "r25_b_v22_linux_host_adapter_REVIEW_ONLY.py",
  "r25_b_v22_source_install_coordinator_REVIEW_ONLY.py",
  "r25_v22_root_install_admission_REVIEW_ONLY.py",
  "r25_b_v22_central_signature_REVIEW_ONLY.py",
  "r25_v22_three_source_transaction_REVIEW_ONLY.py",
  "r25_b_hel1_source_install_entrypoint_REVIEW_ONLY.py",
))


def safe_root_action(argv, *, installed_source=SELF):
    if argv not in (["enroll-public-only"], ["sign-exact-central-comment"]):
        raise ValueError("HOLD:B_PRODUCTION_OWNER_UNREVIEWED_SIGNER_ACTION")
    if (sys.platform!="darwin" or os.geteuid()!=0 or
        os.environ.get("SUDO_UID")!="501" or
        os.environ.get("SUDO_USER")!="tonyblum" or
        not sys.stdin.isatty() or not sys.stdout.isatty()):
        raise ValueError("HOLD:B_PRODUCTION_SIGNER_PHYSICAL_OWNER_ROOT_TTY")
    if Path(__file__).resolve()!=installed_source:
        raise ValueError("HOLD:B_PRODUCTION_SIGNER_ROOT_INSTALLED_SOURCE_ONLY")
    d=ROOT.lstat()
    st=installed_source.lstat()
    if (not stat.S_ISDIR(d.st_mode) or d.st_uid!=0 or
        stat.S_IMODE(d.st_mode)!=0o700 or
        not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_nlink!=1 or
        stat.S_IMODE(st.st_mode)!=0o600):
        raise ValueError("HOLD:B_PRODUCTION_SIGNER_UNTRUSTED_ROOT_SOURCE")
    if argv==["enroll-public-only"] and (
        PRIV.exists() or PRIV.is_symlink() or PUB.exists() or PUB.is_symlink()
    ):
        raise ValueError("HOLD:B_PRODUCTION_SIGNER_ALREADY_ENROLLED_OR_PARTIAL")
    if not Path(OPENSSL).is_file():
        raise ValueError("HOLD:B_PRODUCTION_SIGNER_OPENSSL_NOT_FOUND")
    return True

def create_once(path,raw):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_CLOEXEC|os.O_NOFOLLOW,0o400)
    try:
        os.fchmod(fd,0o400)
        os.write(fd,raw)
        os.fsync(fd)
    finally:
        os.close(fd)
    d=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(d)
    finally:os.close(d)

def enroll():
    safe_root_action(["enroll-public-only"])
    os.umask(0o077)
    key=subprocess.run([OPENSSL,"genpkey","-algorithm","Ed25519"],
                       capture_output=True,check=False,timeout=12)
    if key.returncode!=0 or not key.stdout.startswith(b"-----BEGIN PRIVATE KEY-----"):
        raise ValueError("HOLD:B_PRODUCTION_OWNER_ED25519_GENERATION")
    # No logging, export, print, or stdout display of the secret.
    create_once(PRIV,key.stdout)
    pub=subprocess.run([OPENSSL,"pkey","-in",str(PRIV),"-pubout"],
                       capture_output=True,check=False,timeout=12)
    if pub.returncode!=0 or not pub.stdout.startswith(b"-----BEGIN PUBLIC KEY-----"):
        raise ValueError("HOLD:B_PRODUCTION_OWNER_ED25519_PUBLIC_DERIVATION")
    create_once(PUB,pub.stdout)
    # Publish ONLY the public PEM SHA; private key remains root0400 here.
    return hashlib.sha256(pub.stdout).hexdigest()

def validate_signable_comment(body: bytes, public_sha: str):
    """Pure exact review predicate, no signing or key access."""
    if not isinstance(body,bytes) or not (
        isinstance(public_sha,str) and HEX64.fullmatch(public_sha)
    ):
        raise ValueError("HOLD:B_HEL1_OWNER_PUBLIC_FINGERPRINT_FORMAT")
    if not body.startswith(CENTRAL_PREFIX.encode()) or len(body)>16384:
        raise ValueError("HOLD:B_HEL1_UNKNOWN_APPROVAL_MESSAGE")
    def unique(pairs):
        d={}
        for k,v in pairs:
            if k in d:raise ValueError("HOLD:B_HEL1_DUPLICATE_APPROVAL_FIELD")
            d[k]=v
        return d
    obj=json.loads(body[len(CENTRAL_PREFIX):],object_pairs_hook=unique)
    if (body!=CENTRAL_PREFIX.encode()+json.dumps(
            obj,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()
        or set(obj)!={
            "decision","packet_sha256","nonce_sha256","executor_sha256",
            "root_entrypoint_sha256","reviewed_source_head_sha256",
            "root_modules_sha256","observed_old_preimage",
            "central_signer_public_sha256","owner_receipt_sha256",
            "stage0003_sha256","boot_id","fence_sha256",
            "no_public_activation","no_financial_authority",
        }
        or obj["decision"]!="CENTRAL_SOURCE_INSTALL_ONLY_APPROVED"
        or obj["no_public_activation"] is not True
        or obj["no_financial_authority"] is not True
        or obj["central_signer_public_sha256"]!=public_sha
        or obj["observed_old_preimage"]!={
            "v22":"c6e633538fc17dad6fe887452516cb2ba1095855a0aab6f4bdda47f5985f6edc",
            "controller":None,"guard":None}
        or obj["boot_id"]!="6fdc01cb-8eb6-448d-9a5a-b62b66e0fe34"
        or set(obj["root_modules_sha256"])!=ROOT_MODULES):
        raise ValueError("HOLD:B_HEL1_CENTRAL_APPROVAL_SCOPE_MISMATCH")
    for key in ("packet_sha256","nonce_sha256","executor_sha256",
                "root_entrypoint_sha256","owner_receipt_sha256",
                "stage0003_sha256","fence_sha256"):
        if not isinstance(obj[key],str) or not HEX64.fullmatch(obj[key]):
            raise ValueError("HOLD:B_HEL1_CENTRAL_APPROVAL_SHA_FORMAT")
    if (not re.fullmatch(r"[0-9a-f]{40}",obj["reviewed_source_head_sha256"]) or
        any(not isinstance(v,str) or not HEX64.fullmatch(v)
            for v in obj["root_modules_sha256"].values())):
        raise ValueError("HOLD:B_HEL1_APPROVED_SOURCE_SHA_FORMAT")
    return hashlib.sha256(body).hexdigest()

def sign_exact_approved_comment():
    safe_root_action(["sign-exact-central-comment"])
    if not (isinstance(HEL1_PRODUCTION_PUBLIC_PEM_SHA256,str) and
            HEX64.fullmatch(HEL1_PRODUCTION_PUBLIC_PEM_SHA256)):
        raise ValueError("HOLD:B_HEL1_PRODUCTION_SIGNER_PUBLIC_PIN_NOT_ENROLLED")
    for path in (PRIV,PUB,APPROVAL_MESSAGE):
        st=path.lstat()
        if (not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or
            st.st_nlink!=1 or stat.S_IMODE(st.st_mode)!=0o400):
            raise ValueError("HOLD:B_HEL1_OWNER_SIGNING_INPUT_NOT_ROOT0400")
    if APPROVAL_SIGNATURE.exists() or APPROVAL_SIGNATURE.is_symlink():
        raise ValueError("HOLD:B_HEL1_SIGNATURE_ONE_USE_ALREADY_EXISTS")
    if hashlib.sha256(PUB.read_bytes()).hexdigest()!=HEL1_PRODUCTION_PUBLIC_PEM_SHA256:
        raise ValueError("HOLD:B_HEL1_OWNER_PRODUCTION_PUBLIC_PIN_DRIFT")
    # No arbitrary bytes may be signed. Require exact Central approval
    # schema and packet-bound source+host+no-financial constraints.
    body=APPROVAL_MESSAGE.read_bytes()
    message_digest=validate_signable_comment(body,HEL1_PRODUCTION_PUBLIC_PEM_SHA256)
    signature=subprocess.run(
        [OPENSSL,"pkeyutl","-sign","-inkey",str(PRIV),"-rawin",
         "-in",str(APPROVAL_MESSAGE)],
        capture_output=True,check=False,timeout=12)
    if signature.returncode!=0 or len(signature.stdout)!=64:
        raise ValueError("HOLD:B_HEL1_ED25519_SIGNING_FAILED")
    create_once(APPROVAL_SIGNATURE,signature.stdout)
    return (message_digest,hashlib.sha256(signature.stdout).hexdigest())

if __name__=="__main__":
    try:
        if sys.argv[1:]==["enroll-public-only"]:
            print("PASS:B_HEL1_SEPARATE_OWNER_ROOT_PUBLIC_SHA256="+enroll())
            print("HOLD:B_HEL1_PUBLIC_KEY_NOT_CENTRAL_PINNED_NOT_HEL1_INSTALLED")
        elif sys.argv[1:]==["sign-exact-central-comment"]:
            body_sha,sig_sha=sign_exact_approved_comment()
            print("PASS:B_HEL1_OWNER_EXACT_COMMENT_SIGNED_BODY_SHA256="+body_sha)
            print("PASS:B_HEL1_OWNER_SIGNATURE_SHA256="+sig_sha)
            print("HOLD:B_HEL1_SIGNATURE_NOT_ROOT_HEL1_INSTALLED_OR_SOURCE_ADMITTED")
        else:
            raise ValueError("HOLD:B_HEL1_OWNER_UNKNOWN_OPERATION")
    except Exception as e:
        print("HOLD:B_HEL1_SIGNER_ENROLLMENT_OR_SIGN_NOT_AUTHORIZED:"+type(e).__name__)
        sys.exit(3)
