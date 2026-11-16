#!/usr/bin/env python3
"""WE1/C03 real PostgreSQL14 + Unix-socket JWT adversarial test (UID650 only).

USE ONLY an isolated owner-private UID650 PGDATA and localhost test port.
No HEL1 connection, no financial DB, no production credentials, no SQL apply
against remote endpoints. Baseline must already contain the synthetic fixture.
"""
from __future__ import annotations
import base64, concurrent.futures, datetime, hashlib, hmac, json
import os, pathlib, signal, socket, subprocess, sys, time

SECRET="this-is-an-isolated-synthetic-only-test-secret-123"
WRITER_TEST_PASSWORD="synthetic-only-UID650-SCRAM-case-20261116"
SRC=pathlib.Path(__file__).resolve().parents[1]
PORT=55491
PGDIR=pathlib.Path.home()/"we1-c03-pg14-isolate-20261116"/"data"
SOCKET=pathlib.Path("/tmp/aewe1c03-650-20261116/appearance.sock")
PASS=[]
def require(ok,reason):
    if not ok:raise AssertionError(reason)
    PASS.append(reason)
def sh(*args, check=True, input=None, database="aoe2hd_db", user="postgres"):
    env=dict(os.environ,PGHOST="127.0.0.1",PGPORT=str(PORT),PGUSER=user,
             PGDATABASE=database,PGPASSWORD="invalid-synthetic-only-password",
             PGPASSFILE="/dev/null",PGCONNECT_TIMEOUT="3")
    p=subprocess.run(args,input=input,text=True,capture_output=True,
                     timeout=15,env=env)
    if check and p.returncode:
        raise AssertionError("COMMAND_FAILED "+str(args[:3])+" "+p.stderr[-500:])
    return p
def q(sql,user="postgres",check=True):
    return sh("/opt/homebrew/bin/psql","-X","-A","-t","-v","ON_ERROR_STOP=1",
              "-d","aoe2hd_db","-c",sql,user=user,check=check)
def verify_synthetic_host():
    require(os.geteuid()==650,"restricted_UID650")
    require(PGDIR.is_dir() and PGDIR.stat().st_uid==650 and
            PGDIR.stat().st_mode & 0o077==0,"isolated_pgdata_owner")
    d=sh("/opt/homebrew/bin/psql","-X","-A","-t","-d","postgres",
         "-c","SHOW data_directory",database="postgres")
    require(d.stdout.strip()==str(PGDIR),"exact_synthetic_PGDATA")
    require("14." in q("SHOW server_version").stdout,"PostgreSQL14")
    require(SOCKET.parent.is_dir() and SOCKET.parent.stat().st_uid==650
            and SOCKET.parent.stat().st_mode & 0o077==0,"private_synthetic_socket_dir")
    # Enforce a separately authenticated SCRAM path on THIS UID650 cluster.
    # The other isolated test roles may retain their synthetic trust rules.
    hba=PGDIR/"pg_hba.conf"
    auth_line="host aoe2hd_db aoe2war_appearance_writer 127.0.0.1/32 scram-sha-256"
    previous=hba.read_text()
    if auth_line not in previous:
        hba.write_text(auth_line+"\n"+previous)
        sh("/opt/homebrew/bin/pg_ctl","-D",str(PGDIR),"reload")
    require(hba.read_text().splitlines()[0]==auth_line,
      "synthetic_writer_SCRAM_only")
    require(q("SHOW password_encryption").stdout.strip()=="scram-sha-256",
      "isolated_password_encryption_SCRAM")
def sql_file(path):
    p=SRC/path
    data=p.read_bytes()
    r=sh("/opt/homebrew/bin/psql","-X","-v","ON_ERROR_STOP=1",
         "-d","aoe2hd_db","-f",str(p))
    return hashlib.sha256(data).hexdigest()
