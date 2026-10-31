#!/usr/bin/env python3
"""R25 B: real HEL1 root read-only witness for the separate #1061 3031 web.

Neither installs nor grants anything. Never prints DATABASE_URL/password,
raw environment, service unit contents, SQL rows, or finance credentials.
Requires a real new web MainPID, a source-pinned guard, a dedicated restricted
PostgreSQL login, and exact kernel egress policy. No service or DB mutations.
"""
import argparse
import hashlib
import json
import os
import pathlib
import pwd
import re
import socket
import stat
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urlsplit, unquote

HOST = "ubuntu-4gb-hel1-11"
TARGET = "0cee3c836c4b0760478280c145e02e81e470ce0e"
UNIT = "aoe2hdbets-web-r24.service"
OLD_UNIT = "aoe2hdbets-web.service"
USER = "aoe2war_r25_web"
DB_ROLE = "aoe2war_r25_web_ro"
GUARD = pathlib.Path("/usr/local/lib/aoe2war-r25/r25_b_guard.cjs")
PORT = 3031
GUARD_HEALTH = "http://127.0.0.1:3031/__aoe2war_r25_b_isolation"
SOURCE = pathlib.Path("/var/www/AoE2HDBets/app-prodn-r24-w1safe-0cee3c836c4b")
ENV_ALLOW = set((
    "NODE_ENV WARGRAPH_RUNTIME_DISABLED AOE2WAR_PROD_DB_PREVIEW "
    "AOE2WAR_R25_ISOLATED_WEB NODE_OPTIONS DATABASE_URL PATH HOME USER "
    "LOGNAME PWD SHELL LANG LC_ALL TZ TERM HOSTNAME PORT "
    "NEXT_TELEMETRY_DISABLED INVOCATION_ID JOURNAL_STREAM SYSTEMD_EXEC_PID "
    "NOTIFY_SOCKET WATCHDOG_PID WATCHDOG_USEC TMPDIR NPM_CONFIG_CACHE"
).split())
EXPECTED = {
    "NODE_ENV": "production",
    "WARGRAPH_RUNTIME_DISABLED": "true",
    "AOE2WAR_PROD_DB_PREVIEW": "true",
    "AOE2WAR_R25_ISOLATED_WEB": "true",
    "NODE_OPTIONS": "--require=" + str(GUARD),
    "HOSTNAME": "127.0.0.1",
    "PORT": str(PORT),
    "USER": USER,
    "LOGNAME": USER,
}
SQL = """
SELECT json_build_object(
 'session_user', session_user,
 'current_user', current_user,
 'database', current_database(),
 'transaction_read_only', current_setting('transaction_read_only'),
 'role_restricted', (
   SELECT rolcanlogin AND NOT rolsuper AND NOT rolinherit
     AND NOT rolcreatedb AND NOT rolcreaterole
     AND NOT rolreplication AND NOT rolbypassrls
     FROM pg_roles WHERE rolname=session_user
 ),
 'no_writable_role_membership', NOT EXISTS(
   SELECT 1 FROM pg_roles r
   WHERE r.rolname IN ('pg_write_all_data','pg_execute_server_program',
      'pg_read_server_files','pg_write_server_files','pg_signal_backend')
   AND pg_has_role(session_user,r.oid,'MEMBER')
 ),
 'no_db_create', NOT has_database_privilege(current_database(),'CREATE'),
 'no_schema_create', NOT EXISTS(
   SELECT 1 FROM pg_namespace n WHERE has_schema_privilege(n.oid,'CREATE')
   AND n.nspname NOT LIKE 'pg_temp_%'
 ),
 'no_table_mutation', NOT EXISTS(
   SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind IN ('r','p','f','v','m')
     AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
     AND (has_table_privilege(c.oid,'INSERT')
          OR has_table_privilege(c.oid,'UPDATE')
          OR has_table_privilege(c.oid,'DELETE')
          OR has_table_privilege(c.oid,'TRUNCATE')
          OR has_table_privilege(c.oid,'TRIGGER')
          OR has_table_privilege(c.oid,'REFERENCES'))
 ),
 'no_sequence_mutation', NOT EXISTS(
   SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind='S' AND n.nspname NOT LIKE 'pg_%'
     AND (has_sequence_privilege(c.oid,'UPDATE')
          OR has_sequence_privilege(c.oid,'USAGE'))
 ),
 'no_callable_security_definer', NOT EXISTS(
   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.prosecdef
     AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
     AND has_function_privilege(p.oid,'EXECUTE')
 )
)::text
"""
def hold(why):
    raise RuntimeError("R25_B_HOST_HOLD:" + why)

