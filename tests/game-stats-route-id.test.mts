import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseGameStatsRouteId } from "../app/game-stats/[id]/parseGameStatsRouteId.ts";

test("Replay detail accepts only safe decimal positive Postgres Int IDs", () => {
  const valid: Array<[string, number]> = [
    ["1", 1],
    ["01", 1], // Preserve existing zero-padded links.
    ["000000001", 1],
    ["12345", 12345],
    ["2147483647", 2147483647],
  ];

  for (const [raw, expected] of valid) {
    assert.equal(parseGameStatsRouteId(raw), expected, raw);
  }

  const invalid = [
    "", "0", "00", "-1", "+1", " 1", "1 ", "1\n", "1.0",
    "1e3", "0x10", "0b11", "0o7", "Infinity", "NaN", "1_000",
    "2147483648", "9007199254740992", "999999999999999999999999999999",
    "1".repeat(65), "abc", "1/../../admin",
  ];
  for (const raw of invalid) {
    assert.equal(parseGameStatsRouteId(raw), null, JSON.stringify(raw));
  }
});

test("Page refuses invalid IDs with notFound before any Prisma request", () => {
  const page = readFileSync("app/game-stats/[id]/page.tsx", "utf8");

  assert.match(page, /const gameId = parseGameStatsRouteId\(id\);/);
  assert.match(page, /if \(gameId === null\) \{\s*notFound\(\);/);
  assert.ok(
    page.indexOf("if (gameId === null)") < page.indexOf("const prisma = getPrisma();"),
    "route ID is validated before database lookup",
  );
  assert.doesNotMatch(page, /const gameId = Number\(id\)/);
  assert.match(page, /resolveReliableReplayWinner/);
  assert.match(page, /applyReplayAdjudicationToGameStats/);
});
