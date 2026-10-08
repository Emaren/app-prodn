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
