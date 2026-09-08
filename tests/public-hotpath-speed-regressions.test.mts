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
  assert.match(warChest, /weeklyWagerSummary\._sum\.amountWolo/);
  assert.doesNotMatch(warChest, /const \[\s*weeklyWagers,/);
  assert.doesNotMatch(warChest, /weeklyWagers\.reduce/);

  assert.match(players, /loadPublicPlayerDirectory\(\s*prisma,\s*initialGeneration/);
  assert.doesNotMatch(players, /loadPublicPlayerDirectoryFresh/);
  assert.match(directory, /replayGeneration: string \| null/);
  assert.match(directory, /publicPlayerDirectoryPromises/);
  assert.match(directory, /cacheMatchesGeneration/);

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
