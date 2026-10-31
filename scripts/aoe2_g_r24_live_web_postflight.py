#!/usr/bin/env python3
"""R24 G authenticated, read-only HEL1 website witness. Mac controller; no install.

before: python3 script --ssh-target root@<owner-reviewed-HEL1-alias> --phase before > before.json
after:  python3 script --ssh-target root@<same-alias> --phase after --before before.json \
           --rollback-path /mnt/HC_Volume_105319120/aoe2war/rollbacks/activate-<real-receipt-id>
The root SSH key/known_hosts must be independently verified by the owner/F.
No ssh host-key bypass, privilege elevation, database operation or write on HEL1.
"""
from __future__ import annotations
import argparse, hashlib, html, json, os, pathlib, re, socket, stat, subprocess, sys
from urllib.request import Request, build_opener, HTTPRedirectHandler

TARGET="0cee3c836c4b0760478280c145e02e81e470ce0e"
HOST="ubuntu-4gb-hel1-11"
REPO=pathlib.Path("/var/www/AoE2HDBets/app-prodn")
DURABLE=pathlib.Path("/mnt/HC_Volume_105319120/aoe2war/rollbacks")
LOCK=pathlib.Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
EXPECTED_LOCK=(2064,6185747,1000,0o644)
PORTS=(8092,8093)
PAGES=("/", "/lobby", "/bets", "/live-games", "/war-chest")
PREFIXES=("aoe2","wolo","tokenchain","traffic","radio")
HEX40=re.compile(r"[0-9a-f]{40}\Z")
BUILD=re.compile(r"[A-Za-z0-9_-]{10,128}\Z")
ASSET=re.compile(r'(?:(?:src|href)=["\x27])(/_next/static/[A-Za-z0-9_./-]+\.(?:js|css))(?:["\x27])')
class Hold(Exception): pass
def need(ok,why):
    if not ok:raise Hold(why)
def sha(data):return hashlib.sha256(data).hexdigest()
def unique(pairs):
    obj={}
    for k,v in pairs:
        need(k not in obj,"DUPLICATE_JSON_KEY")
        obj[k]=v
    return obj
def parsed(raw):
    need(len(raw)<=1024*1024,"REPORT_TOO_LARGE")
    return json.loads(raw,object_pairs_hook=unique,
                      parse_constant=lambda _:(_ for _ in ()).throw(Hold("INVALID_JSON_NUMBER")))
