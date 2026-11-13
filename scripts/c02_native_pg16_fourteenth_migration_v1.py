#!/usr/bin/env python3
"""C02 14th-migration PG16 contract in a private, throwaway Unix-socket cluster.

Uses the exact original 13 pinned migrations and byte-pinned fourteenth source.
Never connects to HD/DE or listens on TCP. Synthetic sandbox attempt rows are
NOT real funded operations, and they cannot credit a customer or authorize POST.
"""
from __future__ import annotations
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"scripts/c02_pg16_disposable_migration_hold.py"
NATIVE=ROOT/"prisma/migrations/20261108_212700_c02_native_forward_only_returns/migration.sql"
NATIVE_SHA="005b6143b69db15586a0562a97f419ad4a35a758cdec3909ff9f46a1b07dc2c3"
JOURNAL=ROOT/"lib/warSatchelNativeReturnJournal.ts"
JOURNAL_SHA="8d340144ce6df399c17aa6f03393dea0d76255901a6d83ee9873d5555a276f0e"
PORT="55441"
SCHEMA="aoe2war.app.c02.pg16-fourteenth-exact-native-original-operation.v1"


class Hold(RuntimeError):
    pass


def need(ok,reason):
    if not ok:
        raise Hold("HOLD_"+reason)


def checked(args,env=None,sql=None,timeout=95):
    try:
        p=subprocess.run(args,input=sql,capture_output=True,timeout=timeout,
                         env=env,text=isinstance(sql,str))
    except (subprocess.TimeoutExpired,OSError):
        raise Hold("DISPOSABLE_PG_PROCESS_FAILED_CLOSED")
    return p


