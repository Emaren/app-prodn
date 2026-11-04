#!/usr/bin/env python3
"""R25 G: parallel 3030/3031 root-SSH BEFORE/AFTER/ROLLBACK witness.

Root host collector is read-only, delivered over already authenticated SSH stdin.
F controls the single owner-authorized deployment transaction. Never run this
against a candidate lacking B's positive read-only/egress/method admission.
"""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, re, socket, ssl, stat, subprocess, sys, time
from urllib.request import Request, build_opener, HTTPRedirectHandler
import http.client as production_http_client

TARGET="0cee3c836c4b0760478280c145e02e81e470ce0e"
HOST="ubuntu-4gb-hel1-11"
OLD_UNIT="aoe2hdbets-web.service"
NEW_UNIT="aoe2hdbets-web-r24.service"
OLD_PORT=3030
NEW_PORT=3031
OLD_REPO=pathlib.Path("/var/www/AoE2HDBets/app-prodn")
STAGE=pathlib.Path("/var/lib/aoe2war-r25-web-0cee3c836c4b")
C_AUDIT=pathlib.Path("/var/lib/aoe2war-r25-c-additive")
ARCHIVE=pathlib.Path("/var/lib/aoe2war-r24-source-bundles")/(TARGET+".tar")
ARCHIVE_SHA="c906c75d18ca56871bfdb9fbcdb6173e2c7643ae8f58e5f44735103c530f0101"
# Independent C #1084 actual owner build and full 87,038-file verifier.
C_PHYSICAL_TREE_SHA256="5b0de1da545447f64cd1021839692060f5cf308210c19dbd7153f2f25090056d"
C_PHYSICAL_BUILD_ID="-dJl5VyecHu5BKNvfErJe"
C_PHYSICAL_APP_VERSION="20261031171526-148d3df911"
C_PHYSICAL_FILES=87038
C_SOURCE_RECEIPT_SHA256="f16aafea49903202df5d8a96720d83d2c7ba4d537fc1854d14b26a8936fea757"
C_BUILD_RECEIPT_SHA256="17352fe0eb046a985c07c17220435c68095c46710e27b52474a7dadba1b64a20"
EXPECTED_OLD_PID=2625090
APPROVAL=pathlib.Path("/etc/aoe2war/r24-parallel-web/approved.json")
AUDIT=pathlib.Path("/var/lib/aoe2war-r24-parallel")
LOCK=pathlib.Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
LOCK_ID=(2064,6185747,1000,0o644)
PUBLIC="https://aoe2war.com"
PAGES=("/","/lobby","/bets","/live-games","/war-chest")
FINANCE_PREFIXES=("aoe2","wolo","tokenchain","traffic","radio","postgresql","postgres")
MONITOR_ONESHOT_TIMERS={
    "aoe2war-release-readiness-observer.service":"aoe2war-release-readiness-observer.timer",
    "aoe2-wolo-transfer-heartbeat.service":"aoe2-wolo-transfer-heartbeat.timer",
    "aoe2hdbets-bet-stake-reconcile.service":"aoe2hdbets-bet-stake-reconcile.timer",
    "aoe2hdbets-challenge-reconcile.service":"aoe2hdbets-challenge-reconcile.timer",
    "aoe2hdbets-replay-auto-recovery.service":"aoe2hdbets-replay-auto-recovery.timer",
    "aoe2war-prewarm.service":"aoe2war-prewarm.timer",
    "traffic-ingest.service":"traffic-ingest.timer",
    "traffic-project-daily-rollups-aoe2hdbets.service":"traffic-project-daily-rollups-aoe2hdbets.timer",
    "traffic-v2-forward-ledger-aoe2hdbets.service":"traffic-v2-forward-ledger-aoe2hdbets.timer",
    "traffic-watchdog.service":"traffic-watchdog.timer",
    "wolo-mainnet-health.service":"wolo-mainnet-health.timer",
    # Two additional exact HEL1 inactive successful timer oneshots are
    # independently witnessed; preserve static unit command/config hashes.
    "aoe2hdbets-staking-rewards.service":"aoe2hdbets-staking-rewards.timer",
    "aoe2hdbets-trophy-tributes.service":"aoe2hdbets-trophy-tributes.timer",
}
H40=re.compile(r"[a-f0-9]{40}\Z")
H64=re.compile(r"[a-f0-9]{64}\Z")
BUILD=re.compile(r"[A-Za-z0-9_-]{8,128}\Z")
NONCE=re.compile(r"[a-f0-9]{32}\Z")
TRANSACTION_NONCE=None
A04_BEFORE_SHA256="6de56e39c813069ebcebf0674ae6142f78bd7b839e6ad2fea5c8c4c99e8d12b7"
A04_APPROVAL_SHA256="f8855882d7112fc24b1facb8f8df6721ac5c2bffc58c43d021e4773721be956b"
class Hold(Exception): pass
def need(ok,why):
    if not ok: raise Hold(why)
def digest(b):return hashlib.sha256(b).hexdigest()
def canon(x):return json.dumps(x,sort_keys=True,separators=(",",":"),allow_nan=False).encode()
def pairs_unique(pairs):
    out={}
    for k,v in pairs:
        need(k not in out,"DUPLICATE_JSON_PROPERTY")
        out[k]=v
    return out
def parse(raw,max_size=1048576):
    need(0<len(raw)<=max_size,"JSON_SIZE")
    return json.loads(raw,object_pairs_hook=pairs_unique,
        parse_constant=lambda _ : (_ for _ in ()).throw(Hold("NONFINITE_JSON")))
def run(cmd,timeout=20,stdin=None):
    p=subprocess.run(cmd,input=stdin,capture_output=True,timeout=timeout)
    need(p.returncode==0,"READ_ONLY_COMMAND_FAILED:"+pathlib.Path(cmd[0]).name)
    return p.stdout
def root_file(p,maxsize=131072):
    p=pathlib.Path(p)
    st=p.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and
         not st.st_mode&0o022 and 0<st.st_size<=maxsize,"ROOT_FILE_UNTRUSTED")
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        st2=os.fstat(fd)
        need((st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)==
             (st2.st_dev,st2.st_ino,st2.st_size,st2.st_mtime_ns),
             "ROOT_FILE_RACE")
        raw=os.read(fd,maxsize+1)
        need(len(raw)==st.st_size,"ROOT_FILE_CHANGED")
        return raw
    finally:os.close(fd)
def proc_ticks(pid):
    s=(pathlib.Path("/proc")/str(pid)/"stat").read_text()
    p=s.rfind(")")
    need(p>=0,"PROC_STAT_MALFORMED")
    f=s[p+2:].split()
    need(len(f)>19,"PROC_STAT_MISSING_START")
    return int(f[19])
def proc_identity(pid):
    need(type(pid)is int and pid>1,"INVALID_PID")
    root=pathlib.Path("/proc")/str(pid)
    start=proc_ticks(pid)
    uid=int(next(x for x in (root/"status").read_text().splitlines()
                 if x.startswith("Uid:")).split()[1])
    cg=digest((root/"cgroup").read_bytes())
    h=hashlib.sha256()
    with (root/"exe").open("rb") as exe:
        while True:
            b=exe.read(1048576)
            if not b:break
            h.update(b)
    need(proc_ticks(pid)==start,"PID_REUSED_DURING_OBSERVATION")
    return {"pid":pid,"start_ticks":start,"uid":uid,
            "cgroup_sha256":cg,"exe_sha256":h.hexdigest()}
def listening_socket(port):
    found=[]
    for table in ("tcp","tcp6"):
        records=(pathlib.Path("/proc/net")/table).read_text().splitlines()
        need(records and "local_address" in records[0],"SOCKET_TABLE_HEADER")
        for rec in records[1:]:
            fields=rec.split()
            need(len(fields)>=10,"SOCKET_TABLE_MALFORMED")
            if fields[3]=="0A" and int(fields[1].rsplit(":",1)[1],16)==port:
                need(fields[9].isdecimal() and int(fields[9])>0,"SOCKET_INODE_UNKNOWN")
                found.append(fields[9])
    need(len(found)==1,"NOT_EXACTLY_ONE_LISTENER:"+str(port))
    inode=found[0]
    needle="socket:["+inode+"]"
    owners=set()
    for p in pathlib.Path("/proc").iterdir():
        if not p.name.isdecimal():continue
        try: fds=(p/"fd").iterdir()
        except (OSError,PermissionError):continue
        n=0
        try:
            for fd in fds:
                n+=1
                need(n<=8192,"PROCESS_FD_BOUND_EXCEEDED")
                try:
                    if os.readlink(fd)==needle:owners.add(int(p.name));break
                except (FileNotFoundError,PermissionError,ProcessLookupError):continue
        except (FileNotFoundError,PermissionError,ProcessLookupError):continue
    need(len(owners)==1,"LISTENER_OWNER_NOT_UNIQUE:"+str(port))
    result=proc_identity(next(iter(owners)))
    result["socket_inode_sha256"]=digest(inode.encode())
    result["port"]=port
    return result
def show(unit):
    props=["Id","ActiveState","MainPID","ExecMainStartTimestampMonotonic",
           "User","WorkingDirectory","ExecStart","FragmentPath","DropInPaths",
           "Type","TriggeredBy","NeedDaemonReload","Result"]
    config=digest(run(["/usr/bin/systemctl","cat",unit,"--no-pager"],timeout=12))
    if re.search(r"@\.(?:service|timer|socket)$",unit):
        return {"template":True,"unit_config_sha256":config}
    raw=run(["/usr/bin/systemctl","show",unit,"--no-pager"]+
            [z for x in props for z in ("-p",x)],timeout=12).decode()
    obj={}
    for line in raw.splitlines():
        k,sep,v=line.partition("=")
        need(sep and k not in obj,"SYSTEMD_DUPLICATE_PROPERTY")
        obj[k]=v
    need(set(obj).issubset(props) and obj.get("Id")==unit and
         all(k in obj for k in ("ActiveState","FragmentPath","DropInPaths")),
         "SYSTEMD_UNIT_PROPERTIES_MISSING")
    if unit.endswith(".service"):
        required={"Id","ActiveState","MainPID","ExecMainStartTimestampMonotonic",
                  "User","WorkingDirectory","ExecStart","FragmentPath","DropInPaths",
                  "Type","TriggeredBy","NeedDaemonReload","Result"}
        need(required.issubset(obj),"SYSTEMD_SERVICE_PROPERTIES_MISSING")
        need(obj.get("MainPID","").isdecimal(),"SYSTEMD_SERVICE_PID_MISSING")
        pid=int(obj["MainPID"])
    else:
        need(unit.endswith((".timer",".socket")) and "MainPID" not in obj,
             "SYSTEMD_NONPROCESS_UNIT_IDENTITY")
        pid=0
    if unit in MONITOR_ONESHOT_TIMERS:
        need(obj.get("Type")=="oneshot" and obj.get("TriggeredBy")==MONITOR_ONESHOT_TIMERS[unit]
             and obj.get("NeedDaemonReload")=="no" and obj.get("ActiveState")=="inactive"
             and type(obj.get("Result")) is str and bool(obj["Result"])
             and pid==0,"MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT")
        command=obj.get("ExecStart","")
        stable=re.match(r"\{\s*path=[^;]+;\s*argv\[\]=.*;\s*ignore_errors=(?:yes|no)\s*;\s*(?=start_time=)",command,re.S)
        need(stable is not None and command.count("{ path=")==1,
             "MONITOR_EFFECTIVE_COMMAND_UNRECOGNIZED")
        obj["ExecStart_command_sha256"]=digest(stable.group(0).encode())
        obj.pop("ExecMainStartTimestampMonotonic",None)
    if "ExecStart" in obj:
        if unit not in MONITOR_ONESHOT_TIMERS:
            obj["ExecStart_sha256"]=digest(obj["ExecStart"].encode())
        obj.pop("ExecStart")
    result={"properties":obj,"properties_sha256":digest(canon(obj)),
            "unit_config_sha256":config}
    if pid>1:
        result["main_process"]=proc_identity(pid)
    else:
        result["main_process"]=None
    return result
