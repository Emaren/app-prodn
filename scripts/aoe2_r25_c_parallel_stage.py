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
# Root-owned /var/lib is the trust boundary: original /var/www/AoE2HDBets
# is not root-owned and MUST NOT be chmod/chowned or used as stage parent.
DEST=pathlib.Path("/var/lib/aoe2war-r25-web-0cee3c836c4b")
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
def redacted_diagnostic_tail(raw,limit=1100):
    """Sanitize terminal errors; never persist raw logs or dump env/credentials."""
    text=raw[-32768:].decode("utf-8","replace")
    text=re.sub(r"\x1b\[[0-9;]*[A-Za-z]","",text)
    # A registry URL may carry auth in userinfo or query parameters.
    text=re.sub(r"(?i)\b(?:https?|postgres(?:ql)?|redis)://\S+",
                "[URL_REDACTED]",text)
    text=re.sub(r"(?i)\bauthorization\s*[:=]\s*(?:Bearer\s+)?[^\r\n]+",
                "[AUTHORIZATION_REDACTED]",text)
    text=re.sub(r"(?i)\b(?:authorization|cookie|set-cookie|password|passwd|"
                r"secret|token|_authToken|api[-_]?key|client[-_]?secret|"
                r"database_url|nextauth_secret|session_secret)"
                r"\s*[:=]\s*\S+",
                "[CREDENTIAL_REDACTED]",text)
    text=re.sub(r"(?i)\bBearer\s+\S+","[BEARER_REDACTED]",text)
    lines=[line.strip()[:320] for line in text.splitlines() if line.strip()]
    # Prefer diagnostic lines and retain a bounded tail for causal context.
    pattern=re.compile(r"error|failed|fatal|exit|EAI_AGAIN|ENOTFOUND|ENOENT|"
                       r"EACCES|permission|network|timeout|registry|prisma|"
                       r"lockfile|integrity|module|not found",re.I)
    selected=[line for line in lines if pattern.search(line)]
    return "\n".join((selected[-12:] or lines[-12:]))[-limit:]

def command(argv,timeout=30,data=None):
    args=list(map(str,argv))
    p=subprocess.run(args,input=data,stdout=subprocess.PIPE,
                     stderr=subprocess.PIPE,timeout=timeout)
    if p.returncode:
        unit=next((v.split("=",1)[1] for v in args
                   if v.startswith("--unit=")),"none")
        # Output can be on STDOUT when systemd-run --pipe is used. Include
        # BOTH bounded streams, the unit name and the actual return code.
        # Preserve transaction markers; no re-execution or cleanup on HOLD.
        message=("COMMAND_FAILED:"+args[0]+":UNIT="+unit+
                 ":EXIT="+str(p.returncode)+
                 ":STDOUT="+redacted_diagnostic_tail(p.stdout)+
                 ":STDERR="+redacted_diagnostic_tail(p.stderr))
        raise Hold(message[:2700])
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
    need(DEST.parent==pathlib.Path('/var/lib') and DEST.name.startswith('aoe2war-r25-web-'),
         'R25_ROOT_PROTECTED_STAGE_PARENT_REQUIRED')
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
    fsyncdir(DEST)
    fsyncdir(DEST.parent)
    need(old_identity()==before and boundary_sockets()==sockets,
         "OLD_WEB_OR_WOLO_CHANGED_DURING_SOURCE_STAGE")
    write_once(AUDIT/"SOURCE_FILES.json",{"schema":"r25-c-source-files.v1","rows":rows})
    write_once(AUDIT/"SOURCE_STAGED.json",{
       "status":"SOURCE_STAGED","candidate_sha":SHA,"git_archive_sha256":expected,
       "archive_bytes":length,"expanded_source_bytes":total,
       "files":sum(x["kind"]=="file" for x in rows),
       "source_manifest_sha256":sha(canonical(rows)),
       "budget":budget,"old_web_mainpid":OLD_PID,
       "old_web_untouched":True,"financial_writes_authorized":False,
       "new_candidate_started":False})
    print("PASS:SOURCE_STAGED SHA="+SHA+" ARCHIVE_SHA256="+expected,flush=True)
    return True
