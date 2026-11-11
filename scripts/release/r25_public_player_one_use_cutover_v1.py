#!/usr/bin/env python3
"""One-use restricted-3032 R25 player-only cutover; fail-closed, separately admitted.

--inspect is read-only. --stage, --activate, --rollback and --recover require a
fresh root-owned, exact-hash Central permit. NO operation modifies FINANCIAL,
Steam V20, Nginx, 3030, PAPER, SQL, permissions outside its own candidate and
the one exact restricted 3032 unit. Never runs a third Next.js server.
This SOURCE IS NOT A PRODUCTION PERMIT.
"""
from __future__ import annotations
import argparse
import datetime as dt
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tarfile
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import ctypes
import errno
from contextlib import contextmanager

HERE=Path(__file__).resolve().parent
REVIEWED_DEPENDENCY_SHAS={
    "r25_public_player_artifact_qualification_v1.py":
      "1565979cb3c1662f5764b6c3baab4d7a4333bba67472a723db006a3a3940e391",
    "r25_public_player_same_slot_preflight_v1.py":
      "87314320dd4aee0730d619a512d3625ac45a67d2030d6a0930d22ecbb4396de2",
}
def sibling(module,name):
    spec=importlib.util.spec_from_file_location(name,HERE/module)
    if spec is None or spec.loader is None:raise RuntimeError("HOLD_MISSING_PINNED_SOURCE_MODULE")
    out=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(out)
    return out
archive_guard=sibling("r25_public_player_artifact_qualification_v1.py","r25_offline_artifact_guard")
host_guard=sibling("r25_public_player_same_slot_preflight_v1.py","r25_read_only_host_guard")

CANDIDATE=archive_guard.SOURCE
BUILD=archive_guard.BUILD_ID
OLD_PATH=Path(host_guard.ORIGINAL_DIR)
NEW_PATH=Path(host_guard.CANDIDATE_DIR)
WEB_UNIT=Path(host_guard.UNIT)
WEB="aoe2hdbets-web-prod.service"
ROLLBACK="aoe2hdbets-web.service"
PAPER="kingdom-traders-paper.service"
JOURNAL=Path("/var/lib/aoe2war-public-player-6662c33a-one-use-v1")
STAGE=Path("/var/lib/.aoe2war-public-player-6662c33a-stage-v1")
ORIGINAL_UNIT=JOURNAL/"original-3032-unit.service"
EVENTS=JOURNAL/"events"
LOCK=JOURNAL/"operation.lock"
PUBLIC="https://aoe2war.com"
LOOPBACK="http://127.0.0.1:3032"
SNIPER="/players/u_1301e0492fdf4a229d941940413497e1"
SNIPER_AVATAR_HANDLE="user-u-1301e0492fdf4a229d941940413497e1-featured"
UNIT_CANDIDATE_SHA="dd0ec1f4ef8aabf1fcf1bde59b9fa9802ce6aadab9f34dbe438621f04608b167"
# PHYSICALLY INSPECTED STEAM V20 2026-11-10: its ONLY active candidate
# profile is original R25, its exact build and exact pre-cutover systemd unit.
# V20 --phase refresh calls verify_active_runtime() against these pins.
# A new website source/unit cannot be admitted by V20 unchanged.
V20_APPROVED_ACTIVE_TARGET=(
    "b1ef050b954be734c9f34147361e0d02d7c89b19",
    "QVzgMJiQwhFvwrRbY9oZW",
    "f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a",
)
V22_SOURCE=Path("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_two_web_builds_v22.py")
V22_LOCK=Path("/etc/aoe2war/web-prod-v22/steam-refresh-v22.lock")
V22_TIMER_UNIT=Path("/etc/systemd/system/aoe2war-steam-egress-refresh.service")
V22_TIMER_UNIT_SHA="44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a"
V22_LEASE_TRANSFER_MIN_SECONDS=180
ROLLBACK_WINDOW_SECONDS=1800
MAX_BODY=4_000_000
AVATAR=re.compile(r"user-u-[0-9a-f]{32}-featured\Z")
VALID_EVENTS=("PREPARED","EXTRACTING","STAGED","STOP_INTENT","WEB_STOPPED",
              "UNIT_SWAP_INTENT","UNIT_SWAPPED","START_INTENT",
              "CANDIDATE_STARTED","PUBLIC_VERIFIED","COMPLETED",
              "STEAM_CANDIDATE_ENROLLED","RECOVERY_INTENT",
              "ROLLED_BACK","ABORTED","FAIL_SHUT_HOLD")
HEX64=re.compile(r"^[0-9a-f]{64}$")
STAGE_PERMIT_PATH=Path("/root/aoe2war-public-player-6662c33a-stage-permit.json")
ACTIVATE_PERMIT_PATH=Path("/root/aoe2war-public-player-6662c33a-activate-permit.json")
NONCE32=re.compile(r"^[0-9a-f]{32}$")
INPUT_PATH=Path("/root/aoe2war-public-player-6662c33a-ci-input")

class Hold(Exception):pass
def need(ok,tag):
    if not ok:raise Hold("HOLD:R25_PUBLIC_PLAYER_"+tag)
def canonical(x):return json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()
def sha(x):return hashlib.sha256(x).hexdigest()
def fsync_dir(p):
    fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
def require_root():
    need(os.geteuid()==0,"ROOT_OPERATOR_REQUIRED")
def ensure_dir(p,mode=0o700,create=False):
    if create:
        os.mkdir(p,mode)
        fsync_dir(p.parent)
    st=p.lstat()
    need(stat.S_ISDIR(st.st_mode) and not p.is_symlink() and st.st_uid==0
         and not st.st_mode&0o077,"UNSAFE_OWNER_ONLY_DIRECTORY_"+p.name)
def read_safe(p,max_bytes):
    st=p.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_uid==0 and
         not st.st_mode&0o077 and 0<st.st_size<=max_bytes,"UNSAFE_OWNER_FILE_"+p.name)
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        st2=os.fstat(fd)
        need(st2.st_ino==st.st_ino and st2.st_dev==st.st_dev and st2.st_size==st.st_size,
             "OWNER_FILE_RACED_"+p.name)
        return os.read(fd,max_bytes+1)
    finally:os.close(fd)
def write_once(p,data,mode=0o600):
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,mode)
    try:
        with os.fdopen(fd,"wb",closefd=False) as f:
            f.write(data);f.flush()
        os.fsync(fd)
    finally:os.close(fd)
    fsync_dir(p.parent)