def run(argv,*,timeout=12,input=None):
    p=subprocess.run(argv,input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    need(p.returncode==0,"COMMAND_FAILED:"+pathlib.Path(argv[0]).name)
    return p.stdout
def proc_start(pid):
    raw=(pathlib.Path("/proc")/str(pid)/"stat").read_text()
    end=raw.rfind(")")
    need(end>0,"PROC_STAT_MALFORMED")
    parts=raw[end+2:].split()
    need(len(parts)>19,"PROC_STAT_TRUNCATED")
    return int(parts[19])
def identity(pid,port=None):
    need(type(pid)is int and pid>1,"INVALID_PID")
    base=pathlib.Path("/proc")/str(pid)
    start=proc_start(pid)
    uid=int(next(v for v in (base/"status").read_text().splitlines() if v.startswith("Uid:")).split()[1])
    cgroup=sha((base/"cgroup").read_bytes())
    # Hash the actual executable bytes; no command-line or environment is returned.
    h=hashlib.sha256()
    with (base/"exe").open("rb") as fd:
        while True:
            b=fd.read(1024*1024)
            if not b:break
            h.update(b)
    executable=h.hexdigest()
    result={"pid":pid,"start_ticks":start,"uid":uid,"cgroup_sha256":cgroup,
            "executable_sha256":executable}
    if port is not None:
        inodes=[]
        for family in ("tcp","tcp6"):
            raw=(pathlib.Path("/proc/net")/family).read_text().splitlines()
            need(raw and "local_address" in raw[0],"TCP_HEADER_MISSING")
            for line in raw[1:]:
                f=line.split()
                need(len(f)>=10,"TCP_ROW_MALFORMED")
                if f[3]=="0A" and int(f[1].rsplit(":",1)[1],16)==port:
                    need(f[9].isdecimal() and int(f[9])>0,"LISTENER_BAD_INODE")
                    inodes.append(f[9])
        need(len(inodes)==1,"PORT_NOT_EXACTLY_ONE_LISTENER:"+str(port))
        inode=inodes[0]
        matches=0
        for i,fd in enumerate((base/"fd").iterdir()):
            need(i<8192,"TOO_MANY_PROCESS_DESCRIPTORS")
            try: target=os.readlink(fd)
            except FileNotFoundError:continue
            if target=="socket:["+inode+"]":matches+=1
        need(matches>=1,"SOCKET_NOT_OWNED_BY_SIGNED_PROCESS:"+str(port))
        result["socket_inode_sha256"]=sha(inode.encode())
        result["port"]=port
    need(proc_start(pid)==start,"PID_REUSED_DURING_CAPTURE")
    return result
def listener_pid(port):
    """Find socket owner in /proc. Exactly one PID may own each protected LISTEN inode."""
    inodes=[]
    for family in ("tcp","tcp6"):
        lines=(pathlib.Path("/proc/net")/family).read_text().splitlines()
        for line in lines[1:]:
            a=line.split()
            need(len(a)>=10,"TCP_ROW_MALFORMED")
            if a[3]=="0A" and int(a[1].rsplit(":",1)[1],16)==port:
                inodes.append(a[9])
    need(len(inodes)==1 and inodes[0].isdigit() and int(inodes[0])>0,
         "UNIQUE_LISTENER_NOT_MEASURED:"+str(port))
    match=set()
    needle="socket:["+inodes[0]+"]"
    for p in pathlib.Path("/proc").iterdir():
        if not p.name.isdecimal():continue
        fd_dir=p/"fd"
        try: fds=list(fd_dir.iterdir())
        except (FileNotFoundError,PermissionError,ProcessLookupError):continue
        for fd in fds[:8192]:
            try:
                if os.readlink(fd)==needle:match.add(int(p.name));break
            except (FileNotFoundError,PermissionError,ProcessLookupError):continue
    need(len(match)==1,"SOCKET_TO_ONE_PID_UNKNOWN:"+str(port))
    return next(iter(match))
def units():
    listing=run(["/usr/bin/systemctl","list-unit-files","--all","--type=service",
                 "--type=timer","--no-pager","--no-legend"],timeout=15).decode()
    names=sorted(set(s.split()[0] for s in listing.splitlines()
                     if s.split() and s.split()[0].lower().startswith(PREFIXES)
                     and s.split()[0].endswith((".service",".timer"))))
    need(25<=len(names)<=200,"FINANCIAL_UNIT_INVENTORY_UNKNOWN")
    out={}
    for name in names:
        raw=run(["/usr/bin/systemctl","show",name,"--no-pager","--property",
                 "Id,ActiveState,MainPID,UnitFileState,FragmentPath"],timeout=6).decode()
        pairs={}
        for line in raw.splitlines():
            k,sep,v=line.partition("=")
            need(sep and k not in pairs,"UNIT_SHOW_MALFORMED")
            pairs[k]=v
        need(pairs.get("Id")==name and "ActiveState" in pairs and
             "MainPID" in pairs and "UnitFileState" in pairs,"UNIT_IDENTITY_MISSING")
        # unit and drop-in configuration hash; do not disclose possible secrets.
        config=run(["/usr/bin/systemctl","cat",name,"--no-pager"],timeout=6)
        out[name]={"active":pairs["ActiveState"],"main_pid":int(pairs["MainPID"]),
                   "unit_file_state":pairs["UnitFileState"],"config_sha256":sha(config)}
    need("aoe2hdbets-web.service" in out,"WEB_UNIT_MISSING")
    return out
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
def get(url,method="GET",limit=2*1024*1024):
    req=Request(url,method=method,headers={"Cache-Control":"no-cache",
         "User-Agent":"aoe2war-g-r24-readonly-witness"})
    with build_opener(NoRedirect).open(req,timeout=9) as result:
        need(result.status==200,"HTTP_STATUS_NOT_200:"+url)
        data=result.read(limit+1) if method=="GET" else b""
        need(len(data)<=limit,"HTTP_BODY_TOO_LARGE")
        return {"status":result.status,"body":data,"cache":result.headers.get("Cache-Control","")}
def local_http():
    origin="http://127.0.0.1:3030"
    version=get(origin+"/api/deployment-version")
    doc=parsed(version["body"])
    value=doc.get("buildVersion")
    need(type(value)is str and value not in ("","unknown","development"),"LOCAL_APP_VERSION_UNKNOWN")
    result={}
    for page in PAGES:
        html_body=get(origin+page)["body"]
        head=get(origin+page,"HEAD")
        need(head["status"]==200 and bool(html_body),"LOCAL_GET_OR_HEAD_HOLD:"+page)
        result[page]={"get":200,"head":200}
    html_root=get(origin+"/")["body"].decode("utf8","strict")
    assets=sorted(set(ASSET.findall(html.unescape(html_root))))
    need(bool(assets),"LOCAL_NEXT_ASSETS_NOT_EXPOSED")
    asset=assets[0]
    file=(REPO/".next"/asset[len("/_next/"):]).resolve(strict=True)
    need(file.is_file() and file.is_relative_to((REPO/".next/static").resolve(strict=True)),
         "ASSET_NOT_ACTIVE_NEXT_STATIC")
    bytes_=file.read_bytes()
    need(0<len(bytes_)<=2*1024*1024,"ASSET_UNBOUNDED")
    need(sha(get(origin+asset)["body"])==sha(bytes_),"LOCAL_ASSET_DIFFERS_FROM_ACTIVE_BUILD")
    return {"build_version":value,"routes":result,"asset":asset,"asset_sha256":sha(bytes_)}
def lock_identity():
    st=LOCK.lstat()
    need(stat.S_ISREG(st.st_mode) and not stat.S_ISLNK(st.st_mode),
         "RELEASE_LOCK_NOT_REGULAR")
    value=(st.st_dev,st.st_ino,st.st_uid,stat.S_IMODE(st.st_mode))
    need(value==EXPECTED_LOCK,"ORIGINAL_RELEASE_LOCK_IDENTITY_DRIFT")
    return {"device":st.st_dev,"inode":st.st_ino,"uid":st.st_uid,
            "mode":oct(stat.S_IMODE(st.st_mode))}
def rollback(path):
    p=pathlib.Path(path)
    need(p.is_absolute() and p.parent==DURABLE and p.name.startswith("activate-"),
         "ROLLBACK_NOT_CANONICAL")
    for x in (p,p/"next",p/"node_modules"):
        st=x.lstat()
        need(stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode),
             "ROLLBACK_DIRECTORY_MISSING_OR_LINKED")
    for name in ("next/BUILD_ID","source-sha","build-version"):
        node=p/name
        need(node.is_file() and not node.is_symlink() and
             node.stat().st_size<=256,"ROLLBACK_MARKER_MISSING_OR_LINKED:"+name)
    build=(p/"next/BUILD_ID").read_text().strip()
    source=(p/"source-sha").read_text().strip()
    version=(p/"build-version").read_text().strip()
    need(bool(BUILD.fullmatch(build)) and bool(HEX40.fullmatch(source)) and version,
         "ROLLBACK_LINEAGE_MISSING")
    need(any((p/"node_modules").iterdir()),"ROLLBACK_DEPENDENCIES_EMPTY")
    return {"path":str(p),"previous_build_id":build,"previous_source_sha":source,
            "previous_build_version":version,"dependencies_present":True,
            "fully_restore_tested":False}
