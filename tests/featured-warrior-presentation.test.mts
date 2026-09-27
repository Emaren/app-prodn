import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  featuredWarriorBestRank,
  featuredWarriorHonorLabel,
} from "../lib/featuredWarriorPresentation.ts";

function source(path: string) {
  return readFileSync(
    new URL(`../${path}`, import.meta.url),
    "utf8"
  );
}

test("featured warriors display the better canonical RM or DM placement", () => {
  assert.equal(
    featuredWarriorBestRank(46, 3),
    3
  );
  assert.equal(
    featuredWarriorBestRank(2, 21),
    2
  );
  assert.equal(
    featuredWarriorBestRank(null, 7),
    7
  );
  assert.equal(
    featuredWarriorBestRank(undefined, null),
    null
  );
  assert.equal(
    featuredWarriorBestRank(0, -2, Number.NaN),
    null
  );
});

test("featured championship labels preserve public wording", () => {
  assert.equal(
    featuredWarriorHonorLabel(
      "usa_champion_belt",
      "USA Champion"
    ),
    "American Champion"
  );
  assert.equal(
    featuredWarriorHonorLabel(
      "chaos_champion",
      "AoE2WAR Chaos Champion Belt"
    ),
    "Chaos Champion"
  );
  assert.equal(
    featuredWarriorHonorLabel(
      "mexico_champion_belt",
      "Mexican Champion"
    ),
    "Mexican Champion"
  );
});

test("featured warrior cards bind live titles, rank and avatar revisions", () => {
  const home = source("app/HomePageClient.tsx");
  const lobby = source("lib/lobby.ts");
  const leaderboard = source("lib/lobbyLeaderboard.ts");
  const directory = source("lib/publicPlayerDirectory.ts");
  const snapshot = source("lib/lobbySnapshot.ts");
  const avatars = source("lib/avatarAssets.ts");

  assert.match(
    home,
    /warrior\.featuredRank\s*\?\?\s*warrior\.rank/
  );
  assert.match(
    leaderboard,
    /featuredWarriorBestRank\([\s\S]*featuredRmRankByKey[\s\S]*featuredDmRankByKey/
  );
  assert.match(
    lobby,
    /featuredWarriorHonors\?: LobbyFeaturedWarriorHonor\[\]/
  );
  assert.match(
    home,
    /featuredWarriorHonorTitles\([\s\S]*lobby\?\.featuredWarriorHonors/
  );
  assert.doesNotMatch(
    home,
    /role:\s*"Chaos Champion"/
  );
  assert.doesNotMatch(
    home,
    /role:\s*"American Champion"/
  );

  assert.match(
    directory,
    /featuredAvatarRevision:\s*string \| null/
  );
  assert.match(
    directory,
    /asset\.updatedAt\.getTime\(\)/
  );
  assert.match(
    leaderboard,
    /featuredAvatarRevision:\s*entry\.featuredAvatarRevision/
  );
  assert.match(
    avatars,
    /featuredAvatarCardUrlForUser[\s\S]*revision\?: string \| number \| null[\s\S]*"rev"/
  );
  assert.match(
    home,
    /leaderboardEntry\.featuredAvatarRevision/
  );

  assert.match(
    snapshot,
    /status:\s*\{[\s\S]*in:\s*\["held", "active"\]/
  );
  assert.match(
    snapshot,
    /featuredWarriorHonorLabel/
  );
  assert.match(
    snapshot,
    /featuredWarriorHonors/
  );
});

test("WOLO unit-price surfaces use six decimal places", () => {
  const sources = [
    source("components/lobby/WoloMarketExtremeTile.tsx"),
    source("components/lobby/WoloMarketExtremeTileCurrent.tsx"),
    source("components/lobby/WoloMarketTileLegacy.tsx"),
    source("lib/liveTicker.ts"),
  ];

  for (const current of sources) {
    assert.doesNotMatch(
      current,
      /toFixed\(7\)|next < 1 \? 7 : 2/
    );
  }

  assert.match(
    sources[0],
    /next < 1 \? 6 : 2/
  );
  assert.match(
    sources[1],
    /next < 1 \? 6 : 2/
  );
  assert.match(
    sources[2],
    /toFixed\(6\)/
  );
  assert.match(
    sources[3],
    /toFixed\(6\)/
  );
});

test("admin avatar and trophy writes invalidate featured-warrior projections", () => {
  const cache = source("lib/featuredWarriorCache.ts");
  const routes = [
    source("app/api/admin/media-assets/set-user-featured-avatar/route.ts"),
    source("app/api/admin/media-assets/assign-user-avatar/route.ts"),
    source("app/api/admin/media-assets/assign-user-assets/route.ts"),
    source("app/api/admin/trophies/route.ts"),
  ];

  assert.match(
    cache,
    /invalidatePublicPlayerDirectoryCache\(\)/
  );
  assert.match(
    cache,
    /invalidateLobbyLeaderboardCache\(\)/
  );
  assert.match(
    cache,
    /invalidateLobbySnapshotCache\(\)/
  );

  for (const route of routes) {
    assert.match(
      route,
      /invalidateFeaturedWarriorProjectionCaches\(\)/
    );
  }
});
