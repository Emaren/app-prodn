import assert from "node:assert/strict";
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
      secondaryLabel: "Site 1888",
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
      secondaryLabel: "Site 1760",
    },
  );
});

test("Site Elo is only the third presentation tier for replay-backed warriors", () => {
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
      value: 1655,
      source: "site_elo",
      sourceLabel: "Site Elo",
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
      sourceLabel: "Profile",
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

  assert.equal(resolved.source, "site_elo");
  assert.equal(resolved.value, 1507);
});

test("last-known Steam rating follows actual observed replay chronology", () => {
  const evidence = [
    {
      observedAt: "2026-10-01T10:00:00.000Z",
      steamRmRating: 1810,
      steamDmRating: 2200,
    },
    {
      observedAt: "2026-10-03T10:00:00.000Z",
      steamRmRating: 1855,
      steamDmRating: null,
    },
    {
      observedAt: "not-a-date",
      steamRmRating: 9999,
      steamDmRating: 9999,
    },
    {
      observedAt: null,
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