def finance_units():
    raw=run(["/usr/bin/systemctl","list-unit-files","--type=service","--type=timer",
             "--type=socket","--all","--no-legend","--no-pager"],timeout=18).decode()
    loaded=run(["/usr/bin/systemctl","list-units","--type=service","--type=timer",
                "--type=socket","--all","--plain","--no-legend","--no-pager"],timeout=18).decode()
    names=sorted(set(row.split()[0] for row in (raw+"\n"+loaded).splitlines() if row.split()
                     and row.split()[0].lower().startswith(FINANCE_PREFIXES)
                     and row.split()[0].endswith((".service",".timer",".socket"))))
    need(25<=len(names)<=200 and OLD_UNIT in names and NEW_UNIT in names,
         "ORIGINAL_FINANCIAL_UNIT_SET_NOT_COMPLETE")
    return names
def system_state():
    names=finance_units()
    state={name:show(name) for name in names}
    need(any(name.startswith(("postgresql","postgres")) and
             obj.get("properties",{}).get("ActiveState")=="active" and obj.get("main_process")
             for name,obj in state.items()),"ACTIVE_POSTGRESQL_INSTANCE_MISSING")
    return state
def stable_system_state_during_timer_quiescence(maximum_seconds=24):
    """Retain all strict native G unit checks; retry only an in-flight oneshot.

    Finance services are scheduled independently. A real timer may transiently
    be active without changing its configured command, process wall or role.
    No other security/financial runtime failure qualifies for retry.
    """
    deadline=time.monotonic()+maximum_seconds
    while True:
        try:return system_state()
        except Hold as error:
            if (str(error)!="MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"
                or time.monotonic()>=deadline):
                raise
            time.sleep(.2)

def git_source(repo,user):
    # Only inspect tracked source; no checkout, reset, clean or Git hooks.
    prefix=["/usr/sbin/runuser","-u",user,"--","/usr/bin/git",
            "-c","safe.directory="+str(repo),"-C",str(repo)]
    head=run(prefix+["rev-parse","HEAD"],timeout=18).decode().strip()
    need(H40.fullmatch(head),"GIT_HEAD_UNKNOWN")
    tree=run(prefix+["rev-parse","HEAD^{tree}"],timeout=18).decode().strip()
    need(H40.fullmatch(tree),"GIT_TREE_UNKNOWN")
    status=run(prefix+["status","--porcelain","--untracked-files=no"],timeout=35)
    need(not status,"TRACKED_SOURCE_NOT_CLEAN:"+str(repo))
    return {"head":head,"tree_sha":tree,"tracked_clean":True}
def bounded_tree(root,maxbytes=12*1024**3,maxfiles=250000):
    """Streaming exact file-content hash; symlinks/unknown filesystem nodes HOLD."""
    root=pathlib.Path(root)
    need(root.is_dir() and not root.is_symlink(),"DEPENDENCIES_OR_BUILD_MISSING")
    h=hashlib.sha256();count=0;size=0
    base_resolved=root.resolve(strict=True)
    for base,dirs,files in os.walk(root,followlinks=False):
        dirs.sort();files.sort()
        # Package managers legitimately use internal links under node_modules.
        # Hash their target metadata, never follow symlinks to external locations.
        for dirname in list(dirs):
            p=pathlib.Path(base)/dirname
            if p.is_symlink():
                dirs.remove(dirname);files.append(dirname)
        files.sort()
        for name in files:
            p=pathlib.Path(base)/name
            st=p.lstat()
            rel=p.relative_to(root).as_posix().encode()
            if stat.S_ISLNK(st.st_mode):
                link=os.readlink(p)
                need(not pathlib.Path(link).is_absolute() and
                     p.resolve(strict=True).is_relative_to(base_resolved),
                     "DEPENDENCY_SYMLINK_ESCAPES_STAGE")
                payload=link.encode()
                h.update(b"L"+len(rel).to_bytes(4,"big")+rel+
                         len(payload).to_bytes(4,"big")+payload)
                count+=1
                need(count<=maxfiles,"TREE_MEASUREMENT_TOO_LARGE")
                continue
            need(stat.S_ISREG(st.st_mode),"UNTRUSTED_TREE_FILE")
            count+=1;size+=st.st_size
            need(count<=maxfiles and size<=maxbytes,"TREE_MEASUREMENT_TOO_LARGE")
            h.update(b"F"+len(rel).to_bytes(4,"big")+rel+
                     st.st_size.to_bytes(8,"big"))
            with p.open("rb") as file:
                while True:
                    block=file.read(1048576)
                    if not block:break
                    h.update(block)
    need(count>0,"TREE_EMPTY")
    return {"sha256":h.hexdigest(),"files":count,"bytes":size}
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def http(origin,path,method="GET",limit=524288):
    url=origin+path
    req=Request(url,method=method,headers={"Cache-Control":"no-cache",
                                         "User-Agent":"aoe2war-g-r25-no-write"})
    with build_opener(NoRedirect).open(req,timeout=10) as res:
        need(res.status==200,"HTTP_NOT_200:"+path)
        b=res.read(limit+1) if method=="GET" else b""
        need(len(b)<=limit,"HTTP_RESPONSE_TOO_LARGE")
        return b
def http_site(origin,build):
    ver=parse(http(origin,"/api/deployment-version"),8192).get("buildVersion")
    need(type(ver)is str and ver not in ("","unknown","development"),"APP_VERSION_UNKNOWN")
    for p in PAGES:
        # Real 3030 and 3031 /war-chest HTML is 1,560,144 bytes.
        # Widen only this reviewed route; keep every other page bounded
        # to 512 KiB and retain a strict 2 MiB cap even for /war-chest.
        page_limit=2097152 if p=="/war-chest" else 524288
        need(http(origin,p,limit=page_limit), "HTTP_PAGE_EMPTY:"+p)
        http(origin,p,"HEAD")
    manifest="/_next/static/"+build+"/_buildManifest.js"
    static=http(origin,manifest)
    need(static,"NEXT_BUILD_MANIFEST_EMPTY")
    return {"app_build_version":ver,"next_build_id_from_host_not_http":build,
            "manifest":manifest,"manifest_sha256":digest(static),
            "route_get_head_count":len(PAGES)*2,"http_methods_sent":"GET_HEAD_ONLY"}
def lock_state():
    st=LOCK.lstat()
    got=(st.st_dev,st.st_ino,st.st_uid,stat.S_IMODE(st.st_mode))
    need(stat.S_ISREG(st.st_mode) and got==LOCK_ID,"ORIGINAL_RELEASE_LOCK_DRIFT")
    return {"device":st.st_dev,"inode":st.st_ino,"uid":st.st_uid,
            "mode":stat.S_IMODE(st.st_mode)}
def scope():
    base_raw=root_file(APPROVAL,16384)
    x=parse(base_raw,16384)
    need(x.get("schema")=="aoe2war.r24.rootssh.parallel-web-nginx.v1" and
         x.get("candidate_sha")==TARGET and
         isinstance(x.get("nginx_config"),str) and
         x["nginx_config"].startswith("/etc/nginx/") and
         isinstance(x.get("nonce"),str) and NONCE.fullmatch(x["nonce"]),
         "F_ROOT_SCOPE_MISSING_OR_INCOMPLETE")
    if TRANSACTION_NONCE is None:
        return x
    return transaction_scope(base_raw,x)[0]

