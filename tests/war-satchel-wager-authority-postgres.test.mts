import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import pg from "pg";

const bin = process.env.AOE2WAR_TEST_PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const migrationNames = [
  "20261014_103500_war_satchel_noncrediting_foundation",
  "20261014_133000_war_satchel_wallet_owner_challenges",
  "20261014_150000_war_satchel_simulated_double_entry",
  "20261014_164500_war_satchel_simulation_concurrency_guard",
  "20261014_191500_war_satchel_simulation_single_owner",
  "20261017_012000_war_satchel_funded_ledger_foundation",
];
const sqlFor = (name: string) => readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8");
const authorityMigration = sqlFor("20261019_010000_war_satchel_wager_authority");
const operation = (n: number) => `satchel:ticket:${n}`;
const reserve = (n: number) => `satchel:reserve:${n}`;
const digest = (n: number) => n.toString(16).padStart(64, "0");

// These tests prove SQL admission, atomicity and immutable persistence. They
// never turn arbitrary approval JSON into a cryptographic signing authority.
test("wager authority survives contention and interruption in isolated PostgreSQL", {
  skip: process.env.RUN_SATCHEL_PHYSICAL_PG_TESTS !== "1",
}, async t => {
  assert.ok(existsSync(path.join(bin, "initdb")));
  const root = mkdtempSync("/tmp/aoe2-satchel-wager-");
  const data = path.join(root, "data"), socket = path.join(root, "socket");
  mkdirSync(socket, {mode: 0o700});
  const clients: pg.Client[] = [];
  let started = false;
  const connect = async (database = "postgres") => {
    const c = new pg.Client({host: socket, user: "wager_fixture", database});
    await c.connect(); clients.push(c);
    await c.query("SET statement_timeout='5s'");
    return c;
  };
  const base = async (c: pg.Client) => {
    await c.query("CREATE TABLE users(id int PRIMARY KEY); CREATE TABLE bet_auto_presets(id int PRIMARY KEY); CREATE TABLE bet_auto_executions(id int PRIMARY KEY); CREATE TABLE pending_wolo_claims(id int PRIMARY KEY)");
    for (const name of migrationNames) await c.query(sqlFor(name));
    await c.query("INSERT INTO users VALUES(1),(2); INSERT INTO bet_auto_executions SELECT generate_series(1,12)");
    for (let n = 1; n <= 12; n++) {
      await c.query("INSERT INTO war_satchel_funded_reservations(id,owner_user_id,execution_id,amount_uwolo,ticket_request_id) VALUES($1,1,$2,1000000,$3)", [reserve(n), n, operation(n)]);
    }
  };
  const authorize = (c: pg.Client, n: number, snapshot: Record<string, unknown> = {}, owner = 1, op = operation(n)) => c.query(
    "INSERT INTO war_satchel_wager_authorizations(operation_id,reservation_id,owner_user_id,snapshot_json,reservation_digest,ledger_revision,consent_digest) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [op, reserve(n), owner, JSON.stringify({ownerUserId: 1, executionId: n, reservationId: reserve(n), operationId: operation(n), amountUwolo: "1000000", ...snapshot}), digest(n), digest(n + 100), digest(n + 200)],
  );
  const approve = (c: pg.Client, n: number) => c.query("INSERT INTO war_satchel_wager_approvals(operation_id,approval_json) VALUES($1,$2)", [operation(n), JSON.stringify({fixture_only: true})]);
  const attempt = (c: pg.Client, n: number) => c.query("UPDATE war_satchel_funded_reservations SET status='unknown_hold' WHERE id=$1", [reserve(n)]);
  const broadcast = (c: pg.Client, n: number, hash = digest(n).toUpperCase()) => c.query("INSERT INTO war_satchel_wager_broadcasts(operation_id,tx_hash) VALUES($1,$2)", [operation(n), hash]);
  try {
    execFileSync(path.join(bin, "initdb"), ["-D", data, "-U", "wager_fixture", "--auth-local=trust", "--auth-host=reject"], {stdio: "pipe"});
    execFileSync(path.join(bin, "pg_ctl"), ["-D", data, "-l", path.join(root, "server.log"), "-o", `-h '' -k ${socket}`, "-w", "start"], {stdio: "pipe"});
    started = true;
    const c = await connect(); await base(c); await c.query(authorityMigration);
    await t.test("authorization rejects a different owner, execution, amount or operation", async () => {
      for (const snapshot of [{ownerUserId: 2}, {executionId: 2}, {amountUwolo: "999999"}, {reservationId: reserve(2)}, {operationId: operation(2)}, {ownerUserId: null}]) {
        await assert.rejects(authorize(c, 1, snapshot), /not the durable owner reserve/);
      }
      await assert.rejects(authorize(c, 1, {}, 2), /not the durable owner reserve/);
      await assert.rejects(authorize(c, 1, {}, 1, operation(99)), /not the durable owner reserve/);
      assert.equal((await c.query("SELECT count(*) FROM war_satchel_wager_authorizations")).rows[0].count, "0");
    });
    await t.test("authorization and approval persistence are one-use", async () => {
      await authorize(c, 1); await approve(c, 1);
      await assert.rejects(authorize(c, 1), {code: "23505"});
      await assert.rejects(approve(c, 1), {code: "23505"});
      assert.equal((await c.query("SELECT count(*) FROM war_satchel_wager_approvals")).rows[0].count, "1");
    });
    await t.test("broadcast persistence requires both approval and a durable uncertainty fence", async () => {
      await assert.rejects(broadcast(c, 1), /durable attempt fence and review/);
      await authorize(c, 2); await attempt(c, 2);
      await assert.rejects(broadcast(c, 2), /durable attempt fence and review/);
      await assert.rejects(approve(c, 2), /attempted or released wager/);
      await attempt(c, 9); await assert.rejects(authorize(c, 9), /not the durable owner reserve/);
      await c.query("UPDATE war_satchel_funded_reservations SET status='released' WHERE id=$1", [reserve(10)]);
      await assert.rejects(authorize(c, 10), /not the durable owner reserve/);
      await attempt(c, 1); await broadcast(c, 1);
      await assert.rejects(c.query("UPDATE war_satchel_funded_reservations SET status='released' WHERE id=$1", [reserve(1)]), /illegal funded War Satchel reservation state transition/);
    });
    await t.test("one transaction hash cannot be reused by another payout obligation", async () => {
      await authorize(c, 3); await approve(c, 3); await attempt(c, 3);
      await assert.rejects(broadcast(c, 3, digest(1).toUpperCase()), {code: "23505"});
      await broadcast(c, 3);
      await assert.rejects(broadcast(c, 3), {code: "23505"});
      await authorize(c, 4); await approve(c, 4); await attempt(c, 4);
      for (const hash of ["0".repeat(64), "a".repeat(64), "NOT_A_HASH"]) await assert.rejects(broadcast(c, 4, hash), {code: "23514"});
    });
    await t.test("concurrent approval insertion blocks then rejects the duplicate", async () => {
      await authorize(c, 5);
      const a = await connect(), b = await connect();
      await a.query("BEGIN"); await approve(a, 5); await b.query("BEGIN");
      const duplicate = assert.rejects(approve(b, 5), {code: "23505"});
      await a.query("COMMIT"); await duplicate; await b.query("ROLLBACK");
      assert.equal((await c.query("SELECT count(*) FROM war_satchel_wager_approvals WHERE operation_id=$1", [operation(5)])).rows[0].count, "1");
    });
    await t.test("rollback removes only the uncommitted authorization, approval, fence and candidate", async () => {
      await c.query("BEGIN"); await authorize(c, 6); await approve(c, 6); await attempt(c, 6); await broadcast(c, 6); await c.query("ROLLBACK");
      assert.equal((await c.query("SELECT count(*) FROM war_satchel_wager_authorizations WHERE operation_id=$1", [operation(6)])).rows[0].count, "0");
      assert.equal((await c.query("SELECT status FROM war_satchel_funded_reservations WHERE id=$1", [reserve(6)])).rows[0].status, "reserved");
      await authorize(c, 6); await approve(c, 6);
    });
    await t.test("connection crash rolls back an uncommitted candidate without consuming the operation", async () => {
      const crashed = await connect();
      await crashed.query("BEGIN"); await authorize(crashed, 7); await approve(crashed, 7); await attempt(crashed, 7); await broadcast(crashed, 7); await crashed.end();
      await authorize(c, 7); await approve(c, 7);
      assert.equal((await c.query("SELECT status FROM war_satchel_funded_reservations WHERE id=$1", [reserve(7)])).rows[0].status, "reserved");
    });
    await t.test("a committed attempt remains uncertain across a connection restart", async () => {
      await authorize(c, 8); await approve(c, 8); await attempt(c, 8);
      const restarted = await connect();
      assert.equal((await restarted.query("SELECT status FROM war_satchel_funded_reservations WHERE id=$1", [reserve(8)])).rows[0].status, "unknown_hold");
      assert.equal((await restarted.query("SELECT count(*) FROM war_satchel_wager_broadcasts WHERE operation_id=$1", [operation(8)])).rows[0].count, "0");
      await assert.rejects(approve(restarted, 8), /attempted or released wager/);
      await assert.rejects(restarted.query("UPDATE war_satchel_funded_reservations SET status='reserved' WHERE id=$1", [reserve(8)]), /illegal funded War Satchel reservation state transition/);
    });
    await t.test("authorization, approval and broadcast evidence reject update, delete and truncate", async () => {
      for (const table of ["war_satchel_wager_authorizations", "war_satchel_wager_approvals", "war_satchel_wager_broadcasts"]) {
        await assert.rejects(c.query(`UPDATE ${table} SET created_at=created_at+interval '1 second'`), /immutable/);
        await assert.rejects(c.query(`DELETE FROM ${table}`), /immutable/);
        await assert.rejects(c.query(`TRUNCATE ${table} CASCADE`), /immutable/);
      }
      assert.equal((await c.query("SELECT count(*) FROM war_satchel_wager_broadcasts")).rows[0].count, "2");
    });
    await t.test("migration installation cannot commit its caller's transaction", async () => {
      await c.query("CREATE DATABASE migration_rollback"); const scratch = await connect("migration_rollback"); await base(scratch);
      await scratch.query("BEGIN"); await scratch.query(authorityMigration);
      assert.equal((await scratch.query("SELECT to_regclass('war_satchel_wager_authorizations') AS name")).rows[0].name, "war_satchel_wager_authorizations");
      await scratch.query("ROLLBACK");
      assert.equal((await scratch.query("SELECT to_regclass('war_satchel_wager_authorizations') AS name")).rows[0].name, null);
      assert.equal((await scratch.query("SELECT count(*) FROM war_satchel_funded_reservations")).rows[0].count, "12");
    });
  } finally {
    for (const c of clients) try { await c.end(); } catch {}
    if (started) execFileSync(path.join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"], {stdio: "pipe"});
    rmSync(root, {recursive: true, force: true});
  }
});
