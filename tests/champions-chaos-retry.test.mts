import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createStaleWhileRevalidateBackoff } from "../lib/champions/chaosActivityRetry.ts";

test("eight simultaneous failed cold Champions reads use one query and enforce one 30-second cooldown", async () => {
  let clock = 1000;
  let queries = 0;
  let unavailable = true;
  const failure = new Error("simulated restricted public view timeout");
  const correctRows = [
    { userUid: "first", eventCount: 13, streamedGames: 7, lastWatcherAt: "2026-11-20", hasWatcherKey: true },
    { userUid: "second", eventCount: 5, streamedGames: 4, lastWatcherAt: "2026-11-19", hasWatcherKey: false },
  ];
  const cache = createStaleWhileRevalidateBackoff({ ttlMs: 30_000, retryMs: 30_000, now: () => clock });
  const fetch = async () => {
    queries++;
    if (unavailable) throw failure;
    return correctRows;
  };

  const first = await Promise.allSettled(Array.from({ length: 8 }, () => cache.get(fetch)));
  assert.equal(queries, 1, "single-flight must prevent eight heavy aggregate executions");
  assert.ok(first.every((result) => result.status === "rejected"), "cold failure must remain unavailable, not zero rows");

  clock += 29_999;
  const blocked = await Promise.allSettled(Array.from({ length: 8 }, () => cache.get(fetch)));
  assert.equal(queries, 1, "repeated cold requests within cooldown must not execute SQL");
  assert.ok(blocked.every((result) => result.status === "rejected"));

  clock++;
  unavailable = false;
  const recovered = await cache.get(fetch);
  assert.equal(queries, 2);
  assert.deepEqual(recovered, correctRows, "all original counts, identities and recency survive the backoff");
});

test("after a successful read, expired data remains last-known-good throughout a failed background refresh", async () => {
  let clock = 0;
  let queries = 0;
  let unavailable = false;
  let backgroundFailures = 0;
  const rows = [{ userUid: "first", eventCount: 3, streamedGames: 2, lastWatcherAt: "2026-11-20", hasWatcherKey: true }];
  const cache = createStaleWhileRevalidateBackoff({ ttlMs: 30_000, retryMs: 30_000, now: () => clock });
  const fetch = async () => {
    queries++;
    if (unavailable) throw new Error("temporary read failure");
    return rows;
  };

  assert.deepEqual(await cache.get(fetch), rows);
  assert.equal(queries, 1);
  clock = 30_000;
  unavailable = true;
  assert.deepEqual(await cache.get(fetch, () => { backgroundFailures++; }), rows);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(queries, 2);
  assert.equal(backgroundFailures, 1);
  clock += 10_000;
  for (let i = 0; i < 8; i++) {
    assert.deepEqual(await cache.get(fetch), rows);
  }
  assert.equal(queries, 2, "a warm cache cannot be hammered during the failure cooldown");
  clock += 20_000;
  unavailable = false;
  assert.deepEqual(await cache.get(fetch), rows);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(queries, 3, "one successful refresh after the cooldown");
});

test("Champions retains historical distinct-game SQL and nonfinancial public-view privacy", () => {
  const src = fs.readFileSync("lib/champions/championsV2.ts", "utf8");
  const sql = fs.readFileSync("config/nonfinancial-public-champions-v6.sql", "utf8");
  assert.match(src, /GROUP BY COALESCE\(w\.user_uid, u\.uid\),/);
  assert.match(src, /SUM\(event_count\)::bigint AS event_count/);
  assert.match(src, /COUNT\(replay_key\)::bigint AS streamed_games/);
  assert.match(src, /FROM aoe2war_public_v6\.champions_chaos_activity/);
  assert.match(src, /createStaleWhileRevalidateBackoff/);
  assert.match(sql, /COUNT\(DISTINCT COALESCE\(/);
  const proposal = fs.readFileSync("tests/fixtures/champions-chaos-proposed-public.txt", "utf8");
  assert.match(proposal, /SUM\(event_count\)::bigint AS event_count/);
  assert.match(proposal, /COUNT\(replay_key\)::bigint AS streamed_games/);
  assert.match(sql, /REVOKE ALL ON aoe2war_public_v6\.champions_chaos_activity/);
  assert.doesNotMatch(src, /return \[\];\s*}\s*\nfunction startChaosActivityRefresh/);
});
