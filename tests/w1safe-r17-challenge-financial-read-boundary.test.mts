/** R17 independent B proof: never settle challenge money/title from public reads.
 * Source contract only. No HTTP request, DB write, custody or staking action.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
const challenge = read("lib/challenges.ts");
const live = read("lib/liveGames.ts");
const publicLive = read("lib/liveGamesPublicSnapshot.ts");
const liveApi = read("app/api/live-games/route.ts");
const livePage = read("app/live-games/page.tsx");
const header = read("app/api/header-summary/route.ts");
const prewarm = read("scripts/prewarm-production.mjs");
const reconcile = read("app/api/challenges/reconcile/route.ts");
const timer = read("deploy/aoe2hdbets-challenge-reconcile.timer");
const service = read("deploy/aoe2hdbets-challenge-reconcile.service");
const runner = read("scripts/run-challenge-reconciliation.mjs");
const scripts = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
const championship = read("lib/championshipChallenges.ts");

function section(start: string, end: string) {
  const begin = challenge.indexOf(start);
  const stop = challenge.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && stop > begin, "missing function boundary: " + start);
  return challenge.slice(begin, stop);
}

test("public Live Games SSR, GET/HEAD, header and prewarm share a projection-only scheduled match loader", () => {
  assert.match(livePage, /loadPublicLiveGamesSnapshot\s*\(/);
  assert.match(liveApi, /export async function GET\s*\(/);
  assert.match(liveApi, /loadPublicLiveGamesSnapshot\s*\(/);
  assert.match(header, /loadLiveGamesSnapshot\s*\(prisma\)/);
  assert.match(publicLive, /loadLiveGamesSnapshotFresh\s*\(prisma\)/);
  assert.match(live, /loadScheduledMatchTilesForLiveBoard\s*\(/);
  assert.match(prewarm, /"\/api\/live-games"/);
  const source = section("export async function loadScheduledMatchTilesForLiveBoard(", "export async function loadChallengeThreadTiles(");
  assert.match(source, /loadScheduledMatchRows\s*\(prisma\)/);
  assert.match(source, /deriveScheduledMatchTiles\s*\(/);
  assert.doesNotMatch(source, /\bpersistScheduledMatchResults\s*\(/);
  assert.doesNotMatch(source, /\breconcileChampionshipEvidence\s*\(/);
  assert.doesNotMatch(source, /prisma\.\w+\.(?:create|update|upsert|delete|updateMany)\s*\(/);
});

test("Challenge contact/thread public read does not wake title or escrow reconciliation", () => {
  const source = challenge.slice(challenge.indexOf("export async function loadChallengeThreadTiles("));
  assert.match(source, /loadScheduledMatchRows\s*\(/);
  assert.doesNotMatch(source, /\bpersistScheduledMatchResults\s*\(/);
  assert.doesNotMatch(source, /\breconcileChampionshipEvidence\s*\(/);
});

test("Challenge Hall and exact challenge GET readers cannot mutate settlement/title state", () => {
  const detail = section("export async function loadChallengeTileById(", "export async function loadChallengeHubSnapshot(");
  const hall = challenge.slice(challenge.indexOf("export async function loadChallengeHubSnapshot("));
  assert.match(detail, /loadScheduledMatchRows\s*\(/);
  assert.match(hall, /loadChallengeHistoryRows\s*\(/);
  assert.doesNotMatch(detail, /\bpersistScheduledMatchResults\s*\(/);
  assert.doesNotMatch(hall, /\bpersistScheduledMatchResults\s*\(/);
  assert.doesNotMatch(hall, /\breconcileChampionshipEvidence\s*\(/);
  const allCalls = [...challenge.matchAll(/\bpersistScheduledMatchResults\s*\(/g)];
  assert.equal(allCalls.length, 2, "only original function definition and authenticated producer may retain this settlement-capable call");
});

test("authenticated five-minute Challenge POST retains original real replay/title writer", () => {
  assert.match(timer, /OnUnitActiveSec=5min/);
  assert.match(service, /Type=oneshot/);
  assert.match(service, /User=tony/);
  assert.match(service, /ExecStart=\/usr\/bin\/npm run challenge:reconcile/);
  assert.equal(scripts.scripts["challenge:reconcile"], "node scripts/run-challenge-reconciliation.mjs");
  assert.match(runner, /CHALLENGE_RECONCILE_TOKEN/);
  assert.match(runner, /if \(!token\)/);
  assert.match(runner, /method:\s*"POST"/);
  assert.match(runner, /new URL\("\/api\/challenges\/reconcile"/);
  assert.match(reconcile, /export async function POST\s*\(/);
  assert.match(reconcile, /tokensEqual\s*\(suppliedToken,\s*runToken\)/);
  assert.match(reconcile, /await requireAdmin\s*\(request\)/);
  const gate = reconcile.indexOf("if (!(runToken && tokensEqual(suppliedToken, runToken)))");
  const producer = reconcile.indexOf("await reconcileScheduledMatchResultsForAuthorizedProducer(prisma)");
  assert.ok(gate >= 0 && producer > gate, "mutation must remain behind established run-token/admin gate");
  assert.match(reconcile.slice(producer), /await reconcileChallengeLifecycle\s*\(prisma/);
  const source = section("export async function reconcileScheduledMatchResultsForAuthorizedProducer(", "export async function loadScheduledMatchTilesForLiveBoard(");
  assert.match(source, /\bpersistScheduledMatchResults\s*\(/);
  assert.match(source, /\bloadLiveSessionSnapshot\s*\(/);
  assert.match(challenge, /if\(rows\.some\(row=>row\.protocolVersion===CHAMPIONSHIP_PROTOCOL_VERSION\)\) await reconcileChampionshipEvidence\(prisma\)/);
  assert.match(challenge, /await prisma\.scheduledMatch\.update(?:Many)?\s*\(/);
  assert.match(championship, /await transitionChampionshipCustody\s*\(/);
});

test("producer triggers before expiry reconciliation, not through public GET/HEAD", () => {
  const producer = reconcile.indexOf("await reconcileScheduledMatchResultsForAuthorizedProducer(prisma)");
  const expiry = reconcile.indexOf("await reconcileChallengeLifecycle(prisma");
  assert.ok(producer >= 0 && expiry > producer);
  assert.doesNotMatch(liveApi, /reconcileChampionshipEvidence|persistScheduledMatchResults/);
});
