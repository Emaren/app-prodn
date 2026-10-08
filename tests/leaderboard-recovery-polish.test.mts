import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("ranked rows prefer truthful Steam rating presentation before Site Elo", () => {
  const leaderboard = source("lib/lobbyLeaderboard.ts");

  assert.match(
    leaderboard,
    /resolveLeaderboardRatingPresentation/,
  );
  assert.match(
    leaderboard,
    /lastKnownSteamRmRating/,
  );
  assert.match(
    leaderboard,
    /lastKnownSteamDmRating/,
  );
  assert.match(
    leaderboard,
    /latestHistoricalSteamLaneRating/,
  );
});
test("Columns command only highlights while its popover is open", () => {
  const living = source("components/leaderboard/LivingLeaderboard.tsx");

  const start = living.indexOf('"Columns · custom"');
  const block = living.slice(Math.max(0, start - 260), start + 180);

  assert.match(block, /active=\{columnsOpen\}/);
  assert.match(block, /"Columns · custom"/);
  assert.doesNotMatch(block, /columnsOpen \|\|/);
});

test("Watcher logo bypasses the image optimizer cache", () => {
  const watcher = source("components/leaderboard/LeaderboardWatcherCard.tsx");

  assert.match(
    watcher,
    /src="\/watcher\/aoe2hd-watcher-logo\.webp"[\s\S]{0,120}unoptimized/,
  );
});
