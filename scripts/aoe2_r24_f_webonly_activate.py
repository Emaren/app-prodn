#!/usr/bin/env python3
"""R24 F: source-locked website-only candidate activation and rollback.

This is the INTEGRATOR cutover half of the R24 C stage+F activation contract.
No new RSA key, original FD200 signature, git reset, checkout changes, Prisma
migration, financial producer restart, payment, or release-trust write.
Missing independent B/D/E/C proofs = HOLD before systemctl mutation.
"""
from __future__ import annotations
import fcntl, hashlib, json, os, pathlib, re, socket, stat, subprocess
import sys, time, urllib.request
from datetime import datetime, timezone

HOST="ubuntu-4gb-hel1-11"
CANDIDATE="0cee3c836c4b0760478280c145e02e81e470ce0e"
OLD_RSA="3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"
LOCK=pathlib.Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
LOCK_ID=(2064,6185747,1000,0o644)
WEB="aoe2hdbets-web.service"
SLOT_ROOT=pathlib.Path("/var/lib/aoe2war-r24-webonly")
SLOT=SLOT_ROOT/CANDIDATE
SOURCE_DIR=SLOT/"web"
POLICY=pathlib.Path("/etc/aoe2war/r24-webonly/approved-scope.json")
DROPIN_DIR=pathlib.Path("/etc/systemd/system/aoe2hdbets-web.service.d")
DROPIN=DROPIN_DIR/"90-r24-webonly.conf"
OLD_PUBLIC=pathlib.Path("/etc/aoe2war/website-owner-v4/owner.pem")
REMOTE_PUBLIC="https://aoe2war.com/api/deployment-version"
LOCAL_PUBLIC="http://127.0.0.1:3030/api/deployment-version"
APPROVED_SCOPE_SHA256="" # F must pin independently reviewed B/C/D/E source boundary.
SCOPE_SCHEMA="aoe2war.r24.website-only-v1"
MAX_POLICY=16384
SOURCE_VERSION=1

class Hold(RuntimeError): pass
def need(ok,why):
    if not ok:raise Hold(why)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(x):return json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode()
def no_dupes(pairs):
    d={}
    for k,v in pairs:
        need(k not in d,"DUPLICATE_JSON_FIELD");d[k]=v
    return d
def load(raw):return json.loads(raw,object_pairs_hook=no_dupes,parse_constant=lambda x:(_ for _ in ()).throw(Hold("NONFINITE_JSON")))
def run(argv,timeout=30,ok=True,**opts):
    p=subprocess.run(argv,timeout=timeout,capture_output=True,text=True,**opts)
    if ok:need(p.returncode==0,"COMMAND_FAILED:"+pathlib.Path(argv[0]).name)
    return p
def stat_regular(path,root_owner=False):
    st=os.lstat(path)
    need(stat.S_ISREG(st.st_mode) and not st.st_mode&0o022,"UNSAFE_FILE:"+str(path))
    if root_owner:need(st.st_uid==0,"ROOT_OWNERSHIP_REQUIRED")
    return st
def protected_dir(path):
    for d in (path,*path.parents):
        st=os.lstat(d)
        need(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,
             "UNSAFE_ROOT_DIRECTORY:"+str(d))
def validated_policy(raw):
    need(0<len(raw)<=MAX_POLICY,"POLICY_LENGTH")
    need(bool(re.fullmatch(r"[0-9a-f]{64}",APPROVED_SCOPE_SHA256)) and
         sha(raw)==APPROVED_SCOPE_SHA256,"INDEPENDENT_B_C_D_E_APPROVAL_ABSENT")
    o=load(raw)
    need(type(o)==dict and set(o)=={"schema","candidate_sha","slot","build_id",
            "B_financial_noninterference","C_reversible_stage","D_webonly_policy",
            "E_capacity_and_rollback","G_live_witness","finance_units",
            "rollback_source_sha","build_version"},
         "POLICY_SCHEMA")
    need(o["schema"]==SCOPE_SCHEMA and o["candidate_sha"]==CANDIDATE and
         o["slot"]==str(SOURCE_DIR),"POLICY_CANDIDATE_OR_SLOT")
    need(all(o.get(k) is True for k in ("B_financial_noninterference",
        "C_reversible_stage","D_webonly_policy","E_capacity_and_rollback",
        "G_live_witness")),"POLICY_INCOMPLETE_INDEPENDENT_ADMISSION")
    need(type(o["build_id"])==str and re.fullmatch(r"[A-Za-z0-9_-]{8,128}",o["build_id"]),
         "BUILD_ID_INVALID")
    need(type(o["build_version"])==str and
         re.fullmatch(r"[0-9]{14}-[a-f0-9]{10}",o["build_version"]),
         "BUILD_VERSION_INVALID")
    need(type(o["rollback_source_sha"])==str and
         re.fullmatch(r"[0-9a-f]{40}",o["rollback_source_sha"]),"ROLLBACK_ID_MISSING")
    units=o["finance_units"]
    need(type(units)==list and len(units)>=6 and len(units)==len(set(units)) and
         all(type(v)==str and re.fullmatch(r"[a-zA-Z0-9@_.-]+\.service",v) and v!=WEB
             for v in units),"FINANCIAL_SERVICE_WATCH_INCOMPLETE")
    return o
