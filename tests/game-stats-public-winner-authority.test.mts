import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL(
    "../app/game-stats/[id]/page.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("game detail binds winner presentation to the shared public-result resolver", () => {
  const start = page.indexOf(
    "const reliableWinner = resolveReliableReplayWinner",
  );
  const end = page.indexOf(
    "const replayFilename =",
    start,
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const block = page.slice(start, end);

  assert.match(
    block,
    /parseSource:\s*game\.parse_source/,
  );
  assert.match(
    block,
    /isFinal:\s*game\.is_final/,
  );
  assert.match(
    block,
    /disconnectDetected:\s*game\.disconnect_detected/,
  );
  assert.match(
    block,
    /const publicWinnerLabel =[\s\S]*reliableWinner/,
  );
});

test("game detail cannot manufacture a public winner from raw player flags", () => {
  const start = page.indexOf(
    "const reliableWinner = resolveReliableReplayWinner",
  );
  const end = page.indexOf(
    "const replayFilename =",
    start,
  );

  const block = page.slice(start, end);

  assert.doesNotMatch(
    block,
    /winningPlayerNames/,
  );
  assert.doesNotMatch(
    block,
    /player\.winner === true/,
  );
  assert.doesNotMatch(
    block,
    /player\.winner === "true"/,
  );
  assert.doesNotMatch(
    block,
    /player\.winner === 1/,
  );
});
