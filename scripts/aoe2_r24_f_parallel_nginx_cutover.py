#!/usr/bin/env python3
"""R24 F: parallel old-web preserving nginx-only cutover (root SSH in memory).

This is a NEW source proposal. Original aoe2hdbets-web.service is NEVER
stopped or restarted: it may run WarGraph financial ticks. Candidate #1061
must already be physically staged and running on a separate isolated port
and read-only DB principal, with B/D/E/F/G independently root-bound approval.
No key enrollment, money operation, migration, repo switch, or 14-helper install.
"""
from __future__ import annotations
import argparse,base64,fcntl,hashlib,hmac,http.client,json,os,pathlib,re,select,signal,socket,ssl,stat,subprocess,sys,time,types,urllib.request
from html.parser import HTMLParser
from datetime import date,datetime,timezone

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
# C #1084 owner HEL1 independent verifier #6547581709: immutable built artifact.
C_PHYSICAL_TREE_SHA256="5b0de1da545447f64cd1021839692060f5cf308210c19dbd7153f2f25090056d"
C_PHYSICAL_BUILD_ID="-dJl5VyecHu5BKNvfErJe"
C_PHYSICAL_APP_VERSION="20261031171526-148d3df911"
C_PHYSICAL_FILES=87038
B_ROOT_POSTSTART=pathlib.Path("/etc/aoe2war/r24-parallel-web/b-poststart-positive.json")
E_ROOT_RECOVERY=pathlib.Path("/etc/aoe2war/r24-parallel-web/e-recovery-ready.json")
# C #1084 root-protected direct child of /var/lib; never use the mutable live /var/www parent.
CANDIDATE_STAGE=pathlib.Path("/var/lib/aoe2war-r25-web-0cee3c836c4b")
PUBLIC="https://aoe2war.com"
HTTP_HEADERS={"User-Agent":"aoe2war-release-verifier/1","Cache-Control":"no-cache"}
ADMISSION_RECEIPT=ROOT_APPROVAL.parent/"f-admission.json"
STATE_READER=ROOT_APPROVAL.parent/"runtime-state-reader.py"
ADMISSION_JOURNAL=pathlib.Path("/var/lib/aoe2war-r25-f-evidence-admission-v1")
SCHEMA="aoe2war.r24.rootssh.parallel-web-nginx.v1"
HEX40=re.compile("[0-9a-f]{40}\\Z")
HEX64=re.compile("[0-9a-f]{64}\\Z")
NONCE=re.compile("[0-9a-f]{32}\\Z")
PRESERVED_BEFORE_SHA="6de56e39c813069ebcebf0674ae6142f78bd7b839e6ad2fea5c8c4c99e8d12b7"
PRESERVED_PREVIOUS_VERSION="20261028134227-6c0f6d7531"
CONSUMED_NONCE="3cadeb4aac1f217783effc0c25f49fac"
CONSUMED_INTENT_SHA="bf4fe7bd568b8916b5a562394a558d97d2532d9115d0c915a03303bb479e72cc"
CONSUMED_BEFORE_SHA="d8f55532ae9a1b8463ed6f0998f8a92343677e442218d1bdaef1b6e547478ad8"
BASE_APPROVED_SHA="f8855882d7112fc24b1facb8f8df6721ac5c2bffc58c43d021e4773721be956b"
C_SESSION_REPAIR_SOURCE_SHA="0f7829a2eb0cae2a01039ed768cba22ffae2ea1d"
C_SESSION_GUARD_V3_SOURCE_SHA="b8f690c637b0796249265e28e226f4442d1e6f9a"
C_SESSION_GUARD_V3_SOURCE_BYTES_SHA="0a1e1c583d79e24ea63a1e107ade0f5135601e5a0b1a235991637b07de790f00"
B_GUARD_SHA="dead2815b3f20b311ede29dfd99086cbb81dfd6a73f1a71f2b7b57ccd74e809d"
C_SESSION_GUARD_V3_GUARD_SHA="192d36d75aede69e85e1d7599d58daf13d9dc96bb2aa49a15d9bd9596b8daac5"

RUNTIME_REQUALIFICATION=None
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
# Exact historical C journals are part of the approval, never just the
# latest v8 success. No earlier START may be rewritten or replayed.
C_FAILURE_RECEIPT_KEYS = frozenset(
    "C_v"+str(version)+"_"+name+"_file_sha256"
    for version in range(1,8)
    for name in (("started","hold") if version==1 else ("started","staged","hold"))
)
C_SUCCESS_RECEIPT_KEYS = frozenset(("C_v8_started_file_sha256","C_v8_running_file_sha256"))
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
        "B_poststart_sha256","E_r25_recovery_sha256","native_protected_sha256","lane_reviews"}
        | C_FAILURE_RECEIPT_KEYS | C_SUCCESS_RECEIPT_KEYS,
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
              "B_poststart_sha256","E_r25_recovery_sha256","native_protected_sha256",
              *sorted(C_FAILURE_RECEIPT_KEYS | C_SUCCESS_RECEIPT_KEYS)):
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
    need(type(j["lane_reviews"])==dict and set(j["lane_reviews"])==set("BCDEFG"),
         "B_C_D_E_F_G_REVIEWS_REQUIRED")
    record=admitted_evidence(raw)
    need(j["lane_reviews"]==record["lane_reviews"],"ACTUAL_REVIEWED_LANE_SOURCE_DRIFT")
    need(not (ADMISSION_JOURNAL/"hold.json").exists(),"F_ADMISSION_HOLD_PRESERVE_NO_CUTOVER")
    complete=parse(root_file(ADMISSION_JOURNAL/"complete.json",8192))
    need(complete.get("status")=="APPROVAL_WRITTEN_NOT_PUBLIC_DEPLOYMENT_AUTHORITY"
         and complete.get("approved_json_sha256")==sha(raw),"F_ADMISSION_NOT_COMPLETE")
    return j

def admitted_evidence(approved_raw=None):
    """Actual one-use native capture + independent review; no placeholder pins."""
    try:record=parse(root_file(ADMISSION_RECEIPT,131072))
    except OSError as exc:raise Hold("REAL_ONE_USE_F_ADMISSION_RECEIPT_REQUIRED") from exc
    report=dict(record);digest=report.pop("report_sha256",None)
    need(record.get("schema")=="aoe2war.r25.f.admitted-evidence.v1"
         and record.get("status")=="APPROVAL_WRITTEN_NOT_PUBLIC_DEPLOYMENT_AUTHORITY"
         and digest==sha(canonical(report))
         and record.get("public_cutover_authorized") is False,
         "REAL_ONE_USE_F_ADMISSION_RECEIPT_REQUIRED")
    if approved_raw is not None:
        need(record.get("approved_json_sha256")==sha(approved_raw),"APPROVED_BYTES_NOT_ADMITTED")
    for kind,scope in (("source_review","F_SOURCE_AND_EVIDENCE_ADMISSION"),
                       ("runtime_review","C_RUNTIME_SECURITY_ACCEPT")):
        envelope=record.get(kind,{})
        body=envelope.get("body","")
        need(envelope.get("author")=="Emaren" and
             envelope.get("issue_url")=="https://api.github.com/repos/Emaren/app-prodn/issues/1083"
             and re.fullmatch(r"https://github.com/Emaren/app-prodn/pull/1083#issuecomment-[0-9]+",envelope.get("url","")) is not None
             and type(body)==str and sha(body.encode())==envelope.get("body_sha256"),
             "AUTHENTICATED_REVIEW_ENVELOPE_REQUIRED")
        marker="\n"+chr(96)*3+"json\n"
        suffix="\n"+chr(96)*3
        owner_mode=body.startswith("R25_F_OWNER_NONFINANCIAL_ACCEPT"+marker)
        need(body.startswith(("R25_F_OWNER_NONFINANCIAL_ACCEPT"+marker,
                              "R25_F_INDEPENDENT_REVIEW"+marker))
             and body.rstrip().endswith(suffix),"REAL_F_REVIEW_MANIFEST_REQUIRED")
        review=parse(body.split(marker,1)[1].rsplit(suffix,1)[0])
        if owner_mode:
            need(review.get("schema")=="aoe2war.r25.f.owner-nonfinancial-review.v1"
                 and review.get("decision")=="ACCEPT" and review.get("scope")==scope
                 and review.get("owner_login")=="Emaren"
                 and review.get("release_authority")=="OWNER_ONLY_NONFINANCIAL"
                 and review.get("owner_accepts_no_independent_review") is True
                 and review.get("independent_review") is False
                 and review.get("financial_authorized") is False
                 and review.get("public_cutover_authorized") is False,
                 "AUTHENTIC_OWNER_ONLY_NONFINANCIAL_ACCEPTANCE_REQUIRED")
        else:
            need(review.get("schema")=="aoe2war.r25.f.evidence-review.v1"
                 and review.get("decision")=="ACCEPT" and review.get("scope")==scope
                 and review.get("independent_review") is True
                 and review.get("publisher_is_reviewer_identity") is False
                 and review.get("reviewer") in ("/root/security_review","/root/start_fix_review"),
                 "INDEPENDENT_SOURCE_AND_RUNTIME_REVIEW_REQUIRED")
        if kind=="source_review":
            need(review.get("lane_sources")==record.get("lane_reviews")
                 and review.get("source_sha")==record["lane_reviews"].get("F"),
                 "REVIEWED_LANE_SOURCES_NOT_BOUND")
            need(review.get("role_decisions")==dict.fromkeys("BCDEFG","ACCEPT"),
                 "ACTUAL_WEBSITE_REVIEW_ROLE_DECISIONS_REQUIRED")
            ci=review.get("exact_head_ci",{})
            need(type(ci.get("run_id")) is int and ci["run_id"]>0
                 and ci.get("head_sha")==review["source_sha"] and ci.get("conclusion")=="success"
                 and ci.get("all_three_jobs_success") is True,"F_EXACT_HEAD_CI_REQUIRED")
            files=review.get("files",{})
            need(files.get("c_helper",{}).get("sha256")==record.get("reader_sha256")
                 and files.get("engine",{}).get("sha256")==record.get("engine_sha256"),
                 "REVIEWED_EXECUTABLE_PINS_REQUIRED")
        else:
            need(review.get("capture_sha256")==record.get("reviewed_capture_sha256")
                 and review.get("B_stable_sha256")==record.get("B_stable_sha256")
                 and review.get("candidate_pid")==record.get("candidate_pid")
                 and review.get("candidate_start_ticks")==record.get("candidate_start_ticks"),
                 "ACTUAL_INDEPENDENT_C_RUNTIME_ACCEPT_REQUIRED")
    return record

def native_state_reader():
    record=admitted_evidence()
    source=root_file(STATE_READER,65536)
    need(sha(source)==record["reader_sha256"],"REVIEWED_RUNTIME_READER_BYTES_CHANGED")
    module=types.ModuleType("reviewed_r25_native_state_reader")
    exec(compile(source,"reviewed-runtime-state-reader","exec"),module.__dict__)
    return module
def unit_state(unit):
    reader=native_state_reader()
    if re.search(r"@\.(?:service|timer|socket)$",unit):
        return "Id="+unit+"\nTemplateConfigSHA256="+sha(cmd(["/usr/bin/systemctl","cat",unit,"--no-pager"],15))+"\n"
    state=reader.unit_state(unit)
    fields=dict(state["properties"])
    fields["ProcStartTicks"]=str(state["start_ticks"])
    fields["UnitConfigSHA256"]=state["unit_config_sha256"]
    return "".join(k+"="+str(v)+"\n" for k,v in sorted(fields.items()))
def matching_session_identity(candidate,original):
    # HS256 is symmetric: this proves the original session identity, not a
    # verification-only capability. Never serialize either secret or its hash.
    new=candidate.get(b"SESSION_SECRET") or candidate.get(b"NEXTAUTH_SECRET")
    old=original.get(b"SESSION_SECRET") or original.get(b"NEXTAUTH_SECRET")
    need(type(new)is bytes and bool(new),"CANDIDATE_SESSION_SIGNER_MISSING")
    need(type(old)is bytes and bool(old),"ORIGINAL_SESSION_SIGNER_MISSING")
    need(hmac.compare_digest(new,old),"CANDIDATE_SESSION_SIGNING_IDENTITY_MISMATCH")
    return True
def original_session_identity(candidate):
    root=pathlib.Path("/proc/2625090")
    def ticks():
        raw=(root/"stat").read_text();return int(raw[raw.rfind(")")+2:].split()[19])
    need(ticks()==103836850,"ORIGINAL_SESSION_PROCESS_IDENTITY_DRIFT")
    raw=(root/"environ").read_bytes()
    need(0<len(raw)<=65536 and raw.endswith(b"\x00"),"ORIGINAL_SESSION_ENVIRONMENT_UNBOUNDED")
    original={}
    for row in raw[:-1].split(b"\x00"):
        key,sep,value=row.partition(b"=")
        need(bool(sep) and key not in original,"ORIGINAL_SESSION_ENVIRONMENT_INVALID")
        original[key]=value
    matching_session_identity(candidate,original)
    need(ticks()==103836850,"ORIGINAL_SESSION_PROCESS_CHANGED_DURING_CHECK")
    return True
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
    original_session_identity(variables)
    return True

