import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { RESTRICTED_PUBLIC_REPLAY_SELECT } from "../lib/restrictedPublicReplay.ts";

const page = readFileSync("app/game-stats/[id]/page.tsx", "utf8");
const view = readFileSync("components/game-stats/RestrictedPublicReplayDetail.tsx", "utf8");

test("restricted replay read contract is an exact, reviewed scalar-only GameStats projection", () => {
  assert.deepEqual(Object.keys(RESTRICTED_PUBLIC_REPLAY_SELECT).sort(), [
    "createdAt", "duration", "game_duration", "game_type", "game_version",
    "id", "is_final", "map", "played_on", "players", "timestamp", "winner",
  ]);
  assert.ok(Object.values(RESTRICTED_PUBLIC_REPLAY_SELECT).every((value) => value === true));
  assert.doesNotMatch(Object.keys(RESTRICTED_PUBLIC_REPLAY_SELECT).join(" "), /uid|hash|bet|market|user|relation|adjudicat|engine|projection|finance/i);
});

test("R25 restricted guard dispatches before original Prisma query and nested private relations", () => {
  const guard = page.indexOf("if (isNonfinancialPublicReadProfile())");
  const originalQuery = page.indexOf("const rawGame = await prisma.gameStats.findUnique");
  assert.ok(guard > 0 && originalQuery > guard, "restricted guard must precede private relation query");
  assert.match(page, /return <RestrictedPublicReplayDetail gameId=\{gameId\} \/>/);
  assert.match(view, /select: RESTRICTED_PUBLIC_REPLAY_SELECT/);
  assert.doesNotMatch(view, /\b(include|\$queryRaw|\$executeRaw|create|update|delete|upsert|transaction):/);
});

test("restricted replay clearly distinguishes missing private evidence from absence or settlement", () => {
  assert.match(view, /data-public-read-model="unavailable"/);
  assert.match(view, /does not mean there are no cases, no bets, or no obligations/);
  assert.match(view, /not\s+independently verified adjudication or settlement finality/);
  assert.doesNotMatch(view, /verified winner|paid out|settlement complete/i);
});
