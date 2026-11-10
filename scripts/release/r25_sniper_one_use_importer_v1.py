#!/usr/bin/env python3
"""B: one-use exact FOUR-ASSET 3032 Sniper static-media repair.

Approved scope: Central App#1289 comment 6758764032; production source
30aecfc8c615e0361187c7990772dc51ca91b20e. Run via stdin on HEL1:
  python3 -B - --preflight
  python3 -B - --apply --approval 6758764032
  python3 -B - --rollback --approval 6758764032

Only the four exact named files may be installed to the existing read-only
projection source. Journal is durable within that one authorized directory.
No external services/files/config/wallets/SQL are mutated. All CLI operations
are irreversibly bound to this one authorization ID and known sources.
"""
from __future__ import annotations
import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

ROOT = Path("/mnt/HC_Volume_105319120/aoe2-managed-assets")
SRC = ROOT / "uploads" / "managed-assets" / "avatar"
DEST = ROOT / "avatar"
PUBLIC_PROJECTION = "/run/aoe2war-public-media/avatar"
JOURNAL_NAME = ".r25-sniper-6758764032-one-use.journal"
STAGE_PREFIX = ".r25-sniper-6758764032-"
APPROVAL = "6758764032"
SOURCE_HEAD = "30aecfc8c615e0361187c7990772dc51ca91b20e"
R25 = "b1ef050b954be734c9f34147361e0d02d7c89b19"
MANIFEST_SHA = "b1e728277b9502c9a85983fee4b2e2ee6701c2d08ba0600b2d2205ea52391482"
PRELOADER_SHA = "5edf4485be0884922935295600adf7c8b3c17fe697b962d31e7f17b09e8f3ec3"
NAME = "sniper-1781562832558-257d25a4"
PINS = {
 NAME + ".png": ("dcb7e42340df8f817d3c14f3e28b4bd30c9109e98bb4decd5b59c52af33b5530",1911925,0o775,1000,1000),
 NAME + ".webp": ("c153e4bcd4c83dc4c058969eed45dcea4a8ddf9d179df635a4e6dbb3bf19f135",338284,0o644,0,0),
 NAME + ".card.webp": ("87cd2af1c80e7df61056bbee1ac7efc99618f8f5cab6e1e9ec7dee86c3ed1f45",83646,0o644,0,0),
 NAME + ".thumb.webp": ("ada9a6b655adc88ed98efeec8cf6d4300cc79783e70bcc233740328da74b310c",17866,0o644,0,0),
}
FEATURED = (
 "user-u-06c16d39d25c476fac2c86fee7b4d189-featured",
 "user-u-17816384361f4c8a8d57c6934265100b-featured",
 "user-u-1301e0492fdf4a229d941940413497e1-featured",
)
CACHE = "public, max-age=86400, stale-while-revalidate=604800"
HEADERS = {"Accept":"image/webp", "Cache-Control":"no-cache","User-Agent":"AoE2WAR-SessionB-OneUse-20261110"}
MAX_BODY = 2_500_000

class Hold(Exception):
    pass

def need(ok: bool, reason: str):
    if not ok:
        raise Hold("HOLD_R25_SNIPER_" + reason)

def canonical(item):
    return json.dumps(item, sort_keys=True, separators=(",",":"), ensure_ascii=True).encode()

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def exact_dir(path: Path, expected: Path, *, fixture: bool=False):
    need(isinstance(path, Path) and str(path) == str(expected), "PATH_SCOPE")
    for p in reversed((path, *path.parents)):
        info = p.lstat()
        need(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode), "DIRECTORY_SYMLINK_OR_TYPE")
    info = path.stat()
    if not fixture:
        need(stat.S_IMODE(info.st_mode)==0o775 and info.st_uid==1000 and info.st_gid==1000, "DIRECTORY_MODE_OWNER_DRIFT")
    return info

