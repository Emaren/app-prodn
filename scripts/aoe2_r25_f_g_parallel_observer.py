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
EXPECTED_OLD_PID=2625090
APPROVAL=pathlib.Path("/etc/aoe2war/r24-parallel-web/approved.json")
AUDIT=pathlib.Path("/var/lib/aoe2war-r24-parallel")
LOCK=pathlib.Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
LOCK_ID=(2064,6185747,1000,0o644)
PUBLIC="https://aoe2war.com"
PAGES=("/","/lobby","/bets","/live-games","/war-chest")
FINANCE_PREFIXES=("aoe2","wolo","tokenchain","traffic","radio")
H40=re.compile(r"[a-f0-9]{40}\Z")
H64=re.compile(r"[a-f0-9]{64}\Z")
BUILD=re.compile(r"[A-Za-z0-9_-]{8,128}\Z")
NONCE=re.compile(r"[a-f0-9]{32}\Z")
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
           "User","WorkingDirectory","ExecStart","FragmentPath","DropInPaths"]
    raw=run(["/usr/bin/systemctl","show",unit,"--no-pager"]+
            [z for x in props for z in ("-p",x)],timeout=12).decode()
    obj={}
    for line in raw.splitlines():
        k,sep,v=line.partition("=")
        need(sep and k not in obj,"SYSTEMD_DUPLICATE_PROPERTY")
        obj[k]=v
    need(set(obj)==set(props) and obj["Id"]==unit and
         obj["MainPID"].isdecimal(),"SYSTEMD_UNIT_PROPERTIES_MISSING")
    result={"properties":obj,"properties_sha256":digest(canon(obj)),
            "unit_config_sha256":digest(run(["/usr/bin/systemctl","cat",unit,
                                               "--no-pager"],timeout=12))}
    if int(obj["MainPID"])>1:
        result["main_process"]=proc_identity(int(obj["MainPID"]))
    else:
        result["main_process"]=None
    return result
def finance_units():
    raw=run(["/usr/bin/systemctl","list-unit-files","--type=service","--type=timer",
             "--type=socket","--all","--no-legend","--no-pager"],timeout=18).decode()
    names=sorted(set(row.split()[0] for row in raw.splitlines() if row.split()
                     and row.split()[0].lower().startswith(FINANCE_PREFIXES)
                     and row.split()[0].endswith((".service",".timer",".socket"))))
    need(25<=len(names)<=200 and OLD_UNIT in names and NEW_UNIT in names,
         "ORIGINAL_FINANCIAL_UNIT_SET_NOT_COMPLETE")
    return names
def system_state():
    names=finance_units()
    return {name:show(name) for name in names}
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
        need(http(origin,p), "HTTP_PAGE_EMPTY:"+p)
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
    x=parse(root_file(APPROVAL,16384),16384)
    need(x.get("schema")=="aoe2war.r24.rootssh.parallel-web-nginx.v1" and
         x.get("candidate_sha")==TARGET and
         isinstance(x.get("nginx_config"),str) and
         x["nginx_config"].startswith("/etc/nginx/") and
         isinstance(x.get("nonce"),str) and NONCE.fullmatch(x["nonce"]),
         "F_ROOT_SCOPE_MISSING_OR_INCOMPLETE")
    return x
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

