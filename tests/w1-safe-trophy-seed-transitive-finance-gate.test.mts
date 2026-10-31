/** R16 independent transitive financial-writer gate for W1_SAFE.
 * Intentionally red against the original SHA until F removes public-read
 * implicit trophy economics writes. This test performs NO DB/HTTP/chain I/O.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}
const lobby = source("lib/lobbySnapshot.ts");
const trophy = source("lib/trophies/service.ts");
const home = source("app/page.tsx");
const lobbyRoute = source("app/api/lobby/route.ts");
const prewarm = source("scripts/prewarm-production.mjs");
const replay = source("app/api/replay/post-ingest/route.ts");
const admin = source("app/api/admin/trophies/route.ts");

test("W1_SAFE SSR/GET/HEAD/prewarm must not write trophy economics through a public loader", () => {
  assert.match(home, /loadLobbySnapshot\s*\(/);
  assert.match(lobbyRoute, /export async function GET\s*\(/);
  assert.match(lobbyRoute, /loadLobbySnapshot\s*\(/);
  assert.match(prewarm, /"\/"|\x27\/\x27/);
  assert.match(prewarm, /"\/api\/lobby"/);
  assert.match(lobby, /loadFeaturedWarriorHonors\s*\(prisma\)/);
  assert.match(lobby, /loadPublicTrophies\s*\(prisma\)/);
  assert.match(trophy, /export async function loadPublicTrophies\s*\(/);
  const start = trophy.indexOf("function ensurePublicTrophySeedData(");
  const stop = trophy.indexOf("async function loadRatings(", start);
  assert.ok(start >= 0 && stop > start, "public trophy seed helper is not inspected");
  const publicReadHelper = trophy.slice(start, stop);
  assert.doesNotMatch(
    publicReadHelper,
    /\bensureTrophySeedData\s*\(prisma\)/,
    "P0: public landing/lobby GET+HEAD/prewarm can reach trophy economics/event/badge writers"
  );
});

test("removing financial work from public reads must retain an authenticated trophy seed producer", () => {
  assert.match(trophy, /export async function ensureTrophySeedData\s*\(/);
  assert.match(trophy, /prisma\.trophyEconomicsVersion\.create\s*\(/);
  assert.match(trophy, /prisma\.trophyEvent\.create\s*\(/);
  assert.match(admin, /requireAdmin/);
  assert.match(admin, /ensureTrophySeedData\s*\(/);
});

test("replay-ingest market producer stays authenticated without public GET wakeups", () => {
  const auth = replay.indexOf("if (!authorized(request))");
  const db = replay.indexOf("const prisma = getPrisma()");
  assert.ok(auth >= 0 && db > auth);
  assert.match(replay, /export async function POST\s*\(/);
  assert.match(replay, /coordinateReplayPostIngest\s*\(/);
  assert.match(replay, /queueBetMarketEnsure\s*\(prisma,\s*0\)/);
});

test("authenticated replay auto-recovery must wake market reconciliation after terminal adjudication", () => {
  const recovery = source("app/api/admin/replay-auto-recovery/route.ts");
  const adjudication = source("lib/replayResultAdjudications.ts");
  assert.match(recovery, /export async function POST\s*\(/);
  assert.match(recovery, /!\s*authorized\s*\(request\)/);
  assert.match(recovery, /reconcileAutomaticWatcherTerminalResults\s*\(/);
  assert.doesNotMatch(adjudication, /\bensureBetMarkets(AfterCommit)?\s*\(/);
  assert.match(
    recovery,
    /\b(?:ensureBetMarkets(?:AfterCommit)?|queueBetMarketEnsure)\s*\(/,
    "P0: authenticated periodic replay recovery can resolve terminal results without ensuring eligible markets"
  );
});