def read_pinned(path: Path, name: str, from_source: bool, root: Path=ROOT, allow_two_links:bool=False):
    need(name in PINS and path.parent == ((root/"uploads"/"managed-assets"/"avatar") if from_source else (root/"avatar")), "FILE_PATH_SCOPE")
    flags = os.O_RDONLY | getattr(os,"O_NOFOLLOW",0)
    try:
        fd = os.open(path,flags)
    except OSError as exc:
        raise Hold("HOLD_R25_SNIPER_FILE_MISSING_OR_SYMLINK") from exc
    with os.fdopen(fd,"rb") as f:
        info=os.fstat(f.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_nlink in ((1,2) if allow_two_links else (1,)), "FILE_TYPE_HARDLINK")
        need(info.st_size==PINS[name][1] and info.st_size<=MAX_BODY, "FILE_SIZE")
        if from_source and root==ROOT:
            need(stat.S_IMODE(info.st_mode)==PINS[name][2] and info.st_uid==PINS[name][3] and info.st_gid==PINS[name][4],
                 "SOURCE_PERMISSION_DRIFT")
        elif not from_source and root==ROOT:
            need(stat.S_IMODE(info.st_mode)==0o644 and info.st_uid==0 and info.st_gid==0,
                 "TARGET_PERMISSION_DRIFT")
        body=f.read(MAX_BODY+1)
        need(len(body)==info.st_size and digest(body)==PINS[name][0], "CONTENT_SHA")
        return body, info

def inspect_assets(root: Path=ROOT, source: Path=SRC, dest: Path=DEST):
    s=exact_dir(source,root/"uploads"/"managed-assets"/"avatar",fixture=root!=ROOT)
    t=exact_dir(dest,root/"avatar",fixture=root!=ROOT)
    need(s.st_dev==t.st_dev and s.st_ino!=t.st_ino, "SOURCE_TARGET_DEVICE")
    # Do not accept any unexpected old/new variation for this unique basename.
    for area in (source,dest):
        extras=[p.name for p in area.iterdir() if p.name.startswith(NAME) and p.name not in PINS]
        need(not extras, "UNEXPECTED_SNIPER_FILES")
    j=dest/JOURNAL_NAME
    need(not j.exists() and not j.is_symlink(), "JOURNAL_ALREADY_EXISTS_ONE_USE")
    need(not any(p.name.startswith(STAGE_PREFIX) for p in dest.iterdir()), "STAGED_TEMP_EXISTS")
    seen=[]
    for name in sorted(PINS):
        read_pinned(source/name,name,True,root)
        target=dest/name
        try:
            target.lstat()
        except FileNotFoundError:
            seen.append(name)
        else:
            raise Hold("HOLD_R25_SNIPER_DESTINATION_NOT_EMPTY")
    need(len(seen)==4, "EXACT_FOUR_MISSING")
    manifest=[{"filename":name,"sha256":PINS[name][0],"size":PINS[name][1]} for name in sorted(PINS)]
    need(digest(canonical(manifest))==MANIFEST_SHA, "MANIFEST_SHA_MISMATCH")
    return {"status":"PASS_PRESTATE_FOUR_FILES_MISSING", "manifest_sha256":MANIFEST_SHA,
            "source_inode":s.st_ino,"projection_inode":t.st_ino,
            "source_device":s.st_dev,"projection_device":t.st_dev,"files":seen,
            "source_scope":str(source),"target_scope":str(dest)}

def command(args: list[str]):
    p=subprocess.run(args,text=True,capture_output=True,timeout=8)
    need(p.returncode==0, "HOST_COMMAND_" + args[0].split("/")[-1])
    return p.stdout.strip()

def service(name,key):
    return command(["systemctl","show",name,"-p",key,"--value"])

