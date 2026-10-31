#!/usr/bin/env python3
"""R20 G read-only HEL1 postflight; no install, stage, owner signing or finance.

Requires separately C-reviewed, owner-approved ROOT-OWNED installation at
/usr/local/libexec/aoe2war/solo-v1-g-postflight before any use. Never sudo
execute a tony-writable checkout. Browser approval is a separate G gate.
"""
import argparse, base64, hashlib, json, os, pathlib, re, socket, stat, subprocess, sys
from datetime import datetime, timezone, timedelta
from urllib.request import Request, build_opener, HTTPRedirectHandler

CANDIDATE="0cee3c836c4b0760478280c145e02e81e470ce0e"
CONTROLLER="18052e01a191b15525664c1a058de80d7a8bc150"
HOST="ubuntu-4gb-hel1-11"
STATE=pathlib.Path("/var/lib/aoe2war-solo-website-v1")
REPO=pathlib.Path("/var/www/AoE2HDBets/app-prodn")
INSTALLED=pathlib.Path("/usr/local/libexec/aoe2war/solo-v1-g-postflight")
TRUST=pathlib.Path("/etc/aoe2war/solo-owner-website-v1/trusted-producers.json")
OWNER=pathlib.Path("/etc/aoe2war/website-owner-v4/owner.pem")
OWNER_SPKI="3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"
POLICY="aoe2war.solo-owner.website.admission.v1"
OWNER_DOMAIN=b"AOE2WAR.SOLO_OWNER.WEBSITE.ADMISSION.V1\n"
PRODUCER_DOMAIN=b"AOE2WAR.SOLO_WEBSITE.NATIVE_PRODUCER_RECEIPT.V1\n"
ROLES=("doctor","recovery","finance","host","source","stage")
SECTIONS={"doctor":"doctor","recovery":"recovery","finance":"finance","host":"mount","source":"source_scope","stage":"stage"}
HEX64=re.compile(r"[0-9a-f]{64}\Z")
BUILD=re.compile(r"[A-Za-z0-9_-]{10,128}\Z")
class Hold(Exception): pass
def need(value,message):
    if not value: raise Hold(message)
