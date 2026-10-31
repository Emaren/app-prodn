#!/usr/bin/env python3
"""R25 B NEW-ONLY HEL1 setup: root-backed plan/commit, never service activation.

Run only by original owner through a separately SHA-pinned Mac launcher.
All source is from immutable B #1085 commit; original 3030 and finance are
untouched. No retry after partial commit: preserve sealed receipt and HOLD.
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import socket
import stat
import subprocess
import sys
from urllib.parse import quote

HOST="ubuntu-4gb-hel1-11"
SOURCE_COMMIT="7f365a3d27f56d6321ad10a34706889814fe4131"
OLD_PID=2625090
NEW_USER="aoe2war-r24-web"
NEW_ROLE="aoe2war_r25_web_ro"
NEW_UNIT="aoe2hdbets-web-r24.service"
GUARD=Path("/usr/local/lib/aoe2war-r25/r25_b_guard.cjs")
WITNESS=Path("/etc/aoe2war/r24-parallel-web/approved-runtime-prestart.py")
ENVFILE=Path("/etc/aoe2war/r24-parallel-web/readonly-runtime.env")
DROPIN=Path("/etc/systemd/system/aoe2hdbets-web-r24.service.d/90-r25-b-isolation.conf")
RECEIPT=Path("/var/lib/aoe2war-r25-b-setup/receipt.json")
GUARD_SHA="dead2815b3f20b311ede29dfd99086cbb81dfd6a73f1a71f2b7b57ccd74e809d"
WITNESS_SHA="c13d42c7de3ab8c9e55a68008ede2a9e2b55375d4aeae735cd47cf368b0a5e80"
DROPIN_GIT_BLOB="c9dc1999ba5c62f149240e4bab11b579afeb69bc"
NFT_GIT_BLOB="4b7323c8fe81ef09e8543bf4f9cfc22e3729aaad"

def gitblob(data):
    return hashlib.sha1(b"blob "+str(len(data)).encode()+b"\x00"+data).hexdigest()
ASSETS=("guard","witness","dropin","nft")
MAX_BYTES={"guard":8192,"witness":32768,"dropin":8192,"nft":4096}
SCHEMA="aoe2war.r25.b.additive-3031-setup.v1"

def hold(reason):
    raise RuntimeError("HOLD:R25_B_SETUP:"+reason)

def sha(b):
    return hashlib.sha256(b).hexdigest()

def cmd(args, data=None, timeout=15, allow_fail=False):
    p=subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                     timeout=timeout,check=False,env={"PATH":"/usr/sbin:/usr/bin:/bin","LANG":"C"})
    if len(p.stdout)>65536 or len(p.stderr)>16384:hold("NATIVE_COMMAND_OVERSIZED")
    if p.returncode and not allow_fail:hold("NATIVE_COMMAND_FAILED:"+Path(args[0]).name)
    return p

def root_path(path, expect_dir=False):
    for parent in [path,*path.parents]:
        if parent.exists() or parent.is_symlink():
            st=parent.lstat()
            if st.st_uid!=0 or st.st_mode & 0o022 or stat.S_ISLNK(st.st_mode):
                hold("UNTRUSTED_ROOT_PATH:"+str(parent))
            if parent==path:
                if expect_dir and not stat.S_ISDIR(st.st_mode):hold("EXPECTED_DIRECTORY")
                if not expect_dir and not stat.S_ISREG(st.st_mode):hold("EXPECTED_REGULAR_FILE")

def old_web():
    p=cmd(["/usr/bin/systemctl","show","aoe2hdbets-web.service",
           "-p","ActiveState","-p","MainPID","--no-pager"])
    d=dict(x.split("=",1) for x in p.stdout.decode().splitlines() if "=" in x)
    if d.get("ActiveState")!="active" or d.get("MainPID")!=str(OLD_PID):
        hold("ORIGINAL_FINANCIAL_WEB_PID_DRIFT")
    return d

def new_state():
    p=cmd(["/usr/bin/systemctl","show",NEW_UNIT,
           "-p","ActiveState","-p","MainPID","--no-pager"],allow_fail=True)
    d=dict(x.split("=",1) for x in p.stdout.decode().splitlines() if "=" in x)
    if d.get("ActiveState") not in ("inactive","failed","") or int(d.get("MainPID","0"))!=0:
        hold("NEW_WEB_ALREADY_RUNNING_OR_UNVERIFIABLE")

def uid_status():
    try: account=pwd.getpwnam(NEW_USER)
    except KeyError: return None
    if account.pw_uid in (0,1000) or account.pw_gid in (0,1000):
        hold("WEB_OS_USER_COLLISION")
    # A stable dedicated service account must not own an active existing process.
    for p in Path("/proc").iterdir():
        if not p.name.isdigit():continue
        try:
            lines=(p/"status").read_text().splitlines()
            uid=int(next(x.split()[1] for x in lines if x.startswith("Uid:")))
            if uid==account.pw_uid:hold("DEDICATED_UID_ALREADY_HAS_PROCESSES")
        except (OSError, StopIteration, ValueError):
            continue
    return account.pw_uid

def nft_tables():
    p=cmd(["/usr/sbin/nft","-j","list","tables"])
    try: data=json.loads(p.stdout)
    except ValueError:hold("NFT_TABLES_JSON_INVALID")
    found=[]
    for obj in data.get("nftables",[]):
        t=obj.get("table")
        if isinstance(t,dict):found.append((t.get("family"),t.get("name")))
    if ("inet","aoe2war_r25_b") in found:hold("EXISTING_B_NFT_TABLE_NO_OVERWRITE")
    return True

def role_absent(database):
    sql="SELECT count(*) FROM pg_roles WHERE rolname='"+NEW_ROLE+"';"
    p=cmd(["/usr/sbin/runuser","-u","postgres","--","/usr/bin/psql",
           "-X","-A","-t","-w","-v","ON_ERROR_STOP=1","-d",database,"-c",sql])
    if p.stdout.strip()!=b"0":hold("NEW_DB_ROLE_ALREADY_EXISTS_OR_AMBIGUOUS")

def check_inputs(args):
    if sys.platform!="linux" or os.geteuid()!=0 or socket.gethostname().split(".")[0]!=HOST:
        hold("ORIGINAL_HEL1_ROOT_REQUIRED")
    if args.commit!=SOURCE_COMMIT:hold("IMMUTABLE_B_SOURCE_IDENTITY_DRIFT")
    if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]{0,62}",args.database):
        hold("EXPLICIT_DATABASE_NAME_REQUIRED")
    if args.phase not in ("plan","install"):hold("INVALID_PHASE")
    if args.phase=="install" and args.consent!=("INSTALL-R25-B-NEW-ONLY-"+SOURCE_COMMIT[:12]):
        hold("EXPLICIT_OWNER_INSTALL_CONSENT_MISSING")
    if RECEIPT.exists() or RECEIPT.is_symlink() or (RECEIPT.parent/"started.json").exists():
        hold("EXISTING_B_INSTALL_RECEIPT_NO_REPLAY")
    old_web();new_state()
    if Path("/proc/net/tcp").is_file():
        for s in Path("/proc/net/tcp").read_text().splitlines()[1:]:
            parts=s.split()
            if parts[3]=="0A" and int(parts[1].split(":")[1],16)==3031:
                hold("PORT_3031_ALREADY_LISTENING")
    for item in (GUARD,WITNESS,ENVFILE,DROPIN):
        root_path(item)
        if item.exists() or item.is_symlink():hold("INSTALL_TARGET_EXISTS_NO_OVERWRITE")
    for item in (GUARD.parent,WITNESS.parent,DROPIN.parent,RECEIPT.parent):
        root_path(item,expect_dir=True)
    uid=uid_status()
    nft_tables()
    role_absent(args.database)
    return uid

def decode_bundle(data):
    try:
        items=json.loads(base64.b64decode(data,validate=True))
    except (ValueError,TypeError):hold("SOURCE_BUNDLE_DECODE")
    if not isinstance(items,dict) or set(items)!=set(ASSETS):
        hold("EXACT_B_FOUR_ASSETS_REQUIRED")
    out={}
    for k in ASSETS:
        try:raw=base64.b64decode(items[k],validate=True)
        except (ValueError,TypeError):hold("ASSET_INVALID:"+k)
        if not raw or len(raw)>MAX_BYTES[k] or b"\x00" in raw:
            hold("ASSET_BOUNDS:"+k)
        out[k]=raw
    if sha(out["guard"])!=GUARD_SHA or sha(out["witness"])!=WITNESS_SHA:
        hold("B_GUARD_OR_WITNESS_SHA_DRIFT")
    if gitblob(out["dropin"])!=DROPIN_GIT_BLOB or gitblob(out["nft"])!=NFT_GIT_BLOB:
        hold("B_NEW_ONLY_NFT_OR_SYSTEMD_SOURCE_BLOB_DRIFT")
    drop=out["dropin"].decode()
    if (drop.count("__B_GUARD_SHA256__")!=1 or
        "User="+NEW_USER not in drop or "ExecStartPre=+" not in drop or
        "InaccessiblePaths=/run /var/run" not in drop):
        hold("NEW_UNIT_DROPIN_CONTRACT_DRIFT")
    drop=drop.replace("__B_GUARD_SHA256__",GUARD_SHA)
    if "__" in drop or "--expected-guard-sha256 "+GUARD_SHA not in drop:
        hold("UNRESOLVED_DROPIN_PLACEHOLDER")
    out["dropin"]=drop.encode()
    template="\n".join(s for s in out["nft"].decode().splitlines() if not s.lstrip().startswith("#"))
    if template.count("__DEDICATED_UID__")!=2:
        hold("NFT_TEMPLATE_UNEXPECTED_UID_PLACEHOLDER")
    out["nft"]= (template+"\n").encode()
    return out

def ensure_parent(path,mode):
    current=Path("/")
    for part in path.parts[1:]:
        current=current/part
        if not current.exists():
            current.mkdir(mode=mode if current==path else 0o755)
        root_path(current,expect_dir=True)
    if stat.S_IMODE(path.stat().st_mode)!=mode:
        hold("EXISTING_ROOT_DIRECTORY_MODE_NOT_EXACT")

def create_new(path, data, mode):
    fd=os.open(str(path),os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,mode)
    try:
        with os.fdopen(fd,"wb",closefd=False) as f:
            f.write(data);f.flush();os.fsync(f.fileno())
    finally:os.close(fd)
    os.chmod(path,mode)
    if sha(path.read_bytes())!=sha(data):hold("WRITTEN_FILE_BYTES_DRIFT")

def scram_verifier(password):
    if not re.fullmatch(r"[a-zA-Z0-9_-]{40,100}",password):
        hold("GENERATED_PASSWORD_FORMAT")
    # Avoid transmitting a plaintext role password in CREATE ROLE SQL.
    salt=secrets.token_bytes(16)
    iterations=8192
    salted=hashlib.pbkdf2_hmac("sha256",password.encode(),salt,iterations)
    client=hmac.new(salted,b"Client Key",hashlib.sha256).digest()
    stored=hashlib.sha256(client).digest()
    server=hmac.new(salted,b"Server Key",hashlib.sha256).digest()
    return ("SCRAM-SHA-256$"+str(iterations)+":"+
        base64.b64encode(salt).decode()+"$"+
        base64.b64encode(stored).decode()+":"+
        base64.b64encode(server).decode())

def new_role_sql(password):
    verifier=scram_verifier(password)
    # ONE DB transaction; fail-closed if inherited PUBLIC/SQL capabilities.
    return ("""
