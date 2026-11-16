#!/usr/bin/env python3
"""WE1/C03 exact WE3-core PostgreSQL14 stage/test/inverse (UID650 ONLY).

Neither connects to nor edits HEL1. Must refuse everything other than the
pre-existing UID650 isolated PostgreSQL PGDATA at localhost:55491 and the
immutable source-reviewed WE3 Git HEAD. Synthetic login is test-only.
"""
from __future__ import annotations
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys

EXPECTED_PGDATA=pathlib.Path.home()/"we1-c03-pg14-isolate-20261116"/"data"
WE1=pathlib.Path(__file__).resolve().parents[1]
WE3=pathlib.Path.home()/"we1-c03-we3-exact-source-20261116"
WE3_HEAD="6a9c89a040fc05edc99ef1e85d9ecb5273534683"
WE3_CORE_BLOB="75b6f2e1d436a9fc31acb97a3b4fb5d6150f26f4"
EXPECTED_BASELINE="4482b1b7bca488b7dbcd0cc0e5b191d770b7fe4546f1d44b9493a77152806b75"
SYNTHETIC_PASSWORD="synthetic-only-UID650-SCRAM-case-20261116"
CASES=[]
def yes(cond,label):
    if not cond:raise AssertionError(label)
    CASES.append(label)
def cmd(args,*,input=None,check=True,timeout=25,env=None):
    p=subprocess.run(args,input=input,text=True,capture_output=True,
       timeout=timeout,env=env)
    if check and p.returncode!=0:
        raise AssertionError("CMD_HOLD "+args[0]+" "+
            p.stderr[-350:].replace(SYNTHETIC_PASSWORD,"[synthetic]"))
    return p
def pg_env():
    return dict(os.environ,PGHOST="127.0.0.1",PGPORT="55491",
       PGUSER="postgres",PGDATABASE="aoe2hd_db",PGPASSWORD="",
       PGPASSFILE="/dev/null",PGCONNECT_TIMEOUT="3")
def query(sql,*,database="aoe2hd_db",check=True):
    return cmd(["/opt/homebrew/bin/psql","-X","-A","-t",
        "-v","ON_ERROR_STOP=1","-d",database,"-c",sql],
        check=check,env=pg_env()).stdout.strip() if check else cmd(
        ["/opt/homebrew/bin/psql","-X","-A","-t",
         "-v","ON_ERROR_STOP=1","-d",database,"-c",sql],
        check=False,env=pg_env())
def file_sql(path):
    p=WE1/path
    b=p.read_bytes()
    cmd(["/opt/homebrew/bin/psql","-X","-v","ON_ERROR_STOP=1",
        "-d","aoe2hd_db","-f",str(p)],env=pg_env(),timeout=20)
    return hashlib.sha256(b).hexdigest()