def atomic_unit_replace(new, expected_sha):
    current=WEB_UNIT.read_bytes()
    need(sha(current)==expected_sha,"COMPETING_UNIT_WRITER")
    temp=WEB_UNIT.with_name(WEB_UNIT.name+".r25-public-player-tmp-v1")
    need(not temp.exists() and not temp.is_symlink(),"UNIT_TEMP_COLLISION")
    write_once(temp,new,0o644)
    # An external writer not respecting our root-only lock could still race:
    # fail shut on observed identity change before replacement.
    need(sha(WEB_UNIT.read_bytes())==expected_sha,"UNIT_CHANGED_BEFORE_SWAP")
    os.replace(temp,WEB_UNIT)
    fsync_dir(WEB_UNIT.parent)
    need(sha(WEB_UNIT.read_bytes())==sha(new),"UNIT_ATOMIC_REPLACEMENT_FAILED")
def cmd(args,timeout=50):
    p=subprocess.run(args,capture_output=True,timeout=timeout)
    need(p.returncode==0,"COMMAND_FAILED_"+Path(args[0]).name)
    return p.stdout.decode(errors="replace").strip()
def prop(unit,key):return cmd(["systemctl","show",unit,"-p",key,"--value"],9)
def parse_utc(s):
    need(type(s) is str and s.endswith("Z"),"PERMIT_UTC_FORMAT")
    return dt.datetime.fromisoformat(s.replace("Z","+00:00"))
def now():return dt.datetime.now(dt.timezone.utc)
def permit(path,expected_sha,operation,read_only=False):
    require_root()
    need(operation in ("stage","activate","rollback","recover"),
         "PERMIT_OPERATION_UNKNOWN")
    stage_operation=operation=="stage"
    # Rollback and interruption recovery retain *independent* permitted scope:
    # recover selects its physical phase using the immutable existing journal.
    expected_path=(STAGE_PERMIT_PATH if stage_operation else ACTIVATE_PERMIT_PATH)
    if operation=="recover":
        rows=load_events()
        crossed=any(row["state"] in ("STOP_INTENT","WEB_STOPPED",
                      "UNIT_SWAP_INTENT","UNIT_SWAPPED","START_INTENT",
                      "CANDIDATE_STARTED","PUBLIC_VERIFIED","COMPLETED")
                    for row in rows)
        expected_path=ACTIVATE_PERMIT_PATH if crossed else STAGE_PERMIT_PATH
    need(path==expected_path,"PERMIT_UNEXPECTED_PHASE_LOCATION")
    need(bool(HEX64.fullmatch(expected_sha or "")),"PERMIT_SHA_MISSING")
    raw=read_safe(path,32000)
    need(sha(raw)==expected_sha,"PERMIT_BYTES_NOT_CENTRAL_PINNED")
    obj=json.loads(raw)
    need(obj.get("schema")=="aoe2war.r25.public-player.central-permit.v1" and
         obj.get("central_scope")=="PUBLIC_PLAYER_ONLY_NO_DOCUMENT_GET" and
         obj.get("approved_source_sha")==CANDIDATE and
         obj.get("approved_build_id")==BUILD and
         obj.get("approved_candidate_unit_sha256")==UNIT_CANDIDATE_SHA and
         obj.get("controller_sha256")==sha(Path(__file__).read_bytes()) and
         obj.get("ci_archive_sha256")==archive_guard.ARCHIVE_SHA256 and
         obj.get("codex_financial_capture_active") is False and
         obj.get("financial_writers_authorized") is False and
         obj.get("web_financial_mutations_authorized") is False and
         obj.get("allowed_operation")=="ONE_USE_RESTRICTED_3032_ONLY" and
         obj.get("approved_phase")==("STAGE_ONLY" if path==STAGE_PERMIT_PATH
                                     else "ACTIVATE_ONLY") and
         bool(NONCE32.fullmatch(str(obj.get("approval_nonce","")))),
         "PERMIT_FIELDS_DRIFT")
    start,expiry=parse_utc(obj.get("issued_at")),parse_utc(obj.get("expires_at"))
    need((expiry-start).total_seconds()>0 and (expiry-start).total_seconds()<=3600,
         "PERMIT_WINDOW_TOO_BROAD")
    if operation in ("stage","activate"):
        need(start<=now()<=expiry,"PERMIT_EXPIRED_FOR_ACTIVATION")
    else:
        # Root-only safety rollback must not strand the site because the
        # original activation permit expired after a successful release.
        need(operation in ("rollback","recover"),"PERMIT_OPERATION_UNKNOWN")
    targets=obj.get("managed_avatar_handles")
    need(type(targets) is list and len(targets)==3 and
         all(type(x) is str and AVATAR.fullmatch(x) for x in targets) and
         len(set(targets))==3 and SNIPER_AVATAR_HANDLE in targets,
         "PERMIT_MANAGED_AVATAR_SCOPE")
    need(bool(re.fullmatch(r"https://github.com/Emaren/app-prodn/(?:issues/1280|pull/1300|pull/1307|pull/1316)#issuecomment-[0-9]{9,}",str(obj.get("central_comment_url","")))),
         "PERMIT_CENTRAL_APPROVAL_REFERENCE")
    if path==ACTIVATE_PERMIT_PATH:
        need(bool(HEX64.fullmatch(str(obj.get("stage_permit_sha256","")))) and
             bool(HEX64.fullmatch(str(obj.get("staged_event_sha256","")))) and
             bool(NONCE32.fullmatch(str(obj.get("stage_nonce","")))),
             "ACTIVATION_STAGE_BINDING_MISSING")
        if operation in ("activate","rollback","recover"):
            events=load_events()
            need(len(events)>=3 and
                 [e["state"] for e in events[:3]]==
                   ["PREPARED","EXTRACTING","STAGED"],
                 "ACTIVATION_STAGING_EVENTS_UNAVAILABLE")
            stage_event=events[0]["data"]
            need(stage_event.get("permit_phase")=="STAGE_ONLY" and
                 stage_event.get("stage_nonce")==obj["stage_nonce"] and
                 stage_event.get("permit_sha256")==obj["stage_permit_sha256"] and
                 obj["approval_nonce"]!=obj["stage_nonce"] and
                 sha(read_safe(EVENTS/"0003.json",65536))==obj["staged_event_sha256"],
                 "ACTIVATION_STAGE_NONCE_OR_RECEIPT_DRIFT")
            need(sha(read_safe(STAGE_PERMIT_PATH,32000))==obj["stage_permit_sha256"],
                 "ACTIVATION_STAGING_PERMIT_CHANGED")
        # Never permit an activation if phase binding is missing or reuses the
        # stage-only permit, even if an attacker reproduces matching source SHA.
    else:
        need("stage_nonce" not in obj and
             "staged_event_sha256" not in obj and
             "stage_permit_sha256" not in obj,
             "STAGE_PERMIT_CONTAINS_ACTIVATION_FIELDS")
    if path==ACTIVATE_PERMIT_PATH:
        steam_pin=str(obj.get("approved_steam_v22_source_sha256",""))
        need(bool(HEX64.fullmatch(steam_pin)) and
             obj.get("approved_steam_v22_unit_sha256")==V22_TIMER_UNIT_SHA,
             "ACTIVATION_V22_SOURCE_OR_UNIT_PIN_MISSING")
    else:
        need("approved_steam_v22_source_sha256" not in obj and
             "approved_steam_v22_unit_sha256" not in obj,
             "STAGE_ONLY_CANNOT_INSTALL_STEAM_V22")
    # The root-controlled permit's SHA must be supplied from an independently
    # reviewed Central approval; this parser does not claim cryptographic
    # GitHub author attestation or replace the owner/central human decision.
    return obj

