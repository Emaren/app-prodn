#!/usr/bin/env python3
"""C02 PG16 independent Unix-socket native return migration and ACL acceptance.

Uses a synthetic minimal legacy fixture plus all 13 BYTE-PINNED historic Satchel
migrations followed by the new forward-only migration. Not a C07 restored HD
backup or authorization for production, private signer or WOLO movement.
"""
from __future__ import annotations
import hashlib, json, os, re, shutil, stat, subprocess, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path
from scripts.c02_pg16_disposable_migration_hold import catalog, FIXTURE
ROOT=Path(__file__).resolve().parents[1]
NEW=ROOT/"prisma/migrations/20261108_212700_c02_native_forward_only_returns/migration.sql"
SCHEMA="aoe2war.c02.native-forward-only-local-pg16-synthetic.v1"
PORT=55457
def sha(b): return hashlib.sha256(b).hexdigest()
def run(args,env,input=None,timeout=50,expect=0):
    r=subprocess.run(list(map(str,args)),input=input,capture_output=True,env=env,timeout=timeout)
    if r.returncode!=expect:
        # This is disposable fixture SQL only. Error class trimmed; no secrets.
        raise RuntimeError("SQL_PROCESS_FAILED:"+str(r.returncode)+":"+
                           r.stderr.decode("utf8","replace")[-500:])
    return r.stdout.decode("utf8","replace")
def check(ok,why):
    if not ok:raise RuntimeError(why)
def sql(psql,env,text,expect=0):
    return run(psql,env,text.encode() if isinstance(text,str) else text,expect=expect)