SNAP_SQL=[
 """SELECT c.relname||'/'||COALESCE(c.relacl::text,'<NULL>') FROM
    pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','S')
    ORDER BY c.relname""",
 """SELECT c.relname||'.'||a.attname||'/'||COALESCE(a.attacl::text,'<NULL>')
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
    ORDER BY c.relname,a.attnum""",
 """SELECT rolname||'/'||rolcanlogin||'/'||rolinherit||'/'||rolsuper
    FROM pg_roles WHERE rolname LIKE 'aoe2%' ORDER BY rolname""",
 """SELECT member.rolname||'>'||role.rolname FROM pg_auth_members m
    JOIN pg_roles member ON member.oid=m.member
    JOIN pg_roles role ON role.oid=m.roleid
    WHERE member.rolname LIKE 'aoe2%' OR role.rolname LIKE 'aoe2%'
    ORDER BY member.rolname,role.rolname""",
 """SELECT datname||'/'||COALESCE(datacl::text,'<NULL>')
    FROM pg_database WHERE datname='aoe2hd_db'""",
 """SELECT nspname||'/'||COALESCE(nspacl::text,'<NULL>')
    FROM pg_namespace WHERE nspname='public'""",
 """SELECT pg_get_userbyid(defaclrole)||'/'||COALESCE(defaclacl::text,'<NULL>')
    FROM pg_default_acl ORDER BY defaclrole"""
]
def fingerprint():
    raw="\n".join(q(sql).stdout for sql in SNAP_SQL)
    return hashlib.sha256(raw.encode()).hexdigest(),raw
def denied_as(role,sql):
    # Do not use READ ONLY here: that would raise 25006 for UPDATE and
    # hide an actual writable role! Unprivileged DML must be rejected 42501;
    # any unexpectedly permitted statement is rolled back in the same call.
    r=q("BEGIN;SET LOCAL ROLE "+role+";"+sql+";ROLLBACK",check=False)
    return r.returncode!=0 and ("42501" in r.stderr or
                                 "permission denied" in r.stderr)
def signed(uid,ttl=240,iat_offset=0):
    now=int(time.time())
    head={"alg":"HS256","typ":"JWT"}
    claims={"uid":uid,"iss":"aoe2hdbets","iat":now+iat_offset,
            "exp":now+iat_offset+ttl}
    def b64(obj):
        return base64.urlsafe_b64encode(
            json.dumps(obj,separators=(",",":"),sort_keys=True).encode()
        ).rstrip(b"=").decode()
    body=b64(head)+"."+b64(claims)
    sig=base64.urlsafe_b64encode(
        hmac.new(SECRET.encode(),body.encode(),hashlib.sha256).digest()
    ).rstrip(b"=").decode()
    return body+"."+sig
def send(token,op,**fields):
    data={"token":token,"op":op,"origin":"https://aoe2war.com",**fields}
    raw=json.dumps(data,separators=(",",":")).encode()+b"\n"
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as sk:
        sk.settimeout(7)
        sk.connect(str(SOCKET));sk.sendall(raw)
        response=b""
        while not response.endswith(b"\n"):
            b=sk.recv(2048)
            if not b:break
            response+=b
            if len(response)>2500:raise AssertionError("OVERSIZED_RESPONSE")
        return json.loads(response.decode())
def status(response,code):
    require(response.get("status")==code,
       "socket_http_"+str(code)+"_"+str(response.get("code","ok")))
def count(sql):
    return int(q(sql).stdout.strip())
