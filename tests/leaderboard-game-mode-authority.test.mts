import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyLeaderboardReplayMode,
  resolveLeaderboardReplayMode,
  summarizeLeaderboardLaneEvidence,
} from "../lib/leaderboardGameMode.ts";
import {
  compareLeaderboardRatingAuthority,
  resolveLeaderboardRatingPresentation,
} from "../lib/leaderboardRating.ts";

test("replay mode classification is explicit and fail closed", () => {
  for (const value of ["RM", "Random Map", "RandomMap", "Ranked Match"]) {
    assert.equal(classifyLeaderboardReplayMode(value), "rm");
  }
  for (const value of ["DM", "Death Match", "Deathmatch"]) {
    assert.equal(classifyLeaderboardReplayMode(value), "dm");
  }
  for (const value of [null, undefined, "", "Unknown", "TurboRandom9", "Custom", "Regicide", 9]) {
    assert.equal(classifyLeaderboardReplayMode(value), null);
  }
});

test("mixed RM, DM, and unknown replays never contaminate another lane", () => {
  const evidence = [
    { gameMode: "rm" as const, result: "win", observedAt: "2026-10-01T10:00:00Z" },
    { gameMode: "dm" as const, result: "loss", observedAt: "2026-10-03T12:00:00Z" },
    { gameMode: null, result: "win", observedAt: "2026-10-06T15:00:00Z" },
    { gameMode: "rm" as const, result: "unknown", observedAt: "2026-10-02T10:00:00Z" },
  ];
  const rm = summarizeLeaderboardLaneEvidence(evidence, "rm");
  const dm = summarizeLeaderboardLaneEvidence(evidence, "dm");
  assert.deepEqual([rm.totalMatches, rm.wins, rm.losses, rm.unknowns], [2, 1, 0, 1]);
  assert.deepEqual([dm.totalMatches, dm.wins, dm.losses, dm.unknowns], [1, 0, 1, 0]);
  assert.equal(rm.lastPlayedAt, "2026-10-02T10:00:00Z");
  assert.equal(dm.lastPlayedAt, "2026-10-03T12:00:00Z");
});

test("Steam RM rating and Site Elo never sort as if numerically interchangeable", () => {
  const steam = resolveLeaderboardRatingPresentation({
    lane: "rm", currentRmRating: null, currentDmRating: null,
    lastKnownRmRating: 1650, lastKnownDmRating: null,
    siteElo: 1400, hasTrackedHistory: true,
  });
  const site = resolveLeaderboardRatingPresentation({
    lane: "rm", currentRmRating: null, currentDmRating: null,
    lastKnownRmRating: null, lastKnownDmRating: null,
    siteElo: 2100, hasTrackedHistory: true,
  });
  assert.equal(steam.source, "last_known_steam");
  assert.equal(site.source, "profile");
  assert.equal(site.value, null);
  assert.ok(compareLeaderboardRatingAuthority(steam, site) < 0);
  assert.ok(compareLeaderboardRatingAuthority(site, steam) > 0);

  const higherCurrent = resolveLeaderboardRatingPresentation({
    lane: "rm", currentRmRating: 1700, currentDmRating: 2200,
    lastKnownRmRating: null, lastKnownDmRating: null,
    siteElo: null, hasTrackedHistory: false,
  });
  assert.ok(compareLeaderboardRatingAuthority(higherCurrent, steam) < 0);
  assert.ok(compareLeaderboardRatingAuthority(higherCurrent, steam, "asc") > 0);
  assert.ok(compareLeaderboardRatingAuthority(steam, site, "asc") < 0);
  assert.equal(higherCurrent.value, 1700);
  const unrated = resolveLeaderboardRatingPresentation({
    lane: "dm", currentRmRating: null, currentDmRating: null,
    lastKnownRmRating: null, lastKnownDmRating: null,
    siteElo: 1500, hasTrackedHistory: false,
  });
  assert.equal(compareLeaderboardRatingAuthority(unrated, unrated), 0);
  assert.equal(compareLeaderboardRatingAuthority(unrated, unrated, "asc"), 0);
});

test("malformed HD game type recovers explicit embedded mode only", () => {
  const malformed = "(<Version.HD: 19>, 'VER 9.4', 12.5, 4, None)";
  const row = (type: string) => ({
    game_type: malformed, key_events: { settings: { type } },
  });
  assert.equal(resolveLeaderboardReplayMode(row("RM")), "rm");
  assert.equal(resolveLeaderboardReplayMode(row("DM")), "dm");
  assert.equal(resolveLeaderboardReplayMode(row("TurboRandom9")), null);
  assert.equal(resolveLeaderboardReplayMode(row("Unknown")), null);
  assert.equal(resolveLeaderboardReplayMode({
    game_type: "Unknown", key_events: { settings: { type: "RM" } },
  }), "rm");
});

test("explicit custom or contradictory types cannot be reassigned", () => {
  for (const raw of ["TurboRandom9", "Regicide", "Scenario", "HD game type 8"]) {
    assert.equal(resolveLeaderboardReplayMode({
      game_type: raw, key_events: { settings: { type: "RM" } },
    }), null);
  }
  assert.equal(resolveLeaderboardReplayMode({
    game_type: "RM", key_events: { settings: { type: "DM" } },
  }), null);
  assert.equal(resolveLeaderboardReplayMode({
    game_type: "Unknown", key_events: { settings: { type: "DM" }, type: "RM" },
  }), null);
});
