import assert from "node:assert/strict";
import test from "node:test";

import { buildSessionMarketSeed } from "../lib/bets.ts";
import type { LiveGameSession } from "../lib/liveSessionSnapshot.ts";
import {
  normalizeReplayPlayers,
  resolveReplayTeams,
} from "../lib/teamResolution.ts";

function liveTwoVsOneSession(): LiveGameSession {
  const players = normalizeReplayPlayers([
    { name: "Jim", team_id: 1 },
    { name: "Emaren", team_id: 1 },
    { name: "Zodiac", team_id: 3 },
  ]);
  const teamResolution = resolveReplayTeams(players);

  return {
    id: 50001,
    sessionKey: "watcher-sep24-2v1",
    identityAliases: [],
    replayFile: null,
    replayHash: "fixture-hash",
    parseIteration: 1,
    createdAt: "2026-09-25T00:02:00.000Z",
    updatedAt: "2026-09-25T00:03:00.000Z",
    completedAt: null,
    playedOn: "2026-09-25T00:02:00.000Z",
    mapName: "FOREST FUCKERY",
    durationSeconds: 2400,
    originalFilename: "sep24-forest-fuckery.mgz",
    disconnectDetected: false,
    winner: null,
    bettingEligible: false,
    parseReason: "watcher_live",
    parseSource: "watcher_live",
    unresolvedResult: null,
    state: "live",
    finalProofPending: false,
    players,
    teamResolution,
    uploaders: [],
    watcherCount: 3,
    watcherIds: ["emaren", "jim", "zodiac"],
    watcherSessionIds: [],
    replayFingerprints: [],
    watcherVersions: ["1.6.1"],
    parseRows: 3,
    coverageLevel: "stacked",
    disposition: "live",
    uploader: null,
    reviewMarket: null,
  } as LiveGameSession;
}

test("explicit Jim + Emaren vs Zodiac 2v1 seeds a live winner market", () => {
  const session = liveTwoVsOneSession();
  assert.equal(session.teamResolution.status, "resolved");
  assert.equal(session.teamResolution.format, "2v1");
  assert.equal(session.teamResolution.teams.length, 2);

  const seed = buildSessionMarketSeed(session, -300, true);

  assert.ok(seed, "explicit 2v1 live battle must reach the betting board");
  assert.equal(seed.status, "live");
  assert.equal(seed.teamFormat, "2v1");
  assert.equal(seed.leftLabel, "Jim + Emaren");
  assert.equal(seed.rightLabel, "Zodiac");
  assert.equal(seed.leftRosterSnapshot.length, 2);
  assert.equal(seed.rightRosterSnapshot.length, 1);
  assert.ok(seed.propositionHash);
  assert.equal(seed.linkedSessionKey, "watcher-sep24-2v1");
});

test("three-player rows without explicit teams still cannot seed money markets", () => {
  const session = liveTwoVsOneSession();
  session.players = normalizeReplayPlayers([
    { name: "Jim" },
    { name: "Emaren" },
    { name: "Zodiac" },
  ]);
  session.teamResolution = resolveReplayTeams(session.players);

  assert.notEqual(session.teamResolution.status, "resolved");
  assert.equal(buildSessionMarketSeed(session, -300, true), null);
});