def host_health(*, check_mount=True):
    need(os.name=="posix" and sys.platform=="linux" and os.geteuid()==0,
         "HOST_PRIVILEGE_OR_OS")
    web=int(service("aoe2hdbets-web-prod.service","MainPID"))
    old=int(service("aoe2hdbets-web.service","MainPID"))
    paper=int(service("kingdom-traders-paper.service","MainPID"))
    need(web==701398 and old==2625090 and paper==779129,"PROTECTED_PID_CHANGED")
    for name in ("aoe2hdbets-web-prod.service","aoe2hdbets-web.service","kingdom-traders-paper.service"):
        need(service(name,"ActiveState")=="active" and service(name,"NRestarts")=="0",
             "SERVICE_NOT_STABLE")
    need(service("aoe2war-steam-egress-refresh.timer","ActiveState")=="active",
         "STEAM_V20_TIMER_NOT_ACTIVE")
    need(service("kingdom-traders-paper.service","MemoryMax")=="100663296",
         "PAPER_96M_MEMORY_GUARD_CHANGED")
    sockets=command(["ss","-H","-ltn"]).splitlines()
    for line in sockets:
        fields=line.split()
        if len(fields)>=4:
            need(not re.search(r":(?:8092|8093|8094|8095)$", fields[3]),
                 "FINANCIAL_PORT_LISTENER")
    need(any(re.search(r"127\.0\.0\.1:9447$",l.split()[3]) for l in sockets
                 if len(l.split())>=4), "PAPER_HTTPS_NOT_RUNNING")
    need(Path("/var/lib/aoe2war-web-prod-b1ef050b954b/.aoe2war-source-sha").read_text().strip()==R25,
         "R25_SOURCE_CHANGED")
    guard=Path("/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs")
    need(digest(guard.read_bytes())==PRELOADER_SHA, "PRODUCTION_PRELOADER_CHANGED")
    mount=service("aoe2hdbets-web-prod.service","BindReadOnlyPaths").split()
    needed=str(DEST)+":"+PUBLIC_PROJECTION+":rbind"
    need(needed in mount,"READONLY_BIND_SOURCE_CHANGED")
    if check_mount:
        n=command(["nsenter","-t",str(web),"-m","--","stat","-c","%d:%i",PUBLIC_PROJECTION])
        st=DEST.stat()
        need(n==str(st.st_dev)+":"+str(st.st_ino),"MOUNT_SOURCE_NOT_SAME_INODE")
        options=command(["nsenter","-t",str(web),"-m","--","findmnt","-n","-T",PUBLIC_PROJECTION,"-o","OPTIONS"])
        need("ro" in options.split(","),"MOUNT_NOT_READ_ONLY")
    mem=next((int(line.split()[1]) for line in Path("/proc/meminfo").read_text().splitlines()
              if line.startswith("MemAvailable:")),0)
    need(mem>=512000,"INSUFFICIENT_MEM_HEADROOM")
    v=os.statvfs(str(DEST))
    need(v.f_bavail*v.f_frsize>=50_000_000,"INSUFFICIENT_FREE_MEDIA_BYTES")
    return {"web_pid":web,"rollback_pid":old,"paper_pid":paper,
            "paper_mem_limit_bytes":100663296,"steam_v20_timer":"active",
            "finance_listeners":0,"managed_media_bind_read_only":True,
            "r25_source":R25,"prod_guard_sha256":PRELOADER_SHA}

def open_journal(dest: Path):
    path=dest/JOURNAL_NAME
    flags=os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_EXCL | getattr(os,"O_NOFOLLOW",0)
    try:
        fd=os.open(path,flags,0o600)
    except FileExistsError as exc:
        raise Hold("HOLD_R25_SNIPER_ONE_USE_JOURNAL_EXISTS") from exc
    os.fsync(fd)
    syncdir(dest)
    return fd

def syncdir(dest:Path):
    fd=os.open(dest,os.O_RDONLY|os.O_DIRECTORY|getattr(os,"O_NOFOLLOW",0))
    try: os.fsync(fd)
    finally: os.close(fd)

def append(fd:int,event:str,**details):
    payload=canonical({"event":event, "approval":APPROVAL, "manifest":MANIFEST_SHA, **details})+b"\n"
    need(os.write(fd,payload)==len(payload),"JOURNAL_SHORT_WRITE")
    os.fsync(fd)

def load_journal(dest: Path):
    path=dest/JOURNAL_NAME
    flags=os.O_RDONLY | getattr(os,"O_NOFOLLOW",0)
    fd=os.open(path,flags)
    with os.fdopen(fd,"rb") as f:
        s=os.fstat(f.fileno())
        need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600,
             "JOURNAL_TYPE_MODE")
        data=f.read(65_537)
        need(len(data)<=65_536 and data.endswith(b"\n"),"JOURNAL_TRUNCATED")
    entries=[json.loads(line) for line in data.splitlines()]
    need(entries and entries[0]["event"]=="BEGIN", "JOURNAL_BEGIN")
    for e in entries:
        need(e["approval"]==APPROVAL and e["manifest"]==MANIFEST_SHA,"JOURNAL_PIN_DRIFT")
        need(e["event"] in ("BEGIN","PREPARED","INSTALLED","POST_PARITY_PASS",
                            "ROLLBACK_REASON","ROLLED_BACK","COMPLETED","TEMP_INTENT","TEMP_OPENED"),"JOURNAL_UNTRUSTED_EVENT")
    need(len(entries)<=20,"JOURNAL_ENTRY_COUNT")
    return entries

