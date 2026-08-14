import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  playerMatchFeedNextCursor,
  playerMatchFeedRefreshDepth,
} from "../lib/playerMatchFeedPagination.ts";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("player replay generation is lightweight, coalesced, and no-store", () => {
  const generation = source("../lib/publicReplayGeneration.ts");
  const route = source("../app/api/players/generation/route.ts");

  assert.match(generation, /PUBLIC_REPLAY_GENERATION_CACHE_MS\s*=\s*1_000/);
  assert.match(generation, /prisma\.gameStats\.findFirst/);
  assert.match(generation, /prisma\.replayStatProjection\.findFirst/);
  assert.match(generation, /prisma\.replayPlayerSnapshot\.findFirst/);
  assert.match(generation, /prisma\.replayResultAdjudication\.findFirst/);
  assert.match(generation, /jsonb_agg/);
  assert.match(generation, /users\.in_game_name/);
  assert.match(generation, /users\.steam_persona_name/);
  assert.match(generation, /users\.verification_level/);
  assert.doesNotMatch(generation, /users\.last_seen/);
  assert.doesNotMatch(generation, /gameStats\.findMany/);
  assert.match(route, /dynamic\s*=\s*"force-dynamic"/);
  assert.match(route, /revalidate\s*=\s*0/);
  assert.match(route, /no-store, no-cache, must-revalidate, max-age=0/);
});

test("open player directory refreshes only after a five-second generation change", () => {
  const boundary = source(
    "../components/players/PlayerDirectoryRealtimeRefresh.tsx",
  );
  const page = source("../app/players/page.tsx");

  assert.match(boundary, /PLAYER_DIRECTORY_REFRESH_MS\s*=\s*5_000/);
  assert.match(boundary, /\/api\/players\/generation\?refresh=/);
  assert.match(boundary, /renderedGenerationRef/);
  assert.match(boundary, /requestedGenerationRef/);
  assert.match(boundary, /requestSequenceRef/);
  assert.match(boundary, /router\.refresh\(\)/);
  assert.match(boundary, /addEventListener\("focus"/);
  assert.match(boundary, /visibilitychange/);
  assert.match(page, /loadPublicPlayerDirectoryFresh\(prisma\)/);
  assert.match(page, /PlayerDirectoryRealtimeRefresh initialGeneration=/);
});

test("profile cursor zero is authoritative and archive loads are generation-safe", () => {
  const client = source("../components/players/PlayerMatchFeedClient.tsx");
  const profileRefresh = source(
    "../components/players/PlayerProfileRealtimeRefresh.tsx",
  );
  const profilePage = source("../components/players/PlayerProfilePage.tsx");
  const profile = source("../lib/playerProfile.ts");
  const route = source("../app/api/player-profile/matches/route.ts");

  assert.match(profileRefresh, /PLAYER_PROFILE_REFRESH_MS\s*=\s*5_000/);
  assert.match(profileRefresh, /router\.refresh\(\)/);
  assert.match(profileRefresh, /addEventListener\("focus"/);
  assert.match(profileRefresh, /visibilitychange/);
  assert.match(profilePage, /PlayerProfileRealtimeRefresh/);
  assert.match(profilePage, /initialGeneration=\{profile\.matchFeed\.generation\}/);
  assert.match(client, /playerMatchFeedRefreshDepth/);
  assert.match(client, /PLAYER_MATCH_FEED_RECONCILE_BATCH_SIZE/);
  assert.match(client, /buildFeedUrl\(identity, cursor, batchLimit\)/);
  assert.match(client, /applyAuthoritativePrefix/);
  assert.match(client, /reconcilingRef/);
  assert.match(client, /appliedGenerationRef/);
  assert.match(client, /initialGeneration === appliedGenerationRef\.current/);
  assert.match(client, /requestDataGeneration !== dataGenerationRef\.current/);
  assert.match(client, /responseGeneration !== appliedGenerationRef\.current/);
  assert.doesNotMatch(client, /\/api\/players\/generation\?refresh=/);
  assert.match(profile, /const matchFeedGeneration = await loadPublicReplayGeneration\(prisma\)/);
  assert.match(profile, /createGenerationKeyedLoader/);
  assert.match(profile, /loadCandidateFinalGames\(\s*prisma,\s*matchFeedGeneration/);
  assert.match(profile, /loadCandidateFinalGames\(prisma, generation\)/);
  assert.match(profile, /Math\.min\(\s*PLAYER_MATCH_FEED_RECONCILE_BATCH_SIZE/);
  assert.match(profile, /generation,/);
  assert.match(route, /revalidate\s*=\s*0/);
  assert.match(route, /no-store, no-cache, must-revalidate, max-age=0/);
});

test("head insertion cannot strand the old match-feed page boundary", () => {
  const previouslyLoaded = Array.from(
    { length: 36 },
    (_, index) => ({ id: index + 1 }),
  );
  const authoritativeArchive = [
    { id: 999 },
    ...previouslyLoaded,
  ];
  const refreshDepth = playerMatchFeedRefreshDepth({
    currentlyLoaded: previouslyLoaded.length,
    initialWindow: 18,
    nextTotal: authoritativeArchive.length,
    previousTotal: previouslyLoaded.length,
  });
  const refreshedPrefix = authoritativeArchive.slice(0, refreshDepth);

  assert.equal(refreshDepth, 37);
  assert.equal(
    refreshedPrefix.some((row) => row.id === 18),
    true,
    "the old #18 row must move to offset 18, not disappear",
  );
  assert.deepEqual(
    refreshedPrefix.map((row) => row.id),
    [999, ...previouslyLoaded.map((row) => row.id)],
  );
  assert.equal(
    playerMatchFeedNextCursor(
      refreshedPrefix.length,
      authoritativeArchive.length,
    ),
    null,
  );
});
