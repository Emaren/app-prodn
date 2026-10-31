#!/usr/bin/env python3
"""R25 C additive HEL1 exact Git archive -> parallel Next source/build/3031.

No existing web unit, 3030, live checkout, release.lock, Wolo or finance writes.
Root operator is source-pinned and delivered in memory over strict owner SSH.
SOURCE_STAGED and BUILD_STAGED are distinct. Starting needs independent B+F
positive root-sealed admission: there is deliberately NO default bypass.
"""
from __future__ import annotations
import argparse, hashlib, io, json, os, pathlib, pwd, re, shutil, socket
import stat, subprocess, sys, tarfile, time, urllib.request

SHA="0cee3c836c4b0760478280c145e02e81e470ce0e"
HOST="ubuntu-4gb-hel1-11"
SOURCE=pathlib.Path("/var/lib/aoe2war-r24-source-bundles")/(SHA+".tar")
DEST=pathlib.Path("/var/www/AoE2HDBets/app-prodn-r24-w1safe-0cee3c836c4b")
AUDIT=pathlib.Path("/var/lib/aoe2war-r25-c-additive")
OLD_UNIT="aoe2hdbets-web.service"
NEW_UNIT="aoe2hdbets-web-r24.service"
OLD_PID=2625090
LOCK=pathlib.Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
LOCK_SHAPE=(2064,6185747,1000,0o644)
BUILDER="aoe2war-r24-build"
WEBUSER="aoe2war-r24-web"
GIB=1024**3
MAX_PEAK=8*GIB
MAX_ENTRIES=200000
MAX_ARCHIVE=4*GIB
MAX_EXTRACT=8*GIB
B_APPROVAL=pathlib.Path("/etc/aoe2war/r24-parallel-web/b-positive-runtime.json")
# Required independently reviewed positive B root receipt; never a fake SHA.
B_APPROVED_RECEIPT_SHA256=""
F_APPROVED_RUNTIME_SOURCE_SHA=""
UNIT_PATH=pathlib.Path("/etc/systemd/system")/NEW_UNIT
HEX64=re.compile(r"[0-9a-f]{64}\Z")
HEX40=re.compile(r"[0-9a-f]{40}\Z")

class Hold(RuntimeError): pass
def need(condition,why):
    if not condition:raise Hold(why)
def sha(b):return hashlib.sha256(b).hexdigest()
def canonical(x):return json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode()
def command(argv,timeout=30,data=None):
    p=subprocess.run(list(map(str,argv)),input=data,stdout=subprocess.PIPE,
                     stderr=subprocess.PIPE,timeout=timeout)
    need(p.returncode==0, "COMMAND_FAILED:"+str(argv[0])+":"+p.stderr.decode(errors="replace")[-200:])
    return p.stdout
def read_no_symlink(p,limit=65536,root_only=False):
    st=p.lstat()
    need(stat.S_ISREG(st.st_mode) and not st.st_mode&0o022 and
         (not root_only or st.st_uid==0) and 0<st.st_size<=limit,
         "UNTRUSTED_FILE:"+str(p))
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:return os.read(fd,limit+1)
    finally:os.close(fd)
def protected_root_dir(p,mode=None):
    need(p.is_dir() and not p.is_symlink(),"PROTECTED_DIR_ABSENT:"+str(p))
    for v in (p,*p.parents):
        s=v.lstat()
        need(stat.S_ISDIR(s.st_mode) and s.st_uid==0 and not s.st_mode&0o022,
             "DIR_OWNER_MODE:"+str(v))
    if mode is not None:
        need(stat.S_IMODE(p.stat().st_mode)==mode,"DIR_MODE:"+str(p))
def fsyncdir(p):
    fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
def write_once(p,obj):
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:
        f.write(canonical(obj)+b"\n");f.flush();os.fsync(f.fileno())
    fsyncdir(p.parent)