def require_reviewed_source_bytes():
    """Root-only reviewed dependency bytes: no mutable helper import bypass."""
    require_root()
    for filename,expected in REVIEWED_DEPENDENCY_SHAS.items():
        need(sha(read_safe(HERE/filename,100_000))==expected,
             "REVIEWED_RELEASE_HELPER_BYTES_DRIFT_"+filename)
    # The permit covers this exact controller SHA independently. Verify
    # owner-only permissions before any action, even --inspect.
    read_safe(Path(__file__),2_000_000)
    return True

def load_events(path=EVENTS):
    if not path.exists():return []
    data=[];previous="0"*64
    for p in sorted(path.iterdir()):
        need(p.name==f"{len(data)+1:04d}.json","JOURNAL_GAP_OR_FOREIGN_EVENT")
        raw=read_safe(p,65536)
        obj=json.loads(raw)
        need(obj.get("number")==len(data)+1 and obj.get("prev_sha256")==previous and
             obj.get("state") in VALID_EVENTS and obj.get("schema")=="r25.one-use.journal.event.v1",
             "JOURNAL_CHAIN_INVALID")
        previous=sha(raw)
        data.append(obj)
    return data

def append_event(state,extra=None):
    need(state in VALID_EVENTS,"JOURNAL_BAD_STATE")
    existing=load_events()
    previous="0"*64 if not existing else sha(read_safe(EVENTS/f"{len(existing):04d}.json",65536))
    payload={"schema":"r25.one-use.journal.event.v1","number":len(existing)+1,
             "state":state,"prev_sha256":previous,"utc":now().isoformat(),
             "source_sha":CANDIDATE,"build_id":BUILD,
             "data":extra or {}}
    raw=canonical(payload)+b"\n"
    write_once(EVENTS/f"{len(existing)+1:04d}.json",raw)
    return payload

def state():
    ev=load_events()
    return ev[-1]["state"] if ev else "NONE"

class Exclusive:
    def __enter__(self):
        ensure_dir(JOURNAL)
        fd=os.open(LOCK,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC,0o600)
        st=os.fstat(fd)
        need(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_uid==0 and
             not st.st_mode&0o077,"UNSAFE_OPERATION_LOCK")
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        self.fd=fd
        return self
    def __exit__(self,*exc):
        fcntl.flock(self.fd,fcntl.LOCK_UN)
        os.close(self.fd)

def relative_parent(root,name,expected_uid=0):
    pieces=name.split("/")
    current=root
    for piece in pieces[:-1]:
        current=current/piece
        try:os.mkdir(current,0o755)
        except FileExistsError:pass
        st=current.lstat()
        need(stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode) and st.st_uid==expected_uid
             and not st.st_mode&0o022,"EXTRACTION_PARENT_RACE")
    return current

def ensure_bind_targets(root,expected_uid=0):
    """Only the two exact empty systemd mount destinations absent from CI tar.

    The old R25 unit binds the pre-existing download media and Next cache
    sources into these locations. Never copy the old cache or downloads.
    """
    result=[]
    for relative in (".next/cache","public/downloads"):
        path=root
        for item in relative.split("/"):
            path=path/item
            try:
                os.mkdir(path,0o755)
                fsync_dir(path.parent)
            except FileExistsError:
                pass
            st=path.lstat()
            need(stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode)
                 and st.st_uid==expected_uid and not st.st_mode&0o022,
                 "BIND_MOUNT_TARGET_UNSAFE_"+item)
        need(not any(path.iterdir()),"BIND_MOUNT_TARGET_NOT_EMPTY")
        result.append(relative)
    return result

def no_replace(src,dest):
    libc=ctypes.CDLL("libc.so.6",use_errno=True)
    result=libc.renameat2(ctypes.c_int(-100),os.fsencode(src),
                          ctypes.c_int(-100),os.fsencode(dest),ctypes.c_uint(1))
    if result!=0:
        e=ctypes.get_errno()
        raise Hold("HOLD:R25_PUBLIC_PLAYER_INSTALL_NOREPLACE_"+errno.errorcode.get(e,str(e)))
    fsync_dir(src.parent);fsync_dir(dest.parent)

