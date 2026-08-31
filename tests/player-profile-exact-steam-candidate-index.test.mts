import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { selectVisibleExactSteamAliases } from "../lib/playerProfileExactSteam.ts";

const source = readFileSync(
  "lib/playerProfile.ts",
  "utf8",
);

test("exact-Steam profile history uses the accepted replay snapshot index", () => {
  assert.match(
    source,
    /async function loadExactSteamCandidateIndex\([\s\S]*?prisma\.replayPlayerSnapshot\.findMany\([\s\S]*?playerKey:\s*`steam:\$\{steamId\}`[\s\S]*?projectionStatus:\s*"accepted"[\s\S]*?affectsPublicAggregates:\s*true[\s\S]*?supersededBy:\s*null[\s\S]*?gameStatsId:\s*true[\s\S]*?displayName:\s*true/,
  );

  assert.match(
    source,
    /loadCandidateFinalGamesFresh\([\s\S]*?gameStatsIds\?: number\[\][\s\S]*?id:\s*\{[\s\S]*?in:\s*gameStatsIds/,
  );
});

test("snapshot candidates do not replace GameStats public truth or exact participant verification", () => {
  assert.match(
    source,
    /cleanPublicGameRows\(/,
  );

  assert.match(
    source,
    /currentPlayerRecord\(game,\s*currentPlayer\)/,
  );

  assert.match(
    source,
    /GameStats public cleanup \+ exact participant matching remain the game/,
  );
});

test("historical exact-Steam aliases require membership in the cleaned profile corpus", () => {
  const aliases = selectVisibleExactSteamAliases(
    [
      { gameStatsId: 10, displayName: "Old Name" },
      { gameStatsId: 11, displayName: "Rejected Name" },
      { gameStatsId: 12, displayName: " old name " },
      { gameStatsId: 12, displayName: "Newest Name" },
    ],
    [10, 12],
  );

  assert.deepEqual(aliases, ["Old Name", "Newest Name"]);
  assert.match(
    source,
    /selectVisibleExactSteamAliases\([\s\S]*?exactSteamIndex\.snapshots[\s\S]*?candidateGames\.map\(\(game\) => game\.id\)/,
  );
});

test("empty or unavailable snapshot candidates fail back to the whole-estate loader", () => {
  assert.match(
    source,
    /candidateGameIds[\s\S]*?candidateGameIds\.length > 0[\s\S]*?loadCandidateFinalGamesFresh\([\s\S]*?candidateGameIds[\s\S]*?loadPlayerProfileReplayCorpus/,
  );
});

test("both full profile and paginated match feed pass canonical player identity into candidate loading", () => {
  assert.match(
    source,
    /loadCandidateFinalGames\([\s\S]*?matchFeedGeneration,[\s\S]*?input\.currentPlayer/,
  );

  assert.match(
    source,
    /loadCandidateFinalGames\([\s\S]*?generation,[\s\S]*?currentPlayer,[\s\S]*?\),[\s\S]*?currentPlayer/,
  );
});
