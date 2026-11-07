#!/usr/bin/env python3
"""C02 synthetic ONLY: replay exact 13 Satchel SQL files on disposable PostgreSQL 16.

Use ONLY an installed, locally pinned native PG16 bin directory and an isolated,
private Unix socket. No environment-supplied PG target, live database URL,
financial permission, wallet or production service is consulted. This tool
does NOT perform actual C06/C07 restore acceptance. It always exits HOLD (3),
even when the complete source-bound native rehearsal passes.

The SQL fixture is deliberately false customer data. Its PostgreSQL object
inventory is compared with the checked-in, source-bound result of replaying
the ACTUAL thirteen migration bodies: 29 tables, 76 indexes, 8 sequences.
"""
from __future__ import annotations

import argparse
from datetime import datetime,timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

try:
    from scripts import c02_pg16_disposable_migration_hold as native
    from scripts import c02_satchel_postmigration_owner_hold as gate
except ModuleNotFoundError:
    import c02_pg16_disposable_migration_hold as native
    import c02_satchel_postmigration_owner_hold as gate

ROOT=Path(__file__).resolve().parents[1]
PORT="65494"
TARGET_OWNER="aoe2war_finance_owner"
SCHEMA="aoe2war.session-b.c02.actual-sql-disposable-pg16-privilege-replay.v1"

SETUP=b"""
CREATE ROLE aoe2hd_user LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE aoe2de_user LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE aoe2war_web_prod LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE aoe2war_finance_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
DO $block$ DECLARE item record; BEGIN
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n
 ON c.relnamespace=n.oid WHERE n.nspname='public'
 AND c.relname ~ '^war_satchel_' AND c.relkind IN ('r','p')
 LOOP EXECUTE format('ALTER TABLE public.%I OWNER TO aoe2war_finance_owner',item.relname);
 END LOOP; END $block$;
DO $block$ DECLARE item record; BEGIN
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n
 ON c.relnamespace=n.oid WHERE n.nspname='public'
 AND c.relname ~ '^war_satchel_' AND c.relkind='S'
 LOOP EXECUTE format('ALTER SEQUENCE public.%I OWNER TO aoe2war_finance_owner',item.relname);
 END LOOP; END $block$;
"""

class Hold(Exception):
    pass


def require(condition,reason):
    if not condition:
        raise Hold(reason)


def command(stage,argv,env,input_data=None):
    try:
        result=subprocess.run([str(a) for a in argv],env=env,
                              input=input_data,capture_output=True,timeout=45,
                              check=False)
    except (OSError,subprocess.TimeoutExpired) as exc:
        raise Hold("C02_SYNTHETIC_"+stage+"_NOT_EXECUTABLE") from exc
    require(result.returncode==0,"C02_SYNTHETIC_"+stage+"_FAILED")
    return result.stdout


def only_synthetic_environment(sock):
    # Do not inherit PGHOST, PGPORT, DATABASE_URL, PGPASSFILE, etc.
    allowed=("HOME","PATH","USER","LANG")
    env={k:os.environ[k] for k in allowed if k in os.environ}
    env.update(PGHOST=str(sock),PGPORT=PORT,PGDATABASE="postgres",
               PGUSER=os.environ.get("USER",""),PGPASSWORD="")
    require(env["PGUSER"] and len(env["PGUSER"])<64,
            "C02_SYNTHETIC_LOCAL_USER_MISSING")
    return env


def evaluate_result(catalog,tables,owner=TARGET_OWNER):
    return gate.evaluate(catalog,tables,owner)