def snapshots(units):
    reader=native_state_reader()
    protected=reader.protected_snapshot()
    actual=sorted(set(protected["unit_names"])-{OLD_UNIT,NEW_UNIT})
    need(actual==sorted(units),"COMPLETE_NATIVE_FINANCE_UNIT_SET_DRIFT")
    sockets=cmd(["/usr/bin/ss","-H","-ltnpe"],15).decode(errors="replace")
    stable_sockets="\n".join("LISTEN 0 0 "+" ".join(row.split()[3:]) for row in sockets.splitlines()
        if any(re.search(":"+str(port)+r"\s",row) for port in (8092,8093,5432)))
    return {"original_web":unit_state(OLD_UNIT),
            "candidate_web":unit_state(NEW_UNIT),
            "finance":{u:unit_state(u) for u in units},
            "native_protected":protected,"wolo":stable_sockets}
def snapshots_during_bounded_timer_quiescence(units,maximum_seconds=25):
    """Never accept an active timer as inactive; wait for real native completion.

    HEL1's legitimate financial health one-shots can be active for seconds.
    The original native reader, PG, nft and every other financial invariant
    remain unchanged. Only this exact transient refusal is retried.
    """
    deadline=time.monotonic()+maximum_seconds
    while True:
        try:
            return snapshots(units)
        except Exception as error:
            if (type(error).__name__!="Hold"
                or str(error)!="MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"
                or time.monotonic()>=deadline):
                raise
            time.sleep(.2)

def listener_lines(raw):
    out={}
    for port in ("8092","8093"):
        hits=[x for x in raw.splitlines() if re.search(":"+port+r"\s",x)]
        need(len(hits)==1,"WOLO_PORT_PIDs_NOT_UNIQUE:"+port)
        # Ignore volatile queue counters; preserve address/process/inode/cgroup.
        out[port]=" ".join(hits[0].split()[3:])
    return out
def prove_preimage(j,s):
    need("ActiveState=active" in s["original_web"] and
         "ActiveState=active" in s["candidate_web"],"TWO_INDEPENDENT_WEB_SERVICES_NOT_ACTIVE")
    enforce_candidate_runtime(s["candidate_web"])
    need(sha(canonical(s["native_protected"]))==j["native_protected_sha256"],
         "NATIVE_PROTECTED_PROCESS_OR_POSTGRES_SOCKET_DRIFT")
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
    need(sha(canonical(s["native_protected"]))==j["native_protected_sha256"],
         "ROLLBACK_NATIVE_PROTECTED_IDENTITY_DRIFT")
def protected_continuity(s):
    return (s["original_web"],s["finance"],listener_lines(s["wolo"]),s["native_protected"])
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
    if (type(RUNTIME_REQUALIFICATION)is dict and
        RUNTIME_REQUALIFICATION.get("schema")=="aoe2war.r25.session-guard-release.v3"):
        need(reread_c_session_guard_v3()==RUNTIME_REQUALIFICATION["candidate_after"],
             "C_GUARD_V3_NEW_B_POSTSTART_DRIFT")
        return True
    path=B_ROOT_POSTSTART if RUNTIME_REQUALIFICATION is None else pathlib.Path(RUNTIME_REQUALIFICATION["b_poststart"]["path"])
    raw=root_file(path,65536)
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
    with urllib.request.urlopen(urllib.request.Request(url,method="GET",headers=HTTP_HEADERS),
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
            urllib.request.Request(url,method="GET",headers=HTTP_HEADERS),
            timeout=8) as resp:
        need(resp.status==200 and 0<len(resp.read(65537))<=65536,
             "ACTUAL_NEXT_BUILD_ID_STATIC_ASSET_MISSING")

def require_c_physical_build_identity(built):
    """Independently bind root receipt to C's physical 87,038-file verification."""
    need(type(built)==dict and
         built.get("tree_sha256")==C_PHYSICAL_TREE_SHA256 and
         built.get("build_id")==C_PHYSICAL_BUILD_ID and
         built.get("build_version")==C_PHYSICAL_APP_VERSION and
         built.get("files")==C_PHYSICAL_FILES,
         "C_PHYSICAL_87038_FILE_TREE_BUILD_ID_MISMATCH")

def stage_identity(j):
    """C's Git archive has no .git. Prove source via sealed C manifests."""
    need(CANDIDATE_STAGE.parent==pathlib.Path("/var/lib") and
         CANDIDATE_STAGE.name=="aoe2war-r25-web-0cee3c836c4b",
         "E_PHYSICAL_PARALLEL_STAGE_LOCATION_DRIFT")
    for p in (CANDIDATE_STAGE.parent,CANDIDATE_STAGE,C_AUDIT):
        protected_dir(p)
    def c_file(rel,key,limit=4194304):
        raw=root_file(C_AUDIT/rel,limit)
        need(sha(raw)==j[key],"C_ROOT_SEALED_"+key+"_NOT_MATCHED")
        return parse(raw)
    source=c_file("SOURCE_STAGED.json","C_source_staged_sha256")
    built=c_file("BUILD_STAGED.json","C_build_staged_sha256")
    require_c_physical_build_identity(built)
    source_rows=c_file("SOURCE_FILES.json","C_source_files_sha256",33554432)
    build_rows=c_file("BUILD_FILES.json","C_build_files_sha256",67108864)
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
    rel=".next/static/"+j["candidate_build_id"]+"/_buildManifest.js"
    matches=[row for row in build_rows["rows"] if row.get("path")==rel and row.get("type")=="file"]
    need(len(matches)==1,"C_BUILD_MANIFEST_STATIC_ROW_MISSING")
    raw=root_file(CANDIDATE_STAGE/rel,65536)
    need(len(raw)==matches[0].get("size") and sha(raw)==matches[0].get("sha256"),
         "C_BUILD_MANIFEST_STATIC_BYTES_DRIFT")
    return {"path":"/_next/static/"+j["candidate_build_id"]+"/_buildManifest.js",
            "bytes":len(raw),"sha256":sha(raw)}
def public_version():
    with urllib.request.urlopen(
            urllib.request.Request(PUBLIC+"/api/deployment-version",method="GET",headers=HTTP_HEADERS),
            timeout=10) as resp:
        need(resp.status==200,"PUBLIC_HTTP_STATUS")
        obj=parse(resp.read(8193))
    need(type(obj)==dict and type(obj.get("buildVersion"))==str,
         "PUBLIC_VERSION_INVALID")
    return obj["buildVersion"]

class ReadinessPending(Exception):pass
class OriginTLSConnection(http.client.HTTPSConnection):
    """Fresh loopback TCP with public Host/SNI and normal certificate checks."""
    def __init__(self,timeout):
        context=ssl.create_default_context()
        need(context.check_hostname and context.verify_mode==ssl.CERT_REQUIRED,
             "ORIGIN_TLS_VERIFICATION_REQUIRED")
        super().__init__("aoe2war.com",443,timeout=timeout,context=context)
    def connect(self):
        raw=socket.create_connection(("127.0.0.1",443),self.timeout)
        try:self.sock=self._context.wrap_socket(raw,server_hostname="aoe2war.com")
        except BaseException:
            raw.close();raise

def direct_surface_get(surface,path,maximum,deadline):
    need(surface in ("origin","public") and path.startswith("/") and not path.startswith("//"),
         "EXACT_READINESS_SURFACE_REQUIRED")
    remaining=deadline-time.monotonic()
    if remaining<=0:raise ReadinessPending("READINESS_DEADLINE")
    timeout=min(3.0,remaining)
    # http.client uses no proxy environment and follows no redirects. Both
    # surfaces open a new verified TLS connection for EVERY bounded GET.
    conn=(OriginTLSConnection(timeout) if surface=="origin" else
          http.client.HTTPSConnection("aoe2war.com",443,timeout=timeout,context=ssl.create_default_context()))
    requested_at=datetime.now(timezone.utc).isoformat()
    started=time.monotonic()
    try:
        conn.request("GET",path,headers={**HTTP_HEADERS,"Host":"aoe2war.com","Connection":"close"})
        peer=conn.sock.getpeername()[:2]
        response=conn.getresponse()
        if response.status in (502,503,504,520,521,522,523,524):
            raise ReadinessPending(surface.upper()+"_HTTP_TEMPORARY_"+str(response.status))
        need(response.status==200,surface.upper()+"_READINESS_HTTP_STATUS_"+str(response.status))
        if surface=="public":
            need(peer[0] not in ("127.0.0.1","::1") and
                 (response.getheader("server") or "").lower()=="cloudflare" and
                 bool(re.fullmatch(r"[A-Za-z0-9-]{1,128}",response.getheader("cf-ray") or "")),
                 "PUBLIC_CLOUDFLARE_RESPONSE_PROVENANCE_REQUIRED")
        data=response.read(maximum+1)
        need(0<len(data)<=maximum,surface.upper()+"_READINESS_BODY_BOUND")
        if time.monotonic()>=deadline:raise ReadinessPending("READINESS_DEADLINE")
        provenance={"surface":surface,"url":PUBLIC+path,"connect_target":"127.0.0.1:443" if surface=="origin" else "aoe2war.com:443",
                    "peer":list(peer),"tls_server_name":"aoe2war.com","host_header":"aoe2war.com",
                    "fresh_connection":True,"redirects_followed":False,"status":response.status,
                    "requested_at":requested_at,"completed_at":datetime.now(timezone.utc).isoformat(),
                    "elapsed_seconds":round(time.monotonic()-started,6),
                    "headers":{key:response.getheader(key) for key in
                               ("server","cf-cache-status","cf-ray","cache-control")}}
        return canonical({"body_hex":data.hex(),"provenance":provenance})
    except ssl.SSLError as exc:
        raise Hold(surface.upper()+"_READINESS_TLS_FAILED") from exc
    except (TimeoutError,ConnectionError,http.client.RemoteDisconnected) as exc:
        raise ReadinessPending(surface.upper()+"_READINESS_TRANSIENT_IO") from exc
    finally:conn.close()

def bounded_readiness_call(probe,maximum,deadline):
    """Enforce one parent deadline including network and native read-only guards."""
    if time.monotonic()>=deadline:raise ReadinessPending("READINESS_DEADLINE")
    read_fd,write_fd=os.pipe()
    pid=os.fork()
    if pid==0:
        try:
            os.close(read_fd)
            try:
                os.setsid()
                packet=b"OK\n"+probe()
            except ReadinessPending as exc:packet=b"PENDING\n"+str(exc).encode()[:100]
            except Hold as exc:packet=b"HOLD\n"+str(exc).encode()[:100]
            except BaseException as exc:packet=b"HOLD\nPROBE_"+type(exc).__name__.encode()[:80]
            while packet:
                packet=packet[os.write(write_fd,packet):]
        finally:
            # Never unwind any child exception into inherited apply/rollback.
            try:os.close(write_fd)
            finally:os._exit(0)
    os.close(write_fd)
    parts=[];size=0;reaped=False
    try:
        while True:
            remaining=deadline-time.monotonic()
            if remaining<=0 or not select.select([read_fd],[],[],remaining)[0]:
                raise ReadinessPending("READINESS_DEADLINE")
            block=os.read(read_fd,min(8192,maximum+129-size))
            if not block:break
            size+=len(block);need(size<=maximum+128,"READINESS_PIPE_BOUND")
            parts.append(block)
        while True:
            finished,status=os.waitpid(pid,os.WNOHANG)
            if finished:
                reaped=True;break
            if time.monotonic()>=deadline:raise ReadinessPending("READINESS_DEADLINE")
            time.sleep(min(0.001,max(0,deadline-time.monotonic())))
        need(os.WIFEXITED(status) and os.WEXITSTATUS(status)==0,"READINESS_PROBE_EXIT")
        if time.monotonic()>=deadline:raise ReadinessPending("READINESS_DEADLINE")
        kind,separator,data=b"".join(parts).partition(b"\n")
        need(bool(separator),"READINESS_PROBE_PROTOCOL")
        if kind==b"PENDING":raise ReadinessPending(data.decode("ascii","replace"))
        need(kind==b"OK",data.decode("ascii","replace") if kind==b"HOLD" else "READINESS_PROBE_PROTOCOL")
        return data
    finally:
        os.close(read_fd)
        if not reaped:
            try:os.killpg(pid,signal.SIGKILL)
            except ProcessLookupError:
                try:os.kill(pid,signal.SIGKILL)
                except ProcessLookupError:pass
            # Nonblocking cleanup cannot extend a failed readiness deadline.
            os.waitpid(pid,os.WNOHANG)

def surface_get(surface,path,maximum,deadline):
    packet=bounded_readiness_call(lambda:direct_surface_get(surface,path,maximum,deadline),maximum*2+8192,deadline)
    result=parse(packet)
    return bytes.fromhex(result["body_hex"]),result["provenance"]