def old_identity():
    need(sys.platform=="linux" and socket.gethostname()==HOST and os.geteuid()==0,
         "EXACT_HEL1_ROOT_ONLY")
    st=LOCK.lstat()
    need(stat.S_ISREG(st.st_mode) and
         (st.st_dev,st.st_ino,st.st_uid,stat.S_IMODE(st.st_mode))==LOCK_SHAPE,
         "ORIGINAL_RELEASE_LOCK_CHANGED")
    line=command(["/usr/bin/systemctl","show",OLD_UNIT,
                 "-p","MainPID","-p","ActiveState","-p","User"]).decode()
    pairs=dict(row.split("=",1) for row in line.splitlines() if "=" in row)
    need(pairs.get("MainPID")==str(OLD_PID) and pairs.get("ActiveState")=="active",
         "OLD_FINANCIAL_WEB_PID_DRIFT_DO_NOT_TOUCH")
    listening=command(["/usr/bin/ss","-H","-ltn"]).decode()
    need(any(re.search(r":3030\s",r) for r in listening.splitlines()),
         "ORIGINAL_3030_UNAVAILABLE")
    return line
def boundary_sockets():
    out=command(["/usr/bin/ss","-H","-ltnpe"]).decode()
    result={}
    for port in (8092,8093):
        hits=[line for line in out.splitlines() if re.search(":"+str(port)+r"\s",line)]
        need(len(hits)==1,"WOLO_LISTENER_CHANGED:"+str(port))
        result[str(port)]=hits[0]
    return result
def ensure_not_running_candidate():
    p=command(["/usr/bin/systemctl","show",NEW_UNIT,"-p","MainPID","-p","ActiveState"]).decode()
    result=dict(x.split("=",1) for x in p.splitlines() if "=" in x)
    need(result.get("ActiveState") in ("inactive","failed","not-found","")
         and result.get("MainPID") in ("0",""),"NEW_SERVICE_ALREADY_ACTIVE")
    out=command(["/usr/bin/ss","-H","-ltn"]).decode()
    need(not any(re.search(r":3031\s",r) for r in out.splitlines()),
         "PORT_3031_OCCUPIED")
def root_storage_capacity():
    # E pre-stage conservative bound: root holds 2x 8GiB candidate peak + 4GiB.
    fs=os.statvfs(DEST.parent)
    rootfree=fs.f_bavail*fs.f_frsize
    need(rootfree>=2*MAX_PEAK+4*GIB,"E_ROOT_BUILD_RESERVE_INSUFFICIENT")
    attached=pathlib.Path("/mnt/HC_Volume_105319120")
    need(os.stat(DEST.parent).st_dev!=os.stat(attached).st_dev,
         "E_SEPARATE_STORAGE_DEVICE_MISSING")
    vol=os.statvfs(attached)
    volume_free=vol.f_bavail*vol.f_frsize
    # E's full old-runtime copy budget must be independently positive before nginx
    oldnext=pathlib.Path("/var/www/AoE2HDBets/app-prodn/.next")
    need(oldnext.is_dir(),"ORIGINAL_NEXT_FOR_DURABLE_BUDGET_MISSING")
    allocated=int(command(["/usr/bin/du","-s","-B1",str(oldnext)]).decode().split()[0])
    required=int(allocated*1.1)+512*1024**2+4*GIB
    need(volume_free>=required,"E_ATTACHED_ROLLBACK_AND_EMERGENCY_RESERVE_INSUFFICIENT")
    return {"root_free_bytes":rootfree,"root_required_bytes":2*MAX_PEAK+4*GIB,
            "attached_free_bytes":volume_free,"attached_required_bytes":required,
            "old_next_allocated":allocated}
