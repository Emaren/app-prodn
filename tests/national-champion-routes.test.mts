import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../app/national-champions/page.tsx", import.meta.url),
  "utf8",
);

const stateSource = readFileSync(
  new URL("../lib/champions/nationalPageState.ts", import.meta.url),
  "utf8",
);

test("national champion belt cards use canonical nation routes", () => {
  assert.match(pageSource, /us:\s*"usa"/);
  assert.match(pageSource, /uk:\s*"uk"/);
  assert.doesNotMatch(pageSource, /us:\s*"united-states"/);
  assert.doesNotMatch(pageSource, /uk:\s*"united-kingdom"/);
});

test("supported national champions project holders and economics from persistent Trophy state", () => {
  assert.match(
    pageSource,
    /loadChampionTitleEconomyState\(getPrisma\(\)\)/,
  );
  assert.match(
    pageSource,
    /buildNationalChampionBeacons\(titleState\)/,
  );
  assert.doesNotMatch(
    pageSource,
    /nationalBeacons[^\n]*aoe2warLeague/,
  );

  for (const field of [
    "currentBountyWolo",
    "dailyWolo",
    "holderSince",
  ]) {
    assert.match(stateSource, new RegExp(field));
  }

  for (const titleId of [
    "national-canada",
    "national-usa",
    "national-mexico",
    "national-uk",
  ]) {
    assert.match(stateSource, new RegExp(titleId));
  }

  assert.match(pageSource, /supportedBeacons/);
  assert.match(pageSource, /supportedBeacons\.reduce/);
  assert.doesNotMatch(
    pageSource,
    /\{beacon\.bountyWolo\} WOLO\/day/,
  );
});

test("future countries remain visible as honest planned crown placeholders", () => {
  for (const planned of [
    "brazil",
    "spain",
    "germany",
    "egypt",
    "india",
    "china",
    "japan",
    "australia",
    "south-africa",
  ]) {
    assert.match(
      stateSource,
      new RegExp(`id: "${planned}"`),
    );
  }

  assert.match(stateSource, /tier: "planned"/);
  assert.match(stateSource, /bountyWolo: 0/);
  assert.match(stateSource, /tributeWolo: 0/);
  assert.match(stateSource, /beltHref: null/);

  assert.match(pageSource, /Future Crowns/);
  assert.match(pageSource, /roadmap placeholders/);
  assert.match(pageSource, /plannedBeacons\.map/);
  assert.match(pageSource, /Economy/);
  assert.match(pageSource, /Not live/);
});