BEGIN;
CREATE ROLE aoe2war_r25_web_ro LOGIN NOINHERIT NOSUPERUSER
 NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '%s';
ALTER ROLE aoe2war_r25_web_ro SET default_transaction_read_only=on;
ALTER ROLE aoe2war_r25_web_ro SET statement_timeout='10000ms';
GRANT USAGE ON SCHEMA public TO aoe2war_r25_web_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO aoe2war_r25_web_ro;
DO $r25$
BEGIN
 IF has_database_privilege('aoe2war_r25_web_ro',current_database(),'CREATE')
 OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON m.member=r.oid
    WHERE r.rolname='aoe2war_r25_web_ro')
 OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_temp_%%'
    AND has_schema_privilege('aoe2war_r25_web_ro',n.oid,'CREATE'))
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%%' AND n.nspname<>'information_schema'
      AND c.relkind IN ('r','p','f','v','m')
      AND (has_table_privilege('aoe2war_r25_web_ro',c.oid,'INSERT')
       OR has_table_privilege('aoe2war_r25_web_ro',c.oid,'UPDATE')
       OR has_table_privilege('aoe2war_r25_web_ro',c.oid,'DELETE')
       OR has_table_privilege('aoe2war_r25_web_ro',c.oid,'TRUNCATE')
       OR has_table_privilege('aoe2war_r25_web_ro',c.oid,'REFERENCES')
       OR has_table_privilege('aoe2war_r25_web_ro',c.oid,'TRIGGER')))
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%%' AND c.relkind='S'
      AND (has_sequence_privilege('aoe2war_r25_web_ro',c.oid,'USAGE')
       OR has_sequence_privilege('aoe2war_r25_web_ro',c.oid,'UPDATE')))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT LIKE 'pg_%%' AND n.nspname<>'information_schema'
      AND (p.prosecdef OR p.provolatile='v')
      AND has_function_privilege('aoe2war_r25_web_ro',p.oid,'EXECUTE'))
 THEN RAISE EXCEPTION 'R25_B_NEW_ROLE_WRITABLE_OR_EXECUTE_CAPABILITY'; END IF;
