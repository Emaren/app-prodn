import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync("app/champions/page.tsx", "utf8");
const experience = fs.readFileSync("components/champions/ChampionsV2Experience.tsx", "utf8");
const displayRail = fs.readFileSync("components/champions/ChampionsDisplayRail.tsx", "utf8");
const legacyPage = fs.readFileSync("app/champions/legacy/page.tsx", "utf8");
const directory = fs.readFileSync("lib/publicPlayerDirectory.ts", "utf8");
const state = fs.readFileSync("lib/champions/championsV2.ts", "utf8");
const policy = fs.readFileSync("lib/champions/championshipPolicy.ts", "utf8");
const titles = fs.readFileSync("lib/champions/titles.ts", "utf8");
const titleState = fs.readFileSync("lib/champions/titleState.ts", "utf8");
const trophyService = fs.readFileSync("lib/trophies/service.ts", "utf8");
const shell = fs.readFileSync("app/AppShell.tsx", "utf8");

test("Champions E2 is default while B A E preserves E1 behind the Extreme hover", () => {
  assert.match(page, /ChampionsV2Experience/);
  assert.match(page, /loadChampionsV2State/);
  assert.doesNotMatch(page, /function PodiumCard/);
  assert.match(legacyPage, /LegacyChampionsPage/);
  assert.match(legacyPage, /champions-page-shell/);
  assert.match(legacyPage, /ChampionsDisplayRail/);
  assert.match(displayRail, /\/champions\/legacy\?view=b/);
  assert.match(displayRail, /\/champions\/legacy\?view=a/);
  assert.match(displayRail, /group\/extreme/);
  assert.match(displayRail, /group-hover\/extreme/);
  assert.match(displayRail, /E1/);
  assert.match(displayRail, /E2/);
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

test("RM and DM crowns default to on-top presentation with the hidden RM / DM toggle", () => {
  assert.match(state, /rmChampion: modeChampion\("rm", rmContenders\)/);
  assert.match(state, /dmChampion: modeChampion\("dm", dmContenders\)/);
  assert.match(experience, /Top ten by/);
  assert.match(experience, /useState\(true\)/);
  assert.match(experience, /kicker="RM \/ DM"/);
  assert.match(experience, /title="RM Champion · DM Champion"/);
  assert.match(experience, /onKickerClick/);
});

test("Women\'s championship starts with Moose and pads the throne to ten honest seats", () => {
  assert.match(state, /name: "Moose"/);
  assert.match(state, /Invited contender · not yet registered/);
  assert.match(experience, /title\.type === "womens" \? 10 : 0/);
  assert.match(experience, /placeholderLabel="Unclaimed"/);
});

test("team crowns preserve commissioner-curated contender teams and tapered holder stages", () => {
  assert.match(state, /teamTitles\("rm", directoryEntries\)/);
  assert.match(state, /teamTitles\("dm", directoryEntries\)/);
  assert.match(state, /holderSlots: size/);
  assert.match(state, /`\$\{size\}v\$\{size\}-\$\{lane\}`/);
  for (const pair of [
    '["Jim", "Scavanger_Ab"]',
    '["Emaren", "Tekki"]',
    '["Zodiac", "MouldyBoars39381"]',
    '["Julio Alvarez", "Sniper"]',
  ]) assert.ok(state.includes(pair));
  assert.match(state, /\["Jim", "Scavanger_Ab", "Tekki"\]/);
  assert.match(state, /\["Emaren", "Zodiac", "MouldyBoars39381"\]/);
  assert.match(state, /\["Jim", "Scavanger_Ab", "Tekki", "Zodiac"\]/);
  assert.match(state, /\["Emaren", "Julio Alvarez", "MouldyBoars39381", "Sniper"\]/);
  assert.match(experience, /min-h-\[29rem\]/);
  assert.match(experience, /min-h-\[26rem\]/);
  assert.match(experience, /min-h-\[23rem\]/);
  assert.match(experience, /scale-\[1\.10\]/);
  assert.match(experience, /Commissioner queue/);
  assert.match(experience, /Open team contender/);
});

test("ELO crowns use exact managed-media targets and avatar-backed holder stages", () => {
  assert.match(state, /lane === "dm" \? entry\.steamDmRating : entry\.steamRmRating/);
  assert.match(state, /if \(lane === "rm"\)[\s\S]*return definition\.id/);
  assert.match(state, /division === "challenger" \? "dm-contender"/);
  assert.match(state, /rm \? "random-map-champion" : "deathmatch-champion"/);
  assert.match(state, /const holder = titleState\.holders\[0\] \?\? null/);
  assert.match(experience, /holderAvatarUrl/);
  assert.match(experience, /division\.holder\?\.name \|\| "Vacant"/);
  assert.match(experience, /state\.elo\[lane\]/);
});

test("national belt hall reads represented-country truth for every crown", () => {
  assert.match(directory, /representedCountry: string \| null/);
  assert.match(directory, /representedCountry: true/);
  assert.match(directory, /representedCountry: user\.representedCountry/);
  assert.match(state, /countryDirectoryContenders/);
  assert.match(state, /"United States"/);
  assert.match(state, /"United Kingdom"/);
  assert.match(state, /"southeast-asia": \["Pakistan"\]/);
  for (const name of ["Scavanger_Ab", "Zodiac", "Sniper", "Dil Pascana", "Maxi"]) assert.ok(state.includes(name));
  for (const country of ["Brazil", "Argentina", "France", "Japan", "Taiwan", "Saudi Arabia"]) assert.ok(state.includes(`country: "${country}"`));
  assert.match(experience, /snap-x/);
  assert.match(experience, /hover:opacity-100/);
  assert.match(experience, /scrollBy/);
});

test("E2 removes only the oversized top intro while restoring useful section copy", () => {
  assert.doesNotMatch(experience, /CHAMPIONSHIP/);
  assert.doesNotMatch(experience, /Real custody, real contenders/);
  for (const copy of [
    "The three crowns everybody sees first",
    "No mixed ladder math",
    "One switch changes every team crown",
    "Every flag gets a road to the belt",
    "Five belts, five rating bands",
  ]) {
    assert.ok(experience.includes(copy), `section copy should be present: ${copy}`);
  }
  assert.match(experience, /\["Chaos", "Champion"\]/);
  assert.match(experience, /\["AoE2WAR", "World", "Champion"\]/);
  assert.match(experience, /\["Women's", "Champion"\]/);
});

test("podium and national action buttons are bottom-anchored for card symmetry", () => {
  assert.match(experience, /flex h-full flex-col/);
  assert.match(experience, /flex flex-1 flex-col gap-4 p-4/);
  assert.match(experience, /mt-auto inline-flex min-h-10/);
  assert.match(experience, /mt-auto inline-flex w-full/);
});

test("RM DM switches use muted graphite styling instead of pale yellow", () => {
  assert.match(experience, /rgba\(71,85,105,0\.78\)/);
  assert.match(experience, /text-stone-200/);
  assert.doesNotMatch(experience, /bg-amber-200 text-slate-950/);
});

test("Saudi Arabia and Taiwan use bounded cinematic art instead of full-card takeover", () => {
  assert.match(experience, /belt\.slug === "saudi-arabia" \|\| belt\.slug === "taiwan"/);
  assert.match(experience, /top-\[7\.2rem\]/);
  assert.match(experience, /h-\[9\.5rem\]/);
});

test("Tournament navigation says where all the warriors go", () => {
  assert.ok(shell.includes('body: "Where all the warriors go"'));
});
