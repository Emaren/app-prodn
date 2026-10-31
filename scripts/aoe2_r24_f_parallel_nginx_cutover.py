#!/usr/bin/env python3
"""R24 F: parallel old-web preserving nginx-only cutover (root SSH in memory).

This is a NEW source proposal. Original aoe2hdbets-web.service is NEVER
stopped or restarted: it may run WarGraph financial ticks. Candidate #1061
must already be physically staged and running on a separate isolated port
and read-only DB principal, with B/D/E/F/G independently root-bound approval.
No key enrollment, money operation, migration, repo switch, or 14-helper install.
"""
from __future__ import annotations
import fcntl,hashlib,json,os,pathlib,re,socket,stat,subprocess,sys,urllib.request

HOST="ubuntu-4gb-hel1-11"
TARGET="0cee3c836c4b0760478280c145e02e81e470ce0e"
LOCK=pathlib.Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
LOCK_ID=(2064,6185747,1000,0o644)
OLD_UNIT="aoe2hdbets-web.service"
NEW_UNIT="aoe2hdbets-web-r24.service"
NEW_USER="aoe2war-r24-web"
OLD_PORT=3030
NEW_PORT=3031
OLD_UPSTREAM=b"proxy_pass http://127.0.0.1:3030;"
NEW_UPSTREAM=b"proxy_pass http://127.0.0.1:3031;"
ROOT_APPROVAL=pathlib.Path("/etc/aoe2war/r24-parallel-web/approved.json")
AUDIT_BASE=pathlib.Path("/var/lib/aoe2war-r24-parallel")
OLD_APP=pathlib.Path("/var/www/AoE2HDBets/app-prodn")
# Exact E #1078 accepted direct-child parallel runtime path on root filesystem.
CANDIDATE_STAGE=pathlib.Path("/var/www/AoE2HDBets/app-prodn-r24-w1safe-0cee3c836c4b")
PUBLIC="https://aoe2war.com"
B_INDEPENDENT_POSITIVE_RUNTIME_SHA="" # current B #1077 is explicitly negative
F_APPROVED_CANDIDATE_STAGE_AND_POLICY_SHA="" # not issued until real E/C stage
D_REVIEWED_SHA="5ffac4e1a8838024e9bd2025d452a7e93e53c06f"
C_REVIEWED_PARALLEL_SHA="" # must be C's new source, NOT old stop/swap C #1080
E_REVIEWED_SHA="" # pin final reviewed E implementation
G_REVIEWED_SHA="" # pin final reviewed G implementation
SCHEMA="aoe2war.r24.rootssh.parallel-web-nginx.v1"
HEX40=re.compile("[0-9a-f]{40}\\Z")
HEX64=re.compile("[0-9a-f]{64}\\Z")
NONCE=re.compile("[0-9a-f]{32}\\Z")
class Hold(Exception):pass
def need(ok,reason):
    if not ok:raise Hold(reason)
def sha(data):return hashlib.sha256(data).hexdigest()
def canonical(x):return json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode()
def no_dupes(pairs):
    d={}
    for k,v in pairs:
        need(k not in d,"DUPLICATE_APPROVAL_FIELD");d[k]=v
    return d
def parse(data):return json.loads(data,object_pairs_hook=no_dupes,parse_constant=lambda _:(_ for _ in ()).throw(Hold("NONFINITE_APPROVAL")))
def cmd(argv,timeout=30):
    p=subprocess.run(argv,capture_output=True,timeout=timeout)
    need(p.returncode==0,"PROCESS_FAILED:"+pathlib.Path(argv[0]).name)
    return p.stdout
def protected_dir(p,exact=None):
    for d in (p,*p.parents):
        st=os.lstat(d)
        need(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,
             "UNPROTECTED_DIRECTORY:"+str(d))
    if exact is not None:
        need(stat.S_IMODE(os.lstat(p).st_mode)==exact,"ROOT_DIRECTORY_MODE")
