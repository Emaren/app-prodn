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
C_AUDIT=pathlib.Path("/var/lib/aoe2war-r25-c-additive")
C_SOURCE_ARCHIVE=pathlib.Path("/var/lib/aoe2war-r24-source-bundles")/(TARGET+".tar")
C_SOURCE_ARCHIVE_SHA256="c906c75d18ca56871bfdb9fbcdb6173e2c7643ae8f58e5f44735103c530f0101"
B_ROOT_POSTSTART=pathlib.Path("/etc/aoe2war/r24-parallel-web/b-poststart-positive.json")
E_ROOT_RECOVERY=pathlib.Path("/etc/aoe2war/r24-parallel-web/e-recovery-ready.json")
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
        "E_durable_receipt_path",
        "C_source_staged_sha256","C_build_staged_sha256",
        "C_source_files_sha256","C_build_files_sha256",
        "B_poststart_sha256","E_r25_recovery_sha256","lane_reviews"},
        "APPROVAL_EXACT_SCHEMA")
    need(j["schema"]==SCHEMA and j["candidate_sha"]==TARGET and
         type(j["nonce"])==str and NONCE.fullmatch(j["nonce"]),
         "SCOPE_OR_NONCE_INVALID")
    need(type(j["previous_sha"])==str and HEX40.fullmatch(j["previous_sha"]) and
         j["previous_sha"]!=TARGET,"PREVIOUS_SOURCE_IDENTITY")
    for f in ("nginx_before_sha256","finance_snapshot_sha256","wolo_snapshot_sha256",
              "old_web_snapshot_sha256","candidate_web_snapshot_sha256",
              "C_stage_artifact_sha256","E_durable_rollback_sha256",
              "C_source_staged_sha256","C_build_staged_sha256",
              "C_source_files_sha256","C_build_files_sha256",
              "B_poststart_sha256","E_r25_recovery_sha256"):
        need(type(j[f])==str and HEX64.fullmatch(j[f]),"APPROVAL_HASH_MISSING:"+f)
    need(j["E_durable_receipt_path"]==str(E_ROOT_RECOVERY),
         "E_R25_ROOT_SEALED_RECEIPT_PATH_NOT_PINNED")
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
def prove_rollback_preimage(j,s):
    # Deliberately DO NOT require the new candidate service to be alive:
    # an unhealthy/crashed candidate is the primary reason to roll back.
    need("ActiveState=active" in s["original_web"] and
         sha(s["original_web"].encode())==j["old_web_snapshot_sha256"],
         "ROLLBACK_ORIGINAL_FINANCIAL_WEB_PID_DRIFT")
    need(sha(canonical(s["finance"]))==j["finance_snapshot_sha256"],
         "ROLLBACK_FINANCIAL_UNITS_DRIFT")
    need(sha(canonical(listener_lines(s["wolo"])))==j["wolo_snapshot_sha256"],
         "ROLLBACK_WOLO_SOCKET_IDENTITY_DRIFT")
def protected_continuity(s):
    return (s["original_web"],s["finance"],listener_lines(s["wolo"]))
