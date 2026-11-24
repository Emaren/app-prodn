"""Isolated PG16 Watcher V3 original-vs-repair parity and TEMP/plan evidence.

Only runs with RUN_CURRENT_WATCHER_V3_PG_TESTS=1. Creates a private UNIX
socket PostgreSQL cluster in /tmp; NEVER connects to the live server.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "tests/fixtures/current-watcher-v3-original.sql"
CANDIDATE = ROOT / "config/nonfinancial-public-watcher-v3.sql"
BASE_SHA256 = "d97dc6cc41cd33a86f5a8e0529593ae99b905535cf626f4775b5be4264d1236d"
PG_BIN = Path(os.environ.get("AOE2WAR_TEST_PG16_BIN", "/opt/homebrew/opt/postgresql@16/bin"))
PORT = 56432
VIEW = "aoe2war_public_v3.current_watcher_account_states"
COLS = ('"steamId", "latestObservedName", "nameObservedAt", '
        '"steamRmRating", "steamRmObservedAt", "steamDmRating", "steamDmObservedAt"')
ATTEMPTS = 6200


def seed_sql() -> str:
    return """
CREATE ROLE aoe2war_web_prod LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE TABLE public.replay_parse_attempts (
  id bigint PRIMARY KEY, user_uid text, replay_hash text,
  played_on timestamp, created_at timestamp NOT NULL,
  parse_source text, upload_mode text, status text,
  evidence jsonb, original_filename text
);
REVOKE ALL ON public.replay_parse_attempts FROM PUBLIC, aoe2war_web_prod;
CREATE INDEX watcher_fixture_filter ON public.replay_parse_attempts (upload_mode, parse_source, status);
WITH generated AS (
 SELECT g,
        (TIMESTAMP '2026-11-20 00:00:00' + (g % 2000) * INTERVAL '1 minute') AS played,
        md5(((g-1)/2)::text) || md5('h' || ((g-1)/2)::text) AS digest,
        '7656119' || (8000000000::bigint + (g % 317))::text AS steam1,
        '7656119' || (9000000000::bigint + ((g+43) % 311))::text AS steam2,
        CASE WHEN g % 4 = 0 THEN 'watcher_final' ELSE 'watcher_live' END AS src
 FROM generate_series(1, __ATTEMPTS__) g
), inputs AS (
 SELECT *,
   played + INTERVAL '1 hour' AS captured,
   CASE WHEN g %% 5 = 0 THEN NULL ELSE 1000 + (g %% 1400) END AS rm,
   CASE WHEN g %% 7 = 0 THEN NULL ELSE 1600 + (g %% 900) END AS dm,
   CASE WHEN g %% 13 = 0 THEN NULL ELSE 1100 + (g %% 1100) END AS opp_rm,
   CASE WHEN g %% 11 = 0 THEN NULL ELSE 1900 + (g %% 700) END AS opp_dm
 FROM generated
)
INSERT INTO public.replay_parse_attempts
 (id,user_uid,replay_hash,played_on,created_at,parse_source,upload_mode,status,evidence,original_filename)