def check_original_lock():
    s=os.lstat(LOCK)
    need(stat.S_ISREG(s.st_mode) and
         (s.st_dev,s.st_ino,s.st_uid,stat.S_IMODE(s.st_mode))==LOCK_ID,
         "ORIGINAL_RELEASE_LOCK_DRIFT")
def source_slot(policy):
    root=os.lstat(SLOT_ROOT)
    need(stat.S_ISDIR(root.st_mode) and root.st_uid==0 and not root.st_mode&0o022,
         "UNTRUSTED_STAGE_PARENT")
    st=os.lstat(SLOT)
    need(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,
         "UNTRUSTED_SLOT_PARENT")
    w=os.lstat(SOURCE_DIR)
    need(stat.S_ISDIR(w.st_mode) and w.st_uid==1000 and not w.st_mode&0o022,
         "UNTRUSTED_SLOT_SOURCE")
    def checked(rel,maxbytes=256):
        path=SOURCE_DIR/rel
        st=stat_regular(path);need(st.st_uid==1000 and 0<st.st_size<=maxbytes,
                                   "STAGED_ARTIFACT_UNTRUSTED:"+rel)
        return path.read_bytes().strip().decode("ascii")
    need(checked("r24-source-sha",64)==CANDIDATE,"STAGED_GIT_IDENTITY")
    need(checked(".next/BUILD_ID",256)==policy["build_id"],"STAGED_BUILD_IDENTITY")
    need(checked(".aoe2war-build-version",256)==policy["build_version"],
         "STAGED_BUILD_VERSION_IDENTITY")
    need((SOURCE_DIR/"node_modules").is_dir() and
         not (SOURCE_DIR/"node_modules").is_symlink(),"STAGED_DEPENDENCY_TREE_MISSING")
def snapshot(units):
    items={}
    for u in [WEB]+units:
        p=run(["/usr/bin/systemctl","show",u,
            "--property=MainPID,ActiveState,FragmentPath,DropInPaths,ExecStart,WorkingDirectory",
            "--no-pager"])
        items[u]=p.stdout.strip()
        need("ActiveState=active" in p.stdout,"REQUIRED_UNIT_INACTIVE:"+u)
    return items
def listeners():
    p=run(["/usr/bin/ss","-H","-ltn"])
    lines=p.stdout.splitlines()
    return {p:sum(1 for line in lines if re.search(r":" + str(p)+r"\s",line))
            for p in (8092,8093)}
def remote_version(url,policy,expected=True):
    req=urllib.request.Request(url,method="GET",headers={"Cache-Control":"no-cache"})
    with urllib.request.urlopen(req,timeout=8) as response:
        need(response.status==200,"WEB_RESPONSE_NOT_200")
        obj=load(response.read(16385))
    need(type(obj)==dict and set(obj)=={"buildVersion"} and
         type(obj["buildVersion"])==str,"WEB_IDENTITY_NOT_BUILD_VERSION")
    if expected:
        need(obj["buildVersion"]==policy["build_version"],
             "WEB_ACTUAL_BUILD_VERSION_NOT_MATCHED")
        # Next exposes a build-specific static JS manifest. Do not misinterpret
        # the deployment-version API as emitting SHA or BUILD_ID (it does not).
        base=url.split("/api/deployment-version")[0]
        need(base!=url,"WEB_VERSION_PATH_INVALID")
        manifest=base+"/_next/static/"+policy["build_id"]+"/_buildManifest.js"
        with urllib.request.urlopen(
                urllib.request.Request(manifest,method="GET"),
                timeout=8) as reply:
            need(reply.status==200,"PUBLIC_BUILD_ID_STATIC_NOT_FOUND")
            need(0<len(reply.read(65537))<=65536,"PUBLIC_BUILD_MANIFEST_BOUNDS")
    return obj
def audit_dir():
    protected_dir(SLOT_ROOT)
    return SLOT/"r24-activation.json"
def write_once(path,body):
    protected_dir(path.parent)
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
    with os.fdopen(fd,"wb") as f:
        f.write(body);f.flush();os.fsync(f.fileno())
