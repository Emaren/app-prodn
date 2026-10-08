import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  selectLatestSteamObservation,
} from "../lib/verifiedWatcherSteamRatings.ts";

test("latest signed Watcher observation wins by game time, independently per Steam lane", () => {
  const earlier = "2026-10-06T22:00:00.000Z";
  const later = "2026-10-07T01:18:12.950Z";
  assert.deepEqual(selectLatestSteamObservation(1055, earlier, 1077, later), {
    rating: 1077, observedAt: later,
  });
  assert.deepEqual(selectLatestSteamObservation(1538, later, 1588, earlier), {
    rating: 1538, observedAt: later,
  });
  assert.deepEqual(selectLatestSteamObservation(null, null, 1538, later), {
    rating: 1538, observedAt: later,
  });
  assert.deepEqual(selectLatestSteamObservation(null, null, null, null), {
    rating: null, observedAt: null,
  });
  assert.deepEqual(selectLatestSteamObservation(1077, later, 9999, earlier), {
    rating: 1077, observedAt: later,
  });
});

test("manual and batch uploads cannot create or override the signed Watcher rating stream", () => {
  const source = readFileSync(new URL("../lib/verifiedWatcherSteamRatings.ts", import.meta.url), "utf8");
  assert.match(source, /g\.parse_source IN \('watcher_live','watcher_final'\)/);
  assert.match(source, /provenance_signature_verified/);
  assert.match(source, /client_sha256_verified/);
  assert.match(source, /ingestion_provenance.*'live_monitor'/);
  assert.match(source, /server_sha256/);
  assert.match(source, /g\.played_on IS NOT NULL/);
  assert.match(source, /identity_count = 1/);
  assert.match(source, /ORDER BY steam_id, played_on DESC, timestamp DESC NULLS LAST, id DESC/);
  assert.doesNotMatch(source, /parse_source IN \('watcher_live','watcher_final','file_upload'\)/);
  assert.doesNotMatch(source, /rate_snapshot\s+AS\s+(?:rm|dm)/i);
});

test("the canonical directory never creates a user or match count from live rating observations", () => {
  const source = readFileSync(new URL("../lib/publicPlayerDirectory.ts", import.meta.url), "utf8");
  assert.match(source, /loadVerifiedWatcherSteamRatings/);
  assert.match(source, /signedWatcherByKey/);
  assert.match(source, /selectLatestSteamObservation/);
  assert.match(source, /if \(!state && !signed\)/);
  assert.doesNotMatch(source, /updateLastPlayedAt\([\s\S]{0,120}signed\.steamRmObservedAt/);
});

// A bounded SQL-result integration seam: PostgreSQL already applies signature,
// chronology and source predicates; the JavaScript adapter must preserve
// per-lane values without applying Site Elo or name-based identity fallbacks.
test("signed watcher SQL projection preserves independently observed RM/DM values", async () => {
  const { loadVerifiedWatcherSteamRatings, invalidateVerifiedWatcherSteamRatingsCache } =
    await import("../lib/verifiedWatcherSteamRatings.ts");
  invalidateVerifiedWatcherSteamRatingsCache();
  let sql = "";
  const prisma = {
    $queryRaw: async (statement: { sql: string }) => {
      sql = statement.sql;
      return [{
        steamId: "76561198000000001",
        steamRmRating: 1077,
        steamRmObservedAt: new Date("2026-10-07T01:18:12.950Z"),
        steamDmRating: 1538,
        steamDmObservedAt: new Date("2026-10-07T01:18:12.950Z"),
      }];
    },
  };
  const result = await loadVerifiedWatcherSteamRatings(prisma as never);
  assert.equal(result.length, 1);
  assert.equal(result[0].steamRmRating, 1077);
  assert.equal(result[0].steamDmRating, 1538);
  assert.match(sql, /provenance_signature_verified/);
  assert.match(sql, /g\.parse_source IN \('watcher_live','watcher_final'\)/);
  invalidateVerifiedWatcherSteamRatingsCache();
});

test("unavailable signed-history SQL fails closed without taking down a public leaderboard", async () => {
  const { loadVerifiedWatcherSteamRatings, invalidateVerifiedWatcherSteamRatingsCache } =
    await import("../lib/verifiedWatcherSteamRatings.ts");
  invalidateVerifiedWatcherSteamRatingsCache();
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await loadVerifiedWatcherSteamRatings({
      $queryRaw: async () => { throw new Error("optional rating rail unavailable"); },
    } as never);
    assert.deepEqual(result, []);
  } finally {
    console.warn = originalWarn;
    invalidateVerifiedWatcherSteamRatingsCache();
  }
});
