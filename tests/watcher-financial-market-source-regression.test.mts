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
