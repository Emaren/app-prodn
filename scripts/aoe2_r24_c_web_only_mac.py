#!/usr/bin/env python3
"""R24 C owner-Mac launch: ONE reviewed website cutover, no RSA changes.

Require exact F review commit and SHA256 of the root worker; no arbitrary
uploaded Python, no private signing key, no password to SSH.
"""
import argparse
import hashlib
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

TARGET="0cee3c836c4b0760478280c145e02e81e470ce0e"
PATH="scripts/aoe2_r24_c_web_only_cutover.py"
EXACT_HOST="ubuntu-4gb-hel1-11"
PAT_SHA40=re.compile(r"^[0-9a-f]{40}$")
PAT_SHA64=re.compile(r"^[0-9a-f]{64}$")
PAT_BUILD=re.compile(r"^[A-Za-z0-9_-]{5,128}$")
class Hold(Exception): pass
def need(cond,reason):
    if not cond: raise Hold(reason)
def launch(repo,review_commit,source_hash,build_id):
    need(sys.platform=="darwin" and os.getuid()!=0,"OWNER_MAC_NONROOT_REQUIRED")
    need(PAT_SHA40.fullmatch(review_commit) is not None and
         PAT_SHA64.fullmatch(source_hash) is not None and
         PAT_BUILD.fullmatch(build_id) is not None,"F_PINNED_REVIEW_REQUIRED")
    repo=Path(repo).expanduser().absolute()
    need(repo.is_dir() and (repo/".git").exists(),"ORIGINAL_MAC_GIT_REPO_REQUIRED")
    raw=subprocess.run(["/usr/bin/git","-C",str(repo),"show",review_commit+":"+PATH],
                       capture_output=True,timeout=20,check=True).stdout
    need(len(raw)<100000 and hashlib.sha256(raw).hexdigest()==source_hash,
         "F_APPROVED_EXACT_SOURCE_SHA256_MISMATCH")
    need(b"CANDIDATE=\"0cee3c836c4b0760478280c145e02e81e470ce0e\"" in raw,
         "F_WEBSITE_CANDIDATE_NOT_EXACT")
    phrase="AUTHORIZE HEL1 R24 WEBSITE ONLY "+TARGET+" BUILD "+build_id
    with open("/dev/tty","w") as out:
        out.write("R24 web-only production cutover. Frozen original RSA and financial services must remain unchanged.\n")
        out.write("Reviewed code commit: "+review_commit+"\n")
        out.write("Reviewed worker SHA-256: "+source_hash+"\n")
        out.write("Target Next BUILD_ID: "+build_id+"\n")
        out.write("Type exactly:\n"+phrase+"\n> ")
        out.flush()
    with open("/dev/tty","r") as inp:
        entered=inp.readline().rstrip("\r\n")
    need(entered==phrase,"OWNER_RELEASE_CONSENT_NOT_GIVEN")
    # Owner verified SSH host alias and root authentication in R23. Strict
    # host key pinning, no password prompts and no new trust enrollment.
    ssh=["/usr/bin/ssh","-T","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes",
         "-o","NumberOfPasswordPrompts=0","-o","ConnectTimeout=10",
         "-o","ConnectionAttempts=1","root@hel1",
         "/usr/bin/python3 -I -B - --apply --owner-build-id "+build_id]
    completed=subprocess.run(ssh,input=raw,capture_output=True,timeout=1200,check=False)
    if completed.stdout:
        sys.stdout.buffer.write(completed.stdout)
    if completed.stderr:
        sys.stderr.buffer.write(completed.stderr)
    need(completed.returncode==0 and
         b"PASS:R24_WEB_ONLY_LIVE_EXACT_SOURCE_AND_BUILD_ID" in completed.stdout,
         "LIVE_RELEASE_NOT_VERIFIED_REVIEW_ROOT_RECEIPTS_NO_BLIND_RETRY")
    print("PASS:R24_C_OWNER_LAUNCH_EXACT_SOURCE; REVIEW_G_LIVE_POSTFLIGHT_STILL_REQUIRED")
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--repo",required=True)
    p.add_argument("--f-review-commit",required=True)
    p.add_argument("--operator-sha256",required=True)
    p.add_argument("--build-id",required=True)
    a=p.parse_args()
    launch(a.repo,a.f_review_commit,a.operator_sha256,a.build_id)
if __name__=="__main__":
    try: main()
    except (Hold,OSError,subprocess.SubprocessError,ValueError) as err:
        print("HOLD:R24_C_MAC:"+str(err),file=sys.stderr)
        sys.exit(2)