CATALOG_SQL=[
 """SELECT c.relname||'/'||COALESCE(c.relacl::text,'<NULL>') FROM
    pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','S') ORDER BY c.relname""",
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
    # Preserve the exact original psql stdout trailing-newline bytes. The
    # previous physical receipt hashed raw output, not stripped results.
    raw=[]
    for statement in CATALOG_SQL:
        p=cmd(["/opt/homebrew/bin/psql","-X","-A","-t",
            "-v","ON_ERROR_STOP=1","-d","aoe2hd_db","-c",statement],env=pg_env())
        raw.append(p.stdout)
    return hashlib.sha256("\n".join(raw).encode()).hexdigest()
def denied(role,sql):
    statement="BEGIN;SET LOCAL ROLE "+role+";"+sql+";ROLLBACK"
    p=query(statement,check=False)
    return p.returncode!=0 and ("permission denied" in p.stderr or
        "42501" in p.stderr)
def preflight():
    yes(os.geteuid()==650,"restricted_UID650")
    yes(EXPECTED_PGDATA.is_dir() and
        EXPECTED_PGDATA.stat().st_uid==650 and
        EXPECTED_PGDATA.stat().st_mode&0o077==0,
        "synthetic_PGDATA_owner_private")
    yes(query("SHOW data_directory",database="postgres")==str(EXPECTED_PGDATA),
       "exact_local_PGDATA_before_every_mutation")
    yes("14." in query("SHOW server_version"),"PostgreSQL14")
    yes(WE3.is_dir() and WE3.stat().st_uid==650,"WE3_UID650_source")
    head=cmd(["git","-C",str(WE3),"rev-parse","HEAD"]).stdout.strip()
    core=cmd(["git","-C",str(WE3),"hash-object",
       "lib/appearanceWriterCore.mjs"]).stdout.strip()
    yes(head==WE3_HEAD and core==WE3_CORE_BLOB,"WE3_exact_HEAD_core_blob")
    yes(not cmd(["git","-C",str(WE3),"status","--porcelain"]).stdout.strip(),
        "WE3_source_unmodified")
    yes(query("SELECT count(*) FROM pg_roles WHERE rolname='aoe2war_appearance_writer'")=="0",
        "no_writer_role_preimage")
    yes(fingerprint()==EXPECTED_BASELINE,"exact_original_raw_catalog_ACL")
    hba=(EXPECTED_PGDATA/"pg_hba.conf").read_text().splitlines()[0]
    yes(hba=="host aoe2hd_db aoe2war_appearance_writer 127.0.0.1/32 scram-sha-256",
        "synthetic_only_writer_SCRAM_HBA")
def reseed_fixture():
    # This is intentionally the *synthetic test* DB, never the real campaign.
    query("BEGIN;DELETE FROM public.user_activity_events;"
      "DELETE FROM public.user_theme_campaign_overrides WHERE "
      "campaign_key='november-crimson-2026';"
      "UPDATE public.site_theme_campaign SET "
      "campaign_key='october-black-2026',label='October 2026',"
      "enabled=true,theme_key='black',"
      "starts_at=TIMESTAMP '2026-10-01 06:00:00',"
      "ends_at=TIMESTAMP '2026-11-01 06:00:00',updated_by_user_id=1 "
      "WHERE slot=1;COMMIT")
    yes(query("SELECT campaign_key FROM public.site_theme_campaign "
      "WHERE slot=1")=="october-black-2026","synthetic_only_october_reseed")
    yes(query("SELECT count(*) FROM public.user_theme_campaign_overrides "
      "WHERE campaign_key='october-black-2026'")=="1",
      "real_fixture_historic_october_preserved")
def test_grants():
    yes(query("SELECT rolcanlogin::text FROM pg_roles "
        "WHERE rolname='aoe2war_appearance_writer'")=="false",
        "stage_writer_NOLOGIN")
    yes(query("SELECT count(*) FROM pg_auth_members m JOIN pg_roles r "
        "ON r.oid=m.member WHERE r.rolname IN "
        "('aoe2war_web_prod','aoe2war_appearance_writer')")=="0",
        "zero_role_memberships")
    yes(denied("aoe2war_web_prod",
        "UPDATE public.site_theme_campaign SET enabled=false WHERE slot=1"),
        "web_DML_denied_42501")
    yes(denied("aoe2war_web_prod",
        "INSERT INTO public.user_theme_campaign_overrides "
        "(campaign_key,user_id,theme_key) VALUES "
        "('november-crimson-2026',3,'midnight')"),
        "web_override_INSERT_denied")
    yes(denied("aoe2war_web_prod",
        "SELECT nextval('public.user_theme_campaign_overrides_id_seq')"),
        "web_sequence_denied")
    yes(denied("aoe2war_web_prod","SELECT * FROM public.bet_wagers"),
        "web_financial_SELECT_denied")
    yes(denied("aoe2war_web_prod","SELECT is_admin FROM public.users"),
        "web_admin_column_denied")
    yes(denied("aoe2war_appearance_writer","SELECT * FROM public.bet_wagers"),
        "writer_financial_SELECT_denied")
    yes(denied("aoe2war_appearance_writer",
        "UPDATE public.users SET is_admin=true WHERE uid='u_ordinary'"),
        "writer_users_UPDATE_denied")
    yes(denied("aoe2war_appearance_writer",
        "SELECT nextval('public.users_id_seq')"),"writer_users_sequence_denied")
    yes(query("SELECT has_column_privilege('aoe2war_web_prod',"
        "'public.site_theme_campaign','theme_key','SELECT')")=="t",
        "web_campaign_narrow_read")
    yes(query("SELECT has_column_privilege('aoe2war_web_prod',"
        "'public.user_appearance_preferences','theme_key','SELECT')")=="t",
        "web_preference_narrow_read")
    yes(query("SELECT has_table_privilege('aoe2war_web_prod',"
        "'public.site_theme_campaign','SELECT')")=="f",
        "web_not_broad_table_read")
    yes(query("SELECT has_column_privilege('aoe2war_appearance_writer',"
        "'public.user_activity_events','created_at','INSERT')")=="t",
        "WE3_explicit_activity_timestamp_INSERT_granted")
    yes(query("SELECT has_column_privilege('aoe2war_appearance_writer',"
        "'public.user_theme_campaign_overrides','created_at','INSERT')")=="t",
        "WE3_explicit_override_timestamp_INSERT_granted")
    yes(query("SELECT has_table_privilege('aoe2war_appearance_writer',"
        "'public.user_activity_events','SELECT')")=="f",
        "writer_activity_SELECT_unneeded_denied")
    yes(query("SELECT has_column_privilege('aoe2war_web_prod',"
        "'public.user_theme_campaign_overrides','id','SELECT')")=="f",
        "web_unneeded_override_id_denied")
    yes(query("SELECT has_column_privilege('aoe2war_web_prod',"
        "'public.site_theme_campaign','created_at','SELECT')")=="f",
        "web_unneeded_campaign_created_at_denied")
    yes(query("SELECT has_database_privilege('aoe2war_appearance_writer',"
        "current_database(),'CREATE')")=="f",
        "writer_DB_CREATE_denied")
    yes(query("SELECT has_schema_privilege('aoe2war_appearance_writer',"
        "'public','CREATE')")=="f","writer_schema_CREATE_denied")
def run():
    preflight()
    reseed_fixture()
    original=fingerprint()
    stage_hash=file_sql("config/appearance-c03-v1-apply.sql")
    stage=fingerprint()
    yes(stage!=original,"new_stage_ACL_differs_from_preimage")
    test_grants()
    # TEST-ONLY activation: a real production password/LOGIN requires
    # completely separate owner and B approval; no HBA or HEL1 changes.
    query("ALTER ROLE aoe2war_appearance_writer LOGIN PASSWORD '"+
      SYNTHETIC_PASSWORD+"'")
    test_env=dict(os.environ,
      NODE_ENV="test",WE3_EMBER_SOURCE_DIR=str(WE3),
      WE1_SYNTHETIC_WRITER_DB_URL=
         "postgresql://aoe2war_appearance_writer:"+
         SYNTHETIC_PASSWORD+"@127.0.0.1:55491/aoe2hd_db")
    result=None
    try:
        p=cmd(["/usr/local/bin/node",
             str(WE1/"tests/appearance_c03_we3_real_core_pg.mjs")],
             check=False,timeout=35,env=test_env)
        if p.returncode:
            raise AssertionError("WE3_CORE_TEST_HOLD "+p.stderr[-350:])
        result=json.loads(p.stdout)
        yes(result.get("verdict")==
           "PASS_ACTUAL_WE3_CORE_ISOLATED_PG14_NOT_PRODUCTION",
           "actual_WE3_core_pass")
        yes(result.get("testCount",0)>=46,"actual_WE3_46_or_more_checks")
    finally:
        # Never leave the synthetic isolated writer login enabled.
        query("ALTER ROLE aoe2war_appearance_writer NOLOGIN PASSWORD NULL")
        inverse_hash=file_sql("config/appearance-c03-v1-inverse.sql")
    after=fingerprint()
    yes(after==original==EXPECTED_BASELINE,"exact_raw_ACL_inverse_SHA256")
    yes(query("SELECT count(*) FROM pg_roles WHERE "
      "rolname='aoe2war_appearance_writer'")=="0","writer_role_absent")
    yes(query("SELECT count(*) FROM public.user_theme_campaign_overrides "
      "WHERE campaign_key='october-black-2026'")=="1",
      "historic_October_record_preserved_after_inverse")
    return {
      "verdict":"PASS_WE3_ACTUAL_CORE_REVISED_SQL_ISOLATED_NOT_PRODUCTION",
      "observedUTC":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "sourceWE3Head":WE3_HEAD,"sourceWE3CoreBlob":WE3_CORE_BLOB,
      "webNoBroadReaderInheritance":True,
      "postgres":"UID650 isolated PostgreSQL14.18 localhost 55491 SCRAM",
      "runnerChecks":len(CASES),"runnerCases":CASES,
      "realWE3CoreChecks":result["testCount"],
      "realWE3CoreResults":result,
      "applySqlSha256":stage_hash,"inverseSqlSha256":inverse_hash,
      "beforeAclSha256":original,"stagedAclSha256":stage,
      "inverseAclSha256":after,"productionSqlChanges":False,
      "financialPermissionsChanged":False,"ownerInstallPermit":False,
      "separateBSecurityAcceptance":False}
if __name__=="__main__":
    try:print(json.dumps(run(),sort_keys=True,separators=(",",":")))
    except Exception as e:
        print(json.dumps({"verdict":"HOLD_WE3_SQL_ADMISSION_TEST",
          "error":str(e)[:350],"passedRunnerChecks":len(CASES),
          "productionSqlChanges":False},sort_keys=True))
        sys.exit(1)
