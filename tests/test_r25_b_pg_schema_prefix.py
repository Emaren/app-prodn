#!/usr/bin/env python3
"""R25 B isolated PostgreSQL 16: adversarial PUBLIC privilege checks.

Only disposable initdb-owned Unix socket clusters; NEVER use DATABASE_URL.
No network listener, no production host, no existing PostgreSQL roles.
"""
import getpass
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
BIN = Path(os.environ.get("AOE2WAR_TEST_PG_BIN", "/usr/lib/postgresql/16/bin"))
DB = "r25_b_isolated_acl"
ROLE = "aoe2war_r25_web_ro"

def load(path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

installer = load("scripts/r25_b_additive_3031_setup.py", "r25_b_installer")
witness = load("scripts/r25_b_host_witness.py", "r25_b_witness")

@unittest.skipUnless(os.environ.get("RUN_R25_B_ISOLATED_PG") == "1",
                     "only in isolated PostgreSQL CI job")
class TestLiteralSchemaACLs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.geteuid() == 0:
            raise RuntimeError("HOLD:PG_ISOLATED_TEST_MUST_RUN_NONROOT")
        if not (BIN / "initdb").is_file() or not (BIN / "pg_ctl").is_file():
            raise RuntimeError("HOLD:POSTGRES_16_TEST_BIN_MISSING")
        cls.temp = tempfile.TemporaryDirectory(prefix="r25-b-pg-")
        base = Path(cls.temp.name)
        cls.datadir = base / "data"
        cls.sockdir = base / "sock"
        cls.sockdir.mkdir(mode=0o700)
        cls.env = {k:v for k,v in os.environ.items() if not k.startswith("PG")}
        cls.env.update(PGHOST=str(cls.sockdir), PGPORT="5432", PGUSER=getpass.getuser(),
                       PGDATABASE="postgres", PGCONNECT_TIMEOUT="3")
        # Deliberately NO TCP listener. A random owner-private Unix socket only.
        subprocess.run([str(BIN/"initdb"), "-D",str(cls.datadir),
                        "--auth-local=trust","--auth-host=reject","--no-instructions"],
                       env=cls.env,stdout=subprocess.DEVNULL,check=True,timeout=30)
        subprocess.run([str(BIN/"pg_ctl"),"-D",str(cls.datadir),"-w","start","-o",
                        "-c listen_addresses='' -c unix_socket_directories="+str(cls.sockdir)],
                       env=cls.env,stdout=subprocess.DEVNULL,check=True,timeout=30)

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls,"datadir") and cls.datadir.exists():
            subprocess.run([str(BIN/"pg_ctl"),"-D",str(cls.datadir),"-m","immediate",
                            "-w","stop"],env=cls.env,stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL,timeout=20,check=False)
        if hasattr(cls,"temp"):
            cls.temp.cleanup()

    @classmethod
    def sql(cls, query, *, database="postgres", user=None, okay=True):
        args=[str(BIN/"psql"),"-X","-A","-t","-w","-v","ON_ERROR_STOP=1",
              "-d",database]
        if user:args.extend(["-U",user])
        proc=subprocess.run(args,env=cls.env,input=query.encode(),
                            stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                            timeout=20,check=False)
        if okay and proc.returncode:
            raise AssertionError("ISOLATED_PG_ERROR:"+
                                 proc.stderr.decode(errors="replace")[-600:])
        return proc

    def prepare(self):
        self.sql("DROP DATABASE IF EXISTS "+DB+" WITH (FORCE);")
        self.sql("DROP ROLE IF EXISTS "+ROLE+";")
        self.sql("CREATE DATABASE "+DB+";")
        setup = ["CREATE SCHEMA pgx;", "CREATE SCHEMA pgfinance;",
                 "CREATE SCHEMA pgtempx;", "CREATE SCHEMA pgxtemp_test;",
                 "GRANT USAGE ON SCHEMA pgx,pgfinance,pgtempx,pgxtemp_test TO PUBLIC;",
                 "CREATE TABLE pgx.acl_table (id integer);",
                 "CREATE SEQUENCE pgx.acl_sequence;"]
        for i in range(39):
            setup.append("CREATE FUNCTION public.r25_trigger_%02d() RETURNS trigger "%i+
                "LANGUAGE plpgsql VOLATILE SECURITY INVOKER AS $$ "+
                "BEGIN RETURN NEW; END; $$;")
        self.sql("\n".join(setup),database=DB)

    def preflight(self):
        def isolated_catalog(args,**kwargs):
            query=args[args.index("-c")+1]
            result=self.sql(query,database=DB)
            return SimpleNamespace(stdout=result.stdout,stderr=result.stderr)
        with patch.object(installer,"cmd",side_effect=isolated_catalog):
            return installer.inherited_public_write_risks(DB)

    def install_role(self, expect_success):
        result=self.sql(installer.new_role_sql("A"*48).decode(),database=DB,
                        okay=False)
        if expect_success:
            self.assertEqual(result.returncode,0,result.stderr.decode()[-600:])
        else:
            self.assertNotEqual(result.returncode,0,
                                "UNSAFE ROLE TRANSACTION COMMITTED")
            self.assertIn("R25_B_NEW_ROLE_WRITABLE_OR_EXECUTE_CAPABILITY",
                          result.stderr.decode())
            self.manual_restricted_role()

    def manual_restricted_role(self):
        # Test-only: bypass the expected rejecting transaction to inspect the
        # native witness against exactly the effective unsafe PUBLIC grants.
        self.sql("""CREATE ROLE aoe2war_r25_web_ro LOGIN NOINHERIT NOSUPERUSER
                   NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
                   ALTER ROLE aoe2war_r25_web_ro
                     SET default_transaction_read_only=on;
                   GRANT USAGE ON SCHEMA public TO aoe2war_r25_web_ro;
                   GRANT SELECT ON ALL TABLES IN SCHEMA public
                     TO aoe2war_r25_web_ro;""",database=DB)

    def native_proof(self):
        result=self.sql(witness.SQL,database=DB,user=ROLE)
        return json.loads(result.stdout)

    def test_literal_predicate_exactly_16_sites(self):
        source=(ROOT/"scripts/r25_b_additive_3031_setup.py").read_text()
        native=(ROOT/"scripts/r25_b_host_witness.py").read_text()
        self.assertEqual(source.count("left(n.nspname, 3) <> 'pg_'"),8)
        self.assertEqual(source.count("left(n.nspname, 8) <> 'pg_temp_'"),2)
        self.assertEqual(native.count("left(n.nspname, 3) <> 'pg_'"),5)
        self.assertEqual(native.count("left(n.nspname, 8) <> 'pg_temp_'"),1)
        for raw in (source,native):
            self.assertNotRegex(raw,r"n\.nspname NOT LIKE 'pg_")
            self.assertIn("p.prorettype='pg_catalog.trigger'::regtype",raw)
            self.assertIn("NOT p.prosecdef",raw)
            self.assertIn("reviewed_trigger_exclusions",raw)

    def test_baseline_39_invoker_triggers_only(self):
        self.prepare()
        result=self.preflight()
        self.assertEqual(result["reviewed_trigger_exclusions"],39)
        self.assertEqual(result["unsafe_callable"],0)
        self.install_role(True)
        proof=self.native_proof()
        self.assertEqual(proof["reviewed_trigger_exclusions"],39)
        self.assertEqual(proof["session_user"],ROLE)
        self.assertEqual(proof["transaction_read_only"],"on")
        for key in ("role_restricted","no_db_create","no_schema_create",
                    "no_table_mutation","no_sequence_mutation",
                    "no_callable_security_definer",
                    "no_callable_volatile_user_functions"):
            self.assertIs(proof[key],True,key)

    def test_untrusted_public_acl_cases_all_three_boundaries(self):
        cases=[
          ("pgx table INSERT", "GRANT INSERT ON pgx.acl_table TO PUBLIC;",
           "table_write","no_table_mutation"),
          ("pgfinance schema CREATE", "GRANT CREATE ON SCHEMA pgfinance TO PUBLIC;",
           "schema_create","no_schema_create"),
          ("pgx sequence USAGE UPDATE", "GRANT USAGE, UPDATE ON SEQUENCE pgx.acl_sequence TO PUBLIC;",
           "sequence_write","no_sequence_mutation"),
          ("pgfinance VOLATILE", """CREATE FUNCTION pgfinance.unsafe_v()
             RETURNS int LANGUAGE SQL VOLATILE SECURITY INVOKER AS $$SELECT 1$$;""",
           "unsafe_callable","no_callable_volatile_user_functions"),
          ("pgx SECURITY DEFINER", """CREATE FUNCTION pgx.unsafe_def()
             RETURNS int LANGUAGE SQL STABLE SECURITY DEFINER AS $$SELECT 1$$;""",
           "unsafe_callable","no_callable_security_definer"),
          ("pgtempx CREATE", "GRANT CREATE ON SCHEMA pgtempx TO PUBLIC;",
           "schema_create","no_schema_create"),
          ("pgxtemp_test VOLATILE", """CREATE FUNCTION pgxtemp_test.unsafe_v()
             RETURNS int LANGUAGE SQL VOLATILE AS $$SELECT 1$$;""",
           "unsafe_callable","no_callable_volatile_user_functions"),
        ]
        for label,ddl,expected_risk,expected_witness in cases:
            with self.subTest(label=label):
                self.prepare()
                self.sql(ddl,database=DB)
                with self.assertRaisesRegex(RuntimeError,
                        "INHERITED_PUBLIC_WRITE_OR_CALLABLE"):
                    self.preflight()
                self.install_role(False)
                proof=self.native_proof()
                self.assertIs(proof[expected_witness],False,
                              "WITNESS_MISSED:"+label)
                self.assertEqual(proof["reviewed_trigger_exclusions"],39)

    def test_fortieth_trigger_is_catalog_drift(self):
        self.prepare()
        self.sql("""CREATE FUNCTION public.r25_trigger_40() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;""",database=DB)
        with self.assertRaisesRegex(RuntimeError,"REVIEWED_TRIGGER_SIGNATURE_COUNT_NOT_39"):
            self.preflight()
        self.install_role(False)
        self.assertEqual(self.native_proof()["reviewed_trigger_exclusions"],40)

    def test_real_pg_temp_schema_is_excluded_but_similar_names_are_not(self):
        self.prepare()
        query="""CREATE TEMP TABLE tmp (x int);
        SELECT json_build_object(
          'actual_temp', left((pg_my_temp_schema()::regnamespace)::text,8)='pg_temp_',
          'actual_excluded', NOT (left((pg_my_temp_schema()::regnamespace)::text,8)<>'pg_temp_'),
          'pgtempx_included', left('pgtempx',8)<>'pg_temp_',
          'pgxtemp_included', left('pgxtemp_test',8)<>'pg_temp_',
          'pgx_included',left('pgx',3)<>'pg_',
          'pgfinance_included',left('pgfinance',3)<>'pg_'
        )::text;"""
        rows=self.sql(query,database=DB).stdout.decode().splitlines()
        got=json.loads(rows[-1])
        self.assertTrue(all(got.values()),got)
        self.assertEqual(self.preflight()["reviewed_trigger_exclusions"],39)

if __name__=="__main__":
    unittest.main()