SELECT
 g, 'u_fixture', digest, played, captured,
 src, 'watcher',
 CASE WHEN g %% 163 = 0 THEN 'failed' ELSE 'stored' END,
 jsonb_build_object('current_account_observation', jsonb_build_object(
   'schema','aoe2war-current-account-observation/v1',
   'uploader_uid',CASE WHEN g %% 149 = 0 THEN 'forged' ELSE 'u_fixture' END,
   'replay_sha256',digest,
   'parse_source',src,
   'upload_mode','watcher',
   'observed_game_at',to_char(played,'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z',
   'captured_at',to_char(captured,'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z',
   'archive_verified',true,
   'result_authority',false,
   'candidate_result_authority',false,
   'parser',jsonb_build_object(
     'name','aoe2war.mgz_hd','version','1.8.51','schema_version','2026-07-25.1',
     'pass_name','hd_deterministic_evidence','pass_version','10',
     'options',jsonb_build_object('apply_hd_early_exit_rules',src='watcher_final')),
   'provenance',jsonb_build_object(
     'ingestion_provenance',CASE WHEN g %% 101=0 THEN 'historical_import' ELSE 'live_monitor' END,
     'provenance_signature_verified',true,'client_sha256_verified',true,
     'server_sha256',digest,'client_sha256',digest,
     'file_role',CASE WHEN src='watcher_final' THEN 'final_recording' ELSE 'live_checkpoint' END),
   'players',jsonb_build_array(
     jsonb_build_object(
       'steam_id',steam1,'name','Warrior-' || (g %% 317),
       'steam_rm_rating',rm,'steam_dm_rating',dm,
       'steam_rating_sources',jsonb_build_object(
         'steam_rm_rating',CASE WHEN rm IS NULL THEN NULL ELSE 'hd_header' END,
         'steam_dm_rating',CASE WHEN dm IS NULL THEN NULL ELSE 'hd_header' END)),
     jsonb_build_object(
       'steam_id',CASE WHEN g %% 137 = 0 THEN steam1 ELSE steam2 END,
       'name','Opponent-' || (g %% 311),
       'steam_rm_rating',opp_rm,'steam_dm_rating',opp_dm,
       'steam_rating_sources',jsonb_build_object(
         'steam_rm_rating',CASE WHEN opp_rm IS NULL THEN NULL ELSE 'hd_header' END,
         'steam_dm_rating',CASE WHEN opp_dm IS NULL THEN NULL ELSE 'hd_header' END))
   )
 )),
 CASE WHEN g %% 157 = 0 THEN 'old replay @2024.03.01 101010.aoe2record' ELSE NULL END
FROM inputs;
ANALYZE public.replay_parse_attempts;
""".replace("__ATTEMPTS__",str(ATTEMPTS)).replace("%%","%")


class WatcherV3SQLPG(unittest.TestCase):
    def setUp(self):
        if os.getenv("RUN_CURRENT_WATCHER_V3_PG_TESTS") != "1":
            self.skipTest("Explicit RUN_CURRENT_WATCHER_V3_PG_TESTS=1 required")
        self.assertTrue(all((PG_BIN / x).is_file() for x in ("initdb", "pg_ctl", "psql")),
                        "PostgreSQL 16 binaries required")
        self.tmp = Path(tempfile.mkdtemp(prefix="aoe2w3pg-", dir="/tmp"))
        self.data = self.tmp / "data"
        self.sock = self.tmp / "s"
        self.sock.mkdir(mode=0o700)
        self.started = False
        self.run_proc([str(PG_BIN/"initdb"),"-D",str(self.data),"-U","postgres",
                       "--auth-local=trust","--auth-host=reject"], timeout=120)
        self.run_proc([str(PG_BIN/"pg_ctl"),"-D",str(self.data),"-l",str(self.tmp/"server.log"),
                       "-o",f"-h '' -k {self.sock} -p {PORT} -c shared_buffers=32MB -c fsync=on -c max_connections=16",
                       "-w","start"], timeout=60)
        self.started = True
        self.assertEqual(self.query("SELECT current_setting('server_version_num')::int / 10000;").stdout.strip(), "16")

    def tearDown(self):
        if getattr(self,"started",False):
            self.run_proc([str(PG_BIN/"pg_ctl"),"-D",str(self.data),"-m","immediate","-w","stop"],timeout=45)
        if getattr(self,"tmp",None):
            shutil.rmtree(self.tmp,ignore_errors=True)

    def run_proc(self, cmd, input=None, timeout=180, check=True):
        proc=subprocess.run(cmd,input=input,text=True,capture_output=True,timeout=timeout,
                            env={k:v for k,v in os.environ.items() if not k.startswith("PG")})
        if check and proc.returncode:
            raise AssertionError(f"COMMAND FAILED {cmd[0]} exit={proc.returncode} stdout={proc.stdout[-2000:]} stderr={proc.stderr[-3000:]}")
        return proc

    def query(self, sql, check=True):
        return self.run_proc([
          str(PG_BIN/"psql"),"-X","-q","-A","-t","-v","ON_ERROR_STOP=1",
          "-h",str(self.sock),"-p",str(PORT),"-U","postgres","-d","postgres"
        ],input=sql,timeout=180,check=check)

    def public(self, sql, check=True):
        return self.query("SET work_mem='64kB'; SET ROLE aoe2war_web_prod;\n"+sql,check=check)

    def explain(self, name):
        sql=(f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT {COLS} "
             f"FROM {name} ORDER BY \"steamId\";")
        plan=json.loads(self.public(sql).stdout.strip())[0]
        nodes=[]
        def walk(p):
            nodes.append(p["Node Type"])
            for child in p.get("Plans",[]): walk(child)
        walk(plan["Plan"])
        return {
          "execution_ms":round(plan["Execution Time"],3),
          "temp_read_blocks":plan["Plan"].get("Temp Read Blocks",0),
          "temp_written_blocks":plan["Plan"].get("Temp Written Blocks",0),
          "windowagg_nodes":nodes.count("WindowAgg"),
          "sort_nodes":nodes.count("Sort"),
          "node_count":len(nodes),
        }

    def catalog_snapshot(self):
        return self.query("""
SET search_path = pg_catalog;
SELECT jsonb_build_object(
 'view', (SELECT to_jsonb(c) - 'relfilenode' - 'relpages' - 'reltuples' - 'relacl'
          || jsonb_build_object('acl_is_null',c.relacl IS NULL,'acl',
              (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type,x.is_grantable)
               FROM aclexplode(c.relacl) x))
          FROM pg_class c WHERE oid='aoe2war_public_v3.current_watcher_account_states'::regclass),
 'definition', pg_get_viewdef('aoe2war_public_v3.current_watcher_account_states'::regclass, false),
 'schema', (SELECT to_jsonb(n) - 'nspacl' || jsonb_build_object('acl_is_null',n.nspacl IS NULL,'acl',
           (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type,x.is_grantable)
            FROM aclexplode(n.nspacl) x)) FROM pg_namespace n WHERE nspname='aoe2war_public_v3'),
 'dependencies', (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.refclassid,d.refobjid,d.refobjsubid,d.deptype)
                  FROM pg_depend d JOIN pg_rewrite r ON d.objid=r.oid
                  WHERE d.classid='pg_rewrite'::regclass
                  AND r.ev_class='aoe2war_public_v3.current_watcher_account_states'::regclass),
 'columns', (SELECT jsonb_agg(to_jsonb(a) - 'attacl' || jsonb_build_object('acl_is_null',a.attacl IS NULL,'acl',
               (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type,x.is_grantable)
                FROM aclexplode(a.attacl) x)) ORDER BY attnum) FROM pg_attribute a
             WHERE attrelid='aoe2war_public_v3.current_watcher_account_states'::regclass AND attnum>0)
);
""").stdout.strip()

    def test_same_view_replacement_restore_and_privilege_isolation(self):
        self.query(seed_sql())
        self.query(BASE.read_text())
        self.query("""