def test():
    verify_synthetic_host()
    require(not SOCKET.exists(),"no_untrusted_existing_socket")
    # After an earlier setup, staged role must be NOLOGIN before inverse.
    if count("SELECT count(*) FROM pg_roles WHERE rolname='aoe2war_appearance_writer'")!=0:
        q("ALTER ROLE aoe2war_appearance_writer NOLOGIN")
        sql_file("config/appearance-c03-v1-inverse.sql")
    # Intentional isolated TEST FIXTURE RESET. The inverse must preserve
    # campaign/override history; only the synthetic test dataset is reset
    # between runs to make replay deterministic. Never run on HEL1.
    q("BEGIN;DELETE FROM public.user_activity_events;"
      "DELETE FROM public.user_theme_campaign_overrides "
      "WHERE campaign_key='november-crimson-2026';"
      "UPDATE public.site_theme_campaign SET "
      "campaign_key='october-black-2026',label='October 2026',"
      "enabled=true,theme_key='black',"
      "starts_at=TIMESTAMP '2026-10-01 06:00:00',"
      "ends_at=TIMESTAMP '2026-11-01 06:00:00',"
      "updated_by_user_id=1 WHERE slot=1;COMMIT")
    require(q("SELECT campaign_key FROM public.site_theme_campaign WHERE slot=1"
      ).stdout.strip()=="october-black-2026","synthetic_october_reseeded")
    require(count("SELECT count(*) FROM public.user_theme_campaign_overrides "
      "WHERE campaign_key='october-black-2026'")==1,
      "synthetic_october_history_preserved")
    base,rawbase=fingerprint()
    apply_hash=sql_file("config/appearance-c03-v1-apply.sql")
    stage,rawstage=fingerprint()
    require(stage!=base,"ACL_changed_only_on_staging")
    require(count("SELECT count(*) FROM pg_roles WHERE rolname='aoe2war_appearance_writer' AND NOT rolcanlogin")==1,"writer_NOLOGIN_on_stage")
    p=sh("/opt/homebrew/bin/psql","-X","-A","-t","-d","aoe2hd_db","-c","SELECT 1",
         user="aoe2war_appearance_writer",check=False)
    require(p.returncode!=0,"writer_cannot_login_before_activation")
    require(denied_as("aoe2war_web_prod","UPDATE public.site_theme_campaign SET enabled=false WHERE slot=1"),"web_update_denied")
    require(denied_as("aoe2war_web_prod","INSERT INTO public.user_theme_campaign_overrides(campaign_key,user_id,theme_key) VALUES ('november-crimson-2026',3,'midnight')"),"web_override_insert_denied")
    require(denied_as("aoe2war_web_prod","SELECT nextval('public.user_activity_events_id_seq')"),"web_activity_sequence_denied")
    require(denied_as("aoe2war_web_prod","SELECT * FROM public.bet_wagers"),"web_financial_select_denied")
    require(denied_as("aoe2war_web_prod","SELECT is_admin FROM public.users"),"web_admin_column_denied")
    require(denied_as("aoe2war_appearance_writer","SELECT * FROM public.bet_wagers"),"writer_financial_select_denied")
    require(denied_as("aoe2war_appearance_writer","UPDATE public.users SET is_admin=true WHERE uid='u_ordinary'"),"writer_admin_change_denied")
    require(denied_as("aoe2war_appearance_writer","SELECT nextval('public.users_id_seq')"),"writer_users_sequence_denied")
    require(count("SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('aoe2war_web_prod','aoe2war_appearance_writer')")==0,"no_role_inheritance")
    require(q("BEGIN READ ONLY;SET LOCAL ROLE aoe2war_web_prod;SELECT campaign_key FROM public.site_theme_campaign WHERE slot=1;ROLLBACK").returncode==0,"web_public_campaign_read")
    require(q("BEGIN READ ONLY;SET LOCAL ROLE aoe2war_web_prod;SELECT theme_key FROM public.user_theme_campaign_overrides LIMIT 1;ROLLBACK").returncode==0,"web_override_read")
    # Synthetic-only login toggle simulates a *future separate* owner permit.
    q("ALTER ROLE aoe2war_appearance_writer LOGIN PASSWORD '"+
      WRITER_TEST_PASSWORD+"'")
    bad=sh("/opt/homebrew/bin/psql","-w","-X","-A","-t","-d","aoe2hd_db",
      "-c","SELECT current_user",user="aoe2war_appearance_writer",check=False)
    require(bad.returncode!=0,"SCRAM_writer_missing_password_denied")
    authenticated_env=dict(os.environ,PGHOST="127.0.0.1",PGPORT=str(PORT),
      PGUSER="aoe2war_appearance_writer",PGDATABASE="aoe2hd_db",
      PGCONNECT_TIMEOUT="3",
      PGPASSWORD=WRITER_TEST_PASSWORD)
    authenticated=subprocess.run(["/opt/homebrew/bin/psql","-X","-A","-t",
      "-c","SELECT current_user"],capture_output=True,text=True,timeout=8,
      env=authenticated_env)
    require(authenticated.returncode==0 and
      authenticated.stdout.strip()=="aoe2war_appearance_writer",
      "dedicated_actual_SCRAM_password_success")
    authenticated_env["PGPASSWORD"]="wrong-synthetic-test-password"
    rejected=subprocess.run(["/opt/homebrew/bin/psql","-X","-A","-t",
      "-c","SELECT current_user"],capture_output=True,text=True,timeout=8,
      env=authenticated_env)
    require(rejected.returncode!=0 and "password authentication failed" in
      rejected.stderr,"dedicated_actual_SCRAM_wrong_password_denied")
    env=dict(os.environ,NODE_ENV="test",AOE2WAR_APPEARANCE_TEST_ONLY="1",
        APPEARANCE_TEST_SOCKET=str(SOCKET),
        APPEARANCE_DATABASE_URL="postgresql://aoe2war_appearance_writer:"+WRITER_TEST_PASSWORD+"@127.0.0.1:55491/aoe2hd_db",
        SESSION_SECRET=SECRET)
    process=subprocess.Popen(
      ["/usr/local/bin/node",str(SRC/"scripts/appearance_c03_writer.mjs")],
      cwd=SRC,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for i in range(90):
            if SOCKET.exists():break
            if process.poll() is not None:break
            time.sleep(.1)
        require(SOCKET.exists() and process.poll() is None,
            "isolated_writer_unix_socket_started")
        st=SOCKET.stat()
        require(st.st_uid==650 and st.st_mode & 0o007==0,
            "synthetic_socket_user_group_boundary")
        admin=signed("u_admin")
        ordinary=signed("u_ordinary")
        other=signed("u_other")
        status(send("", "activate-november",campaignKey="november-crimson-2026"),401)
        status(send(signed("u_admin",-10,iat_offset=-600),
            "activate-november",campaignKey="november-crimson-2026"),401)
        status(send(signed("u_admin",120,iat_offset=200),
            "activate-november",campaignKey="november-crimson-2026"),401)
        status(send(signed("u_nosuch"),"activate-november",
            campaignKey="november-crimson-2026"),403)
        status(send(ordinary,"activate-november",
            campaignKey="november-crimson-2026"),403)
        status(send(admin,"save-override",campaignKey="november-crimson-2026",
            themeKey="midnight"),409)
        status(send(admin,"activate-november",
            campaignKey="november-crimson-2026",isAdmin=True),403)
        status(send(admin,"activate-november",
            campaignKey="november-crimson-2026",userId=1),403)
        status(send(admin,"activate-november",
            campaignKey="september-fake"),400)
        status(send(admin,"activate-november",
            campaignKey="november-crimson-2026",origin="https://evil.invalid"),403)
        status(send(admin,"activate-november",
            campaignKey="november-crimson-2026"),200)
        require(q("SELECT campaign_key FROM public.site_theme_campaign WHERE slot=1").stdout.strip()=="november-crimson-2026","november_singleton_activated")
        require(count("SELECT count(*) FROM public.user_theme_campaign_overrides WHERE campaign_key='october-black-2026'")==1,"october_override_preserved")
        status(send(admin,"activate-november",
            campaignKey="november-crimson-2026"),200)
        require(count("SELECT count(*) FROM public.user_activity_events WHERE type='site_theme_campaign_activate'")==1,"admin_activation_idempotent_audit")
        status(send(ordinary,"save-override",
            campaignKey="november-crimson-2026",themeKey="midnight"),200)
        status(send(ordinary,"save-override",
            campaignKey="november-crimson-2026",themeKey="midnight",userId=3),403)
        status(send(ordinary,"save-override",
            campaignKey="november-crimson-2026",themeKey="impossible"),400)
        status(send(ordinary,"save-override",
            campaignKey="october-black-2026",themeKey="midnight"),400)
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            answers=list(pool.map(lambda i: send(ordinary,"save-override",
                campaignKey="november-crimson-2026",themeKey="midnight"),range(8)))
        require(all(x.get("status")==200 for x in answers),"concurrent_identical_override_pass")
        require(count("SELECT count(*) FROM public.user_theme_campaign_overrides WHERE campaign_key='november-crimson-2026' AND user_id=2")==1,"concurrent_override_one_row")
        require(count("SELECT count(*) FROM public.user_activity_events WHERE user_id=2 AND type='theme_campaign_override' AND label='november-crimson-2026/midnight'")==1,"concurrent_audit_deduplicated")
        status(send(other,"save-override",
            campaignKey="november-crimson-2026",themeKey="black"),200)
        require(count("SELECT count(*) FROM public.user_theme_campaign_overrides WHERE campaign_key='november-crimson-2026' AND user_id=3")==1,"separate_other_user")
        q("UPDATE public.site_theme_campaign SET ends_at='2026-11-02 07:00:00' WHERE slot=1")
        status(send(ordinary,"save-override",
            campaignKey="november-crimson-2026",themeKey="grey"),409)
        q("UPDATE public.site_theme_campaign SET ends_at='2026-12-01 07:00:00' WHERE slot=1")
        prior=q("SELECT theme_key FROM public.user_theme_campaign_overrides WHERE user_id=2 AND campaign_key='november-crimson-2026'").stdout.strip()
        q("REVOKE INSERT (user_id,type,path,label,metadata) ON public.user_activity_events FROM aoe2war_appearance_writer")
        status(send(ordinary,"save-override",
            campaignKey="november-crimson-2026",themeKey="grey"),503)
        require(q("SELECT theme_key FROM public.user_theme_campaign_overrides WHERE user_id=2 AND campaign_key='november-crimson-2026'").stdout.strip()==prior,
            "failed_activity_insert_rolls_back_override")
        q("GRANT INSERT (user_id,type,path,label,metadata) ON public.user_activity_events TO aoe2war_appearance_writer")
        status(send(ordinary,"save-override",
            campaignKey="november-crimson-2026",themeKey="grey"),200)
        require(q("SELECT theme_key FROM public.user_theme_campaign_overrides WHERE user_id=2 AND campaign_key='november-crimson-2026'").stdout.strip()=="grey",
            "audit_and_override_commit_together")
    finally:
        if process.poll() is None:
            process.send_signal(signal.SIGTERM)
            try:process.communicate(timeout=6)
            except subprocess.TimeoutExpired:
                process.kill();process.communicate(timeout=4)
        else:process.communicate(timeout=2)
        # The only synthetic writer port/socket is closed here.
        for i in range(15):
            if not SOCKET.exists():break
            time.sleep(.1)
        if SOCKET.exists():SOCKET.unlink()
    q("ALTER ROLE aoe2war_appearance_writer NOLOGIN PASSWORD NULL")
    # The tested inverse does not delete user records: only role/ACL state.
    inverse_hash=sql_file("config/appearance-c03-v1-inverse.sql")
    restored,rawrestored=fingerprint()
    require(restored==base,"RAW_CATALOG_ACL_SHA256_EXACT_ROLLBACK")
    require(count("SELECT count(*) FROM pg_roles WHERE rolname='aoe2war_appearance_writer'")==0,"writer_role_absent_after_inverse")
    require(count("SELECT count(*) FROM public.user_theme_campaign_overrides WHERE campaign_key='october-black-2026'")==1,"historical_october_data_preserved")
    return {"verdict":"PASS_ISOLATED_NOT_PRODUCTION","tests":len(PASS),
      "cases":PASS,"sourceSqlSha256":{"apply":apply_hash,"inverse":inverse_hash},
      "beforeAclSha256":base,"stagedAclSha256":stage,
      "rollbackAclSha256":restored,
      "database":"SYNTHETIC_LOCAL_UID650_POSTGRESQL14",
      "productionSqlChanges":False,"ownerPermit":False}

if __name__=="__main__":
    try:
        result=test()
        print(json.dumps(result,sort_keys=True,separators=(",",":")))
    except Exception as e:
        print(json.dumps({"verdict":"HOLD_ISOLATED_TEST_FAILURE",
              "passedSoFar":len(PASS),"error":str(e)[:500],
              "database":"SYNTHETIC_ONLY"},sort_keys=True))
        sys.exit(1)
