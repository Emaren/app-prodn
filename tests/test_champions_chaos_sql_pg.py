#!/usr/bin/env python3
"""Source-qualified full-history Champions aggregation parity on private PG16.

The view SELECT is compared independently of installation; actual protected
public-view migration needs original DB-owner authorization. Never reads env
DATABASE_URL or production credentials; socket-only disposable PG16 cluster.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
ENABLED=os.getenv("RUN_CHAMPIONS_CHAOS_SQL_PG_TESTS")=="1"
BIN=Path(os.getenv("AOE2WAR_TEST_PG_BIN","/opt/homebrew/bin"))
LEGACY_PREFIX="return await prisma.$queryRaw<WatcherActivityRow[]>(Prisma.sql"+chr(96)

def legacy_sql(source):
    assert source.count(LEGACY_PREFIX)==2
    return source.split(LEGACY_PREFIX,2)[2].split(chr(96)+");",1)[0].strip()

def public_sql(source):
    return source.split("CREATE OR REPLACE VIEW aoe2war_public_v6.champions_chaos_activity",1)[1].split(
        "WITH (security_barrier = true) AS",1)[1].split(
        "REVOKE ALL ON aoe2war_public_v6.champions_chaos_activity",1)[0].strip().removesuffix(";")

def original(name):
    return (ROOT/"tests/fixtures"/name).read_text().split("\n",1)[1].strip()

class ChaosSqlParity(unittest.TestCase):
    @unittest.skipUnless(ENABLED,"RUN_CHAMPIONS_CHAOS_SQL_PG_TESTS=1 required")
    def test_legacy_public_full_history_equivalence_and_temp_io(self):
        queries={
            "old_legacy": original("champions-chaos-original-legacy.sql"),
            "new_legacy": legacy_sql((ROOT/"lib/champions/championsV2.ts").read_text()),
            "old_public": original("champions-chaos-original-public.sql"),
            "new_public": public_sql((ROOT/"config/nonfinancial-public-champions-v6.sql").read_text())
        }
        self.assertIn("COUNT(DISTINCT",queries["old_public"])
        self.assertIn("GROUP BY user_uid",queries["new_public"])
        self.assertIn("COUNT(replay_key)",queries["new_legacy"])
        root=Path(tempfile.mkdtemp(prefix="chaos-",dir="/tmp"))
        data=root/"data"
        sock=root/"socket"
        sock.mkdir(mode=0o700)
        started=False
        try:
            subprocess.run([str(BIN/"initdb"),"-D",str(data),"-U","chaos_fixture",
                "--auth-local=trust","--auth-host=reject"],check=True,
                stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            subprocess.run([str(BIN/"pg_ctl"),"-D",str(data),"-l",str(root/"server.log"),
                 "-o","-h '' -k "+str(sock)+" -c shared_buffers=16MB -c max_connections=16",
                 "-w","start"],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            started=True
            def sql(q, *, file=False):
                args=[str(BIN/"psql"),"-X","-A","-t","-v","ON_ERROR_STOP=1",
                      "-h",str(sock),"-U","chaos_fixture","-d","postgres"]
                args += ["-f",str(q)] if file else ["-c",q]
                return subprocess.run(args,check=True,capture_output=True,text=True,timeout=50).stdout.strip()
            sql("CREATE TABLE users (id integer PRIMARY KEY,uid text UNIQUE);"
                "CREATE TABLE api_keys (id integer,user_id integer,kind text,revoked_at timestamp);"
                "CREATE TABLE watcher_client_events (id integer,user_id integer,"
                "user_uid text,replay_hash text,replay_file text,created_at timestamp);")
            sql("INSERT INTO users SELECT n, 'player-'||n FROM generate_series(1,30) n")
            sql("INSERT INTO api_keys SELECT n,n,"
                "CASE WHEN n%5=0 THEN 'admin' ELSE 'watcher' END,"
                "CASE WHEN n%7=0 THEN now() ELSE NULL END "
                "FROM generate_series(1,30) n")
            # Deterministic multi-event replays, cross-user hashes, NULL keys,
            # stored UID precedence, and user-ID fallback, including unknowns.
            sql("""INSERT INTO watcher_client_events
                   SELECT n,1+(n%30),
                     CASE WHEN n%13=0 THEN NULL
                          WHEN n%17=0 THEN 'unclaimed-extra'
                          ELSE 'player-'||(1+n%30) END,
                     CASE WHEN n%11=0 THEN '' WHEN n%23=0 THEN NULL
                          ELSE 'sha-'||(n%300) END,
                     CASE WHEN n%29=0 THEN NULL ELSE 'file-'||(n%700) END,
                     TIMESTAMP '2026-10-01 00:00:00'+
                       (n%604800)*INTERVAL '1 second'
                   FROM generate_series(1,120000) n""")
            def result(q):
                raw=sql("SET work_mem='64kB'; SET max_parallel_workers_per_gather=0;"
                  "SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY "
                  'r."userUid"),'+"'[]'::jsonb) FROM ("+q+") r;")
                return json.loads(raw.splitlines()[-1])
            old=result(queries["old_legacy"])
            self.assertEqual(len(old),30)
            for name,q in queries.items():
                self.assertEqual(result(q),old,name+" changes full historical Watcher counts, timestamps or keys")
            def io(q):
                raw=sql("SET work_mem='64kB';SET max_parallel_workers_per_gather=0;"
                   "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) "+q+";")
                plan=json.loads(raw[raw.index("["):raw.rindex("]")+1])[0]
                p=plan["Plan"]
                return {"read":p.get("Temp Read Blocks",0),
                        "written":p.get("Temp Written Blocks",0),
                        "ms":plan.get("Execution Time",0)}
            results={name:io(q) for name,q in queries.items()}
            print("CHAMPIONS_CHAOS_ISOLATED_PG16_FULL_PARITY",len(old),
                  "TEMP_BLOCKS",results,flush=True)
            self.assertGreater(results["old_legacy"]["written"],0,
                               "the original historical query must spill in the synthetic stress fixture")
            self.assertGreater(results["old_public"]["written"],0,
                               "the original public view must spill in the synthetic stress fixture")
            for profile in ("legacy", "public"):
                self.assertLess(
                    results["new_"+profile]["written"], results["old_"+profile]["written"],
                    profile+" narrow grouped replay keys must reduce synthetic temp writes")
                self.assertLess(
                    results["new_"+profile]["read"], results["old_"+profile]["read"],
                    profile+" narrow grouped replay keys must reduce synthetic temp reads")
            # Only actual WE2 natural event capture can certify production
            # disk low-water improvements. CI protects full-count parity.
        finally:
            if started:
                subprocess.run([str(BIN/"pg_ctl"),"-D",str(data),"-m","immediate",
                    "-w","stop"],stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,timeout=20)
            shutil.rmtree(root,ignore_errors=True)

if __name__=="__main__":
    unittest.main()