def file_sync(path):
    fd=os.open(path,os.O_DIRECTORY|os.O_RDONLY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
def restore(old_dropin,was_present):
    # The old web service was stopped only for the isolated cutover.
    # Even in failure preserve prior drop-in bytes, never alter source.
    if was_present:
        tmp=DROPIN_DIR/".90-r24-restore"
        need(not tmp.exists(),"RESTORE_PARTIAL_EXISTS")
        with tmp.open("xb") as f:
            f.write(old_dropin);f.flush();os.fsync(f.fileno())
        os.replace(tmp,DROPIN)
    elif DROPIN.exists():
        DROPIN.unlink()
    file_sync(DROPIN_DIR)
    run(["/usr/bin/systemctl","daemon-reload"],timeout=30)
    run(["/usr/bin/systemctl","restart",WEB],timeout=65)
def activate():
    need(sys.platform=="linux" and socket.gethostname()==HOST and os.geteuid()==0,
         "ORIGINAL_HEL1_ROOT_REQUIRED")
    check_original_lock()
    protected_dir(POLICY.parent);stat_regular(POLICY,root_owner=True)
    scope=validated_policy(POLICY.read_bytes())
    source_slot(scope)
    need(not audit_dir().exists(),"PREVIOUS_ATTEMPT_REVIEW_REQUIRED")
    protected_dir(DROPIN_DIR)
    old_dropin=DROPIN.read_bytes() if DROPIN.exists() else b""
    if old_dropin:stat_regular(DROPIN,root_owner=True)
    # An old R24 override is not acceptable: no silent second cutover.
    need(not DROPIN.exists(),"ALREADY_CHANGED_WEB_UNIT")
    before=snapshot(scope["finance_units"])
    before_sockets=listeners()
    need(before_sockets=={8092:1,8093:1},"WOLO_LISTENER_BASELINE_DRIFT")
    # Fail if current unit is already based on another release slot.
    need(str(SLOT_ROOT) not in before[WEB],"ACTIVE_WEB_ALREADY_R24")
    service_old=remote_version(LOCAL_PUBLIC,scope,expected=False)
    # Existing web source is checked from the live Git worktree without
    # mutating the tracked checkout, not inferred from its version API.
    live=pathlib.Path("/var/www/AoE2HDBets/app-prodn")
    old_head=run(["/usr/bin/git","-C",str(live),"rev-parse","HEAD"])
    need(old_head.stdout.strip()==scope["rollback_source_sha"],
         "ORIGINAL_LIVE_REPO_ROLLBACK_IDENTITY_CHANGED")
    old_state={"status":"PREPARED","candidate":CANDIDATE,"previous":service_old,
        "web_unit":before[WEB],"finance_units":{k:v for k,v in before.items() if k!=WEB},
        "wolo_listeners":before_sockets,"build_id":scope["build_id"]}
    check_original_lock()
    fd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        fst=os.fstat(fd)
        need((fst.st_dev,fst.st_ino,fst.st_uid,stat.S_IMODE(fst.st_mode))==LOCK_ID,
             "RELEASE_LOCK_DESCRIPTOR_DRIFT")
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as exc:raise Hold("RELEASE_LOCK_BUSY") from exc
        check_original_lock()
        need(snapshot(scope["finance_units"])==before,"UNIT_STATE_DRIFT_AT_SEAM")
        need(listeners()==before_sockets,"WOLO_LISTENERS_DRIFT_AT_SEAM")
        # Write-once intent *before* any cutover. Failure is not auto-retried.
        record=audit_dir();write_once(record,canonical(old_state)+b"\n");file_sync(SLOT)
        override="[Service]\nWorkingDirectory="+str(SOURCE_DIR)+"\n"
        tmp=DROPIN_DIR/".90-r24-stage"
        need(not tmp.exists(),"OLD_TEMP_REVIEW_REQUIRED")
        # Root-owned drop-in, atomic replacement; old web lives until restart.
        with tmp.open("xb") as f:
            f.write(override.encode());f.flush();os.fsync(f.fileno())
        os.chmod(tmp,0o644)
        try:
            os.replace(tmp,DROPIN);file_sync(DROPIN_DIR)
            run(["/usr/bin/systemctl","daemon-reload"],timeout=30)
            run(["/usr/bin/systemctl","restart",WEB],timeout=65)
            remote_version(LOCAL_PUBLIC,scope)
            remote_version(REMOTE_PUBLIC,scope)
            after=snapshot(scope["finance_units"])
            need(after[WEB]!=before[WEB],"WEB_PID_OR_OVERRIDE_UNCHANGED")
            for u in scope["finance_units"]:
                need(after[u]==before[u],"FINANCIAL_UNIT_CHANGED:"+u)
            need(listeners()==before_sockets,"WOLO_SOCKET_CHANGED")
            print("PASS:R24_SOURCE_LIVE; BUILD_ID="+scope["build_id"])
            print("PASS:R24_OLD_WEB_SOURCE_AND_DEPENDENCIES_RETAINED_FOR_ROLLBACK")
        except BaseException:
            print("HOLD:R24_CUTOVER_FAILED_ROLLBACK_BEGIN",file=sys.stderr)
            try:restore(old_dropin,False)
            except Exception as exc:
                print("HOLD:R24_ROLLBACK_FAILED:"+str(exc),file=sys.stderr)
            raise
    finally:os.close(fd)

def main():
    need(len(sys.argv)==2 and sys.argv[1]=="--root-activate","ONLY_ROOT_ACTIVATE_MODE")
    activate()
if __name__=="__main__":
    try:main()
    except (Hold,OSError,ValueError,TimeoutError,subprocess.SubprocessError) as exc:
        print("HOLD:R24:"+str(exc),file=sys.stderr)
        sys.exit(2)