END $r25$;
COMMIT;
""" % verifier).encode()

def install(args,bundle,uid):
    # No attempt to roll back after *any* external mutation; preserve partial
    # condition for independent review. Every path O_EXCL, no old-path touches.
    ensure_parent(RECEIPT.parent,0o700)
    create_new(RECEIPT.parent/"started.json",(json.dumps({
       "schema":SCHEMA,"status":"INSTALL_STARTED_NOT_CERTIFIED",
       "source_commit":SOURCE_COMMIT,"old_web_pid":OLD_PID,
       "database_name":args.database,"no_retry_without_independent_repair":True
    },sort_keys=True)+"\n").encode(),0o600)
    if uid is None:
        cmd(["/usr/sbin/useradd","--system","--no-create-home",
             "--shell","/usr/sbin/nologin","--user-group",NEW_USER])
        uid=pwd.getpwnam(NEW_USER).pw_uid
        if uid in (0,1000):hold("NEW_UID_INVALID")
    password=secrets.token_urlsafe(48)
    ensure_parent(GUARD.parent,0o755)
    ensure_parent(WITNESS.parent,0o700)
    ensure_parent(DROPIN.parent,0o755)
    create_new(GUARD,bundle["guard"],0o644)
    create_new(WITNESS,bundle["witness"],0o644)
    nft_src=bundle["nft"].decode().replace("__DEDICATED_UID__",str(uid)).encode()
    cmd(["/usr/sbin/nft","-c","-f","-"],data=nft_src)
    sql=new_role_sql(password)
    cmd(["/usr/sbin/runuser","-u","postgres","--","/usr/bin/psql",
         "-X","-w","-q","-v","ON_ERROR_STOP=1","-d",args.database],
        data=sql,timeout=25)
    env=("DATABASE_URL=postgresql://"+NEW_ROLE+":"+quote(password,safe="")+
         "@127.0.0.1:5432/"+args.database+"\n").encode()
    create_new(ENVFILE,env,0o600)
    uid_status()
    old_web();new_state()
    cmd(["/usr/sbin/nft","-f","-"],data=nft_src)
    create_new(DROPIN,bundle["dropin"],0o644)
    cmd(["/usr/bin/systemctl","daemon-reload"])
    old_web();new_state()
    receipt={"schema":SCHEMA,"status":"PASS_B_NEW_ONLY_SETUP_NOT_RUNTIME_OR_CUTOVER",
      "source_commit":SOURCE_COMMIT,"old_web_mainpid":OLD_PID,
      "unit":NEW_UNIT,"uid":uid,"database_name":args.database,
      "db_role":NEW_ROLE,"new_guard_sha256":sha(bundle["guard"]),
      "new_witness_sha256":sha(bundle["witness"]),
      "new_dropin_sha256":sha(bundle["dropin"]),
      "new_nft_sha256":sha(nft_src),
      "environment_sha256":sha(env),"secret_values_disclosed":False,
      "candidate_started":False,"financial_authorized":False,
      "public_cutover_authorized":False}
    receipt["report_sha256"]=sha(json.dumps(receipt,sort_keys=True,separators=(",",":")).encode())
    create_new(RECEIPT,(json.dumps(receipt,sort_keys=True)+"\n").encode(),0o600)
    return receipt

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--phase",required=True,choices=("plan","install"))
    p.add_argument("--commit",required=True)
    p.add_argument("--database",required=True)
    p.add_argument("--consent",default="")
    p.add_argument("--bundle-b64",required=True)
    a=p.parse_args()
    try:
        bundle=decode_bundle(a.bundle_b64)
        uid=check_inputs(a)
        if a.phase=="plan":
            out={"schema":SCHEMA,"status":"PASS_B_INSTALL_PLAN_ONLY_NO_WRITES",
                 "source_commit":SOURCE_COMMIT,"old_web_pid":OLD_PID,
                 "database_name":a.database,"candidate_uid_existing":uid,
                 "would_create_new_os_user":uid is None,
                 "would_create_new_db_role":NEW_ROLE,
                 "would_install_new_nft_table":"inet aoe2war_r25_b",
                 "would_add_new_only_systemd_dropin":str(DROPIN),
                 "would_install_guard_sha256":GUARD_SHA,
                 "would_install_witness_sha256":WITNESS_SHA,
                 "public_cutover_authorized":False}
        else:out=install(a,bundle,uid)
        print(json.dumps(out,sort_keys=True))
        return 0
    except (RuntimeError,OSError,ValueError,subprocess.TimeoutExpired) as e:
        reason=str(e).splitlines()[0][:180]
        print(json.dumps({"schema":SCHEMA,"status":"HOLD","reason":reason,
             "partial_install_may_exist":a.phase=="install",
             "do_not_blind_retry":True,"public_cutover_authorized":False},sort_keys=True))
        return 2

if __name__=="__main__":sys.exit(main())
