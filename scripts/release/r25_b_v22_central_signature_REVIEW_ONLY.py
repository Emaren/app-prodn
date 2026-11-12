#!/usr/bin/env python3
"""Detached independent Central Ed25519 approval verification — review-only.

The signer PRIVATE key must never be on HEL1 or in UID501/UID650 PRODUCT or
B automation; future owner/Central registration pins only its public SHA256.
A GitHub owner-account comment is provenance, NOT proof of independence.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

# No previously independently registered Central offline key exists.
# Source must fail closed until an independently reviewed exact public SHA
# is pinned here by a distinct source/owner approval transaction.
CENTRAL_OFFLINE_PUBLIC_KEY_SHA256="e9c5b0375d8457b69a3e69e12a7d190ed55ad754c89384348cb0feebeb41512f"
CENTRAL_OFFLINE_PUBLIC_PEM=Path("/etc/aoe2war/central-admission-v1/source-install-ed25519.pub.pem")
CENTRAL_EXPECTED_MESSAGE=Path("/root/aoe2war-b-v22-three-source-install-v1/central-approval-body.txt")
CENTRAL_DETACHED_SIGNATURE=Path("/root/aoe2war-b-v22-three-source-install-v1/central-approval.sig")
HEX64=re.compile(r"[0-9a-f]{64}\Z")

class Hold(ValueError):pass
def need(ok,why):
    if not ok:raise Hold("HOLD:CENTRAL_INDEPENDENT_SIGNATURE_"+why)

def safe_bytes(path:Path, *, trusted_uid:int, mode:int, min_bytes:int, max_bytes:int):
    st=path.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==trusted_uid and
         st.st_nlink==1 and stat.S_IMODE(st.st_mode)==mode and
         min_bytes<=st.st_size<=max_bytes,"UNTRUSTED_FILE_"+path.name)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        live=os.fstat(fd)
        need((live.st_dev,live.st_ino,live.st_size)==(st.st_dev,st.st_ino,st.st_size),
             "RACED_FILE_"+path.name)
        data=b""
        while len(data)<=max_bytes:
            chunk=os.read(fd,min(65536,max_bytes+1-len(data)))
            if not chunk:break
            data+=chunk
        need(len(data)==st.st_size,"INCOMPLETE_FILE_"+path.name)
        return data
    finally:os.close(fd)

def verify_central_detached_signature(*, public_key:Path, message:Path,
                                       signature:Path, exact_github_comment_body:bytes,
                                       expected_public_sha256:str|None,
                                       trusted_uid:int=0,
                                       openssl:str="/usr/bin/openssl"):
    """Verify EXACT independent SHA-bound GitHub text under a pre-registered key."""
    need(type(expected_public_sha256) is str and
         HEX64.fullmatch(expected_public_sha256),
         "NO_SOURCE_PINNED_INDEPENDENT_PUBLIC_KEY")
    pub=safe_bytes(public_key,trusted_uid=trusted_uid,mode=0o400,
                   min_bytes=80,max_bytes=2048)
    body=safe_bytes(message,trusted_uid=trusted_uid,mode=0o400,
                    min_bytes=64,max_bytes=16384)
    sig=safe_bytes(signature,trusted_uid=trusted_uid,mode=0o400,
                   min_bytes=64,max_bytes=64)
    need(hashlib.sha256(pub).hexdigest()==expected_public_sha256,
         "UNTRUSTED_SIGNER_PUBLIC_KEY")
    need(type(exact_github_comment_body) is bytes and body==exact_github_comment_body,
         "GITHUB_COMMENT_AND_SIGNED_MESSAGE_DRIFT")
    # Enforce Ed25519 key type; no fallback algorithm or relaxed OpenSSL flags.
    key=subprocess.run([openssl,"pkey","-pubin","-in",str(public_key),
                       "-text_pub","-noout"],
                       capture_output=True,text=True,timeout=7)
    need(key.returncode==0 and "ED25519" in key.stdout.upper(),
         "NOT_ED25519_PUBLIC_KEY")
    result=subprocess.run([openssl,"pkeyutl","-verify","-pubin",
                           "-inkey",str(public_key),"-rawin",
                           "-in",str(message),"-sigfile",str(signature)],
                          capture_output=True,text=True,timeout=10)
    need(result.returncode==0,"INVALID_DETACHED_CENTRAL_SIGNATURE")
    return {
      "status":"PASS_CENTRAL_OFFLINE_SIGNED_SOURCE_INSTALL_MESSAGE",
      "public_key_sha256":expected_public_sha256,
      "signed_message_sha256":hashlib.sha256(body).hexdigest(),
      "github_comment_exact":True,
      "financial_authority":False,
      "source_install_only":True,
    }

if __name__=="__main__":
    print("HOLD:INDEPENDENT_CENTRAL_PUBLIC_KEY_NOT_PINNED")
    sys.exit(3)
