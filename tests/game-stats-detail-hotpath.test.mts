import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/game-stats/[id]/page.tsx", "utf8");

test("replay detail overlaps independent evidence and identity reads", () => {
  const parallelStart = page.indexOf("] = await Promise.all([");
  const parallelEnd = page.indexOf("  ]);", parallelStart);
  const parallelBlock = page.slice(parallelStart, parallelEnd);

  assert.ok(parallelStart > 0);
  assert.match(parallelBlock, /verifySession/);
  assert.match(parallelBlock, /replayResultAdjudication\.findMany/);
  assert.match(parallelBlock, /loadReplayDesyncIncidentProvenance/);
  assert.match(parallelBlock, /replayParseAttempt\.findMany/);
  assert.match(parallelBlock, /betMarket\.findFirst/);
  assert.match(parallelBlock, /findClaimedUsersForReplayNames/);
  assert.match(parallelBlock, /loadRecentFinalMatchupRows/);
});

test("replay detail publishes readiness only after its server evidence resolves", () => {
  const marker = page.indexOf('<SpeedReadyMarker route={`/game-stats/${game.id}`} />');
  const parallelEnd = page.indexOf("  ]);", page.indexOf("] = await Promise.all(["));

  assert.ok(marker > parallelEnd);
});