def extract_verified(stage_input,output):
    """No tar.extractall: O_EXCL regular files and deferred internal-only links."""
    archive_guard.verify_package(stage_input)
    need(not output.exists() and not output.is_symlink(),"STAGING_ALREADY_EXISTS")
    os.mkdir(output,0o700);fsync_dir(output.parent)
    links=[];count=0;extracted_rows=[]
    with tarfile.open(stage_input/"runtime.tar.gz","r|gz") as tf:
        for member in tf:
            name=archive_guard.normalized_archive_path(member.name)
            need(member.isfile() or member.issym(),"SPECIAL_ARCHIVE_ENTRY")
            need(member.uid==0 and member.gid==0,"ARCHIVE_OWNERSHIP")
            need(not member.mode&0o7000,"SETUID_OR_SETGID_MEMBER")
            if member.isfile():
                need(not member.mode&0o022 and member.size<=2**31,"WRITABLE_OR_OVERSIZE")
                parent=relative_parent(output,name)
                dest=parent/name.split("/")[-1]
                fd=os.open(dest,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW|os.O_CLOEXEC,
                           member.mode&0o777)
                h=hashlib.sha256();received=0
                try:
                    reader=tf.extractfile(member)
                    need(reader is not None,"MISSING_MEMBER_READER")
                    while True:
                        block=reader.read(1024*1024)
                        if not block:break
                        received+=len(block);need(received<=member.size,"MEMBER_SIZE_DRIFT")
                        offset=0
                        while offset<len(block):
                            offset+=os.write(fd,block[offset:])
                        h.update(block)
                    need(received==member.size,"MEMBER_SIZE_SHORT")
                    os.fchmod(fd,member.mode&0o777)
                    os.fsync(fd)
                finally:os.close(fd)
                # No arbitrary target overwrite, and only creation by this operation.
                if name not in (".aoe2war-runtime-manifest.json",".aoe2war-source-sha"):
                    extracted_rows.append({"path":name,"type":"file",
                                           "mode":member.mode,
                                           "size":received,"sha256":h.hexdigest()})
                count+=1
            else:
                links.append((name,member.linkname))
                extracted_rows.append({"path":name,"type":"symlink",
                                       "mode":member.mode,"target":member.linkname})
    need(len(extracted_rows)==archive_guard.FILE_COUNT,"EXTRACTED_TREE_COUNT")
    # Detect byte substitution *during* the second streaming extraction, not
    # merely during the first source/archive verification pass.
    need(sha(archive_guard.canonical(extracted_rows))==archive_guard.TREE_SHA256,
         "EXTRACTED_CONTENT_TREE_HASH_CHANGED")
    need(archive_guard.digest_file(stage_input/"runtime.tar.gz")==archive_guard.ARCHIVE_SHA256,
         "INPUT_ARCHIVE_CHANGED_DURING_EXTRACT")
    for name,target in links:
        archive_guard.symlink_destination(name,target)
        parent=relative_parent(output,name)
        os.symlink(target,parent/name.split("/")[-1])
        count+=1
    need(count==archive_guard.FILE_COUNT+2,"EXTRACTED_FILE_COUNT")
    # The artifact deliberately excludes mutable cache and managed downloads.
    # Keep exact old source bind mounts but create their NEW empty targets.
    mount_targets=ensure_bind_targets(output)
    # Disk durability for both source bytes and directory structure; ensure
    # no symlink is a parent (already required by byte manifest).
    for directory,subdirs,filenames in os.walk(output,followlinks=False):
        for sub in subdirs:
            p=Path(directory)/sub
            if not p.is_symlink():
                os.chmod(p,0o755)
        fsync_dir(Path(directory))
    os.chmod(output,0o755)
    fsync_dir(output.parent)
    need((output/".aoe2war-source-sha").read_text().strip()==CANDIDATE and
         (output/".next/BUILD_ID").read_text().strip()==BUILD,
         "STAGED_SOURCE_OR_BUILD_DRIFT")
    return {"files_and_links":count,"source":CANDIDATE,"build":BUILD,
            "created_empty_bind_targets":mount_targets}

def health_request(url,max_bytes=MAX_BODY):
    try:
        with urlopen(Request(url,headers={"User-Agent":"AoE2WAR-R25-Release-Guard/1",
                               "Accept":"text/html,application/json,image/webp"}),timeout=14) as r:
            body=r.read(max_bytes+1)
            need(len(body)<=max_bytes,"HTTP_RESPONSE_OVERSIZE")
            return r.status,r.headers,body
    except HTTPError as e:
        data=e.read(max_bytes+1)
        need(len(data)<=max_bytes,"HTTP_ERROR_OVERSIZE")
        return e.code,e.headers,data

def check_public(avatar_handles,request=health_request):
    """Content and role-aware public probes. No cookies or auth headers."""
    result=[]
    extra_player_details=[
        "/players/"+handle[len("user-"):-len("-featured")]
        for handle in avatar_handles
        if handle!=SNIPER_AVATAR_HANDLE
    ]
    for origin in (LOOPBACK,PUBLIC):
        for path,status in [(SNIPER,200),("/players",200),("/api/traffic/public",200),
                            ("/api/kingdom-index",200),("/api/watcher/release",200),
                            ("/api/bets",503),("/api/auth/session",401),
                            ("/api/profile-documents",401),("/api/admin/kingdom-presence",401),
                            *[(detail,200) for detail in extra_player_details]]:
            code,h,body=request(origin+path)
            need(code==status,"HTTP_STATUS_"+path.replace("/","_"))
            if path==SNIPER or path in extra_player_details:
                need(b"936992806" not in body and b"Application error" not in body and
                     b"NEXT_SERVER_ERROR" not in body and
                     not re.search(rb'(?:\\?"digest\\?"\s*:\s*\\?"[0-9]+|NEXT_NOT_FOUND|NEXT_ERROR)',body),
                     "PLAYER_DETAIL_STREAMED_NEXT_ERROR")
            if path==SNIPER:
                need(b"Exact replay statistics are temporarily unavailable" in body,
                     "SNIPER_UNAVAILABLE_EVIDENCE_NOT_RENDERED")
            if path=="/api/bets":
                need("no-store" in h.get("Cache-Control",""),"FINANCIAL_HTTP_NO_STORE")
            if path=="/api/profile-documents":
                need("no-store" in h.get("Cache-Control",""),"PRIVATE_DOCUMENT_NO_STORE")
            if path=="/api/traffic/public":
                item=json.loads(body)
                need(item.get("coverageEndedAt")=="2026-10-19" and
                     len(item.get("points",[]))==131,"CANONICAL_TRAFFIC_DRIFT")
            result.append((origin,path,code))
    # The already-captured public avatar handles must remain distinct managed
    # images with exact old-vs-current 3030/3032 byte parity, never silhouettes.
    from urllib.parse import urlencode
    portraits=[]
    for handle in avatar_handles:
        path="/api/media-assets/avatar/"+handle+"?"+urlencode({
            "fallback":"/champions/players/silhouette.card.webp","size":"card"})
        original=request("http://127.0.0.1:3030"+path)
        new=request("http://127.0.0.1:3032"+path)
        external=request(PUBLIC+path)
        for code,h,data in (original,new,external):
            need(code==200 and h.get("X-AoE2WAR-Media-Proxy")=="direct-managed" and
                 h.get("Content-Type","").split(";")[0] in
                 {"image/webp","image/png","image/jpeg","image/avif"} and
                 "max-age=" in h.get("Cache-Control","") and data,
                 "MANAGED_PORTRAIT_MIME_CACHE_OR_DIRECT_MISMATCH")
        need(len({sha(original[2]),sha(new[2]),sha(external[2])})==1 and
             len({r[1].get("Content-Type") for r in (original,new,external)})==1 and
             len({r[1].get("Cache-Control") for r in (original,new,external)})==1,
             "MANAGED_PORTRAIT_BYTES_OR_CACHE_CHANGED")
        portraits.append(sha(new[2]))
    need(len(set(portraits))==3,"THREE_DISTINCT_PORTRAITS_REQUIRED")
    return {"public_probes":len(result),"managed_portraits":3,
            "portrait_manifest_sha256":sha("\n".join(portraits).encode())}