def replay(root,pg_bin):
    require(os.geteuid()!=0,"C02_REFUSE_ROOT_PG16")
    require(root.resolve()==ROOT.resolve(),
            "C02_REPOSITORY_SOURCE_NOT_EXACT")
    require(pg_bin.is_absolute() and pg_bin.is_dir() and not pg_bin.is_symlink(),
            "C02_NATIVE_PG16_BIN_PATH_INVALID")
    names=gate.source_inventory(root)
    relations=gate.source_relation_inventory(root,names)
    canonical=native.catalog(root)
    require(len(canonical)==13 and len(relations)==113,
            "C02_CANONICAL_SOURCE_INCOMPLETE")
    required=("initdb","pg_ctl","psql")
    require(all((pg_bin/x).is_file() for x in required),
            "C02_NATIVE_PG16_BIN_MISSING")
    version=subprocess.run([str(pg_bin/"initdb"),"--version"],
                           capture_output=True,timeout=10,check=False)
    require(version.returncode==0 and
            version.stdout.startswith(b"initdb (PostgreSQL) 16."),
            "C02_NATIVE_POSTGRESQL16_REQUIRED")

    output={
        "schema":SCHEMA,"status":"HOLD",
        "synthetic_only":True,
        "actual_c07_restored_database_used":False,
        "c02_gate_closed":False,
        "c09_funded_release_authorized":False,
        "source_migration_count":len(canonical),
        "manifest_object_count":len(relations),
        "observed":{},
    }
    with tempfile.TemporaryDirectory(prefix="b2pg-") as folder:
        temp=Path(folder)
        sock=temp/"s"
        sock.mkdir(mode=0o700)
        data=temp/"d"
        log=temp/"log"
        require(len(str(sock/(".s.PGSQL."+PORT)))<96,
                "C02_PRIVATE_UNIX_SOCKET_PATH_UNSAFE")
        env=only_synthetic_environment(sock)
        started=False
        def psql(data_bytes):
            return command("READONLY_CATALOG",[pg_bin/"psql","-X","-v",
                           "ON_ERROR_STOP=1","-q","-A","-t"],env,data_bytes)
        def catalogue():
            raw=psql(gate.SELECT_CATALOG.encode("utf-8"))
            candidates=[row for row in raw.decode("utf-8").splitlines()
                        if row.strip().startswith("{")]
            require(len(candidates)==1,"C02_PG16_CATALOG_MULTIPLE_OR_MISSING")
            return json.loads(candidates[0],object_pairs_hook=gate.reject_json_duplicate_keys)

        try:
            command("INITDB",[pg_bin/"initdb","-D",data,"--no-instructions",
                               "--auth-local=trust","--auth-host=reject"],env)
            options=(f"-c listen_addresses='' "
                     f"-c unix_socket_directories={sock} -c port={PORT}")
            command("START",[pg_bin/"pg_ctl","-D",data,"-l",log,"-o",
                             options,"-w","start"],env)
            started=True
            psql(native.FIXTURE)
            for number,(_,sql) in enumerate(canonical,1):
                command("MIGRATION_"+str(number),
                        [pg_bin/"psql","-X","-v","ON_ERROR_STOP=1","-q","-1"],
                        env,sql)
            psql(SETUP)
            passed=evaluate_result(catalogue(),names)
            require((passed["table_count"],passed["index_count"],
                     passed["sequence_count"])==(29,76,8),
                    "C02_REAL_DDL_RELATION_CENSUS_DRIFT")
            output["observed"]={
                "tables":passed["table_count"],"indexes":passed["index_count"],
                "attached_sequences":passed["sequence_count"],
            }
            failures=(
                ("LEGACY_TABLE_INSERT",
                 'GRANT INSERT ON TABLE public.war_satchel_funded_balances TO aoe2hd_user;',
                 'REVOKE INSERT ON TABLE public.war_satchel_funded_balances FROM aoe2hd_user;'),
                ("LEGACY_SCHEMA_CREATE",
                 'GRANT CREATE ON SCHEMA public TO aoe2de_user;',
                 'REVOKE CREATE ON SCHEMA public FROM aoe2de_user;'),
            )
            for label,grant,undo in failures:
                psql(grant.encode("ascii"))
                try:evaluate_result(catalogue(),names)
                except gate.Hold: output["observed"][label+"_stopped"]=True
                else:raise Hold("C02_"+label+"_NOT_DETECTED")
                psql(undo.encode("ascii"))
                evaluate_result(catalogue(),names)
            seq=next((name for name,(kind,_) in relations.items()
                      if kind=="sequence"),None)
            require(seq is not None,"C02_NAMED_ATTACHED_SEQUENCE_MISSING")
            psql(f'GRANT USAGE ON SEQUENCE public."{seq}" TO aoe2hd_user;'.encode())
            try:evaluate_result(catalogue(),names)
            except gate.Hold:output["observed"]["LEGACY_SEQUENCE_USAGE_stopped"]=True
            else:raise Hold("C02_LEGACY_SEQUENCE_USAGE_NOT_DETECTED")
            psql(f'REVOKE USAGE ON SEQUENCE public."{seq}" FROM aoe2hd_user;'.encode())
            evaluate_result(catalogue(),names)
            candidate=next((name for name,(kind,_) in relations.items()
                            if kind=="index" and name.startswith("ix_satchel_")),None)
            require(candidate is not None,"C02_UNCONSTRAINED_TEST_INDEX_MISSING")
            psql(f'DROP INDEX public."{candidate}";'.encode())
            try:evaluate_result(catalogue(),names)
            except gate.Hold:output["observed"]["REMOVED_INDEX_stopped"]=True
            else:raise Hold("C02_REMOVED_NATIVE_INDEX_NOT_DETECTED")
            output["status"]="PASS_SYNTHETIC_REAL_13_MIGRATIONS_NOT_C02_ACCEPTANCE"
        finally:
            if started:
                stopped=subprocess.run(
                    [str(pg_bin/"pg_ctl"),"-D",str(data),"-m","immediate","-w","stop"],
                    env=env,capture_output=True,timeout=25,check=False)
                require(stopped.returncode==0,"C02_SYNTHETIC_SERVER_STOP_FAILED")
    output["temporary_database_removed"]=not temp.exists()
    require(output["temporary_database_removed"],
            "C02_SYNTHETIC_TEMP_DB_NOT_REMOVED")
    return output


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin",type=Path)
    parser.add_argument("--execute",action="store_true")
    parser.add_argument("--receipt",type=Path)
    args=parser.parse_args(argv)
    report={"schema":SCHEMA,"status":"HOLD_NO_SYNTHETIC_PG16_EXECUTION",
            "c02_gate_closed":False,"c09_funded_release_authorized":False}
    try:
        if args.execute:
            require(args.pg_bin is not None and args.receipt is not None,
                    "C02_NATIVE_PG16_BIN_AND_RECEIPT_REQUIRED")
            report=replay(ROOT,args.pg_bin)
            report["utc"]=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            report["source_sha256"]=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
            report["real_migration_catalog_sha256"]=native.CATALOG_SHA256
            report["manifest_sha256"]=hashlib.sha256(
                (ROOT/gate.RELATIONS_FILE).read_bytes()).hexdigest()
            report["receipt_sha256"]=native.restricted_receipt(args.receipt,report)
    except (Hold,gate.Hold,native.Hold,OSError,ValueError,
            subprocess.TimeoutExpired) as exc:
        report={"schema":SCHEMA,"status":"STOP_C02_NATIVE_REHEARSAL",
                "reason_class":type(exc).__name__,
                "c02_gate_closed":False,"c09_funded_release_authorized":False}
        print(json.dumps(report,sort_keys=True))
        return 2
    print(json.dumps(report,sort_keys=True))
    return 3


if __name__=="__main__":
    sys.exit(main())