def rollback(dest:Path=DEST, *, reason:str="EXPLICIT", injury=None):
    # Only this one transaction's prepared inode may be removed. Never remove
    # a matching-name file created by somebody else, even if bytes are equal.
    entries=load_journal(dest)
    need(not any(e["event"]=="COMPLETED" for e in entries),"ALREADY_COMPLETED_NO_ROLLBACK")
    prepared={e["name"]:e["inode"] for e in entries if e["event"]=="PREPARED"}
    need(len(prepared)<=4 and set(prepared).issubset(PINS),"BAD_PREPARED_NAMES")
    fd=os.open(dest/JOURNAL_NAME,os.O_WRONLY|os.O_APPEND|getattr(os,"O_NOFOLLOW",0))
    try:
        append(fd,"ROLLBACK_REASON",why=reason[:120])
        removed=[]
        for name, inode in sorted(prepared.items(),reverse=True):
            for target in (dest/name, dest/(STAGE_PREFIX+name+".tmp")):
                try: s=target.lstat()
                except FileNotFoundError: continue
                need(stat.S_ISREG(s.st_mode) and s.st_ino==inode and s.st_nlink in (1,2),
                     "ROLLBACK_FOREIGN_OR_CHANGED_FILE")
                if target.name==name:
                    read_pinned(target,name,False,dest.parent,allow_two_links=True)
                # Temporary file must have approved mode/content too.
                else:
                    with target.open("rb") as f: b=f.read(MAX_BODY+1)
                    need(digest(b)==PINS[name][0] and len(b)==PINS[name][1],
                         "ROLLBACK_TEMP_CHANGED")
                target.unlink()
                removed.append(target.name)
                syncdir(dest)
        intent={e["name"] for e in entries if e["event"]=="TEMP_INTENT"}
        opened={e["name"]:e["inode"] for e in entries if e["event"]=="TEMP_OPENED"}
        need(intent.issubset(PINS) and set(opened).issubset(intent),"BAD_TEMP_INTENT")
        for name in sorted(intent - set(prepared)):
            tmp=dest/(STAGE_PREFIX+name+".tmp")
            try: s=tmp.lstat()
            except FileNotFoundError: continue
            # We must never delete a file merely because it has our temp NAME.
            # TEMP_OPENED with inode was fsynced before the first data write.
            need(name in opened and s.st_ino==opened[name] and
                 stat.S_ISREG(s.st_mode) and s.st_nlink==1 and
                 s.st_size<=PINS[name][1] and
                 (dest.parent!=ROOT or s.st_uid==0),"UNTRACKED_TEMP_CHANGED")
            tmp.unlink()
            removed.append(tmp.name)
            syncdir(dest)
        append(fd,"ROLLED_BACK",removed=removed)
        return {"status":"PASS_ROLLED_BACK","removed":removed,"journal_preserved":str(dest/JOURNAL_NAME)}
    finally:
        os.close(fd)

def http_image(port:int,target:str):
    from urllib.parse import urlencode
    path="/api/media-assets/avatar/"+target+"?"+urlencode(
        {"size":"card","fallback":"/champions/players/silhouette.card.webp"})
    conn=http.client.HTTPConnection("127.0.0.1",port,timeout=8)
    try:
        conn.request("GET",path,headers=HEADERS)
        response=conn.getresponse()
        data=response.read(MAX_BODY+1)
        need(response.status==200,"PARITY_HTTP_"+str(port))
        need(len(data)<=MAX_BODY and data[:4]==b"RIFF" and data[8:12]==b"WEBP",
             "PARITY_WEBP_BYTES")
        need(response.getheader("content-type","").split(";")[0].strip()=="image/webp",
             "PARITY_MIME")
        need(response.getheader("x-aoe2war-media-proxy","")=="direct-managed",
             "PARITY_NOT_MANAGED")
        need(response.getheader("Cache-Control","")==CACHE,"PARITY_CACHE_POLICY")
        return digest(data),len(data)
    finally:
        conn.close()

def acceptance():
    cases=[]
    for target in FEATURED:
        old=http_image(3030,target)
        new=http_image(3032,target)
        need(old==new,"PORTRAIT_PARITY")
        cases.append({"target":target,"sha256":new[0],"bytes":new[1]})
    need(len({x["sha256"] for x in cases})==3,"THREE_DISTINCT_MANAGED")
    need(cases[-1]["sha256"]==PINS[NAME+".card.webp"][0] and
         cases[-1]["bytes"]==PINS[NAME+".card.webp"][1],"SNIPER_EXPECTED_BODY")
    return {"status":"PASS_3_OF_3_PUBLIC_PORTRAIT_PARITY",
            "cases":cases,"mime":"image/webp","cache":CACHE}