def read_post_state():
    # host_guard.collect() deliberately reads the immutable OLD runtime;
    # the new source/build markers must instead be read from NEW_PATH.
    facts,unit=host_guard.collect()
    need(facts["source"]==host_guard.BASELINE and
         facts["build"]==host_guard.BASE_BUILD,
         "ORIGINAL_RESTRICTED_ROLLBACK_ARTIFACT_CHANGED")
    need((NEW_PATH/".aoe2war-source-sha").read_text().strip()==CANDIDATE and
         (NEW_PATH/".next/BUILD_ID").read_text().strip()==BUILD,
         "POST_CANDIDATE_SOURCE_OR_BUILD")
    need(sha(unit)==UNIT_CANDIDATE_SHA,"POST_UNIT_NOT_APPROVED")
    need(facts["web_state"]=="active" and facts["web_pid"] not in ("0",host_guard.PIN["web_pid"]),
         "POST_WEB_RESTART_NOT_PROVEN")
    need(facts["rollback_pid"]==host_guard.PIN["rollback_pid"] and
         facts["paper_pid"]==host_guard.PIN["paper_pid"] and
         facts["rollback_state"]=="active" and facts["paper_state"]=="active",
         "POST_LEGACY_OR_PAPER_DRIFT")
    need(facts["steam_timer"]=="active" and
         facts["steam_script_sha"]==host_guard.STEAM_SCRIPT_SHA and
         facts["steam_unit_sha"]==V22_TIMER_UNIT_SHA,"V22_STEAM_READMISSION_FAILED")
    need(facts["financial_listeners"]==[] and facts["selector_count"]==6,
         "POST_FINANCIAL_OR_NGINX_DRIFT")
    # Candidate must already be V22-enrolled under the shared timer lock.
    steam=json.loads(run_v22("--phase","inspect",timeout=40))
    need(steam.get("status")=="PASS_STEAM_V22_PROTECTED_READONLY" and
         steam.get("active_profile")=="candidate" and
         steam.get("source_sha")==CANDIDATE and
         steam.get("build_id")==BUILD and
         steam.get("finance_authorized") is False,"V22_INSPECT_AFTER_ENROLL_FAILED")
    raw=json.loads(cmd(["/usr/sbin/nft","-j","list","table","inet",
                        "aoe2war_web_prod"],15))
    sets={}
    for item in raw.get("nftables",[]):
        entry=item.get("set",{})
        name=entry.get("name")
        if name not in ("steam4","steam6"):continue
        need(name not in sets and entry.get("table")=="aoe2war_web_prod" and
             entry.get("family")=="inet" and "timeout" in entry.get("flags",[]),
             "STEAM_LEASE_SET_DRIFT")
        leases=[]
        for element in entry.get("elem") or []:
            val=element.get("elem",{}) if isinstance(element,dict) else {}
            expiry=val.get("expires")
            need(type(expiry) is int and 0<expiry<=300 and
                 type(val.get("val")) is str and len(val["val"])<64,
                 "STEAM_LEASE_ENTRY_DRIFT")
            leases.append(expiry)
        sets[name]=leases
    need(set(sets)=={"steam4","steam6"} and
         0<sum(map(len,sets.values()))<=16 and
         min(x for group in sets.values() for x in group)>=15,
         "V22_LEASE_READMISSION_HOLD")
    return {"new_pid":facts["web_pid"],"steam_v22_readonly_inspect":"PASS",
            "steam_lease_min_seconds":min(x for group in sets.values() for x in group)}

def rollback_unit(reason,force=False,activation_permit_sha=None,steam_lock_fd=None):
    """Restore restricted original 3032 and exact V22 rollback Steam profile."""
    if steam_lock_fd is None:
        with steam_transition_lock() as fd:
            return rollback_unit(reason,force,activation_permit_sha,fd)
    need(bool(HEX64.fullmatch(str(activation_permit_sha))),
         "ROLLBACK_ACTIVATION_PERMIT_SHA_REQUIRED")
    raw=read_safe(ORIGINAL_UNIT,16384)
    need(sha(raw)==host_guard.UNIT_SHA,"ORIGINAL_UNIT_BACKUP_DRIFT")
    current=WEB_UNIT.read_bytes()
    current_hash=sha(current)
    need(current_hash in (host_guard.UNIT_SHA,UNIT_CANDIDATE_SHA),
         "COMPETING_UNIT_REPLACEMENT_NO_CLOBBER")
    if current_hash==UNIT_CANDIDATE_SHA:
        cmd(["systemctl","stop",WEB],45)
        atomic_unit_replace(raw,UNIT_CANDIDATE_SHA)
    cmd(["systemctl","daemon-reload"],35)
    cmd(["systemctl","start",WEB],65)
    # Must restore the old source identity in Steam before releasing the
    # shared timer lock. The original V20 binary is still immutable and
    # available for independent, later exact-unit rollback admission.
    v22_enroll_bound("rollback",activation_permit_sha,steam_lock_fd)
    facts,unit=host_guard.collect()
    need(facts["source"]==host_guard.BASELINE and
         facts["build"]==host_guard.BASE_BUILD and
         sha(unit)==host_guard.UNIT_SHA and facts["web_state"]=="active" and
         facts["financial_listeners"]==[] and facts["steam_timer"]=="active" and
         facts["steam_unit_sha"]==V22_TIMER_UNIT_SHA,
         "ROLLBACK_SOURCE_OR_SERVICE_NOT_RESTORED")
    append_event("ROLLED_BACK",{"why":reason,"original_build":host_guard.BASE_BUILD,
                                "original_unit_sha256":host_guard.UNIT_SHA,
                                "steam_profile":"rollback","finance_unchanged":True})
    return {"status":"PASS_RESTRICTED_3032_ROLLBACK","new_pid":facts["web_pid"],
            "original_3030_untouched":True,"finance_unchanged":True}

