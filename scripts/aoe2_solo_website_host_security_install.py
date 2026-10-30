#!/usr/bin/env python3
"""HEL1 solo-owner root security installation gate. NO automatic installation.

Plan/verify are read-only. APPLY and ROLLBACK require an explicit interactive
owner authorization on the actual HEL1 root host. Never change the original
release.lock inode/uid1000/mode0644, never create another lock and never
silently weaken lock ancestry during rollback.
"""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys
import tempfile

HOST = "ubuntu-4gb-hel1-11"
LOCK = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
# Only these two formerly owner-writable directories may change ownership.
CONTROL = LOCK.parent.parent
LOCKS = LOCK.parent
ROOT_KEYS = Path("/root/.ssh/authorized_keys")
CONFIG = Path("/etc/aoe2war/solo-owner-website-v1")
ENROLLED = CONFIG / "approved-ssh-keys.json"
BACKUP = CONFIG / "pre-enrollment-authorized-keys.bak"
FORCED = "/usr/bin/python3 /usr/local/libexec/aoe2war/solo-v1-forced-ssh.py"

class Hold(RuntimeError):
    pass

def need(ok, why):
    if not ok:
        raise Hold("HEL1_ROOT_INSTALL_HOLD: " + why)

def require_host():
    need(sys.platform=="linux" and os.geteuid()==0 and
         socket.gethostname()==HOST, "not genuine HEL1 root")

def trusted(path, *, max_bytes=262144):
    need(path.is_absolute(), "relative trust file")
    for component in (path, *path.parents):
        st=component.lstat()
        need(not stat.S_ISLNK(st.st_mode) and st.st_uid==0 and
             not st.st_mode&0o022, "writable/linked trust ancestry: "+str(component))
    fd=os.open(path, os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        st=os.fstat(fd)
        need(stat.S_ISREG(st.st_mode) and 0<=st.st_size<=max_bytes,
             "invalid root trust file")
        data=os.read(fd,max_bytes+1)
        need(len(data)<=max_bytes, "oversized root trust")
        return data
    finally:
        os.close(fd)

def authorized_keys_file():
    data=trusted(ROOT_KEYS)
    need(data.endswith(b"\n") or not data, "existing authorized_keys not newline terminated")
    return data

def enrolled_keys():
    from base64 import b64decode, b64encode
    from binascii import Error
    obj=json.loads(trusted(ENROLLED,32768))
    need(type(obj)is dict and set(obj)=={"observer","command"},
         "two independently approved keys required")
    output={}
    wire_keys=[]
    for role in ("observer","command"):
        pub=obj[role]
        need(type(pub)is str and pub.startswith("ssh-ed25519 ") and
             pub.count(" ")==1,"noncanonical enrolled key")
        try: wire=b64decode(pub.split(" ")[1],validate=True)
        except (Error,ValueError) as exc: raise Hold("invalid Ed25519 wire key") from exc
        need(b64encode(wire).decode()==pub.split(" ")[1],
             "noncanonical public key encoding")
        def parse(offset):
            need(offset+4<=len(wire),"short key")
            size=int.from_bytes(wire[offset:offset+4],"big")
            need(0<size<=64 and offset+4+size<=len(wire),"bad key frame")
            return wire[offset+4:offset+4+size],offset+4+size
        alg,pos=parse(0)
        key,end=parse(pos)
        need(alg==b"ssh-ed25519" and len(key)==32 and end==len(wire),
             "not actual Ed25519 public key")
        wire_keys.append(key)
        output[role]=pub
    need(wire_keys[0]!=wire_keys[1],"observer and command reuse actual Ed25519 key")
    return output

def key_occurrences(lines,pub):
    """Detect same enrolled key across different authorized_keys options."""
    import re,base64
    wanted=base64.b64decode(pub.split(" ")[1],validate=True)
    matches=[]
    for line in lines:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        for item in re.findall(
                r"(?:^|\s)ssh-ed25519\s+([A-Za-z0-9+/=]+)(?=\s|$)",line):
            try:
                if base64.b64decode(item,validate=True)==wanted:
                    matches.append(line)
            except (ValueError,base64.binascii.Error):
                continue
    return matches

def expected_lines(keys):
    return ['restrict,command="'+FORCED+' '+role+'" '+keys[role]
            for role in ("observer","command")]

def check_key_lines(data,keys,*,installed):
    lines=data.decode("utf-8","strict").splitlines()
    wanted=expected_lines(keys)
    for role,line in zip(("observer","command"),wanted):
        matches=key_occurrences(lines,keys[role])
        need(matches==([line] if installed else []),
             "duplicate/alternate/unrestricted root SSH key for "+role)

def sshd_policy(connection):
    import ipaddress
    parts=connection.split()
    need(len(parts)==4,"supply owner-observed SSH_CONNECTION explicitly")
    client,cport,server,sport=parts
    try:
        ipaddress.ip_address(client); ipaddress.ip_address(server)
        need(1<=int(cport)<=65535 and 1<=int(sport)<=65535,"invalid SSH ports")
    except ValueError as exc:
        raise Hold("invalid SSH connection addresses") from exc
    cmd=["/usr/sbin/sshd","-T","-C",
         "user=root,host="+client+",addr="+client+",laddr="+server+",lport="+sport]
    p=subprocess.run(cmd,stdin=subprocess.DEVNULL,capture_output=True,timeout=10)
    need(p.returncode==0 and 0<len(p.stdout)<=131072,"cannot verify actual sshd policy")
    settings={}
    for row in p.stdout.decode().splitlines():
        key,sep,value=row.partition(" ")
        need(bool(sep) and key not in settings,"bad effective SSHD state")
        settings[key]=value.strip()
    need(settings.get("authorizedkeysfile")==".ssh/authorized_keys" and
         settings.get("authorizedkeyscommand")=="none" and
         settings.get("trustedusercakeys")=="none" and
         settings.get("authorizedprincipalsfile","none")=="none" and
         settings.get("pubkeyauthentication")=="yes" and
         settings.get("permitrootlogin") in
            ("yes","prohibit-password","forced-commands-only"),
         "alternate key provider or root SSH admission policy")
    p=subprocess.run(["/usr/sbin/sshd","-t"],capture_output=True,timeout=10)
    need(p.returncode==0,"sshd syntax failed")
    return settings

def lock_snapshot():
    st=LOCK.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==1000 and
         stat.S_IMODE(st.st_mode)==0o644,
         "canonical original lock uid/mode changed")
    return (st.st_dev,st.st_ino,st.st_uid,stat.S_IMODE(st.st_mode))