def bounded_guard(guard,deadline):
    def inspect():
        guard();return b"GUARD_OK"
    need(bounded_readiness_call(inspect,64,deadline)==b"GUARD_OK","READINESS_GUARD_PROTOCOL")

def previous_build_asset(j):
    receipt=parse(root_file(E_ROOT_RECOVERY,65536))
    directory=pathlib.Path(receipt["durable_rollback"]["path"])
    need(receipt["durable_rollback"].get("build_id")==j["previous_build_id"],
         "E_PREVIOUS_STATIC_BUILD_ID_DRIFT")
    path="/_next/static/"+j["previous_build_id"]+"/_buildManifest.js"
    data=root_file(directory/"static"/j["previous_build_id"]/"_buildManifest.js",65536)
    return {"path":path,"bytes":len(data),"sha256":sha(data)}

def runtime_sample(expected_version,previous_version,asset,deadline,observation):
    versions={}
    for surface in ("origin","public"):
        raw,provenance=surface_get(surface,"/api/deployment-version",8192,deadline)
        observation.setdefault("requests",[]).append(provenance)
        try:body=parse(raw)
        except (ValueError,UnicodeError) as exc:raise Hold(surface.upper()+"_VERSION_INVALID") from exc
        need(type(body)==dict and type(body.get("buildVersion"))==str,
             surface.upper()+"_VERSION_INVALID")
        version=body["buildVersion"]
        observation[surface+"_version"]=version
        need(version in (expected_version,previous_version),surface.upper()+"_UNKNOWN_BUILD_VERSION")
        versions[surface]=version
    if any(version!=expected_version for version in versions.values()):
        raise ReadinessPending("KNOWN_PREVIOUS_VERSION_STILL_SERVED")
    for surface in ("origin","public"):
        raw,provenance=surface_get(surface,asset["path"],65536,deadline)
        observation.setdefault("requests",[]).append(provenance)
        observation[surface+"_static_bytes"]=len(raw)
        observation[surface+"_static_sha256"]=sha(raw)
        need(len(raw)==asset["bytes"] and sha(raw)==asset["sha256"],
             surface.upper()+"_BUILD_STATIC_BYTES_DRIFT")
    observation["status"]="MATCHED_VERSION_AND_STATIC_BYTES"
    return observation

def wait_runtime(expected_version,previous_version,asset,guard,seconds=60):
    # Four native guards cost ~14.6s on HEL1 before eight bounded HTTPS GETs.
    need(seconds==60,"FIXED_READINESS_BUDGET_REQUIRED")
    deadline=time.monotonic()+seconds
    observations=[];stable=0
    while True:
        observation={"attempt":len(observations)+1,"observed_at":datetime.now(timezone.utc).isoformat(),
                     "elapsed_seconds":round(seconds-(deadline-time.monotonic()),6)}
        try:
            bounded_guard(guard,deadline) # Config parse/six selectors are not runtime HTTP proof.
            if time.monotonic()>=deadline:raise ReadinessPending("READINESS_DEADLINE")
            runtime_sample(expected_version,previous_version,asset,deadline,observation)
            bounded_guard(guard,deadline)
            if time.monotonic()>=deadline:raise ReadinessPending("READINESS_DEADLINE")
            stable+=1
            observation["consecutive_matches"]=stable
        except ReadinessPending as exc:
            stable=0;observation["status"]="PENDING";observation["reason"]=str(exc)
        except BaseException as exc:
            observation["status"]="FAILED";observation["reason_type"]=type(exc).__name__
            observations.append(observation)
            exc.readiness_observations=observations
            raise
        observations.append(observation)
        if stable>=2:
            return {"schema":"aoe2war.r25.f.origin-public-readiness.v1",
                    "status":"TWO_FRESH_ORIGIN_AND_PUBLIC_VERSION_STATIC_MATCHES",
                    "budget_seconds":seconds,"samples":observations}
        remaining=deadline-time.monotonic()
        if remaining<=0 or len(observations)>=64:
            error=Hold("ORIGIN_PUBLIC_READINESS_TIMEOUT")
            error.readiness_observations=observations
            raise error
        time.sleep(min(0.5,remaining))
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

def record_failed_cutover(record,error,restore,production=False):
    """Keep immutable failure AND rollback outcome even when rollback fails."""
    failure={"schema":"aoe2war.app.production-failed-cutover.v1" if production else "aoe2war.r25.f.failed-cutover.v1","status":"FAILED_NOT_COMMITTED",
             "reason_type":type(error).__name__,"reason":str(error)[:160],
             "readiness_samples":getattr(error,"readiness_observations",[])}
    def persist(name,obj):
        try:
            durable_write(record/name,canonical(obj)+b"\n");fsyncdir(record)
        except Exception as exc:
            # Receipt storage failure must never prevent protective rollback.
            print("HOLD:R24_FAILURE_RECEIPT_UNAVAILABLE:"+type(exc).__name__,file=sys.stderr)
    persist("failure.json",failure)
    persist("automatic-rollback-attempt.json",{"status":"ORIGINAL_NGINX_RESTORE_ENTERED"})
    outcome={"schema":"aoe2war.app.production-automatic-rollback.v1" if production else "aoe2war.r25.f.automatic-rollback.v1","original_web_restarted":False}
    try:
        proof=restore()
        outcome.update({"status":"ORIGINAL_PROXY_RUNTIME_RESTORED","readiness":proof})
    except BaseException as exc:
        outcome.update({"status":"ROLLBACK_NOT_PROVEN","reason_type":type(exc).__name__,
                        "readiness_samples":getattr(exc,"readiness_observations",[])})
        print("HOLD:R24_PROXY_ROLLBACK_FAILED:"+type(exc).__name__,file=sys.stderr)
    persist("automatic-rollback.json",outcome)
    return outcome

def github_read(endpoint):
    # HEL1's existing authenticated owner CLI. Never copy or print its token.
    raw=cmd(["/usr/bin/gh","api","repos/Emaren/app-prodn/"+endpoint],25)
    need(0<len(raw)<=262144,"GITHUB_RESPONSE_BOUND")
    return parse(raw)

def grant_timestamp(value):
    need(type(value)is str and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z",value),
         "OWNER_GRANT_UTC_TIMESTAMP_REQUIRED")
    return datetime.fromisoformat(value[:-1]+"+00:00")

def consumed_previous(base,old):
    need(base["nonce"]==CONSUMED_NONCE and sha(old)==CONSUMED_BEFORE_SHA,
         "ACTUAL_CONSUMED_TRANSACTION_PREIMAGE_REQUIRED")
    previous=AUDIT_BASE/("r24-"+CONSUMED_NONCE)
    protected_dir(previous,0o700)
    need(sha(root_file(previous/"intent.json",8192))==CONSUMED_INTENT_SHA and
         sha(root_file(previous/"before-nginx.conf",131072))==CONSUMED_BEFORE_SHA and
         not (previous/"commit.json").exists() and not (previous/"commit.json").is_symlink(),
         "CONSUMED_PREVIOUS_TRANSACTION_DRIFT")
    return {"nonce":CONSUMED_NONCE,"intent_sha256":CONSUMED_INTENT_SHA,
            "before_nginx_sha256":CONSUMED_BEFORE_SHA,"no_commit":True,
            "current_exact_original_config":True}

def reread_c_session_guard_v3():
    """Rerun original B v4 and C protected host checks without mutations."""
    result=github_read("contents/scripts/r25_session_guard_release_v3.py?ref="+C_SESSION_GUARD_V3_SOURCE_SHA)
    need(result.get("type")=="file" and result.get("encoding")=="base64",
         "C_GUARD_V3_GITHUB_SOURCE_UNAVAILABLE")
    raw=base64.b64decode(result.get("content","").replace("\n",""),validate=True)
    need(0<len(raw)<=131072 and sha(raw)==C_SESSION_GUARD_V3_SOURCE_BYTES_SHA,
         "C_GUARD_V3_SOURCE_BYTES_DRIFT")
    module={"__name__":"r25_c_guard_readonly"}
    exec(compile(raw,"immutable_r25_guard_v3","exec"),module)
    native=module["c_baseline"](C_SESSION_GUARD_V3_GUARD_SHA,session=True)
    need(native.get("native_b_status")=="POSITIVE_ISOLATED_3031_NOT_PUBLIC_DEPLOYMENT_AUTHORITY"
         and native.get("native_b_physical_checks_performed")is True
         and native.get("public_pid")==2625090 and native.get("financial_authorized")is False,
         "C_GUARD_V3_CURRENT_B_C_PHYSICAL_PROOF_MISSING")
    return native

def qualified_runtime_v3(base,path,expected_digest):
    global RUNTIME_REQUALIFICATION
    need(type(path)is str and re.fullmatch(
         r"/var/lib/aoe2war-r25-c-additive/session-guard-v3-[0-9a-f]{32}/complete\.json",path)
         and type(expected_digest)is str and HEX64.fullmatch(expected_digest),
         "C_GUARD_V3_SEALED_ROOT_RECEIPT_PATH_REQUIRED")
    raw=root_file(pathlib.Path(path),32768)
    need(sha(raw)==expected_digest,"C_GUARD_V3_RECEIPT_SHA_MISMATCH")
    rec=parse(raw);before=rec.get("candidate_before",{});after=rec.get("candidate_after",{})
    need(rec.get("schema")=="aoe2war.r25.session-guard-release.v3"
         and rec.get("status")=="ISOLATED_3031_SESSION_GUARD_NATIVE_ACCEPT"
         and type(rec.get("nonce"))is str and NONCE.fullmatch(rec["nonce"])
         and pathlib.Path(path).parent.name=="session-guard-v3-"+rec["nonce"]
         and rec.get("source_sha")==C_SESSION_GUARD_V3_SOURCE_SHA
         and rec.get("candidate_guard_sha256")==C_SESSION_GUARD_V3_GUARD_SHA
         and before.get("candidate_pid")==1465429
         and before.get("candidate_start_ticks")==148192915
         and before.get("guard_sha256")==B_GUARD_SHA
         and after.get("guard_sha256")==C_SESSION_GUARD_V3_GUARD_SHA
         and after.get("native_b_status")=="POSITIVE_ISOLATED_3031_NOT_PUBLIC_DEPLOYMENT_AUTHORITY"
         and after.get("native_b_physical_checks_performed")is True
         and after.get("public_pid")==2625090
         and after.get("build_version")==base["candidate_build_version"]
         and type(after.get("candidate_pid"))is int and
             after["candidate_pid"] not in (2625090,1465429)
         and type(after.get("candidate_start_ticks"))is int and after["candidate_start_ticks"]>0
         and rec.get("session_key_equal_original")is True
         and rec.get("only_symmetric_signing_key")is True
         and rec.get("replayed_previous_nonces")is False
         and rec.get("financial_authorized")is False
         and rec.get("public_cutover_authorized")is False,
         "C_GUARD_V3_REAL_NATIVE_SUCCESS_RECEIPT_REQUIRED")
    grant=rec.get("owner_grant",{})
    need(type(grant.get("comment_id"))is int and grant["comment_id"]>0
         and type(grant.get("body_sha256"))is str and HEX64.fullmatch(grant["body_sha256"])
         and type(grant.get("ci_run"))is int and grant["ci_run"]>0,
         "C_GUARD_V3_ONE_USE_OWNER_GRANT_MISSING")
    owner=github_read("issues/comments/"+str(grant["comment_id"]))
    need(owner.get("user",{}).get("login")=="Emaren"
         and owner.get("user",{}).get("id")==15059910
         and owner.get("created_at")==owner.get("updated_at")
         and sha(owner.get("body","").encode())==grant["body_sha256"],
         "C_GUARD_V3_OWNER_GRANT_CHANGED")
    need(sha(root_file(pathlib.Path("/usr/local/lib/aoe2war-r25/r25_b_guard_session_v2.cjs"),16384))
         ==C_SESSION_GUARD_V3_GUARD_SHA,"C_GUARD_V3_INSTALLED_PROTECTION_CHANGED")
    observed=reread_c_session_guard_v3()
    need(observed==after,"C_GUARD_V3_PHYSICAL_CURRENT_VS_SIGNED_RECEIPT_DRIFT")
    RUNTIME_REQUALIFICATION=rec
    effective=dict(base)
    effective["candidate_web_snapshot_sha256"]=sha(unit_state(NEW_UNIT).encode())
    return effective