def archive_identity(expected):
    need(bool(HEX64.fullmatch(expected)),"MAC_ARCHIVE_SHA256_MANDATORY")
    protected_root_dir(SOURCE.parent)
    st=SOURCE.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022
         and 0<st.st_size<=MAX_ARCHIVE,"SOURCE_ARCHIVE_NOT_ROOT_PROTECTED")
    fd=os.open(SOURCE,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    h=hashlib.sha256()
    try:
        with os.fdopen(fd,"rb") as f:
            while True:
                b=f.read(1024*1024)
                if not b:break
                h.update(b)
    except BaseException:raise
    need(h.hexdigest()==expected,"MAC_REMOTE_ARCHIVE_SHA256_NOT_EQUAL")
    with SOURCE.open("rb") as f:
        git=subprocess.run(["/usr/bin/git","get-tar-commit-id"],
                           stdin=f,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=40)
    need(git.returncode==0 and git.stdout.decode().strip()==SHA,
         "GIT_ARCHIVE_COMMIT_ID_NOT_CANDIDATE")
    return st.st_size
def tar_inventory():
    rows=[]; seen=set(); total=0
    with tarfile.open(SOURCE,mode="r:") as tf:
        for member in tf:
            need(len(rows)<MAX_ENTRIES,"ARCHIVE_ENTRY_LIMIT")
            rel=pathlib.PurePosixPath(member.name)
            name=str(rel)
            need(name not in ("",".") and not rel.is_absolute() and
                 ".." not in rel.parts and all(x not in ("",".git") for x in rel.parts)
                 and not member.pax_headers.get("GNU.sparse.map"),
                 "ARCHIVE_PATH_OR_SPARSE_FORBIDDEN")
            need(name not in seen,"ARCHIVE_DUPLICATE_ENTRY")
            seen.add(name)
            need(member.isfile() or member.isdir(),"ARCHIVE_SPECIAL_OR_LINK_ENTRY")
            need(not member.mode&0o6000 and member.size>=0,"ARCHIVE_DANGEROUS_MODE")
            if member.isfile():
                total+=member.size
                need(total<=MAX_EXTRACT,"ARCHIVE_EXPANSION_EXCEEDS_PEAK")
            rows.append({"name":name,"kind":"file" if member.isfile() else "dir",
                         "size":member.size if member.isfile() else 0,
                         "mode":0o755 if member.mode&0o111 else 0o644})
    need(len(rows)>100,"INCOMPLETE_GIT_ARCHIVE")
    return rows,total
def stage_source(expected):
    before=old_identity(); sockets=boundary_sockets(); ensure_not_running_candidate()
    budget=root_storage_capacity()
    length=archive_identity(expected)
    need(not DEST.exists() and not DEST.is_symlink(),"CANDIDATE_STAGE_EXISTS_NO_REPLAY")
    protected_root_dir(DEST.parent)
    protected_root_dir(AUDIT.parent)
    if not AUDIT.exists():os.mkdir(AUDIT,0o700);fsyncdir(AUDIT.parent)
    protected_root_dir(AUDIT,0o700)
    need(not (AUDIT/"SOURCE_STAGED.json").exists(),"SOURCE_ALREADY_STAGED")
    rows,total=tar_inventory()
    os.mkdir(DEST,0o700)
    # Durable ownership is root. No source deletion; partial source is HOLD.
    with tarfile.open(SOURCE,mode="r:") as tf:
        for row in rows:
            path=DEST.joinpath(*pathlib.PurePosixPath(row["name"]).parts)
            need(path.is_relative_to(DEST),"ARCHIVE_PATH_ESCAPE")
            if row["kind"]=="dir":
                path.mkdir(parents=True,exist_ok=True)
            else:
                path.parent.mkdir(parents=True,exist_ok=True)
                f=tf.extractfile(row["name"])
                need(f is not None,"ARCHIVE_FILE_MISSING")
                fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
                with os.fdopen(fd,"wb") as dst:
                    h=hashlib.sha256();count=0
                    while True:
                        piece=f.read(1024*1024)
                        if not piece:break
                        count+=len(piece);need(count<=row["size"],"FILE_EXPANSION_DRIFT")
                        h.update(piece);dst.write(piece)
                    need(count==row["size"],"FILE_LENGTH_MISMATCH")
                    dst.flush();os.fsync(dst.fileno())
                row["sha256"]=h.hexdigest()
    (DEST/"r24-source-sha").write_text(SHA+"\n")
    need(old_identity()==before and boundary_sockets()==sockets,
         "OLD_WEB_OR_WOLO_CHANGED_DURING_SOURCE_STAGE")
    write_once(AUDIT/"SOURCE_STAGED.json",{
       "status":"SOURCE_STAGED","candidate_sha":SHA,"git_archive_sha256":expected,
       "archive_bytes":length,"expanded_source_bytes":total,
       "files":sum(x["kind"]=="file" for x in rows),
       "source_manifest_sha256":sha(canonical(rows)),
       "budget":budget,"old_web_mainpid":OLD_PID,
       "old_web_untouched":True,"financial_writes_authorized":False,
       "new_candidate_started":False})
    # Retain full SHA256 manifest separately, root-owned and no overwrite.
    write_once(AUDIT/"SOURCE_FILES.json",{"schema":"r25-c-source-files.v1","rows":rows})
    print("PASS:SOURCE_STAGED SHA="+SHA+" ARCHIVE_SHA256="+expected,flush=True)
    return True
def build_source():
    before=old_identity();sockets=boundary_sockets();ensure_not_running_candidate()
    protected_root_dir(AUDIT,0o700)
    record=json.loads(read_no_symlink(AUDIT/"SOURCE_STAGED.json",65536,True))
    need(record.get("status")=="SOURCE_STAGED" and record.get("candidate_sha")==SHA,
         "SOURCE_STAGED_RECEIPT_MISSING")
    need(DEST.is_dir() and not DEST.is_symlink() and
         (DEST/"r24-source-sha").read_text().strip()==SHA,
         "SOURCE_STAGE_CHANGED")
    need(not (AUDIT/"BUILD_STAGED.json").exists()
         and not (AUDIT/"BUILD_ATTEMPT.json").exists(),"BUILD_ALREADY_ATTEMPTED_OR_PARTIAL")
    budget=root_storage_capacity()
    # Never run node package scripts as root or the historical tony web UID.
    try:
        account=pwd.getpwnam(BUILDER)
    except KeyError:
        command(["/usr/sbin/useradd","--system","--no-create-home","--shell",
                 "/usr/sbin/nologin",BUILDER])
        account=pwd.getpwnam(BUILDER)
    need(account.pw_uid not in (0,1000),"BUILD_ACCOUNT_NOT_ISOLATED")
    yarn=pathlib.Path("/home/tony/.cache/node/corepack/v1/yarn/1.22.22")
    need(yarn.is_dir() and (yarn/"bin/yarn.js").is_file(),
         "CANONICAL_YARN_1_22_22_UNAVAILABLE")
    shutil.copytree(yarn,DEST/".r25-yarn",symlinks=False)
    for sub in (".r25-home",".r25-cache",".r25-tmp"):
        (DEST/sub).mkdir(mode=0o700)
    command(["/usr/bin/chown","-R",f"{account.pw_uid}:{account.pw_gid}",str(DEST)],timeout=160)
    # One-use marker retained even if any transient sandbox fails: no blind retry.
    write_once(AUDIT/"BUILD_ATTEMPT.json",{"candidate_sha":SHA,
       "status":"BUILD_ATTEMPT_ENTERED","root_source_unchanged":True,
       "build_uid":account.pw_uid,"financial_credentials_inherited":False})
    common=["/usr/bin/systemd-run","--wait","--collect","--pipe",
            "--property=User="+BUILDER,"--property=Group="+BUILDER,
            "--property=WorkingDirectory="+str(DEST),
            "--property=ProtectSystem=strict",
            "--property=ReadWritePaths="+str(DEST),
            "--property=ProtectHome=yes","--property=PrivateTmp=yes",
            "--property=PrivateDevices=yes","--property=NoNewPrivileges=yes",
            "--property=CapabilityBoundingSet=",
            "--property=InaccessiblePaths=/etc/aoe2hdbets /mnt/HC_Volume_105319120 /var/www/AoE2HDBets/app-prodn",
            "--setenv=HOME="+str(DEST/".r25-home"),
            "--setenv=XDG_CACHE_HOME="+str(DEST/".r25-cache"),
            "--setenv=TMPDIR="+str(DEST/".r25-tmp"),
            "--setenv=WARGRAPH_RUNTIME_DISABLED=true",
            "--setenv=AOE2WAR_PROD_DB_PREVIEW=true",
            "--setenv=NEXT_TELEMETRY_DISABLED=1",
            "--setenv=NODE_OPTIONS=--max-old-space-size=2304"]
    yarnjs=str(DEST/".r25-yarn/bin/yarn.js")
    # Fetch phase executes ZERO third-party lifecycle scripts. Network egress
    # excludes localhost. If IP firewall/cgroup enforcement fails, HOLD.
    fetch=common+["--unit=aoe2war-r25-deps-"+SHA[:8],
       "--property=IPAddressDeny=localhost","--property=IPAddressDeny=link-local",
       "/usr/bin/node",yarnjs,"install","--frozen-lockfile","--ignore-scripts",
       "--non-interactive","--cache-folder",str(DEST/".r25-cache")]
    command(fetch,timeout=1500)
    # Explicit first-party, checksum-verifying engine seed in the same sandbox.
    seed=common+["--unit=aoe2war-r25-prisma-"+SHA[:8],
       "--property=IPAddressDeny=localhost","--property=IPAddressDeny=link-local",
       "/usr/bin/python3",str(DEST/"scripts/aoe2_prisma_engine_seed.py")]
    command(seed,timeout=500)
    # All package lifecycle build scripts run with NO NETWORK, no host secrets.
    scripts=(f"/usr/bin/node {yarnjs} install --frozen-lockfile --offline "
             f"--force --non-interactive --cache-folder {DEST/'.r25-cache'} && "
             f"/usr/bin/node {yarnjs} build")
    build=common+["--unit=aoe2war-r25-build-"+SHA[:8],
       "--property=PrivateNetwork=yes","--property=MemoryMax=4G",
       "--property=TimeoutStartSec=1800",
       "/bin/sh","-c",scripts]
    command(build,timeout=1900)
    need((DEST/".next/BUILD_ID").is_file(),"REAL_NEXT_BUILD_ID_MISSING")
    build_id=(DEST/".next/BUILD_ID").read_text().strip()
    version=(DEST/".aoe2war-build-version").read_text().strip()
    need(re.fullmatch(r"[A-Za-z0-9_-]{8,128}",build_id) and
         re.fullmatch(r"[A-Za-z0-9_-]{8,128}",version),
         "NEW_BUILD_ID_OR_VERSION_INVALID")
    # Root-seal all installed bytes before opening any runtime or F routing.
    command(["/usr/bin/chown","-R","root:root",str(DEST)],timeout=200)
    tree_rows=[]
    for path in sorted(DEST.rglob("*")):
        st=path.lstat()
        need(stat.S_ISREG(st.st_mode) or stat.S_ISDIR(st.st_mode)
             or stat.S_ISLNK(st.st_mode),"UNSAFE_BUILD_ARTIFACT_TYPE")
        if stat.S_ISLNK(st.st_mode):
            resolved=path.resolve()
            need(resolved.is_relative_to(DEST),"BUILD_SYMLINK_ESCAPE")
            tree_rows.append({"path":str(path.relative_to(DEST)),
                              "type":"symlink","target":os.readlink(path)})
        elif stat.S_ISDIR(st.st_mode):
            path.chmod(0o755)
        else:
            path.chmod(0o755 if st.st_mode&0o111 else 0o644)
            h=hashlib.sha256()
            with path.open("rb") as f:
                for b in iter(lambda:f.read(1024*1024),b""):h.update(b)
            tree_rows.append({"path":str(path.relative_to(DEST)),
                              "type":"file","size":st.st_size,"sha256":h.hexdigest()})
    DEST.chmod(0o755)
    need(old_identity()==before and boundary_sockets()==sockets,
         "OLD_WEB_OR_FINANCE_CHANGED_DURING_BUILD")
    manifest={"schema":"aoe2war.r25.c.full-built-artifact.v1",
       "status":"BUILD_STAGED","candidate_sha":SHA,
       "build_id":build_id,"build_version":version,
       "source_git_archive_sha256":record["git_archive_sha256"],
       "tree_sha256":sha(canonical(tree_rows)),
       "files":len(tree_rows),"root_sealed":True,
       "old_web_pid_untouched":OLD_PID,"new_service_started":False,
       "financial_writes_authorized":False,"budget":budget}
    write_once(AUDIT/"BUILD_STAGED.json",manifest)
    write_once(AUDIT/"BUILD_FILES.json",{"schema":"aoe2war.r25.c.full-artifact-files.v1",
                                      "rows":tree_rows})
    print("PASS:BUILD_STAGED BUILD_ID="+build_id+" BUILD_VERSION="+version,flush=True)
    return True
def start_candidate():
    # Do not start until B/F provide independent POSITIVE nonfinancial runtime
    # admission and host-verified read-only DB/secret/HTTP method isolation.
    need(bool(HEX64.fullmatch(B_APPROVED_RECEIPT_SHA256)) and
         bool(HEX40.fullmatch(F_APPROVED_RUNTIME_SOURCE_SHA)),
         "B_AND_F_INDEPENDENT_POSITIVE_RUNTIME_APPROVAL_NOT_INSTALLED")
    old_identity()
    protected_root_dir(B_APPROVAL.parent,0o700)
    raw=read_no_symlink(B_APPROVAL,65536,True)
    need(sha(raw)==B_APPROVED_RECEIPT_SHA256,"B_ROOT_SEALED_BYTES_NOT_APPROVED")
    b=json.loads(raw)
    need(b.get("schema")=="aoe2war.r25.b.positive-parallel-runtime.v1" and
         b.get("candidate_sha")==SHA and
         b.get("wargraph_disabled_verified") is True and
         b.get("server_enforced_select_only_pg_role") is True and
         b.get("no_custody_secrets") is True and
         b.get("loopback_and_public_write_methods_denied") is True and
         b.get("egress_to_financial_writers_denied") is True and
         b.get("release_authorized") is True,
         "B_RUNTIME_OR_FINANCIAL_ISOLATION_UNVERIFIED")
    # F must publish its accepted service+ingress implementation before this
    # stage is promoted into a running app. No bare Next on open localhost.
    need(UNIT_PATH.is_file() and UNIT_PATH.stat().st_uid==0 and
         (AUDIT/"BUILD_STAGED.json").is_file(),
         "F_REVIEWED_SYSTEMD_UNIT_OR_C_BUILD_MISSING")
    raise Hold("F_RUNTIME_START_INTEGRATION_PENDING_NO_UNREVIEWED_ROOT_START")
def main():
    ap=argparse.ArgumentParser()
    commands=ap.add_mutually_exclusive_group(required=True)
    commands.add_argument("--source-stage",action="store_true")
    commands.add_argument("--source-build",action="store_true")
    commands.add_argument("--build-stage",action="store_true")
    commands.add_argument("--candidate-start",action="store_true")
    ap.add_argument("--archive-sha256",default="")
    a=ap.parse_args()
    if a.source_stage:stage_source(a.archive_sha256)
    elif a.source_build:
        stage_source(a.archive_sha256)
        build_source()
    elif a.build_stage:build_source()
    else:start_candidate()
if __name__=="__main__":
    try:main()
    except (Hold,OSError,subprocess.SubprocessError,tarfile.TarError,
            json.JSONDecodeError,ValueError,KeyError,TimeoutError) as exc:
        print("HOLD:R25_C:"+type(exc).__name__+":"+str(exc)[:350],file=sys.stderr)
        print("NO_RETRY_IF_PARTIAL: preserve any existing stage and audit for independent recovery.",file=sys.stderr)
        sys.exit(2)
