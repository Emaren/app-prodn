// Live PostgreSQL contention probe: disposable CI database only.
// No game, user, replay, wager, stream, or WOLO tables are accessed.
import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.VIDEO_LOCK_TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("VIDEO_LOCK_TEST_DATABASE_URL is required; refusing to probe unknown DB");
}
if (!/^(?:postgresql|postgres):\/\/ci:ci@127\.0\.0\.1:5432\/aoe2war_ci(?:\?.*)?$/.test(databaseUrl)) {
  throw new Error("Video lock probe may only connect to the disposable localhost CI database");
}

const clients = Array.from({ length: 3 }, () => new Client({ connectionString: databaseUrl }));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const lockByInt = (domain, id) => ({
  sql: "SELECT 1::integer AS locked FROM pg_advisory_xact_lock($1, $2)",
  args: [domain, id],
});
const lockByKey = (domain, key) => ({
  sql: "SELECT 1::integer AS locked FROM pg_advisory_xact_lock($1, hashtext($2))",
  args: [domain, key],
});
async function begin(client) { await client.query("BEGIN"); }
async function release(client) { await client.query("ROLLBACK"); }
async function acquire(client, lock) {
  const result = await client.query(lock.sql, lock.args);
  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].locked, 1);
}

async function verifyBlockingAndRecovery(domain, lock, independent) {
  const [a, b, c] = clients;
  await Promise.all([begin(a), begin(b), begin(c)]);
  try {
    await acquire(a, lock);
    let competitorFinished = false;
    const pending = acquire(b, lock).then(() => { competitorFinished = true; });
    await sleep(150);
    assert.equal(competitorFinished, false, domain + ": second worker bypassed held xact lock");
    // Another camera/battle remains available even while a particular
    // broadcaster, session or chunk key is locked by somebody else.
    await acquire(c, independent);
    await release(c);
    await release(a);
    await pending;
    assert.equal(competitorFinished, true);
    await release(b);
    // Crash/rollback semantics: transaction-scoped locks never survive
    // rollback into a new connection.
    await begin(c);
    await acquire(c, lock);
    await release(c);
    process.stdout.write("PASS " + domain + ": contention, isolation, rollback release\n");
  } finally {
    await Promise.allSettled(clients.map(client => client.query("ROLLBACK")));
  }
}

try {
  await Promise.all(clients.map(client => client.connect()));
  await Promise.all(clients.map(client => client.query("SET statement_timeout = '6500ms'")));
  await verifyBlockingAndRecovery("broadcaster", lockByInt(734100, 871), lockByInt(734100, 872));
  await verifyBlockingAndRecovery("battle-primary", lockByKey(734101, "platform:710001"),
    lockByKey(734101, "platform:710002"));
  await verifyBlockingAndRecovery("chunk-writer", lockByInt(734102, 8612), lockByInt(734102, 8613));
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
}
