import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("DM ranked rows fall back to site Elo instead of permanent Pending", () => {
  const leaderboard = source("lib/lobbyLeaderboard.ts");

  const primaryStart = leaderboard.indexOf("function getPrimaryRatingValue");
  const primaryEnd = leaderboard.indexOf("function compareLeaderboardEntries", primaryStart);
  const primary = leaderboard.slice(primaryStart, primaryEnd);

  assert.match(primary, /if \(!hasTrackedHistory\(entry\)\) \{\s*return null;/);
  assert.match(primary, /return entry\.arenaElo;/);
  assert.doesNotMatch(primary, /lane === "dm"[\s\S]*return null/);

  const sourceLabelStart = leaderboard.indexOf("function buildPrimaryRatingSourceLabel");
  const sourceLabelEnd = leaderboard.indexOf("function buildSecondaryRatingLabel", sourceLabelStart);
  const sourceLabel = leaderboard.slice(sourceLabelStart, sourceLabelEnd);

  assert.match(sourceLabel, /hasLaneRating\(entry, lane\)/);
  assert.match(sourceLabel, /return hasTrackedHistory\(entry\) \? "Site Elo" : "Profile";/);
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
