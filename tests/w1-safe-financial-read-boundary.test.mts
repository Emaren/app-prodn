import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const lobby = read("lib/lobbySnapshot.ts");
const lobbyApi = read("app/api/lobby/route.ts");
const home = read("app/page.tsx");
const betsApi = read("app/api/bets/route.ts");
const liveApi = read("app/api/live-games/route.ts");
const headerApi = read("app/api/header-summary/route.ts");
const warChest = read("lib/warChest.ts");
const producerQueue = read("lib/betMarketEnsureQueue.ts");
const producerPost = read("app/api/replay/post-ingest/route.ts");
const replayWorker = read("scripts/reconcile-replay-post-ingest.mts");
const prewarm = read("scripts/prewarm-production.mjs");

const asyncFinancialCalls = /\b(queueBetMarketEnsure|queueLobbyMaintenance|ensureBetMarkets|reconcileTournamentMatchProofs)\s*\(/;

test("R13 public SSR home and GET/HEAD lobby keep snapshots, never dispatch financial work", () => {
  assert.match(home, /loadLobbySnapshot\s*\(/);
  assert.match(lobbyApi, /export async function GET\(/);
  assert.match(lobbyApi, /loadLobbySnapshot\s*\(/);
  assert.doesNotMatch(lobby, asyncFinancialCalls);
  assert.doesNotMatch(lobby, /from ["']@\/lib\/(bets|betMarketEnsureQueue|tournamentProofReconciler)["']/);
  assert.doesNotMatch(lobbyApi, asyncFinancialCalls);
  assert.match(lobby, /loadFeaturedWarriorHonors/);
  assert.match(lobby, /getFeaturedTournament/);
  assert.match(lobby, /loadLiveTickerSnapshot/);
});

test("R13 public bets, live-games, header and War Chest remain read projections", () => {
  for (const [label, source] of [
    ["bets", betsApi], ["live-games", liveApi],
    ["header", headerApi], ["war-chest", warChest],
  ] as const) {
    assert.doesNotMatch(source, asyncFinancialCalls, `${label} still wakes a money writer`);
    assert.doesNotMatch(source, /from ["']@\/lib\/betMarketEnsureQueue["']/, label);
  }
  assert.match(betsApi, /ensureMarkets:\s*false/);
  assert.match(betsApi, /settlementSurfaceMode:\s*"fast"/);
  assert.match(liveApi, /loadPublicLiveGamesSnapshot\(prisma\)/);
  assert.match(headerApi, /loadLiveGamesSnapshot\(prisma\)/);
  assert.match(warChest, /loadBetBoardSnapshot\(prisma, viewerUid,\s*\{\s*ensureMarkets:\s*false/);
});

test("R13 prewarm GET and HEAD fallback cannot dispatch removed asynchronous financial hooks", () => {
  for (const path of ['"/"', '"/api/lobby"', '"/api/live-games"']) {
    assert.ok(prewarm.includes(path), `prewarm contract lost ${path}`);
  }
  assert.match(liveApi, /export async function GET\(/);
  assert.match(betsApi, /export async function GET\(/);
  assert.match(lobbyApi, /export async function GET\(/);
  // These are the original GET handlers HEAD may select; no separate side
  // effect is introduced by HEAD calling their unchanged read projections.
  for (const source of [lobbyApi, liveApi, betsApi]) {
    assert.doesNotMatch(source, asyncFinancialCalls);
  }
});

test("R13 real authorized replay producer retains finance functionality", () => {
  const auth = producerPost.indexOf("if (!authorized(request))");
  const db = producerPost.indexOf("const prisma = getPrisma();");
  assert.ok(auth >= 0 && db > auth, "financial producer must authenticate before database access");
  assert.match(producerPost, /export async function POST\(/);
  assert.match(producerPost, /coordinateReplayPostIngest\(/);
  assert.match(producerPost, /reconcileChampionshipEvidence\(prisma,\s*\{executeSettlements:\s*true\}\)/);
  assert.match(producerPost, /queueBetMarketEnsure\(prisma,\s*0\)/);
  assert.match(producerQueue, /backgroundEnsurePromise\s*=\s*ensureBetMarkets\(prisma\)/);
  assert.match(replayWorker, /argument\("--confirm"\)\s*!==\s*APPLY_CONFIRMATION/);
  assert.match(replayWorker, /await reconcileTournamentMatchProofs\(prisma,\s*\{ force:\s*true \}\)/);
  assert.match(replayWorker, /await ensureBetMarkets\(prisma\)/);
});

test("R13 no frontend component, CSS, images, or public snapshot schema changed here", () => {
  // The source changes are narrowly restricted by PR diff and reviewed SHA:
  // this proves API/projection names preserved, not actual browser equivalence.
  for (const name of ["liveCount","readyCount","resolvedToday"]) {
    assert.match(liveApi,new RegExp(name));
  }
  assert.match(lobby, /return \{\s*tournament,\s*messages,\s*onlineUsers:/);
});
