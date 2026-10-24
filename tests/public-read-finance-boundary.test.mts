import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
function source(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}
const projections = [
  "lib/lobbySnapshot.ts",
  "app/api/live-games/route.ts",
  "app/api/bets/route.ts",
  "app/api/header-summary/route.ts",
  "lib/warChest.ts",
] as const;

test("public reads cannot directly enqueue settlement-capable work", () => {
  for (const path of projections) {
    const code = source(path);
    assert.doesNotMatch(code, /queueBetMarketEnsure\s*\(/, path);
    assert.doesNotMatch(code, /ensureBetMarkets\s*\(/, path);
    assert.doesNotMatch(code, /queueLobbyMaintenance\s*\(/, path);
    assert.doesNotMatch(code, /reconcileTournamentMatchProofs\s*\(/, path);
  }
});

test("authenticated replay post-ingest retains explicit private financial capability after auth", () => {
  const post = source("app/api/replay/post-ingest/route.ts");
  const auth = post.indexOf("if (!authorized(request))");
  const admission = post.indexOf("await coordinateReplayPostIngest(");
  assert.ok(auth >= 0, "post-ingest must authenticate first");
  assert.ok(admission > auth, "awaited event admission must follow authentication");
  const privateQueue = post.indexOf("queueBetMarketEnsure(prisma, 0)");
  assert.ok(privateQueue > auth, "existing private reconciliation remains behind auth");
  assert.match(post, /admission: report\.admission/);
  assert.match(post, /internalApiKeyMatches/);
});

test("public readers retain their projection and non-mutating board contract", () => {
  assert.match(source("app/api/bets/route.ts"), /ensureMarkets: false/);
  assert.match(source("lib/warChest.ts"), /ensureMarkets: false/);
  assert.match(source("app/api/live-games/route.ts"), /loadPublicLiveGamesSnapshot/);
  assert.match(source("lib/lobbySnapshot.ts"), /loadLobbySnapshotFresh/);
});