def qualified_runtime(base,path,digest):
    """Accept only an additive, root-sealed candidate-auth repair lineage."""
    global RUNTIME_REQUALIFICATION
    if type(path)is str and "/session-guard-v3-" in path:
        return qualified_runtime_v3(base,path,digest)
    need(type(path)is str and re.fullmatch(r"/var/lib/aoe2war-r25-c-additive/session-repair-[0-9a-f]{32}/complete\.json",path)
         and type(digest)is str and HEX64.fullmatch(digest),"EXACT_RUNTIME_REQUALIFICATION_REQUIRED")
    raw=root_file(pathlib.Path(path),32768)
    need(sha(raw)==digest,"RUNTIME_REQUALIFICATION_BYTES_CHANGED")
    rec=parse(raw)
    need(rec.get("schema")=="aoe2war.r25.c.session-continuity-repair.v1"
         and rec.get("status")=="SESSION_CONTINUITY_REPAIRED_AND_REQUALIFIED"
         and type(rec.get("nonce"))is str and NONCE.fullmatch(rec["nonce"])
         and pathlib.Path(path).parent.name=="session-repair-"+rec["nonce"],"AUTH_REPAIR_NATIVE_COMPLETION_REQUIRED")
    need(rec.get("base_approved_sha256")==BASE_APPROVED_SHA
         and rec.get("before_witness_sha256")==PRESERVED_BEFORE_SHA
         and rec.get("candidate_sha")==TARGET
         and rec.get("candidate_build_id")==base["candidate_build_id"]
         and rec.get("candidate_build_version")==base["candidate_build_version"]
         and rec.get("original_pid")==2625090 and rec.get("original_start_ticks")==103836850
         and rec.get("previous_candidate_pid")==1118556 and rec.get("previous_candidate_start_ticks")==142541543
         and type(rec.get("candidate_pid"))is int and rec["candidate_pid"]>1
         and rec["candidate_pid"] not in (2625090,1118556)
         and type(rec.get("candidate_start_ticks"))is int and rec["candidate_start_ticks"]>0
         and rec.get("candidate_uid")==993,"AUTH_REPAIR_EXACT_RUNTIME_LINEAGE_REQUIRED")
    need(type(rec.get("source_sha"))is str and HEX40.fullmatch(rec["source_sha"])
         and rec["source_sha"]==C_SESSION_REPAIR_SOURCE_SHA,"AUTH_REPAIR_SOURCE_IDENTITY_DRIFT")
    need(all(rec.get(key)is True for key in ("signer_present","signer_equal_original","db_env_unchanged",
         "nft_unchanged","guard_unchanged","finance_unchanged","old_web_unchanged"))
         and rec.get("secret_values_disclosed")is False and rec.get("financial_authorized")is False,
         "AUTH_REPAIR_SESSION_OR_CONFINEMENT_NOT_PROVEN")
    need(rec.get("f_candidate_before_sha256")==base["candidate_web_snapshot_sha256"]
         and rec.get("g_candidate_unit_before_sha256")=="d50b3d9f584fb38a5dd47154c9da89a2d5dc5c16ef26c1e5f53d594dd273ecf1"
         and rec.get("g_candidate_listener_before_sha256")=="11ac63c78d166db59089fa895a063a34188868b3f0aa1453606da8b515f70d1e",
         "AUTH_REPAIR_NOT_BOUND_TO_IMMUTABLE_A04_RUNTIME")
    for key in ("f_candidate_after_sha256","g_candidate_unit_after_sha256","g_candidate_listener_after_sha256"):
        need(type(rec.get(key))is str and HEX64.fullmatch(rec[key]),"AUTH_REPAIR_NATIVE_SNAPSHOT_HASH_REQUIRED")
    folder=pathlib.Path(path).parent
    for key,filename in (("b_poststart","b-poststart.json"),("c_security","c-runtime.json")):
        evidence=rec.get(key,{})
        need(type(evidence)is dict and evidence.get("path")==str(folder/filename)
             and type(evidence.get("sha256"))is str and HEX64.fullmatch(evidence["sha256"]),
             "AUTH_REPAIR_SEPARATE_B_C_RECEIPTS_REQUIRED")
        data=root_file(folder/filename,65536)
        need(sha(data)==evidence["sha256"],"AUTH_REPAIR_B_C_RECEIPT_BYTES_CHANGED")
        if key=="c_security":
            c=parse(data)
            need(c.get("schema")=="aoe2war.r25.c.session-runtime-security.v1"
                 and c.get("status")=="CONFINEMENT_AND_SESSION_IDENTITY_NATIVE_PASS"
                 and c.get("candidate_pid")==rec["candidate_pid"]
                 and c.get("candidate_uid")==993 and c.get("candidate_start_ticks")==rec["candidate_start_ticks"]
                 and all(c.get(k)is True for k in ("signer_present","signer_equal_original","pg_select_only",
                     "nft_unchanged","guard_unchanged","finance_unchanged","old_web_unchanged","db_env_unchanged"))
                 and c.get("financial_authorized")is False,"AUTH_REPAIR_C_NATIVE_SECURITY_REQUIRED")
    RUNTIME_REQUALIFICATION=rec
    effective=dict(base)
    effective.update(candidate_web_snapshot_sha256=rec["f_candidate_after_sha256"],
                     B_poststart_sha256=rec["b_poststart"]["sha256"])
    return effective

def cutover_plan(options):
    global RUNTIME_REQUALIFICATION
    RUNTIME_REQUALIFICATION=None
    need(sys.platform=="linux" and socket.gethostname()==HOST and os.geteuid()==0,
         "EXACT_HEL1_ROOT_REQUIRED")
    need(type(options.new_nonce)is str and NONCE.fullmatch(options.new_nonce) and
         options.new_nonce!=CONSUMED_NONCE,"FRESH_CUTOVER_NONCE_REQUIRED")
    need(type(options.source_sha)is str and HEX40.fullmatch(options.source_sha),"EXACT_SOURCE_COMMIT_REQUIRED")
    for value in (options.engine_source_sha256,options.owner_source_sha256,options.g_source_sha256):
        need(type(value)is str and HEX64.fullmatch(value),"EXACT_REVIEWED_EXECUTABLE_HASH_REQUIRED")
    need(options.before_witness_sha256==PRESERVED_BEFORE_SHA,"ACCEPTED_G_BEFORE_REQUIRED")
    lock_check();protected_dir(ROOT_APPROVAL.parent,0o700)
    base_raw=root_file(ROOT_APPROVAL,16384)
    need(sha(base_raw)==BASE_APPROVED_SHA,"IMMUTABLE_A04_APPROVAL_DRIFT")
    base=approval(base_raw)
    if getattr(options,"runtime_requalification_receipt",None) or getattr(options,"runtime_requalification_sha256",None):
        base=qualified_runtime(base,options.runtime_requalification_receipt,options.runtime_requalification_sha256)
    record=AUDIT_BASE/("r24-"+options.new_nonce)
    protected_dir(AUDIT_BASE,0o700)
    need(not record.exists() and not record.is_symlink(),"REPLAY_OR_PARTIAL_TRANSACTION")
    old=root_file(VHOST,131072)
    need(sha(old)==base["nginx_before_sha256"],"ACTUAL_NGINX_REVIEWED_PREIMAGE_DRIFT")
    previous=consumed_previous(base,old)
    nginx_loaded_vhost(old,VHOST,old_count=6)
    candidate=safe_replace_site(old,NEW_UPSTREAM)
    state=snapshots_during_bounded_timer_quiescence(base["finance_units"]);prove_preimage(base,state)
    stage_identity(base);verified_b_poststart(base,state);verified_durable_e_rollback(base)
    need(http_version(OLD_PORT)==PRESERVED_PREVIOUS_VERSION and
         http_version(NEW_PORT)==base["candidate_build_version"],"EXACT_WEB_RUNTIME_VERSIONS_REQUIRED")
    runtime_sample(PRESERVED_PREVIOUS_VERSION,base["candidate_build_version"],previous_build_asset(base),
                   time.monotonic()+15,{})
    old_fields=dict(row.split("=",1) for row in state["original_web"].splitlines() if "=" in row)
    new_fields=dict(row.split("=",1) for row in state["candidate_web"].splitlines() if "=" in row)
    need(old_fields.get("MainPID")=="2625090" and int(new_fields.get("MainPID","0"))>1,
         "EXACT_LIVE_PID_REQUIRED")
    plan={"schema":"aoe2war.r25.f.cutover-plan.v1","nonce":options.new_nonce,
          "source_sha":options.source_sha,"engine_source_sha256":options.engine_source_sha256,
          "owner_source_sha256":options.owner_source_sha256,"g_source_sha256":options.g_source_sha256,
          "base_approved_sha256":sha(base_raw),"before_witness_sha256":PRESERVED_BEFORE_SHA,
          "candidate_sha":TARGET,"candidate_build_id":base["candidate_build_id"],
          "candidate_build_version":base["candidate_build_version"],
          "nginx_before_sha256":sha(old),"nginx_after_sha256":sha(candidate),
          "old_web_pid":int(old_fields["MainPID"]),"old_web_start_ticks":int(old_fields["ProcStartTicks"]),
          "candidate_pid":int(new_fields["MainPID"]),"candidate_start_ticks":int(new_fields["ProcStartTicks"]),
          "protected_snapshot_sha256":sha(canonical(state)),"consumed_previous_transaction":previous,
          "public_cutover_authorized":False,"financial_authorized":False}
    if RUNTIME_REQUALIFICATION is not None:
        plan.update(runtime_requalification_path=options.runtime_requalification_receipt,
                    runtime_requalification_sha256=options.runtime_requalification_sha256)
    return {"schema":"aoe2war.r25.f.cutover-plan-envelope.v1",
            "status":"PASS_READ_ONLY_CUTOVER_PLAN_NOT_AUTHORITY","plan":plan,"plan_sha256":sha(canonical(plan))},base

def validate_owner_grant(comment_id,body_sha,envelope,now=None):
    need(type(comment_id)is str and re.fullmatch(r"[0-9]{1,20}",comment_id) and int(comment_id)>0 and
         type(body_sha)is str and HEX64.fullmatch(body_sha),"EXACT_OWNER_COMMENT_PIN_REQUIRED")
    cid=str(int(comment_id));obj=github_read("issues/comments/"+cid)
    need(type(obj)is dict and obj.get("id")==int(cid) and
         obj.get("html_url")=="https://github.com/Emaren/app-prodn/issues/1108#issuecomment-"+cid and
         obj.get("issue_url")=="https://api.github.com/repos/Emaren/app-prodn/issues/1108" and
         obj.get("user",{}).get("login")=="Emaren" and obj.get("user",{}).get("id")==15059910,
         "ACTUAL_EMAREN_MASTER_GRANT_REQUIRED")
    body=obj.get("body","")
    need(type(body)is str and sha(body.encode())==body_sha and obj.get("created_at")==obj.get("updated_at"),
         "OWNER_GRANT_CHANGED_OR_EDITED")
    block=re.fullmatch(r"R25_F_OWNER_TRANSACTION_GRANT\n```json\n(.+)\n```\n?",body,re.S)
    need(block is not None,"OWNER_GRANT_FORMAT")
    grant=parse(block[1]);plan=envelope["plan"]
    need(type(grant)is dict and grant.get("schema")=="aoe2war.r25.f.owner-transaction-grant.v1" and
         grant.get("scope")=="A05_NGINX_ONLY_PUBLIC_CUTOVER" and grant.get("decision")=="AUTHORIZE" and
         grant.get("owner_login")=="Emaren" and grant.get("release_authority")=="OWNER_ONLY_NONFINANCIAL" and
         grant.get("owner_delegated_decisions")is True and grant.get("delegated_ai_authorship_disclosed")is True and
         grant.get("independent_review")is False and grant.get("financial_authorized")is False and
         grant.get("public_cutover_authorized")is True and grant.get("rollback_authorized")is True and
         type(grant.get("max_uses"))is int and grant["max_uses"]==1,"EXACT_NONFINANCIAL_OWNER_GRANT_REQUIRED")
    instant=now or datetime.now(timezone.utc)
    issued=grant_timestamp(grant.get("issued_at"));expires=grant_timestamp(grant.get("expires_at"))
    created=grant_timestamp(obj.get("created_at"))
    need(0<(expires-issued).total_seconds()<=600 and issued<=created<=instant<=expires,
         "OWNER_GRANT_EXPIRED_FUTURE_OR_LONG_TTL")
    need(grant.get("plan_sha256")==envelope["plan_sha256"],"OWNER_GRANT_PLAN_DRIFT")
    for key in ("nonce","source_sha","engine_source_sha256","owner_source_sha256","g_source_sha256",
                "base_approved_sha256","before_witness_sha256","candidate_sha","candidate_build_id",
                "candidate_build_version","nginx_before_sha256","nginx_after_sha256"):
        need(grant.get(key)==plan[key],"OWNER_GRANT_TRANSACTION_DRIFT:"+key)
    for key in ("runtime_requalification_path","runtime_requalification_sha256"):
        need(grant.get(key)==plan.get(key),"OWNER_GRANT_RUNTIME_REQUALIFICATION_DRIFT:"+key)
    ci=grant.get("exact_head_ci",{})
    need(type(ci)is dict and type(ci.get("run_id"))is int and ci["run_id"]>0 and
         ci.get("head_sha")==plan["source_sha"] and ci.get("conclusion")=="success" and
         ci.get("all_three_jobs_success")is True,"OWNER_GRANT_CI_BINDING_REQUIRED")
    run=github_read("actions/runs/"+str(ci["run_id"]))
    jobs=github_read("actions/runs/"+str(ci["run_id"])+"/jobs?filter=latest&per_page=100")
    expected={"Release and documentation control plane","Type, contract, and production build",
              "Isolated Steam-rating PostgreSQL chronology"}
    need(run.get("head_sha")==plan["source_sha"] and run.get("name")=="AoE2WAR CI" and
         run.get("status")=="completed" and run.get("conclusion")=="success" and
         jobs.get("total_count")==3 and len(jobs.get("jobs",[]))==3 and
         {job.get("name") for job in jobs["jobs"]}==expected and
         all(job.get("status")=="completed" and job.get("conclusion")=="success" for job in jobs["jobs"]),
         "ACTUAL_EXACT_HEAD_THREE_JOB_CI_REQUIRED")
    for name,path in (("engine","scripts/aoe2_r24_f_parallel_nginx_cutover.py"),
                      ("owner","scripts/aoe2_r24_f_parallel_nginx_mac.py"),
                      ("g","scripts/aoe2_r25_f_g_parallel_observer.py")):
        source=github_read("contents/"+path+"?ref="+plan["source_sha"])
        need(source.get("type")=="file" and source.get("encoding")=="base64" and
             type(source.get("content"))is str,"IMMUTABLE_EXECUTABLE_CONTENT_REQUIRED")
        raw=base64.b64decode(source["content"].replace("\n",""),validate=True)
        need(0<len(raw)<=131072 and sha(raw)==plan[name+"_source_sha256"],"EXACT_SOURCE_BYTES_DRIFT:"+name)
    # Expiry can elapse while querying CI/sources. Recheck before returning.
    if now is None:need(datetime.now(timezone.utc)<=expires,"OWNER_GRANT_EXPIRED_DURING_VERIFICATION")
    return {"schema":"aoe2war.r25.f.owner-transaction-authorization.v1",
            "envelope":{"id":obj["id"],"url":obj["html_url"],"issue_url":obj["issue_url"],
                        "author":"Emaren","author_id":15059910,"body":body,"body_sha256":body_sha,
                        "created_at":obj["created_at"],"updated_at":obj["updated_at"]},
            "manifest":grant,"plan":plan,"plan_sha256":envelope["plan_sha256"]}

