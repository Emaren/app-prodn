import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createCurrentWatcherAccountStateRefreshGate } from "../lib/currentWatcherAccountStateRefreshGate.ts";

const make = (clock: { now: number }, onBackgroundError = (_error: unknown) => {}) =>
  createCurrentWatcherAccountStateRefreshGate<number>({
    successTtlMs: 15_000,
    failureCooldownMs: 30_000,
    now: () => clock.now,
    onBackgroundError,
  });

test("cold failure: 16 simultaneous callers single-flight, retry only after 30s, no invented empty rows", async () => {
  const clock = { now: 1_000 };
  const gate = make(clock);
  const failure = new Error("real PostgreSQL query failed");
  let scans = 0;
  const all = Array.from({ length: 16 }, () => gate.read(async () => {
    scans++;
    throw failure;
  }));
  const results = await Promise.allSettled(all);
  assert.equal(scans, 1);
  assert.equal(results.length, 16);
  for (const result of results) {
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") assert.equal(result.reason, failure);
  }

  const successLoader = async () => { scans++; return [71]; };
  clock.now = 30_999;
  await assert.rejects(gate.read(successLoader), /real PostgreSQL query failed/);
  assert.equal(scans, 1, "no retry storm within failure cooldown");
  clock.now = 31_000;
  assert.deepEqual(await gate.read(successLoader), [71]);
  assert.equal(scans, 2);
  clock.now = 45_999;
  assert.deepEqual(await gate.read(async () => { scans++; return [999]; }), [71]);
  assert.equal(scans, 2, "healthy cache retains original 15s TTL");
});

test("expired last-known-good remains visible across failed background refresh and cooldown", async () => {
  const clock = { now: 100 };
  const logged: unknown[] = [];
  const gate = make(clock, e => { logged.push(e); });
  let scans = 0;
  const good = await gate.read(async () => { scans++; return [111, 222]; });
  assert.deepEqual(good, [111, 222]);

  const failure = new Error("database temporarily unavailable");
  clock.now = 15_100;
  assert.deepEqual(await gate.read(async () => { scans++; throw failure; }),good);
  await setImmediate();
  assert.equal(scans, 2);
  assert.deepEqual(logged, [failure]);

  clock.now = 35_100;
  assert.deepEqual(await gate.read(async () => { scans++; return [333]; }),good);
  await setImmediate();
  assert.equal(scans, 2, "stale read must not retry before failure cooldown");
  clock.now = 45_100;
  assert.deepEqual(await gate.read(async () => { scans++; return [333]; }),good);
  await setImmediate();
  assert.equal(scans, 3);
  assert.deepEqual(await gate.read(async () => { scans++; return [444]; }),[333]);
  assert.equal(scans, 3,"recovered cache uses regular TTL");
});

test("invalidating a pending old request prevents stale completion from repopulating cache", async () => {
  const clock = { now: 0 };
  const gate = make(clock);
  let settleOld: ((rows: number[]) => void) | undefined;
  const old = gate.read(() => new Promise<number[]>(resolve => { settleOld = resolve; }));
  await Promise.resolve();
  assert.ok(settleOld);
  gate.invalidate();
  assert.deepEqual(await gate.read(async () => [88]), [88]);
  settleOld!([2]);
  assert.deepEqual(await old, [2], "original caller still gets own result");
  assert.deepEqual(await gate.read(async () => [999]), [88],
    "invalidated old in-flight reply must not overwrite fresh snapshot");
});

test("gate rejects unsafe cache timing settings", () => {
  assert.throws(() => createCurrentWatcherAccountStateRefreshGate<number>({
    successTtlMs: 0, failureCooldownMs: 30_000,
  }), /timing contract/);
  assert.throws(() => createCurrentWatcherAccountStateRefreshGate<number>({
    successTtlMs: 15_000, failureCooldownMs: -1,
  }), /timing contract/);
});
