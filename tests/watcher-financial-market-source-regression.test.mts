import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const bets = fs.readFileSync(new URL("../lib/bets.ts", import.meta.url), "utf8");
const liveGames = fs.readFileSync(new URL("../lib/liveGames.ts", import.meta.url), "utf8");
const liveSessions = fs.readFileSync(new URL("../lib/liveSessionSnapshot.ts", import.meta.url), "utf8");

test("bet-market discovery consumes canonical replay sessions, not public presentation fallbacks", () => {
  assert.match(
    bets,
    /const sessionSnapshot = await loadLiveSessionSnapshot\(prisma\)/
  );
  assert.doesNotMatch(
    bets,
    /import[^\n]*loadLiveGamesSnapshotFresh/
  );
  assert.doesNotMatch(
    bets,
    /await loadLiveGamesSnapshotFresh\(prisma\)/
  );
});

test("public recent-outcome fallback sessions are explicitly nonfinancial", () => {
  assert.match(
    liveGames,
    /synthesized from the public\/archive presentation surface[\s\S]*bettingEligible: false/
  );
});

test("canonical watcher sessions carry replay betting eligibility into market discovery", () => {
  assert.match(
    liveSessions,
    /bettingEligible: winnerTruth\.bettingEligible/
  );
  assert.match(
    bets,
    /watcherSessionCanSeedSettledWinnerMarket\(session\)/
  );
});

test("detached final reconciliation preserves explicit disconnect truth", () => {
  assert.match(
    bets,
    /disconnect_detected: true/
  );
  assert.match(
    bets,
    /finalGame\.disconnect_detected \|\|/
  );
});

test("market seeds carry only exact live-session promotion aliases", () => {
  assert.match(
    bets,
    /identityAliases:\s*\[\.\.\.new Set\(session\.identityAliases \?\? \[\]\)\]/
  );
  assert.match(
    bets,
    /filter\([\s\S]*alias !== normalizeName\(session\.sessionKey\)[\s\S]*sort\(\(left, right\) => left\.localeCompare\(right\)\)/
  );
});

test("exact identity promotion precedes public numbering and all market upserts", () => {
  const desyncSeedIndex = bets.indexOf("const desyncSeeds =");
  const promotionIndex = bets.indexOf(
    "await reconcileWatcherMarketIdentityPromotions(prisma, seeds)"
  );
  const blockedFilterIndex = bets.indexOf(
    "if (blockedPromotionSessionKeys.size > 0)",
    promotionIndex
  );
  const numberingIndex = bets.indexOf(
    "const battleIdentities = await ensurePublicBattleIdentities",
    promotionIndex
  );
  const reconciledIndex = bets.indexOf(
    "const reconciledSessionKeys =",
    blockedFilterIndex
  );
  const upsertIndex = bets.indexOf("tx.betMarket.upsert", numberingIndex);

  assert.ok(desyncSeedIndex >= 0);
  assert.ok(promotionIndex > desyncSeedIndex);
  assert.ok(blockedFilterIndex > promotionIndex);
  assert.ok(numberingIndex > blockedFilterIndex);
  assert.ok(reconciledIndex > numberingIndex);
  assert.ok(upsertIndex > reconciledIndex);
});

test("ambiguous promotion aborts its complete seed family and unexpected errors propagate", () => {
  assert.match(
    bets,
    /blockedPromotionSessionKeys\.has\([\s\S]*normalizeName\(seed\.linkedSessionKey\)[\s\S]*\)/
  );
  assert.match(
    bets,
    /const blockedPromotionSessionKeys =\s*await reconcileWatcherMarketIdentityPromotions\(prisma, seeds\)/
  );
  assert.doesNotMatch(
    bets,
    /try\s*\{\s*const blockedPromotionSessionKeys =\s*await reconcileWatcherMarketIdentityPromotions/
  );
});

test("promotion and stale seed upserts share exact advisory identity locks", () => {
  assert.match(
    bets,
    /for \(const identityKey of identityKeys\)[\s\S]*pg_advisory_xact_lock\(hashtextextended\(\$\{identityKey\}, 0\)\)/
  );
  assert.match(
    bets,
    /seeds\.map\(async \(seed\) => \{[\s\S]*prisma\.\$transaction\(async \(tx\)[\s\S]*canonicalBattleIdentityKey\(normalizeName\(seed\.linkedSessionKey\)\)[\s\S]*pg_advisory_xact_lock[\s\S]*tx\.betMarket\.upsert/
  );
});

test("candidate slug collisions include scheduled or unrelated owners and fail closed", () => {
  assert.match(
    bets,
    /OR:\s*\[[\s\S]*scheduledMatchId: null,[\s\S]*linkedSessionKey: \{ in: exactSessionKeys \}[\s\S]*slug: \{ in: candidateSlugs \}/
  );
  assert.match(
    bets,
    /market\.scheduledMatchId !== null \|\|\s*!exactSessionKeySet\.has/
  );
});