def transaction_scope(base_raw,base):
    """Select a new authorized journal without rewriting the accepted A04 scope."""
    need(type(TRANSACTION_NONCE)is str and NONCE.fullmatch(TRANSACTION_NONCE)
         and TRANSACTION_NONCE!=base.get("nonce"),"NEW_TRANSACTION_NONCE_REQUIRED")
    need(digest(base_raw)==A04_APPROVAL_SHA256,"ORIGINAL_A04_APPROVAL_BYTES_CHANGED")
    folder=AUDIT/("r24-"+TRANSACTION_NONCE)
    approved_raw=root_file(folder/"approval.json",16384)
    approved=parse(approved_raw,16384)
    record=parse(root_file(folder/"owner-authorization.json",262144),262144)
    need(record.get("schema")=="aoe2war.r25.f.owner-transaction-authorization.v1",
         "NEW_TRANSACTION_AUTHORIZATION_REQUIRED")
    envelope=record.get("envelope",{})
    body=envelope.get("body","")
    cid=envelope.get("id")
    need(type(cid)is int and cid>0 and envelope.get("author")=="Emaren"
         and envelope.get("author_id")==15059910
         and type(envelope.get("created_at"))is str
         and envelope["created_at"]==envelope.get("updated_at")
         and envelope.get("issue_url")=="https://api.github.com/repos/Emaren/app-prodn/issues/1108"
         and envelope.get("url")=="https://github.com/Emaren/app-prodn/issues/1108#issuecomment-"+str(cid)
         and type(body)is str and digest(body.encode())==envelope.get("body_sha256"),
         "ACTUAL_OWNER_AUTHORIZATION_ENVELOPE_REQUIRED")
    block=re.fullmatch(r"R25_F_OWNER_TRANSACTION_GRANT\n```json\n(.+)\n```\n?",body,re.S)
    need(block is not None,"OWNER_TRANSACTION_GRANT_FORMAT")
    manifest=parse(block[1].encode(),65536)
    need(manifest==record.get("manifest") and manifest.get("schema")=="aoe2war.r25.f.owner-transaction-grant.v1"
         and manifest.get("scope")=="A05_NGINX_ONLY_PUBLIC_CUTOVER"
         and manifest.get("decision")=="AUTHORIZE" and manifest.get("owner_login")=="Emaren"
         and manifest.get("release_authority")=="OWNER_ONLY_NONFINANCIAL"
         and manifest.get("owner_delegated_decisions")is True
         and manifest.get("delegated_ai_authorship_disclosed")is True
         and manifest.get("independent_review")is False and manifest.get("financial_authorized")is False
         and manifest.get("public_cutover_authorized")is True
         and manifest.get("rollback_authorized")is True
         and type(manifest.get("max_uses"))is int and manifest["max_uses"]==1,
         "EXACT_OWNER_DELEGATED_NONFINANCIAL_GRANT_REQUIRED")
    plan=record.get("plan",{})
    need(record.get("plan_sha256")==digest(canon(plan))==manifest.get("plan_sha256"),
         "ACTUAL_TRANSACTION_PLAN_DIGEST_REQUIRED")
    previous=plan.get("consumed_previous_transaction",{})
    old_folder=AUDIT/("r24-"+base["nonce"])
    need(previous.get("nonce")==base["nonce"] and previous.get("no_commit")is True
         and previous.get("current_exact_original_config")is True
         and previous.get("intent_sha256")==digest(root_file(old_folder/"intent.json",8192))
         and previous.get("before_nginx_sha256")==digest(root_file(old_folder/"before-nginx.conf",131072))
         and not (old_folder/"commit.json").exists() and not (old_folder/"commit.json").is_symlink(),
         "CONSUMED_PREVIOUS_TRANSACTION_CHANGED")
    for field,value in (("nonce",TRANSACTION_NONCE),("base_approved_sha256",digest(base_raw)),
                        ("before_witness_sha256",A04_BEFORE_SHA256),("candidate_sha",TARGET),
                        ("candidate_build_id",base["candidate_build_id"]),
                        ("candidate_build_version",base["candidate_build_version"]),
                        ("nginx_before_sha256",base["nginx_before_sha256"])):
        need(manifest.get(field)==value and plan.get(field)==value,"AUTHORIZED_TRANSACTION_BINDING_DRIFT:"+field)
    for field,pattern in (("source_sha",H40),("engine_source_sha256",H64),("owner_source_sha256",H64),("g_source_sha256",H64),
                          ("nginx_after_sha256",H64)):
        need(type(manifest.get(field))is str and pattern.fullmatch(manifest[field])
             and plan.get(field)==manifest[field],"AUTHORIZED_TRANSACTION_SOURCE_DRIFT:"+field)
    lineage=runtime_lineage(base,plan)
    expected=dict(base);expected["nonce"]=TRANSACTION_NONCE
    if lineage is not None:
        if lineage.get("schema")=="aoe2war.r25.session-guard-release.v3":
            expected["candidate_web_snapshot_sha256"]=F_CANDIDATE_SESSION_V3_UNIT_SHA
            # Original B historical A04 SHA stays original. A new current B
            # physical witness was executed inside runtime_lineage_v3.
        else:
            expected.update(candidate_web_snapshot_sha256=lineage["f_candidate_after_sha256"],
                            B_poststart_sha256=lineage["b_poststart"]["sha256"])
    need(approved==expected,"NEW_APPROVAL_MUST_CHANGE_ONLY_NONCE_OR_QUALIFIED_AUTH_RUNTIME")
    context={"nonce":TRANSACTION_NONCE,"base_approved_sha256":digest(base_raw),
             "before_witness_sha256":A04_BEFORE_SHA256,"new_approval_sha256":digest(approved_raw),
             "owner_authorization_body_sha256":digest(body.encode()),
             "source_sha":manifest["source_sha"],"engine_source_sha256":manifest["engine_source_sha256"],
             "owner_source_sha256":manifest["owner_source_sha256"],
             "g_source_sha256":manifest["g_source_sha256"]}
    if lineage is not None:
        for key in ("runtime_requalification_path","runtime_requalification_sha256"):
            need(manifest.get(key)==plan[key],"OWNER_AUTH_RUNTIME_BINDING_DRIFT")
            context[key]=plan[key]
    return approved,context

C_SESSION_REPAIR_SOURCE_SHA="0f7829a2eb0cae2a01039ed768cba22ffae2ea1d"
C_SESSION_GUARD_V3_SOURCE_SHA="b8f690c637b0796249265e28e226f4442d1e6f9a"
C_SESSION_GUARD_V3_SOURCE_BYTES_SHA="0a1e1c583d79e24ea63a1e107ade0f5135601e5a0b1a235991637b07de790f00"
C_SESSION_GUARD_V3_GUARD_SHA="192d36d75aede69e85e1d7599d58daf13d9dc96bb2aa49a15d9bd9596b8daac5"
F_CANDIDATE_SESSION_V3_UNIT_SHA="06238a9425a3ea3c47f55ec0f645f10d3a6da047c361265c80e44470df7ab437"

def runtime_lineage_v3(base,path,expected_sha):
    need(type(path)is str and re.fullmatch(
         r"/var/lib/aoe2war-r25-c-additive/session-guard-v3-[0-9a-f]{32}/complete\.json",path)
         and type(expected_sha)is str and H64.fullmatch(expected_sha),
         "G_C_GUARD_V3_EXACT_ROOT_PATH_REQUIRED")
    raw=root_file(pathlib.Path(path),32768)
    need(digest(raw)==expected_sha,"G_C_GUARD_V3_RECEIPT_HASH_DRIFT")
    rec=parse(raw,32768)
    first=rec.get("candidate_before",{});last=rec.get("candidate_after",{})
    need(rec.get("schema")=="aoe2war.r25.session-guard-release.v3"
         and rec.get("status")=="ISOLATED_3031_SESSION_GUARD_NATIVE_ACCEPT"
         and rec.get("source_sha")==C_SESSION_GUARD_V3_SOURCE_SHA
         and rec.get("candidate_guard_sha256")==C_SESSION_GUARD_V3_GUARD_SHA
         and first.get("candidate_pid")==1465429
         and first.get("candidate_start_ticks")==148192915
         and first.get("guard_sha256")=="dead2815b3f20b311ede29dfd99086cbb81dfd6a73f1a71f2b7b57ccd74e809d"
         and last.get("candidate_pid")==1483304 and last.get("candidate_start_ticks")==148446193
         and last.get("guard_sha256")==C_SESSION_GUARD_V3_GUARD_SHA
         and last.get("native_b_status")=="POSITIVE_ISOLATED_3031_NOT_PUBLIC_DEPLOYMENT_AUTHORITY"
         and last.get("native_b_physical_checks_performed")is True
         and last.get("public_pid")==EXPECTED_OLD_PID
         and last.get("build_version")==base["candidate_build_version"]
         and rec.get("session_key_equal_original")is True
         and rec.get("only_symmetric_signing_key")is True
         and rec.get("replayed_previous_nonces")is False
         and rec.get("financial_authorized")is False and rec.get("public_cutover_authorized")is False,
         "G_C_GUARD_V3_SEALED_NATIVE_ACCEPT_REQUIRED")
    grant=rec.get("owner_grant",{})
    need(type(grant.get("comment_id"))is int and grant["comment_id"]>0
         and type(grant.get("body_sha256"))is str and H64.fullmatch(grant["body_sha256"])
         and type(grant.get("ci_run"))is int and grant["ci_run"]>0,
         "G_GUARD_V3_GITHUB_OWNER_GRANT_REQUIRED")
    owner=parse(run(["/usr/bin/gh","api","repos/Emaren/app-prodn/issues/comments/"+str(grant["comment_id"])],timeout=25),262144)
    need(owner.get("user",{}).get("login")=="Emaren"
         and owner.get("user",{}).get("id")==15059910
         and owner.get("created_at")==owner.get("updated_at")
         and digest(owner.get("body","").encode())==grant["body_sha256"],
         "G_GUARD_V3_OWNER_GRANT_CHANGED")
    source=parse(run(["/usr/bin/gh","api","repos/Emaren/app-prodn/contents/scripts/r25_session_guard_release_v3.py?ref="+C_SESSION_GUARD_V3_SOURCE_SHA],timeout=25),262144)
    need(source.get("type")=="file" and source.get("encoding")=="base64",
         "G_GUARD_V3_SOURCE_NOT_GITHUB_VERIFIED")
    import base64
    code=base64.b64decode("".join(source.get("content","").split()),validate=True)
    need(0<len(code)<=131072 and digest(code)==C_SESSION_GUARD_V3_SOURCE_BYTES_SHA,
         "G_GUARD_V3_SOURCE_BYTES_CHANGED")
    # Re-run C's physical read-only B/C qualification; no mutation permitted.
    namespace={"__name__":"readonly_g_requalification"}
    exec(compile(code,"immutable_guard_v3","exec"),namespace)
    physical=namespace["c_baseline"](C_SESSION_GUARD_V3_GUARD_SHA,session=True)
    need(physical==last and digest(root_file(pathlib.Path("/usr/local/lib/aoe2war-r25/r25_b_guard_session_v2.cjs"),16384))==C_SESSION_GUARD_V3_GUARD_SHA,
         "G_GUARD_V3_CURRENT_NATIVE_B_C_PROOF_DRIFT")
    actual_unit=show(NEW_UNIT)
    proc=actual_unit.get("main_process",{})
    need(type(proc)is dict and proc.get("pid")==1483304
         and proc.get("start_ticks")==148446193 and proc.get("uid")==993,
         "G_GUARD_V3_CURRENT_SYSTEMD_IDENTITY_DRIFT")
    return rec