def verified_durable_e_rollback(j):
    """E R25 physical content certificate; it never signs release authority."""
    raw=root_file(E_ROOT_RECOVERY,65536)
    need(sha(raw)==j["E_r25_recovery_sha256"]==
         j["E_durable_rollback_sha256"],
         "E_R25_ROOT_RECEIPT_DIGEST_MISMATCH")
    receipt=parse(raw)
    must={"schema":"aoe2war.e.r25.parallel-website-certificate.v1",
          "host":HOST,"phase":"RECOVERY_READY","source_sha":TARGET,
          "storage_admission":"PASS_E_READONLY_CAPACITY",
          "release_authorized":False,"operations_performed":"READ_ONLY",
          "source_to_build_binding_proved":False,
          "candidate_financial_isolation_proved":False,
          "nginx_or_public_activation_proved":False}
    need(type(receipt)==dict and all(receipt.get(k)==v for k,v in must.items()),
         "E_R25_REAL_READONLY_RECOVERY_CERTIFICATE_MISSING")
    cert_hash=receipt.get("certificate_sha256")
    need(type(cert_hash)==str and HEX64.fullmatch(cert_hash) and
         cert_hash==sha(canonical({k:v for k,v in receipt.items()
                                if k!="certificate_sha256"})),
         "E_R25_SELF_CHECKED_REPORT_DIGEST_WRONG")
    rb=receipt.get("durable_rollback")
    candidate=receipt.get("candidate")
    old=receipt.get("old_web")
    need(type(rb)==dict and rb.get("content_matched") is True and
         rb.get("rollback_exercised") is False and
         rb.get("build_id")==j["previous_build_id"] and
         type(rb.get("old_and_durable_tree_sha256"))==str and
         bool(HEX64.fullmatch(rb["old_and_durable_tree_sha256"])) and
         type(candidate)==dict and candidate.get("build_complete") is True and
         candidate.get("candidate_next_build_id")==j["candidate_build_id"] and
         candidate.get("stage_path")==str(CANDIDATE_STAGE) and
         type(old)==dict and old.get("next_build_id")==j["previous_build_id"],
         "E_R25_REAL_PREVIOUS_BUILD_CONTENT_OR_CANDIDATE_DRIFT")
    durable=pathlib.Path(rb["path"])
    base=pathlib.Path("/mnt/HC_Volume_105319120/aoe2war/rollbacks")
    need(durable.is_relative_to(base) and durable!=base and
         durable.name=="prior-next" and durable.is_dir() and
         not durable.is_symlink() and
         durable.stat().st_dev!= (OLD_APP/".next").stat().st_dev and
         (durable/"BUILD_ID").read_text().strip()==j["previous_build_id"],
         "E_R25_DURABLE_OLD_NEXT_NOT_INDEPENDENT_OR_MISSING")
    # E signed nothing: the independent file digest is authorized by F.
    # Re-computing the whole durable tree remains E's responsibility.
    return True