def remote_observe(rollback_path):
    need(sys.platform=="linux" and socket.gethostname().split(".")[0]==HOST and
         os.geteuid()==0,"NOT_VERIFIED_ROOT_HEL1")
    source=run(["/usr/bin/git","-C",str(REPO),"rev-parse","HEAD"]).decode().strip()
    need(bool(HEX40.fullmatch(source)),"LIVE_GIT_SHA_INVALID")
    dirty=run(["/usr/bin/git","-C",str(REPO),"status","--porcelain","--untracked-files=no"]).strip()
    need(not dirty,"LIVE_TRACKED_SOURCE_DIRTY")
    build_file=REPO/".next/BUILD_ID"
    need(not build_file.is_symlink(),"LIVE_BUILD_ID_SYMLINK")
    build=build_file.read_text().strip()
    need(bool(BUILD.fullmatch(build)),"LIVE_NEXT_BUILD_ID_INVALID")
    names=units()
    service=names["aoe2hdbets-web.service"]
    need(service["active"]=="active" and service["main_pid"]>1,"WEB_SERVICE_NOT_ACTIVE")
    web=identity(service["main_pid"])
    sockets={str(port):identity(listener_pid(port),port) for port in PORTS}
    internal=local_http()
    return {"schema":"aoe2war.g.r24.host-snapshot.v1","host":HOST,
            "original_release_lock":lock_identity(),
            "source_sha":source,"next_build_id":build,"web":web,"units":names,
            "protected_listeners":sockets,"internal":internal,
            "rollback":rollback(rollback_path) if rollback_path else None,
            "authority":"ROOT_SSH_HOST_AUTHENTICATED_NOT_SIGNED_FINANCIAL_AUDIT"}