def import_yarn_classic_bounded(base=None):
    """Import ONLY Yarn Classic's bundle and launcher, never recursively as root.

    The existing Corepack cache is operator-owned and may include unrelated
    symlinks. Treat it as untrusted *input*: O_NOFOLLOW on each exact file,
    no symlink ancestor, bounded length, and no root execution. Yarn is run
    later only as dedicated sandboxed BUILD UID with no production secrets.
    """
    base=(pathlib.Path(base) if base is not None else
          pathlib.Path("/home/tony/.cache/node/corepack/v1/yarn/1.22.22"))
    need(not (DEST/".r25-yarn").exists()
         and not (DEST/".r25-yarn").is_symlink(),
         "YARN_STAGE_ALREADY_EXISTS_NO_REPLAY")
    # Include zero optional/symlinked vendor trees, scripts or node_modules.
    needed={"package.json":65536,"bin/yarn.js":65536,
            "lib/cli.js":8*1024*1024}
    rawfiles={}
    for name,limit in needed.items():
        p=base.joinpath(*pathlib.PurePosixPath(name).parts)
        for parent in reversed(p.parents):
            st=parent.lstat()
            need(stat.S_ISDIR(st.st_mode),"YARN_PARENT_SYMLINK_OR_NOT_DIR:"+str(parent))
        st=p.lstat()
        need(stat.S_ISREG(st.st_mode) and st.st_uid in (0,pwd.getpwnam("tony").pw_uid)
             and st.st_size>0 and st.st_size<=limit and not st.st_mode&0o022,
             "YARN_REQUIRED_BUNDLE_NOT_SAFE:"+name)
        fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
        try:
            now=os.fstat(fd)
            need(stat.S_ISREG(now.st_mode) and
                 (now.st_dev,now.st_ino,now.st_size)==(st.st_dev,st.st_ino,st.st_size),
                 "YARN_SOURCE_RACED:"+name)
            chunks=[];total=0
            while True:
                part=os.read(fd,1024*1024)
                if not part:break
                total+=len(part)
                need(total<=limit,"YARN_INPUT_OVER_LIMIT:"+name)
                chunks.append(part)
            need(total==st.st_size,"YARN_SOURCE_CHANGED_DURING_READ:"+name)
            rawfiles[name]=b"".join(chunks)
        finally:os.close(fd)
    try:package=json.loads(rawfiles["package.json"])
    except (ValueError,UnicodeDecodeError) as exc:
        raise Hold("YARN_PACKAGE_METADATA_INVALID") from exc
    need(package.get("name")=="yarn" and package.get("version")=="1.22.22",
         "YARN_COREPACK_NOT_CLASSIC_1_22_22")
    need(b"../lib/cli" in rawfiles["bin/yarn.js"],
         "YARN_ENTRYPOINT_UNKNOWN")
    # Only after entire source validation does root create independent files.
    target=DEST/".r25-yarn"
    target.mkdir(mode=0o700)
    for sub in ("bin","lib"):
        (target/sub).mkdir(mode=0o700)
    receipts={}
    for name,raw in rawfiles.items():
        dest=target.joinpath(*pathlib.PurePosixPath(name).parts)
        fd=os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,"wb") as f:
            f.write(raw);f.flush();os.fsync(f.fileno())
        receipts[name]={"sha256":sha(raw),"size":len(raw)}
    for directory in (target/"bin",target/"lib",target):
        fsyncdir(directory)
    print("PASS:YARN_CLASSIC_BOUNDED_IMPORT files="+str(len(receipts))
          +" version=1.22.22 (untrusted owner cache, sandbox execution only)",flush=True)
    return receipts

