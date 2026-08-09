import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  authoritativePrefixDepthThroughTail,
  appendUniqueRowsById,
  replaceAuthoritativeListWindow,
} from "../lib/authoritativeListWindow.ts";
import { sliceVisibleOffsetPage } from "../lib/visibleOffsetPagination.ts";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("authoritative leading windows accept corrections and removals", () => {
  const staleWinner = { id: 1, state: "winner" };
  const staleRemoved = { id: 2, state: "review" };
  const loadedOlder = { id: 3, state: "older" };
  const corrected = { id: 1, state: "unresolved" };
  const newMatch = { id: 4, state: "new" };

  const replaced = replaceAuthoritativeListWindow(
    [staleWinner, staleRemoved, loadedOlder],
    new Set([1, 2]),
    [newMatch, corrected],
  );

  assert.deepEqual(replaced, [newMatch, corrected, loadedOlder]);
  assert.equal(replaced[1], corrected, "fresh same-ID truth must win");
  assert.equal(replaced.some((row) => row.id === 2), false);

  assert.deepEqual(
    replaceAuthoritativeListWindow(replaced, new Set([4, 1]), []),
    [loadedOlder],
    "an authoritative empty window removes the prior leading window",
  );
});

test("older-page append never overwrites the authoritative leading row", () => {
  const fresh = { id: 10, state: "fresh" };
  const staleDuplicate = { id: 10, state: "stale" };
  const older = { id: 9, state: "older" };

  const merged = appendUniqueRowsById(
    [fresh],
    [staleDuplicate, older],
  );

  assert.deepEqual(merged, [fresh, older]);
  assert.equal(merged[0], fresh);
});