def release(root:Path=ROOT, *, probes:bool=True, after_link=None, accept=None):
    # Synthetic tests inject a disposable root; live CLI cannot.
    src=root/"uploads"/"managed-assets"/"avatar"
    dest=root/"avatar"
    if probes: baseline=host_health()
    else: baseline={"fixture_only":True}
    pre=inspect_assets(root,src,dest)
    fd=open_journal(dest)
    # BEGIN fsync precedes ANY asset temp/installed link.
    committed=False
    try:
        append(fd,"BEGIN",pre=pre, host=baseline)
        for name in sorted(PINS):
            body, _=read_pinned(src/name,name,True,root)
            append(fd,"TEMP_INTENT",name=name)
            temp=dest/(STAGE_PREFIX+name+".tmp")
            flags=os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,"O_NOFOLLOW",0)
            tfd=os.open(temp,flags,0o644)
            opened_info=os.fstat(tfd)
            # Journal the inode BEFORE writing; a power loss may leave a
            # partial temp which is deletable only with this exact inode pin.
            append(fd,"TEMP_OPENED",name=name,inode=opened_info.st_ino)
            try:
                with os.fdopen(tfd,"wb",closefd=False) as f:
                    f.write(body);f.flush()
                os.fsync(tfd)
                info=os.fstat(tfd)
                need(info.st_size==len(body) and info.st_nlink==1 and
                     stat.S_IMODE(info.st_mode)==0o644,"TEMP_WRONG_METADATA")
            finally:
                os.close(tfd)
            syncdir(dest)
            # PREPARED inode is durable *before* no-replace final hardlink.
            append(fd,"PREPARED",name=name,inode=info.st_ino)
            os.link(temp,dest/name,follow_symlinks=False) # atomic NO-REPLACE
            syncdir(dest)
            if after_link: after_link(name)  # simulate lost ack in disposable test
            append(fd,"INSTALLED",name=name,inode=info.st_ino)
            os.unlink(temp)
            syncdir(dest)
            read_pinned(dest/name,name,False,root)
        health_post=host_health() if probes else baseline
        need(health_post==baseline,"HOST_STATE_DRIFT_AFTER_IMPORT")
        verified=accept() if accept else acceptance()
        append(fd,"POST_PARITY_PASS",verified=verified)
        append(fd,"COMPLETED",installed=sorted(PINS),host=health_post)
        committed=True
        return {"status":"DEPLOYED_FOUR_PINNED_SNIPER_MEDIA","pre":pre,
                "host":baseline,"parity":verified,"journal":str(dest/JOURNAL_NAME)}
    except Exception as exc:
        os.close(fd)
        fd=-1
        rescue=rollback(dest,reason=str(exc))
        raise Hold("HOLD_R25_SNIPER_AUTO_ROLLBACK_"+str(exc)+";"+rescue["status"]) from exc
    finally:
        if fd>=0: os.close(fd)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preflight",action="store_true")
    mode.add_argument("--apply",action="store_true")
    mode.add_argument("--rollback",action="store_true")
    parser.add_argument("--approval")
    args=parser.parse_args()
    try:
        if args.preflight:
            need(args.approval is None,"UNEXPECTED_APPROVAL_ARG")
            result={"host":host_health(),"pre":inspect_assets()}
            print(json.dumps(result,sort_keys=True))
            return 0
        need(args.approval==APPROVAL,"APPROVAL_MISSING_OR_WRONG")
        if args.apply:
            result=release()
        else:
            need(os.geteuid()==0 and sys.platform=="linux","HOST_PRIVILEGE_OR_OS")
            exact_dir(SRC,SRC);exact_dir(DEST,DEST)
            result=rollback(reason="OWNER_AUTHORIZED_RECOVERY")
        print(json.dumps(result,sort_keys=True))
        return 0
    except Exception as exc:
        print(json.dumps({"status":str(exc),"finance_authorized":False,
                          "general_website_release_authorized":False},sort_keys=True))
        return 3

if __name__=="__main__":
    raise SystemExit(main())