def root_file(path,maxbytes):
    protected_dir(path.parent)
    st=os.lstat(path)
    need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022
         and 0<st.st_size<=maxbytes,"UNTRUSTED_ROOT_FILE")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        x=os.fstat(fd);raw=os.read(fd,maxbytes+1);y=os.fstat(fd)
        need(len(raw)==x.st_size and (x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns)==
             (y.st_dev,y.st_ino,y.st_size,y.st_mtime_ns),"UNSTABLE_ROOT_FILE")
        return raw
    finally:os.close(fd)
def lock_check():
    s=os.lstat(LOCK)
    need(stat.S_ISREG(s.st_mode) and
         (s.st_dev,s.st_ino,s.st_uid,stat.S_IMODE(s.st_mode))==LOCK_ID,
         "ORIGINAL_RELEASE_LOCK_DRIFT")
def approval(raw):
    j=parse(raw)
    need(type(j)==dict and set(j)=={"schema","nonce","candidate_sha","previous_sha",
        "previous_build_id","candidate_build_id","candidate_build_version",
        "nginx_config","nginx_before_sha256","finance_units","finance_snapshot_sha256",
        "wolo_snapshot_sha256","old_web_snapshot_sha256","candidate_web_snapshot_sha256",
        "C_stage_artifact_sha256","E_durable_rollback_sha256",
        "E_durable_receipt_path","lane_reviews"},
        "APPROVAL_EXACT_SCHEMA")
    need(j["schema"]==SCHEMA and j["candidate_sha"]==TARGET and
         type(j["nonce"])==str and NONCE.fullmatch(j["nonce"]),
         "SCOPE_OR_NONCE_INVALID")
    need(type(j["previous_sha"])==str and HEX40.fullmatch(j["previous_sha"]) and
         j["previous_sha"]!=TARGET,"PREVIOUS_SOURCE_IDENTITY")
    for f in ("nginx_before_sha256","finance_snapshot_sha256","wolo_snapshot_sha256",
              "old_web_snapshot_sha256","candidate_web_snapshot_sha256",
              "C_stage_artifact_sha256","E_durable_rollback_sha256"):
        need(type(j[f])==str and HEX64.fullmatch(j[f]),"APPROVAL_HASH_MISSING:"+f)
    need(j["E_durable_receipt_path"]==
         "/etc/aoe2war/r24-parallel-web/e-durable-rollback.json",
         "E_ROOT_SEALED_RECEIPT_PATH_NOT_PINNED")
    for f in ("previous_build_id","candidate_build_id"):
        need(type(j[f])==str and re.fullmatch("[A-Za-z0-9_-]{8,128}",j[f]),
             "NEXT_BUILD_ID_INVALID")
    need(type(j["candidate_build_version"])==str and
         re.fullmatch("[A-Za-z0-9_-]{8,128}",j["candidate_build_version"]),
         "APP_BUILD_VERSION_INVALID")
    need(type(j["nginx_config"])==str and
         j["nginx_config"].startswith("/etc/nginx/") and
         not ".." in pathlib.PurePosixPath(j["nginx_config"]).parts,
         "NGINX_CONFIG_NOT_EXACT_ROOT_SCOPE")
    units=j["finance_units"]
    need(type(units)==list and len(units)>=25 and len(units)==len(set(units)) and
         all(type(u)==str and re.fullmatch("[A-Za-z0-9@_.-]+\\.(?:service|timer|socket)",u)
             and u not in (OLD_UNIT,NEW_UNIT) for u in units),
         "B_FINANCE_UNIT_IDENTITY_SET_INCOMPLETE")
    pins={"B":B_INDEPENDENT_POSITIVE_RUNTIME_SHA,
          "C":C_REVIEWED_PARALLEL_SHA,"D":D_REVIEWED_SHA,
          "E":E_REVIEWED_SHA,"F":F_APPROVED_CANDIDATE_STAGE_AND_POLICY_SHA,
          "G":G_REVIEWED_SHA}
    need(type(j["lane_reviews"])==dict and set(j["lane_reviews"])==set(pins),
         "B_C_D_E_F_G_REVIEWS_REQUIRED")
    for lane,pin in pins.items():
        need(bool(HEX40.fullmatch(pin)) and j["lane_reviews"][lane]==pin,
             "INDEPENDENT_"+lane+"_REVIEW_NOT_APPROVED")
    return j