def apply_owner_grant(options):
    envelope,base=cutover_plan(options)
    need(envelope["plan_sha256"]==options.plan_sha256,"OWNER_APPROVED_NATIVE_PLAN_CHANGED")
    owner_record=validate_owner_grant(options.grant_comment,options.grant_sha256,envelope)
    new_approval=dict(base);new_approval["nonce"]=options.new_nonce
    bindings={key:envelope["plan"][key] for key in
              ("base_approved_sha256","before_witness_sha256","source_sha","engine_source_sha256","owner_source_sha256","g_source_sha256")}
    bindings.update({"new_approval_sha256":sha(canonical(new_approval)+b"\n"),
                     "owner_authorization_body_sha256":options.grant_sha256})
    if RUNTIME_REQUALIFICATION is not None:
        bindings.update(runtime_requalification_path=envelope["plan"]["runtime_requalification_path"],
                        runtime_requalification_sha256=envelope["plan"]["runtime_requalification_sha256"])
    def refresh():
        actual=validate_owner_grant(options.grant_comment,options.grant_sha256,envelope)
        need(actual==owner_record,"OWNER_GRANT_REVOKED_OR_CHANGED_AT_SEAM")
        need(sha(canonical(snapshots_during_bounded_timer_quiescence(base["finance_units"])))==envelope["plan"]["protected_snapshot_sha256"],
             "OWNER_APPROVED_PROTECTED_STATE_CHANGED")
        need(datetime.now(timezone.utc)<=grant_timestamp(owner_record["manifest"]["expires_at"]),
             "OWNER_GRANT_EXPIRED_AT_MUTATION_SEAM")
    apply({"approval":new_approval,"bindings":bindings,"owner_record":owner_record,"refresh":refresh})

def apply(authorized=None):
    need(sys.platform=="linux" and socket.gethostname()==HOST and os.geteuid()==0,
         "EXACT_HEL1_ROOT_REQUIRED")
    lock_check()
    protected_dir(ROOT_APPROVAL.parent,0o700)
    j=approval(root_file(ROOT_APPROVAL,16384)) if authorized is None else authorized["approval"]
    nonce=j["nonce"];record=AUDIT_BASE/("r24-"+nonce)
    protected_dir(AUDIT_BASE,0o700)
    need(not record.exists() and not record.is_symlink(),"REPLAY_OR_PARTIAL_TRANSACTION")
    config=pathlib.Path(j["nginx_config"])
    need(config==VHOST,"NGINX_DIFFERENT_ACTIVE_VHOST_NOT_APPROVED")
    old=root_file(config,131072)
    need(sha(old)==j["nginx_before_sha256"],"ORIGINAL_NGINX_BYTES_DRIFT")
    nginx_loaded_vhost(old,config)
    candidate=safe_replace_site(old,NEW_UPSTREAM)
    s=snapshots_during_bounded_timer_quiescence(j["finance_units"]);prove_preimage(j,s)
    candidate_asset=stage_identity(j)
    verified_b_poststart(j,s)
    verified_durable_e_rollback(j)
    previous_version=http_version(OLD_PORT)
    need(previous_version==PRESERVED_PREVIOUS_VERSION and previous_version!=j["candidate_build_version"] and
         http_version(NEW_PORT)==j["candidate_build_version"],
         "CANDIDATE_NOT_ISOLATED_FROM_OLD_WEB")
    previous_asset=previous_build_asset(j)
    runtime_sample(previous_version,j["candidate_build_version"],previous_asset,
                   time.monotonic()+15,{})
    fd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        st=os.fstat(fd)
        need((st.st_dev,st.st_ino,st.st_uid,stat.S_IMODE(st.st_mode))==LOCK_ID,
             "RELEASE_FD_DRIFT")
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as exc:raise Hold("RELEASE_LOCK_BUSY") from exc
        lock_check()
        need(snapshots_during_bounded_timer_quiescence(j["finance_units"])==s,"FINANCE_OR_OLD_WEB_DRIFT_AT_SEAM")
        need(root_file(config,131072)==old,"NGINX_BEFORE_RACE")
        nginx_loaded_vhost(old,config)
        if authorized is not None:authorized["refresh"]()
        os.mkdir(record,0o700);protected_dir(record,0o700)
        authority={} if authorized is None else authorized["bindings"]
        if authorized is not None:
            durable_write(record/"approval.json",canonical(j)+b"\n")
            durable_write(record/"owner-authorization.json",canonical(authorized["owner_record"])+b"\n")
        durable_write(record/"before-nginx.conf",old)
        durable_write(record/"intent.json",canonical({"schema":SCHEMA,"nonce":nonce,
             "candidate_sha":TARGET,"old_unit_pid_unchanged":True,
             "before_nginx_sha256":sha(old),"after_nginx_sha256":sha(candidate),**authority})+b"\n")
        fsyncdir(record);fsyncdir(AUDIT_BASE)
        forward_started=False
        try:
            if authorized is not None:
                need(datetime.now(timezone.utc)<=grant_timestamp(authorized["owner_record"]["manifest"]["expires_at"]),
                     "OWNER_GRANT_EXPIRED_AT_FORWARD_WRITE")
            forward_started=True
            replace_existing(config,candidate)
            nginx_reload()
            nginx_loaded_vhost(candidate,config,old_count=0)
            def candidate_guard():
                nginx_loaded_vhost(candidate,config,old_count=0)
                need(snapshots_during_bounded_timer_quiescence(j["finance_units"])==s,"FINANCE_OR_OLD_WEB_CHANGED_ON_PROXY_SWITCH")
            readiness=wait_runtime(j["candidate_build_version"],previous_version,candidate_asset,candidate_guard)
            durable_write(record/"readiness.json",canonical(readiness)+b"\n");fsyncdir(record)
            need(snapshots_during_bounded_timer_quiescence(j["finance_units"])==s,
                 "FINANCE_OR_OLD_WEB_CHANGED_ON_PROXY_SWITCH")
            durable_write(record/"commit.json",canonical({
                "status":"R24_PARALLEL_WEBSITE_LIVE",
                "candidate_sha":TARGET,"nonce":nonce,
                "candidate_build_id":j["candidate_build_id"],
                "candidate_build_version":j["candidate_build_version"],
                "original_web_still_running":True,
                "old_nginx_sha256":sha(old),
                "new_nginx_sha256":sha(candidate),
                "readiness_sha256":sha(canonical(readiness)),**authority})+b"\n")
            fsyncdir(record)
            print("PASS:R24_PARALLEL_PUBLIC_WEBSITE_CUTOVER; ORIGINAL_WEB_MAINPID_PRESERVED")
        except BaseException as error:
            print("HOLD:R24_PROXY_CUTOVER_FAILED_RESTORING_ORIGINAL_NGINX",
                  file=sys.stderr)
            def restore():
                if forward_started:
                    replace_existing(config,old);nginx_reload()
                else:
                    need(root_file(config,131072)==old,"ORIGINAL_NGINX_CHANGED_WITHOUT_FORWARD_WRITE")
                nginx_loaded_vhost(old,config,old_count=6)
                def original_guard():
                    nginx_loaded_vhost(old,config,old_count=6)
                    need(protected_continuity(snapshots_during_bounded_timer_quiescence(j["finance_units"]))==protected_continuity(s),
                         "PROTECTED_IDENTITY_DRIFT_DURING_ROLLBACK")
                return wait_runtime(previous_version,j["candidate_build_version"],previous_asset,original_guard)
            record_failed_cutover(record,error,restore)
            raise
    finally:os.close(fd)
