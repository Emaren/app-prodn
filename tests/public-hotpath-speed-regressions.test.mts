import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public hot paths keep expensive work off request-critical rails", () => {
  const staking = readFileSync("app/staking/page.tsx", "utf8");
  const warChest = readFileSync("lib/warChest.ts", "utf8");
  const players = readFileSync("app/players/page.tsx", "utf8");
  const directory = readFileSync("lib/publicPlayerDirectory.ts", "utf8");
  const academy = readFileSync("app/academy/page.tsx", "utf8");
  const betDetail = readFileSync("app/bets/[marketId]/page.tsx", "utf8");
  const observatory = readFileSync("lib/parserObservatory.ts", "utf8");

  assert.match(staking, /const overviewPromise = Promise\.allSettled/);
  assert.match(staking, /async function StakingTrustRail/);
  assert.match(staking, /<Suspense fallback=\{<StakingTrustRailFallback \/>\}>/);
  assert.match(staking, /totalStakedWolo=\{snapshot\.totalStakedWolo\}/);
  assert.doesNotMatch(staking, /const trustRailPromise = Promise\.all/);
  assert.doesNotMatch(staking, /Promise\.all\(\[overviewPromise, trustRailPromise\]\)/);

  assert.match(warChest, /const weeklyWagerWhere = visibleMainnetWagerWhere/);
  assert.match(warChest, /prisma\.betWager\.groupBy\(\{\s*by: \["userId"\]/);
  assert.match(
    warChest,
    /prisma\.betWager\.groupBy\(\{\s*by: \["marketId", "side"\],[\s\S]*?where: weeklyWagerWhere/,
  );
  assert.match(
    warChest,
    /volumeWolo: matchedVolumeFromSideTotals\(weeklyMatchedSideTotals\)/,
  );
  assert.match(
    warChest,
    /totalWageredWolo: matchedVolumeFromSideTotals\(lifetimeMatchedSideTotals\)/,
  );
  assert.doesNotMatch(warChest, /weeklyWagerSummary\._sum\.amountWolo/);
  assert.doesNotMatch(warChest, /const \[\s*weeklyWagers,/);
  assert.doesNotMatch(warChest, /weeklyWagers\.reduce/);

  assert.match(players, /loadPublicPlayerDirectoryGeneration\(prisma\)/);
  assert.match(players, /loadPublicPlayerDirectory\(\s*prisma,\s*initialGeneration/);
  assert.doesNotMatch(players, /loadPublicPlayerDirectoryFresh/);
  assert.match(directory, /replayGeneration: string \| null/);
  assert.match(directory, /publicPlayerDirectoryPromises/);
  assert.match(directory, /overlayPublicPlayerDirectoryLiveState/);
  assert.match(directory, /includePresence\?: boolean/);
  assert.doesNotMatch(directory, /PLAYER_DIRECTORY_CACHE_TTL_MS/);

  assert.match(academy, /prisma\.replayPlayerSnapshot\.count/);
  assert.match(academy, /ZODIAC_TRAINING_CONFIG\.userId/);
  assert.doesNotMatch(academy, /loadClaimedPlayerPreview/);

  assert.match(betDetail, /const prefetchedMarketActivity =/);
  assert.match(betDetail, /loadBetMarketActivity\(prisma, numericMarketId\)/);
  assert.match(
    betDetail,
    /prefetchedMarketActivity \?\?[\s\S]*loadBetMarketActivity\(prisma, market\.id\)/,
  );

  assert.doesNotMatch(observatory, /from "node:fs\/promises"/);
  assert.doesNotMatch(observatory, /recursive: true/);
  assert.doesNotMatch(observatory, /loadPhysicalReplayArchiveSnapshot/);
  assert.match(observatory, /Physical archive enumeration is an operator\/background responsibility/);
});


test("player directory overlaps independent generation enrichment reads", () => {
  const directory = readFileSync(
    "lib/publicPlayerDirectory.ts",
    "utf8",
  );

  const communityStart = directory.indexOf(
    "const communityMapPromise",
  );
  const canonicalStart = directory.indexOf(
    "const canonicalSnapshotsPromise",
  );
  const pendingGiftStart = directory.indexOf(
    "const pendingGiftByUserUidPromise",
  );
  const join = directory.indexOf(
    "] = await Promise.all([",
    pendingGiftStart,
  );

  assert.ok(communityStart >= 0);
  assert.ok(canonicalStart > communityStart);
  assert.ok(pendingGiftStart > canonicalStart);
  assert.ok(join > pendingGiftStart);

  const concurrentBlock = directory.slice(
    communityStart,
    join + 320,
  );

  assert.match(
    concurrentBlock,
    /communityMapPromise,[\s\S]*canonicalSnapshotsPromise,[\s\S]*pendingGiftByUserUidPromise/,
  );
  assert.doesNotMatch(
    directory.slice(
      communityStart,
      pendingGiftStart,
    ),
    /const communityMap = await/,
  );
  assert.doesNotMatch(
    directory.slice(
      canonicalStart,
      pendingGiftStart,
    ),
    /canonicalSnapshots\s*=\s*[\s\S]*?await prisma\.replayPlayerSnapshot/,
  );
});

test("player profile overlaps optional claim and community rails", () => {
  const profile = readFileSync(
    "lib/playerProfile.ts",
    "utf8",
  );

  const buildStart = profile.indexOf(
    "async function buildProfileFromPlayer",
  );
  const buildEnd = profile.indexOf(
    "async function resolveProfileDirectoryIdentity",
    buildStart,
  );
  assert.ok(buildStart >= 0);
  assert.ok(buildEnd > buildStart);

  const build = profile.slice(
    buildStart,
    buildEnd,
  );

  assert.match(
    profile,
    /async function safeLoadUserCommunitySummary/,
  );
  assert.match(
    build,
    /\[\s*pendingClaimSummaries,\s*community,\s*\] = await Promise\.all\(\[/,
  );
  assert.match(
    build,
    /safeLoadPendingWoloClaimSummaries\([\s\S]*safeLoadUserCommunitySummary\(/,
  );
  assert.doesNotMatch(
    build,
    /const pendingClaimSummaries = await safeLoadPendingWoloClaimSummaries/,
  );
  assert.doesNotMatch(
    build,
    /community = \(await loadUserCommunitySummaries/,
  );

  const safeCommunityStart = profile.indexOf(
    "async function safeLoadUserCommunitySummary",
  );
  const safeCommunityEnd = profile.indexOf(
    "function normalizeKey",
    safeCommunityStart,
  );
  const safeCommunity = profile.slice(
    safeCommunityStart,
    safeCommunityEnd,
  );

  assert.match(
    safeCommunity,
    /isMissingPrismaStorageError/,
  );
  assert.match(
    safeCommunity,
    /warnOptionalProfileRail\(\s*"community honor"/,
  );
  assert.match(
    safeCommunity,
    /return empty/,
  );
});


test("lobby cold snapshot starts independent authorities before joining them", () => {
  const lobby = readFileSync(
    "lib/lobbySnapshot.ts",
    "utf8",
  );

  const freshStart = lobby.indexOf(
    "async function loadLobbySnapshotFresh",
  );
  const freshEnd = lobby.indexOf(
    "type LobbySnapshotCacheEntry",
    freshStart,
  );
  assert.ok(freshStart >= 0);
  assert.ok(freshEnd > freshStart);

  const fresh = lobby.slice(
    freshStart,
    freshEnd,
  );

  for (const promise of [
    "woloPromise",
    "woloMarketPromise",
    "tournamentPromise",
    "presencePromise",
    "recentMatchesPromise",
    "leaderboardPromise",
    "woloEarnersPromise",
    "aoe2hdPulsePromise",
    "featuredWarriorHonorsPromise",
    "tournamentMessagesPromise",
  ]) {
    assert.match(
      fresh,
      new RegExp(`const ${promise}`),
    );
  }

  assert.match(
    fresh,
    /await Promise\.all\(\[[\s\S]*woloPromise[\s\S]*tournamentPromise[\s\S]*leaderboardPromise/,
  );
  assert.doesNotMatch(
    fresh,
    /const \[wolo, woloMarket\] = await Promise\.all[\s\S]*const tournament = await/,
  );
});

test("live games batches completed uploader hydration into one query", () => {
  const liveGames = readFileSync(
    "lib/liveGames.ts",
    "utf8",
  );

  const hydrateStart = liveGames.indexOf(
    "async function hydrateCompletedSessionUploaders",
  );
  const hydrateEnd = liveGames.indexOf(
    "export async function loadLiveGamesSnapshotFresh",
    hydrateStart,
  );
  assert.ok(hydrateStart >= 0);
  assert.ok(hydrateEnd > hydrateStart);

  const hydrate = liveGames.slice(
    hydrateStart,
    hydrateEnd,
  );

  assert.match(
    hydrate,
    /const targets = sessions\.flatMap/,
  );
  assert.match(
    hydrate,
    /with candidates\(candidate_index, anchor_at, player_names\) as/,
  );
  assert.equal(
    (hydrate.match(/\$queryRawUnsafe/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(
    hydrate,
    /for \(const session of sessions\)/,
  );
});
