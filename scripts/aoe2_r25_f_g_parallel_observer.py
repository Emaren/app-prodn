#!/usr/bin/env python3
"""R25 G: parallel 3030/3031 root-SSH BEFORE/AFTER/ROLLBACK witness.

Root host collector is read-only, delivered over already authenticated SSH stdin.
F controls the single owner-authorized deployment transaction. Never run this
against a candidate lacking B's positive read-only/egress/method admission.
"""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, re, socket, stat, subprocess, sys
from urllib.request import Request, build_opener, HTTPRedirectHandler

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
    expected=dict(base);expected["nonce"]=TRANSACTION_NONCE
    need(approved==expected,"NEW_APPROVAL_MUST_CHANGE_ONLY_NONCE")
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
    context={"nonce":TRANSACTION_NONCE,"base_approved_sha256":digest(base_raw),
             "before_witness_sha256":A04_BEFORE_SHA256,"new_approval_sha256":digest(approved_raw),
             "owner_authorization_body_sha256":digest(body.encode()),
             "source_sha":manifest["source_sha"],"engine_source_sha256":manifest["engine_source_sha256"],
             "owner_source_sha256":manifest["owner_source_sha256"],
             "g_source_sha256":manifest["g_source_sha256"]}
    return approved,context
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
    units=system_state()
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
        result["transaction_scope"]=transaction_scope(raw,parse(raw,16384))[1]
    return result
def ssh_snapshot(target,phase):
    need(re.fullmatch(r"root@[A-Za-z0-9._-]{1,140}",target),"UNREVIEWED_SSH_TARGET")
    payload=pathlib.Path(__file__).read_bytes()
    argv=["/usr/bin/ssh","-T","-o","BatchMode=yes",
          "-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=8",
          target,"/usr/bin/python3","-I","-B","-","--remote",phase]
    if TRANSACTION_NONCE is not None:
        argv.extend(("--transaction-nonce",TRANSACTION_NONCE))
    return parse(run(argv,timeout=380,stdin=payload))
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
    need(before["units"]==after["units"],"ANY_WEB_OR_FINANCIAL_UNIT_CHANGED")
    need(before["ports"]==after["ports"],"ANY_3030_3031_8092_8093_LISTENER_CHANGED")
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
    return result
def main():
    global TRANSACTION_NONCE
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
