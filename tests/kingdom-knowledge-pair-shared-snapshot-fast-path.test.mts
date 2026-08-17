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

function pairFastPath() {
  const start = router.indexOf(
    "async function loadTargetedPairSharedSnapshotArchive(",
  );
  const end = router.indexOf(
    "\nasync function loadTargetedPairArchive(",
    start,
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  return router.slice(start, end);
}

test("targeted exact-Steam pair routing intersects snapshot game IDs before shared GameStats hydration", () => {
  const source = pairFastPath();

  const snapshotLookup =
    source.indexOf(
      "replayPlayerSnapshot.findMany",
    );
  const sharedIds =
    source.indexOf(
      "sharedGameStatsIds",
      snapshotLookup,
    );
  const sharedHydration =
    source.indexOf(
      "loadPlayerProfileMatchPagesForPlayersAndGameIds(",
      sharedIds,
    );

  assert.notEqual(snapshotLookup, -1);
  assert.notEqual(sharedIds, -1);
  assert.notEqual(sharedHydration, -1);

  assert.ok(
    snapshotLookup < sharedIds,
  );
  assert.ok(
    sharedIds < sharedHydration,
  );
});

test("shared snapshot candidates remain locators while GameStats truth and exact participant verification remain authoritative", () => {
  assert.match(
    profile,
    /loadPlayerProfileMatchPagesForPlayersAndGameIds\(/,
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
    /Exact Steam snapshots narrow shared candidate IDs first/,
  );
});

test("empty or failed snapshot rails preserve the old canonical pair archive fallback", () => {
  const source = pairFastPath();

  assert.match(
    source,
    /perPlayerSets\.some\([\s\S]*?snapshotSet\.size === 0[\s\S]*?return null/,
  );

  assert.match(
    source,
    /catch\s*(?:\([^)]*\))?\s*\{[\s\S]*?return null/,
  );

  assert.match(
    router,
    /if \(sharedSnapshotArchive\) \{[\s\S]*?return sharedSnapshotArchive;[\s\S]*?const pages = await Promise\.all/,
  );
});

test("pair fast path is production-only and shadow canonical behavior remains unchanged", () => {
  const source = pairFastPath();

  assert.match(
    source,
    /isShadowMode\(\)[\s\S]*?return null/,
  );

  assert.match(
    router,
    /\/api\/lobby\/leaderboard\?limit=40&q=\$\{encodeURIComponent\(queryPlayer\)\}/,
  );
});
