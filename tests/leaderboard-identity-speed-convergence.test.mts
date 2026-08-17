import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("claimed names are stable while latest replay aliases remain observable", () => {
  const source =
    readFileSync(
      "lib/publicPlayerDirectory.ts",
      "utf8",
    );

  const latest =
    source.indexOf(
      "entry.latestObservedName",
    );
  const guard =
    source.indexOf(
      "if (!entry.claimed)",
      latest,
    );
  const write =
    source.indexOf(
      "entry.name = replayName",
      latest,
    );

  assert.ok(latest >= 0);
  assert.ok(guard > latest);
  assert.ok(write > guard);
});

test("player profile and paginated match feed use consolidated directory aliases", () => {
  const source =
    readFileSync(
      "lib/playerProfile.ts",
      "utf8",
    );

  assert.match(
    source,
    /loadPublicPlayerDirectory/,
  );
  assert.match(
    source,
    /resolveProfileDirectoryIdentity/,
  );
  assert.match(
    source,
    /directoryEntry\?\.aliases/,
  );
  assert.match(
    source,
    /withProfileAliases/,
  );
  assert.match(
    source,
    /directoryEntry\?\.claimed/,
  );
});

test("server renders the remembered leaderboard lane", () => {
  const lane =
    readFileSync(
      "lib/leaderboardLane.ts",
      "utf8",
    );
  const page =
    readFileSync(
      "app/leaderboard/page.tsx",
      "utf8",
    );

  assert.match(
    lane,
    /LEADERBOARD_LANE_COOKIE_KEY/,
  );
  assert.match(
    lane,
    /document\.cookie/,
  );
  assert.match(
    page,
    /const preferredLane/,
  );
  assert.match(
    page,
    /lane:\s*preferredLane/,
  );
  assert.doesNotMatch(
    page,
    /lane:\s*"rm"/,
  );
});

test("player directory and leaderboard share the same raw replay corpus", () => {
  const directory =
    readFileSync(
      "lib/publicPlayerDirectory.ts",
      "utf8",
    );
  const leaderboard =
    readFileSync(
      "lib/lobbyLeaderboard.ts",
      "utf8",
    );
  const corpus =
    readFileSync(
      "lib/publicLeaderboardGameCorpus.ts",
      "utf8",
    );

  assert.match(
    directory,
    /loadPublicLeaderboardRawGames\(prisma\)/,
  );
  assert.match(
    leaderboard,
    /loadPublicLeaderboardRawGames/,
  );
  assert.match(
    corpus,
    /rawCorpusCache/,
  );
  assert.match(
    corpus,
    /prisma\.gameStats\.findMany/,
  );
});

test("leaderboard variants share one processed corpus", () => {
  const source =
    readFileSync(
      "lib/lobbyLeaderboard.ts",
      "utf8",
    );

  assert.match(
    source,
    /loadLeaderboardGameCorpus/,
  );
  assert.match(
    source,
    /leaderboardGameCorpusCache/,
  );
  assert.match(
    source,
    /loadLeaderboardGameCorpus\(prisma\)/,
  );
  assert.match(
    source,
    /export function invalidateLobbyLeaderboardCache/,
  );
});

test("accepted replay identity changes invalidate every leaderboard cache layer", () => {
  const source =
    readFileSync(
      "lib/replayIdentityProjection.ts",
      "utf8",
    );

  assert.match(
    source,
    /invalidatePublicLeaderboardRawGameCache\(\)/,
  );
  assert.match(
    source,
    /invalidatePublicPlayerDirectoryCache\(\)/,
  );
  assert.match(
    source,
    /invalidateLobbyLeaderboardCache\(\)/,
  );
});


test("leaderboard search isolates historical composite aliases", () => {
  const source =
    readFileSync(
      "lib/lobbyLeaderboard.ts",
      "utf8",
    );

  assert.match(
    source,
    /matchesPublicPlayerSearch/,
  );

  assert.doesNotMatch(
    source,
    /matchesLeaderboardSearch\(/,
  );
});
