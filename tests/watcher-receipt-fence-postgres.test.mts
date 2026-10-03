/** Real PostgreSQL concurrency checks; opt in with RUN_REPLAY_RECEIPT_PG_TESTS=1.
 * Creates an isolated disposable cluster on a private Unix socket, with TCP off.
 * No DATABASE_URL, existing database, service, or production data is used.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, appendFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import pg from "pg";
import { WATCHER_RECEIPT_FENCE_SQL, WATCHER_RECEIPT_SNAPSHOT_SQL } from "../lib/watcherReceiptPromotion.ts";

const exec = promisify(execFile);
const enabled = process.env.RUN_REPLAY_RECEIPT_PG_TESTS === "1";
const binaries = process.env.REPLAY_RECEIPT_PG_BIN ?? "/opt/homebrew/bin";

test("real PostgreSQL source snapshot and promotion fences reject concurrent drift", {
  skip: !enabled, timeout: 60_000,
}, async (t) => {
  // Keep the pathname short enough for PostgreSQL's Unix socket limit on macOS.
  const root = await mkdtemp("/tmp/aoe2war-receipt-pg-");
  const data = join(root, "data");
  const socket = join(root, "socket");
  const clients: pg.Client[] = [];
  let started = false;
  async function connect() {
    const client = new pg.Client({ host: socket, port: 5432, database: "postgres",
      user: "receipt_test", connectionTimeoutMillis: 2_000 });
    await client.connect();
    clients.push(client);
    return client;
  }
  try {
    await mkdir(socket, { mode: 0o700 });
    await exec(join(binaries, "initdb"), ["-D", data, "-U", "receipt_test", "--no-locale",
      "--encoding=UTF8", "--auth-local=trust", "--auth-host=reject"], { timeout: 15_000 });
    await appendFile(join(data, "postgresql.conf"),
      `\nlisten_addresses = ''\nunix_socket_directories = '${socket}'\nunix_socket_permissions = 0700\n`);
    await exec(join(binaries, "pg_ctl"), ["-D", data, "-l", join(root, "postgres.log"), "-w", "-t", "10", "start"], { timeout: 15_000 });
    started = true;
    const db = await connect();
    assert.equal((await db.query("SHOW listen_addresses")).rows[0].listen_addresses, "");
    await db.query(`
      CREATE TABLE game_stats (id int PRIMARY KEY, user_uid text, replay_hash text,
        parse_iteration int, key_events jsonb);
      CREATE TABLE replay_parse_attempts (id int PRIMARY KEY, game_stats_id int,
        user_uid text, replay_hash text, evidence jsonb);
      CREATE TABLE users (id int PRIMARY KEY, uid text UNIQUE, steam_id text,
        in_game_name text, steam_persona_name text);
      CREATE TABLE replay_result_adjudications (id int PRIMARY KEY, game_stats_id int,
        decision_status text, affects_stats boolean);
      CREATE TABLE replay_desync_incidents (id int PRIMARY KEY, game_stats_id int, detail text);
      INSERT INTO users VALUES (1,'a','steam-a','A','A'), (2,'b','steam-b','B','B'),
        (3,'c','steam-c','C','C'), (4,'d','steam-d','D','D');
      INSERT INTO game_stats VALUES
        (10,'a','replay-10',1,'{"platform_match_id":"battle-a"}'),
        (11,'b','replay-11',1,'{"platform_match_id":"battle-a"}'),
        (90,'d','replay-90',1,'{"platform_match_id":"battle-b"}');
      INSERT INTO replay_parse_attempts VALUES
        (100,10,'a','source-a','{"platform_match_id":"battle-a","marker":"original"}'),
        (101,11,'b','source-b','{"platform_match_id":"battle-a"}'),
        (102,90,'c','source-c','{"platform_match_id":"battle-a"}'),
        (103,90,'d','source-d','{"platform_match_id":"battle-b"}');
      INSERT INTO replay_result_adjudications VALUES (200,11,'accepted',true),(201,90,'accepted',true);
      INSERT INTO replay_desync_incidents VALUES (300,11,'alias incident'),(301,90,'unrelated');
    `);
    async function snapshot(client = db, exclude: number | null = null) {
      return String((await client.query(WATCHER_RECEIPT_SNAPSHOT_SQL, [10, exclude])).rows[0].snapshot_json);
    }
    const original = await snapshot();
    await t.test("actual SQL includes aliases, cross-game receipt platform matches, identities and conflicts", async () => {
      const source = JSON.parse(original);
      assert.deepEqual(source.games.map((r: { id: number }) => r.id), [10, 11]);
      assert.deepEqual(source.attempts.map((r: { id: number }) => r.id), [100, 101, 102]);
      assert.deepEqual(source.users.map((r: { id: number }) => r.id), [1, 2, 3]);
      assert.deepEqual(source.adjudications.map((r: { id: number }) => r.id), [200]);
      assert.deepEqual(source.desync_incidents.map((r: { id: number }) => r.id), [300]);
      assert.deepEqual(JSON.parse(await snapshot(db, 200)).adjudications, []);
      assert.equal(await snapshot(), original, "snapshot text is stable without a source change");
    });

    await t.test("SHARE table and identity row fences block inserts, refreshes and identity changes", async () => {
      const holder = await connect();
      await holder.query("BEGIN");
      try {
        await holder.query(WATCHER_RECEIPT_FENCE_SQL);
        const ids = JSON.parse(original).users.map((u: { id: number }) => u.id);
        await holder.query("SELECT id FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR SHARE", [ids]);
        const writes: Array<[string, string]> = [
          ["new attempt", "INSERT INTO replay_parse_attempts VALUES (104,10,'a','new','{}')"],
          ["refreshed attempt", "UPDATE replay_parse_attempts SET evidence='{}' WHERE id=100"],
          ["receipt platform phantom", "INSERT INTO replay_parse_attempts VALUES (105,90,'c','new','{\"platform_match_id\":\"battle-a\"}')"],
          ["new alias", "INSERT INTO game_stats VALUES (12,'a','new',1,'{\"platform_match_id\":\"battle-a\"}')"],
          ["changed alias", "UPDATE game_stats SET key_events='{}' WHERE id=11"],
          ["adjudication", "INSERT INTO replay_result_adjudications VALUES (202,10,'accepted',true)"],
          ["desync", "INSERT INTO replay_desync_incidents VALUES (302,10,'new')"],
          ["UID mapping", "UPDATE users SET uid='changed' WHERE id=1"],
          ["Steam mapping", "UPDATE users SET steam_id='changed' WHERE id=2"],
        ];
        for (const [label, sql] of writes) {
          const contender = await connect();
          await contender.query("BEGIN");
          try {
            await contender.query("SET LOCAL lock_timeout = '150ms'");
            await assert.rejects(contender.query(sql), (error: { code?: string }) => error.code === "55P03", label);
          } finally {
            await contender.query("ROLLBACK");
          }
          assert.equal(await snapshot(holder), original, `${label} did not alter the fenced source`);
        }
      } finally {
        await holder.query("ROLLBACK");
      }
      assert.equal(await snapshot(), original, "failed contenders leave no source changes");
    });

    await t.test("fresh SQL snapshot exposes a refreshed receipt and a late alias after planning", async () => {
      const writer = await connect();
      await writer.query("BEGIN");
      try {
        await writer.query("UPDATE replay_parse_attempts SET evidence = evidence || '{\"marker\":\"refreshed\"}'::jsonb WHERE id=100");
        assert.notEqual(await snapshot(writer), original);
        await writer.query("SAVEPOINT before_alias");
        const refreshed = await snapshot(writer);
        await writer.query("INSERT INTO game_stats VALUES (12,'a','late-source',2,'{\"platform_match_id\":\"battle-a\"}')");
        assert.notEqual(await snapshot(writer), refreshed);
        assert.deepEqual(JSON.parse(await snapshot(writer)).games.map((g: { id: number }) => g.id), [10, 11, 12]);
        await writer.query("ROLLBACK TO SAVEPOINT before_alias");
        assert.equal(await snapshot(writer), refreshed);
      } finally {
        await writer.query("ROLLBACK");
      }
      assert.equal(await snapshot(), original);
    });

    await t.test("advisory lock serializes a second writer before it acquires its table fence", async () => {
      const first = await connect();
      const second = await connect();
      await first.query("BEGIN");
      await second.query("BEGIN");
      let pending: Promise<pg.QueryResult> | undefined;
      try {
        await first.query("SELECT 1::int AS locked FROM pg_advisory_xact_lock($1::bigint)", [10]);
        await first.query(WATCHER_RECEIPT_FENCE_SQL);
        const pid = Number((await second.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
        await second.query("SET LOCAL lock_timeout = '3000ms'");
        pending = second.query("SELECT 1::int AS locked FROM pg_advisory_xact_lock($1::bigint)", [10]);
        // Observe PostgreSQL's wait state rather than relying on elapsed timing.
        let blocked = false;
        for (let i = 0; i < 100; i++) {
          const state = await db.query("SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted", [pid]);
          if (state.rowCount === 1) { blocked = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.ok(blocked, "second writer waits on the actual advisory lock");
        await first.query("ROLLBACK");
        await pending;
        await second.query(WATCHER_RECEIPT_FENCE_SQL);
        assert.equal(await snapshot(second), original);
      } finally {
        await first.query("ROLLBACK");
        if (pending) await pending.catch(() => undefined);
        await second.query("ROLLBACK");
      }
    });

    await t.test("recovery observer binds large alias inventories as arrays and selects only exact nonfinal matches", async () => {
      // Read the actual observer query without importing its production entry
      // point. The same SQL must work beyond Prisma's expanded parameter limit.
      const observer = await readFile(new URL("../scripts/replay_recovery_census_remote.mjs", import.meta.url), "utf8");
      const match = observer.match(/^const recoveryAliasSql = `([^`]+)`;/m);
      assert.ok(match, "observer alias SQL remains directly inspectable");
      const aliasSql = match[1];
      assert.match(aliasSql, /g\.replay_hash=ANY\(\$1::text\[\]\)/);
      assert.match(aliasSql, /platform_match_id'=ANY\(\$2::text\[\]\)/);
      assert.deepEqual([...new Set(aliasSql.match(/\$\d+/g))], ["$1", "$2"]);
      const hashes = Array.from({ length: 40_001 }, (_, index) => index.toString(16).padStart(64, "0"));
      hashes.push(hashes[0], hashes[40_000]);
      const platformIds = ["qa-exact-platform", "qa-exact-platform"];
      await db.query("BEGIN");
      try {
        await db.query(`ALTER TABLE game_stats
          ADD COLUMN is_final boolean NOT NULL DEFAULT true,
          ADD COLUMN players jsonb DEFAULT '[]',
          ADD COLUMN winner text,
          ADD COLUMN parse_reason text,
          ADD COLUMN parse_source text,
          ADD COLUMN disconnect_detected boolean DEFAULT false,
          ADD COLUMN replay_file text,
          ADD COLUMN original_filename text`);
        await db.query(`INSERT INTO game_stats (id, replay_hash, is_final, key_events) VALUES
          (1000,$1,false,'{"platform_match_id":"unrelated"}'),
          (1001,$2,false,'{"platform_match_id":"qa-exact-platform"}'),
          (1002,$3,false,'{"platform_match_id":"qa-exact-platform"}'),
          (1003,$3,true,'{"platform_match_id":"qa-exact-platform"}'),
          (1004,$2,false,'{"platform_match_id":"qa-exact-platform-suffix"}'),
          (1005,$4,false,'{"platform_match_id":"unrelated"}'),
          (1006,$1,true,'{"platform_match_id":"unrelated"}')`,
        [hashes[0], "f".repeat(64), hashes[40_000], `${hashes[0]}-suffix`]);
        const largeInventory = await db.query(aliasSql, [hashes, platformIds]);
        assert.deepEqual(largeInventory.rows.map((row: { id: number }) => row.id), [1000, 1001, 1002]);
        assert.ok(largeInventory.rows.every((row: { is_final: boolean }) => row.is_final === false));
        assert.equal(largeInventory.rows[2].replayHash, hashes[40_000], "array tail is bound exactly");
        assert.deepEqual((await db.query(aliasSql, [hashes, []])).rows.map((row: { id: number }) => row.id), [1000, 1002]);
        assert.deepEqual((await db.query(aliasSql, [[], platformIds])).rows.map((row: { id: number }) => row.id), [1001, 1002]);
        assert.deepEqual((await db.query(aliasSql, [[], []])).rows, []);
      } finally {
        await db.query("ROLLBACK");
      }
    });
  } finally {
    await Promise.allSettled(clients.map((c) => c.end()));
    if (started) {
      await exec(join(binaries, "pg_ctl"), ["-D", data, "-w", "-t", "10", "-m", "fast", "stop"], { timeout: 15_000 });
    }
    await rm(root, { recursive: true, force: true });
  }
});
