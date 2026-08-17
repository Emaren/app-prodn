import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "lib/playerProfile.ts",
  "utf8",
);

test("exact-Steam profile history uses replay snapshots only as an indexed candidate locator", () => {
  assert.match(
    source,
    /async function loadExactSteamCandidateGameIds\([\s\S]*?prisma\.replayPlayerSnapshot\.findMany\([\s\S]*?playerKey:\s*`steam:\$\{steamId\}`[\s\S]*?gameStatsId:\s*true/,
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
    /ReplayPlayerSnapshot is only an indexed candidate locator here/,
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