def pre_approval_stage(stage_input,permit_obj):
    facts,unit=host_guard.collect()
    host_guard.evaluate(facts,unit)
    need(not NEW_PATH.exists() and not NEW_PATH.is_symlink() and
         not STAGE.exists() and not STAGE.is_symlink(),"CANDIDATE_PATH_PREEXISTS")
    archive_guard.verify_package(stage_input)
    ensure_dir(JOURNAL)
    need(not EVENTS.exists() and not ORIGINAL_UNIT.exists(),
         "EXISTING_STAGING_JOURNAL_OR_BACKUP")
    os.mkdir(EVENTS,0o700);fsync_dir(JOURNAL)
    write_once(ORIGINAL_UNIT,unit)
    append_event("PREPARED",{"original_web_pid":facts["web_pid"],
                             "unit_sha256":sha(unit),
                             "permit_sha256":permit_obj["_permit_sha"],
                             "permit_phase":"STAGE_ONLY",
                             "stage_nonce":permit_obj["approval_nonce"]})
    append_event("EXTRACTING")
    extraction=extract_verified(stage_input,STAGE)
    no_replace(STAGE,NEW_PATH)
    append_event("STAGED",extraction)
    return {"status":"PASS_CANDIDATE_STAGE_NOT_ACTIVE","state":state(),
            "candidate_source":CANDIDATE,"live_web_unchanged":True}

def approved_v22_source_sha(obj):
    """Verify root-owned exact installed V22 bytes against fresh Central digest."""
    expected=obj.get("approved_steam_v22_source_sha256")
    need(type(expected) is str and bool(HEX64.fullmatch(expected)),
         "V22_SOURCE_SHA_NOT_CENTRALLY_APPROVED")
    st=V22_SOURCE.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1
         and not st.st_mode&0o022,"V22_BINARY_PERMISSIONS_DRIFT")
    need(sha(V22_SOURCE.read_bytes())==expected,"V22_BINARY_SOURCE_DRIFT")
    unit_stat=V22_TIMER_UNIT.lstat()
    need(stat.S_ISREG(unit_stat.st_mode) and unit_stat.st_uid==0
         and unit_stat.st_nlink==1 and not unit_stat.st_mode&0o022,
         "V22_TIMER_UNIT_WRONG_OWNER_OR_SYMLINK")
    need(sha(V22_TIMER_UNIT.read_bytes())==V22_TIMER_UNIT_SHA,
         "V22_TIMER_UNIT_NOT_INSTALLED")
    need(host_guard.read_file_sha(
         "/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v20.py"
         )==host_guard.STEAM_SCRIPT_SHA,
         "ORIGINAL_V20_BINARY_NOT_PRESERVED")
    return expected

def run_v22(*arguments,timeout=65,pass_fd=None):
    """Use only reviewed V22 program path, never arbitrary service commands."""
    args=["/usr/bin/python3","-I","-B",str(V22_SOURCE),*arguments]
    extra={} if pass_fd is None else {"pass_fds":(pass_fd,)}
    p=subprocess.run(args,capture_output=True,timeout=timeout,**extra)
    need(p.returncode==0,"V22_COMMAND_FAILED")
    return p.stdout.decode(errors="replace").strip()

def require_steam_active_target_compatible(obj):
    """Previously installed V20 remains incompatible; V22 exact new profile only."""
    approved_v22_source_sha(obj)
    raw=run_v22("--phase","pre-cutover",timeout=55)
    response=json.loads(raw)
    need(response.get("status")=="PASS_STEAM_V22_TWO_WEB_BUILDS_SOURCE_BOUND_READONLY"
         and response.get("active_profile")=="rollback"
         and response.get("source_sha")==host_guard.BASELINE
         and response.get("candidate_source_sha")==CANDIDATE
         and response.get("finance_authorized") is False
         and response.get("web_activation_authorized") is False
         and type(response.get("steam_lease_min_seconds")) is int
         and response["steam_lease_min_seconds"]>=V22_LEASE_TRANSFER_MIN_SECONDS,
         "V22_TWO_BUILD_PRECUTOVER_NOT_PROVEN")
    return {"status":"PASS_EXACT_TWO_BUILD_PRECUTOVER_SOURCE_ONLY",
            "lease_seconds":response["steam_lease_min_seconds"]}

def strict_nft_lease_under_transition_lock():
    """Reread genuine nft lease TTL after acquiring the V22 timer lock.

    No nft mutation. Refuse disappearing lease, zero TTL, wrong set flags,
    unknown units, and any TTL too short for the guarded restart.
    """
    raw=json.loads(cmd(["/usr/sbin/nft","-j","list","table","inet",
                        "aoe2war_web_prod"],15))
    sets={}
    for item in raw.get("nftables",[]):
        entry=item.get("set",{})
        name=entry.get("name")
        if name not in ("steam4","steam6"):continue
        need(name not in sets and entry.get("table")=="aoe2war_web_prod" and
             entry.get("family")=="inet" and "timeout" in entry.get("flags",[]),
             "V22_LOCKED_NFT_LEASE_SET_DRIFT")
        leases=[]
        for item in entry.get("elem") or []:
            value=item.get("elem",{}) if type(item) is dict else {}
            exp=value.get("expires")
            need(type(exp) is int and 0<exp<=300 and
                 type(value.get("val")) is str and len(value["val"])<64,
                 "V22_LOCKED_NFT_LEASE_ENTRY_DRIFT")
            leases.append(exp)
        sets[name]=leases
    need(set(sets)=={"steam4","steam6"} and
         0<sum(map(len,sets.values()))<=16,
         "V22_LOCKED_NFT_LEASE_SCOPE_DRIFT")
    remaining=min(lease for group in sets.values() for lease in group)
    need(remaining>=V22_LEASE_TRANSFER_MIN_SECONDS,
         "V22_LOCKED_NFT_LEASE_BELOW_RESTART_HEADROOM")
    return remaining