def verified_c_archive_source():
    """C's Git archive has NO .git: trust exact pinned archive + source manifests."""
    protected_c_stage_boundary()
    source=parse(root_file(C_AUDIT/"SOURCE_STAGED.json",65536),65536)
    built=parse(root_file(C_AUDIT/"BUILD_STAGED.json",65536),65536)
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
    # The archived Git object hash was independently authenticated during owner
    # transfer. Byte-level readback of all files is checked against C's receipt.
    for row in builtfiles["rows"]:
        need(type(row)is dict and type(row.get("path"))is str,
             "C_TREE_ROW_INVALID")
        target=(STAGE/row["path"]).resolve()
        need(target.is_relative_to(STAGE.resolve()) and target.exists(),
             "C_TREE_ROW_ESCAPE_OR_MISSING")
        if row.get("type")=="file":
            need(type(row.get("size"))is int and type(row.get("sha256"))is str,
                 "C_TREE_FILE_ROW_INVALID")
            st=target.stat()
            need(st.st_size==row["size"] and root_sealed_file(target),
                 "C_ROOT_SEALED_TREE_FILE_DRIFT")
            h=hashlib.sha256()
            with target.open("rb") as src:
                for block in iter(lambda:src.read(1048576),b""):h.update(block)
            need(h.hexdigest()==row["sha256"],"C_BUILT_FILE_BYTES_CHANGED")
        elif row.get("type")=="symlink":
            node=STAGE/row["path"]
            need(node.is_symlink() and os.readlink(node)==row.get("target") and
                 node.resolve().is_relative_to(STAGE.resolve()),
                 "C_STAGE_INTERNAL_SYMLINK_CHANGED")
        else:raise Hold("C_UNKNOWN_FILE_TYPE")
    return {"source_git_archive_sha256":ARCHIVE_SHA,
            "source_manifest_sha256":source["source_manifest_sha256"],
            "build_manifest_sha256":built["tree_sha256"],
            "receipt_build_id":built["build_id"],
            "source_receipt_status":"SOURCE_STAGED",
            "build_receipt_status":"BUILD_STAGED",
            "root_manifest_file_count":built.get("files"),
            "git_directory_absent_by_design":True}
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
    deps=bounded_tree(STAGE/"node_modules")
    next_tree=bounded_tree(STAGE/".next")
    return {"source":source,"source_marker":marker,"next_build_id":build,
            "dependencies":deps,"next_build":next_tree,
            "full_dependency_and_build_bytes_measured":True,
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
    need(old_http["app_build_version"]!=new_http["app_build_version"],
         "OLD_AND_NEW_APP_BUILD_VERSION_AMBIGUOUS")
    # Public probe deliberately performed only once on Mac side, not on HEL1 root.
    approved=scope()
    route=nginx_route(approved)
    history=audit(approved,phase)
    return {"schema":"aoe2war.g.r25.parallel-host.v1","phase":phase,"host":HOST,
        "old_source":original,"old_next_build_id":old_build,
        "candidate":candidate,"units":units,"ports":ports,
        "old_http":old_http,"candidate_http":new_http,
        "nginx":route,"release_lock":lock_state(),"release_journal":history,
        "approved_scope_sha256":digest(root_file(APPROVAL,16384)),
        "proof":"ROOT_SSH_MEASURED_NOT_FINANCE_SIGNED"}
def ssh_snapshot(target,phase):
    need(re.fullmatch(r"root@[A-Za-z0-9._-]{1,140}",target),"UNREVIEWED_SSH_TARGET")
    payload=pathlib.Path(__file__).read_bytes()
    argv=["/usr/bin/ssh","-T","-o","BatchMode=yes",
          "-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=8",
          target,"/usr/bin/python3","-I","-B","-","--remote",phase]
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
    return {"schema":"aoe2war.g.r25.postflight.v1","phase":phase,
        "status":"LIVE_PARALLEL_HOST_AND_PUBLIC_MEASURED_REQUIRES_F_STAGE_REVIEW"
                 if phase=="after" else "PUBLIC_3030_NGINX_ONLY_ROLLBACK_MEASURED",
        "frozen_candidate_sha":TARGET,
        "old_web_service_pid_unchanged":True,
        "old_web_source_build_3030_unchanged":True,
        "new_candidate_source_build_dependency_3031_unchanged":True,
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
def main():
    a=argparse.ArgumentParser()
    a.add_argument("--remote",choices=("before","after","rollback"))
    a.add_argument("--phase",choices=("before","after","rollback"))
    a.add_argument("--ssh-target")
    a.add_argument("--before",type=pathlib.Path)
    a.add_argument("--before-sha256")
    a.add_argument("--after",type=pathlib.Path)
    a.add_argument("--after-sha256")
    x=a.parse_args()
    try:
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
