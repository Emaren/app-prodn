#!/usr/bin/env python3
"""R24 owner Mac -> existing HEL1 root SSH; one approved website-only cutover.

No extra key generation, no old RSA signature pretence, no root-installed file,
no npm scripts on the live checkout, no financial commands. Requires F-reviewed
root cutover source AND B/C/D/E pinned physical admission already installed.
C independently stages root-sealed candidate before this entry point can proceed.
"""
from __future__ import annotations
import argparse,hashlib,os,pathlib,re,stat,subprocess,sys

HOST="ubuntu-4gb-hel1-11"
CANDIDATE="0cee3c836c4b0760478280c145e02e81e470ce0e"
PIN=re.compile(r"[0-9a-f]{64}\Z")
class Hold(Exception): pass
def need(ok,why):
    if not ok:raise Hold(why)
def source(path,pin):
    need(bool(PIN.fullmatch(pin)),"F_REVIEWED_CUTOVER_PIN_MISSING")
    p=pathlib.Path(path).expanduser()
    st=p.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and
         not st.st_mode&0o022 and st.st_size<=65536,"UNTRUSTED_LOCAL_REVIEWED_FILE")
    raw=p.read_bytes()
    need(hashlib.sha256(raw).hexdigest()==pin,"F_CUTOVER_BYTES_CHANGED")
    return raw
def owner_main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument("--root-file",required=True)
    parser.add_argument("--root-file-sha256",required=True)
    a=parser.parse_args(argv)
    need(sys.platform=="darwin" and os.geteuid()!=0,"ORIGINAL_MAC_OWNER_REQUIRED")
    raw=source(a.root_file,a.root_file_sha256)
    # This permission is distinct from original RSA INSTALL. It authorizes
    # only a separately admitted isolated website systemd working-dir cutover.
    phrase="AUTHORIZE R24 WEBSITE ONLY "+CANDIDATE
    with open("/dev/tty","w") as out:
        out.write("Scope: website service ONLY. Preserve financial units and old live Git.\n")
        out.write("Requires reviewed B/C/D/E policy, root-sealed candidate and rollback.\n")
        out.write("Type exactly "+phrase+": ");out.flush()
    with open("/dev/tty","r") as inp:
        need(inp.readline().rstrip("\r\n")==phrase,"OWNER_WEBSITE_CONSENT_DENIED")
    ssh=["/usr/bin/ssh","-T",
         "-o","BatchMode=yes","-o","StrictHostKeyChecking=yes",
         "-o","NumberOfPasswordPrompts=0","-o","ConnectTimeout=10",
         "-o","ConnectionAttempts=1",
         "root@hel1","/usr/bin/python3 -I -B - --root-activate"]
    completed=subprocess.run(ssh,input=raw,timeout=300,check=False)
    need(completed.returncode==0,
         "REMOTE_R24_TRANSACTION_FAILED_OR_UNCERTAIN_NO_RETRY")
    print("PASS:R24_ROOT_OPERATOR_COMPLETED; REAL_PUBLIC_POSTFLIGHT_STILL_REQUIRED")
    return 0
if __name__=="__main__":
    try:sys.exit(owner_main())
    except (Hold,OSError,ValueError,subprocess.TimeoutExpired) as exc:
        print("HOLD:R24_MAC:"+str(exc),file=sys.stderr)
        sys.exit(2)