def ssh_observe(target,rollback_path):
    need(target.startswith("root@") and len(target)<190 and
         re.fullmatch(r"root@[A-Za-z0-9._-]+",target),"ROOT_SSH_TARGET_INVALID")
    args=["/usr/bin/ssh","-T","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes",
          "-o","ConnectTimeout=8",target,
          "/usr/bin/python3","-I","-B","-","--remote"]
    if rollback_path:args+=["--rollback-path",rollback_path]
    b=pathlib.Path(__file__).read_bytes()
    return parsed(run(args,input=b,timeout=90))
def compare_financial(before,after):
    a,b=before["units"],after["units"]
    need(set(a)==set(b),"PROTECTED_UNIT_SET_CHANGED")
    for name in sorted(a):
        if name=="aoe2hdbets-web.service":continue
        need(a[name]==b[name],"FINANCIAL_OR_OTHER_UNIT_DRIFT:"+name)
    for port in ("8092","8093"):
        need(before["protected_listeners"][port]==after["protected_listeners"][port],
             "WOLO_LISTENER_PROCESS_OR_SOCKET_CHANGED:"+port)
def public_check(after,origin):
    need(origin=="https://aoe2war.com","PUBLIC_ORIGIN_NOT_PINNED")
    value=parsed(get(origin+"/api/deployment-version")["body"]).get("buildVersion")
    need(value==after["internal"]["build_version"],"PUBLIC_APP_VERSION_NOT_ACTIVE_RUNTIME")
    paths={}
    for p in PAGES:
        page=get(origin+p)
        head=get(origin+p,"HEAD")
        need(head["status"]==200,"PUBLIC_HEAD_HOLD:"+p)
        paths[p]={"get":page["status"],"head":head["status"]}
    root_page=get(origin+"/")["body"].decode("utf8","strict")
    assets=set(ASSET.findall(html.unescape(root_page)))
    asset=after["internal"]["asset"]
    need(asset in assets,"PUBLIC_HTML_NOT_ACTIVE_STATIC_ASSET")
    need(sha(get(origin+asset)["body"])==after["internal"]["asset_sha256"],
         "PUBLIC_ASSET_BYTES_NOT_ACTIVE_BUILD")
    # Build ID is a private Next runtime value; asset equality binds public
    # bytes to the live runtime, without inventing an exposed public BUILD_ID.
    return {"routes":paths,"app_build_version":value,
            "active_asset":asset,"asset_sha256":after["internal"]["asset_sha256"],
            "public_bytes_bound_to_active_build":True,
            "public_next_build_id_directly_exposed":False}