CREATE ROLE fixture_other NOLOGIN;
CREATE SCHEMA fixture_financial;
CREATE TABLE fixture_financial.ledger (id integer, amount numeric);
REVOKE ALL ON SCHEMA fixture_financial FROM PUBLIC;
REVOKE ALL ON fixture_financial.ledger FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v3 TO fixture_other;
GRANT SELECT ON aoe2war_public_v3.current_watcher_account_states TO fixture_other;
""")
        raw_before=self.catalog_snapshot()
        raw_state=json.loads(raw_before)
        raw_definition=raw_state["definition"]
        options=raw_state["view"]["reloptions"] or []
        self.assertEqual(options,["security_barrier=true"])
        # Establish PostgreSQL's own parse/deparse fixed point on the original
        # expression; do not normalize SQL text or discard dependency identities.
        restore="SET search_path=pg_catalog; CREATE OR REPLACE VIEW "+VIEW+" WITH (security_barrier=true) AS "+raw_definition
        self.query(restore)
        before=self.catalog_snapshot()
        state=json.loads(before)
        for key in raw_state:
            if key != "definition":
                self.assertEqual(raw_state[key],state[key],key)
        self.query(restore)
        self.assertEqual(before,self.catalog_snapshot())
        definition=raw_definition
        acl_sql="""SELECT jsonb_build_array(
          (SELECT jsonb_agg(to_jsonb(c) ORDER BY oid) FROM pg_class c
           WHERE relnamespace='fixture_financial'::regnamespace),
          (SELECT to_jsonb(n) FROM pg_namespace n WHERE nspname='fixture_financial'),
          (SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member) FROM pg_auth_members m),
          has_schema_privilege('aoe2war_web_prod','fixture_financial','USAGE'),
          has_table_privilege('aoe2war_web_prod','fixture_financial.ledger','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'));"""
        finance=self.query(acl_sql).stdout
        original=self.public(f"SELECT {COLS} FROM {VIEW}").stdout
        candidate=CANDIDATE.read_text()
        self.query(candidate)
        after=json.loads(self.catalog_snapshot())
        for key in ("view","schema","columns"):
            self.assertEqual(state[key],after[key],key)
        self.assertEqual(finance,self.query(acl_sql).stdout)
        self.assertEqual(original,self.public(f"SELECT {COLS} FROM {VIEW}").stdout)
        self.assertEqual(self.query(f"""SELECT EXISTS (
          SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid
          WHERE d.classid='pg_rewrite'::regclass AND d.refclassid='pg_class'::regclass
          AND r.ev_class='{VIEW}'::regclass AND d.refobjid='public.replay_parse_attempts'::regclass);""").stdout.strip(),"t")
        # Restore actual captured definition, not a guessed historical install script.
        options=state["view"]["reloptions"] or []
        self.assertIn("security_barrier=true",options)
        self.assertTrue(all(x in ("security_barrier=true","security_barrier=false","security_invoker=true","security_invoker=false","check_option=local","check_option=cascaded") for x in options))
        option_clause=" WITH ("+",".join(options)+")" if options else ""
        self.query("SET search_path=pg_catalog; CREATE OR REPLACE VIEW "+VIEW+option_clause+" AS "+definition)
        self.assertEqual(before,self.catalog_snapshot())
        self.assertEqual(finance,self.query(acl_sql).stdout)
        for grant in ("SELECT(evidence)","UPDATE(evidence)"):
            self.query(f"GRANT {grant} ON public.replay_parse_attempts TO aoe2war_web_prod;")
            denied=self.query(candidate,check=False)
            self.assertNotEqual(denied.returncode,0)
            self.assertIn("PUBLIC_WATCHER_RAW_EVIDENCE_AUTHORITY_DRIFT",denied.stderr)
            self.assertEqual(before,self.catalog_snapshot())
            self.query(f"REVOKE {grant} ON public.replay_parse_attempts FROM aoe2war_web_prod;")
        self.assertEqual(finance,self.query(acl_sql).stdout)
        print("PASS_SAME_VIEW_REPLACEMENT_CAPTURED_INVERSE_AND_ACL_ISOLATION",flush=True)

    def test_full_public_view_parity_and_temp_io(self):
        original=BASE.read_bytes()
        self.assertEqual(hashlib.sha256(original).hexdigest(),BASE_SHA256)
        changed=CANDIDATE.read_text()
        self.assertIn("security_barrier=true",changed)
        self.assertNotIn("identity_count",changed)
        self.query(seed_sql())
        # A second independent immutable view name avoids overwriting baseline.
        baseline=original.decode().replace(VIEW,VIEW+"_baseline")
        self.query(baseline)
        self.query(changed)
        count=int(self.public(f'SELECT count(*) FROM {VIEW};').stdout.strip())
        self.assertGreater(count,300,"Fixture must exercise real current accounts")
        self.assertLessEqual(count,628,"Two distinct 300-ish identity sets")

        old=self.public(f"COPY (SELECT {COLS} FROM {VIEW}_baseline ORDER BY \"steamId\") TO STDOUT WITH (FORMAT CSV);").stdout
        new=self.public(f"COPY (SELECT {COLS} FROM {VIEW} ORDER BY \"steamId\") TO STDOUT WITH (FORMAT CSV);").stdout
        self.assertEqual(old,new,"Entire ordered seven-field corpus must be byte-identical")
        self.assertEqual(len(new.splitlines()),count)
        for suffix in ("baseline",""):
            view=VIEW+("_"+suffix if suffix else "")
            cols=self.query("SELECT string_agg(column_name,',' ORDER BY ordinal_position) "
                            "FROM information_schema.columns WHERE table_schema='aoe2war_public_v3' "
                            f"AND table_name='current_watcher_account_states{('_'+suffix) if suffix else ''}';")
            self.assertEqual(cols.stdout.strip(),
                "steamId,latestObservedName,nameObservedAt,steamRmRating,steamRmObservedAt,steamDmRating,steamDmObservedAt")
            opts=self.query("SELECT reloptions::text FROM pg_class WHERE oid="
                            f"'{view}'::regclass;").stdout
            self.assertIn("security_barrier=true",opts)
        denied=self.public("SELECT 1 FROM public.replay_parse_attempts LIMIT 1;",check=False)
        self.assertNotEqual(denied.returncode,0,"public role cannot SELECT raw replay evidence")
        self.assertIn("permission denied",denied.stderr.lower())
        lane=int(self.public(f'SELECT count(*) FROM {VIEW} WHERE "steamRmObservedAt" IS NOT NULL '
                             'AND "steamDmObservedAt" IS NOT NULL AND "steamRmObservedAt" <> "steamDmObservedAt";').stdout.strip())
        self.assertGreater(lane,0,"Independent RM/DM clocks must remain distinct")

        samples={"original":[],"candidate":[]}
        for round_id in range(3):
            order=[("original",VIEW+"_baseline"),("candidate",VIEW)]
            if round_id%2:order.reverse()
            for label,view in order:
                samples[label].append(self.explain(view))
        med=lambda key,label:sorted(x[key] for x in samples[label])[1]
        self.assertGreaterEqual(med("windowagg_nodes","original"),1)
        self.assertEqual(med("windowagg_nodes","candidate"),0)
        report={
            "status":"PASS_ISOLATED_PG16_WATCHER_V3_FULL_CORPUS_PARITY",
            "attempt_rows":ATTEMPTS,"result_rows":count,
            "ordered_csv_sha256":hashlib.sha256(new.encode()).hexdigest(),
            "distinct_rm_dm_clock_rows":lane,
            "public_raw_table_select":"DENIED",
            "security_barrier":"PRESERVED",
            "work_mem":"64kB",
            "medians":{label:{key:med(key,label) for key in
                      ("execution_ms","temp_read_blocks","temp_written_blocks","windowagg_nodes","sort_nodes")}
                       for label in ("original","candidate")},
            "runs":samples,
            "database":"private PG16 UNIX socket only; no TCP/prod connection",
        }
        print("WATCHER_V3_PG16_RESULT "+json.dumps(report,sort_keys=True),flush=True)


if __name__=="__main__":
    unittest.main()