def canonical(v):return json.dumps(v,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode("ascii")
def digest(v):return hashlib.sha256(v).hexdigest()
def unique(pairs):
    out={}
    for k,v in pairs:
        need(k not in out,"DUPLICATE_JSON_PROPERTY")
        out[k]=v
    return out
def parse(raw):
    return json.loads(raw,object_pairs_hook=unique,parse_constant=lambda _ : (_ for _ in ()).throw(Hold("INVALID_JSON_NUMBER")))
def root_bytes(path,limit=262144):
    path=pathlib.Path(path)
    need(path.is_absolute(),"RELATIVE_TRUSTED_PATH")
    for p in (path,*path.parents):
        s=p.lstat()
        need(s.st_uid==0 and not(s.st_mode&0o022) and not stat.S_ISLNK(s.st_mode),"UNTRUSTED_ROOT_ANCESTRY")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        a=os.fstat(fd)
        need(stat.S_ISREG(a.st_mode) and 0<a.st_size<=limit,"ROOT_JOURNAL_TYPE_OR_SIZE")
        raw=os.read(fd,limit+1)
        b=os.fstat(fd)
        need(len(raw)==a.st_size and (a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns)==
            (b.st_dev,b.st_ino,b.st_size,b.st_mtime_ns),"ROOT_JOURNAL_CHANGED_DURING_READ")
        return raw
    finally: os.close(fd)
def record(name):return parse(root_bytes(STATE/name))
def utc(s):
    need(type(s)is str and s.endswith("Z"),"INVALID_UTC_TIMESTAMP")
    d=datetime.fromisoformat(s.replace("Z","+00:00"))
    need(d.utcoffset()==timedelta(0),"NON_UTC_TIMESTAMP")
    return d
def command(cmd,timeout=10):
    r=subprocess.run(cmd,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    need(r.returncode==0,"READ_ONLY_COMMAND_FAILED:"+pathlib.Path(cmd[0]).name)
    return r.stdout.decode("utf-8","strict").strip()
def verify_openssl(public,message,signature,ed=False):
    # memfd: no secret/signature/data temporary disk files, no private key.
    a=os.memfd_create("g-r20-signature",flags=0)
    b=os.memfd_create("g-r20-message",flags=0)
    try:
        os.write(a,signature);os.write(b,message);os.lseek(a,0,0);os.lseek(b,0,0)
        cmd=(["/usr/bin/openssl","pkeyutl","-verify","-pubin","-inkey",str(public),
              "-rawin","-in",f"/proc/self/fd/{b}","-sigfile",f"/proc/self/fd/{a}"]
             if ed else
             ["/usr/bin/openssl","dgst","-sha256","-verify",str(public),
              "-signature",f"/proc/self/fd/{a}",f"/proc/self/fd/{b}"])
        r=subprocess.run(cmd,pass_fds=(a,b),stdin=subprocess.DEVNULL,capture_output=True,timeout=10)
        need(r.returncode==0,"RSA_OR_ED25519_SIGNATURE_INVALID")
    finally:os.close(a);os.close(b)
def owner_packet(path,approved,attempt,stage_hash):
    p=pathlib.Path(path)
    need(p.is_file() and not p.is_symlink() and p.stat().st_size<=65536,"OWNER_ENVELOPE_INVALID_PATH")
    packet=parse(p.read_bytes())
    need(type(packet)is dict and set(packet)=={"schema","policy","payload","signature_base64"} and
         packet["schema"]==1 and packet["policy"]==POLICY,"OWNER_ENVELOPE_INVALID")
    payload=packet["payload"]
    need(type(payload)is dict and payload.get("phase")=="PRE_ACTIVATE" and
         payload.get("train")=="W1_SAFE" and payload.get("candidate_sha")==CANDIDATE and
         payload.get("attempt_id")==attempt and payload.get("stage_receipt_sha256")==stage_hash and
         payload.get("financial_movement_authorized")is False and
         payload.get("custody_authorized")is False and payload.get("migration_paths")==[],
         "OWNER_SIGNED_WRONG_PHASE_OR_FINANCIAL_SCOPE")
    need(approved.get("packet_sha256")==digest(canonical(packet)) and
         approved.get("candidate_sha")==CANDIDATE and
         approved.get("attempt_id")==attempt and
         approved.get("stage_receipt_sha256")==stage_hash,"OWNER_ENVELOPE_NOT_ROOT_APPROVED")
    root_bytes(OWNER,16384)
    der=subprocess.run(["/usr/bin/openssl","pkey","-pubin","-in",str(OWNER),"-outform","DER"],capture_output=True,timeout=10)
    need(der.returncode==0 and digest(der.stdout)==OWNER_SPKI,"OWNER_RSA_SPKI_DRIFT")
    verify_openssl(OWNER,OWNER_DOMAIN+canonical(payload),
                   base64.b64decode(packet["signature_base64"],validate=True))
    return payload
def verify_six(report,trust,attempt,phase):
    need(type(report)is dict and report.get("status")=="INDEPENDENT_NATIVE_VERIFIED" and
         report.get("policy")==POLICY and report.get("candidate_sha")==CANDIDATE and
         report.get("attempt_id")==attempt and report.get("phase")==phase,"FOREIGN_NATIVE_REPORT")
    signed=report.get("receipt_provenance",{}).get("signed_producers")
    need(type(trust)is dict and set(trust)==set(ROLES) and
         type(signed)is dict and set(signed)==set(ROLES),"SIX_SIGNED_ROLES_MISSING")
    ids=[]
    for role in ROLES:
        k=trust[role]
        need(type(k)is dict and set(k)=={"public_key_path","public_spki_sha256"},"UNENROLLED_ROLE")
        public=pathlib.Path(k["public_key_path"])
        need(public.is_absolute() and bool(HEX64.fullmatch(k["public_spki_sha256"])),"UNPINNED_ROLE")
        root_bytes(public,16384)
        der=subprocess.run(["/usr/bin/openssl","pkey","-pubin","-in",str(public),"-outform","DER"],capture_output=True,timeout=10)
        need(der.returncode==0 and len(der.stdout)==44 and
             der.stdout.startswith(bytes.fromhex("302a300506032b6570032100")) and
             digest(der.stdout)==k["public_spki_sha256"],"PRODUCER_ED25519_IDENTITY_DRIFT")
        ids.append((str(public),k["public_spki_sha256"]))
        envelope=signed[role]
        need(type(envelope)is dict and set(envelope)=={"payload","signature_base64"},"INVALID_PRODUCER_ENVELOPE")
        payload=envelope["payload"]
        need(type(payload)is dict and
             set(payload)=={"producer","candidate_sha","attempt_id","phase","host","observed_at","content_sha256"} and
             payload["producer"]==role and payload["candidate_sha"]==CANDIDATE and
             payload["attempt_id"]==attempt and payload["phase"]==phase and
             payload["host"]==HOST and payload["observed_at"]==report["observed_at"] and
             payload["content_sha256"]==digest(canonical(report[SECTIONS[role]])),
             "PRODUCER_CONTENT_OR_PHASE_DRIFT")
        verify_openssl(public,PRODUCER_DOMAIN+canonical(payload),
                       base64.b64decode(envelope["signature_base64"],validate=True),True)
    need(len(set(ids))==6 and len({x[0] for x in ids})==6 and
         len({x[1] for x in ids})==6,"REUSED_PRODUCER_KEY")
def verify_lineage(approved,done,stage,before,after,attempt):
    need(approved.get("candidate_sha")==CANDIDATE and approved.get("attempt_id")==attempt and
         done.get("status")=="ROOT_ACTIVATION_NATIVE_VERIFIED" and
         done.get("candidate_sha")==CANDIDATE and done.get("attempt_id")==attempt and
         done.get("policy")==POLICY and done.get("financial_release_authorized")is False,
         "NO_VALID_ROOT_POST_ACTIVATION")
    build=done.get("build_id")
    need(type(build)is str and bool(BUILD.fullmatch(build)) and
         approved.get("stage_receipt_sha256")==done.get("stage_receipt_sha256")==stage.get("stage_receipt_sha256") and
         stage.get("receipt",{}).get("staged_build_id")==build and
         stage.get("receipt",{}).get("release_sha")==CANDIDATE and
         done.get("post_activation_native_sha256")==digest(canonical(after)),
         "ROOT_SEALED_STAGE_BUILD_OR_NATIVE_HASH_DRIFT")
    need(before.get("phase")=="PRE_ACTIVATE" and after.get("phase")=="POST_ACTIVATE" and
         before.get("attempt_id")==after.get("attempt_id")==attempt and
         utc(after["observed_at"])>utc(before["observed_at"]),"PRE_POST_SIGNED_CHRONOLOGY")
    need(before["finance"]["protected"]==after["finance"]["protected"] and
         before["finance"]["exposure"]==after["finance"]["exposure"] and
         after["finance"].get("financial_movement_authorized")is False and
         after["finance"].get("wolo_finance_p1")=="HOLD","PROTECTED_FINANCE_DELTA")
    need(after.get("receipt_provenance",{}).get("signed_source_receipts_verified")is True and
         after["receipt_provenance"].get("original_root_measurements")is True,"MISSING_NATIVE_SOURCE_PROVENANCE")
    rb=after["rollback"]
    need(rb.get("preserved")is True and rb.get("previous_source_sha")==before["mount"]["source_sha"] and
         rb.get("active_build_id")==before["mount"]["active_build_id"] and
         after["mount"].get("rollback_sha256")==digest(canonical(rb)),
         "DURABLE_ROLLBACK_NOT_ROOT_SIGNED")
    need(after["mount"].get("source_sha")==CANDIDATE and
         after["mount"].get("active_build_id")==build and
         done.get("rollback_available")is True and
         done.get("finance_fingerprint_sha256")==digest(canonical(after["finance"]["protected"])),
         "POST_ACTIVATION_MOUNT_FINANCE_IDENTITY")
    return build
PROC_ROOT=pathlib.Path("/proc")
def proc_start_ticks(base):
    raw=(base/"stat").read_text()
    close=raw.rfind(")")
    need(close>0,"PROC_STAT_MALFORMED")
    words=raw[close+2:].split()
    need(len(words)>19,"PROC_STAT_TRUNCATED")
    return int(words[19])
def listener_socket_inode(port):
    """Unique kernel LISTEN socket for port; never confuse open port with PID custody."""
    found=[]
    for table in ("tcp","tcp6"):
        lines=(PROC_ROOT/"net"/table).read_text().splitlines()
        need(bool(lines) and "local_address" in lines[0],"KERNEL_TCP_TABLE_MALFORMED")
        for line in lines[1:]:
            columns=line.split()
            need(len(columns)>=10,"KERNEL_TCP_ROW_MALFORMED")
            if columns[3]!="0A":
                continue
            address=columns[1].rsplit(":",1)
            need(len(address)==2,"KERNEL_TCP_ADDRESS_MALFORMED")
            if int(address[1],16)==port:
                inode=columns[9]
                need(inode.isdecimal() and int(inode)>0,"KERNEL_LISTEN_INODE_UNKNOWN")
                found.append(inode)
    need(len(found)==1,"KERNEL_LISTENER_NOT_UNIQUE:"+str(port))
    return found[0]
def process_listener_owns(port,pid,inode):
    """Read kernel fd symlinks, not pasted socket->PID mappings."""
    directory=PROC_ROOT/str(pid)/"fd"
    checked=0
    matched=False
    for fd in directory.iterdir():
        checked+=1
        need(checked<=8192,"PROTECTED_FD_CENSUS_UNBOUNDED")
        try:
            linked=os.readlink(fd)
        except FileNotFoundError:
            # Closing unrelated descriptors can race with enumeration.
            continue
        if linked=="socket:["+inode+"]":
            matched=True
    need(matched,"LISTENER_INODE_NOT_OWNED_BY_SIGNED_PID:"+str(port))
def process_id(port,record):
    pid=record.get("pid")
    need(type(pid)is int and pid>1,"INVALID_PROTECTED_LISTENER_PID")
    base=PROC_ROOT/str(pid)
    first=proc_start_ticks(base)
    line=next(s for s in (base/"status").read_text().splitlines() if s.startswith("Uid:"))
    uid=int(line.split()[1])
    cgroup=(base/"cgroup").read_bytes()
    # Compare the actual executable's bytes, not just /proc/{pid}/exe's name.
    exe_fd=os.open(base/"exe",os.O_RDONLY|os.O_CLOEXEC)
    try:
        st=os.fstat(exe_fd)
        need(stat.S_ISREG(st.st_mode),"SIGNED_LISTENER_EXE_NOT_REGULAR")
        h=hashlib.sha256()
        with os.fdopen(exe_fd,"rb",closefd=False) as file:
            while True:
                block=file.read(1024*1024)
                if not block:break
                h.update(block)
        st_after=os.fstat(exe_fd)
        need((st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)==
             (st_after.st_dev,st_after.st_ino,st_after.st_size,st_after.st_mtime_ns),
             "SIGNED_LISTENER_EXE_CHANGED")
    finally: os.close(exe_fd)
    inode=listener_socket_inode(port)
    process_listener_owns(port,pid,inode)
    last=proc_start_ticks(base)
    need(first==last==record.get("start_time_ticks") and uid==record.get("uid"),
         "PROTECTED_8092_8093_PID_REPLACED")
    need(digest(cgroup)==record.get("cgroup_sha256") and
         h.hexdigest()==record.get("executable_sha256"),
         "PROTECTED_LISTENER_CGROUP_OR_EXE_DRIFT")
    return {"pid":pid,"start_time_ticks":last,"uid":uid,
            "socket_inode_sha256":digest(inode.encode()),
            "executable_sha256":h.hexdigest(),"cgroup_sha256":digest(cgroup)}
def live_identity(build,after):
    source=command(["/usr/bin/git","-C",str(REPO),"rev-parse","HEAD"])
    need(source==CANDIDATE,"LIVE_SOURCE_NOT_SIGNED_RELEASE")
    need(not command(["/usr/bin/git","-C",str(REPO),"status","--porcelain","--untracked-files=no"]),
         "LIVE_SOURCE_TRACKED_DIRTY")
    f=REPO/".next/BUILD_ID"
    need(not f.is_symlink(),"NEXT_BUILD_SYMLINK")
    local=f.read_text().strip()
    need(local==build==after["mount"].get("active_build_id"),"LIVE_NEXT_BUILD_NOT_ROOT_SIGNED")
    properties=command(["/usr/bin/systemctl","show","aoe2hdbets-web.service",
                        "-p","ActiveState","-p","MainPID","-p","ExecMainStartTimestampMonotonic"])
    props=dict(line.split("=",1) for line in properties.splitlines())
    need(props.get("ActiveState")=="active" and int(props.get("MainPID","0"))>1,
         "LIVE_WEB_NOT_ACTIVE")
    webpid=int(props["MainPID"])
    need(pathlib.Path(f"/proc/{webpid}/stat").exists(),"WEB_PID_NOT_LIVE")
    census=after["finance"]["protected"]["writers"]["native_census"]["units"]
    need(type(census)is dict and len(census)>=25,"ORIGINAL_25_UNIT_CENSUS_NOT_SIGNED")
    names=sorted(census)
    actual=command(["/usr/bin/systemctl","show","--no-pager",
                    "--property=Id,ActiveState,MainPID",*names],timeout=12)
    units={}
    for block in actual.split("\n\n"):
        d=dict(line.split("=",1) for line in block.splitlines() if "=" in line)
        if d.get("Id"):
            need(d["Id"] not in units,"DUPLICATE_UNIT_ID")
            units[d["Id"]]=d
    need(set(units)==set(names),"ORIGINAL_25_UNITS_MISSING_NOW")
    for name in names:
        signed=census[name];live=units[name]
        need(live.get("ActiveState")==signed.get("state") and
             int(live.get("MainPID","-1"))==signed.get("main_pid"),
             "ORIGINAL_NATIVE_UNIT_PID_DRIFT:"+name)
    ports={p:process_id(int(p),after["finance"]["protected"][p]) for p in ("8092","8093")}
    return {"source_sha":source,"next_build_id":local,"web_main_pid":webpid,
            "web_start_monotonic":props.get("ExecMainStartTimestampMonotonic"),
            "protected_listeners":ports,"original_units_remeasured":len(names)}
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def public_get():
    op=build_opener(NoRedirect)
    versions={}
    for origin in ("http://127.0.0.1:3030","https://aoe2war.com"):
        req=Request(origin+"/api/deployment-version",method="GET",
                    headers={"Cache-Control":"no-cache","User-Agent":"aoe2war-g-r20-readonly-postflight"})
        with op.open(req,timeout=8) as r:
            need(r.status==200 and "no-store" in r.headers.get("Cache-Control","").lower(),
                 "PUBLIC_DEPLOYMENT_VERSION_NOT_NOSTORE")
            response=parse(r.read(4096))
            need(type(response)is dict and type(response.get("buildVersion"))is str and
                 response["buildVersion"] not in ("","unknown","development"),"APPLICATION_BUILD_VERSION_UNKNOWN")
            versions["internal" if origin.startswith("http://") else "public"]=response["buildVersion"]
    need(versions["internal"]==versions["public"],"PUBLIC_INTERNAL_APP_VERSION_DRIFT")
    for origin in ("http://127.0.0.1:3030","https://aoe2war.com"):
        for page in ("/","/lobby","/bets","/live-games","/war-chest"):
            with op.open(Request(origin+page,method="GET",headers={"User-Agent":"aoe2war-g-r20-readonly-postflight"}),timeout=8) as r:
                need(r.status==200,"PUBLIC_ROUTE_GET_NOT_200:"+page)
                r.read(128)
    # App env buildVersion is NOT .next/BUILD_ID and must never be compared as such.
    return versions
def postflight(owner_envelope):
    need(sys.platform=="linux" and socket.gethostname().split(".")[0]==HOST and
         os.geteuid()==0,"NOT_AUTHENTICATED_HEL1_ROOT_CONTEXT")
    need(pathlib.Path(__file__).absolute()==INSTALLED,"UNREVIEWED_ROOT_EXECUTABLE_PATH")
    root_bytes(INSTALLED,262144)
    need(STATE.is_dir() and not STATE.is_symlink(),"ROOT_JOURNAL_MISSING")
    names=sorted(p.name for p in STATE.iterdir() if re.fullmatch(r"[0-9a-f]{64}-PRE_ACTIVATE-completed[.]json",p.name))
    need(len(names)==1,"NO_UNAMBIGUOUS_ROOT_COMPLETED_ATTEMPT")
    attempt=names[0][:64]
    approved=record(attempt+"-PRE_ACTIVATE-approved.json")
    completed=record(names[0])
    stage=record(attempt+"-PRE_STAGE-stage-receipt.json")
    before=record(attempt+"-PRE_ACTIVATE-native-before.json")
    after=record(attempt+"-POST_ACTIVATE-native-after.json")
    p=owner_packet(owner_envelope,approved,attempt,stage.get("stage_receipt_sha256"))
    build=verify_lineage(approved,completed,stage,before,after,attempt)
    need(p.get("staged_build_id")==build and
         p.get("active_build_id")==before["mount"]["active_build_id"] and
         p.get("previous_sha")==before["mount"]["source_sha"] and
         p.get("finance_fingerprint_sha256")==digest(canonical(before["finance"]["protected"])),
         "OWNER_SIGNED_DIFFERENT_STAGE_OR_FINANCE")
    need(timedelta(0)<=datetime.now(timezone.utc)-utc(after["observed_at"])<=timedelta(minutes=10),
         "POST_ACTIVATE_EVIDENCE_STALE")
    trust=parse(root_bytes(TRUST,32768))
    verify_six(before,trust,attempt,"PRE_ACTIVATE")
    verify_six(after,trust,attempt,"POST_ACTIVATE")
    identity=live_identity(build,after)
    version=public_get()
    need(live_identity(build,after)==identity,"HOST_PID_CHANGED_DURING_PUBLIC_GET")
    return {"schema":"aoe2war.g.r20.postflight.v1",
            "status":"SIGNED_POST_ACTIVATE_SOURCE_FINANCE_PID_PUBLIC_VERIFIED_BROWSER_PENDING",
            "website_sha":CANDIDATE,"controller_review_sha":CONTROLLER,
            "attempt_id":attempt,"next_build_id":build,
            "application_build_version":version,"host":HOST,"service":identity,
            "six_independent_producer_signatures_verified":True,
            "financial_exposure_changed":False,
            "rollback_root_signed_preserved":True,"G_rollback_drill_performed":False,
            "production_browser_375_768_1440":"NOT_RUN",
            "G_mutation_requests_sent":False}
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--read-only-post-activate",action="store_true",required=True)
    parser.add_argument("--owner-envelope",required=True,type=pathlib.Path)
    a=parser.parse_args()
    try:
        print(json.dumps(postflight(a.owner_envelope),sort_keys=True,separators=(",",":")))
        return 0
    except (Hold,OSError,ValueError,KeyError,TypeError,IndexError,subprocess.TimeoutExpired) as exc:
        print("G_R20_POSTFLIGHT_HOLD:"+
              (str(exc) if isinstance(exc,Hold) else type(exc).__name__),file=sys.stderr)
        return 2
if __name__=="__main__":raise SystemExit(main())
