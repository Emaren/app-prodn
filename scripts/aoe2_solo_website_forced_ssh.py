#!/usr/bin/env python3
"""HEL1 forced-command entrypoint for two distinct restricted SSH root keys.

Install only with authorized_keys restrict,command= observer or command mode.
No arbitrary shell/user-selected helper; no private-key provisioning.
All installed helper bytes require independent review and root SHA pins.
"""
from __future__ import annotations
import base64, hashlib, json, os, re, socket, stat, sys
from pathlib import Path

HOST="ubuntu-4gb-hel1-11"
ROOT=Path("/usr/local/libexec/aoe2war")
TRUST=Path("/etc/aoe2war/solo-owner-website-v1/approved-helpers.json")
HELPERS={"observer":ROOT/"solo-v1-readonly-observer",
         "channel":ROOT/"solo-v1-command-channel.py",
         "phase":ROOT/"solo-v1-root-phase"}
LOCK="/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock"
SSH_KEYS=Path("/etc/aoe2war/solo-owner-website-v1/approved-ssh-keys.json")
AUTHORIZED=Path("/root/.ssh/authorized_keys")
FORCED="/usr/bin/python3 /usr/local/libexec/aoe2war/solo-v1-forced-ssh.py"
HEX40=re.compile(r"[a-f0-9]{40}\Z")
HEX64=re.compile(r"[a-f0-9]{64}\Z")
class Hold(RuntimeError):pass
def need(ok,msg):
    if not ok:raise Hold("FORCED_SSH_HOLD: "+msg)
def trusted_bytes(path,limit=262144):
    need(path.is_absolute(),"bad path")
    for component in (path,*path.parents):
        st=component.lstat()
        need(st.st_uid==0 and not st.st_mode&0o022 and
             not stat.S_ISLNK(st.st_mode),"untrusted helper ancestor")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        st=os.fstat(fd)
        need(stat.S_ISREG(st.st_mode) and 0<st.st_size<=limit,"bad helper")
        buf=b""
        while True:
            part=os.read(fd,8192)
            if not part:break
            buf+=part
            need(len(buf)<=limit,"oversized trusted helper")
        return buf
    finally:os.close(fd)
def pinned_helper(name):
    trust=json.loads(trusted_bytes(TRUST,32768))
    need(type(trust)is dict and set(trust)==set(HELPERS),"not enrolled")
    raw=trusted_bytes(HELPERS[name])
    digest=hashlib.sha256(raw).hexdigest()
    need(trust[name]==digest,"root helper SHA drift")
    return raw,digest
def verify_forced_authorized_keys():
    """Fail closed unless sshd is configured to force both distinct keys."""
    enrolled=json.loads(trusted_bytes(SSH_KEYS,32768))
    need(type(enrolled)is dict and
         set(enrolled)=={"observer","command"},
         "owner-approved distinct SSH public keys not enrolled")
    lines=trusted_bytes(AUTHORIZED,262144).decode("utf8").splitlines()
    expected=[]
    for mode in ("observer","command"):
        pub=enrolled[mode]
        need(type(pub)is str and
             re.fullmatch(r"ssh-ed25519 [A-Za-z0-9+/=]{50,500}",pub),
             "invalid enrolled SSH ED25519 public identity")
        expected.append('restrict,command="'+FORCED+' '+mode+'" '+pub)
    need(expected[0]!=expected[1] and
         all(lines.count(line)==1 for line in expected),
         "server sshd root forced-command bindings absent/duplicated")
    return True

def main(mode,original):
    need(sys.platform=="linux" and os.geteuid()==0 and
         socket.gethostname()==HOST,"wrong native HEL1 root")
    need(mode in ("observer","command"),"unrecognized key role")
    verify_forced_authorized_keys()
    need(type(original)is str and 0<len(original)<=6144,"invalid SSH request")
    if mode=="observer":
        need(original=="aoe2war-solo-observe",
             "observer key denies all other commands")
        src,digest=pinned_helper("observer")
        path=str(HELPERS["observer"])
        print(digest+"  "+path,flush=True)
        sys.argv=[path,"--read-only-json"]
        exec(compile(src,path,"exec"),{"__name__":"__main__","__file__":path})
        return
    tokens=original.split(" ")
    need(all(tokens),"malformed command")
    if tokens[0]=="aoe2war-solo-channel":
        need(len(tokens)==2 and re.fullmatch("[A-Za-z0-9+/=]{8,6144}",tokens[1]),
             "channel requires one encoded lease holder")
        holder=base64.b64decode(tokens[1],validate=True).decode("utf8")
        need(len(holder)<4096 and type(json.loads(holder))is dict,
             "noncanonical lease holder")
        src,_=pinned_helper("channel")
        namespace={"__name__":"aoe2_solo_website_command_channel",
                   "__file__":str(HELPERS["channel"])}
        exec(compile(src,str(HELPERS["channel"]),"exec"),namespace)
        remote=namespace["REMOTE"]
        need(type(remote)is str and len(remote)<262144,"lease engine missing")
        os.execv("/usr/bin/python3",["/usr/bin/python3","-u","-c",remote,LOCK,holder])
    elif tokens[0]=="aoe2war-solo-issue":
        need(len(tokens) in (3,6) and
             tokens[1] in ("PRE_STAGE","PRE_ACTIVATE") and
             bool(HEX40.fullmatch(tokens[2])),"bad root issue")
        if tokens[1]=="PRE_STAGE":
            need(len(tokens)==3,"stage issue must be fresh")
        else:
            need(len(tokens)==6 and
                 all(HEX64.fullmatch(x)for x in tokens[3:]),
                 "invalid activation attempt/lease/receipt digest")
        pinned_helper("phase")
        os.execv("/usr/bin/python3",
                 ["/usr/bin/python3",str(HELPERS["phase"]),"issue",*tokens[1:]])
    else:raise Hold("unallowlisted SSH root verb")
if __name__=="__main__":
    try:
        need(len(sys.argv)==2,"server-selected forced key role missing")
        main(sys.argv[1],os.environ.get("SSH_ORIGINAL_COMMAND"))
    except (Hold,OSError,ValueError,KeyError,TypeError) as exc:
        print("HOLD: "+str(exc),file=sys.stderr)
        raise SystemExit(2)