def run(repo=ROOT,pg_bin=Path("/opt/homebrew/opt/postgresql@16/bin")):
    need(os.geteuid()!=0,"REFUSE_ROOT_FOR_LOCAL_PG_CLUSTER")
    need(repo.resolve()==ROOT.resolve(),"NONCANONICAL_SOURCE_WORKTREE")
    source=NATIVE.read_bytes()
    need(hashlib.sha256(source).hexdigest()==NATIVE_SHA,"NATIVE_MIGRATION_BYTES_CHANGED")
    need(hashlib.sha256(JOURNAL.read_bytes()).hexdigest()==JOURNAL_SHA,"JOURNAL_SOURCE_BYTES_CHANGED")
    need(all((pg_bin/x).is_file() for x in ("postgres","initdb","pg_ctl","psql")),
         "PG16_BINARY_DIRECTORY_REQUIRED")
    version=checked([str(pg_bin/"postgres"),"--version"])
    need(version.returncode==0 and b"PostgreSQL) 16." in version.stdout,
         "NOT_POSTGRESQL_16")
    spec=importlib.util.spec_from_file_location("c02_exact_pinned_13",BASE)
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    originals=m.catalog(ROOT)
    need(len(originals)==13,"FIRST_THIRTEEN_MIGRATIONS_NOT_PINNED")
    content=source.decode("utf-8")
    start=content.index("CREATE TABLE war_satchel_native_return_attempts (")
    end=content.index("\n);",start)+3
    block=content[start:end]
    need("operation_key varchar(128) NOT NULL UNIQUE" in block and
         "claim_id bigint PRIMARY KEY" in block and
         "approval_sha256" in block,"NATIVE_ATTEMPT_DDL_DRIFT")
    report={
      "schema":SCHEMA,
      "status":"HOLD_INCOMPLETE_PG16_REHEARSAL",
      "source_sha256":NATIVE_SHA,
      "journal_source_sha256":JOURNAL_SHA,
      "original_catalog_sha256":m.CATALOG_SHA256,
      "migration_count":14,"pg_major":16,
      "synthetic_only":True,"live_database_accessed":False,
      "tcp_listener_created":False,"wallet_or_credit_authorized":False,
      "C02_APP_TRANSPORT":"HOLD","C03_APP_HANDOFF":"HOLD",
      "observations":{}
    }
    tmp=Path(tempfile.mkdtemp(prefix="c02-14th-native-pg16-"))
    tmp.chmod(0o700)
    # Private temp cluster is deleted even when any source/SQL assertion fails.
    try:
      data=tmp/"db";sock=tmp/"sock";sock.mkdir(mode=0o700)
      env=os.environ.copy()
      for x in list(env):
        if x.startswith("PG") and x not in ("PG_COLOR",):
          env.pop(x,None)
      env.update(PGHOST=str(sock),PGPORT=PORT,PGDATABASE="postgres",
                 PGUSER=os.environ.get("USER",""))
      init=checked([str(pg_bin/"initdb"),"-D",str(data),"--no-instructions",
                    "--auth-local=trust","--auth-host=reject"],env)
      need(init.returncode==0,"INITDB_FAILED")
      opt=f"-c listen_addresses='' -c unix_socket_directories={sock} -c port={PORT}"
      startp=checked([str(pg_bin/"pg_ctl"),"-D",str(data),"-l",str(tmp/"postgres.log"),
                      "-o",opt,"-w","start"],env)
      need(startp.returncode==0,"ISOLATED_PG16_START_FAILED")
      def sql(statement,success=True):
        p=checked([str(pg_bin/"psql"),"-X","-v","ON_ERROR_STOP=1","-A","-t","-q"],
                  env,statement,timeout=80)
        if success:
          need(p.returncode==0,"DISPOSABLE_SQL_REFUSED")
        else:
          need(p.returncode!=0,"NEGATIVE_SQL_UNEXPECTEDLY_SUCCEEDED")
        return p
      try:
        sql(m.FIXTURE.decode())
        for n,raw in originals:
          sql(raw.decode())
        sql(source.decode())
        census=sql("""
SELECT 'native_tables='||count(*) FROM pg_tables
 WHERE schemaname='public' AND tablename LIKE 'war_satchel_native_return_%';
SELECT 'native_credits='||count(*) FROM public.war_satchel_native_return_credits;
SELECT 'native_attempts='||count(*) FROM public.war_satchel_native_return_attempts;
""").stdout.strip().splitlines()
        report["observations"]["installed_census"]=census
        need(census==["native_tables=5","native_credits=0","native_attempts=0"],
             "FOURTEENTH_MIGRATION_SCHEMA_CENSUS_DRIFT")
        negatives={}
        # Historical claim numbers and nonexistent funding are never granted
        # a native identity. Real trigger should reject even a fresh ID when
        # funded source / historical transfer evidence is missing.
        for name,claim in (("HISTORICAL_889",889),("HISTORICAL_9645",9645),
                           ("UNFUNDED_NEW_NAMESPACE",900000000001)):
          statement=f"""
INSERT INTO public.war_satchel_native_return_operations
 (claim_id,owner_user_id,owner_uid,wager_operation_id,ticket_id,
 market_id,leg_id,entitlement_id,claim_kind,amount_uwolo,principal_uwolo,
 stake_uwolo,funded_amount_uwolo,escrow_address,vault_address,funding_tx_hash,
 funding_height,funding_bank_root,allocation_digest,
 independent_reserve_review_sha256,owner_permit_sha256)
 VALUES ({claim},1,'synthetic-owner','unfunded-op',1,11,'winner','leg:1',
 'bet_payout',100,100,100,100,'wolo1'||repeat('a',38),
 'wolo1'||repeat('b',38),repeat('A',64),1,repeat('a',64),repeat('b',64),
 repeat('c',64),repeat('d',64));
"""
          p=sql(statement,success=False)
          negative_note=p.stderr[-320:]
          need("C02_AUTHENTICATED_FRESH_WAGER_FUNDING_REQUIRED" in negative_note or
               "war_satchel_native_return_operations_claim_id_check" in negative_note,
               "HISTORICAL_OR_UNFUNDED_DENIAL_NOT_SPECIFIC")
          negatives[name]=True
        report["observations"].update(negatives)
        # Separate c02_sandbox schema: byte-exact attempt DDL with only its FK
        # pointed to a plainly SYNTHETIC original row. No actual funded wager,
        # Satchel approval signature or credit is manufactured.
        clone=block.replace(
            "CREATE TABLE war_satchel_native_return_attempts (",
            "CREATE TABLE c02_sandbox.war_satchel_native_return_attempts ("
        ).replace(
            "REFERENCES war_satchel_native_return_operations(claim_id)",
            "REFERENCES c02_sandbox.war_satchel_native_return_operations(claim_id)"
        )
        need(clone!=block and clone.count("c02_sandbox.")==2,
             "BYTE_EXACT_ATTEMPT_DDL_ISOLATION_FAILED")
        sql("""
CREATE SCHEMA c02_sandbox;
CREATE TABLE c02_sandbox.war_satchel_native_return_operations(
  claim_id bigint PRIMARY KEY CHECK(claim_id BETWEEN 900000000001 AND 999999999999)
);
INSERT INTO c02_sandbox.war_satchel_native_return_operations
 VALUES(900000000001);
""" + clone + """
CREATE TRIGGER c02_immutable_rows BEFORE UPDATE OR DELETE ON
 c02_sandbox.war_satchel_native_return_attempts FOR EACH ROW
 EXECUTE FUNCTION public.war_satchel_funded_audit_immutable();
CREATE ROLE c02_app_writer NOLOGIN;
GRANT USAGE ON SCHEMA c02_sandbox TO c02_app_writer;
GRANT SELECT ON c02_sandbox.war_satchel_native_return_operations TO c02_app_writer;
GRANT SELECT,INSERT ON c02_sandbox.war_satchel_native_return_attempts TO c02_app_writer;
""")
        approval={
          "version":2,"claim_id":"900000000001",
          "operation_id":"satchel:original:synthetic-only",
          "allocation":{"sandbox":True},
          "signature":"synthetic-no-private-key",
          "padding":"only-a-database-unit-test-"*10,
        }
        blob=json.dumps(approval,separators=(",",":"),sort_keys=True)
        digest=hashlib.sha256(blob.encode()).hexdigest()
        need(200<len(blob)<65536,"SYNTHETIC_APPROVAL_FIXTURE_SIZE")
        quoted=blob.replace("'","''")
        def attempt(digest_value):
          return f"""INSERT INTO c02_sandbox.war_satchel_native_return_attempts
 (claim_id,operation_key,app_operation_id,approval_json,approval_sha256)
 VALUES(900000000001,'satchel:claim-return:900000000001',
 'satchel:original:synthetic-only','{quoted}'::jsonb,'{digest_value}')
 ON CONFLICT DO NOTHING RETURNING claim_id;"""
        first=sql("SET ROLE c02_app_writer;\n"+attempt(digest)+"\nRESET ROLE;")
        need("900000000001" in first.stdout,"ORIGINAL_OPERATION_NOT_DURABLY_INSERTED")
        duplicate=sql("SET ROLE c02_app_writer;\n"+attempt(digest)+"\nRESET ROLE;")
        need("900000000001" not in duplicate.stdout,"DUPLICATE_POST_FENCE_FAILED")
        conflict=sql("SET ROLE c02_app_writer;\n"+attempt("f"*64)+"\nRESET ROLE;")
        need("900000000001" not in conflict.stdout,"CONFLICT_CREATE_SECOND_OPERATION")
        saved=sql("""
SELECT approval_sha256 FROM c02_sandbox.war_satchel_native_return_attempts
 WHERE claim_id=900000000001;
""").stdout.strip()
        need(saved==digest,"DIFFERENT_APPROVAL_OVERWROTE_ORIGINAL")
        # Real DAO uses FOR SHARE. Determine whether the finance worker needs
        # a narrower row-lock grant; do not grant UPDATE to get a green test.
        lockp=sql("""
BEGIN;
SET LOCAL ROLE c02_app_writer;
SELECT claim_id,operation_key FROM c02_sandbox.war_satchel_native_return_attempts
 WHERE claim_id=900000000001 FOR SHARE;
ROLLBACK;
""",success=False)
        lock_denied=("permission denied" in lockp.stderr)
        report["observations"]["finance_role_for_share_denied"]=lock_denied
        # Triggers and role restrictions make stored attempts append-only.
        p=sql("""
SET ROLE c02_app_writer;
UPDATE c02_sandbox.war_satchel_native_return_attempts
 SET approval_sha256=repeat('f',64) WHERE claim_id=900000000001;
""",success=False)
        need("permission denied" in p.stderr,"APP_ROLE_UPDATE_DENIAL_FAILED")
        p=sql("""
SET ROLE c02_app_writer;
DELETE FROM c02_sandbox.war_satchel_native_return_attempts
 WHERE claim_id=900000000001;
""",success=False)
        need("permission denied" in p.stderr,"APP_ROLE_DELETE_DENIAL_FAILED")
        p=sql("""
UPDATE c02_sandbox.war_satchel_native_return_attempts
 SET approval_sha256=repeat('f',64) WHERE claim_id=900000000001;
""",success=False)
        need("IMMUTABLE" in p.stderr.upper() or "immutable" in p.stderr,
             "OWNER_BYPASS_APPEND_ONLY_TRIGGER")
        after=sql("""
SELECT count(*) FROM public.war_satchel_native_return_attempts;
SELECT count(*) FROM public.war_satchel_native_return_credits;
SELECT count(*) FROM c02_sandbox.war_satchel_native_return_attempts;
""").stdout.strip().splitlines()
        need(after==["0","0","1"],"REAL_NATIVE_TABLES_NOT_ZERO_OR_SANDBOX_NOT_UNIQUE")
        report["observations"].update(
          synthetic_exact_attempt_insert_once=True,
          replay_same_identity_zero_new_insert=True,
          replay_conflicting_identity_zero_new_insert=True,
          expected_digest_stable=True,
          restricted_worker_update_denied=True,
          restricted_worker_delete_denied=True,
          immutable_owner_mutation_denied=True,
          no_real_native_attempts_or_credits=True,
          after_counts=after)
        report["status"]="PASS_ISOLATED_PG16_EXACT_14TH_MIGRATION_AND_ORIGINAL_OPERATION_ONCE_NONFUNDED"
      finally:
        stopped=checked([str(pg_bin/"pg_ctl"),"-D",str(data),"-m","immediate",
                         "-w","stop"],env,timeout=35)
        need(stopped.returncode==0,"ISOLATED_PG16_STOP_NOT_CONFIRMED")
    finally:
      import shutil
      shutil.rmtree(tmp)
    report["temporary_cluster_removed"]=not tmp.exists()
    need(report["temporary_cluster_removed"],"SCRATCH_DATA_REMAINS")
    report["utc"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
    return report


def main(argv):
    if len(argv)!=2 or argv[0]!="--receipt":
        print("HOLD_EXPECT_ONE_PRIVATE_RECEIPT_PATH")
        return 3
    p=Path(argv[1]).expanduser()
    if not (p.is_absolute() and p.parent.is_dir() and
            stat.S_IMODE(p.parent.stat().st_mode)==0o700 and
            not p.exists() and not p.is_symlink()):
        print(json.dumps({"schema":SCHEMA,"status":"HOLD_PRIVATE_RECEIPT_PATH",
                          "wallet_or_credit_authorized":False}))
        return 3
    try:
        result=run()
    except Exception as e:
        result={"schema":SCHEMA,"status":"HOLD_PG16_CONTRACT_FAILED",
                "error_class":type(e).__name__,
                "reason":str(e)[:150] if type(e)==Hold else "INTERNAL_FAILURE",
                "wallet_or_credit_authorized":False,
                "C02_APP_TRANSPORT":"HOLD"}
    raw=(json.dumps(result,sort_keys=True,indent=2)+"\n").encode()
    fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:
        f.write(raw);f.flush();os.fsync(f.fileno())
    print("RECEIPT_SHA256",hashlib.sha256(raw).hexdigest())
    print(json.dumps(result,sort_keys=True))
    return 0 if result["status"].startswith("PASS_") else 3


if __name__=="__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as e:
        print("HOLD_DISPOSABLE_C02",type(e).__name__,str(e)[:120])
        sys.exit(3)
