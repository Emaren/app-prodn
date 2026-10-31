#!/usr/bin/env python3
"""R25 C read-only authenticated HEL1 proof of real SOURCE/BUILD_STAGED.

Does not start web/3031 or mutate filesystem. Does not rely on a printed
PASS alone: rehashes preserved Git tar, all built files and symlink targets,
both C manifest tables and actual Next BUILD_ID/buildVersion. HOLD if partial.
"""
from __future__ import annotations
import hashlib, json, os, pathlib, re, socket, stat, subprocess, sys
TARGET="0cee3c836c4b0760478280c145e02e81e470ce0e"
ARCHIVE_HASH="c906c75d18ca56871bfdb9fbcdb6173e2c7643ae8f58e5f44735103c530f0101"
ARCHIVE=pathlib.Path("/var/lib/aoe2war-r24-source-bundles")/(TARGET+".tar")
STAGE=pathlib.Path("/var/www/AoE2HDBets/app-prodn-r24-w1safe-0cee3c836c4b")
AUDIT=pathlib.Path("/var/lib/aoe2war-r25-c-additive")
OLD_PID="2625090"
OLD_SERVICE="aoe2hdbets-web.service"
NEW_SERVICE="aoe2hdbets-web-r24.service"
class Hold(RuntimeError):pass
def need(ok,why):
    if not ok:raise Hold(why)
def canon(obj):return json.dumps(obj,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode()
def digest(raw):return hashlib.sha256(raw).hexdigest()
def read_root_file(p,max_bytes=6000000):
    st=p.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022
         and 0<st.st_size<=max_bytes,"UNTRUSTED_ROOT_READ:"+str(p))
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        before=os.fstat(fd);raw=os.read(fd,max_bytes+1);after=os.fstat(fd)
        need(len(raw)==before.st_size and
             (before.st_dev,before.st_ino,before.st_mtime_ns,before.st_size)==
             (after.st_dev,after.st_ino,after.st_mtime_ns,after.st_size),
             "UNSTABLE_ROOT_FILE")
        return raw
    finally:os.close(fd)
def safe_root_directory(p):
    for d in (p,*p.parents):
        st=d.lstat()
        need(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,
             "UNPROTECTED_ROOT_DIRECTORY:"+str(d))
def load(p,limit=6000000):
    raw=read_root_file(p,limit)
    def no_dupes(pairs):
        d={}
        for k,v in pairs:
            need(k not in d,"DUPLICATE_JSON_FIELD")
            d[k]=v
        return d
    return json.loads(raw,object_pairs_hook=no_dupes,
        parse_constant=lambda _: (_ for _ in ()).throw(Hold("NONFINITE_JSON")))
def process_state():
    old=subprocess.run(["/usr/bin/systemctl","show",OLD_SERVICE,"-p","MainPID",
        "-p","ActiveState"],capture_output=True,timeout=15,check=True).stdout.decode()
    fields=dict(x.split("=",1) for x in old.splitlines() if "=" in x)
    need(fields.get("MainPID")==OLD_PID and fields.get("ActiveState")=="active",
         "ORIGINAL_FINANCIAL_WEB_CHANGED")
    new=subprocess.run(["/usr/bin/systemctl","show",NEW_SERVICE,"-p","MainPID",
        "-p","ActiveState"],capture_output=True,timeout=15,check=True).stdout.decode()
    nf=dict(x.split("=",1) for x in new.splitlines() if "=" in x)
    need(nf.get("MainPID") in ("0","") and
         nf.get("ActiveState") in ("inactive","failed","not-found",""),
         "NEW_WEB_RUNNING_BEFORE_B_F_APPROVAL")
    ss=subprocess.run(["/usr/bin/ss","-H","-ltn"],capture_output=True,timeout=15,check=True).stdout.decode()
    need(any(re.search(r":3030\s",x) for x in ss.splitlines()),"ORIGINAL_3030_NOT_LISTENING")
    need(not any(re.search(r":3031\s",x) for x in ss.splitlines()),"3031_STARTED_UNEXPECTEDLY")
