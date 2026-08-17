import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const router = readFileSync(
  "lib/kingdomKnowledgeRouter.ts",
  "utf8",
);

const profile = readFileSync(
  "lib/playerProfile.ts",
  "utf8",
);

function sliceBetween(
  source: string,
  startToken: string,
  endToken: string,
) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  return source.slice(start, end);
}

function pairFastPath() {
  return sliceBetween(
    router,
    "async function loadTargetedPairSharedSnapshotArchive(",
    "\nasync function loadTargetedPairArchive(",
  );
}

function sharedHydrationHelper() {
  return sliceBetween(
    profile,
    "export async function loadPlayerProfileMatchPagesForPlayersAndGameIds(",
    "\nexport async function loadPlayerProfileMatchPageForGameIds(",
  );
}

test("pair fast path batches both claimed-name resolution and both exact-Steam snapshot estates", () => {
  const source = pairFastPath();

  assert.match(
    source,
    /findClaimedUsersForReplayNames\([\s\S]*?queryTerms/,
  );

  assert.match(
    source,
    /replayPlayerSnapshot\.findMany\([\s\S]*?playerKey:\s*\{[\s\S]*?in:\s*playerKeys/,
  );

  assert.match(
    source,
    /select:\s*\{[\s\S]*?playerKey:\s*true,[\s\S]*?gameStatsId:\s*true/,
  );

  assert.doesNotMatch(
    source,
    /loadPlayerProfileMatchPageForGameIds\(/,
  );
});

test("shared candidate GameStats are hydrated exactly once and reused for both exact players", () => {
  const source =
    sharedHydrationHelper();

  assert.match(
    source,
    /const\s+generationPromise\s*=[\s\S]*?loadPublicReplayGeneration\s*\(\s*prisma\s*,?\s*\)/,
  );

  assert.match(
    source,
    /const\s+candidateGamesPromise\s*=[\s\S]*?loadCandidateFinalGamesFresh\s*\(/,
  );

  assert.match(
    source,
    /Promise\.all\s*\(\s*\[\s*generationPromise\s*,\s*candidateGamesPromise\s*,?\s*\]\s*\)/,
  );

  assert.equal(
    (
      source.match(
        /loadCandidateFinalGamesFresh\s*\(/g,
      ) ?? []
    ).length,
    1,
  );

  assert.match(
    source,
    /currentPlayers\s*\.\s*map\s*\([\s\S]*?filterGamesForPlayer\s*\(\s*candidateGames\s*,\s*currentPlayer\s*,?\s*\)/,
  );
});

test("shared hydration still ends in canonical GameStats cleanup and exact participant matching", () => {
  const helper =
    sharedHydrationHelper();

  assert.match(
    helper,
    /filterGamesForPlayer\([\s\S]*?candidateGames[\s\S]*?currentPlayer/,
  );

  assert.match(
    profile,
    /cleanPublicGameRows\(/,
  );

  assert.match(
    profile,
    /currentPlayerRecord\(game,\s*currentPlayer\)/,
  );

  assert.match(
    pairFastPath(),
    /shared GameStats rows are hydrated once, then exact participant truth is evaluated independently/,
  );
});

test("failure still falls through to the existing whole-archive canonical pair path", () => {
  const source =
    pairFastPath();

  assert.match(
    source,
    /catch\s*(?:\([^)]*\))?\s*\{[\s\S]*?return null/,
  );

  assert.match(
    router,
    /if \(sharedSnapshotArchive\) \{[\s\S]*?return sharedSnapshotArchive;[\s\S]*?const pages = await Promise\.all/,
  );
});
