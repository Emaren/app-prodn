#!/usr/bin/env python3
"""Private PostgreSQL 16 parity and TEMP I/O evidence for original Watcher SQL.

Never connects to DATABASE_URL, never opens TCP; uses a disposable UNIX-only
cluster. CI can opt in with RUN_VERIFIED_WATCHER_SQL_PG_TESTS=1.
"""
import json
import os
from pathlib import Path
import random
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
TEST_ENABLED = os.environ.get("RUN_VERIFIED_WATCHER_SQL_PG_TESTS") == "1"
BIN = Path(os.environ.get("AOE2WAR_TEST_PG_BIN", "/opt/homebrew/bin"))
ORIGINAL = (ROOT / "tests/fixtures/verified-watcher-steam-rating-original.sql").read_text().split("\n", 1)[1].strip()
SOURCE = (ROOT / "lib/verifiedWatcherSteamRatings.ts").read_text()
MODERN = SOURCE.split("const rows = await prisma.$queryRaw<DbRow[]>(Prisma.sql" + chr(96), 1)[1].split(chr(96) + ");", 1)[0].strip()

class WatcherSteamSqlParity(unittest.TestCase):
    @unittest.skipUnless(TEST_ENABLED, "RUN_VERIFIED_WATCHER_SQL_PG_TESTS=1 required")
    def test_original_and_optimized_are_identical_on_pg16(self):
        self.assertIn("WITH verified_games AS MATERIALIZED", ORIGINAL)
        self.assertIn("GROUP BY latest.steam_id", MODERN)
        self.assertIn("HAVING COUNT(*) = 1", MODERN)
        self.assertTrue((BIN / "initdb").is_file())
        self.assertTrue((BIN / "pg_ctl").is_file())
        self.assertTrue((BIN / "psql").is_file())
        root = Path(tempfile.mkdtemp(prefix="vws-", dir="/tmp"))
        data = root / "data"
        socket = root / "socket"
        socket.mkdir(mode=0o700)
        started = False
        try:
            subprocess.run([str(BIN / "initdb"), "-D", str(data), "-U", "vws_test",
                            "--auth-local=trust", "--auth-host=reject"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
            subprocess.run([str(BIN / "pg_ctl"), "-D", str(data), "-l", str(root / "server.log"),
                            "-o", "-h '' -k " + str(socket) +
                            " -c max_connections=16 -c shared_buffers=16MB",
                            "-w", "start"], stdout=subprocess.DEVNULL,
                           stderr=subprocess.PIPE, check=True)
            started = True

            def run(sql, *, from_file=False):
                args = [str(BIN / "psql"), "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
                        "-h", str(socket), "-U", "vws_test", "-d", "postgres"]
                args += ["-f", str(sql)] if from_file else ["-c", sql]
                return subprocess.run(args, text=True, capture_output=True,
                                      check=True, timeout=35).stdout.strip()

            run("""CREATE TABLE game_stats (
              id integer PRIMARY KEY, played_on timestamp, timestamp bigint,
              players jsonb, parse_source text, parse_reason text, created_at timestamp,
              original_filename text, key_events jsonb, user_uid text,
              replay_hash text, is_final boolean NOT NULL DEFAULT false
            )""")
            rng = random.Random(1475)
            stamp = "2026-10-07 00:00:00"
            older = "2026-10-06 00:00:00"
            steam_ids = ["76561198000000001","76561198000000002",
                         "76561198000000003","76561198000000004"]
            def sql_text(x):
                return "'" + str(x).replace("'", "''") + "'"
            rows = []
            # Broad, deterministic qualification matrix: include one old
            # unsigned cohort and exclude manual, final-role mismatches,
            # bad replay hashes, invalid player identity and backdated games.
            for i in range(1, 5001):
                source = "watcher_final" if i % 11 == 0 else "watcher_live"
                final = source == "watcher_final"
                date = older if i % 5 == 0 else stamp
                created = "2026-10-08 00:00:00"
                digest = f"{i:064x}"
                players = []
                for j, sid in enumerate(steam_ids):
                    rm = 1050 + (i * (j + 3)) % 950
                    dm = 1500 + (i * (j + 2)) % 750
                    players.append({"steam_id":sid, "steam_rm_rating":rm,
                                    "steam_dm_rating":dm,
                                    "steam_rating_sources":{"steam_rm_rating":
                                        "hd_header" if j % 2 else "unmarked",
                                        "steam_dm_rating":"summary_rate_snapshot"}})
                if i % 13 == 0:
                    players.append(dict(players[0]))  # identity collision: remove steam 1
                if i % 17 == 0:
                    players[1]["steam_rm_rating"] = 0  # invalid lane, DM stays
                if i % 19 == 0:
                    players[2]["steam_rating_sources"]["steam_dm_rating"] = "manual" # deny DM
                if i % 23 == 0:
                    players.append({"steam_id":"not-steam", "steam_rm_rating":4000})
                if i % 29 == 0:
                    players = {"unexpected":"not-an-array"}
                signature = i % 7 != 0
                if i % 7 == 0:
                    date = older
                    created = "2026-10-08 00:00:00" # frozen pre-fix valid false signature
                proof = {"ingestion_provenance":"live_monitor",
                         "provenance_signature_verified":signature,
                         "client_sha256_verified":True,
                         "server_sha256":digest,"client_sha256":digest,
                         "checkpoint_final_rejected":False,
                         "file_role":"final_recording" if final else "live_checkpoint"}
                if i % 31 == 0: proof["client_sha256_verified"] = False
                if i % 37 == 0: proof["file_role"] = "manual"
                if i % 41 == 0: source = "file_upload"
                reason = "manual_backfill" if i % 43 == 0 else ""
                filename = "game@2026.10.07.mgz" if i % 47 != 0 else "game@2012.01.01.mgz"
                if i % 53 == 0: digest = "f" * 63
                if i % 59 == 0: date = "2020-10-07 00:00:00"
                rows.append("(" + ",".join([
                    str(i), sql_text(date), str(6000 + i % 21),
                    sql_text(json.dumps(players, separators=(",",":"))) + "::jsonb",
                    sql_text(source), sql_text(reason), sql_text(created),
                    sql_text(filename),
                    sql_text(json.dumps({"watcher_upload":proof},separators=(",",":"))) + "::jsonb",
                    sql_text("u-fixture"),sql_text(digest), "TRUE" if final else "FALSE"
                ]) + ")")
            init_path = root / "seed.sql"
            init_path.write_text("INSERT INTO game_stats (id, played_on, timestamp, players, parse_source,"
                                 " parse_reason, created_at, original_filename, key_events,"
                                 " user_uid, replay_hash, is_final) VALUES\n" +
                                 ",\n".join(rows) + ";\n")
            run(init_path, from_file=True)
            # Same session semantics. Compare full results, not merely counts.
            def rows_for(query):
                return json.loads(run("SET work_mem='64kB'; SET max_parallel_workers_per_gather=0;"
                                      "SELECT COALESCE(jsonb_agg(to_jsonb(result) ORDER BY "
                                      'result."steamId"),'
                                      "'[]'::jsonb) FROM (" + query + ") result;").splitlines()[-1])
            old_rows, new_rows = rows_for(ORIGINAL), rows_for(MODERN)
            self.assertTrue(len(old_rows) >= 2, "fixture must have meaningful Steam activity")
            self.assertEqual(new_rows, old_rows, "rating authority, chronology, identity and provenance must match")
            def temp_io(query):
                raw = run("SET work_mem='64kB';SET max_parallel_workers_per_gather=0;"
                          "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + query + ";")
                plan = json.loads(raw[raw.index("["):raw.rindex("]") + 1])[0]
                root_plan = plan["Plan"]
                return {"read":root_plan.get("Temp Read Blocks",0),
                        "written":root_plan.get("Temp Written Blocks",0),
                        "execution_ms":plan.get("Execution Time",0)}
            before, after = temp_io(ORIGINAL), temp_io(MODERN)
            print("WATCHER_STEAM_ISOLATED_PG16_EQUIVALENCE",len(new_rows),
                  "ORIGINAL_TEMP",before,"NEW_TEMP",after, flush=True)
            self.assertGreater(before["written"],0,
                               "the synthetic stress fixture must actually spill before optimization")
            self.assertLess(after["written"], before["written"],
                            "PG16 bounded synthetic fixture must reduce temporary writes")
            self.assertLess(after["read"], before["read"],
                            "PG16 bounded synthetic fixture must reduce temporary reads")
            # Performance is recorded, but only WE2 real natural workload can
            # certify production pressure reduction.
        finally:
            if started:
                subprocess.run([str(BIN / "pg_ctl"), "-D", str(data), "-m", "immediate",
                                "-w", "stop"], stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=20)
            shutil.rmtree(root, ignore_errors=True)

if __name__ == "__main__":
    unittest.main()