test("homepage presence count and roster use one five-second snapshot", () => {
  const presenceLoader = source("../lib/publicPresence.ts");
  const presenceClient = source(
    "../components/presence/PublicPresenceProvider.tsx",
  );
  const homepage = source("../app/HomePageClient.tsx");
  const lobbySnapshot = source("../lib/lobbySnapshot.ts");
  const onlineRoute = source("../app/api/user/online_users/route.ts");

  assert.match(presenceLoader, /PUBLIC_PRESENCE_WINDOW_MS\s*=\s*2\s*\*\s*60\s*\*\s*1000/);
  assert.match(presenceClient, /PUBLIC_PRESENCE_REFRESH_MS\s*=\s*5_000/);
  assert.match(presenceClient, /visibilitychange/);
  assert.match(presenceClient, /addEventListener\("focus"/);
  assert.match(homepage, /const onlineUsers = presence\.onlineUsers/);
  assert.match(homepage, /activePlayers: presence\.activePlayers/);
  assert.match(lobbySnapshot, /loadPublicPresenceSnapshot\(prisma\)/);
  assert.match(lobbySnapshot, /onlineUsers: presence\.onlineUsers/);
  assert.match(lobbySnapshot, /activePlayers: presence\.activePlayers/);
  assert.match(onlineRoute, /loadPublicPresenceSnapshot\(getPrisma\(\)\)/);
  assert.match(onlineRoute, /no-store, no-cache, must-revalidate, max-age=0/);
});

test("players membership is complete, stable, and presence-aware", () => {
  const playersPage = source("../app/players/page.tsx");
  const directory = source("../lib/publicPlayerDirectory.ts");
  const claimedSortStart = directory.indexOf("function sortClaimedEntries");
  const claimedSortEnd = directory.indexOf(
    "function sortReplayEntries",
    claimedSortStart,
  );

  assert.ok(claimedSortStart >= 0 && claimedSortEnd > claimedSortStart);
  const claimedSort = directory.slice(claimedSortStart, claimedSortEnd);

  assert.doesNotMatch(claimedSort, /isOnline/);
  assert.match(claimedSort, /verified/);
  assert.match(claimedSort, /totalMatches/);
  assert.doesNotMatch(playersPage, /claimedEntries\.slice\(0,\s*18\)/);
  assert.match(playersPage, /directory\.claimedEntries\.map/);
  assert.match(playersPage, /PublicPresenceProvider/);
  assert.match(playersPage, /PlayerPresenceOnly/);
  assert.match(playersPage, /PlayerPresenceStatus/);
});

test("Recent Parsed Games accepts the latest five-second server truth", () => {
  const panel = source("../components/lobby/RecentMatchesPanel.tsx");

  assert.match(panel, /MATCH_FEED_REFRESH_MS\s*=\s*5_000/);
  assert.match(panel, /authoritativePrefixDepthThroughTail/);
  assert.match(panel, /MATCH_FEED_MAX_RECONCILE_EXTRA\s*=\s*96/);
  assert.match(panel, /replayGenerationRef/);
  assert.doesNotMatch(panel, /matchTruthScore/);
  assert.doesNotMatch(panel, /if \(latestMatches\.length === 0\) return/);
  assert.match(panel, /visibilitychange/);
  assert.match(panel, /addEventListener\("focus"/);
});

test("recent-match refresh preserves a 120-row archive across a new head insertion", () => {
  const loaded = Array.from(
    { length: 120 },
    (_, index) => ({ id: index + 1 }),
  );
  const latest = [{ id: 999 }, ...loaded];
  const firstBatch = latest.slice(0, 96);
  const secondBatch = latest.slice(96, 192);
  const authoritativePrefix = appendUniqueRowsById(
    firstBatch,
    secondBatch,
  );
  const authoritativeDepth =
    authoritativePrefixDepthThroughTail(
      loaded,
      authoritativePrefix,
      loaded.length,
    );
  const reconciled = authoritativePrefix.slice(
    0,
    authoritativeDepth,
  );

  assert.equal(authoritativeDepth, 121);
  assert.deepEqual(
    reconciled.map((row) => row.id),
    [999, ...loaded.map((row) => row.id)],
  );
  assert.equal(
    reconciled.some((row) => row.id === 96),
    true,
    "the row displaced across the old 96-row boundary remains loaded",
  );

  const panel = source("../components/lobby/RecentMatchesPanel.tsx");
  const route = source("../app/api/lobby/recent-matches/route.ts");

  assert.match(panel, /maximumDepth\s*=\s*minimumDepth\s*\+\s*MATCH_FEED_MAX_RECONCILE_EXTRA/);
  assert.match(panel, /offset=\$\{offset\}&limit=\$\{limit\}/);
  assert.match(panel, /nextOffsetRef\.current\s*=\s*authoritativeDepth/);
  assert.match(panel, /nextGeneration !== generation/);
  assert.match(route, /generation,/);
});

test("recent-match offsets are measured after canonical visibility filtering", () => {
  const rows = [
    { id: 101, visible: true },
    { id: 102, visible: false },
    { id: 103, visible: true },
    { id: 104, visible: false },
    { id: 105, visible: true },
    { id: 106, visible: true },
  ];
  const firstPage = sliceVisibleOffsetPage({
    rows,
    isVisible: (row) => row.visible,
    offset: 0,
    limit: 2,
  });
  const secondPage = sliceVisibleOffsetPage({
    rows,
    isVisible: (row) => row.visible,
    offset: firstPage.length,
    limit: 2,
  });

  assert.deepEqual(firstPage.map((row) => row.id), [101, 103]);
  assert.deepEqual(secondPage.map((row) => row.id), [105, 106]);
  assert.equal(
    firstPage.some((row) => secondPage.some((next) => next.id === row.id)),
    false,
  );

  const loader = source("../lib/lobbyRecentMatches.ts");
  const route = source("../app/api/lobby/recent-matches/route.ts");
  const panel = source("../components/lobby/RecentMatchesPanel.tsx");

  assert.match(loader, /sliceVisibleOffsetPage/);
  assert.match(loader, /isVisible: isPublicBattleArchiveRow/);
  assert.match(route, /limit: limit \+ 1/);
  assert.match(route, /nextOffset: offset \+ matches\.length/);
  assert.doesNotMatch(route, /\.filter\(\s*isPublicBattleArchiveRow/);
  assert.match(panel, /const offset = nextOffsetRef\.current/);
  assert.match(panel, /payload\.nextOffset/);
  assert.doesNotMatch(panel, /const offset = matchesRef\.current\.length/);
});