def runtime_lineage(base,plan):
    path=plan.get("runtime_requalification_path");expected_sha=plan.get("runtime_requalification_sha256")
    if path is None and expected_sha is None:return None
    if type(path)is str and "/session-guard-v3-" in path:
        return runtime_lineage_v3(base,path,expected_sha)
    need(type(path)is str and re.fullmatch(r"/var/lib/aoe2war-r25-c-additive/session-repair-[0-9a-f]{32}/complete\.json",path)
         and type(expected_sha)is str and H64.fullmatch(expected_sha),"EXACT_AUTH_RUNTIME_LINEAGE_REQUIRED")
    raw=root_file(pathlib.Path(path),32768)
    need(digest(raw)==expected_sha,"AUTH_RUNTIME_LINEAGE_BYTES_CHANGED")
    r=parse(raw,32768)
    need(r.get("schema")=="aoe2war.r25.c.session-continuity-repair.v1"
         and r.get("status")=="SESSION_CONTINUITY_REPAIRED_AND_REQUALIFIED"
         and type(r.get("nonce"))is str and NONCE.fullmatch(r["nonce"])
         and pathlib.Path(path).parent.name=="session-repair-"+r["nonce"]
         and r.get("source_sha")==C_SESSION_REPAIR_SOURCE_SHA
         and r.get("base_approved_sha256")==A04_APPROVAL_SHA256
         and r.get("before_witness_sha256")==A04_BEFORE_SHA256
         and r.get("candidate_sha")==TARGET and r.get("candidate_build_id")==C_PHYSICAL_BUILD_ID
         and r.get("candidate_build_version")==C_PHYSICAL_APP_VERSION
         and r.get("original_pid")==EXPECTED_OLD_PID and r.get("original_start_ticks")==103836850
         and r.get("previous_candidate_pid")==1118556 and r.get("previous_candidate_start_ticks")==142541543
         and type(r.get("candidate_pid"))is int and r["candidate_pid"]>1
         and r["candidate_pid"] not in (EXPECTED_OLD_PID,1118556)
         and type(r.get("candidate_start_ticks"))is int and r["candidate_start_ticks"]>0
         and r.get("candidate_uid")==993,"QUALIFIED_CANDIDATE_AUTH_RUNTIME_REQUIRED")
    need(all(r.get(k)is True for k in ("signer_present","signer_equal_original","db_env_unchanged",
         "nft_unchanged","guard_unchanged","finance_unchanged","old_web_unchanged"))
         and r.get("secret_values_disclosed")is False and r.get("financial_authorized")is False,
         "AUTH_RUNTIME_SECURITY_NOT_PROVEN")
    need(r.get("f_candidate_before_sha256")==base.get("candidate_web_snapshot_sha256"),
         "AUTH_RUNTIME_NOT_BOUND_TO_A04")
    for key in ("f_candidate_after_sha256","g_candidate_unit_before_sha256","g_candidate_unit_after_sha256",
                "g_candidate_listener_before_sha256","g_candidate_listener_after_sha256"):
        need(type(r.get(key))is str and H64.fullmatch(r[key]),"AUTH_RUNTIME_NATIVE_HASH_REQUIRED")
    for key,name in (("b_poststart","b-poststart.json"),("c_security","c-runtime.json")):
        evidence=r.get(key,{})
        need(type(evidence)is dict and evidence.get("path")==str(pathlib.Path(path).parent/name)
             and type(evidence.get("sha256"))is str and H64.fullmatch(evidence["sha256"])
             and digest(root_file(pathlib.Path(evidence["path"]),65536))==evidence["sha256"],
             "AUTH_RUNTIME_B_C_NATIVE_EVIDENCE_CHANGED")
    return r
NGINX_SITE=pathlib.Path("/etc/nginx/sites-available/aoe2war.com")
OLD_PROXY=b"proxy_pass http://127.0.0.1:3030;"
NEW_PROXY=b"proxy_pass http://127.0.0.1:3031;"
WEB_LOCATIONS={b"^~ /players/by-name/",b"= /api/kingdom-presence/events",
               b"^~ /api/",b"= /",b"^~ /download/watcher/",b"/"}
METHOD_GUARD=b"if ($request_method !~ ^(GET|HEAD)$) { return 405; }"
def matching_brace(src,at):
    need(src[at:at+1]==b"{","NGINX_EXPECTED_OPEN_BRACE")
    depth=0;quote=None;comment=False;esc=False
    for i in range(at,len(src)):
        ch=src[i]
        if comment:
            if ch==10:comment=False
            continue
        if quote is not None:
            if esc:esc=False
            elif ch==92:esc=True
            elif ch==quote:quote=None
            continue
        if ch==35:comment=True;continue
        if ch in (34,39):quote=ch;continue
        if ch==123:depth+=1
        elif ch==125:
            depth-=1
            if depth==0:return i
            need(depth>=0,"NGINX_UNBALANCED")
    raise Hold("NGINX_UNCLOSED_BLOCK")
def https_body(raw):
    matches=[];found=[]
    for m in re.finditer(rb"(?m)^[ \t]*server[ \t]*\{",raw):
        op=raw.index(b"{",m.start(),m.end())
        end=matching_brace(raw,op)
        body=raw[op+1:end]
        name=re.search(rb"(?m)^[ \t]*server_name[ \t]+([^;]+);",body)
        need(name is not None and set(name.group(1).split())==
             {b"aoe2war.com",b"www.aoe2war.com"},"NGINX_VHOST_DOMAIN_DRIFT")
        https=bool(re.search(rb"(?m)^[ \t]*listen[ \t]+(?:\[::\]:)?443\b",body))
        http=bool(re.search(rb"(?m)^[ \t]*listen[ \t]+(?:\[::\]:)?80\b",body))
        need(https != http,"NGINX_VHOST_PORT_AMBIGUOUS")
        matches.append((https,http))
        if https:found.append((op+1,end,body))
    need(len(matches)==2 and len(found)==1,"NGINX_HTTPS_HTTP_VHOST_PAIR_UNKNOWN")
    return found[0]
def six_web_upstreams(raw):
    lo,hi,body=https_body(raw)
    locations={}
    for m in re.finditer(rb"(?m)^[ \t]*location[ \t]+([^{}\r\n]+)[ \t]*\{",body):
        label=b" ".join(m.group(1).split())
        op=body.index(b"{",m.start(),m.end())
        close=matching_brace(body,op)
        inner=body[op+1:close]
        n_old=inner.count(OLD_PROXY);n_new=inner.count(NEW_PROXY)
        if n_old+n_new==0:continue
        need(label in WEB_LOCATIONS and label not in locations and n_old+n_new==1
             and len(re.findall(rb"(?m)^[ \t]*proxy_pass\b",inner))==1,
             "NGINX_UNREVIEWED_WEB_PROXY_LOCATION")
        locations[label]={"old":n_old,"new":n_new,
                          "method_guard":METHOD_GUARD in inner}
    need(set(locations)==WEB_LOCATIONS and
         raw.count(OLD_PROXY)==sum(v["old"] for v in locations.values()) and
         raw.count(NEW_PROXY)==sum(v["new"] for v in locations.values()),
         "NGINX_SIX_WEB_PROXY_CENSUS_MISMATCH")
    count_old=sum(x["old"] for x in locations.values())
    count_new=sum(x["new"] for x in locations.values())
    need((count_old,count_new) in ((6,0),(0,6)),
         "NGINX_MIXED_3030_3031_PUBLIC_ROUTES")
    if count_new:
        need(all(x["method_guard"] for x in locations.values()),
             "NGINX_3031_METHOD_GUARD_MISSING")
    need(b"proxy_pass http://127.0.0.1:27657" in raw and
         b"proxy_pass http://127.0.0.1:1318" in raw,
         "NGINX_WOLO_PROXY_TOPOLOGY_MISSING")
    return 3030 if count_old else 3031
def nginx_route(approved):
    config=pathlib.Path(approved["nginx_config"])
    need(config==NGINX_SITE,"F_NGINX_VHOST_SOURCE_MISMATCH")
    conf=root_file(config,131072)
    port=six_web_upstreams(conf)
    compiled=run(["/usr/sbin/nginx","-T"],timeout=25)
    need(len(compiled)<=8*1024*1024,"NGINX_LOADED_CONFIG_TOO_LARGE")
    chunks=re.split(rb"(?m)^# configuration file ([^\r\n]+):[ \t]*\r?\n",compiled)
    need(len(chunks)>=3 and len(chunks)%2==1,"NGINX_LOADED_SECTION_HEADERS_MISSING")
    found=0;global_old=0;global_new=0
    for i in range(1,len(chunks),2):
        name=chunks[i].decode("utf8","strict")
        part=chunks[i+1].rstrip(b"\r\n")
        global_old+=part.count(OLD_PROXY);global_new+=part.count(NEW_PROXY)
        try:matching=os.path.samefile(name,config)
        except OSError:matching=False
        if matching:
            need(part==conf.rstrip(b"\r\n"),"NGINX_LOADED_VHOST_NOT_ACTUAL_FILES")
            found+=1
    need(found==1 and global_old==(6 if port==3030 else 0) and
         global_new==(6 if port==3031 else 0),
         "NGINX_UNEXPECTED_ADDITIONAL_WEB_UPSTREAMS")
    return {"upstream_port":port,"web_locations":6,
            "selected_file":str(config),"file_sha256":digest(conf),
            "nginx_compiled_sha256":digest(compiled),
            "nginx_t_ok":True}

def audit(approved,phase):
    p=AUDIT/("r24-"+approved["nonce"])
    if phase=="before":return {"phase":"before","journal":None}
    need(p.is_dir() and not p.is_symlink(),"F_ROOT_CUTOVER_JOURNAL_MISSING")
    commit=parse(root_file(p/"commit.json",8192),8192)
    need(commit.get("status")=="R24_PARALLEL_WEBSITE_LIVE" and
         commit.get("candidate_sha")==TARGET and
         commit.get("nonce")==approved["nonce"],"F_CUTOVER_COMMIT_MISMATCH")
    if TRANSACTION_NONCE is not None:
        base_raw=root_file(APPROVAL,16384)
        _,context=transaction_scope(base_raw,parse(base_raw,16384))
        for key,value in context.items():
            need(commit.get(key)==value,"COMMIT_AUTHORIZED_TRANSACTION_DRIFT:"+key)
    original=root_file(p/"before-nginx.conf",131072)
    need(digest(original)==commit.get("old_nginx_sha256"),
         "F_NGINX_ROLLBACK_CONTENT_DRIFT")
    current=digest(root_file(pathlib.Path(approved["nginx_config"]),131072))
    need(current==(commit.get("old_nginx_sha256") if phase=="rollback"
                   else commit.get("new_nginx_sha256")),
         "F_LOADED_NGINX_DOES_NOT_MATCH_ROOT_COMMIT")
    outcome={"commit_sha256":digest(canon(commit)),
             "root_rollback_nginx_sha256":digest(original),
             "approved_after_nginx_sha256":commit.get("new_nginx_sha256"),
             "root_rollback_material_verified":True,
             "rollback_exercised":False}
    if phase=="rollback":
        rb=parse(root_file(p/"rollback.json",8192),8192)
        need(rb.get("status")=="OLD_PUBLIC_PROXY_RESTORED" and
             rb.get("nonce")==approved["nonce"] and
             rb.get("original_web_restarted") is False,
             "F_ROLLBACK_JOURNAL_INVALID")
        outcome["rollback_receipt_sha256"]=digest(canon(rb))
        outcome["rollback_exercised"]=True
    return outcome
def root_sealed_file(p):
    st=p.lstat()
    return (stat.S_ISREG(st.st_mode) and st.st_uid==0 and
            not(st.st_mode&0o022) and st.st_nlink==1)
