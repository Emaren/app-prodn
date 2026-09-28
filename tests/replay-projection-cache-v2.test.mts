import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) =>
  readFileSync(path, "utf8");

test("expensive public replay projections are generation-owned, not 15-second TTL-owned", () => {
  const rawCorpus = source(
    "lib/publicLeaderboardGameCorpus.ts",
  );
  const matchups = source(
    "lib/publicMatchups.ts",
  );
  const directory = source(
    "lib/publicPlayerDirectory.ts",
  );

  assert.match(
    rawCorpus,
    /createGenerationKeyedLoader/,
  );
  assert.match(
    rawCorpus,
    /loadPublicReplayGeneration/,
  );
  assert.doesNotMatch(
    rawCorpus,
    /RAW_CORPUS_TTL_MS/,
  );

  assert.match(
    matchups,
    /publicMatchupRowsCache\.generation === generation/,
  );
  assert.doesNotMatch(
    matchups,
    /PUBLIC_MATCHUP_ROWS_CACHE_TTL_MS/,
  );

  assert.match(
    directory,
    /loadPublicPlayerDirectoryGeneration/,
  );
  assert.doesNotMatch(
    directory,
    /PLAYER_DIRECTORY_CACHE_TTL_MS/,
  );
});

test("player history is cached separately from current Watcher and presence state", () => {
  const directory = source(
    "lib/publicPlayerDirectory.ts",
  );
  const generation = source(
    "lib/publicPlayerDirectoryGeneration.ts",
  );
  const ping = source(
    "app/api/user/ping/route.ts",
  );
  const session = source(
    "app/api/auth/session/route.ts",
  );

  assert.match(
    directory,
    /overlayPublicPlayerDirectoryLiveState/,
  );
  assert.match(
    directory,
    /loadPublicPresenceSnapshot/,
  );
  assert.match(
    directory,
    /loadCurrentWatcherAccountStates/,
  );
  assert.doesNotMatch(
    ping,
    /invalidatePublicPlayerDirectoryCache/,
  );
  assert.doesNotMatch(
    session,
    /invalidatePublicPlayerDirectoryCache/,
  );

  assert.match(
    generation,
    /FROM users/,
  );
  assert.match(
    generation,
    /FROM user_badges/,
  );
  assert.match(
    generation,
    /FROM user_gifts/,
  );
  assert.match(
    generation,
    /FROM managed_media_assets/,
  );
  assert.match(
    generation,
    /FROM pending_wolo_claims/,
  );
  assert.doesNotMatch(
    generation,
    /last_seen/,
  );
});

test("leaderboard returns last good projection while a changed generation refreshes", () => {
  const leaderboard = source(
    "lib/lobbyLeaderboard.ts",
  );

  assert.match(
    leaderboard,
    /LEADERBOARD_TIME_BUCKET_MS = 5 \* 60_000/,
  );
  assert.match(
    leaderboard,
    /loadLeaderboardGameCorpusByGeneration/,
  );
  assert.match(
    leaderboard,
    /void startLeaderboardRefresh/,
  );
  assert.match(
    leaderboard,
    /return options\.includePresence === false[\s\S]*cached\.value/,
  );
  assert.match(
    leaderboard,
    /projectionGeneration\?: string \| null/,
  );
  assert.doesNotMatch(
    leaderboard,
    /LEADERBOARD_CACHE_TTL_MS/,
  );
});

test("Champions overlaps independent evidence and shares one directory generation", () => {
  const champions = source(
    "lib/champions/championsV2.ts",
  );
  const titleState = source(
    "lib/champions/titleState.ts",
  );

  assert.match(
    champions,
    /loadPublicPlayerDirectoryGeneration/,
  );
  assert.match(
    champions,
    /Promise\.all\(\[[\s\S]*loadChampionTitleEconomyState[\s\S]*loadPublicPlayerDirectory[\s\S]*loadChaosActivityRows/,
  );
  assert.match(
    champions,
    /CHAOS_ACTIVITY_CACHE_TTL_MS/,
  );
  assert.match(
    titleState,
    /includePresence: false/,
  );
  assert.match(
    titleState,
    /contenderProfilePromise/,
  );
});

test("battle archive page/census projection is retained by exact replay generation", () => {
  const archive = source(
    "lib/publicBattleArchive.ts",
  );

  assert.match(
    archive,
    /loadGenerationCachedPublicBattleArchivePage/,
  );
  assert.match(
    archive,
    /loadPublicReplayGeneration/,
  );
  assert.match(
    archive,
    /archive-page-v2/,
  );
});
