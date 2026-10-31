#!/usr/bin/env python3
"""R24 F: separate owner Mac consent for parallel web-only proxy switch/rollback."""
from __future__ import annotations
import argparse,hashlib,os,pathlib,re,stat,subprocess,sys

TARGET="0cee3c836c4b0760478280c145e02e81e470ce0e"
H40=re.compile("[a-f0-9]{40}\\Z")
H64=re.compile("[a-f0-9]{64}\\Z")
NONCE=re.compile("[a-f0-9]{32}\\Z")
BUILD=re.compile("[A-Za-z0-9_-]{8,128}\\Z")
class Hold(Exception):pass
def need(ok,reason):
    if not ok:raise Hold(reason)
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--reviewed-root-file",required=True)
    parser.add_argument("--root-source-sha256",required=True)
    parser.add_argument("--next-build-id",required=True)
    parser.add_argument("--nonce",required=True)
    parser.add_argument("--rollback",action="store_true")
    opts=parser.parse_args()
    need(sys.platform=="darwin" and os.geteuid()!=0,"OWNER_MAC_NONROOT_REQUIRED")
    need(H64.fullmatch(opts.root_source_sha256) and
         BUILD.fullmatch(opts.next_build_id) and NONCE.fullmatch(opts.nonce),
         "EXACT_REVIEWED_SOURCE_BUILD_AND_NONCE_REQUIRED")
    path=pathlib.Path(opts.reviewed_root_file).expanduser()
    st=path.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and
         not st.st_mode&0o022 and st.st_size<65536,"OWNER_CONTROLLED_REVIEWED_SOURCE_REQUIRED")
    raw=path.read_bytes()
    need(hashlib.sha256(raw).hexdigest()==opts.root_source_sha256,
         "F_ROOT_SOURCE_NOT_EXACT_REVIEWED_SHA256")
    need(b"TARGET=\"0cee3c836c4b0760478280c145e02e81e470ce0e\"" in raw,
         "ORIGINAL_EXACT_WEBSITE_SHA_NOT_PRESENT")
    phrase=("ROLLBACK R24 PARALLEL WEBSITE " if opts.rollback else
            "AUTHORIZE R24 PARALLEL WEBSITE ")+TARGET+" "+opts.next_build_id+" "+opts.nonce
    with open("/dev/tty","w") as out:
        out.write("R24: old web MainPID remains running; no original RSA/key/finance service change.\n")
        out.write("Reviewed root source SHA256: "+opts.root_source_sha256+"\n")
        out.write("Type exactly "+phrase+": ");out.flush()
    with open("/dev/tty","r") as inp:
        need(inp.readline().rstrip("\r\n")==phrase,"OWNER_CONSENT_DENIED")
    mode=("--root-rollback --nonce "+opts.nonce) if opts.rollback else "--root-apply"
    args=["/usr/bin/ssh","-T","-o","BatchMode=yes",
         "-o","StrictHostKeyChecking=yes","-o","NumberOfPasswordPrompts=0",
         "-o","ConnectTimeout=10","-o","ConnectionAttempts=1","root@hel1",
         "/usr/bin/python3 -I -B - "+mode]
    p=subprocess.run(args,input=raw,capture_output=True,timeout=150,check=False)
    if p.stdout:sys.stdout.buffer.write(p.stdout)
    if p.stderr:sys.stderr.buffer.write(p.stderr)
    expected=(b"PASS:R24_OLD_WEB_PROXY_RESTORED" if opts.rollback else
              b"PASS:R24_PARALLEL_PUBLIC_WEBSITE_CUTOVER")
    need(p.returncode==0 and expected in p.stdout,
         "ROOT_PROXY_TRANSACTION_UNCERTAIN_NO_BLIND_RETRY")
    print("PASS:R24_OWNER_PHYSICAL_PROXY_EXECUTION; G_LIVE_POSTFLIGHT_STILL_REQUIRED")
if __name__=="__main__":
    try:main()
    except (Hold,OSError,ValueError,subprocess.SubprocessError) as err:
        print("HOLD:R24_MAC:"+str(err),file=sys.stderr);sys.exit(2)