def verify(before,after,origin):
    need(before.get("schema")==after.get("schema")=="aoe2war.g.r24.host-snapshot.v1"
         and before.get("host")==after.get("host")==HOST,"SNAPSHOT_HOST_MISMATCH")
    need(before["source_sha"]!=TARGET and after["source_sha"]==TARGET,"NOT_NEW_WEBSITE_LIVE")
    need(before["next_build_id"]!=after["next_build_id"],"NEXT_BUILD_NOT_CHANGED")
    need(before.get("original_release_lock")==after.get("original_release_lock") and
         after.get("original_release_lock",{}).get("inode")==EXPECTED_LOCK[1],
         "RELEASE_LOCK_REPLACED")
    need((before["web"]["pid"],before["web"]["start_ticks"]) !=
         (after["web"]["pid"],after["web"]["start_ticks"]),
         "WEB_MAINPID_NOT_RESTARTED_FOR_NEW_BUILD")
    need(after["web"]["pid"]>1,"WEB_PID_NOT_ACTIVE")
    compare_financial(before,after)
    rb=after.get("rollback")
    need(type(rb)is dict and rb.get("previous_source_sha")==before["source_sha"] and
         rb.get("previous_build_id")==before["next_build_id"] and
         rb.get("previous_build_version")==before["internal"]["build_version"] and
         rb.get("dependencies_present")is True,"PREVIOUS_RELEASE_ROLLBACK_MISMATCH")
    public=public_check(after,origin)
    return {"schema":"aoe2war.g.r24.postflight.v1",
            "status":"LIVE_SOURCE_BUILD_HTTP_FINANCE_SOCKET_ROLLBACK_MATERIAL_VERIFIED",
            "live_source_sha":TARGET,"live_next_build_id":after["next_build_id"],
            "web_main_pid":after["web"]["pid"],"previous_source_sha":before["source_sha"],
            "previous_next_build_id":before["next_build_id"],
            "protected_financial_units_checked":len(before["units"])-1,
            "wolo_8092_8093_process_socket_unchanged":True,
            "public":public,"rollback":rb,
            "rollback_execution_tested":False,
            "original_release_lock_preserved":True,
            "public_next_build_id_directly_exposed":False,
            "independent_production_chrome_88_routes":"NOT_RUN",
            "finance_signed_receipt":False,"no_financial_writes_executed_by_witness":True}
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--remote",action="store_true")
    ap.add_argument("--phase",choices=("before","after"))
    ap.add_argument("--ssh-target")
    ap.add_argument("--before",type=pathlib.Path)
    ap.add_argument("--before-sha256")
    ap.add_argument("--rollback-path")
    ap.add_argument("--public-origin",default="https://aoe2war.com")
    x=ap.parse_args()
    try:
        if x.remote:
            need(not x.phase and not x.ssh_target and not x.before,"REMOTE_ARGS_INVALID")
            out=remote_observe(x.rollback_path)
        else:
            need(x.phase and x.ssh_target,"LOCAL_PHASE_AND_SSH_REQUIRED")
            out=ssh_observe(x.ssh_target,x.rollback_path if x.phase=="after" else None)
            if x.phase=="after":
                need(x.before is not None and x.rollback_path,"AFTER_REQUIRES_BEFORE_AND_REAL_ROLLBACK")
                raw_before=x.before.read_bytes()
                need(type(x.before_sha256)is str and
                     re.fullmatch(r"[a-f0-9]{64}",x.before_sha256) and
                     sha(raw_before)==x.before_sha256,"OWNER_BEFORE_RECEIPT_DIGEST_DRIFT")
                before=parsed(raw_before)
                # Measure again after external probes; no forged unchanged PID.
                out=verify(before,out,x.public_origin)
                recheck=ssh_observe(x.ssh_target,x.rollback_path)
                compare_financial(before,recheck)
                need(recheck["source_sha"]==TARGET and
                     recheck["next_build_id"]==out["live_next_build_id"] and
                     recheck["web"]==out["web"] and
                     recheck["rollback"]==out["rollback"],"HOST_DRIFT_DURING_PUBLIC_POSTFLIGHT")
        print(json.dumps(out,sort_keys=True,separators=(",",":")))
        return 0
    except (Hold,OSError,ValueError,KeyError,IndexError,TypeError,StopIteration,
            subprocess.TimeoutExpired) as exc:
        print("R24_G_POSTFLIGHT_HOLD:"+
              (str(exc) if isinstance(exc,Hold) else type(exc).__name__),file=sys.stderr)
        return 2
if __name__=="__main__":raise SystemExit(main())