def protected_c_stage_boundary():
    """Reject mutable live-web parents; match C's direct root-owned /var/lib stage."""
    expected=pathlib.Path("/var/lib")/("aoe2war-r25-web-"+TARGET[:12])
    need(STAGE==expected and STAGE.parent==pathlib.Path("/var/lib"),
         "C_ROOT_STAGE_PATH_NOT_REVIEWED")
    for directory in (STAGE, STAGE.parent, C_AUDIT, C_AUDIT.parent):
        st=directory.lstat()
        need(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and
             not(st.st_mode&0o022), "C_STAGE_ROOT_TRUST_BOUNDARY")

def require_c_physical_build_identity(built):
    need(type(built)==dict and
         built.get("tree_sha256")==C_PHYSICAL_TREE_SHA256 and
         built.get("build_id")==C_PHYSICAL_BUILD_ID and
         built.get("build_version")==C_PHYSICAL_APP_VERSION and
         built.get("files")==C_PHYSICAL_FILES,
         "C_PHYSICAL_87038_FILE_TREE_BUILD_ID_MISMATCH")

def verified_c_archive_source():
    """C's Git archive has NO .git: trust exact pinned archive + source manifests."""
    protected_c_stage_boundary()
    source_raw=root_file(C_AUDIT/"SOURCE_STAGED.json",65536)
    built_raw=root_file(C_AUDIT/"BUILD_STAGED.json",65536)
    need(digest(source_raw)==C_SOURCE_RECEIPT_SHA256 and
         digest(built_raw)==C_BUILD_RECEIPT_SHA256,"C_ACCEPTED_ROOT_RECEIPT_BYTES_CHANGED")
    source=parse(source_raw,65536)
    built=parse(built_raw,65536)
    require_c_physical_build_identity(built)
    srcfiles=parse(root_file(C_AUDIT/"SOURCE_FILES.json",33554432),33554432)
    builtfiles=parse(root_file(C_AUDIT/"BUILD_FILES.json",67108864),67108864)
    need(source.get("status")=="SOURCE_STAGED" and
         built.get("status")=="BUILD_STAGED" and
         source.get("candidate_sha")==built.get("candidate_sha")==TARGET and
         source.get("git_archive_sha256")==built.get("source_git_archive_sha256")==ARCHIVE_SHA,
         "C_SOURCE_ARCHIVE_NOT_EXACT_FROZEN_IDENTITY")
    need(srcfiles.get("schema")=="r25-c-source-files.v1" and
         builtfiles.get("schema")=="aoe2war.r25.c.full-artifact-files.v1" and
         isinstance(srcfiles.get("rows"),list) and
         isinstance(builtfiles.get("rows"),list) and
         digest(canon(srcfiles["rows"]))==source.get("source_manifest_sha256") and
         digest(canon(builtfiles["rows"]))==built.get("tree_sha256"),
         "C_ROOT_SOURCE_OR_BUILD_MANIFEST_DIGEST_DRIFT")
    need(built.get("root_sealed") is True and built.get("financial_writes_authorized") is False
         and built.get("old_web_pid_untouched")==EXPECTED_OLD_PID,
         "C_BUILD_RECEIPT_SCOPE_DRIFT")
    need(len(builtfiles["rows"])==C_PHYSICAL_FILES,"C_FULL_MANIFEST_COUNT_CHANGED")
    # C already independently rehashed all87,038 files. Consume that accepted
    # root-sealed manifest; do not repeat it and two overlapping tree scans for
    # every BEFORE/AFTER recheck. Re-read only the actual release identity and
    # static witness bytes, each bound to its accepted manifest row.
    static_rel=".next/static/"+C_PHYSICAL_BUILD_ID+"/_buildManifest.js"
    identities={"r24-source-sha":TARGET,".next/BUILD_ID":C_PHYSICAL_BUILD_ID,
                ".aoe2war-build-version":C_PHYSICAL_APP_VERSION}
    chosen={**identities,static_rel:None}
    measured={}
    for rel,expected in chosen.items():
        hits=[row for row in builtfiles["rows"] if type(row)is dict and row.get("path")==rel]
        need(len(hits)==1 and hits[0].get("type")=="file", "C_WITNESS_FILE_NOT_IN_MANIFEST")
        row=hits[0];target=STAGE/rel
        need(root_sealed_file(target),"C_ROOT_SEALED_WITNESS_FILE_DRIFT")
        raw=root_file(target,65536)
        need(len(raw)==row.get("size") and digest(raw)==row.get("sha256"),
             "C_BUILT_FILE_BYTES_CHANGED")
        if expected is not None:
            need(raw.strip().decode("ascii")==expected,"C_RELEASE_IDENTITY_CHANGED")
        measured[rel]=digest(raw)
    return {"source_git_archive_sha256":ARCHIVE_SHA,
            "source_manifest_sha256":source["source_manifest_sha256"],
            "build_manifest_sha256":built["tree_sha256"],
            "receipt_build_id":built["build_id"],
            "source_receipt_status":"SOURCE_STAGED",
            "build_receipt_status":"BUILD_STAGED",
            "root_manifest_file_count":built.get("files"),
            "git_directory_absent_by_design":True,
            "accepted_full_tree_rehash_repeated":False,
            "static_manifest_file_sha256":measured[static_rel]}
def stage():
    need(STAGE.is_dir() and not STAGE.is_symlink(),"PARALLEL_CANDIDATE_NOT_STAGED")
    marker=root_file(STAGE/"r24-source-sha",64).decode().strip()
    need(marker==TARGET,"C_SOURCE_MARKER_MISMATCH")
    source=verified_c_archive_source()
    build_file=STAGE/".next/BUILD_ID"
    need(not build_file.is_symlink() and build_file.is_file(),"C_NEXT_BUILD_ID_MISSING")
    build=build_file.read_text().strip()
    need(BUILD.fullmatch(build) and build==source["receipt_build_id"],
         "C_NEXT_BUILD_ID_NOT_IN_ROOT_BUILT_RECEIPT")
    for directory in (STAGE/"node_modules",STAGE/".next"):
        st=directory.lstat()
        need(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,
             "C_DEPENDENCY_BUILD_ROOT_SEAL_CHANGED")
    return {"source":source,"source_marker":marker,"next_build_id":build,
            "full_dependency_and_build_bytes_measured":False,
            "prior_independent_full_tree_sha256":C_PHYSICAL_TREE_SHA256,
            "root_owner_stage_receipt_binding_requires_F":True}
def root_snapshot(phase):
    need(sys.platform=="linux" and os.geteuid()==0 and
         socket.gethostname().split(".")[0]==HOST,"NOT_ROOT_ORIGINAL_HEL1")
    need(phase in ("before","after","rollback"),"PHASE_INVALID")
    original=git_source(OLD_REPO,"tony")
    old_build=(OLD_REPO/".next/BUILD_ID").read_text().strip()
    need(BUILD.fullmatch(old_build),"OLD_NEXT_BUILD_ID_UNKNOWN")
    candidate=stage()
    units=stable_system_state_during_timer_quiescence()
    need(units[OLD_UNIT]["properties"]["MainPID"]==str(EXPECTED_OLD_PID),
         "ORIGINAL_SETTLEMENT_CAPABLE_WEB_PID_NOT_2625090")
    need(units[OLD_UNIT]["properties"]["ActiveState"]=="active" and
         units[NEW_UNIT]["properties"]["ActiveState"]=="active" and
         units[OLD_UNIT]["main_process"] and units[NEW_UNIT]["main_process"],
         "BOTH_WEBS_MUST_BE_RUNNING")
    ports={str(p):listening_socket(p) for p in (3030,3031,8092,8093)}
    old_http=http_site("http://127.0.0.1:3030",old_build)
    new_http=http_site("http://127.0.0.1:3031",candidate["next_build_id"])
    need(new_http["manifest_sha256"]==candidate["source"]["static_manifest_file_sha256"],
         "RUNNING_STATIC_BYTES_NOT_ACCEPTED_C_ARTIFACT")
    need(old_http["app_build_version"]!=new_http["app_build_version"],
         "OLD_AND_NEW_APP_BUILD_VERSION_AMBIGUOUS")
    # Public probe deliberately performed only once on Mac side, not on HEL1 root.
    approved=scope()
    route=nginx_route(approved)
    history=audit(approved,phase)
    result={"schema":"aoe2war.g.r25.parallel-host.v1","phase":phase,"host":HOST,
        "old_source":original,"old_next_build_id":old_build,
        "candidate":candidate,"units":units,"ports":ports,
        "old_http":old_http,"candidate_http":new_http,
        "nginx":route,"release_lock":lock_state(),"release_journal":history,
        "approved_scope_sha256":digest(root_file(APPROVAL,16384)),
        "proof":"ROOT_SSH_MEASURED_NOT_FINANCE_SIGNED"}
    if TRANSACTION_NONCE is not None:
        need(phase in ("after","rollback"),"NO_NEW_BEFORE_FOR_EXISTING_TRANSACTION_BASE")
        raw=root_file(APPROVAL,16384)
        base=parse(raw,16384)
        context=transaction_scope(raw,base)[1]
        result["transaction_scope"]=context
        if context.get("runtime_requalification_path") is not None:
            result["candidate_runtime_lineage"]=runtime_lineage(base,context)
    return result
def ssh_snapshot(target,phase):
    need(re.fullmatch(r"root@[A-Za-z0-9._-]{1,140}",target),"UNREVIEWED_SSH_TARGET")
    payload=pathlib.Path(__file__).read_bytes()
    argv=["/usr/bin/ssh","-T","-o","BatchMode=yes",
          "-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=8",
          target,"/usr/bin/python3","-I","-B","-","--remote",phase]
    if TRANSACTION_NONCE is not None:
        argv.extend(("--transaction-nonce",TRANSACTION_NONCE))
    reply=subprocess.run(argv,input=payload,capture_output=True,timeout=380)
    if reply.returncode:
        # The remote G source uses a fixed HOLD prefix and symbolic predicates.
        # Surface ONLY a tightly bounded uppercase predicate, never arbitrary
        # stderr, HTTP bodies or financial environment values.
        failure=reply.stderr.decode("ascii",errors="replace")
        match=re.search(r"HOLD:G_R25_PARALLEL_POSTFLIGHT:([A-Z0-9_:.]{1,128})",failure)
        if match:raise Hold("G_REMOTE_NATIVE_HOLD:"+match.group(1))
        raise Hold("G_REMOTE_SSH_OR_UNCLASSIFIED_RUNTIME_FAILURE")
    return parse(reply.stdout)
def public_check(expected):
    result=http_site(PUBLIC,expected["candidate"]["next_build_id"]
                     if expected["phase"]=="after" else expected["old_next_build_id"])
    live=expected["candidate_http"] if expected["phase"]=="after" else expected["old_http"]
    need(result["app_build_version"]==live["app_build_version"] and
         result["manifest_sha256"]==live["manifest_sha256"] and
         result["manifest"]==live["manifest"],
         "PUBLIC_BYTES_OR_VERSION_NOT_SELECTED_INTERNAL_WEB")
    return result