def unit_state(unit):
    out=cmd(["/usr/bin/systemctl","show",unit,
       "-p","Id","-p","ActiveState","-p","MainPID",
       "-p","ExecMainStartTimestampMonotonic","-p","User",
       "-p","FragmentPath","-p","DropInPaths","-p","ExecStart"],15)
    return out.decode(errors="replace")
def enforce_candidate_runtime(unit_status):
    # Independent defense-in-depth gate; does NOT prove server-side PG ACLs.
    parts=dict(line.split("=",1) for line in unit_status.splitlines() if "=" in line)
    need(parts.get("User")==NEW_USER and parts.get("ActiveState")=="active",
         "CANDIDATE_MUST_USE_DISTINCT_UNPRIVILEGED_UID")
    pid=parts.get("MainPID","")
    need(pid.isdecimal() and int(pid)>1,"CANDIDATE_MAINPID_MISSING")
    proc=pathlib.Path("/proc")/pid/"environ"
    fd=os.open(proc,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        raw=os.read(fd,65537)
        need(0<len(raw)<=65536 and raw.endswith(b"\x00"),
             "CANDIDATE_ENVIRONMENT_MISSING_OR_UNBOUNDED")
    finally:os.close(fd)
    variables={}
    for entry in raw[:-1].split(b"\x00"):
        key,sep,val=entry.partition(b"=")
        need(bool(sep) and key not in variables and
             bool(re.fullmatch(rb"[A-Za-z_][A-Za-z0-9_]*",key)),
             "INVALID_CANDIDATE_PROCESS_ENV")
        variables[key]=val
    need(variables.get(b"WARGRAPH_RUNTIME_DISABLED")==b"true",
         "WARGRAPH_SETTLEMENT_RUNTIME_NOT_DISABLED")
    need(variables.get(b"AOE2WAR_PROD_DB_PREVIEW")==b"true",
         "CANDIDATE_DB_PREVIEW_DEFENSE_MISSING")
    need(variables.get(b"NODE_ENV")==b"production",
         "CANDIDATE_NOT_PRODUCTION_MODE")
    forbidden=(b"PRIVATE_KEY",b"MNEMONIC",b"SIGNING_KEY",b"SECRET_KEY",
               b"CUSTODY",b"TREASURY",b"SETTLEMENT_KEY",
               b"PAYMENT_SECRET",b"WOLO_WALLET",b"STAKING_KEY")
    need(not any(any(term in name.upper() for term in forbidden)
                 for name in variables),
         "CANDIDATE_PROCESS_INHERITED_FINANCIAL_SECRET_ENV")
    return True

def snapshots(units):
    return {"original_web":unit_state(OLD_UNIT),
            "candidate_web":unit_state(NEW_UNIT),
            "finance":{u:unit_state(u) for u in units},
            "wolo":cmd(["/usr/bin/ss","-H","-ltnpe"],15).decode(errors="replace")}
def listener_lines(raw):
    out={}
    for port in ("8092","8093"):
        hits=[x for x in raw.splitlines() if re.search(":"+port+r"\s",x)]
        need(len(hits)==1,"WOLO_PORT_PIDs_NOT_UNIQUE:"+port)
        out[port]=hits[0]
    return out
def prove_preimage(j,s):
    need("ActiveState=active" in s["original_web"] and
         "ActiveState=active" in s["candidate_web"],"TWO_INDEPENDENT_WEB_SERVICES_NOT_ACTIVE")
    enforce_candidate_runtime(s["candidate_web"])
    need(sha(s["original_web"].encode())==j["old_web_snapshot_sha256"],
         "OLD_FINANCIAL_WEB_PID_DRIFT")
    need(sha(s["candidate_web"].encode())==j["candidate_web_snapshot_sha256"],
         "NEW_CANDIDATE_WEB_PID_DRIFT")
    need(sha(canonical(s["finance"]))==j["finance_snapshot_sha256"],
         "B_FINANCIAL_UNITS_DRIFT")
    need(sha(canonical(listener_lines(s["wolo"])))==j["wolo_snapshot_sha256"],
         "WOLO_SIGNED_PROCESS_SOCKET_DRIFT")
def verified_durable_e_rollback(j):
    # E's content-verification result is a readback receipt, never an
    # invented "rollback exercised" claim. Root custody + F digest bind.
    raw=root_file(pathlib.Path(j["E_durable_receipt_path"]),16384)
    need(sha(raw)==j["E_durable_rollback_sha256"],
         "E_PHYSICAL_CONTENT_RECEIPT_DIGEST_MISMATCH")
    e=parse(raw)
    need(type(e)==dict and
         e.get("schema")=="aoe2war.e.r24.website.rollback-content.v1" and
         e.get("status")=="PASS_DURABLE_COPY_CONTENT_MATCH_NOT_ROLLBACK_EXERCISE" and
         e.get("finance_touched") is False and
         e.get("web_service_stopped") is False and
         e.get("release_authorized") is False,
         "E_CONTENT_VERIFICATION_NOT_GENUINE_OR_SCOPE_DRIFT")
    need(e.get("old_live_next")==str(OLD_APP/".next") and
         e.get("old_build_id")==j["previous_build_id"],
         "E_OLD_WEB_BUILD_ROLLBACK_IDENTITY_INVALID")
    d=e.get("durable_next")
    base=pathlib.Path("/mnt/HC_Volume_105319120/aoe2war/rollbacks")
    need(type(d)==str,"E_DURABLE_PATH_NOT_PRESENT")
    d=pathlib.Path(d)
    need(d.is_relative_to(base) and d!=base and
         d.name=="prior-next" and not d.is_symlink(),
         "E_DURABLE_ROLLBACK_LOCATION_UNAPPROVED")
    old=OLD_APP/".next"
    need(d.is_dir() and old.is_dir() and
         os.stat(d).st_dev!=os.stat(old).st_dev,
         "E_DURABLE_ROLLBACK_NOT_INDEPENDENT_DEVICE")
    need((d/"BUILD_ID").read_text().strip()==j["previous_build_id"] and
         (old/"BUILD_ID").read_text().strip()==j["previous_build_id"],
         "E_OLD_AND_DURABLE_NEXT_BUILD_ID_DRIFT")
    a=e.get("old_content");b=e.get("durable_content")
    need(type(a)==dict and a==b and type(a.get("sha256"))==str and
         bool(HEX64.fullmatch(a["sha256"])),
         "E_FULL_CONTENT_DIGEST_MISMATCH")
    return True

def http_version(port):
    url=f"http://127.0.0.1:{port}/api/deployment-version"
    with urllib.request.urlopen(urllib.request.Request(url,method="GET"),
                                timeout=8) as resp:
        need(resp.status==200,"HTTP_BUILD_VERSION_UNAVAILABLE")
        obj=parse(resp.read(8193))
    need(type(obj)==dict and type(obj.get("buildVersion"))==str,
         "INVALID_VERSION_JSON")
    return obj["buildVersion"]
def next_build_asset(base,build_id):
    need(bool(re.fullmatch("[A-Za-z0-9_-]{8,128}",build_id)),
         "NEXT_BUILD_ID_NOT_PINNED")
    url=base+"/_next/static/"+build_id+"/_buildManifest.js"
    with urllib.request.urlopen(
            urllib.request.Request(url,method="GET"),
            timeout=8) as resp:
        need(resp.status==200 and 0<len(resp.read(65537))<=65536,
             "ACTUAL_NEXT_BUILD_ID_STATIC_ASSET_MISSING")

def stage_identity(j):
    need(CANDIDATE_STAGE.parent==OLD_APP.parent and
         CANDIDATE_STAGE.name.startswith("app-prodn-r24-w1safe-"),
         "E_PHYSICAL_PARALLEL_STAGE_LOCATION_DRIFT")
    need(CANDIDATE_STAGE.is_dir() and not CANDIDATE_STAGE.is_symlink(),
         "C_UNTRUSTED_CANDIDATE_STAGE")
    for p in (CANDIDATE_STAGE.parent,CANDIDATE_STAGE):
        st=os.lstat(p)
        need(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and
             not st.st_mode&0o022,"C_ROOT_SEALED_CANDIDATE_STAGE_MISSING")
    def small(rel):
        p=CANDIDATE_STAGE/rel
        v=os.lstat(p)
        need(stat.S_ISREG(v.st_mode) and v.st_uid==0 and
             not v.st_mode&0o022 and 0<v.st_size<256,
             "C_STAGE_SOURCE_OR_BUILD_NOT_ROOT_SEALED")
        return p.read_text().strip()
    need(small("r24-source-sha")==TARGET,"C_STAGE_GIT_SOURCE_MISMATCH")
    # Root does not run Git hooks, filters or source in a candidate checkout;
    # source identity is computed by the separate non-root web UID.
    candidate_sha=cmd(["/usr/sbin/runuser","-u",NEW_USER,"--",
        "/usr/bin/git","-c","safe.directory="+str(CANDIDATE_STAGE),
        "-C",str(CANDIDATE_STAGE),"rev-parse","HEAD"],20).decode().strip()
    need(candidate_sha==TARGET,"C_ACTUAL_CHECKOUT_SOURCE_SHA_NOT_VERIFIED")
    need(small(".next/BUILD_ID")==j["candidate_build_id"],
         "C_STAGE_NEXT_BUILD_ID_MISMATCH")
    next_build_asset("http://127.0.0.1:3031",j["candidate_build_id"])
    source=cmd(["/usr/sbin/runuser","-u","tony","--",
         "/usr/bin/git","-C",str(OLD_APP),"rev-parse","HEAD"],15)
    need(source.decode().strip()==j["previous_sha"],
         "ORIGINAL_WEB_SOURCE_GIT_DRIFT")

def public_version():
    with urllib.request.urlopen(
            urllib.request.Request(PUBLIC+"/api/deployment-version",method="GET"),
            timeout=10) as resp:
        need(resp.status==200,"PUBLIC_HTTP_STATUS")
        obj=parse(resp.read(8193))
    need(type(obj)==dict and type(obj.get("buildVersion"))==str,
         "PUBLIC_VERSION_INVALID")
    return obj["buildVersion"]
def safe_replace_site(original,chosen):
    # Approval pins a complete existing nginx file. This limited v1 may only
    # change a UNIQUE default location upstream; never a finance API location.
    need(original.count(b"location / {")==1,"UNKNOWN_NGINX_LOCATION_SHAPE")
    start=original.index(b"location / {")+len(b"location / {")
    end=original.find(b"}",start)
    need(end>start,"UNKNOWN_NGINX_BLOCK")
    block=original[start:end]
    need(block.count(OLD_UPSTREAM)==1,"UNREVIEWED_OLD_PROXY_UPSTREAM")
    need(original.count(OLD_UPSTREAM)>=1,"OLD_UPSTREAM_MISSING")
    need(b"proxy_pass http://127.0.0.1:3031;" not in original,
         "CANDIDATE_ALREADY_ROUTED")
    block2=block.replace(OLD_UPSTREAM,chosen)
    # Explicitly restrict the GENERAL web location; other exact locations and
    # server actions must be covered by separate real B positive host review.
    need(b"limit_except" not in block,"EXISTING_NGINX_METHOD_POLICY_UNREVIEWED")
    block2=b"\n        limit_except GET HEAD { deny all; }\n"+block2
    return original[:start]+block2+original[end:]
def durable_write(path,raw,mode=0o400):
    protected_dir(path.parent)
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,"wb") as f:
        f.write(raw);f.flush();os.fsync(f.fileno())