def run(args, *, env=None, timeout=8, max_bytes=65536):
    try:
        p = subprocess.run(args, input=b"", stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, env=env, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        hold("NATIVE_PROBE_UNAVAILABLE")
    if p.returncode or len(p.stdout)>max_bytes:
        hold("NATIVE_PROBE_FAIL")
    return p.stdout

def digest(data):
    return hashlib.sha256(data).hexdigest()

def systemd(unit):
    raw=run(["/usr/bin/systemctl","show",unit,"--no-pager",
             "--property=Id,LoadState,ActiveState,MainPID,User,Group,"
             "WorkingDirectory,ProtectSystem,ProtectHome,NoNewPrivileges,"
             "PrivateTmp,CapabilityBoundingSet,ControlGroup"])
    return dict(s.split("=",1) for s in raw.decode().splitlines() if "=" in s)

def proc(pid):
    p=pathlib.Path("/proc")/str(pid)
    line=(p/"stat").read_text()
    i=line.rfind(")")
    before=int(line[i+2:].split()[19])
    raw=(p/"environ").read_bytes()
    if not raw or len(raw)>65536:hold("PROC_ENV_UNAVAILABLE")
    env={}
    for part in raw.rstrip(b"\x00").split(b"\x00"):
        if b"=" not in part:hold("PROC_ENV_FORMAT")
        k,v=part.split(b"=",1)
        key=k.decode("ascii")
        if key in env:hold("PROC_ENV_DUPLICATE")
        env[key]=v.decode("utf8")
    status=(p/"status").read_text()
    uid=int(next(x.split()[1] for x in status.splitlines() if x.startswith("Uid:")))
    exe=os.readlink(p/"exe")
    cwd=os.readlink(p/"cwd")
    cg=(p/"cgroup").read_bytes()
    line2=(p/"stat").read_text()
    i2=line2.rfind(")")
    if before!=int(line2[i2+2:].split()[19]):hold("PID_REUSED")
    return {"pid":pid,"start_ticks":before,"uid":uid,"exe":exe,
            "cwd":cwd,"env":env,"cgroup_sha256":digest(cg)}

def require_root_file(p, maximum=32768):
    if not p.is_absolute():hold("RELATIVE_GUARD_PATH")
    for d in [p,*p.parents]:
        st=d.lstat()
        if st.st_uid!=0 or st.st_mode & 0o022 or stat.S_ISLNK(st.st_mode):
            hold("UNTRUSTED_GUARD_PATH")
    st=p.stat()
    if not stat.S_ISREG(st.st_mode) or st.st_size<1 or st.st_size>maximum:
        hold("INVALID_GUARD_FILE")
    return digest(p.read_bytes())

def tcp3031(pid):
    table=(pathlib.Path("/proc/net/tcp").read_text().splitlines()[1:])
    sockets=[]
    for line in table:
        cols=line.split()
        ip,hexport=cols[1].split(":")
        if int(hexport,16)!=PORT or cols[3]!="0A":continue
        if ip!="0100007F":hold("3031_LISTENS_OUTSIDE_LOOPBACK")
        sockets.append(cols[9])
    for line in pathlib.Path("/proc/net/tcp6").read_text().splitlines()[1:]:
        cols=line.split()
        if int(cols[1].split(":")[1],16)==PORT and cols[3]=="0A":
            hold("3031_IPV6_LISTENER_UNREVIEWED")
    if len(sockets)!=1:hold("3031_EXACT_ONE_SOCKET")
    fd_root=pathlib.Path("/proc")/str(pid)/"fd"
    seen=0
    for f in fd_root.iterdir():
        try:
            if os.readlink(f)=="socket:["+sockets[0]+"]":seen+=1
        except (OSError,FileNotFoundError):
            continue
    if seen!=1:hold("3031_LISTENER_NOT_OWNED_BY_NEW_MAINPID")
    return digest(sockets[0].encode())

def nft_policy(uid):
    text=run(["/usr/sbin/nft","-n","list","chain","inet",
              "aoe2war_r25_b","egress"],max_bytes=8192).decode()
    if "type filter hook output priority -150; policy accept;" not in text:
        hold("NFT_OUTPUT_HOOK_NOT_ENFORCED")
    lines=[s.strip().rstrip(";") for s in text.splitlines() if "meta skuid" in s]
    expected=[
        f"meta skuid {uid} ct state new ip daddr 127.0.0.1 tcp dport 5432 accept",
        f"meta skuid {uid} ct state new drop",
    ]
    if lines!=expected:hold("NFT_EGRESS_RULES_NOT_EXACT")
    return digest(text.encode())

def db_proof(dsn, uid):
    u=urlsplit(dsn)
    if (u.scheme not in ("postgresql","postgres") or unquote(u.username or "")!=DB_ROLE
        or u.hostname!="127.0.0.1" or (u.port or 5432)!=5432
        or not u.password or not u.path.strip("/") or u.query or u.fragment):
        hold("DB_LOGIN_NOT_DEDICATED_RO")
    env={"PATH":"/usr/bin:/bin","PGHOST":"127.0.0.1","PGPORT":"5432",
         "PGUSER":DB_ROLE,"PGDATABASE":unquote(u.path.lstrip("/")),
         "PGPASSWORD":unquote(u.password),"PGCONNECT_TIMEOUT":"4"}
    raw=run(["/usr/sbin/runuser","-u",USER,"--",
             "/usr/bin/psql","-X","-A","-t","-w","-v","ON_ERROR_STOP=1",
             "-c",SQL],env=env,timeout=9,max_bytes=8192)
    try: d=json.loads(raw)
    except (ValueError,UnicodeError):hold("DB_ROLE_RECEIPT_MALFORMED")
    yes=("role_restricted","no_writable_role_membership","no_db_create",
         "no_schema_create","no_table_mutation","no_sequence_mutation",
         "no_callable_security_definer")
    if d.get("session_user")!=DB_ROLE or d.get("current_user")!=DB_ROLE or \
       d.get("transaction_read_only")!="on" or any(d.get(k) is not True for k in yes):
        hold("DB_SERVER_ENFORCED_SELECT_ONLY_NOT_PROVEN")
    return {"role":DB_ROLE,"database_sha256":digest(d["database"].encode()),
            "checked":list(yes),"server_transaction_ro":True}

def http_proof(pid):
    req=urllib.request.Request(GUARD_HEALTH,headers={"Host":"127.0.0.1:3031"})
    try:
        with urllib.request.urlopen(req,timeout=4) as f:
            payload=f.read(4096)
            if f.status!=200:hold("GUARD_HEALTH_STATUS")
    except (OSError,urllib.error.URLError):hold("GUARD_HEALTH_UNREACHABLE")
    try:r=json.loads(payload)
    except ValueError:hold("GUARD_HEALTH_INVALID")
    if (r.get("schema")!="aoe2war.r25.b.process-guard.v1"
        or r.get("pid")!=pid or r.get("unsafe_http_denied") is not True
        or r.get("server_enforced_db_and_kernel_egress_proven") is not False):
        hold("GUARD_PROCESS_IDENTITY_MISMATCH")
    # Safe mutation probe: use ONLY a dedicated nonfinance guard endpoint.
    # If guard failed, Next sees an unknown route; NO finance URL is touched.
    mutation=urllib.request.Request(GUARD_HEALTH,data=b"",
           method="POST",headers={"Content-Type":"text/plain"})
    try:
        urllib.request.urlopen(mutation,timeout=4)
        hold("LOCAL_HTTP_MUTATION_NOT_BLOCKED")
    except urllib.error.HTTPError as e:
        if e.code!=405 or e.headers.get("X-AoE2WAR-R25-B-Guard")!="denied":
            hold("LOCAL_HTTP_GUARD_NOT_EXACT")
    return True

def observe(expected_guard_sha):
    if sys.platform!="linux" or os.geteuid()!=0 or socket.gethostname().split(".")[0]!=HOST:
        hold("ORIGINAL_HEL1_ROOT_REQUIRED")
    if not re.fullmatch(r"[0-9a-f]{64}",expected_guard_sha):
        hold("EXPECTED_GUARD_SHA256_REQUIRED")
    guard= require_root_file(GUARD)
    if guard!=expected_guard_sha:hold("ROOT_INSTALLED_GUARD_SHA_MISMATCH")
    old=systemd(OLD_UNIT);new=systemd(UNIT)
    oldpid=int(old.get("MainPID") or 0)
    pid=int(new.get("MainPID") or 0)
    if old.get("ActiveState")!="active" or oldpid!=2625090:
        hold("ORIGINAL_FINANCIAL_WEB_PID_NOT_PRESERVED")
    if (new.get("ActiveState")!="active" or new.get("User")!=USER
        or pid<2 or pid==oldpid or new.get("WorkingDirectory")!=str(SOURCE)
        or new.get("ProtectSystem")!="strict"
        or new.get("ProtectHome") not in ("yes","read-only")
        or new.get("NoNewPrivileges")!="yes"
        or new.get("PrivateTmp")!="yes"
        or new.get("CapabilityBoundingSet") not in ("", " ")):
        hold("NEW_3031_SYSTEMD_ISOLATION_INCOMPLETE")
    pw=pwd.getpwnam(USER)
    if pw.pw_uid==0 or pw.pw_uid==1000:hold("CANDIDATE_UID_NOT_DISTINCT")
    p=proc(pid)
    if p["uid"]!=pw.pw_uid or p["cwd"]!=str(SOURCE):
        hold("NEW_PROCESS_IDENTITY_INVALID")
    if not pathlib.Path(p["exe"]).name.startswith("node"):
        hold("NEW_MAINPID_NOT_NODE")
    env=p["env"]
    if set(env)-ENV_ALLOW or any(env.get(k)!=v for k,v in EXPECTED.items()):
        hold("CANDIDATE_PROCESS_ENV_UNSAFE")
    if "--require="+str(GUARD) not in env["NODE_OPTIONS"]:
        hold("PRESTART_GUARD_NOT_LOADED")
    port_hash=tcp3031(pid)
    nft_hash=nft_policy(pw.pw_uid)
    db=db_proof(env.get("DATABASE_URL",""),pw.pw_uid)
    http_proof(pid)
    # Read source identity without modifying build or files.
    checkout=run(["/usr/bin/git","-C",str(SOURCE),"rev-parse","HEAD"]).decode().strip()
    if checkout!=TARGET:hold("CANDIDATE_SOURCE_DRIFT")
    build=(SOURCE/".next"/"BUILD_ID")
    if not build.is_file() or build.is_symlink():hold("REAL_NEXT_BUILD_ID_MISSING")
    bid=build.read_text().strip()
    if not bid or len(bid)>128:hold("INVALID_NEXT_BUILD_ID")
    payload={"schema":"aoe2war.r25.b.hel1.positive-isolation-witness.v1",
        "at":datetime.now(timezone.utc).isoformat(),
        "host":HOST,"target_sha":TARGET,"old_web_pid":oldpid,
        "candidate_unit":UNIT,"candidate_pid":pid,"candidate_start_ticks":p["start_ticks"],
        "candidate_uid":pw.pw_uid,"candidate_cgroup_sha256":p["cgroup_sha256"],
        "source_sha":checkout,"build_id":bid,"guard_sha256":guard,
        "guard_local_http":True,"guard_wargraph_disabled_before_node":True,
        "candidate_readonly_pg":db,"kernel_uid_egress_sha256":nft_hash,
        "candidate_socket_inode_sha256":port_hash,
        "no_financial_operation_executed":True,
        "old_finance_cash_balance_delta_verified":False,
        "public_cutover_authorized":False,
        "status":"POSITIVE_ISOLATED_3031_NOT_PUBLIC_DEPLOYMENT_AUTHORITY"}
    payload["report_sha256"]=digest(json.dumps(payload,sort_keys=True,separators=(",",":")).encode())
    return payload

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--expected-guard-sha256",required=True)
    args=parser.parse_args()
    try:
        print(json.dumps(observe(args.expected_guard_sha256),sort_keys=True))
    except (RuntimeError,OSError,ValueError,IndexError,KeyError,StopIteration) as e:
        print(json.dumps({"schema":"aoe2war.r25.b.hel1.positive-isolation-witness.v1",
                          "status":"HOLD","reason":str(e)[:160],
                          "public_cutover_authorized":False},sort_keys=True))
        return 2
    return 0
if __name__=="__main__":sys.exit(main())