def build_source():
    before=old_identity();sockets=boundary_sockets();ensure_not_running_candidate()
    protected_root_dir(AUDIT,0o700)
    record=json.loads(read_no_symlink(AUDIT/"SOURCE_STAGED.json",65536,True))
    need(record.get("status")=="SOURCE_STAGED" and record.get("candidate_sha")==SHA,
         "SOURCE_STAGED_RECEIPT_MISSING")
    need(DEST.is_dir() and not DEST.is_symlink() and
         (DEST/"r24-source-sha").read_text().strip()==SHA,
         "SOURCE_STAGE_CHANGED")
    # A BUILD-ONLY resume must independently bind the physical source-file
    # manifest created by SOURCE_STAGED. No second archive extraction.
    roots=json.loads(read_no_symlink(AUDIT/"SOURCE_FILES.json",8*1024*1024,True))
    need(roots.get("schema")=="r25-c-source-files.v1"
         and type(roots.get("rows")) is list
         and sha(canonical(roots["rows"]))==record.get("source_manifest_sha256")
         and record.get("old_web_mainpid")==OLD_PID
         and record.get("financial_writes_authorized") is False,
         "ROOT_SOURCE_STAGED_FILES_RECEIPT_MISMATCH")
    need(record.get("git_archive_sha256")=="c906c75d18ca56871bfdb9fbcdb6173e2c7643ae8f58e5f44735103c530f0101",
         "ROOT_SOURCE_ARCHIVE_NOT_EXPECTED")
    need(DEST.parent==pathlib.Path("/var/lib") and
         DEST.stat().st_uid==0,"RESUME_BUILD_NOT_ROOT_STAGE")
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
    # Safe bounded import; no privileged recursive copy of operator-owned
    # Corepack cache and no bypass of source or archive identity.
    yarn_receipt=import_yarn_classic_bounded()
    for sub in (".r25-home",".r25-cache",".r25-tmp"):
        (DEST/sub).mkdir(mode=0o700)
    command(["/usr/bin/chown","-R",f"{account.pw_uid}:{account.pw_gid}",str(DEST)],timeout=160)
    # One-use marker retained even if any transient sandbox fails: no blind retry.
    write_once(AUDIT/"BUILD_ATTEMPT.json",{"candidate_sha":SHA,
       "status":"BUILD_ATTEMPT_ENTERED","root_source_unchanged":True,
       "build_uid":account.pw_uid,"financial_credentials_inherited":False,
       "yarn_import":yarn_receipt})
    return complete_build(before,sockets,budget,account,yarn_receipt,False,record)

def complete_build(before,sockets,budget,account,yarn_receipt,recovery,record):
    unit_tag="-dns-recovery1" if recovery else ""
    cache_dir=DEST/(".r25-cache-dns-recovery1" if recovery else ".r25-cache")
    # Prior DNS-only UID994 sandbox probe physically verified this exact bind.
    dns_bind=(["--property=BindReadOnlyPaths=/run/systemd/resolve/resolv.conf:/run/systemd/resolve/stub-resolv.conf"]
              if recovery else [])
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
    fetch=common+["--unit=aoe2war-r25-deps-"+SHA[:8]+unit_tag,
       "--property=IPAddressDeny=localhost","--property=IPAddressDeny=link-local"]+dns_bind+[
       "/usr/bin/node",yarnjs,"install","--frozen-lockfile","--ignore-scripts",
       "--non-interactive","--cache-folder",str(cache_dir)]
    command(fetch,timeout=1500)
    # Explicit first-party, checksum-verifying engine seed in the same sandbox.
    seed=common+["--unit=aoe2war-r25-prisma-"+SHA[:8]+unit_tag,
       "--property=IPAddressDeny=localhost","--property=IPAddressDeny=link-local"]+dns_bind+[
       "/usr/bin/python3",str(DEST/"scripts/aoe2_prisma_engine_seed.py")]
    command(seed,timeout=500)
    # Distinct network-disabled units provide positive evidence of exactly
    # which phase failed. Never mask offline install errors behind shell &&.
    # No host credentials, direct executable paths, or package registry egress.
    offline=common+["--unit=aoe2war-r25-offline-"+SHA[:8]+unit_tag,
       "--property=PrivateNetwork=yes","--property=MemoryMax=4G",
       "--property=TimeoutStartSec=1800",
       "/usr/bin/node",yarnjs,"install","--frozen-lockfile","--offline",
       "--force","--non-interactive","--cache-folder",str(cache_dir)]
    command(offline,timeout=1500)
    build=common+["--unit=aoe2war-r25-next-build-"+SHA[:8]+unit_tag,
       "--property=PrivateNetwork=yes","--property=MemoryMax=4G",
       "--property=TimeoutStartSec=1800",
       "/usr/bin/node",yarnjs,"build"]
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
    write_once(AUDIT/"BUILD_FILES.json",{"schema":"aoe2war.r25.c.full-artifact-files.v1",
                                      "rows":tree_rows})
    write_once(AUDIT/"BUILD_STAGED.json",manifest)
    print("PASS:BUILD_STAGED BUILD_ID="+build_id+" BUILD_VERSION="+version,flush=True)
    return True