def archive_digest():
    h=hashlib.sha256();st=ARCHIVE.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,
         "ARCHIVE_NOT_ROOT_OWNED")
    fd=os.open(ARCHIVE,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        with os.fdopen(fd,"rb") as f:
            while True:
                b=f.read(1024*1024)
                if not b:break
                h.update(b)
    finally:pass
    need(h.hexdigest()==ARCHIVE_HASH,"ORIGINAL_OWNER_ARCHIVE_DIGEST_CHANGED")
    with ARCHIVE.open("rb") as f:
        p=subprocess.run(["/usr/bin/git","get-tar-commit-id"],stdin=f,
                         capture_output=True,timeout=45,check=True)
    need(p.stdout.decode().strip()==TARGET,"ORIGINAL_GIT_ARCHIVE_COMMIT_CHANGED")
    return h.hexdigest()
def check_manifest(source,build,files):
    need(source.get("status")=="SOURCE_STAGED" and
         source.get("candidate_sha")==TARGET and
         source.get("git_archive_sha256")==ARCHIVE_HASH,"SOURCE_RECEIPT_NOT_EXACT")
    need(build.get("status")=="BUILD_STAGED" and
         build.get("candidate_sha")==TARGET and
         build.get("source_git_archive_sha256")==ARCHIVE_HASH and
         build.get("old_web_pid_untouched")==2625090 and
         build.get("root_sealed") is True and
         build.get("new_service_started") is False and
         build.get("financial_writes_authorized") is False,
         "BUILD_RECEIPT_NOT_EXACT")
    need(files.get("schema")=="aoe2war.r25.c.full-artifact-files.v1"
         and type(files.get("rows")) is list,"BUILD_MANIFEST_SCHEMA")
    rows=files["rows"]
    need(len(rows)==build.get("files") and len(rows)>100,
         "BUILD_MANIFEST_INCOMPLETE")
    need(digest(canon(rows))==build.get("tree_sha256"),
         "BUILD_MANIFEST_DIGEST_DRIFT")
    return rows
def verify_tree(rows):
    names=set();count=0
    for item in rows:
        need(type(item) is dict and type(item.get("path")) is str,"BAD_MANIFEST_ROW")
        name=item["path"];p=pathlib.PurePosixPath(name)
        need(not p.is_absolute() and ".." not in p.parts and name not in names,
             "BAD_MANIFEST_PATH_OR_DUPLICATE")
        names.add(name);actual=STAGE.joinpath(*p.parts)
        st=actual.lstat()
        if item.get("type")=="file":
            need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and
                 st.st_size==item.get("size"),"MANIFEST_FILE_BYTES_CHANGED:"+name)
            h=hashlib.sha256()
            with actual.open("rb") as f:
                for b in iter(lambda:f.read(1024*1024),b""):h.update(b)
            need(h.hexdigest()==item.get("sha256"),"MANIFEST_FILE_SHA_CHANGED:"+name)
        elif item.get("type")=="symlink":
            need(stat.S_ISLNK(st.st_mode) and os.readlink(actual)==item.get("target")
                 and actual.resolve().is_relative_to(STAGE),
                 "MANIFEST_SYMLINK_CHANGED:"+name)
        else:raise Hold("UNRECOGNIZED_MANIFEST_KIND")
        count+=1
    discovered=set()
    for base,dirs,files in os.walk(STAGE,followlinks=False):
        for n in dirs+files:
            p=pathlib.Path(base)/n
            if not p.is_dir() or p.is_symlink():
                discovered.add(p.relative_to(STAGE).as_posix())
    need(discovered==names,"UNLISTED_OR_MISSING_BUILT_FILES")
    return count
def main():
    need(sys.platform=="linux" and socket.gethostname()=="ubuntu-4gb-hel1-11"
         and os.geteuid()==0,"EXACT_HEL1_ROOT_ONLY")
    for p in (ARCHIVE.parent,AUDIT,STAGE):
        safe_root_directory(p)
    need(stat.S_IMODE(AUDIT.stat().st_mode)==0o700,"AUDIT_NOT_ROOT_PRIVATE")
    process_state()
    archive_digest()
    source=load(AUDIT/"SOURCE_STAGED.json",65536)
    sourcefiles=load(AUDIT/"SOURCE_FILES.json")
    need(sourcefiles.get("schema")=="r25-c-source-files.v1"
         and digest(canon(sourcefiles.get("rows")))==source.get("source_manifest_sha256"),
         "SOURCE_FILE_MANIFEST_DRIFT")
    build=load(AUDIT/"BUILD_STAGED.json",65536)
    files=load(AUDIT/"BUILD_FILES.json",16000000)
    rows=check_manifest(source,build,files)
    count=verify_tree(rows)
    build_id=read_root_file(STAGE/".next/BUILD_ID",256).decode().strip()
    version=read_root_file(STAGE/".aoe2war-build-version",256).decode().strip()
    need(build_id==build["build_id"] and version==build["build_version"],
         "REAL_BUILD_ID_OR_VERSION_DRIFT")
    process_state()
    print(json.dumps({"status":"PASS_R25_C_INDEPENDENT_BUILD_STAGED",
        "candidate_sha":TARGET,"archive_sha256":ARCHIVE_HASH,"next_build_id":build_id,
        "build_version":version,"artifact_tree_sha256":build["tree_sha256"],
        "verified_files":count,"old_pid":2625090,"old_3030_preserved":True,
        "new_3031_not_started":True,"nginx_cutover_not_claimed":True},sort_keys=True))
if __name__=="__main__":
    try:main()
    except (Hold,OSError,ValueError,KeyError,json.JSONDecodeError,
            subprocess.SubprocessError) as e:
        print("HOLD:R25_C_INDEPENDENT_READBACK:"+type(e).__name__+":"+str(e)[:300],
              file=sys.stderr);sys.exit(2)