def manual_rollback(nonce,transaction=False):
    need(sys.platform=="linux" and socket.gethostname()==HOST and os.geteuid()==0,
         "EXACT_HEL1_ROOT_REQUIRED")
    need(bool(NONCE.fullmatch(nonce)),"ROLLBACK_NONCE_INVALID")
    lock_check()
    protected_dir(ROOT_APPROVAL.parent,0o700)
    record=AUDIT_BASE/("r24-"+nonce)
    base_raw=root_file(ROOT_APPROVAL,16384)
    j=approval(base_raw)
    if transaction:
        need(sha(base_raw)==BASE_APPROVED_SHA and NONCE.fullmatch(nonce) and nonce!=CONSUMED_NONCE,
             "ROLLBACK_TRANSACTION_BASE_DRIFT")
        new_raw=root_file(record/"approval.json",16384)
        owner=parse(root_file(record/"owner-authorization.json",262144))
        need(owner.get("schema")=="aoe2war.r25.f.owner-transaction-authorization.v1" and
             owner.get("manifest",{}).get("rollback_authorized")is True and
             owner.get("manifest",{}).get("nonce")==nonce and
             owner.get("manifest",{}).get("financial_authorized")is False,
             "RECORDED_TRANSACTION_ROLLBACK_AUTHORITY_REQUIRED")
        plan=owner.get("plan",{})
        if plan.get("runtime_requalification_path"):
            # A successful sealed commit already authorized restoration. Do
            # not require a healthy candidate, unexpired grant or separate
            # runtime evidence file to protect the original public service.
            selected=parse(new_raw)
            for field in ("candidate_web_snapshot_sha256","B_poststart_sha256"):
                need(type(selected.get(field))is str and HEX64.fullmatch(selected[field]),
                     "ROLLBACK_RECORDED_RUNTIME_BINDING_INVALID")
                j[field]=selected[field]
            for field in ("runtime_requalification_path","runtime_requalification_sha256"):
                need(owner.get("manifest",{}).get(field)==plan.get(field),
                     "ROLLBACK_RECORDED_RUNTIME_AUTHORITY_DRIFT")
        expected=dict(j);expected["nonce"]=nonce
        need(parse(new_raw)==expected,"ROLLBACK_NEW_APPROVAL_SCOPE_DRIFT")
        j=expected
    need(j["nonce"]==nonce,"ROLLBACK_OWNER_SCOPE_INVALID")
    protected_dir(record,0o700)
    commit=parse(root_file(record/"commit.json",8192))
    need(commit["status"]=="R24_PARALLEL_WEBSITE_LIVE" and
         commit["candidate_sha"]==TARGET and
         commit["nonce"]==nonce,"ROLLBACK_COMMIT_IDENTITY")
    if transaction:
        need(commit.get("base_approved_sha256")==sha(base_raw) and
             commit.get("new_approval_sha256")==sha(new_raw) and
             commit.get("owner_authorization_body_sha256")==sha(owner["envelope"]["body"].encode()),
             "ROLLBACK_RECORDED_COMMIT_AUTHORITY_DRIFT")
    need(not (record/"rollback.json").exists(),"ROLLBACK_ALREADY_ATTEMPTED")
    need(not (record/"rollback-attempt.json").exists() and not (record/"rollback-attempt.json").is_symlink(),
         "ROLLBACK_ALREADY_ENTERED_INSPECT_NATIVE_STATE")
    old=root_file(record/"before-nginx.conf",131072)
    need(sha(old)==commit["old_nginx_sha256"],
         "ORIGINAL_NGINX_ROLLBACK_BYTES_DRIFT")
    config=pathlib.Path(j["nginx_config"])
    need(config==VHOST,"ROLLBACK_NGINX_DIFFERENT_VHOST_NOT_APPROVED")
    current=root_file(config,131072)
    nginx_loaded_vhost(current,config,old_count=0)
    need(sha(current)==commit["new_nginx_sha256"],
         "LIVE_NGINX_NOT_EXACT_CANDIDATE")
    s=snapshots_during_bounded_timer_quiescence(j["finance_units"])
    prove_rollback_preimage(j,s)
    lockfd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        try:fcntl.flock(lockfd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as err:raise Hold("ROLLBACK_GLOBAL_LOCK_BUSY") from err
        lock_check()
        need(protected_continuity(snapshots_during_bounded_timer_quiescence(j["finance_units"]))==
             protected_continuity(s),
             "FINANCIAL_ORIGINAL_WEB_DRIFT_BEFORE_ROLLBACK")
        try:
            durable_write(record/"rollback-attempt.json",canonical({"nonce":nonce,
                 "status":"ORIGINAL_NGINX_RESTORE_ENTERED","owner_grant_expiry_blocks_rollback":False})+b"\n")
            fsyncdir(record)
        except Exception as error:
            # A full journal filesystem cannot veto already-authorized safety.
            print("HOLD:R24_ROLLBACK_ATTEMPT_RECEIPT_UNAVAILABLE:"+type(error).__name__,file=sys.stderr)
        replace_existing(config,old)
        nginx_reload()
        nginx_loaded_vhost(old,config,old_count=6)
        def original_guard():
            nginx_loaded_vhost(old,config,old_count=6)
            need(protected_continuity(snapshots_during_bounded_timer_quiescence(j["finance_units"]))==protected_continuity(s),
                 "FINANCIAL_ORIGINAL_WEB_DRIFT_AFTER_ROLLBACK")
        readiness=wait_runtime(PRESERVED_PREVIOUS_VERSION,j["candidate_build_version"],
                               previous_build_asset(j),original_guard)
        need(protected_continuity(snapshots_during_bounded_timer_quiescence(j["finance_units"]))==
             protected_continuity(s),
             "FINANCIAL_ORIGINAL_WEB_DRIFT_AFTER_ROLLBACK")
        durable_write(record/"rollback.json",canonical({"status":"OLD_PUBLIC_PROXY_RESTORED",
             "nonce":nonce,"old_config_sha256":sha(old),"original_web_restarted":False,
             "readiness":readiness})+b"\n")
        fsyncdir(record)
        print("PASS:R24_OLD_WEB_PROXY_RESTORED; ORIGINAL_WEB_MAINPID_UNCHANGED")
    except BaseException as error:
        try:
            durable_write(record/"rollback-failure.json",canonical({"status":"ROLLBACK_NOT_CERTIFIED",
                 "nonce":nonce,"reason_type":type(error).__name__,
                 "readiness_samples":getattr(error,"readiness_observations",[])})+b"\n")
            fsyncdir(record)
        except Exception:
            print("HOLD:R24_ROLLBACK_FAILURE_RECEIPT_UNAVAILABLE",file=sys.stderr)
        raise
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
        witness=snapshots_during_bounded_timer_quiescence(j["finance_units"])
        prove_preimage(j,witness)
        stage_identity(j)
        verified_b_poststart(j,witness)
        verified_durable_e_rollback(j)
    print(canonical({"schema":"aoe2war.r25.f.owner-intent.v1",
        "engine_source_sha256":admitted_evidence()["engine_sha256"],
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
# Separate successor profile: never reinterpret a frozen R25 preview receipt.
PRODUCTION_POLICY=pathlib.Path('/etc/aoe2war/web-prod-v1/approved-profile.json')
PRODUCTION_AUDIT=pathlib.Path('/var/lib/aoe2war-app-production-f')
PRODUCTION_UPSTREAM=b'proxy_pass http://127.0.0.1:3032;'
PRODUCTION_METHOD_CHECK=(b'set $aoe2war_prod_method "$request_method:$uri";\n        '
 b'if ($aoe2war_prod_method !~ "^(GET|HEAD):/|^POST:/api/(auth/session|user/ping)$|^DELETE:/api/auth/session$") { return 405; }')
# Exact GET handlers independently shown to seed or pay financial records.
# This honest temporary HOLD ends only with reviewed read-only route source.
PRODUCTION_FINANCIAL_GET_HOLD=(b'if ($uri ~ "^/api/admin/(trophies|users)/?$") { return 503; }')

def production_replace_site(original):
    lo,hi,body=scoped_https(original)
    need(original.count(OLD_UPSTREAM)==6 and b'proxy_pass http://127.0.0.1:3031;' not in original and PRODUCTION_UPSTREAM not in original,
         'PRODUCTION_EXACT_SIX_OLD_SELECTORS_REQUIRED')
    found=set();changes=[]
    for match in re.finditer(rb'(?m)^[ \t]*location[ \t]+([^{}\r\n]+)[ \t]*\{',body):
        label=b' '.join(match.group(1).split());op=body.index(b'{',match.start(),match.end());end=match_brace(body,op)
        contents=body[op+1:end]
        if OLD_UPSTREAM not in contents:continue
        need(label in WEB_LOCATIONS and label not in found and contents.count(OLD_UPSTREAM)==1 and
             len(re.findall(rb'(?m)^[ \t]*proxy_pass\b',contents))==1,'PRODUCTION_UNREVIEWED_WEB_LOCATION')
        need(contents.count(METHOD_CHECK)<=1,'PRODUCTION_DUPLICATED_EXISTING_GUARD')
        contents=contents.replace(METHOD_CHECK,b'')
        need(b'limit_except' not in contents and not re.search(rb'(?m)^[ \t]*if[ \t]*\(',contents),'PRODUCTION_UNREVIEWED_EXISTING_GUARD')
        found.add(label);guard=PRODUCTION_METHOD_CHECK if label==b'^~ /api/' else METHOD_CHECK
        if label==b'^~ /api/':guard+=b'\n        '+PRODUCTION_FINANCIAL_GET_HOLD
        changes.append((op+1,end,b'\n        '+guard+b'\n'+contents.replace(OLD_UPSTREAM,PRODUCTION_UPSTREAM)))
    need(found==WEB_LOCATIONS and len(changes)==6,'PRODUCTION_SIX_SELECTORS_NOT_ALL_FOUND')
    updated=bytearray(body)
    for start,end,value in reversed(changes):updated[start:end]=value
    output=original[:lo]+bytes(updated)+original[hi:]
    need(output.count(PRODUCTION_UPSTREAM)==6 and OLD_UPSTREAM not in output and
         b'proxy_pass http://127.0.0.1:27657' in output and b'proxy_pass http://127.0.0.1:1318' in output,
         'PRODUCTION_SELECTOR_OR_WOLO_ROUTE_DRIFT')
    return output

def production_load_g(raw,expected,path='<reviewed-production-G>'):
    need(0<len(raw)<=196608 and sha(raw)==expected,'PRODUCTION_G_SOURCE_PIN')
    module=types.ModuleType('aoe2war_production_g_native');module.__file__=str(path)
    exec(compile(raw,str(path),'exec'),module.__dict__)
    need(callable(getattr(module,'production_native_snapshot',None)),'PRODUCTION_REVIEWED_G_MODE_REQUIRED')
    return module

def production_before(raw,expected,nonce):
    need(0<len(raw)<=65536 and sha(raw)==expected,'PRODUCTION_EXACT_G_BEFORE_BYTES_REQUIRED')
    before=parse(raw)
    need(before.get('schema')=='aoe2war.g.app-production.v1' and before.get('phase')=='before' and
         before.get('nonce')==nonce and before.get('status')=='PRODUCTION_G_BEFORE_PASS_PENDING_REAL_AUTHENTICATED_BROWSER' and
         before.get('nginx',{}).get('upstream_port')==3030 and before.get('nginx',{}).get('selectors')==6 and
         before.get('mac_public')==before.get('old_http') and before.get('financial_authorized') is False and
         HEX40.fullmatch(before.get('source_sha','')) and HEX40.fullmatch(before.get('controller_source_sha','')),
         'PRODUCTION_G_BEFORE_REAL_MAC_PUBLIC_PROOF_REQUIRED')
    return before

def production_protected(g):
    units=g.stable_system_state_during_timer_quiescence()
    units={name:value for name,value in units.items() if name not in g.PRODUCTION_OWNED_UNITS}
    need(units[OLD_UNIT]['properties']['MainPID']=='2625090' and units[NEW_UNIT]['properties']['MainPID']=='1483304',
         'PRODUCTION_ORIGINAL_OR_PREVIEW_PID_DRIFT')
    ports={str(port):g.listening_socket(port) for port in (3030,3031,8092,8093)}
    need(ports['3030']['pid']==2625090 and ports['3031']['pid']==1483304,'PRODUCTION_PROTECTED_LISTENER_DRIFT')
    return {'protected_units_sha256':g.digest(g.canon(units)),'ports':ports,'release_lock':g.lock_state()}

def production_require_protected(g,before):
    actual=production_protected(g)
    expected={key:before[key] for key in ('protected_units_sha256','release_lock')}
    expected['ports']={str(port):before['ports'][str(port)] for port in (3030,3031,8092,8093)}
    need(actual==expected,'PRODUCTION_FINANCE_OR_ORIGINAL_PREVIEW_CONTINUITY_DRIFT')

def production_record(nonce):
    need(type(nonce)is str and NONCE.fullmatch(nonce),'PRODUCTION_FRESH_NONCE_FORMAT')
    need(nonce!=CONSUMED_NONCE and not (AUDIT_BASE/('r24-'+nonce)).exists() and not (AUDIT_BASE/('r24-'+nonce)).is_symlink(),
         'PRODUCTION_HISTORIC_CONSUMED_NONCE_MUST_NOT_BE_REUSED')
    return PRODUCTION_AUDIT/('cutover-'+nonce)

def production_qualified_g(source_sha,g_sha256):
    committed=github_read('contents/scripts/aoe2_r25_f_g_parallel_observer.py?ref='+source_sha)
    need(committed.get('type')=='file' and committed.get('encoding')=='base64','PRODUCTION_COMMITTED_G_SOURCE_REQUIRED')
    raw=base64.b64decode(committed.get('content','').replace('\n',''),validate=True)
    return raw,production_load_g(raw,g_sha256)

def production_application_tree(candidate,controller):
    # Four small authenticated Git-object reads replace any full-tree scan.
    # Tooling-only descendants may govern an unchanged installed application.
    def app_tree(commit):
        item=github_read('git/commits/'+commit)
        need(item.get('sha')==commit and HEX40.fullmatch(item.get('tree',{}).get('sha','')),'PRODUCTION_GIT_COMMIT_TREE_REQUIRED')
        tree=github_read('git/trees/'+item['tree']['sha'])
        need(tree.get('sha')==item['tree']['sha'] and tree.get('truncated') is False and
             type(tree.get('tree'))is list and 0<len(tree['tree'])<=1000,'PRODUCTION_COMPLETE_ROOT_TREE_REQUIRED')
        return {row['path']:{k:row[k] for k in ('mode','type','sha')} for row in tree['tree']
                if row['path'] not in ('scripts','tests','docs','.github')}
    candidate_tree,controller_tree=app_tree(candidate),app_tree(controller)
    need(candidate_tree==controller_tree,'PRODUCTION_INSTALLED_APPLICATION_DIFFERS_FROM_CONTROLLER_SOURCE')
    return sha(canonical(candidate_tree))

class _PublicVisibleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.hidden = 0
        self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "template", "noscript"): self.hidden += 1
    def handle_endtag(self, tag):
        if tag in ("script", "style", "template", "noscript") and self.hidden: self.hidden -= 1
    def handle_data(self, data):
        if not self.hidden and data.strip(): self.parts.append(data.strip())

def production_content_html(port, route):
    # Origin-only, anonymous, GET-only. No session/cookie or CDN cache required.
    need(port in (3030,3032) and route in (
        "/", "/traffic", "/players", "/war-chest", "/game-stats", "/rivalries",
        "/battle-archive", "/bounties", "/champions", "/radio"),
        "CONTENT_PARITY_UNREVIEWED_ROUTE")
    con = http.client.HTTPConnection("127.0.0.1", port, timeout=20 if route == "/traffic" else 9)
    try:
        con.request("GET", route, headers={"Host":"aoe2war.com",
            "User-Agent":"aoe2war-release-content-parity/1",
            "Accept":"text/html", "Cache-Control":"no-cache"})
        res = con.getresponse()
        need(res.status == 200 and (res.getheader("content-type") or "").lower().startswith("text/html"),
             "CONTENT_PARITY_ROUTE_NOT_HTML_200")
        data = res.read(4*1024*1024+1)
        need(3000 < len(data) <= 4*1024*1024,"CONTENT_PARITY_INVALID_HTML_SIZE")
        return data.decode("utf-8",errors="replace")
    finally: con.close()

_FLIGHT_CHUNK = re.compile(r'self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)')
_FLIGHT_RENDER_ERROR = re.compile(r'[0-9a-f]+:E\{.*"digest"\s*:\s*"[^"]+"\}')

def production_has_server_component_error(page_html):
    """Detect Next.js streamed RSC error, which returns HTTP 200.

    This uses JSON-decoded Flight data from the real Next response; the
    same route appeared healthy to ordinary HTTP checks while Chrome
    rendered only Application error. Fail closed on malformed Flight.
    """
    need(type(page_html) is str and len(page_html)<=4*1024*1024,
         "CONTENT_PARITY_RSC_HTML_INVALID")
    chunks=[]
    for match in _FLIGHT_CHUNK.finditer(page_html):
        try:
            decoded=json.loads(match.group(1))
        except (ValueError,TypeError) as exc:
            raise Hold("CONTENT_PARITY_RSC_STREAM_INVALID") from exc
        need(type(decoded) is str,"CONTENT_PARITY_RSC_STREAM_INVALID")
        chunks.append(decoded)
    need(bool(chunks),"CONTENT_PARITY_RSC_STREAM_MISSING")
    return any(_FLIGHT_RENDER_ERROR.fullmatch(line) for line in "".join(chunks).splitlines())

def production_public_guest_page_smoke():
    """Require actual nonfinancial player, rivalry and archive pages to render.

    42501 PostgreSQL denials in the new restricted role must not appear
    as an HTTP-200, empty Next.js error shell. Original 3030 is checked
    alongside the new 3032 so regressions are attributed correctly.
    """
    routes=("/players","/war-chest","/game-stats","/rivalries",
            "/battle-archive","/bounties","/champions","/radio")
    witness={}
    for route in routes:
        old=production_content_html(3030,route)
        new=production_content_html(3032,route)
        need(not production_has_server_component_error(old),
             "CONTENT_PARITY_ORIGINAL_GUEST_RSC_ERROR:"+route)
        need(not production_has_server_component_error(new),
             "CONTENT_PARITY_CANDIDATE_GUEST_RSC_ERROR:"+route)
        need(len(new)>=len(old)//8,
             "CONTENT_PARITY_CANDIDATE_GUEST_BODY_TRUNCATED:"+route)
        witness[route]={"original_html_bytes":len(old),
                        "candidate_html_bytes":len(new),
                        "guest_server_render_healthy":True}
    return witness


def production_published_event_title():
    # A bounded actual SELECT from the existing canonical content DB.
    query = ("BEGIN READ ONLY; "
        "SELECT title FROM public.event_tiles WHERE is_published AND is_active "
        "AND status <> 'archived' ORDER BY priority DESC, published_at DESC NULLS LAST, "
        "updated_at DESC LIMIT 1; COMMIT;")
    raw = cmd(["/usr/sbin/runuser","-u","postgres","--","/usr/bin/psql",
        "-X","-A","-t","-v","ON_ERROR_STOP=1","-d","aoe2hd_db","-c",query],timeout=9)
    lines = [value.strip() for value in raw.decode("utf-8","strict").splitlines()
             if value.strip() not in ("BEGIN","COMMIT") and value.strip()]
    need(len(lines)==1 and 0 < len(lines[0]) <= 240,"CONTENT_PARITY_PUBLISHED_EVENT_AMBIGUOUS")
    return lines[0]

def production_content_parity():
    # This witness is REQUIRED BEFORE any root-owned 3030->3032 selector switch.
    # A healthy listener/build ID cannot substitute for real published content.
    title = production_published_event_title()
    old_home = production_content_html(3030,"/")
    new_home = production_content_html(3032,"/")
    need(title in old_home, "CONTENT_PARITY_ORIGINAL_EVENT_NOT_OBSERVED")
    need(title in new_home, "CONTENT_PARITY_CANDIDATE_PUBLISHED_EVENT_MISSING")
    old_traffic = production_content_html(3030,"/traffic")
    new_traffic = production_content_html(3032,"/traffic")
    def visible(value):
        parser = _PublicVisibleText()
        parser.feed(value)
        return " ".join(parser.parts)

    def published_day(text):
        need("No published completed-day Traffic report is available." not in text,
             "CONTENT_PARITY_EMPTY_TRAFFIC_REPORT")
        match = re.search(r"LAST\s+PUBLISHED\s+UTC\s+DAY\s*:\s*(\d{4}-\d{2}-\d{2})",text,re.I)
        need(match is not None,"CONTENT_PARITY_PUBLISHED_DAY_MISSING")
        try: result = date.fromisoformat(match.group(1))
        except ValueError as error: raise Hold("CONTENT_PARITY_PUBLISHED_DAY_INVALID") from error
        return result
    original_text = visible(old_traffic)
    candidate_text = visible(new_traffic)
    original_day = published_day(original_text)
    candidate_day = published_day(candidate_text)
    need(candidate_day >= original_day,"CONTENT_PARITY_TRAFFIC_ARCHIVE_REGRESSION")
    observed = re.search(r"Latest observed UTC day\s+(\d{4}-\d{2}-\d{2})", candidate_text)
    need(observed and date.fromisoformat(observed[1]) > candidate_day and
         "Provisional · unverified" in candidate_text,
         "CONTENT_PARITY_OBSERVED_TRAFFIC_ABSENT")
    need("BROWSER OBSERVED" not in original_text or "BROWSER OBSERVED" in candidate_text,
         "CONTENT_PARITY_OBSERVED_BROWSER_INSIGHTS_LOST")
    guest_pages=production_public_guest_page_smoke()
    return {"schema":"aoe2war.app.content-parity.v1",
        "status":"PUBLIC_EVENT_AND_CERTIFIED_TRAFFIC_CONTENT_PARITY_OBSERVED",
        "published_event_title_sha256":sha(title.encode()),
        "original_published_day":original_day.isoformat(),
        "candidate_published_day":candidate_day.isoformat(),
        "candidate_observed_day":observed[1],
        "candidate_observed_browser_insights":"BROWSER OBSERVED" in candidate_text,
        "critical_public_guest_pages":guest_pages,
        "anonymous_get_only":True,"financial_authorized":False}

def production_inputs(options):
    need(sys.platform=='linux' and socket.gethostname().split('.')[0]==HOST and os.geteuid()==0,'PRODUCTION_EXACT_HEL1_ROOT')
    need(HEX40.fullmatch(options.source_sha or '') and HEX40.fullmatch(options.candidate_source_sha or '') and all(HEX64.fullmatch(getattr(options,key,'') or '') for key in
         ('engine_source_sha256','owner_source_sha256','g_source_sha256','before_witness_sha256')),'PRODUCTION_EXACT_SOURCE_PINS')
    need(len(options.before_witness_b64)<=90000 and re.fullmatch(r'[A-Za-z0-9+/=]+',options.before_witness_b64 or ''),
         'PRODUCTION_BOUND_BEFORE_ENCODING')
    before_raw=base64.b64decode(options.before_witness_b64,validate=True)
    before=production_before(before_raw,options.before_witness_sha256,options.new_nonce)
    record=production_record(options.new_nonce)
    need(not record.exists() and not record.is_symlink(),'PRODUCTION_CONSUMED_OR_PARTIAL_TRANSACTION')
    if PRODUCTION_AUDIT.exists():protected_dir(PRODUCTION_AUDIT,0o700)
    else:protected_dir(PRODUCTION_AUDIT.parent)
    lock_check();policy_raw=root_file(PRODUCTION_POLICY,32768);policy=parse(policy_raw)
    need(policy.get('schema')=='aoe2war.app.approved-production-profile.v1' and policy.get('source_sha')==options.candidate_source_sha and
         policy.get('profile')=='nonfinancial-production-v1' and policy.get('port')==3032 and policy.get('uid')==990,
         'PRODUCTION_C_PROFILE_SCOPE')
    stage=pathlib.Path(policy.get('stage',''))
    need(stage==pathlib.Path('/var/lib/aoe2war-web-prod-'+options.candidate_source_sha[:12]),'PRODUCTION_C_STAGE_PATH')
    # The immutable website artifact predates these controller-only repairs.
    # Authenticate G from its own qualified source; never alter the staged app.
    app_tree_sha256=production_application_tree(options.candidate_source_sha,options.source_sha)
    graw,g=production_qualified_g(options.source_sha,options.g_source_sha256)
    # F's own fresh native observations compare the independently retained G
    # BEFORE. They do not replace, fabricate, or publish a second G receipt.
    current=g.production_native_snapshot('before',options.new_nonce,options.source_sha);g.production_compare(before,current)
    need(before['source_sha']==options.candidate_source_sha and before['controller_source_sha']==options.source_sha and
         before['profile_sha256']==sha(policy_raw),'PRODUCTION_BEFORE_PROFILE_BINDING')
    old=root_file(VHOST,131072);candidate=production_replace_site(old)
    need(sha(old)==before['nginx']['sha256'],'PRODUCTION_BEFORE_NGINX_PREIMAGE_DRIFT')
    nginx_loaded_vhost(old,VHOST,old_count=6)
    production_require_protected(g,before)
    runtime_sample(before['old_http']['build_version'],policy['build_version'],before['old_http']['asset'],time.monotonic()+15,{})
    content_parity=production_content_parity()
    plan={'schema':'aoe2war.app.production-cutover-plan.v1','nonce':options.new_nonce,'source_sha':options.source_sha,
      'controller_source_sha':options.source_sha,'candidate_source_sha':options.candidate_source_sha,
      'application_tree_sha256':app_tree_sha256,
      'engine_source_sha256':options.engine_source_sha256,'owner_source_sha256':options.owner_source_sha256,'g_source_sha256':options.g_source_sha256,
      'before_witness_sha256':options.before_witness_sha256,'profile_sha256':sha(policy_raw),
      'manifest_sha256':policy['manifest_sha256'],'candidate_build_id':policy['build_id'],'candidate_build_version':policy['build_version'],
      'candidate_pid':before['candidate_pid'],'candidate_start_ticks':before['candidate_start_ticks'],
      'old_web_pid':2625090,'preview_pid':1483304,'nginx_before_sha256':sha(old),'nginx_after_sha256':sha(candidate),
      'protected_units_sha256':before['protected_units_sha256'],'content_parity':content_parity,
      'financial_authorized':False,'public_cutover_authorized':False}
    envelope={'schema':'aoe2war.app.production-cutover-plan-envelope.v1','status':'PASS_READ_ONLY_PRODUCTION_CUTOVER_PLAN_NOT_AUTHORITY',
              'plan':plan,'plan_sha256':sha(canonical(plan))}
    return envelope,{'before':before,'before_raw':before_raw,'policy':policy,'old':old,'candidate':candidate,'g':g,'graw':graw,'record':record}

def production_grant(comment_id,body_sha,envelope,now=None):
    need(re.fullmatch(r'[0-9]{1,20}',comment_id or '') and HEX64.fullmatch(body_sha or ''),'PRODUCTION_EXACT_OWNER_GRANT_PIN')
    obj=github_read('issues/comments/'+str(int(comment_id)))
    need(obj.get('id')==int(comment_id) and obj.get('user',{}).get('login')=='Emaren' and obj.get('user',{}).get('id')==15059910 and
         obj.get('html_url')=='https://github.com/Emaren/app-prodn/issues/1108#issuecomment-'+str(int(comment_id)) and
         obj.get('issue_url')=='https://api.github.com/repos/Emaren/app-prodn/issues/1108','PRODUCTION_ACTUAL_OWNER_IDENTITY_REQUIRED')
    body=obj.get('body','');need(type(body)is str and sha(body.encode())==body_sha and obj.get('created_at')==obj.get('updated_at'),
         'PRODUCTION_OWNER_GRANT_CHANGED_OR_EDITED')
    match=re.fullmatch(r'APP_PRODUCTION_CUTOVER_GRANT\n```json\n(.+)\n```\n?',body,re.S);need(match is not None,'PRODUCTION_OWNER_GRANT_FORMAT')
    grant=parse(match[1]);plan=envelope['plan'];instant=now or datetime.now(timezone.utc)
    need(grant.get('schema')=='aoe2war.app.production-cutover-grant.v1' and grant.get('scope')=='A05_NGINX_ONLY_PRODUCTION_3032' and
         grant.get('decision')=='AUTHORIZE' and grant.get('owner_login')=='Emaren' and
         grant.get('release_authority')=='OWNER_ONLY_NONFINANCIAL' and grant.get('owner_delegated_decisions') is True and
         grant.get('delegated_ai_authorship_disclosed') is True and grant.get('independent_review') is False and
         grant.get('financial_authorized') is False and grant.get('public_cutover_authorized') is True and
         grant.get('rollback_authorized') is True and type(grant.get('max_uses'))is int and grant['max_uses']==1,
         'PRODUCTION_EXACT_NONFINANCIAL_DELEGATED_AUTHORITY_REQUIRED')
    issued=grant_timestamp(grant.get('issued_at'));expires=grant_timestamp(grant.get('expires_at'));created=grant_timestamp(obj.get('created_at'))
    need(0<(expires-issued).total_seconds()<=600 and issued<=created<=instant<=expires,'PRODUCTION_GRANT_EXPIRED_OR_INVALID_TTL')
    need(grant.get('plan_sha256')==envelope['plan_sha256'],'PRODUCTION_GRANT_EXACT_PLAN')
    for key,value in plan.items():
        if key not in ('schema','public_cutover_authorized'):need(grant.get(key)==value,'PRODUCTION_GRANT_TRANSACTION_DRIFT:'+key)
    ci=grant.get('exact_head_ci',{})
    need(type(ci.get('run_id'))is int and ci['run_id']>0 and ci.get('head_sha')==plan['source_sha'] and ci.get('conclusion')=='success' and
         ci.get('all_three_jobs_success') is True,'PRODUCTION_EXACT_HEAD_CI_BINDING')
    run=github_read('actions/runs/'+str(ci['run_id']));jobs=github_read('actions/runs/'+str(ci['run_id'])+'/jobs?filter=latest&per_page=100')
    expected={'Release and documentation control plane','Type, contract, and production build','Isolated Steam-rating PostgreSQL chronology'}
    need(run.get('head_sha')==plan['source_sha'] and run.get('name')=='AoE2WAR CI' and run.get('status')=='completed' and run.get('conclusion')=='success' and
         jobs.get('total_count')==3 and len(jobs.get('jobs',[]))==3 and {job.get('name') for job in jobs['jobs']}==expected and
         all(job.get('status')=='completed' and job.get('conclusion')=='success' for job in jobs['jobs']),'PRODUCTION_ACTUAL_FULL_CI_REQUIRED')
    for name,path in (('engine','scripts/aoe2_r24_f_parallel_nginx_cutover.py'),('owner','scripts/aoe2_r24_f_parallel_nginx_mac.py'),('g','scripts/aoe2_r25_f_g_parallel_observer.py')):
        source=github_read('contents/'+path+'?ref='+plan['source_sha'])
        need(source.get('type')=='file' and source.get('encoding')=='base64' and type(source.get('content'))is str,'PRODUCTION_IMMUTABLE_SOURCE_REQUIRED')
        data=base64.b64decode(source['content'].replace('\n',''),validate=True)
        need(0<len(data)<=196608 and sha(data)==plan[name+'_source_sha256'],'PRODUCTION_QUALIFIED_SOURCE_BYTES_DRIFT:'+name)
    checks=github_read('commits/'+plan['source_sha']+'/check-runs?filter=latest&per_page=100')
    security=[check for check in checks.get('check_runs',[]) if check.get('name')=='GitGuardian Security Checks' and
              check.get('app',{}).get('slug')=='gitguardian']
    need(len(security)==1 and security[0].get('status')=='completed' and security[0].get('conclusion')=='success',
         'PRODUCTION_ACTUAL_SECURITY_CHECK_REQUIRED')
    if now is None:need(datetime.now(timezone.utc)<=expires,'PRODUCTION_GRANT_EXPIRED_DURING_ADMISSION')
    return {'schema':'aoe2war.app.production-cutover-authority.v1','comment_id':int(comment_id),'url':obj['html_url'],
            'body':body,'body_sha256':body_sha,'created_at':obj['created_at'],'manifest':grant,'plan_sha256':envelope['plan_sha256']}

def production_guard(context,selected):
    expected=context['candidate'] if selected==3032 else context['old']
    need(root_file(VHOST,131072)==expected,'PRODUCTION_NGINX_CURRENT_BYTES_DRIFT')
    need(context['g'].production_loaded_nginx(expected)==selected,'PRODUCTION_MIXED_SELECTORS')
    production_require_protected(context['g'],context['before'])
    if selected==3032:
        live=context['g'].listening_socket(3032)
        need(live==context['before']['ports']['3032'],'PRODUCTION_CANDIDATE_SAME_PID_SOCKET_REQUIRED')
        need(sha(root_file(PRODUCTION_POLICY,32768))==context['before']['profile_sha256'],'PRODUCTION_NATIVE_PROFILE_DRIFT')

def production_restore(context):
    actual=root_file(VHOST,131072)
    need(actual in (context['candidate'],context['old']),'PRODUCTION_ROLLBACK_UNKNOWN_NGINX_BYTES_HOLD')
    if actual!=context['old']:replace_existing(VHOST,context['old']);nginx_reload()
    return wait_runtime(context['before']['old_http']['build_version'],context['policy']['build_version'],context['before']['old_http']['asset'],
                        lambda:production_guard(context,3030))

def production_apply(options):
    envelope,context=production_inputs(options)
    need(envelope['plan_sha256']==options.plan_sha256,'PRODUCTION_OWNER_APPROVED_PLAN_CHANGED')
    authority=production_grant(options.grant_comment,options.grant_sha256,envelope)
    fd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        st=os.fstat(fd);need((st.st_dev,st.st_ino,st.st_uid,stat.S_IMODE(st.st_mode))==LOCK_ID,'PRODUCTION_RELEASE_LOCK_FD_DRIFT')
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as error:raise Hold('PRODUCTION_RELEASE_LOCK_BUSY') from error
        lock_check();production_guard(context,3030)
        refreshed=production_grant(options.grant_comment,options.grant_sha256,envelope)
        need(refreshed==authority,'PRODUCTION_OWNER_AUTHORITY_CHANGED_AT_SEAM')
        if not PRODUCTION_AUDIT.exists():os.mkdir(PRODUCTION_AUDIT,0o700);fsyncdir(PRODUCTION_AUDIT.parent)
        protected_dir(PRODUCTION_AUDIT,0o700)
        # Atomic mkdir is consumption. Every later failure keeps this journal.
        os.mkdir(context['record'],0o700);fsyncdir(PRODUCTION_AUDIT)
        record=context['record']
        for name,data in (('owner-authorization.json',canonical(authority)+b'\n'),('plan.json',canonical(envelope)+b'\n'),
                          ('g-before.json',context['before_raw']),('before-nginx.conf',context['old']),('candidate-nginx.conf',context['candidate']),
                          ('reviewed-g.py',context['graw'])):durable_write(record/name,data)
        durable_write(record/'intent.json',canonical({'schema':'aoe2war.app.production-cutover-intent.v1','nonce':options.new_nonce,
            'plan_sha256':envelope['plan_sha256'],'before_witness_sha256':options.before_witness_sha256,'financial_authorized':False})+b'\n');fsyncdir(record)
        try:
            need(datetime.now(timezone.utc)<=grant_timestamp(authority['manifest']['expires_at']),'PRODUCTION_OWNER_GRANT_EXPIRED_AT_WRITE')
            replace_existing(VHOST,context['candidate']);nginx_reload();production_guard(context,3032)
            readiness=wait_runtime(context['policy']['build_version'],context['before']['old_http']['build_version'],context['before']['candidate_http']['asset'],
                                   lambda:production_guard(context,3032))
            # A separate current C read-only security observation follows HTTP
            # convergence, rather than treating loaded Nginx config as proof.
            policy,profile_sha,witness=context['g'].production_profile()
            need(profile_sha==envelope['plan']['profile_sha256'] and witness['candidate_pid']==envelope['plan']['candidate_pid'],
                 'PRODUCTION_C_POST_CUTOVER_ADMISSION_DRIFT')
            durable_write(record/'readiness.json',canonical(readiness)+b'\n')
            durable_write(record/'commit.json',canonical({'schema':'aoe2war.app.production-cutover-commit.v1',
                'status':'PUBLIC_PENDING_REAL_STEAM_AND_BROWSER_ACCEPTANCE','nonce':options.new_nonce,
                'source_sha':options.candidate_source_sha,'controller_source_sha':options.source_sha,
                'build_id':policy['build_id'],'build_version':policy['build_version'],'plan_sha256':envelope['plan_sha256'],
                'readiness_sha256':sha(canonical(readiness)),'original_web_pid':2625090,'preview_pid':1483304,
                'authenticated_browser_roles_verified':False,'financial_authorized':False})+b'\n');fsyncdir(record)
            print(canonical({'status':'PRODUCTION_PUBLIC_CUTOVER_PENDING_G_AFTER_AND_REAL_AUTHENTICATED_BROWSER','journal':str(record),
                'source_sha':options.candidate_source_sha,'controller_source_sha':options.source_sha,
                'build_id':policy['build_id'],'build_version':policy['build_version']}).decode())
        except BaseException as error:
            record_failed_cutover(record,error,lambda:production_restore(context),production=True);raise
    finally:os.close(fd)

def production_rollback(nonce):
    need(sys.platform=='linux' and socket.gethostname().split('.')[0]==HOST and os.geteuid()==0,'PRODUCTION_EXACT_HEL1_ROOT')
    record=production_record(nonce);protected_dir(record,0o700)
    authority=parse(root_file(record/'owner-authorization.json',131072));envelope=parse(root_file(record/'plan.json',32768));plan=envelope['plan']
    need(authority.get('manifest',{}).get('rollback_authorized') is True and authority.get('plan_sha256')==envelope['plan_sha256'] and
         sha(canonical(plan))==envelope['plan_sha256'] and plan.get('nonce')==nonce,'PRODUCTION_PRIOR_AUTHORIZED_ROLLBACK_REQUIRED')
    need(not (record/'rollback.json').exists(),'PRODUCTION_ROLLBACK_ALREADY_RECORDED_NO_REPLAY')
    before_raw=root_file(record/'g-before.json',65536);before=production_before(before_raw,plan['before_witness_sha256'],nonce)
    old=root_file(record/'before-nginx.conf',131072);candidate=root_file(record/'candidate-nginx.conf',131072)
    need(sha(old)==plan['nginx_before_sha256'] and sha(candidate)==plan['nginx_after_sha256'] and production_replace_site(old)==candidate,
         'PRODUCTION_ROLLBACK_PREIMAGE_PIN')
    g=production_load_g(root_file(record/'reviewed-g.py',196608),plan['g_source_sha256'])
    context={'before':before,'old':old,'candidate':candidate,'g':g,'policy':{'build_version':plan['candidate_build_version']}}
    lock_check();fd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        st=os.fstat(fd);need((st.st_dev,st.st_ino,st.st_uid,stat.S_IMODE(st.st_mode))==LOCK_ID,'PRODUCTION_ROLLBACK_LOCK_FD_DRIFT')
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as error:raise Hold('PRODUCTION_ROLLBACK_RELEASE_LOCK_BUSY') from error
        # Expired forward authority never disables an already-authorized rollback.
        readiness=production_restore(context)
        durable_write(record/'rollback.json',canonical({'schema':'aoe2war.app.production-rollback.v1','status':'OLD_PUBLIC_3030_RESTORED',
             'nonce':nonce,'original_web_pid':2625090,'preview_pid':1483304,'nginx_sha256':sha(old),'readiness':readiness,'financial_authorized':False})+b'\n');fsyncdir(record)
        print('PASS:APP_PRODUCTION_ORIGINAL_3030_PROXY_RESTORED_NO_SERVICE_RESTART')
    finally:os.close(fd)

def production_dispatch(mode,argv):
    parser=argparse.ArgumentParser()
    if mode=='--root-production-rollback':
        parser.add_argument('--nonce',required=True);options=parser.parse_args(argv);return production_rollback(options.nonce)
    for name in ('new-nonce','source-sha','candidate-source-sha','engine-source-sha256','owner-source-sha256','g-source-sha256','before-witness-sha256','before-witness-b64'):
        parser.add_argument('--'+name,required=True)
    for name in ('grant-comment','grant-sha256','plan-sha256'):parser.add_argument('--'+name,required=mode=='--root-production-apply')
    options=parser.parse_args(argv)
    if mode=='--root-production-plan':print(canonical(production_inputs(options)[0]).decode())
    else:production_apply(options)


def main():
    need(len(sys.argv)>=2,"EXPLICIT_ROOT_OPERATOR_MODE")
    if sys.argv[1] in ("--root-production-plan","--root-production-apply","--root-production-rollback"):
        production_dispatch(sys.argv[1],sys.argv[2:])
    elif sys.argv[1] in ("--root-cutover-plan","--root-apply-owner-grant"):
        parser=argparse.ArgumentParser()
        for name in ("new-nonce","source-sha","engine-source-sha256","owner-source-sha256",
                     "g-source-sha256","before-witness-sha256"):
            parser.add_argument("--"+name,required=True)
        for name in ("grant-comment","grant-sha256","plan-sha256"):
            parser.add_argument("--"+name,required=sys.argv[1]=="--root-apply-owner-grant")
        parser.add_argument("--runtime-requalification-receipt")
        parser.add_argument("--runtime-requalification-sha256")
        opts=parser.parse_args(sys.argv[2:])
        if sys.argv[1]=="--root-cutover-plan":print(canonical(cutover_plan(opts)[0]).decode())
        else:apply_owner_grant(opts)
    elif len(sys.argv)==4 and sys.argv[1:3]==["--root-rollback-transaction","--nonce"]:
        manual_rollback(sys.argv[3],transaction=True)
    elif sys.argv[1:]==["--root-vhost-plan"]:
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