def lock_parents(*,allow_pending):
    # No attempt to take ownership of arbitrary volume ancestors.
    for p in (CONTROL.parent,*CONTROL.parent.parents):
        st=p.lstat()
        need(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and
             not st.st_mode&0o022,
             "unreviewed writable ancestor above os-control: "+str(p))
    pending=[]
    for p in (CONTROL,LOCKS):
        st=p.lstat()
        need(stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode) and
             not st.st_mode&0o022,
             "unreviewed writable lock directory: "+str(p))
        if st.st_uid!=0:
            need(allow_pending and st.st_uid==1000,
                 "unexpected lock ancestor owner; require independent review: "+str(p))
            pending.append(str(p))
    return pending

def prompt(operation):
    expected="AUTHORIZE HEL1 "+operation+" ROOT SECURITY"
    print("TYPE EXACTLY: "+expected,flush=True)
    need(sys.stdin.isatty() and input("Owner approval: ").strip()==expected,
         "owner did not approve change")

def atomic_write(path,data):
    fd,tmp=tempfile.mkstemp(prefix=".solo-root-",dir=str(path.parent))
    try:
        os.fchmod(fd,0o600)
        with os.fdopen(fd,"wb") as out:
            out.write(data);out.flush();os.fsync(out.fileno())
        os.replace(tmp,path)
        d=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(d)
        finally:os.close(d)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def save_backup(original):
    # Immutable original authorized_keys bytes, created only ONCE.
    fd=os.open(BACKUP,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as out:
        out.write(original);out.flush();os.fsync(out.fileno())
    d=os.open(CONFIG,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(d)
    finally:os.close(d)

def lock_exclusive():
    fd=os.open(LOCK,os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC)
    need((os.fstat(fd).st_dev,os.fstat(fd).st_ino)==lock_snapshot()[:2],
         "original lock swapped before transaction")
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError as exc:
        os.close(fd)
        raise Hold("original release in progress; no hardening") from exc
    return fd

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("mode",choices=["plan","verify","install","rollback-keys"])
    ap.add_argument("--ssh-connection",required=True,
                    help="exact owner-observed four-field SSH_CONNECTION; no secrets")
    args=ap.parse_args()
    require_host()
    keys=enrolled_keys()
    original=authorized_keys_file()
    sshd_policy(args.ssh_connection)
    before=lock_snapshot()
    pending=lock_parents(allow_pending=args.mode in ("plan","install"))
    if args.mode=="plan":
        check_key_lines(original,keys,installed=False)
        print("HOLD UNTIL OWNER APPROVES; root-only ancestors to harden:",pending)
        print("ORIGINAL_LOCK_UID1000_MODE0644_INODE:",before)
        print("ROOT_SSH_NEW_KEYS: two distinct keys, additive authorized_keys only")
        return
    if args.mode=="verify":
        need(not pending,"lock ancestor hardening not installed")
        check_key_lines(original,keys,installed=True)
        need(lock_snapshot()==before,"lock inode changed")
        print("PASS SOURCE-ENROLLMENT: keys and original lock; actual negative SSH probes STILL REQUIRED")
        return
    if args.mode=="install":
        need(not BACKUP.exists(),"old backup exists: manual reconciliation required")
        check_key_lines(original,keys,installed=False)
        prompt("INSTALL")
        fd=lock_exclusive()
        try:
            # Top-down removes rename access first. Original lock remains
            # untouched and held. Any unexpected parent ownership is HOLD.
            for directory in (CONTROL,LOCKS):
                st=directory.lstat()
                if st.st_uid==1000:
                    os.chown(directory,0,st.st_gid)
                need(directory.lstat().st_uid==0,"lock ancestry hardening failed")
            need(lock_parents(allow_pending=False)==[],"root-only lock ancestry unproven")
            need(lock_snapshot()==before,"canonical release lock replaced")
            save_backup(original)
            new=original+("\n".join(expected_lines(keys))+"\n").encode()
            need(authorized_keys_file()==original,
                 "another administrator changed root keys during enrollment")
            atomic_write(ROOT_KEYS,new)
            check_key_lines(authorized_keys_file(),keys,installed=True)
            sshd_policy(args.ssh_connection)
            need(lock_snapshot()==before,"original lock inode changed")
            print("PASS SOURCE ENROLLMENT: keys installed, original lock unchanged")
            print("HOLD UNTIL NATIVE NEGATIVE SSH PROBES AND REVIEWED HOST/FINANCE PROOFS")
        except Exception:
            # Restore only if we own an uncontested exact original backup.
            if BACKUP.exists():
                saved=trusted(BACKUP)
                if saved==original and ROOT_KEYS.exists():
                    atomic_write(ROOT_KEYS,original)
            raise
        finally:
            os.close(fd)
        return
    # Rollback removes ONLY this enrollment, never reopens original split-lock.
    need(not pending,"cannot roll back security with writable lock ancestry")
    saved=trusted(BACKUP)
    new=saved+("\n".join(expected_lines(keys))+"\n").encode()
    need(original==new,"authorized_keys changed since enrollment; refuse blind restore")
    check_key_lines(original,keys,installed=True)
    prompt("ROLLBACK")
    fd=lock_exclusive()
    try:
        need(lock_snapshot()==before,"original lock inode changed")
        need(authorized_keys_file()==new,
             "root authorized_keys changed during rollback")
        atomic_write(ROOT_KEYS,saved)
        check_key_lines(authorized_keys_file(),keys,installed=False)
        sshd_policy(args.ssh_connection)
        print("PASS ROOT SSH ENROLLMENT ROLLED BACK; LOCK ANCESTORS REMAIN PROTECTED")
        print("Do NOT chown lock parents back to UID1000; separate owner review required")
    finally:
        os.close(fd)

if __name__=="__main__":
    try:
        main()
    except (Hold,OSError,ValueError,TypeError,subprocess.TimeoutExpired) as exc:
        print("HOLD: "+str(exc),file=sys.stderr)
        raise SystemExit(2)