def verified_b_poststart(j,ss):
    """B's actual root-owned poststart proof of PG, kernel and HTTP guard."""
    raw=root_file(B_ROOT_POSTSTART,65536)
    need(sha(raw)==j["B_poststart_sha256"],
         "B_INDEPENDENT_ROOT_POSTSTART_DIGEST_MISMATCH")
    b=parse(raw)
    need(type(b)==dict and
         b.get("schema")=="aoe2war.r25.b.hel1.positive-isolation-witness.v1" and
         b.get("status")=="POSITIVE_ISOLATED_3031_NOT_PUBLIC_DEPLOYMENT_AUTHORITY" and
         b.get("target_sha")==TARGET and
         b.get("old_web_pid")==2625090 and
         b.get("source_sha")==TARGET and
         b.get("source_provenance")=="C_ROOT_SEALED_ARCHIVE_SIDECAR_F_SEPARATELY_ATTESTS_TREE" and
         b.get("build_id")==j["candidate_build_id"] and
         b.get("guard_wargraph_disabled_before_node") is True and
         b.get("guard_local_http") is True and
         b.get("no_financial_operation_executed") is True and
         b.get("public_cutover_authorized") is False,
         "B_POSTSTART_PHYSICAL_POSITIVE_ISOLATION_NOT_PROVED")
    need(b.get("candidate_pid")==int(dict(
         x.split("=",1) for x in ss["candidate_web"].splitlines() if "=" in x
         ).get("MainPID","0")),
         "B_CERTIFICATE_CANDIDATE_PROCESS_PID_DRIFT")
    db=b.get("candidate_readonly_pg")
    need(type(db)==dict and db.get("role")=="aoe2war_r25_web_ro" and
         db.get("server_transaction_ro") is True and
         type(b.get("kernel_uid_egress_sha256"))==str and
         HEX64.fullmatch(b["kernel_uid_egress_sha256"]) and
         type(b.get("guard_sha256"))==str and
         HEX64.fullmatch(b["guard_sha256"]),
         "B_SERVER_ENFORCED_SELECT_ONLY_AND_NFT_NOT_PROVEN")
    report_hash=b.get("report_sha256")
    need(type(report_hash)==str and HEX64.fullmatch(report_hash) and
         report_hash==sha(canonical({k:v for k,v in b.items()
                                    if k!="report_sha256"})),
         "B_WITNESS_ORIGIN_CONTENT_DIGEST_DRIFT")
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
    """C's Git archive has no .git. Prove source via sealed C manifests."""
    need(CANDIDATE_STAGE.parent==OLD_APP.parent and
         CANDIDATE_STAGE.name=="app-prodn-r24-w1safe-0cee3c836c4b",
         "E_PHYSICAL_PARALLEL_STAGE_LOCATION_DRIFT")
    for p in (CANDIDATE_STAGE.parent,CANDIDATE_STAGE,C_AUDIT):
        protected_dir(p)
    def c_file(rel,key,limit=4194304):
        raw=root_file(C_AUDIT/rel,limit)
        need(sha(raw)==j[key],"C_ROOT_SEALED_"+key+"_NOT_MATCHED")
        return parse(raw)
    source=c_file("SOURCE_STAGED.json","C_source_staged_sha256")
    built=c_file("BUILD_STAGED.json","C_build_staged_sha256")
    source_rows=c_file("SOURCE_FILES.json","C_source_files_sha256",16777216)
    build_rows=c_file("BUILD_FILES.json","C_build_files_sha256",33554432)
    need(source.get("status")=="SOURCE_STAGED" and
         source.get("candidate_sha")==TARGET and
         source.get("git_archive_sha256")==C_SOURCE_ARCHIVE_SHA256,
         "C_EXACT_ARCHIVE_SOURCE_RECEIPT_MISSING")
    need(built.get("schema")=="aoe2war.r25.c.full-built-artifact.v1" and
         built.get("status")=="BUILD_STAGED" and
         built.get("candidate_sha")==TARGET and
         built.get("source_git_archive_sha256")==C_SOURCE_ARCHIVE_SHA256 and
         built.get("root_sealed") is True and
         built.get("old_web_pid_untouched")==2625090 and
         built.get("new_service_started") is False,
         "C_REAL_COMPLETE_BUILD_RECEIPT_MISSING")
    need(source_rows.get("schema")=="r25-c-source-files.v1" and
         build_rows.get("schema")=="aoe2war.r25.c.full-artifact-files.v1" and
         type(source_rows.get("rows"))==list and
         type(build_rows.get("rows"))==list,
         "C_FULL_SOURCE_BUILD_FILE_MANIFESTS_ABSENT")
    need(sha(canonical(source_rows["rows"]))==source["source_manifest_sha256"] and
         sha(canonical(build_rows["rows"]))==built["tree_sha256"] and
         len(build_rows["rows"])==built["files"],
         "C_FULL_SOURCE_OR_BUILD_MANIFEST_DIGEST_DRIFT")
    need(built["build_id"]==j["candidate_build_id"] and
         built["build_version"]==j["candidate_build_version"],
         "C_BUILD_RECEIPT_VERSIONS_MISMATCH")
    ast=os.lstat(C_SOURCE_ARCHIVE)
    need(stat.S_ISREG(ast.st_mode) and ast.st_uid==0 and
         not ast.st_mode&0o022 and ast.st_size==293550080,
         "C_ROOT_SEALED_ARCHIVE_NOT_PRESENT")
    digest=hashlib.sha256()
    afd=os.open(C_SOURCE_ARCHIVE,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        with os.fdopen(afd,"rb") as f:
            for chunk in iter(lambda:f.read(1048576),b""):
                digest.update(chunk)
    finally:
        pass
    need(digest.hexdigest()==C_SOURCE_ARCHIVE_SHA256,
         "C_ORIGINAL_GIT_ARCHIVE_PHYSICAL_DIGEST_DRIFT")
    with C_SOURCE_ARCHIVE.open("rb") as f:
        tarid=subprocess.run(["/usr/bin/git","get-tar-commit-id"],
                             stdin=f,capture_output=True,timeout=35)
    need(tarid.returncode==0 and tarid.stdout.decode().strip()==TARGET,
         "C_EMBEDDED_GIT_ARCHIVE_COMMIT_ID_NOT_PROVEN")
    need(source["candidate_sha"]==TARGET and
         source["git_archive_sha256"]==digest.hexdigest() and
         j["C_stage_artifact_sha256"]==j["C_build_staged_sha256"],
         "C_GIT_ARCHIVE_SOURCE_BUILD_APPROVAL_LINK_MISSING")
    def file_in_manifest(rel):
        hits=[x for x in build_rows["rows"]
              if type(x)==dict and x.get("path")==rel and x.get("type")=="file"]
        need(len(hits)==1 and type(hits[0].get("sha256"))==str,
             "C_STAGE_FILE_NOT_COVERED_BY_FULL_BUILD_MANIFEST:"+rel)
        p=CANDIDATE_STAGE/rel
        st=os.lstat(p)
        need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,
             "C_STAGE_ARTIFACT_ROOT_SEAL_MISSING:"+rel)
        raw=p.read_bytes()
        need(len(raw)==hits[0]["size"] and sha(raw)==hits[0]["sha256"],
             "C_BUILT_FILE_CONTENT_NO_LONGER_MATCHES_FULL_MANIFEST:"+rel)
        return raw.strip().decode("ascii") if len(raw)<256 else None
    # BUILD_FILES is C's complete per-file SHA256 manifest, not a Git marker.
    need(file_in_manifest(".next/BUILD_ID")==j["candidate_build_id"],
         "C_ACTUAL_NEXT_BUILD_ID_NOT_APPROVED")
    need(file_in_manifest(".aoe2war-build-version")==j["candidate_build_version"],
         "C_ACTUAL_APP_BUILD_VERSION_NOT_APPROVED")
    need(file_in_manifest("r24-source-sha")==TARGET,
         "C_STAGE_ROOT_SEALED_GIT_ARCHIVE_MARKER_MISMATCH")
    need((CANDIDATE_STAGE/"node_modules").is_dir() and
         not (CANDIDATE_STAGE/"node_modules").is_symlink(),
         "C_ACTUAL_DEPENDENCIES_MISSING")
    next_build_asset("http://127.0.0.1:3031",j["candidate_build_id"])
    original_head=cmd(["/usr/sbin/runuser","-u","tony","--",
         "/usr/bin/git","-C",str(OLD_APP),"rev-parse","HEAD"],15).decode().strip()
    need(original_head==j["previous_sha"],
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
# The six real web upstreams are separate Nginx locations on HEL1. Wolo
# /rpc and /rest must keep their independent ports and POST/OPTIONS semantics.
WEB_LOCATIONS={
    b"^~ /players/by-name/",
    b"= /api/kingdom-presence/events",
    b"^~ /api/",
    b"= /",
    b"^~ /download/watcher/",
    b"/",
}
METHOD_CHECK=b"if ($request_method !~ ^(GET|HEAD)$) { return 405; }"
VHOST=pathlib.Path("/etc/nginx/sites-available/aoe2war.com")
def match_brace(src,at):
    """Bound one brace with nested Nginx blocks; never parse from a '}' guess."""
    need(src[at:at+1]==b"{","NGINX_EXPECTED_OPEN_BRACE")
    depth=0;quote=None;comment=False;escaped=False
    for i in range(at,len(src)):
        ch=src[i]
        if comment:
            if ch==10:comment=False
            continue
        if quote is not None:
            if escaped:escaped=False
            elif ch==92:escaped=True
            elif ch==quote:quote=None
            continue
        if ch==35:comment=True;continue
        if ch in (34,39):quote=ch;continue
        if ch==123:depth+=1
        elif ch==125:
            depth-=1
            if depth==0:return i
            need(depth>=0,"NGINX_UNBALANCED_BRACES")
    raise Hold("NGINX_UNCLOSED_LOCATION_OR_SERVER")
def scoped_https(src):
    """Find exactly one named TLS server in THIS dedicated vhost, no others."""
    need(len(src)<131072,"NGINX_VHOST_SIZE_UNBOUNDED")
    results=[];target_https=[]
    for m in re.finditer(rb"(?m)^[ \t]*server[ \t]*\{",src):
        op=src.index(b"{",m.start(),m.end())
        end=match_brace(src,op)
        body=src[op+1:end]
        name=re.search(rb"(?m)^[ \t]*server_name[ \t]+([^;]+);",body)
        if not name:raise Hold("NGINX_UNNAMED_SERVER_IN_DEDICATED_VHOST")
        names=set(name.group(1).split())
        need(names=={b"aoe2war.com",b"www.aoe2war.com"},
             "NGINX_UNRELATED_SERVER_IN_TARGET_FILE")
        https=bool(re.search(rb"(?m)^[ \t]*listen[ \t]+(?:\[::\]:)?443\b",body))
        http=bool(re.search(rb"(?m)^[ \t]*listen[ \t]+(?:\[::\]:)?80\b",body))
        need(https != http,"NGINX_UNKNOWN_VHOST_LISTENER_SHAPE")
        results.append((m.start(),end,https))
        if https:target_https.append((op+1,end,body))
    need(len(results)==2 and len(target_https)==1 and
         len([x for x in results if x[2]])==1,"NGINX_EXPECTED_HTTPS_AND_HTTP_PAIR")
    lo,hi,body=target_https[0]
    # Do not edit included/shared routes or an upstream macro by accident.
    inc=re.findall(rb"(?m)^[ \t]*include[ \t]+([^;]+);",body)
    need(all(x==b"/etc/letsencrypt/options-ssl-nginx.conf" for x in inc),
         "NGINX_UNREVIEWED_SHARED_INCLUDE")
    return lo,hi,body
def safe_replace_site(original,chosen):
    """Edit all six exact old web routes, never the Wolo or other vhosts."""
    need(chosen==NEW_UPSTREAM,"NGINX_ONLY_REVIEWED_CANDIDATE_UPSTREAM")
    lo,hi,body=scoped_https(original)
    need(body.count(OLD_UPSTREAM)==6 and
         original.count(OLD_UPSTREAM)==6 and
         NEW_UPSTREAM not in original,"NGINX_EXACT_SIX_OLD_WEB_UPSTREAMS_REQUIRED")
    matches=list(re.finditer(rb"(?m)^[ \t]*location[ \t]+([^{}\r\n]+)[ \t]*\{",body))
    found={};changes=[]
    for m in matches:
        label=b" ".join(m.group(1).split())
        op=body.index(b"{",m.start(),m.end())
        end=match_brace(body,op)
        contents=body[op+1:end]
        if OLD_UPSTREAM not in contents:continue
        need(label in WEB_LOCATIONS and label not in found,
             "NGINX_UNREVIEWED_WEB_PROXY_LOCATION")
        need(contents.count(OLD_UPSTREAM)==1 and
             len(re.findall(rb"(?m)^[ \t]*proxy_pass\b",contents))==1,
             "NGINX_UNREVIEWED_PROXY_LOCATION_DIRECTIVE")
        found[label]=True
        revised=contents.replace(OLD_UPSTREAM,chosen)
        if METHOD_CHECK not in revised:
            need(b"limit_except" not in revised and
                 not re.search(rb"(?m)^[ \t]*if[ \t]*\(",revised),
                 "NGINX_UNREVIEWED_EXISTING_METHOD_GUARD")
            revised=b"\n        "+METHOD_CHECK+b"\n"+revised
        changes.append((op+1,end,revised))
    need(set(found)==WEB_LOCATIONS and len(changes)==6,
         "NGINX_SIX_WEB_LOCATIONS_NOT_ALL_FOUND")
    result=bytearray(body)
    for start,end,data in reversed(changes):
        result[start:end]=data
    updated=original[:lo]+bytes(result)+original[hi:]
    need(OLD_UPSTREAM not in updated and updated.count(NEW_UPSTREAM)==6,
         "NGINX_INCOMPLETE_WEB_UPSTREAM_SWITCH")
    need(b"proxy_pass http://127.0.0.1:27657" in updated and
         b"proxy_pass http://127.0.0.1:1318" in updated,
         "NGINX_WOLO_ROUTE_UNEXPECTEDLY_ABSENT")
    return updated
def nginx_loaded_vhost(expected,config,old_count=6):
    """Confirm the exact active -T vhost bytes and full loaded 3030 census."""
    p=subprocess.run(["/usr/sbin/nginx","-T"],capture_output=True,timeout=22)
    need(p.returncode==0 and 0<len(p.stdout)<=8*1024*1024,
         "NGINX_LOADED_CONFIG_UNAVAILABLE")
    sections=re.split(rb"(?m)^# configuration file ([^\r\n]+):[ \t]*\r?\n",p.stdout)
    need(len(sections)>=3 and len(sections)%2==1,
         "NGINX_T_SECTION_MARKERS_MISSING")
    candidates=[]
    global_old=0
    for i in range(1,len(sections),2):
        name=sections[i].decode("utf-8","strict")
        raw=sections[i+1].rstrip(b"\r\n")
        global_old+=raw.count(OLD_UPSTREAM)
        try:
            matches=os.path.samefile(name,config)
        except (FileNotFoundError,OSError):
            matches=False
        if matches:
            need(raw==expected.rstrip(b"\r\n"),
                 "NGINX_LOADED_TARGET_FILE_BYTES_MISMATCH")
            candidates.append(name)
    need(len(candidates)==1 and global_old==old_count,
         "NGINX_LOADED_SCOPE_INCLUDES_OR_OTHER_SITE_3030_UNRESOLVED")
    return candidates[0]
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
    need(config==VHOST,"NGINX_DIFFERENT_ACTIVE_VHOST_NOT_APPROVED")
    old=root_file(config,131072)
    need(sha(old)==j["nginx_before_sha256"],"ORIGINAL_NGINX_BYTES_DRIFT")
    nginx_loaded_vhost(old,config)
    candidate=safe_replace_site(old,NEW_UPSTREAM)
    s=snapshots(j["finance_units"]);prove_preimage(j,s)
    stage_identity(j)
    verified_b_poststart(j,s)
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
        nginx_loaded_vhost(old,config)
        os.mkdir(record,0o700);protected_dir(record,0o700)
        durable_write(record/"before-nginx.conf",old)
        durable_write(record/"intent.json",canonical({"schema":SCHEMA,"nonce":nonce,
             "candidate_sha":TARGET,"old_unit_pid_unchanged":True,
             "before_nginx_sha256":sha(old),"after_nginx_sha256":sha(candidate)})+b"\n")
        fsyncdir(record);fsyncdir(AUDIT_BASE)
        try:
            replace_existing(config,candidate)
            nginx_reload()
            nginx_loaded_vhost(candidate,config,old_count=0)
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
                nginx_loaded_vhost(old,config,old_count=6)
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
    need(config==VHOST,"ROLLBACK_NGINX_DIFFERENT_VHOST_NOT_APPROVED")
    current=root_file(config,131072)
    nginx_loaded_vhost(current,config,old_count=0)
    need(sha(current)==commit["new_nginx_sha256"],
         "LIVE_NGINX_NOT_EXACT_CANDIDATE")
    s=snapshots(j["finance_units"])
    prove_rollback_preimage(j,s)
    lockfd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        try:fcntl.flock(lockfd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as err:raise Hold("ROLLBACK_GLOBAL_LOCK_BUSY") from err
        lock_check()
        need(protected_continuity(snapshots(j["finance_units"]))==
             protected_continuity(s),
             "FINANCIAL_ORIGINAL_WEB_DRIFT_BEFORE_ROLLBACK")
        replace_existing(config,old)
        nginx_reload()
        nginx_loaded_vhost(old,config,old_count=6)
        need(public_version()==http_version(OLD_PORT),
             "PUBLIC_OLD_VERSION_NOT_RESTORED")
        need(protected_continuity(snapshots(j["finance_units"]))==
             protected_continuity(s),
             "FINANCIAL_ORIGINAL_WEB_DRIFT_AFTER_ROLLBACK")
        durable_write(record/"rollback.json",canonical({"status":"OLD_PUBLIC_PROXY_RESTORED",
             "nonce":nonce,"old_config_sha256":sha(old),"original_web_restarted":False})+b"\n")
        fsyncdir(record)
        print("PASS:R24_OLD_WEB_PROXY_RESTORED; ORIGINAL_WEB_MAINPID_UNCHANGED")
    finally:os.close(lockfd)
def approved_owner_intent(rollback=False):
    # This output reveals only nonce + public build identity; the actual
    # root-only approved.json remains protected and is re-read at activation.
    need(sys.platform=="linux" and socket.gethostname()==HOST and os.geteuid()==0,
         "EXACT_HEL1_ROOT_REQUIRED")
    j=approval(root_file(ROOT_APPROVAL,16384))
    raw=root_file(VHOST,131072)
    if rollback:
        record=AUDIT_BASE/("r24-"+j["nonce"])
        commit=parse(root_file(record/"commit.json",8192))
        need(commit.get("nonce")==j["nonce"] and
             commit.get("candidate_sha")==TARGET and
             commit.get("status")=="R24_PARALLEL_WEBSITE_LIVE",
             "ROLLBACK_INTENT_NOT_COMMITTED")
        need(sha(raw)==commit["new_nginx_sha256"],
             "ROLLBACK_INTENT_LIVE_NGINX_DRIFT")
        nginx_loaded_vhost(raw,VHOST,old_count=0)
    else:
        need(sha(raw)==j["nginx_before_sha256"],
             "ACTUAL_NGINX_REVIEWED_PREIMAGE_DRIFT")
        nginx_loaded_vhost(raw,VHOST,old_count=6)
        safe_replace_site(raw,NEW_UPSTREAM)
        witness=snapshots(j["finance_units"])
        prove_preimage(j,witness)
        stage_identity(j)
        verified_b_poststart(j,witness)
        verified_durable_e_rollback(j)
    print(canonical({"schema":"aoe2war.r25.f.owner-intent.v1",
        "nonce":j["nonce"],"candidate_sha":TARGET,
        "candidate_build_id":j["candidate_build_id"],
        "candidate_build_version":j["candidate_build_version"],
        "nginx_before_sha256":j["nginx_before_sha256"],
        "nginx_config":j["nginx_config"],
        "financial_review_binding":"ROOT_APPROVAL_REVERIFIED_AT_APPLY",
        "operation":"ROLLBACK" if rollback else "APPLY",
        "files_modified":False}).decode())

def plan_vhost():
    # Narrow physical evidence for the exact active AoE2WAR Nginx config.
    need(sys.platform=="linux" and socket.gethostname()==HOST and os.geteuid()==0,
         "EXACT_HEL1_ROOT_REQUIRED")
    config=VHOST;raw=root_file(config,131072)
    loaded=nginx_loaded_vhost(raw,config,old_count=6)
    proposed=safe_replace_site(raw,NEW_UPSTREAM)
    print(canonical({"schema":"aoe2war.r25.f.nginx.vhost-plan.v1",
        "host":HOST,"candidate_sha":TARGET,
        "active_vhost_loaded_as":loaded,"root_vhost_path":str(config),
        "original_vhost_sha256":sha(raw),
        "proposed_vhost_sha256":sha(proposed),
        "web_old_upstream_locations":6,
        "web_new_upstream_locations_after_switch":6,
        "unrelated_vhosts_modified":False,
        "wolo_proxy_routes_modified":False,
        "files_modified":False,"release_authorized":False}).decode())
def main():
    need(len(sys.argv)>=2,"EXPLICIT_ROOT_OPERATOR_MODE")
    if sys.argv[1:]==["--root-vhost-plan"]:
        plan_vhost()
    elif sys.argv[1:]==["--root-owner-intent"]:
        approved_owner_intent()
    elif sys.argv[1:]==["--root-rollback-intent"]:
        approved_owner_intent(rollback=True)
    elif sys.argv[1:]==["--root-apply"]:
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