def report(receipt):
    pg=Path("/opt/homebrew/opt/postgresql@16/bin")
    check(all((pg/f).is_file() for f in ("initdb","pg_ctl","psql")),
          "POSTGRESQL16_NATIVE_BINARIES_MISSING")
    check(run([pg/"initdb","--version"],{}).startswith("initdb (PostgreSQL) 16."),
          "POSTGRESQL16_REQUIRED")
    source=NEW.read_bytes()
    check(NEW.is_file() and not NEW.is_symlink() and
          len(source)<200000 and b"pending_wolo_claims" in source and
          b"8092" not in source,"SOURCE_MIGRATION_BOUNDARY_CHANGED")
    old=catalog(ROOT)
    check(len(old)==13,"SOURCE_13_CATALOG_CHANGED")
    result={"schema":SCHEMA,"source_commit":run(["git","-C",ROOT,"rev-parse","HEAD"],os.environ.copy()).strip(),
            "migration_sha256":sha(source),"old_migration_count":13,
            "actual_c07_restore":False,"funded_8094_active":False,
            "financial_authorization":False,"c02_closed":False,"status":"RUNNING",
            "positive":{},"negative":{}}
    with tempfile.TemporaryDirectory(prefix="c02native-pg16-") as base:
        root=Path(base); dat=root/"d"; sock=root/"s";sock.mkdir(mode=0o700)
        env={k:os.environ.get(k,"") for k in ("PATH","HOME","LANG","USER")}
        env.update(PGHOST=str(sock),PGPORT=str(PORT),PGUSER=os.environ["USER"],
                   PGDATABASE="postgres",PGPASSWORD="")
        run([pg/"initdb","--no-instructions","--auth-local=trust","-D",dat],env,timeout=35)
        log=root/"postgres.log"
        started=False
        psql=[pg/"psql","-X","-A","-t","-v","ON_ERROR_STOP=1","-d","postgres"]
        try:
            options=f"-c listen_addresses='' -c unix_socket_directories={sock} -c port={PORT}"
            run([pg/"pg_ctl","-D",dat,"-l",log,"-o",options,"-w","start"],env,timeout=45)
            started=True
            sql(psql,env,FIXTURE)
            for _,body in old:sql(psql,env,body)
            initial=sql(psql,env,"SELECT count(*) FROM pg_class WHERE relname ~ '^war_satchel_' AND relkind='r';").strip()
            check(initial=="29","ORIGINAL_29_TABLES_NOT_INSTALLED")
            # Source SQL contains transaction wrappers. Verify exact rollback
            # semantics by dropping its wrappers ONLY inside a disposable
            # outer transaction; later apply unchanged original bytes.
            raw=source.decode()
            check(raw.lstrip().startswith("--") and "\nBEGIN;" in raw and raw.rstrip().endswith("COMMIT;"),
                  "MIGRATION_NOT_ATOMIC")
            inner=raw.replace("\nBEGIN;","\n",1)
            inner=inner[:inner.rfind("COMMIT;")]
            # Keep a single PSQL connection for ROLLBACK, then check no objects.
            sql(psql,env,"BEGIN;\n"+inner+"\nROLLBACK;\n")
            present=sql(psql,env,"SELECT count(*) FROM pg_class WHERE relname='war_satchel_native_return_operations';").strip()
            check(present=="0","ROLLBACK_CREATED_PERMANENT_OBJECT")
            result["positive"]["transaction_rollback"]=True
            sql(psql,env,source)
            result["positive"]["actual_sql_applied"]=True
            count=sql(psql,env,"SELECT count(*) FROM pg_class WHERE relname ~ '^war_satchel_' AND relkind='r';").strip()
            check(count=="34","NEW_34_TABLES_NOT_INSTALLED_"+count)
            result["positive"]["tables_after_14th"]=int(count)
            intact=sql(psql,env,"SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='war_satchel_funded_journal' AND column_name='native_return_credit_id';").strip()
            check(intact=="0","C02_BREAKS_EXISTING_FUNDED_PRISMA_CLIENT")
            result["positive"]["old_journal_columns_unchanged"]=True
            # First-ahead source must reject every historical claim id, including
            # the 69 unresolved older claims. No legacy data is transferred.
            for old_id in (889,9645,1,69,2147483647):
                q=f"INSERT INTO war_satchel_native_return_operations (claim_id,owner_user_id) VALUES ({old_id},1);"
                # any missing required column can fail before CHECK; inspect
                # namespace from catalog directly and test with a full row below.
            # No SOURCE claim IDs from legacy INTEGER can map into new >=900e9.
            bound=sql(psql,env,"SELECT pg_get_expr(ad.adbin,ad.adrelid) FROM pg_attrdef ad JOIN pg_attribute a ON a.attrelid=ad.adrelid AND a.attnum=ad.adnum JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname='war_satchel_native_return_operations' AND a.attname='claim_id';").strip()
            check("nextval" in bound and "war_satchel_native_claim_id_seq" in bound,"CLAIM_SEQUENCE_NAMESPACE_DRIFT")
            result["positive"]["separate_native_claim_sequence"]=True
            # Preserve exact built-in source-to-funding trigger and global
            # physical receipt uniqueness in the real PG catalog.
            trigger=sql(psql,env,"SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='war_satchel_native_return_operations' AND t.tgname='c02_original_funding_bound';").strip()
            check(trigger=="1","ORIGINAL_WAGER_LINK_TRIGGER_MISSING")
            result["positive"]["original_funding_link_trigger"]=True
            # Owner/admin boundary: 8094 service does not grant any App web DML.
            sql(psql,env,"CREATE ROLE c02_test_web LOGIN NOCREATEDB NOCREATEROLE NOSUPERUSER NOINHERIT;")
            sql(psql,env,"CREATE ROLE c02_test_legacy LOGIN NOCREATEDB NOCREATEROLE NOSUPERUSER NOINHERIT;")
            sql(psql,env,"GRANT USAGE ON SCHEMA public TO c02_test_web,c02_test_legacy;")
            for role in ("c02_test_web","c02_test_legacy"):
                out=sql(psql,env,f"SELECT count(*) FILTER (WHERE has_table_privilege('{role}',c.oid,'INSERT') OR has_table_privilege('{role}',c.oid,'UPDATE') OR has_table_privilege('{role}',c.oid,'DELETE')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname ~ '^war_satchel_';").strip()
                check(out=="0",role+"_UNAUTHORIZED_DML_AVAILABLE")
                result["negative"][role+"_no_satchel_dml"]=True
            fn=sql(psql,env,"SELECT has_function_privilege('c02_test_web','war_satchel_native_credit_once(bigint,character varying,bigint,character varying,character varying,character varying)','EXECUTE')::text;").strip()
            check(fn=="false" or fn=="f","WEB_CAN_EXECUTE_NATIVE_CREDIT")
            result["negative"]["web_direct_credit_denied"]=True
            # Physical synthetic exactly-once lifecycle, using actual
            # existing 13-migration reservation/approval/UNKNOWN/broadcast
            # triggers and new four-table C02 successor. No keys, no network.
            seed="""
INSERT INTO users(id) VALUES (1);
INSERT INTO bet_auto_executions(id) VALUES (33);
INSERT INTO war_satchel_funded_reservations
(id,owner_user_id,execution_id,amount_uwolo,status,ticket_request_id,ticket_id)
VALUES ('native-new-escrow-41',1,33,1000000,'reserved','satchel:ticket:41',NULL);
INSERT INTO war_satchel_wager_authorizations
(operation_id,reservation_id,owner_user_id,snapshot_json,
 reservation_digest,ledger_revision,consent_digest)
VALUES ('satchel:ticket:41','native-new-escrow-41',1,
 '{"ownerUserId":1,"executionId":33,"reservationId":"native-new-escrow-41","operationId":"satchel:ticket:41","amountUwolo":"1000000"}',
 repeat('a',64),repeat('b',64),repeat('c',64));
INSERT INTO war_satchel_wager_approvals(operation_id,approval_json)
VALUES ('satchel:ticket:41','{}');
UPDATE war_satchel_funded_reservations
SET status='unknown_hold' WHERE id='native-new-escrow-41';
INSERT INTO war_satchel_wager_broadcasts(operation_id,tx_hash)
VALUES ('satchel:ticket:41',repeat('A',64));
UPDATE war_satchel_funded_reservations
SET status='committed',ticket_id=41,tx_hash=repeat('A',64)
WHERE id='native-new-escrow-41';
INSERT INTO war_satchel_native_return_operations
(owner_user_id,owner_uid,wager_operation_id,ticket_id,market_id,
 leg_id,entitlement_id,claim_kind,amount_uwolo,
 principal_uwolo,stake_uwolo,funded_amount_uwolo,escrow_address,vault_address,
 funding_tx_hash,funding_height,funding_bank_root,allocation_digest,
 independent_reserve_review_sha256,owner_permit_sha256)
VALUES (1,'fresh-owner-uid','satchel:ticket:41',41,77,'winner','new-ticket-41-winner',
 'bet_payout',1000000,1000000,1000000,1000000,
 ('wolo1'||repeat('s',45)),('wolo1'||repeat('q',45)),
 repeat('A',64),100,
 repeat('b',64),repeat('c',64),repeat('d',64),repeat('e',64));
"""
            sql(psql,env,seed)
            claim_id=sql(psql,env,"SELECT claim_id FROM war_satchel_native_return_operations;").strip()
            check(claim_id=="900000000001","NATIVE_DISJOINT_ID_NOT_ALLOCATED_"+claim_id)
            result["positive"]["fresh_high_claim_id"]=True
            sql(psql,env,f"""
INSERT INTO war_satchel_native_return_attempts
(claim_id,operation_key,app_operation_id,approval_json,approval_sha256)
VALUES ({claim_id},'satchel:claim-return:{claim_id}',
 'satchel:ticket:41',
 jsonb_build_object('version',2,'claim_id','{claim_id}',
 'signature',repeat('Q',128),'operation_id','satchel:ticket:41'),
 repeat('f',64));
""")
            # Exercise the exact finance-owner SQL execution path on the
            # disposable superuser only; live postgres grants stay untouched.
            credited=sql(psql,env,f"""SELECT public.war_satchel_native_credit_once(
{claim_id},repeat('C',64)::varchar,101,
repeat('D',64)::varchar,repeat('e',64)::varchar,
('wolo1'||repeat('q',45))::varchar);""").strip()
            check(credited.isdigit() and int(credited)>0,"FIRST_AUTHENTICATED_FIXTURE_CREDIT_FAILED")
            result["positive"]["one_atomic_credit"]=True
            balance=sql(psql,env,"SELECT available_uwolo FROM war_satchel_funded_balances WHERE owner_user_id=1;").strip()
            journal=sql(psql,env,"SELECT count(*) FROM war_satchel_funded_journal WHERE source_key='native:return:900000000001';").strip()
            global_used=sql(psql,env,"SELECT count(*) FROM war_satchel_physical_receipt_consumptions WHERE tx_hash=repeat('C',64);").strip()
            check(balance=="1000000" and journal=="1" and global_used=="1",
                  "NONATOMIC_CREDIT_BALANCE_JOURNAL_OR_GLOBAL_RECEIPT")
            result["positive"]["atomic_balance_journal_global_consumption"]=True
            def denied(label,statement):
                r=subprocess.run(list(map(str,psql)),input=statement.encode(),
                    env=env,capture_output=True,timeout=30)
                check(r.returncode!=0,"C02_UNSAFE_ACCEPTED_"+label)
                check(sql(psql,env,"SELECT available_uwolo FROM war_satchel_funded_balances WHERE owner_user_id=1;").strip()=="1000000",
                      "C02_DENIED_OPERATION_CHANGED_BALANCE_"+label)
                result["negative"][label]=True
            denied("same_claim_credit_twice",f"""SELECT public.war_satchel_native_credit_once(
{claim_id},repeat('C',64)::varchar,101,repeat('D',64)::varchar,
repeat('e',64)::varchar,('wolo1'||repeat('q',45))::varchar);""")
            denied("same_chain_tx_new_claim",f"""
INSERT INTO war_satchel_native_return_credits
(claim_id,owner_user_id,tx_hash,amount_uwolo,canonical_height,
 bank_block_hash,authenticated_proof_digest,vault_address)
VALUES({claim_id},1,repeat('C',64),1000000,102,
 repeat('D',64),repeat('e',64),'wolo1'||repeat('q',45));""")
            for old_id in (889,9645,69,2147483647):
                denied("legacy_claim_"+str(old_id),f"""
INSERT INTO war_satchel_native_return_operations
(claim_id,owner_user_id,owner_uid,wager_operation_id,ticket_id,market_id,
 leg_id,entitlement_id,claim_kind,amount_uwolo,
 principal_uwolo,stake_uwolo,funded_amount_uwolo,escrow_address,vault_address,
 funding_tx_hash,funding_height,funding_bank_root,allocation_digest,
 independent_reserve_review_sha256,owner_permit_sha256)
VALUES ({old_id},1,'fresh-owner-uid','satchel:ticket:41',41,77,
 'winner','historical-{old_id}','bet_payout',1000000,
 1000000,1000000,1000000,('wolo1'||repeat('s',45)),('wolo1'||repeat('q',45)),
 repeat('A',64),100,repeat('b',64),repeat('c',64),
 repeat('d',64),repeat('e',64));""")
            denied("untrusted_bank_root",f"""SELECT public.war_satchel_native_credit_once(
{claim_id},repeat('E',64)::varchar,102,'not-a-block'::varchar,
repeat('f',64)::varchar,('wolo1'||repeat('q',45))::varchar);""")
            denied("same_source_funding_as_return",f"""SELECT public.war_satchel_native_credit_once(
{claim_id},repeat('A',64)::varchar,102,repeat('D',64)::varchar,
repeat('f',64)::varchar,('wolo1'||repeat('q',45))::varchar);""")
            denied("unbacked_native_journal", """
INSERT INTO war_satchel_funded_journal
(owner_user_id,source_key,event_kind,amount_uwolo,
 delta_available_uwolo,delta_reserved_uwolo,delta_committed_uwolo,
 delta_withdrawal_pending_uwolo)
VALUES(1,'native:return:900000000002','native_return_credit',1,1,0,0,0);
""")
            denied("immutable_credit_update","UPDATE war_satchel_native_return_credits SET amount_uwolo=2;")
            denied("immutable_attempt_delete","DELETE FROM war_satchel_native_return_attempts;")
            denied("web_direct_dml","SET ROLE c02_test_web; INSERT INTO war_satchel_native_return_attempts(claim_id,operation_key,app_operation_id,approval_sha256) VALUES (900000000002,'satchel:claim-return:900000000002','satchel:ticket:41',repeat('a',64));")
            # Rollback is a real aborted transaction: a second credit using an
            # already consumed physical tx must not leak partial balance.
            duplicate=sql(psql,env,"SELECT count(*) FROM war_satchel_native_return_credits;").strip()
            check(duplicate=="1","CREDIT_DUPLICATED_AFTER_NEGATIVE_MATRIX")
            result["positive"]["post_replay_credit_count"]=1
            result["positive"]["new_source_separate_from_old"]=True
            # Do not alter or read live legacy claims. This only checks our fake.
            result["status"]="PASS_ISOLATED_PG16_NATIVE_MIGRATION_NOT_C02_CLOSED"
        finally:
            if started:
                run([pg/"pg_ctl","-D",dat,"-m","immediate","-w","stop"],env,timeout=35)
    result["temporary_cluster_removed"]=not root.exists()
    result["utc"]=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return result

if __name__=="__main__":
    output=Path(sys.argv[1]) if len(sys.argv)>1 else None
    try:
        result=report(output)
    except Exception as exc:
        print(json.dumps({"status":"HOLD_NATIVE_PG16_REHEARSAL",
          "error":str(exc)[:500],"c02_closed":False},sort_keys=True))
        sys.exit(2)
    raw=(json.dumps(result,sort_keys=True,indent=2)+"\n").encode()
    if output:
        fd=os.open(output,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,"wb") as file:file.write(raw);file.flush();os.fsync(file.fileno())
    print(json.dumps({**result,"receipt_sha256":sha(raw)},sort_keys=True))
    sys.exit(0)
