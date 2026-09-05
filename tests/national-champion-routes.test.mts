import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const pageSource =
  readFileSync(
    new URL(
      "../app/national-champions/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const stateSource =
  readFileSync(
    new URL(
      "../lib/champions/nationalPageState.ts",
      import.meta.url,
    ),
    "utf8",
  );

test(
  "national champion belt cards use canonical nation routes",
  () => {
    assert.match(
      pageSource,
      /us:\s*"usa"/,
    );

    assert.match(
      pageSource,
      /uk:\s*"uk"/,
    );

    assert.doesNotMatch(
      pageSource,
      /us:\s*"united-states"/,
    );

    assert.doesNotMatch(
      pageSource,
      /uk:\s*"united-kingdom"/,
    );
  },
);

test(
  "national champions project holders and economics from persistent Trophy state",
  () => {
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

    assert.match(
      stateSource,
      /currentBountyWolo/,
    );
    assert.match(
      stateSource,
      /dailyWolo/,
    );
    assert.match(
      stateSource,
      /holderSince/,
    );

    for (const titleId of [
      "national-canada",
      "national-usa",
      "national-mexico",
      "national-uk",
    ]) {
      assert.match(
        stateSource,
        new RegExp(titleId),
      );
    }

    for (const unsupported of [
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
      assert.doesNotMatch(
        stateSource,
        new RegExp(`id: "${unsupported}"`),
      );
    }

    assert.doesNotMatch(
      pageSource,
      /\{beacon\.bountyWolo\} WOLO\/day/,
    );
  },
);
