import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
const loader = read("lib/lobbyLeaderboard.ts");
const rating = read("lib/leaderboardRating.ts");
const table = read("components/leaderboard/LivingLeaderboardTable.tsx");
const page = read("app/leaderboard/page.tsx");
const route = read("app/api/lobby/leaderboard/route.ts");

test("both RM and DM retain all public identities after system exclusions", () => {
  const start = loader.indexOf("function buildLeaderboardSelection(");
  const end = loader.indexOf("type LeaderboardIdentityLookup", start);
  assert.ok(start >= 0 && end > start);
  const selection = loader.slice(start, end);
  assert.match(selection, /const scopedEntries =/);
  assert.match(selection, /scope === "claimed"/);
  assert.match(selection, /const unratedEntries = scopedEntries\s*\.filter\(\(entry\) => !canRankLeaderboardLane\(entry, lane\)\)/);
  assert.match(selection, /const defaultOrderedEntries = \[\s*\.\.\.rankedEntries,\s*\.\.\.unratedEntries,/);
  assert.match(selection, /fullEntryCount: searchableEntries\.length/);
  assert.doesNotMatch(selection, /const defaultOrderedEntries = \[\s*\.\.\.rankedEntries,\s*\.\.\.pendingClaimedEntries/);
});

test("rated rank ordering and all unrated positions are retained without pretending to be Steam ratings", () => {
  assert.match(loader, /rankedEntries\.forEach\(\(entry, index\) => \{/);
  assert.match(loader, /unratedEntries\.forEach\(\(entry, index\) => \{\s*rankByKey\.set\(entry\.key, rankedEntries\.length \+ index \+ 1\)/);
  assert.match(loader, /ratedCount: rankedEntries\.length/);
  assert.match(loader, /rankedPlayers: ratedCount/);
  assert.match(loader, /entry\.identityKind === "steam" \? 0/);
  assert.match(loader, /entry\.identityKind === "name" \? 1 : 2/);
});

test("unrated rows display a dash instead of a fabricated numerical rank or Elo", () => {
  assert.ok((table.match(/entry\.primaryRating === null \? "—"/g) ?? []).length >= 4);
  assert.match(rating, /value: null,\s*source: "profile"/);
  assert.doesNotMatch(rating, /value: Math\.round\(input\.siteElo/);
});

test("historic and current trusted Steam ratings display the same RM or DM heading", () => {
  assert.match(rating, /source: "last_known_steam"/);
  assert.match(rating, /source: "current_steam"/);
  assert.equal((rating.match(/\? "DM Rating"\s*: "RM Rating"/g) ?? []).length, 2);
  assert.doesNotMatch(rating, /\? "Last DM"\s*: "Last RM"/);
});

test("strict pagination and system exclusions remain enforced", () => {
  assert.match(loader, /!isLeaderboardExcludedSystemUid\(entry\.uid\)/);
  assert.match(page, /includePendingClaimed:\s*false/);
  assert.match(route, /includePendingClaimed:\s*false/);
  assert.match(route, /hasMore:[\s\S]*nextOffset < leaderboard\.trackedPlayers/);
  assert.match(loader, /trackedPlayers: fullEntryCount/);
});
