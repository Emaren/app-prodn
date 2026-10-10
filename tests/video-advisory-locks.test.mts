import test from "node:test";
import assert from "node:assert/strict";
import {
  lockVideoBroadcaster,
  lockVideoSessionPrimary,
  lockVideoChunkWriter,
} from "../lib/streamAdvisoryLocks.ts";

function fakeTransaction(rows: Array<{ locked: number }> = [{ locked: 1 }]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: strings.join("?"), values });
      return rows;
    },
  };
  return { tx, calls };
}

test("locks issue parameterized transaction-scoped Postgres SQL with separate bounded key domains", async () => {
  const { tx, calls } = fakeTransaction();
  await lockVideoBroadcaster(tx as never, 781);
  await lockVideoSessionPrimary(tx as never, "platform:445566");
  await lockVideoChunkWriter(tx as never, 1009);
  assert.equal(calls.length, 3);
  assert.match(calls[0].sql, /pg_advisory_xact_lock\(\?, \?\)/);
  assert.match(calls[1].sql, /pg_advisory_xact_lock\(\?, hashtext\(\?\)\)/);
  assert.match(calls[2].sql, /pg_advisory_xact_lock\(\?, \?\)/);
  assert.deepEqual(calls.map(c => c.values), [
    [734100, 781], [734101, "platform:445566"], [734102, 1009],
  ]);
});

test("invalid numeric IDs and arbitrary/unbounded battle keys never call PostgreSQL locks", async () => {
  const { tx, calls } = fakeTransaction();
  for (const id of [0, -1, Infinity, 2.5, 2_147_483_648, NaN]) {
    await assert.rejects(lockVideoBroadcaster(tx as never, id), /Invalid/);
    await assert.rejects(lockVideoChunkWriter(tx as never, id), /Invalid/);
  }
  for (const key of ["", "a".repeat(256)]) {
    await assert.rejects(lockVideoSessionPrimary(tx as never, key), /Invalid/);
  }
  assert.equal(calls.length, 0);
});

test("lock failure never silently proceeds to stream replacement", async () => {
  const { tx } = fakeTransaction([]);
  await assert.rejects(lockVideoBroadcaster(tx as never, 1), /unavailable/);
  await assert.rejects(lockVideoSessionPrimary(tx as never, "platform:1"), /unavailable/);
  await assert.rejects(lockVideoChunkWriter(tx as never, 1), /unavailable/);
});
