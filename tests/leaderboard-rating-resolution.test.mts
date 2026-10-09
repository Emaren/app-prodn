import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  latestHistoricalSteamLaneRating,
  resolveLeaderboardRatingPresentation,
} from "../lib/leaderboardRating.ts";

test("current receipt-backed Steam rating outranks historical and Site Elo", () => {
  assert.deepEqual(
    resolveLeaderboardRatingPresentation({
      lane: "rm",
      currentRmRating: 2011,
      currentDmRating: null,
      lastKnownRmRating: 1975,
      lastKnownDmRating: 2250,
      siteElo: 1888,
      hasTrackedHistory: true,
    }),
    {
      value: 2011,
      source: "current_steam",
      sourceLabel: "RM Rating",
      secondaryLabel: null,
    },
  );
});

test("last-known accepted Steam snapshot outranks Site Elo without becoming current authority", () => {
  assert.deepEqual(
    resolveLeaderboardRatingPresentation({
      lane: "dm",
      currentRmRating: null,
      currentDmRating: null,
      lastKnownRmRating: 1800,
      lastKnownDmRating: 2314,
      siteElo: 1760,
      hasTrackedHistory: true,
    }),
    {
      value: 2314,
      source: "last_known_steam",
      sourceLabel: "Last DM",
      secondaryLabel: null,
    },
  );
});

test("Site Elo can never masquerade as a Steam Elo on V1, even with history", () => {
  assert.deepEqual(
    resolveLeaderboardRatingPresentation({
      lane: "rm",
      currentRmRating: null,
      currentDmRating: null,
      lastKnownRmRating: null,
      lastKnownDmRating: null,
      siteElo: 1655,
      hasTrackedHistory: true,
    }),
    {
      value: null,
      source: "profile",
      sourceLabel: "Steam Elo unavailable",
      secondaryLabel: null,
    },
  );
});

test("profile-only identities remain unrated", () => {
  assert.deepEqual(
    resolveLeaderboardRatingPresentation({
      lane: "rm",
      currentRmRating: null,
      currentDmRating: null,
      lastKnownRmRating: null,
      lastKnownDmRating: null,
      siteElo: 1500,
      hasTrackedHistory: false,
    }),
    {
      value: null,
      source: "profile",
      sourceLabel: "Steam Elo unavailable",
      secondaryLabel: null,
    },
  );
});

test("non-positive Steam sentinels are unavailable", () => {
  const resolved =
    resolveLeaderboardRatingPresentation({
      lane: "rm",
      currentRmRating: 0,
      currentDmRating: null,
      lastKnownRmRating: -1,
      lastKnownDmRating: null,
      siteElo: 1507,
      hasTrackedHistory: true,
    });

  assert.equal(resolved.source, "profile");
  assert.equal(resolved.value, null);
});

test("last-known Steam rating follows actual observed replay chronology", () => {
  const evidence = [
    {
      ratingObservedAt: "2026-10-01T10:00:00.000Z",
      steamRmRating: 1810,
      steamDmRating: 2200,
    },
    {
      ratingObservedAt: "2026-10-03T10:00:00.000Z",
      steamRmRating: 1855,
      steamDmRating: null,
    },
    {
      ratingObservedAt: "not-a-date",
      steamRmRating: 9999,
      steamDmRating: 9999,
    },
    {
      ratingObservedAt: null,
      steamRmRating: 7777,
      steamDmRating: 7777,
    },
  ];

  assert.equal(
    latestHistoricalSteamLaneRating(
      evidence,
      "rm",
    ),
    1855,
  );
  assert.equal(
    latestHistoricalSteamLaneRating(
      evidence,
      "dm",
    ),
    2200,
  );
});

test("display/history timestamps cannot substitute for explicit rating played_on", () => {
  const evidence = [
    {
      // General replay display chronology may have a created_at/timestamp
      // fallback, but rating chronology intentionally has none.
      observedAt: "2026-10-08T12:00:00.000Z",
      ratingObservedAt: null,
      steamRmRating: 9999,
      steamDmRating: 9999,
    },
    {
      observedAt: "2026-10-01T12:00:00.000Z",
      ratingObservedAt: "2026-10-01T12:00:00.000Z",
      steamRmRating: 1777,
      steamDmRating: 2222,
    },
  ];

  assert.equal(
    latestHistoricalSteamLaneRating(
      evidence,
      "rm",
    ),
    1777,
  );
});

test("historical Steam fallback requires explicit HD-header provenance", () => {
  const directorySource =
    readFileSync(
      join(
        process.cwd(),
        "lib/publicPlayerDirectory.ts",
      ),
      "utf8",
    );

  assert.match(
    directorySource,
    /hasHdHeaderRatingSource\([\s\S]*?"steam_rm_rating"/,
  );
  assert.match(
    directorySource,
    /hasHdHeaderRatingSource\([\s\S]*?"steam_dm_rating"/,
  );
  assert.match(
    directorySource,
    /===\s*"hd_header"/,
  );
});

test("Emaren shows actual Steam RM 1077 and DM 1538, never Site Elo 1716", () => {
  const input = {
    currentRmRating: 1077,
    currentDmRating: 1538,
    lastKnownRmRating: 1045,
    lastKnownDmRating: 1510,
    siteElo: 1716,
    hasTrackedHistory: true,
  };
  const rm = resolveLeaderboardRatingPresentation({ ...input, lane: "rm" });
  const dm = resolveLeaderboardRatingPresentation({ ...input, lane: "dm" });
  assert.equal(rm.value, 1077);
  assert.equal(dm.value, 1538);
  assert.equal(rm.secondaryLabel, null);
  assert.equal(dm.secondaryLabel, null);
  for (const lane of ["rm","dm"] as const) {
    const unknown = resolveLeaderboardRatingPresentation({
      ...input, lane, currentRmRating: null, currentDmRating: null,
      lastKnownRmRating: null, lastKnownDmRating: null,
    });
    assert.equal(unknown.value, null, "Site Elo must never fill an unknown Steam Elo");
  }
});
