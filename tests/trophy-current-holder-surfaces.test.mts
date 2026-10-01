import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { trophyIsPubliclyForcedVacant } from "../lib/trophies/service.ts";

test("Trophy ids resolve through current-season forced vacancy policy", () => {
  assert.equal(trophyIsPubliclyForcedVacant("world_champion"), true);
  assert.equal(trophyIsPubliclyForcedVacant("world"), true);
  assert.equal(trophyIsPubliclyForcedVacant("uk_champion_belt"), true);
  assert.equal(trophyIsPubliclyForcedVacant("national-uk"), true);

  assert.equal(trophyIsPubliclyForcedVacant("usa_champion_belt"), false);
  assert.equal(trophyIsPubliclyForcedVacant("national-usa"), false);
  assert.equal(trophyIsPubliclyForcedVacant(null), false);
});

test("profile holdings use public bootstrap and exclude forced-vacant historical custody", () => {
  const service = readFileSync(
    new URL("../lib/trophies/service.ts", import.meta.url),
    "utf8"
  );

  const start = service.indexOf("export async function loadUserTrophyHoldings");
  const end = service.indexOf("export async function recordNationalityChange", start);
  assert.ok(start >= 0);
  assert.ok(end > start);

  const holdings = service.slice(start, end);
  assert.match(holdings, /await ensurePublicTrophySeedData\(prisma\)/);
  assert.doesNotMatch(holdings, /await ensureTrophySeedData\(prisma\)/);
  assert.match(holdings,/await loadPublicTrophies\(prisma\)/);
  assert.match(holdings,/championshipRoster\?\.some\(member=>member\.userId === userId\)/);
  assert.match(
    holdings,
    /\.filter\(\(trophy\) => trophy\.hasExplicitChampionshipCustody \|\| !trophyIsPubliclyForcedVacant\(trophy\.trophyId\)\)/
  );
});

test("nationality audit ignores titles that are season-forced vacant", () => {
  const service = readFileSync(
    new URL("../lib/trophies/service.ts", import.meta.url),
    "utf8"
  );

  const start = service.indexOf("export async function recordNationalityChange");
  const end = service.indexOf("export function seededTrophyDefinition", start);
  assert.ok(start >= 0);
  assert.ok(end > start);

  const audit = service.slice(start, end);
  assert.match(audit, /family: "national"/);
  assert.match(audit, /currentHolderUserId: input\.userId/);
  assert.match(
    audit,
    /\.filter\(\(trophy\) => !trophyIsPubliclyForcedVacant\(trophy\.trophyId\)\)/
  );
  assert.match(audit, /NATIONAL_ELIGIBILITY_FORFEITURE_NEEDED/);
});

test("human-facing Trophy honor surfaces consume forced-vacancy authority", () => {
  const meRoute = readFileSync(
    new URL("../app/api/user/me/route.ts", import.meta.url),
    "utf8"
  );
  const playerProfile = readFileSync(
    new URL("../components/players/PlayerProfilePage.tsx", import.meta.url),
    "utf8"
  );
  const lobby = readFileSync(
    new URL("../lib/lobbySnapshot.ts", import.meta.url),
    "utf8"
  );

  assert.match(meRoute, /trophyIsPubliclyForcedVacant\(title\.id\)/);
  assert.match(playerProfile, /trophyIsPubliclyForcedVacant\(trophy\.trophyId\)/);
  assert.match(lobby, /trophyIsPubliclyForcedVacant\(trophy\.trophyId\)/);

  assert.match(playerProfile,/loadPublicTrophies\(getPrisma\(\)\)/);
  assert.match(playerProfile,/championshipRoster\?\.some/);
  assert.match(playerProfile,/!trophy\.hasExplicitChampionshipCustody && trophyIsPubliclyForcedVacant/);
  assert.match(lobby,/loadPublicTrophies\(prisma\)/);
  assert.match(lobby,/championshipRoster\.map/);
  assert.match(lobby,/!trophy\.hasExplicitChampionshipCustody && trophyIsPubliclyForcedVacant/);
  assert.match(playerProfile, /currentHolderDisplayName/);
  assert.match(playerProfile, /guardianHolderDisplayName/);
  assert.match(lobby, /featuredWarriorHonorLabel/);
});