def fsyncdir(p):
    d=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(d)
    finally:os.close(d)
def replace_existing(path,raw):
    tmp=path.parent/(".r24-"+path.name+"-pending")
    need(not tmp.exists() and not tmp.is_symlink(),"NGINX_PENDING_UNKNOWN")
    fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:
        f.write(raw);f.flush();os.fsync(f.fileno())
    # mode, uid/gid preserved from the approved original root nginx conf.
    old=os.lstat(path)
    mode_fd=os.open(tmp,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:os.fchmod(mode_fd,stat.S_IMODE(old.st_mode))
    finally:os.close(mode_fd)
    os.replace(tmp,path);fsyncdir(path.parent)
def nginx_reload():
    cmd(["/usr/sbin/nginx","-t"],15)
    cmd(["/usr/bin/systemctl","reload","nginx.service"],25)
def apply():
    need(sys.platform=="linux" and socket.gethostname()==HOST and os.geteuid()==0,
         "EXACT_HEL1_ROOT_REQUIRED")
    lock_check()
    protected_dir(ROOT_APPROVAL.parent,0o700);j=approval(root_file(ROOT_APPROVAL,16384))
    config=pathlib.Path(j["nginx_config"])
    old=root_file(config,131072)
    need(sha(old)==j["nginx_before_sha256"],"ORIGINAL_NGINX_BYTES_DRIFT")
    candidate=safe_replace_site(old,NEW_UPSTREAM)
    s=snapshots(j["finance_units"]);prove_preimage(j,s)
    stage_identity(j)
    verified_durable_e_rollback(j)
    need(http_version(OLD_PORT)!=j["candidate_build_version"] and
         http_version(NEW_PORT)==j["candidate_build_version"],
         "CANDIDATE_NOT_ISOLATED_FROM_OLD_WEB")
    need(public_version()==http_version(OLD_PORT),"BEFORE_PUBLIC_NOT_OLD_WEB")
    nonce=j["nonce"];record=AUDIT_BASE/("r24-"+nonce)
    protected_dir(AUDIT_BASE,0o700)
    need(not record.exists() and not record.is_symlink(),"REPLAY_OR_PARTIAL_TRANSACTION")
    fd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        st=os.fstat(fd)
        need((st.st_dev,st.st_ino,st.st_uid,stat.S_IMODE(st.st_mode))==LOCK_ID,
             "RELEASE_FD_DRIFT")
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as exc:raise Hold("RELEASE_LOCK_BUSY") from exc
        lock_check()
        need(snapshots(j["finance_units"])==s,"FINANCE_OR_OLD_WEB_DRIFT_AT_SEAM")
        need(root_file(config,131072)==old,"NGINX_BEFORE_RACE")
        os.mkdir(record,0o700);protected_dir(record,0o700)
        durable_write(record/"before-nginx.conf",old)
        durable_write(record/"intent.json",canonical({"schema":SCHEMA,"nonce":nonce,
             "candidate_sha":TARGET,"old_unit_pid_unchanged":True,
             "before_nginx_sha256":sha(old),"after_nginx_sha256":sha(candidate)})+b"\n")
        fsyncdir(record);fsyncdir(AUDIT_BASE)
        try:
            replace_existing(config,candidate)
            nginx_reload()
            need(public_version()==j["candidate_build_version"],
                 "PUBLIC_CANDIDATE_NOT_ACTIVE")
            next_build_asset(PUBLIC,j["candidate_build_id"])
            need(snapshots(j["finance_units"])==s,
                 "FINANCE_OR_OLD_WEB_CHANGED_ON_PROXY_SWITCH")
            durable_write(record/"commit.json",canonical({
                "status":"R24_PARALLEL_WEBSITE_LIVE",
                "candidate_sha":TARGET,"nonce":nonce,
                "candidate_build_id":j["candidate_build_id"],
                "candidate_build_version":j["candidate_build_version"],
                "original_web_still_running":True,
                "old_nginx_sha256":sha(old),
                "new_nginx_sha256":sha(candidate)})+b"\n")
            fsyncdir(record)
            print("PASS:R24_PARALLEL_PUBLIC_WEBSITE_CUTOVER; ORIGINAL_WEB_MAINPID_PRESERVED")
        except BaseException:
            print("HOLD:R24_PROXY_CUTOVER_FAILED_RESTORING_ORIGINAL_NGINX",
                  file=sys.stderr)
            try:
                replace_existing(config,old);nginx_reload()
                need(public_version()==http_version(OLD_PORT),
                     "ORIGINAL_PUBLIC_RESTORE_NOT_VERIFIED")
            except Exception as err:
                print("HOLD:R24_PROXY_ROLLBACK_FAILED:"+type(err).__name__,
                      file=sys.stderr)
            raise
    finally:os.close(fd)
def manual_rollback(nonce):
    need(sys.platform=="linux" and socket.gethostname()==HOST and os.geteuid()==0,
         "EXACT_HEL1_ROOT_REQUIRED")
    need(bool(NONCE.fullmatch(nonce)),"ROLLBACK_NONCE_INVALID")
    lock_check()
    protected_dir(ROOT_APPROVAL.parent,0o700)
    j=approval(root_file(ROOT_APPROVAL,16384))
    need(j["nonce"]==nonce,"ROLLBACK_OWNER_SCOPE_INVALID")
    record=AUDIT_BASE/("r24-"+nonce)
    protected_dir(record,0o700)
    commit=parse(root_file(record/"commit.json",8192))
    need(commit["status"]=="R24_PARALLEL_WEBSITE_LIVE" and
         commit["candidate_sha"]==TARGET and
         commit["nonce"]==nonce,"ROLLBACK_COMMIT_IDENTITY")
    need(not (record/"rollback.json").exists(),"ROLLBACK_ALREADY_ATTEMPTED")
    old=root_file(record/"before-nginx.conf",131072)
    need(sha(old)==commit["old_nginx_sha256"],
         "ORIGINAL_NGINX_ROLLBACK_BYTES_DRIFT")
    config=pathlib.Path(j["nginx_config"])
    current=root_file(config,131072)
    need(sha(current)==commit["new_nginx_sha256"],
         "LIVE_NGINX_NOT_EXACT_CANDIDATE")
    s=snapshots(j["finance_units"])
    prove_preimage(j,s)
    lockfd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        try:fcntl.flock(lockfd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as err:raise Hold("ROLLBACK_GLOBAL_LOCK_BUSY") from err
        lock_check()
        need(snapshots(j["finance_units"])==s,
             "FINANCIAL_ORIGINAL_WEB_DRIFT_BEFORE_ROLLBACK")
        replace_existing(config,old)
        nginx_reload()
        need(public_version()==http_version(OLD_PORT),
             "PUBLIC_OLD_VERSION_NOT_RESTORED")
        need(snapshots(j["finance_units"])==s,
             "FINANCIAL_ORIGINAL_WEB_DRIFT_AFTER_ROLLBACK")
        durable_write(record/"rollback.json",canonical({"status":"OLD_PUBLIC_PROXY_RESTORED",
             "nonce":nonce,"old_config_sha256":sha(old),"original_web_restarted":False})+b"\n")
        fsyncdir(record)
        print("PASS:R24_OLD_WEB_PROXY_RESTORED; ORIGINAL_WEB_MAINPID_UNCHANGED")
    finally:os.close(lockfd)
def main():
    need(len(sys.argv)>=2,"EXPLICIT_ROOT_OPERATOR_MODE")
    if sys.argv[1:]==["--root-apply"]:
        apply()
    elif (len(sys.argv)==4 and sys.argv[1]=="--root-rollback" and
          sys.argv[2]=="--nonce"):
        manual_rollback(sys.argv[3])
    else:
        raise Hold("UNREVIEWED_ROOT_OPERATION")
if __name__=="__main__":
    try:main()
    except (Hold,OSError,ValueError,subprocess.SubprocessError) as e:
        print("HOLD:R24_PARALLEL:"+str(e),file=sys.stderr);sys.exit(2)