def recover_dns_build():
    """Resume exactly one owner-observed, post-BUILD_ATTEMPT DNS failure.

    Neither the source tree nor root build journal is replaced. The original
    3030 website, 8092/8093, Nginx and financial paths are read-only boundaries.
    The only new writes are a distinct recovery attempt receipt and new
    restricted-build-UID dependency/build artifacts within the existing stage.
    """
    before=old_identity()
    sockets=boundary_sockets()
    ensure_not_running_candidate()
    protected_root_dir(AUDIT,0o700)
    need(DEST.parent==pathlib.Path("/var/lib") and not DEST.is_symlink(),
         "RECOVERY_STAGE_PARENT_DRIFT")
    build_account=pwd.getpwnam(BUILDER)
    need(build_account.pw_uid==994 and build_account.pw_uid not in (0,1000),
         "RECOVERY_BUILD_UID_NOT_OBSERVED_994")
    stage_stat=DEST.lstat()
    need(stat.S_ISDIR(stage_stat.st_mode) and
         stage_stat.st_uid==build_account.pw_uid and
         stat.S_IMODE(stage_stat.st_mode)==0o700,
         "RECOVERY_STAGE_OWNER_MODE_DRIFT")
    source=json.loads(read_no_symlink(AUDIT/"SOURCE_STAGED.json",65536,True))
    previous=json.loads(read_no_symlink(AUDIT/"BUILD_ATTEMPT.json",65536,True))
    original_rows=json.loads(read_no_symlink(AUDIT/"SOURCE_FILES.json",8*1024*1024,True))
    expected_archive="c906c75d18ca56871bfdb9fbcdb6173e2c7643ae8f58e5f44735103c530f0101"
    need(source.get("status")=="SOURCE_STAGED" and
         source.get("candidate_sha")==SHA and
         source.get("git_archive_sha256")==expected_archive and
         source.get("old_web_mainpid")==OLD_PID and
         source.get("financial_writes_authorized") is False,
         "RECOVERY_SOURCE_RECEIPT_MISMATCH")
    need(previous.get("status")=="BUILD_ATTEMPT_ENTERED" and
         previous.get("candidate_sha")==SHA and
         previous.get("build_uid")==build_account.pw_uid and
         previous.get("root_source_unchanged") is True and
         previous.get("financial_credentials_inherited") is False,
         "RECOVERY_BUILD_ATTEMPT_MISMATCH")
    rows=original_rows.get("rows")
    need(original_rows.get("schema")=="r25-c-source-files.v1" and
         type(rows) is list and len(rows)>100 and
         sha(canonical(rows))==source.get("source_manifest_sha256"),
         "RECOVERY_SOURCE_MANIFEST_MISMATCH")
    # The original worker validated the stored digest, not the source bytes.
    # For recovery rehash every extracted file before permitting any new fetch.
    seen=set()
    for item in rows:
        need(type(item) is dict and type(item.get("name")) is str,
             "RECOVERY_BAD_SOURCE_MANIFEST_ROW")
        name=item["name"]
        rel=pathlib.PurePosixPath(name)
        need(name not in seen and not rel.is_absolute() and rel.parts and
             ".." not in rel.parts and ".git" not in rel.parts,
             "RECOVERY_SOURCE_PATH_TRAVERSAL_OR_DUPLICATE")
        seen.add(name)
        file=DEST.joinpath(*rel.parts)
        st=file.lstat()
        need(st.st_uid==build_account.pw_uid and not st.st_mode&0o022,
             "RECOVERY_SOURCE_OWNER_OR_MODE_CHANGED:"+name[:90])
        if item.get("kind")=="dir":
            need(stat.S_ISDIR(st.st_mode),"RECOVERY_SOURCE_DIR_CHANGED:"+name[:90])
        elif item.get("kind")=="file":
            need(stat.S_ISREG(st.st_mode) and st.st_size==item.get("size"),
                 "RECOVERY_SOURCE_FILE_LENGTH_CHANGED:"+name[:90])
            fd=os.open(file,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
            h=hashlib.sha256()
            with os.fdopen(fd,"rb") as stream:
                for piece in iter(lambda:stream.read(1048576),b""):
                    h.update(piece)
            need(h.hexdigest()==item.get("sha256"),
                 "RECOVERY_SOURCE_FILE_DIGEST_CHANGED:"+name[:90])
        else:
            raise Hold("RECOVERY_SOURCE_KIND_CHANGED")
    need(read_no_symlink(DEST/"r24-source-sha",128).decode().strip()==SHA,
         "RECOVERY_FROZEN_SOURCE_MARKER_CHANGED")
    archive_identity(expected_archive)
    imported=previous.get("yarn_import")
    need(type(imported) is dict and
         set(imported)=={"package.json","bin/yarn.js","lib/cli.js"},
         "RECOVERY_IMPORTED_YARN_RECEIPT_INVALID")
    for name,entry in imported.items():
        need(type(entry) is dict and
             type(entry.get("size")) is int and
             type(entry.get("sha256")) is str and
             bool(HEX64.fullmatch(entry["sha256"])),
             "RECOVERY_IMPORTED_YARN_METADATA_INVALID")
        path=DEST/".r25-yarn"/name
        st=path.lstat()
        need(stat.S_ISREG(st.st_mode) and
             st.st_uid==build_account.pw_uid and
             not st.st_mode&0o022 and st.st_size==entry["size"],
             "RECOVERY_IMPORTED_YARN_FILE_DRIFT:"+name)
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
        h=hashlib.sha256()
        with os.fdopen(fd,"rb") as stream:
            for part in iter(lambda:stream.read(1048576),b""):
                h.update(part)
        need(h.hexdigest()==entry["sha256"],
             "RECOVERY_IMPORTED_YARN_DIGEST_DRIFT:"+name)
    # Physical probe observed no node_modules, .next or build-version. Refuse
    # even if there is an unexpected zero-byte/partial attempt artifact.
    for rel in ("node_modules",".next",".aoe2war-build-version",
                ".r25-cache-dns-recovery1"):
        path=DEST/rel
        need(not path.exists() and not path.is_symlink(),
             "RECOVERY_PARTIAL_ARTIFACT_OR_DUPLICATE:"+rel)
    for rel in ("BUILD_STAGED.json","BUILD_FILES.json",
                "DNS_RECOVERY_ATTEMPT.json"):
        path=AUDIT/rel
        need(not path.exists() and not path.is_symlink(),
             "RECOVERY_AUDIT_ALREADY_EXISTS:"+rel)
    for rel in (".r25-yarn",".r25-cache",".r25-home",".r25-tmp"):
        st=(DEST/rel).lstat()
        need(stat.S_ISDIR(st.st_mode) and
             st.st_uid==build_account.pw_uid and not st.st_mode&0o022,
             "RECOVERY_WORK_DIR_CHANGED:"+rel)
    # Owner read-only DNS study: exact host resolver bytes and symlink are
    # pinned, not guessed. The original /etc/resolv.conf and systemd-resolved
    # configuration are NEVER modified by this operation.
    stub=pathlib.Path("/etc/resolv.conf")
    upstream=pathlib.Path("/run/systemd/resolve/resolv.conf")
    need(stub.is_symlink() and
         stub.resolve()==pathlib.Path("/run/systemd/resolve/stub-resolv.conf"),
         "RECOVERY_HOST_RESOLVER_NOT_STUB")
    need(sha(read_no_symlink(stub.resolve(),65536))==
         "ebdf560272a77357195c39e98340b77e18c8a8ce2025ee950e9e0c7b01467ab8",
         "RECOVERY_HOST_STUB_SHA_DRIFT")
    raw=read_no_symlink(upstream,65536)
    need(sha(raw)==
         "e923eacb93e1520bf5645a8cee9b40d8cfaaf62b3f1102c8cf766d2d5bb98896"
         and b"nameserver 1.1.1.1" in raw,
         "RECOVERY_UPSTREAM_RESOLVER_SHA_DRIFT")
    budget=root_storage_capacity()
    need(old_identity()==before and boundary_sockets()==sockets,
         "RECOVERY_ORIGINAL_SERVICES_DRIFT_PRE_JOURNAL")
    cache=DEST/".r25-cache-dns-recovery1"
    os.mkdir(cache,0o700)
    os.chown(cache,build_account.pw_uid,build_account.pw_gid)
    fsyncdir(DEST)
    write_once(AUDIT/"DNS_RECOVERY_ATTEMPT.json",{
        "status":"DNS_RECOVERY_ATTEMPT_ENTERED",
        "candidate_sha":SHA,"old_build_attempt_preserved":True,
        "build_uid":build_account.pw_uid,"old_web_mainpid":OLD_PID,
        "upstream_resolver_sha256":sha(raw),
        "isolated_dns_bind_only":True,"localhost_ip_deny_preserved":True,
        "financial_writes_authorized":False,"budget":budget})
    return complete_build(before,sockets,budget,build_account,imported,True,source)

def verified_b_runtime(b,raw):
    need(type(b)==dict and b.get("schema")=="aoe2war.r25.b.positive-parallel-runtime.v1"
         and b.get("candidate_sha")==SHA and
         b.get("wargraph_disabled_verified") is True and
         b.get("server_enforced_select_only_pg_role") is True and
         b.get("no_custody_secrets") is True and
         b.get("loopback_and_public_write_methods_denied") is True and
         b.get("egress_to_financial_writers_denied") is True and
         b.get("release_authorized") is True,
         "B_RUNTIME_OR_FINANCIAL_ISOLATION_UNVERIFIED")
    for name in ("unit_sha256","prestart_sha256","readonly_env_sha256",
                 "postgres_roles_catalog_sha256","method_guard_proof_sha256"):
        need(type(b.get(name))==str and HEX64.fullmatch(b[name]),
             "B_PHYSICAL_REVIEW_DIGEST_MISSING:"+name)
    need(b.get("candidate_web_user")==WEBUSER and
         b.get("candidate_port")==3031 and
         b.get("old_web_pid")==OLD_PID,
         "B_SEPARATE_WEB_PROCESS_BINDING_MISMATCH")
def start_candidate():
    # Never start without independent B PHYSICAL positive financial separation
    # and F's reviewed prestart ingress+DB proof. A standalone env toggle is
    # insufficient. These review seals are intentionally EMPTY in C's PR.
    need(bool(HEX64.fullmatch(B_APPROVED_RECEIPT_SHA256)) and
         bool(HEX40.fullmatch(F_APPROVED_RUNTIME_SOURCE_SHA)),
         "B_AND_F_INDEPENDENT_POSITIVE_RUNTIME_APPROVAL_NOT_INSTALLED")
    before=old_identity();sockets=boundary_sockets();ensure_not_running_candidate()
    protected_root_dir(AUDIT,0o700)
    built=json.loads(read_no_symlink(AUDIT/"BUILD_STAGED.json",65536,True))
    need(built.get("status")=="BUILD_STAGED" and built.get("candidate_sha")==SHA,
         "C_ROOT_SEALED_FULL_BUILD_ABSENT")
    need(not (AUDIT/"CANDIDATE_START_ATTEMPT.json").exists()
         and not (AUDIT/"CANDIDATE_RUNNING.json").exists(),
         "CANDIDATE_START_ALREADY_ATTEMPTED")
    need((DEST/".next/BUILD_ID").read_text().strip()==built["build_id"]
         and (DEST/".aoe2war-build-version").read_text().strip()==built["build_version"],
         "BUILD_BYTES_CHANGED")
    protected_root_dir(B_APPROVAL.parent,0o700)
    raw=read_no_symlink(B_APPROVAL,65536,True)
    need(sha(raw)==B_APPROVED_RECEIPT_SHA256,"B_ROOT_SEALED_BYTES_NOT_APPROVED")
    b=json.loads(raw);verified_b_runtime(b,raw)
    need(b.get("f_reviewed_source_sha")==F_APPROVED_RUNTIME_SOURCE_SHA,
         "F_FINAL_SOURCE_REVIEW_MISMATCH")
    prestart=B_APPROVAL.parent/"approved-runtime-prestart.py"
    runtime=B_APPROVAL.parent/"readonly-runtime.env"
    for filename,key in ((UNIT_PATH,"unit_sha256"),(prestart,"prestart_sha256"),
                         (runtime,"readonly_env_sha256")):
        content=read_no_symlink(filename,65536,True)
        need(sha(content)==b[key],"B_APPROVED_UNIT_OR_ENV_BYTES_CHANGED")
    need(stat.S_IMODE(runtime.stat().st_mode)==0o600,
         "B_RUNTIME_SECRETS_NOT_ROOT_0600")
    need(b"__WRITER_DATABASE_CREDENTIAL__" not in runtime.read_bytes(),
         "B_PLACEHOLDER_WRITER_CREDENTIAL")
    try:account=pwd.getpwnam(WEBUSER)
    except KeyError:
        command(["/usr/sbin/useradd","--system","--no-create-home","--shell",
                 "/usr/sbin/nologin",WEBUSER])
        account=pwd.getpwnam(WEBUSER)
    need(account.pw_uid not in (0,1000,pwd.getpwnam(BUILDER).pw_uid),
         "WEB_RUNTIME_UID_NOT_DISTINCT")
    # root-owned source must not be writable by web UID after staging.
    for p in (DEST,DEST/".next",DEST/"node_modules"):
        st=p.lstat()
        need(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,
             "CANDIDATE_BUILD_NOT_ROOT_SEALED")
    write_once(AUDIT/"CANDIDATE_START_ATTEMPT.json",{
        "status":"START_ATTEMPT","candidate_sha":SHA,"old_web_pid":OLD_PID,
        "approved_B_sha256":B_APPROVED_RECEIPT_SHA256,
        "f_review_sha":F_APPROVED_RUNTIME_SOURCE_SHA,"finance_mutation":False})
    command(["/usr/bin/systemctl","daemon-reload"],timeout=40)
    started=False
    try:
        command(["/usr/bin/systemctl","start",NEW_UNIT],timeout=95)
        started=True
        raw=command(["/usr/bin/systemctl","show",NEW_UNIT,
                     "-p","MainPID","-p","User","-p","ActiveState"]).decode()
        fields=dict(line.split("=",1) for line in raw.splitlines() if "=" in line)
        pid=int(fields.get("MainPID","0"))
        need(pid>1 and fields.get("ActiveState")=="active" and
             fields.get("User")==WEBUSER,"NEW_WEB_MAINPID_OR_USER_MISMATCH")
        need(pathlib.Path("/proc",str(pid),"status").read_text().find(
             "Uid:\t"+str(account.pw_uid))>=0,"NEW_WEB_PID_OS_UID_NOT_ISOLATED")
        ports=command(["/usr/bin/ss","-H","-ltnp"]).decode()
        need(any(re.search(r":3031\s",row) for row in ports.splitlines()),
             "NEW_PORT_3031_NOT_LISTENING")
        url="http://127.0.0.1:3031/api/deployment-version"
        with urllib.request.urlopen(urllib.request.Request(url,method="GET"),timeout=10) as response:
            need(response.status==200,"NEW_BUILD_VERSION_HTTP_NOT_200")
            version=json.loads(response.read(8192))
        need(version.get("buildVersion")==built["build_version"],
             "NEW_CANDIDATE_HTTP_BUILD_VERSION_DRIFT")
        need(old_identity()==before and boundary_sockets()==sockets,
             "ORIGINAL_WEB_OR_FINANCE_CHANGED_AFTER_CANDIDATE_START")
        write_once(AUDIT/"CANDIDATE_RUNNING.json",{
            "status":"CANDIDATE_RUNNING","candidate_sha":SHA,"next_build_id":built["build_id"],
            "build_version":built["build_version"],"mainpid":pid,
            "web_user":WEBUSER,"port":3031,"old_web_mainpid_unchanged":OLD_PID,
            "financial_writes_authorized":False,"public_nginx_not_changed":True})
        print("PASS:CANDIDATE_RUNNING 3031 PID="+str(pid)+" BUILD_ID="+built["build_id"])
    except Exception:
        if started:
            # Only the NEW web is ever stopped on failed independent admission.
            subprocess.run(["/usr/bin/systemctl","stop",NEW_UNIT],
                           capture_output=True,timeout=45)
        raise

def main():
    ap=argparse.ArgumentParser()
    commands=ap.add_mutually_exclusive_group(required=True)
    commands.add_argument("--source-stage",action="store_true")
    commands.add_argument("--source-build",action="store_true")
    commands.add_argument("--build-stage",action="store_true")
    commands.add_argument("--recover-dns",action="store_true")
    commands.add_argument("--candidate-start",action="store_true")
    ap.add_argument("--archive-sha256",default="")
    a=ap.parse_args()
    if a.source_stage:stage_source(a.archive_sha256)
    elif a.source_build:
        stage_source(a.archive_sha256)
        build_source()
    elif a.build_stage:build_source()
    elif a.recover_dns:recover_dns_build()
    else:start_candidate()
if __name__=="__main__":
    try:main()
    except (Hold,OSError,subprocess.SubprocessError,tarfile.TarError,
            json.JSONDecodeError,ValueError,KeyError,TimeoutError) as exc:
        print("HOLD:R25_C:"+type(exc).__name__+":"+str(exc)[:2850],file=sys.stderr)
        print("NO_RETRY_IF_PARTIAL: preserve any existing stage and audit for independent recovery.",file=sys.stderr)
        sys.exit(2)