def compare_process_and_finance(before,after):
    need(before["host"]==after["host"]==HOST and
         before["release_lock"]==after["release_lock"] and
         before["old_source"]==after["old_source"] and
         before["old_next_build_id"]==after["old_next_build_id"],
         "ORIGINAL_WEB_SOURCE_BUILD_OR_LOCK_CHANGED")
    # Both original and new web processes are preserved through nginx-only cutover.
    lineage=after.get("candidate_runtime_lineage")
    if lineage is None:
        need(before["units"]==after["units"],"ANY_WEB_OR_FINANCIAL_UNIT_CHANGED")
        need(before["ports"]==after["ports"],"ANY_3030_3031_8092_8093_LISTENER_CHANGED")
    elif lineage.get("schema")=="aoe2war.r25.session-guard-release.v3":
        # Historical G BEFORE stays immutable at original A04 candidate PID;
        # C v3 really measured the intervening 1465429 process and the
        # current 1483304 process, each with authentic original B confinement.
        for field,selected in (("units",NEW_UNIT),("ports","3031")):
            old=dict(before[field]);new=dict(after[field])
            pre=old.pop(selected);post=new.pop(selected)
            need(old==new,"GUARD_V3_MODIFIED_OLD_WEB_OR_FINANCE")
            a=pre["main_process"] if field=="units" else pre
            b=post["main_process"] if field=="units" else post
            need(a["pid"]==1118556 and a["start_ticks"]==142541543
                 and b["pid"]==lineage["candidate_after"]["candidate_pid"]
                 and b["start_ticks"]==lineage["candidate_after"]["candidate_start_ticks"]
                 and a["uid"]==b["uid"]==993
                 and a["exe_sha256"]==b["exe_sha256"]
                 and a["cgroup_sha256"]==b["cgroup_sha256"],
                 "GUARD_V3_ORIGINAL_VS_NEW_PROCESS_LINEAGE_NOT_PROVEN")
    else:
        for field,selected,old_key,new_key in (("units",NEW_UNIT,"g_candidate_unit_before_sha256","g_candidate_unit_after_sha256"),
              ("ports","3031","g_candidate_listener_before_sha256","g_candidate_listener_after_sha256")):
            old=dict(before[field]);new=dict(after[field])
            old_candidate=old.pop(selected);new_candidate=new.pop(selected)
            need(old==new,"AUTH_REPAIR_CHANGED_ORIGINAL_OR_FINANCIAL_RUNTIME")
            need(digest(canon(old_candidate))==lineage[old_key] and digest(canon(new_candidate))==lineage[new_key],
                 "AUTH_REPAIR_CANDIDATE_DELTA_NOT_ROOT_QUALIFIED")
            a=old_candidate["main_process"] if field=="units" else old_candidate
            b=new_candidate["main_process"] if field=="units" else new_candidate
            need(a["pid"]==lineage["previous_candidate_pid"] and a["start_ticks"]==lineage["previous_candidate_start_ticks"]
                 and b["pid"]==lineage["candidate_pid"] and b["start_ticks"]==lineage["candidate_start_ticks"]
                 and a["uid"]==b["uid"]==993 and a["exe_sha256"]==b["exe_sha256"]
                 and a["cgroup_sha256"]==b["cgroup_sha256"],"AUTH_REPAIR_PROCESS_LINEAGE_DRIFT")
    need(before["candidate"]==after["candidate"],"CANDIDATE_SOURCE_BUILD_DEPENDENCY_DRIFT")
    need(before["old_http"]==after["old_http"] and
         before["candidate_http"]==after["candidate_http"],
         "ORIGINAL_OR_CANDIDATE_RUNTIME_HTTP_CHANGED")
    need(before["approved_scope_sha256"]==after["approved_scope_sha256"],
         "OWNER_APPROVAL_CHANGED_DURING_CUTOVER")
def verify(before,after,phase):
    need(before.get("schema")==after.get("schema")=="aoe2war.g.r25.parallel-host.v1"
         and before.get("phase")=="before" and after.get("phase")==phase,
         "WRONG_BEFORE_OR_POSTFLIGHT_PHASE")
    compare_process_and_finance(before,after)
    context=after.get("transaction_scope")
    if TRANSACTION_NONCE is not None:
        need(type(context)is dict and context.get("nonce")==TRANSACTION_NONCE
             and context.get("before_witness_sha256")==A04_BEFORE_SHA256
             and context.get("base_approved_sha256")==before["approved_scope_sha256"],
             "NEW_TRANSACTION_NOT_BOUND_TO_ORIGINAL_BEFORE")
        lineage=after.get("candidate_runtime_lineage")
        need((lineage is not None)==(context.get("runtime_requalification_path") is not None),
             "AUTH_RUNTIME_LINEAGE_CONTEXT_MISSING")
        if lineage is not None:
            if lineage.get("schema")=="aoe2war.r25.session-guard-release.v3":
                need(lineage.get("source_sha")==C_SESSION_GUARD_V3_SOURCE_SHA
                     and lineage.get("candidate_after",{}).get("candidate_pid")==1483304
                     and context.get("before_witness_sha256")==A04_BEFORE_SHA256
                     and context.get("base_approved_sha256")==before["approved_scope_sha256"],
                     "GUARD_V3_ROOT_OWNER_TRANSACTION_CONTEXT_DRIFT")
            else:
                need(lineage.get("source_sha")==context["source_sha"]
                     and lineage.get("before_witness_sha256")==A04_BEFORE_SHA256
                     and lineage.get("base_approved_sha256")==before["approved_scope_sha256"],
                     "AUTH_RUNTIME_LINEAGE_CONTEXT_DRIFT")
    need(before["nginx"]["upstream_port"]==3030,"BEFORE_NGINX_NOT_OLD")
    need(after["release_journal"]["root_rollback_nginx_sha256"]==
         before["nginx"]["file_sha256"],"F_ROLLBACK_PREIMAGE_NOT_ORIGINAL_NGINX")
    if phase=="after":
        need(after["nginx"]["file_sha256"]==
             after["release_journal"]["approved_after_nginx_sha256"],
             "F_CUTOVER_NGINX_NOT_ROOT_COMMITTED")
    expected=3031 if phase=="after" else 3030
    need(after["nginx"]["upstream_port"]==expected,"NGINX_NOT_EXPECTED_UPSTREAM")
    need(before["nginx"]["selected_file"]==after["nginx"]["selected_file"],
         "NGINX_SELECTED_VHOST_CHANGED")
    if phase=="after":
        need(after["release_journal"]["root_rollback_material_verified"] is True and
             after["release_journal"]["rollback_exercised"] is False,
             "F_ROLLBACK_PREIMAGE_NOT_PRESERVED")
        need(before["nginx"]["file_sha256"]!=after["nginx"]["file_sha256"],
             "NO_NGINX_CUTOVER_OCCURRED")
    else:
        need(after["nginx"]["file_sha256"]==before["nginx"]["file_sha256"] and
             after["release_journal"]["rollback_exercised"] is True,
             "ROLLBACK_CHANGED_MORE_THAN_NGINX_OR_NOT_RECORDED")
    result={"schema":"aoe2war.g.r25.postflight.v1","phase":phase,
        "status":"LIVE_PARALLEL_HOST_AND_PUBLIC_MEASURED_REQUIRES_F_STAGE_REVIEW"
                 if phase=="after" else "PUBLIC_3030_NGINX_ONLY_ROLLBACK_MEASURED",
        "frozen_candidate_sha":TARGET,
        "old_web_service_pid_unchanged":True,
        "old_web_source_build_3030_unchanged":True,
        "new_candidate_source_build_identity_3031_unchanged":True,
        "accepted_dependency_manifest_sha256":C_PHYSICAL_TREE_SHA256,
        "dependency_bytes_rehashed_in_this_witness":False,
        "financial_units_and_wolo_8092_8093_unchanged":True,
        "original_release_lock_unchanged":True,
        "nginx_active_upstream":expected,
        "next_build_id_measured_on_HOST_not_public":after["candidate"]["next_build_id"],
        "public_next_build_id_directly_exposed":False,
        "rollback_proven":"NGINX_ONLY_RESTORED" if phase=="rollback" else
                          "ROOT_OWNED_NGINX_PREIMAGE_PRESERVED",
        "finance_signed_receipt":False,
        "independent_live_browser_88_routes":"NOT_RUN",
        "postflight_GET_HEAD_cannot_certify_SSR_write_safety":True}
    if context is not None:
        result["transaction_scope"]=context
        if after.get("candidate_runtime_lineage") is not None:
            result["candidate_process_requalified_before_cutover"]=True
            result["session_continuity_requalification_sha256"]=context["runtime_requalification_sha256"]
    return result
# Separate successor production profile. Frozen 3031 receipts above remain immutable.
PRODUCTION_POLICY=pathlib.Path("/etc/aoe2war/web-prod-v1/approved-profile.json")
PRODUCTION_CONTROLLER=pathlib.Path("/usr/local/lib/aoe2war-web-prod/r25_c_start_root.py")
PRODUCTION_UNIT="aoe2hdbets-web-prod.service"
PRODUCTION_OWNED_UNITS={PRODUCTION_UNIT,"aoe2war-steam-egress-refresh.service","aoe2war-steam-egress-refresh.timer"}
PRODUCTION_VHOST=pathlib.Path("/etc/nginx/sites-available/aoe2war.com")
PRODUCTION_WEB_LOCATIONS={b"^~ /players/by-name/",b"= /api/kingdom-presence/events",b"^~ /api/",b"= /",b"^~ /download/watcher/",b"/"}