@contextmanager
def steam_transition_lock():
    """Same V22 lock inode as timer: no timer refresh during cold restart."""
    # The actual V22 timer flock file is permitted to be EMPTY, unlike
    # nonempty owner-signed permit JSON. Do not use read_safe() here.
    lock_stat=V22_LOCK.lstat()
    need(stat.S_ISREG(lock_stat.st_mode) and lock_stat.st_uid==0
         and lock_stat.st_nlink==1 and
         stat.S_IMODE(lock_stat.st_mode)==0o600 and
         lock_stat.st_size<=4096,"V22_LOCK_OWNER_OR_SIZE_DRIFT")
    fd=os.open(V22_LOCK,os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        held=os.fstat(fd)
        need(held.st_ino==lock_stat.st_ino and held.st_dev==lock_stat.st_dev,
             "V22_TIMER_LOCK_RACE")
        yield fd
    except BlockingIOError as ex:
        raise Hold("HOLD:R25_PUBLIC_PLAYER_V22_TIMER_REFRESH_RACE") from ex
    finally:
        try:fcntl.flock(fd,fcntl.LOCK_UN)
        finally:os.close(fd)

def v22_enroll_bound(profile,permit_sha,fd):
    need(profile in ("candidate","rollback"),"V22_UNKNOWN_ENROLL_PROFILE")
    need(bool(HEX64.fullmatch(str(permit_sha))),"V22_ENROLL_PERMIT_SHA_MISSING")
    raw=run_v22("--phase","enroll","--profile",profile,
                "--inherited-controller-lock-fd",str(fd),
                "--activation-permit-sha256",permit_sha,
                timeout=65,pass_fd=fd)
    receipt=json.loads(raw)
    need(receipt.get("status")=="PASS_EXACT_STEAM_V22_DUAL_BUILD_ADMISSION"
         and receipt.get("profile")==profile
         and receipt.get("source_sha")==(
             CANDIDATE if profile=="candidate" else host_guard.BASELINE)
         and receipt.get("finance_authorized") is False,
         "V22_ENROLL_RECEIPT_NOT_EXACT")
    return receipt


def activate(obj):
    need(state()=="STAGED","STAGE_NOT_READY_OR_ALREADY_USED")
    facts,raw=host_guard.collect()
    host_guard.evaluate(facts,raw)
    need(sha(read_safe(ORIGINAL_UNIT,16384))==host_guard.UNIT_SHA,
         "STORED_ORIGINAL_UNIT_DRIFT")
    need((NEW_PATH/".aoe2war-source-sha").read_text().strip()==CANDIDATE and
         (NEW_PATH/".next/BUILD_ID").read_text().strip()==BUILD,
         "STAGED_RUNTIME_IDENTITY_CHANGED")
    candidate=raw.replace(host_guard.ORIGINAL_DIR.encode(),host_guard.CANDIDATE_DIR.encode())
    need(sha(candidate)==UNIT_CANDIDATE_SHA,"CANDIDATE_UNIT_SHA_DRIFT")
    need(obj.get("approved_phase")=="ACTIVATE_ONLY" and
         bool(NONCE32.fullmatch(str(obj.get("approval_nonce","")))),
         "ACTIVATION_NONCE_OR_PHASE_NOT_ACCEPTED")
    # V22's exact staged provenance, original R25, source overlay, stage
    # permit and nft/lease proof must pass BEFORE stopping the public service.
    compatibility=require_steam_active_target_compatible(obj)
    try:
        with steam_transition_lock() as lockfd:
            need(prop("aoe2war-steam-egress-refresh.timer","ActiveState")=="active",
                 "V22_TIMER_DISABLED_UNDER_LOCK")
            locked_lease_seconds=strict_nft_lease_under_transition_lock()
            append_event("STOP_INTENT",{
                "activate_permit_sha256":obj["_permit_sha"],
                "activation_nonce":obj["approval_nonce"],
                "stage_permit_sha256":obj["stage_permit_sha256"],
                "staged_event_sha256":obj["staged_event_sha256"],
                "v22_source_sha256":obj["approved_steam_v22_source_sha256"],
                "min_pre_cutover_lease_seconds":compatibility["lease_seconds"],
                "min_locked_lease_seconds":locked_lease_seconds})
            cmd(["systemctl","stop",WEB],45)
            need(prop(WEB,"ActiveState") in ("inactive","failed") and
                 prop(WEB,"MainPID")=="0","WEB_NOT_STOPPED")
            append_event("WEB_STOPPED")
            append_event("UNIT_SWAP_INTENT")
            atomic_unit_replace(candidate,host_guard.UNIT_SHA)
            append_event("UNIT_SWAPPED")
            cmd(["systemctl","daemon-reload"],35)
            append_event("START_INTENT")
            cmd(["systemctl","start",WEB],65)
            append_event("CANDIDATE_STARTED")
            v22_enroll_bound("candidate",obj["_permit_sha"],lockfd)
            append_event("STEAM_CANDIDATE_ENROLLED",{"active_profile":"candidate"})
        # Timer resumes automatically after releasing the same file lock.
        # No restart of timers, no security firewall, no third web runtime.
        post=read_post_state()
        acceptance=check_public(obj["managed_avatar_handles"])
        append_event("PUBLIC_VERIFIED",dict(post,**acceptance))
        deadline=(now()+dt.timedelta(seconds=ROLLBACK_WINDOW_SECONDS)).isoformat()
        append_event("COMPLETED",{"rollback_deadline":deadline,
                                  "candidate_unit_sha256":UNIT_CANDIDATE_SHA,
                                  "steam_profile":"candidate"})
        return {"status":"PASS_PUBLIC_PLAYER_RELEASE_DEPLOYED",
                "candidate_source":CANDIDATE,"candidate_build":BUILD,
                "rollback_available_until":deadline,"finance_unchanged":True}
    except Exception as error:
        if not any(e["state"]=="STOP_INTENT" for e in load_events()):
            # Timer lock contention before STOP_INTENT changed no web unit.
            # Never restart the healthy original just to 'undo' no mutation.
            append_event("ABORTED",{"why":"BEFORE_STOP_INTENT",
                                    "reason":type(error).__name__})
            raise Hold("ACTIVATION_REFUSED_BEFORE_STOP_INTENT") from error
        append_event("RECOVERY_INTENT",{"reason":type(error).__name__})
        try:
            recovery=rollback_unit("AUTO_ROLLBACK_AFTER_"+type(error).__name__,
                                   activation_permit_sha=obj["_permit_sha"])
        except Exception as recovery_error:
            append_event("FAIL_SHUT_HOLD",{"reason":type(recovery_error).__name__})
            raise Hold("AUTO_ROLLBACK_FAILED_REQUIRES_MANUAL_RESTRICTED_3032_RECOVERY") from recovery_error
        raise Hold("ACTIVATION_ABORTED_AND_ORIGINAL_RESTORED_"+recovery["status"]) from error

def restore(obj,reason,manual=True):
    events=load_events()
    if not events:
        # Crash between root journal mkdir and first durable event.
        facts,unit=host_guard.collect()
        host_guard.evaluate(facts,unit)
        need(not NEW_PATH.exists(),"UNJOURNALED_CANDIDATE_PRESENT")
        if not EVENTS.exists():
            os.mkdir(EVENTS,0o700);fsync_dir(JOURNAL)
        append_event("ABORTED",{"reason":"STAGE_INTERRUPTED_BEFORE_FIRST_EVENT",
                                "original_restricted_web_intact":True})
        return {"status":"PASS_UNSTARTED_STAGE_ABORTED"}
    last=events[-1]["state"]
    need(last not in ("ROLLED_BACK","ABORTED"),"RELEASE_ALREADY_TERMINATED")
    if manual and last=="COMPLETED":
        deadline=parse_utc(events[-1]["data"]["rollback_deadline"].replace("+00:00","Z"))
        need(now()<=deadline,"MANUAL_ROLLBACK_WINDOW_EXPIRED")
    append_event("RECOVERY_INTENT",{"reason":reason,"manual":manual})
    if last in ("PREPARED","EXTRACTING","STAGED"):
        facts,unit=host_guard.collect()
        host_guard.evaluate(facts,unit)
        need(sha(unit)==host_guard.UNIT_SHA,
             "PREACTIVATION_UNIT_DRIFT")
        append_event("ABORTED",{"original_restricted_web_intact":True})
        return {"status":"PASS_RELEASE_ABORTED_BEFORE_CUTOVER"}
    return rollback_unit(reason,activation_permit_sha=obj["_permit_sha"])

def inspect():
    report={"schema":"r25.one-use.controller.v1","utc":now().isoformat(),
            "source_sha":CANDIDATE,"candidate_build":BUILD,
            "operation_performed":False,"activation_permitted":False,
            "journal_exists":JOURNAL.exists(),"original_runtime_exists":OLD_PATH.exists(),
            "candidate_runtime_exists":NEW_PATH.exists()}
    if EVENTS.exists():
        ev=load_events()
        report.update(journal_events=len(ev),last_state=ev[-1]["state"] if ev else "EMPTY")
        if ev:
            last_data=ev[-1].get("data",{})
            completed=[x for x in ev if x["state"]=="COMPLETED"]
            report["last_journal_event_sha256"]=sha(read_safe(
                EVENTS/f"{len(ev):04d}.json",65536))
            if completed:
                expiry=parse_utc(completed[-1]["data"]["rollback_deadline"].replace("+00:00","Z"))
                report["rollback_deadline_utc"]=expiry.isoformat()
                report["rollback_window_open"]=now()<=expiry
                report["rollback_window_remaining_seconds"]=max(0,int((expiry-now()).total_seconds()))
    facts,unit=host_guard.collect()
    try:
        host_guard.evaluate(facts,unit)
        report["physical_original_r25"]="PASS_READ_ONLY_BASELINE_PINNED"
    except host_guard.Hold:
        report["physical_original_r25"]="HOLD_OR_NEW_RELEASE_ACTIVE_NO_BASELINE_PROOF"
    report["web_pid"]=facts["web_pid"]
    return report

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    g=parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--inspect",action="store_true")
    g.add_argument("--stage",action="store_true")
    g.add_argument("--activate",action="store_true")
    g.add_argument("--rollback",action="store_true")
    g.add_argument("--recover",action="store_true")
    parser.add_argument("--permit-sha256",default="")
    args=parser.parse_args()
    try:
        require_reviewed_source_bytes()
        if args.inspect:
            print(json.dumps(inspect(),sort_keys=True));return
        phase=("stage" if args.stage else "activate" if args.activate else
               "rollback" if args.rollback else "recover")
        permit_path=(STAGE_PERMIT_PATH if args.stage else ACTIVATE_PERMIT_PATH)
        if args.recover:
            # Recover uses the exact original stage permit before STOP_INTENT,
            # and the independent activation permit after crossing it.
            rows=load_events()
            crossed=any(row["state"] in ("STOP_INTENT","WEB_STOPPED",
                    "UNIT_SWAP_INTENT","UNIT_SWAPPED","START_INTENT",
                    "CANDIDATE_STARTED","PUBLIC_VERIFIED","COMPLETED")
                    for row in rows)
            permit_path=ACTIVATE_PERMIT_PATH if crossed else STAGE_PERMIT_PATH
        obj=permit(permit_path,args.permit_sha256,phase)
        obj["_permit_sha"]=args.permit_sha256
        if args.stage:
            need(not JOURNAL.exists(),"ONE_USE_JOURNAL_ALREADY_EXISTS")
            ensure_dir(JOURNAL,create=True)
            with Exclusive():
                result=pre_approval_stage(INPUT_PATH,obj)
        else:
            with Exclusive():
                if args.activate:result=activate(obj)
                elif args.rollback:result=restore(obj,"OWNER_REQUESTED_ROLLBACK")
                else:result=restore(obj,"INTERRUPTION_RECOVERY",manual=False)
        print(json.dumps(result,sort_keys=True))
    except (Hold,OSError,ValueError,subprocess.SubprocessError,tarfile.TarError,
            EOFError,json.JSONDecodeError,BlockingIOError) as exc:
        print(json.dumps({"status":"HOLD_ONE_USE_PUBLIC_PLAYER_CUTOVER",
                          "reason":str(exc)[:220],"finance_authorized":False,
                          "no_legacy_3030_public_reroute":True},sort_keys=True))
        raise SystemExit(2)
if __name__=="__main__":main()
