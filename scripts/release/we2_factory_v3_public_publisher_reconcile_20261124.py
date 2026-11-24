#!/usr/bin/python3
"""WE2 P0 original Atlas ninth-only Factory public publisher one-file CAS.

This is a separately-reviewed host source transaction, NOT a website
release, Factory installer replay, service restart, retention or financial
authority. Run only after exact PR merge and fresh owner-native approval.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

MAIN_SOURCE_BASE="d7797cf7e34b230031193c563e7505b3c2b55c64"
OLD_SHA="ca7a8150ecc860ef6a9ea328ca1921665a69e2720ebc0f48b5ffae7f716c364a"
NEW_SHA="e1ba18b10824a00b3d942d94b7748a2d66fc20d6b100b402130ea89552c050af"
PUBLISHER=Path("/usr/local/sbin/aoe2war_factory_public_status_v2.py")
STAGED_DIR=Path("/home/tony/we2-factory-v3-public-publisher-source-20261124")
STAGED=STAGED_DIR/PUBLISHER.name
BACKUP_DIR=Path("/root/aoe2war-factory-public-v3-repair-20261124")
BACKUP=BACKUP_DIR/"original-publisher-v2.py"
RECEIPT=BACKUP_DIR/"installed-receipt-v1.json"
JOURNAL=Path("/var/lib/aoe2war-product-release-v1/ed4b0ac87872")
SEAL_SHA="b187ac42e0a81ad94ccdefbee629e775fba25a0edcda5e9110f8dd1f9f43ffd3"
NINTH_SHA="dfcf6e473e948c490d22c30e98814f3a8ec451359d3c9241dc754376e9592363"
SOURCE="ed4b0ac878725eeb62c86b79ae416511da903e7d"
BUILD="aSDC8qDlHCYjWunM7GR2N"
SERVICE="aoe2hdbets-web-prod.service"
class Hold(Exception):pass
def need(ok,code):
    if not ok:raise Hold(code)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def trusted(path,owner,mode,regular=True):
    s=path.lstat()
    need(not path.is_symlink() and s.st_uid==owner and
         stat.S_IMODE(s.st_mode)==mode and
         (stat.S_ISREG(s.st_mode) and s.st_nlink==1 if regular
          else stat.S_ISDIR(s.st_mode)), "INODE_AUTHORITY_"+path.name)
    return s
def read_stable(path,owner,mode,maxbytes=200000):
    s=trusted(path,owner,mode)
    need(0<s.st_size<=maxbytes,"SIZE_"+path.name)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd)
        raw=b""
        while len(raw)<=maxbytes:
            chunk=os.read(fd,65536)
            if not chunk:break
            raw+=chunk
        after=os.fstat(fd)
        need(len(raw)==s.st_size and len(raw)<=maxbytes and
             (before.st_dev,before.st_ino,before.st_size,before.st_ctime_ns,before.st_mtime_ns)==
             (after.st_dev,after.st_ino,after.st_size,after.st_ctime_ns) and
             (before.st_dev,before.st_ino)==(s.st_dev,s.st_ino),
             "READ_RACE_"+path.name)
        return raw
    finally:os.close(fd)
def syncdir(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
def write_once(path,data,mode):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    try:
        os.fchown(fd,0,0)
        os.fchmod(fd,mode)
        total=0
        while total<len(data):
            n=os.write(fd,data[total:])
            need(n>0,"SHORT_WRITE")
            total+=n
        os.fsync(fd)
    finally:os.close(fd)
    syncdir(path.parent)
def host():
    need(os.geteuid()==0 and os.uname().sysname=="Linux" and
         os.uname().machine=="x86_64","OWNER_ROOT_HOST_REQUIRED")
    trusted(Path("/root"),0,0o700,False)
    trusted(PUBLISHER.parent,0,0o755,False)
    trusted(STAGED_DIR,1000,0o700,False)
    need(not JOURNAL.is_symlink(),"JOURNAL_SYMLINK")
    trusted(JOURNAL,0,0o700,False)
    for name,expected in (("release-seal-v1.json",SEAL_SHA),
                          ("deployment-invocation-v1.json",NINTH_SHA)):
        need(sha(read_stable(JOURNAL/name,0,0o600,1000000))==expected,
             "ORIGINAL_ATLAS_T10_"+name)
    state=json.loads(read_stable(JOURNAL/"state.json",0,0o600))
    need(state.get("phase")=="live" and state.get("source")==SOURCE
         and state.get("build")==BUILD and
         state.get("active_runtime")=="/var/lib/aoe2war-web-prod-"+SOURCE[:12],
         "ORIGINAL_ATLAS_JOURNAL_IDENTITY")
    x=subprocess.run(["systemctl","show",SERVICE,"-p","ActiveState","-p","NRestarts",
                      "-p","WorkingDirectory"],text=True,capture_output=True,timeout=8)
    need(x.returncode==0 and "ActiveState=active" in x.stdout and
         "NRestarts=0" in x.stdout and
         "WorkingDirectory=/var/lib/aoe2war-web-prod-"+SOURCE[:12] in x.stdout,
         "PROTECTED_WEB_SERVICE_DRIFT")
    ss=subprocess.run(["/usr/bin/ss","-H","-ltn"],capture_output=True,text=True,timeout=8)
    need(ss.returncode==0 and all(
        re.search(":"+str(port)+r"(?=\s)",ss.stdout) is None
        for port in range(8092,8096)),"FINANCIAL_PORT_BOUNDARY")
def preflight():
    host()
    raw=read_stable(STAGED,1000,0o600)
    need(sha(raw)==NEW_SHA,"EXACT_REVIEWED_PUBLIC_SOURCE")
    current=read_stable(PUBLISHER,0,0o644)
    old_or_new=sha(current)
    need(old_or_new in (OLD_SHA,NEW_SHA),"ROOT_PUBLISHER_CAS_PREIMAGE")
    if BACKUP_DIR.exists():
        trusted(BACKUP_DIR,0,0o700,False)
        original=read_stable(BACKUP,0,0o400)
        need(sha(original)==OLD_SHA,"ORIGINAL_BACKUP_SHA")
    return raw,old_or_new
def install():
    raw,current=preflight()
    need(os.environ.get("WE2_OWNER_NATIVE_GUI_PUBLISHER_APPROVED")==
         "WE2_1498_ONE_FILE_PUBLICATION_ONLY", "OWNER_SOURCE_APPROVAL_REQUIRED")
    if not BACKUP_DIR.exists():
        BACKUP_DIR.mkdir(mode=0o700)
        syncdir(BACKUP_DIR.parent)
    trusted(BACKUP_DIR,0,0o700,False)
    if not BACKUP.exists():
        need(current==OLD_SHA,"MISSING_PREIMAGE")
        write_once(BACKUP,read_stable(PUBLISHER,0,0o644),0o400)
    need(sha(read_stable(BACKUP,0,0o400))==OLD_SHA,"BACKUP_SHA")
    if current==OLD_SHA:
        tmp=PUBLISHER.with_name("."+PUBLISHER.name+".we2-v3-"+NEW_SHA[:16]+".tmp")
        need(not os.path.lexists(tmp),"STAGED_ROOT_TEMP_ALREADY_EXISTS")
        write_once(tmp,raw,0o644)
        need(sha(read_stable(PUBLISHER,0,0o644))==OLD_SHA,"CAS_OLD_MOVED")
        need(sha(read_stable(tmp,0,0o644))==NEW_SHA,"CAS_NEW_SOURCE")
        os.replace(tmp,PUBLISHER)
        syncdir(PUBLISHER.parent)
    need(sha(read_stable(PUBLISHER,0,0o644))==NEW_SHA,"POSTIMAGE_SOURCE")
    host()
    receipt={
        "schema":"aoe2war.we2.factory-v3-public-one-file-install.v1",
        "status":"PASS_ORIGINAL_ATLAS_NINTH_PUBLIC_PUBLISHER_POSTIMAGE",
        "fromSha256":OLD_SHA,"toSha256":NEW_SHA,
        "originalSourceSha":SOURCE,"originalBuildId":BUILD,
        "originalRootSealSha256":SEAL_SHA,"originalNinthRootSha256":NINTH_SHA,
        "noAtlasRedeployment":True,"noT8":True,"financialAuthorized":False,
        "sourceReviewBase":MAIN_SOURCE_BASE,
        "installedAt":dt.datetime.now(dt.timezone.utc).isoformat()
    }
    if not RECEIPT.exists():
        write_once(RECEIPT,(json.dumps(receipt,sort_keys=True)+"\n").encode(),0o600)
    else:
        old=json.loads(read_stable(RECEIPT,0,0o600))
        need(old.get("toSha256")==NEW_SHA and
             old.get("originalNinthRootSha256")==NINTH_SHA,
             "INSTALL_RECEIPT_COLLISION")
    return {"status":"PASS_ONE_FILE_V3_PUBLIC_PUBLISHER_INSTALLED",
            "newSha256":NEW_SHA,
            "originalNinthSha256":NINTH_SHA,
            "originalT10Untouched":True,"noWebsiteSwitch":True}
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    group=ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--check",action="store_true")
    group.add_argument("--install",action="store_true")
    args=ap.parse_args()
    try:
        if args.install:result=install()
        else:
            _,existing=preflight()
            result={"status":"PASS_EXACT_V3_PUBLIC_PUBLISHER_PREFLIGHT",
                    "currentSha256":existing,"targetSha256":NEW_SHA,
                    "rootNinthSha256":NINTH_SHA,"noHostChanges":True}
        print(json.dumps(result,sort_keys=True))
    except (OSError,ValueError,Hold,subprocess.TimeoutExpired) as e:
        print("HOLD_WE2_V3_PUBLISHER_"+str(e))
        return 3
    return 0
if __name__=="__main__":raise SystemExit(main())