def production_root_file(path,maximum=131072):
    path=pathlib.Path(path)
    for parent in path.parents:
        st=parent.lstat()
        need(stat.S_ISDIR(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,"PRODUCTION_ROOT_PARENT_UNTRUSTED")
    return root_file(path,maximum)

def production_profile():
    raw=production_root_file(PRODUCTION_POLICY,32768);policy=parse(raw,32768)
    need(policy.get("schema")=="aoe2war.app.approved-production-profile.v1" and
         policy.get("profile")=="nonfinancial-production-v1" and policy.get("uid")==990 and policy.get("gid")==984 and
         policy.get("unit")==PRODUCTION_UNIT and policy.get("port")==3032 and H40.fullmatch(policy.get("source_sha","")) and
         BUILD.fullmatch(policy.get("build_id","")),"PRODUCTION_PROFILE_SCOPE")
    need(policy.get("stage")=="/var/lib/aoe2war-web-prod-"+policy["source_sha"][:12],"PRODUCTION_STAGE_PATH")
    need(digest(production_root_file(PRODUCTION_CONTROLLER,196608))==policy.get("controller_sha256"),"PRODUCTION_C_CONTROLLER_PIN")
    witness=parse(run(["/usr/bin/python3","-I","-B",str(PRODUCTION_CONTROLLER),"--phase","production-witness"],timeout=45,
                      stdin=canon({"profile_path":str(PRODUCTION_POLICY)})),131072)
    need(witness.get("schema")=="aoe2war.app.production-witness.v1" and witness.get("status")=="NATIVE_PRODUCTION_PROFILE_PASS" and
         witness.get("financial_authorized") is False and witness.get("read_only_observation") is True and H64.fullmatch(witness.get("admission_sha256","")),"PRODUCTION_C_NATIVE_READ_ONLY_WITNESS_REQUIRED")
    for key in ("source_sha","build_id","build_version","stage","uid","gid","unit","port","manifest_sha256","protected_snapshot_sha256"):
        need(witness.get(key)==policy.get(key),"PRODUCTION_C_PROFILE_DRIFT:"+key)
    return policy,digest(raw),witness

def production_selectors(raw):
    # Parse lexical location braces independently from F. Six uniform selectors
    # are required; includes, other routes and mixed old/new ports fail closed.
    lo,hi,body=https_body(raw);found={}
    for match in re.finditer(rb"(?m)^[ \t]*location[ \t]+([^{}\r\n]+)[ \t]*\{",body):
        label=b" ".join(match.group(1).split());op=body.index(b"{",match.start(),match.end())
        contents=body[op+1:matching_brace(body,op)]
        web=re.findall(rb"proxy_pass[ \t]+http://127\.0\.0\.1:(3030|3031|3032);",contents)
        if not web:continue
        need(label in PRODUCTION_WEB_LOCATIONS and label not in found and len(web)==1,"PRODUCTION_UNREVIEWED_SELECTOR")
        found[label]=int(web[0])
    need(set(found)==PRODUCTION_WEB_LOCATIONS and len(set(found.values()))==1,"PRODUCTION_MIXED_OR_MISSING_SIX_SELECTORS")
    return next(iter(found.values()))

def production_loaded_nginx(raw):
    loaded=run(["/usr/sbin/nginx","-T"],timeout=22)
    need(0<len(loaded)<=8388608,"PRODUCTION_NGINX_LOADED_BOUND")
    sections=re.split(rb"(?m)^# configuration file ([^\r\n]+):[ \t]*\r?\n",loaded)
    found=[];counts={3030:0,3031:0,3032:0}
    for index in range(1,len(sections),2):
        if index+1>=len(sections):raise Hold("PRODUCTION_NGINX_SECTION_MARKERS")
        data=sections[index+1].rstrip(b"\r\n")
        for port in counts:counts[port]+=data.count(("proxy_pass http://127.0.0.1:%d;"%port).encode())
        try:equal=os.path.samefile(sections[index].decode(),PRODUCTION_VHOST)
        except OSError:equal=False
        if equal:
            need(data==raw.rstrip(b"\r\n"),"PRODUCTION_NGINX_ACTIVE_FILE_DISAGREEMENT");found.append(True)
    port=production_selectors(raw)
    need(len(found)==1 and counts=={p:(6 if p==port else 0) for p in counts},"PRODUCTION_NGINX_GLOBAL_SELECTOR_SCOPE")
    return port

def production_http_identity(origin,build):
    version=parse(http(origin,"/api/deployment-version"),8192).get("buildVersion")
    need(type(version)is str and version not in ("","unknown","development"),"PRODUCTION_HTTP_VERSION_UNKNOWN")
    path="/_next/static/"+build+"/_buildManifest.js";data=http(origin,path,limit=65536)
    need(bool(data),"PRODUCTION_STATIC_EMPTY")
    return {"build_version":version,"asset":{"path":path,"bytes":len(data),"sha256":digest(data)}}

def production_verified_https(surface,expected):
    need(surface in ("origin","public"),"PRODUCTION_G_HTTPS_SURFACE")
    evidence=[];data_rows=[]
    for path,maximum in (("/api/deployment-version",8192),(expected["asset"]["path"],65536)):
        context=ssl.create_default_context();need(context.check_hostname and context.verify_mode==ssl.CERT_REQUIRED,"PRODUCTION_G_TLS_VERIFICATION")
        conn=production_http_client.HTTPSConnection("aoe2war.com",443,timeout=5,context=context)
        try:
            if surface=="origin":
                raw=socket.create_connection(("127.0.0.1",443),5)
                try:conn.sock=context.wrap_socket(raw,server_hostname="aoe2war.com")
                except BaseException:raw.close();raise
            conn.request("GET",path,headers={"Host":"aoe2war.com","Cache-Control":"no-cache","Connection":"close","User-Agent":"aoe2war-g-app-production/1"})
            peer=conn.sock.getpeername()[:2];reply=conn.getresponse()
            need(reply.status==200,"PRODUCTION_G_HTTPS_STATUS")
            if surface=="public":need(peer[0] not in ("127.0.0.1","::1") and (reply.getheader("server") or "").lower()=="cloudflare" and
                re.fullmatch(r"[A-Za-z0-9-]{1,128}",reply.getheader("cf-ray") or ""),"PRODUCTION_G_REAL_CLOUDFLARE_PROVENANCE")
            data=reply.read(maximum+1);need(0<len(data)<=maximum,"PRODUCTION_G_HTTPS_RESPONSE_BOUND");data_rows.append(data)
            evidence.append({"surface":surface,"url":PUBLIC+path,"host":"aoe2war.com","tls_server_name":"aoe2war.com","peer":list(peer),
                "fresh_verified_connection":True,"redirects_followed":False,"status":reply.status,
                "server":reply.getheader("server"),"cf_ray":reply.getheader("cf-ray"),"cf_cache_status":reply.getheader("cf-cache-status")})
        finally:conn.close()
    need(parse(data_rows[0],8192).get("buildVersion")==expected["build_version"] and len(data_rows[1])==expected["asset"]["bytes"] and
         digest(data_rows[1])==expected["asset"]["sha256"],"PRODUCTION_G_HTTPS_BUILD_STATIC_DISAGREEMENT")
    return {"identity":expected,"requests":evidence,"http_methods_sent":"GET_ONLY"}

PRODUCTION_ROUTE_PROBES=(("players-by-name","/players/by-name/Emaren"),("presence-events","/api/kingdom-presence/events"),
    ("api","/api/deployment-version"),("exact-root","/"),("watcher-download","/download/watcher/windows-installer"),("web-fallback","/kingdom-index"))

def production_route_heads(surface,identity=None):
    need(surface in ("old-loopback","candidate-loopback","origin","public"),"PRODUCTION_G_ROUTE_SURFACE")
    rows=[]
    for selector,path in PRODUCTION_ROUTE_PROBES:
        if surface.endswith("loopback"):
            conn=production_http_client.HTTPConnection("127.0.0.1",3030 if surface=="old-loopback" else 3032,timeout=5)
        else:
            context=ssl.create_default_context();need(context.check_hostname and context.verify_mode==ssl.CERT_REQUIRED,"PRODUCTION_G_ROUTE_TLS")
            conn=production_http_client.HTTPSConnection("aoe2war.com",443,timeout=5,context=context)
            if surface=="origin":
                raw=socket.create_connection(("127.0.0.1",443),5)
                try:conn.sock=context.wrap_socket(raw,server_hostname="aoe2war.com")
                except BaseException:raw.close();raise
        try:
            conn.request("HEAD",path,headers={"Host":"aoe2war.com","Cache-Control":"no-cache","Connection":"close","User-Agent":"aoe2war-g-six-selectors/1"})
            peer=conn.sock.getpeername()[:2];reply=conn.getresponse()
            need(reply.status in (200,204,301,302,307,308,400,401,403,404,405),"PRODUCTION_G_SELECTOR_HTTP_FAILURE:"+selector)
            if selector in ("api","exact-root","watcher-download","web-fallback"):
                need(reply.status==200,"PRODUCTION_G_REQUIRED_ROUTE_NOT_200:"+selector)
            if surface=="public":need(peer[0] not in ("127.0.0.1","::1") and (reply.getheader("server") or "").lower()=="cloudflare" and
                re.fullmatch(r"[A-Za-z0-9-]{1,128}",reply.getheader("cf-ray") or ""),"PRODUCTION_G_SELECTOR_CLOUDFLARE_PROVENANCE")
            source=reply.getheader("x-aoe2war-source");build=reply.getheader("x-aoe2war-build-id");pid=reply.getheader("x-aoe2war-process")
            if identity is not None:need(source==identity["source_sha"] and build==identity["build_id"] and pid==str(identity["candidate_pid"]),
                "PRODUCTION_G_SELECTOR_NOT_EXACT_CANDIDATE:"+selector)
            length=reply.getheader("content-length")
            if selector=="watcher-download":need(length is not None and length.isdecimal() and 0<int(length)<=536870912 and
                (reply.getheader("content-type") or "").split(";",1)[0]=="application/octet-stream","PRODUCTION_G_WATCHER_BINARY_HEAD_REQUIRED")
            # HEAD only: do not read a large binary or open a presence stream.
            rows.append({"selector":selector,"path":path,"method":"HEAD","status":reply.status,"content_type":reply.getheader("content-type"),
                "content_length":length,"source_sha":source,"build_id":build,"process_pid":pid,
                "candidate_identity_proven":identity is not None,"fresh_connection":True,"redirects_followed":False})
        finally:conn.close()
    return rows

def production_native_snapshot(phase,nonce,controller_source_sha):
    need(sys.platform=="linux" and os.geteuid()==0 and socket.gethostname().split(".")[0]==HOST,"PRODUCTION_G_EXACT_HOST")
    need(phase in ("before","after","rollback") and NONCE.fullmatch(nonce or ""),"PRODUCTION_G_PHASE_NONCE")
    need(H40.fullmatch(controller_source_sha or ""),"PRODUCTION_G_CONTROLLER_SOURCE_REQUIRED")
    policy,policy_sha,witness=production_profile()
    state=stable_system_state_during_timer_quiescence()
    protected={name:value for name,value in state.items() if name not in PRODUCTION_OWNED_UNITS}
    need(protected[OLD_UNIT]["properties"]["MainPID"]=="2625090" and protected[NEW_UNIT]["properties"]["MainPID"]=="1483304",
         "PRODUCTION_ORIGINAL_OR_PREVIEW_PID_DRIFT")
    ports={str(port):listening_socket(port) for port in (3030,3031,3032,8092,8093)}
    need(ports["3030"]["pid"]==2625090 and ports["3031"]["pid"]==1483304 and ports["3032"]["pid"]==witness.get("candidate_pid") and
         ports["3032"]["uid"]==990,"PRODUCTION_LISTENER_IDENTITY")
    old_build=(OLD_REPO/".next/BUILD_ID").read_text().strip();need(BUILD.fullmatch(old_build),"PRODUCTION_OLD_BUILD_ID")
    old=production_http_identity("http://127.0.0.1:3030",old_build)
    candidate=production_http_identity("http://127.0.0.1:3032",policy["build_id"])
    need(candidate["build_version"]==policy["build_version"] and candidate["build_version"]!=old["build_version"],"PRODUCTION_HTTP_CANDIDATE_BUILD")
    stage=pathlib.Path(policy["stage"])
    asset=production_root_file(stage/".next"/candidate["asset"]["path"].removeprefix("/_next/"),65536)
    need(digest(asset)==candidate["asset"]["sha256"],"PRODUCTION_RUNTIME_STATIC_NOT_SEALED_ARTIFACT")
    nginx=production_root_file(PRODUCTION_VHOST);port=production_loaded_nginx(nginx)
    need(port==(3032 if phase=="after" else 3030),"PRODUCTION_G_UNEXPECTED_PUBLIC_SELECTOR")
    selected=candidate if phase=="after" else old
    origin_proof=production_verified_https("origin",selected)
    identity={"source_sha":policy["source_sha"],"build_id":policy["build_id"],"candidate_pid":witness["candidate_pid"]}
    local_heads={"old":production_route_heads("old-loopback"),"candidate":production_route_heads("candidate-loopback",identity)}
    origin_heads=production_route_heads("origin",identity if phase=="after" else None)
    # This compact receipt retains hashes of all native rows; no credentials or
    # raw financial state is serialized, and F can bind its exact fresh bytes.
    return {"schema":"aoe2war.g.app-production.v1","phase":phase,"nonce":nonce,"host":HOST,
       "source_sha":policy["source_sha"],"controller_source_sha":controller_source_sha,
       "build_id":policy["build_id"],"build_version":policy["build_version"],
       "observed_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"profile_sha256":policy_sha,"manifest_sha256":policy["manifest_sha256"],
       "native_admission_sha256":witness.get("admission_sha256"),
       "candidate_pid":witness["candidate_pid"],"candidate_start_ticks":witness["candidate_start_ticks"],
       "protected_units_sha256":digest(canon(protected)),"ports":ports,"release_lock":lock_state(),
       "nginx":{"sha256":digest(nginx),"upstream_port":port,"selectors":6},
       "old_http":old,"candidate_http":candidate,"origin_https":origin_proof,"local_route_heads":local_heads,"origin_route_heads":origin_heads,"http_methods_sent":"GET_HEAD_ONLY",
       "financial_authorized":False,"authenticated_browser_roles_verified":False,
       "proof":"SEPARATE_NATIVE_G_OBSERVATION_NOT_HUMAN_REVIEW"}

def production_compare(before,after):
    need(before.get("schema")==after.get("schema")=="aoe2war.g.app-production.v1" and before.get("phase")=="before", "PRODUCTION_G_BEFORE_SCHEMA")
    production_same_runtime(before,after)

def production_same_runtime(before,after):
    for key in ("nonce","source_sha","controller_source_sha","build_id","build_version","profile_sha256","manifest_sha256","native_admission_sha256",
                "candidate_pid","candidate_start_ticks","protected_units_sha256","ports","release_lock","old_http","candidate_http","local_route_heads"):
        need(before.get(key)==after.get(key),"PRODUCTION_G_CONTINUITY_DRIFT:"+key)

def production_main(argv):
    a=argparse.ArgumentParser();a.add_argument("--production-remote",choices=("before","after","rollback"));a.add_argument("--production-phase",choices=("before","after","rollback"))
    a.add_argument("--nonce",required=True);a.add_argument("--ssh-target");a.add_argument("--before",type=pathlib.Path);a.add_argument("--before-sha256")
    a.add_argument("--controller-source-sha",required=True)
    x=a.parse_args(argv)
    need(NONCE.fullmatch(x.nonce) and H40.fullmatch(x.controller_source_sha),"PRODUCTION_G_EXACT_NONCE_AND_CONTROLLER")
    if x.production_remote:
        need(not x.production_phase and not x.ssh_target and not x.before,"PRODUCTION_G_REMOTE_ARGS")
        return production_native_snapshot(x.production_remote,x.nonce,x.controller_source_sha)
    need(x.production_phase and x.ssh_target=="root@hel1","PRODUCTION_G_LOCAL_ARGS")
    source=pathlib.Path(__file__).read_bytes()
    result=run(["/usr/bin/ssh","-T","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=8",x.ssh_target,
        "/usr/bin/python3","-I","-B","-","--production-remote",x.production_phase,"--nonce",x.nonce,
        "--controller-source-sha",x.controller_source_sha],timeout=180,stdin=source)
    snapshot=parse(result,131072)
    if x.production_phase!="before":
        need(x.before and H64.fullmatch(x.before_sha256 or ""),"PRODUCTION_G_EXACT_BEFORE_REQUIRED")
        raw=x.before.read_bytes();need(digest(raw)==x.before_sha256,"PRODUCTION_G_BEFORE_PIN")
        production_compare(parse(raw,131072),snapshot)
    chosen=snapshot["candidate_http"] if x.production_phase=="after" else snapshot["old_http"]
    proof=production_verified_https("public",chosen)
    identity={"source_sha":snapshot["source_sha"],"build_id":snapshot["build_id"],"candidate_pid":snapshot["candidate_pid"]} if x.production_phase=="after" else None
    route_proof=production_route_heads("public",identity)
    repeat=parse(run(["/usr/bin/ssh","-T","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=8",x.ssh_target,
        "/usr/bin/python3","-I","-B","-","--production-remote",x.production_phase,"--nonce",x.nonce,
        "--controller-source-sha",x.controller_source_sha],timeout=180,stdin=source),131072)
    production_same_runtime(snapshot,repeat)
    need(snapshot["nginx"]==repeat["nginx"] and snapshot["phase"]==repeat["phase"],"PRODUCTION_G_NATIVE_DRIFT_DURING_MAC_PUBLIC_PROBE")
    snapshot["mac_public"]=proof["identity"];snapshot["mac_https"]=proof;snapshot["mac_route_heads"]=route_proof;snapshot["status"]="PRODUCTION_G_"+x.production_phase.upper()+"_PASS_PENDING_REAL_AUTHENTICATED_BROWSER"
    return snapshot

def main():
    global TRANSACTION_NONCE
    if any(x.startswith("--production-") for x in sys.argv[1:]):
        try:
            print(json.dumps(production_main(sys.argv[1:]),sort_keys=True,separators=(",",":")));return 0
        except (Hold,KeyError,ValueError,TypeError,OSError,subprocess.SubprocessError) as error:
            print("HOLD:G_APP_PRODUCTION:"+(str(error) if isinstance(error,Hold) else type(error).__name__),file=sys.stderr);return 2
    a=argparse.ArgumentParser()
    a.add_argument("--remote",choices=("before","after","rollback"))
    a.add_argument("--phase",choices=("before","after","rollback"))
    a.add_argument("--ssh-target")
    a.add_argument("--before",type=pathlib.Path)
    a.add_argument("--before-sha256")
    a.add_argument("--after",type=pathlib.Path)
    a.add_argument("--after-sha256")
    a.add_argument("--transaction-nonce")
    x=a.parse_args()
    try:
        if x.transaction_nonce is not None:
            need(NONCE.fullmatch(x.transaction_nonce) and (x.remote or x.phase)in("after","rollback"),
                 "EXPLICIT_NEW_TRANSACTION_AFTER_OR_ROLLBACK_ONLY")
            TRANSACTION_NONCE=x.transaction_nonce
        if x.remote:
            need(not x.phase and not x.ssh_target and not x.before,"REMOTE_ARG_COLLISION")
            result=root_snapshot(x.remote)
        else:
            need(x.phase and x.ssh_target,"LOCAL_SSH_AND_PHASE_REQUIRED")
            snapshot=ssh_snapshot(x.ssh_target,x.phase)
            if x.phase=="before":
                need(snapshot["nginx"]["upstream_port"]==3030,"PUBLIC_NOT_YET_AT_3030")
                snapshot["public_before"]=public_check(snapshot)
                recheck=ssh_snapshot(x.ssh_target,"before")
                compare_process_and_finance(snapshot,recheck)
                need(snapshot["nginx"]==recheck["nginx"] and
                     snapshot["release_journal"]==recheck["release_journal"],
                     "PUBLIC_OLD_UPSTREAM_DRIFT_DURING_BEFORE")
                result=snapshot
            else:
                need(x.before and x.before_sha256 and H64.fullmatch(x.before_sha256),
                     "ORIGINAL_BEFORE_DIGEST_REQUIRED")
                raw=x.before.read_bytes()
                need(digest(raw)==x.before_sha256,"OWNER_BEFORE_RECEIPT_SHA256_DRIFT")
                if TRANSACTION_NONCE is not None:
                    need(x.before_sha256==A04_BEFORE_SHA256,"ORIGINAL_A04_BEFORE_MUST_BE_REUSED")
                before=parse(raw)
                if x.phase=="rollback":
                    need(x.after and x.after_sha256 and H64.fullmatch(x.after_sha256),
                         "ORIGINAL_AFTER_DIGEST_REQUIRED_FOR_ROLLBACK")
                    after_raw=x.after.read_bytes()
                    need(digest(after_raw)==x.after_sha256,"OWNER_AFTER_RECEIPT_SHA256_DRIFT")
                    after_snapshot=parse(after_raw)
                    compare_process_and_finance(before,after_snapshot)
                    need(after_snapshot["phase"]=="after" and
                         after_snapshot["nginx"]["upstream_port"]==3031,
                         "PRE_ROLLBACK_AFTER_RECEIPT_INVALID")
                result=verify(before,snapshot,x.phase)
                public=public_check(snapshot)
                result["public"]=public
                repeat=ssh_snapshot(x.ssh_target,x.phase)
                compare_process_and_finance(snapshot,repeat)
                need(repeat["nginx"]==snapshot["nginx"] and
                     repeat["release_journal"]==snapshot["release_journal"],
                     "NGINX_OR_ROOT_JOURNAL_CHANGED_DURING_PUBLIC_PROBE")
        print(json.dumps(result,sort_keys=True,separators=(",",":")))
        return 0
    except (Hold,KeyError,ValueError,TypeError,IndexError,StopIteration,
            OSError,subprocess.TimeoutExpired) as e:
        print("HOLD:G_R25_PARALLEL_POSTFLIGHT:"+
              (str(e) if isinstance(e,Hold) else type(e).__name__),file=sys.stderr)
        return 2
if __name__=="__main__":raise SystemExit(main())
