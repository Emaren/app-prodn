import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync("app/champions/page.tsx", "utf8");
const experience = fs.readFileSync("components/champions/ChampionsV2Experience.tsx", "utf8");
const state = fs.readFileSync("lib/champions/championsV2.ts", "utf8");
const policy = fs.readFileSync("lib/champions/championshipPolicy.ts", "utf8");
const titles = fs.readFileSync("lib/champions/titles.ts", "utf8");
const titleState = fs.readFileSync("lib/champions/titleState.ts", "utf8");
const trophyService = fs.readFileSync("lib/trophies/service.ts", "utf8");
const shell = fs.readFileSync("app/AppShell.tsx", "utf8");

test("Champions V2 replaces the legacy page shell", () => {
  assert.match(page, /ChampionsV2Experience/);
  assert.match(page, /loadChampionsV2State/);
  assert.doesNotMatch(page, /function PodiumCard/);
  assert.doesNotMatch(page, /function TagTeamCard/);
});

test("World and UK are explicitly vacant public titles", () => {
  const world = titles.slice(titles.indexOf('id: "world"'), titles.indexOf('id: "chaos"'));
  const uk = titles.slice(titles.indexOf('id: "national-uk"'), titles.indexOf("export const eloTitles"));
  assert.match(world, /status: "vacant"/);
  assert.match(world, /holders: \[\]/);
  assert.doesNotMatch(world, /name: "Sniper"/);
  assert.match(uk, /status: "vacant"/);
  assert.match(uk, /holders: \[\]/);
  assert.doesNotMatch(uk, /name: "Sniper"/);
  assert.match(policy, /"world"/);
  assert.match(policy, /"national-uk"/);
  assert.match(titleState, /titleIsPubliclyForcedVacant/);
});

test("current championship summary and tribute rail are exact", () => {
  assert.match(policy, /CHAMPIONS_V2_ACTIVE_COUNT = 4/);
  assert.match(policy, /CHAMPIONS_V2_VACANT_COUNT = 18/);
  assert.match(policy, /CHAMPIONS_V2_TRIBUTE_POOL_WOLO = 45/);
  for (const trophyId of ["canada_champion_belt", "usa_champion_belt", "mexico_champion_belt", "chaos_champion"]) {
    assert.ok(policy.includes(trophyId));
  }
  assert.match(trophyService, /ACTIVE_REIGN_TRIBUTE_TROPHY_IDS/);
  assert.match(trophyService, /trophyHasActiveReignTribute/);
});

test("Chaos contender queue is Watcher-activity driven and excludes the holder", () => {
  assert.match(state, /watcher_client_events/);
  assert.match(state, /api_keys/);
  assert.match(state, /streamed_games/);
  assert.match(state, /hasWatcher/);
  assert.match(state, /excludedIdentities/);
  assert.match(state, /Watcher ·/);
});

test("World contender queue alternates explicit RM and DM ladders", () => {
  assert.match(state, /function alternatingWorldContenders/);
  assert.match(state, /steamRmRating/);
  assert.match(state, /steamDmRating/);
  assert.match(state, /lane = lane === "rm" \? "dm" : "rm"/);
  assert.match(state, /dmTop > rmTop/);
});

test("RM and DM crowns each expose top-ten lane contenders", () => {
  assert.match(state, /rmChampion: modeChampion\("rm", rmContenders\)/);
  assert.match(state, /dmChampion: modeChampion\("dm", dmContenders\)/);
  assert.match(experience, /Top ten by/);
  assert.match(experience, /RM Champion · DM Champion/);
});

test("Women\'s championship starts with Moose without inventing an account", () => {
  assert.match(state, /name: "Moose"/);
  assert.match(state, /Invited contender · not yet registered/);
});

test("team crowns share one persistent RM DM preference", () => {
  assert.match(state, /teamTitles\("rm"\)/);
  assert.match(state, /teamTitles\("dm"\)/);
  assert.match(state, /holderSlots: size/);
  assert.match(experience, /readStoredLeaderboardLane/);
  assert.match(experience, /writeStoredLeaderboardLane/);
  assert.match(experience, /state\.teams\[lane\]/);
});

test("ELO crowns use explicit lane ratings and five bands", () => {
  assert.match(state, /lane === "dm" \? entry\.steamDmRating : entry\.steamRmRating/);
  assert.match(state, /eloTitles\.map/);
  assert.match(experience, /state\.elo\[lane\]/);
});

test("national belt hall is horizontal and locks known contender corrections", () => {
  for (const name of ["Scavanger_Ab", "Zodiac", "Sniper", "Dil Pascana", "Maxi"]) assert.ok(state.includes(name));
  for (const country of ["Brazil", "Argentina", "France", "Japan", "Taiwan", "Saudi Arabia"]) assert.ok(state.includes(`country: "${country}"`));
  assert.match(experience, /snap-x/);
  assert.match(experience, /scrollBy/);
});

test("Tournament navigation says where all the warriors go", () => {
  assert.ok(shell.includes('body: "Where all the warriors go"'));
});
