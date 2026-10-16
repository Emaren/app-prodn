import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isReplayRatingClockConsistent } from "../lib/replayRatingClockIntegrity.ts";

const poisoned = [
  ["MP Replay v5.8 @2025.11.29 181650 (4).aoe2record", "2026-10-16T18:05:51.057Z", 1764469427865, 2321],
  ["MP Replay v5.8 @2025.10.06 074031 (1).aoe2record", "2026-10-16T18:08:40.712Z", 1759761931798, 2303],
  ["MP Replay v5.8 @2026.01.22 170730 (1).aoe2record", "2026-10-16T18:09:00.909Z", 1769131120176, 2348],
  ["MP Replay v5.8 @2026.02.26 213413 (5).aoe2record", "2026-10-16T18:16:30.210Z", 1772160159478, 2358],
  ["MP Replay v5.8 @2025.08.06 175759 (2).aoe2record", "2026-10-16T18:17:10.731Z", 1754529133945, 2311],
  ["MP Replay v5.8 @2026.03.01 153033 (1).aoe2record", "2026-10-16T18:17:44.750Z", 1772397559633, 2353],
] as const;

test("all six Zodiac production game-clock forgeries are denied rating time without deleting games", () => {
  for (const [originalFilename, playedOn, mtime, rating] of poisoned) {
    assert.equal(
      isReplayRatingClockConsistent({
        originalFilename, playedOn, keyEvents: { watcher_upload: { file_mtime_ms: mtime } },
      }),
      false, String(rating),
    );
  }
});

test("genuine near-source-clock signed final recordings remain eligible", () => {
  assert.equal(isReplayRatingClockConsistent({
    originalFilename: "MP Replay v5.8 @2026.10.16 180000.aoe2record",
    playedOn: "2026-10-16T19:00:00Z",
    keyEvents: { watcher_upload: { file_mtime_ms: Date.parse("2026-10-16T19:05:00Z") } },
  }), true);
});

test("UTC/source-local midnight shift remains eligible", () => {
  assert.equal(isReplayRatingClockConsistent({
    originalFilename: "MP Replay v5.8 @2026.10.15 235900.aoe2record",
    playedOn: "2026-10-16T05:59:00Z",
  }), true);
});

test("cannot make rating current merely by copying older replay today", () => {
  assert.equal(isReplayRatingClockConsistent({
    originalFilename: "MP Replay v5.8 @2025.11.29 181650 (4).aoe2record",
    playedOn: "2026-10-16T18:05:51Z",
    keyEvents: { watcher_upload: { file_mtime_ms: Date.parse("2026-10-16T18:05:51Z") } },
  }), false);
});

test("undated replay with older client mtime cannot receive newer rating clock", () => {
  assert.equal(isReplayRatingClockConsistent({
    originalFilename: "undated.aoe2record",
    playedOn: "2026-10-16T18:05:51Z",
    keyEvents: { watcher_upload: { file_mtime_ms: "1764469427865" } },
  }), false);
});

test("undated replay with NO evidence is not proven by this contradiction checker", () => {
  assert.equal(isReplayRatingClockConsistent({
    originalFilename: "undated.aoe2record", playedOn: "2026-10-16T18:05:51Z",
  }), true);
  assert.equal(isReplayRatingClockConsistent({
    originalFilename: "undated.aoe2record", playedOn: null,
  }), false);
});

test("compact original replay filename dates also prevent imported 2026 rating authority", () => {
  assert.equal(isReplayRatingClockConsistent({
    originalFilename: "replay_20251129_181650.aoe2record", playedOn: "2026-10-16T18:05:51Z",
  }), false);
});

test("all three rating paths deny source-date contradictions", () => {
  const src = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const receipt = src("../lib/currentWatcherAccountState.ts");
  const signed = src("../lib/verifiedWatcherSteamRatings.ts");
  const historical = src("../lib/publicPlayerDirectory.ts");
  assert.match(receipt, /a\.played_on >= a\.created_at - INTERVAL '48 hours'/);
  assert.match(signed, /g\.played_on >= g\.created_at - INTERVAL '48 hours'/);
  assert.match(receipt, /SUBSTRING\(a\.original_filename FROM/);
  assert.match(receipt, /TO_CHAR\(a\.played_on - INTERVAL '2 days'/);
  assert.match(signed, /SUBSTRING\(g\.original_filename FROM/);
  assert.match(signed, /file_mtime_ms/);
  assert.match(signed, /INTERVAL '48 hours'/);
  assert.match(historical, /isReplayRatingClockConsistent\(\{/);
  assert.match(historical, /ratingObservedAt:\s*isReplayRatingClockConsistent\(/);
});
