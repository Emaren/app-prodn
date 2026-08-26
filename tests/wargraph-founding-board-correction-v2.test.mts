import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const foundation = readFileSync(
  new URL("../lib/wargraph/foundation.ts", import.meta.url),
  "utf8",
);

const docs = readFileSync(
  new URL("../docs/WARGRAPH_V1.md", import.meta.url),
  "utf8",
);

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260826040000_allow_wargraph_founding_correction_v2/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

test("WarGraph V2 preserves the proven V1 seed and applies the final ten-warrior founding correction", () => {
  const foundingBlock =
    foundation.match(/const FOUNDING_SEATS = \[[\s\S]*?\] as const;/)?.[0] ?? "";

  assert.match(
    foundingBlock,
    /layer: "ring-i", ordinal: 0, aliases: \["zodiac"\]/,
  );
  assert.match(
    foundingBlock,
    /layer: "ring-i",[\s\S]*ordinal: 1,[\s\S]*aliases: \["c0lorz", "colors"\]/,
  );
  assert.match(
    foundingBlock,
    /layer: "ring-ii",[\s\S]*ordinal: 0,[\s\S]*aliases: \["somniosator"\]/,
  );

  assert.match(
    foundation,
    /await applyFoundingBoardCorrectionV1\([\s\S]*await applyFoundingBoardCorrectionV2\(/,
  );

  for (const authority of [
    'zodiac: "steam:76561198103810510"',
    'c0lorz: "steam:76561198138252884"',
    'somniosator: "steam:76561198257849801"',
    'pigman: "steam:76561198801484390"',
    'deltaforce: "steam:76561198087798523"',
    'julio: "steam:76561198190973517"',
    'sniper: "steam:76561198041444664"',
    'mouldy: "steam:76561199024931846"',
    'ra: "steam:76561197990322225"',
    'emaren: "steam:76561198065420384"',
  ]) {
    assert.ok(
      foundation.includes(authority),
      `missing stable founding identity: ${authority}`,
    );
  }

  assert.match(
    foundation,
    /\[zodiac, somniosator, pigman\],[\s\S]*\[deltaforce, c0lorz\],[\s\S]*\[julio, sniper, mouldy\],[\s\S]*\[emaren, ra\]/,
  );
});

test("WarGraph V2 fixes constitutional seats while keeping Frontier ordinals elastic", () => {
  for (const seat of [
    'seatOf(pigman) === "ring-i:0"',
    'seatOf(deltaforce) === "ring-i:1"',
    'seatOf(zodiac) === "ring-ii:0"',
    'seatOf(mouldy) === "ring-ii:2"',
    'seatOf(emaren) === "ring-ii:5"',
  ]) {
    assert.ok(
      foundation.includes(seat),
      `missing fixed-seat authority: ${seat}`,
    );
  }

  for (const membership of [
    "ra",
    "somniosator",
    "c0lorz",
    "julio",
    "sniper",
    "pigman",
    "deltaforce",
    "mouldy",
    "emaren",
  ]) {
    assert.match(
      foundation,
      new RegExp(
        `layerOf\\(${membership}\\) === "frontier"`,
      ),
    );
  }

  const legacy =
    foundation.match(
      /const legacyState =[\s\S]*?;\n\n  if \(!legacyState\)/,
    )?.[0] ?? "";

  assert.doesNotMatch(
    legacy,
    /frontier:\d+/,
    "fresh-realm acceptance must not pin elastic Frontier ordinals",
  );
});

test("WarGraph V2 correction remains founding-only, zero-action, and zero-reward", () => {
  assert.match(
    foundation,
    /reasonCode: "FOUNDING_BOARD_CORRECTION_V2"/,
  );
  assert.match(
    foundation,
    /WARGRAPH_FOUNDING_CORRECTION_V2_WINDOW_CLOSED/,
  );
  assert.match(
    foundation,
    /notIn: \["INITIAL_ASSIGNMENT", "FOUNDING_CORRECTION"\]/,
  );
  assert.match(foundation, /actionsConsumed: 0/);
  assert.match(foundation, /rewardsCreated: 0/);
  assert.match(
    foundation,
    /WARGRAPH_FOUNDING_CORRECTION_V2_STATE_UNEXPECTED/,
  );
  assert.match(
    foundation,
    /WARGRAPH_FOUNDING_CORRECTION_V2_PARTIAL_STATE/,
  );
});

test("WarGraph V2 geometry explicitly permits the required Frontier reseat", () => {
  const block =
    migration.match(
      /"reason_code" = 'FOUNDING_BOARD_CORRECTION_V2'[\s\S]*?"night_id" IS NULL/,
    )?.[0] ?? "";

  assert.match(
    block,
    /"from_layer_ordinal" = 3 AND "to_layer_ordinal" = 3/,
  );
});

test("WarGraph V2 documentation records the final visible founding board", () => {
  assert.match(docs, /Crown: Jim/);
  assert.match(
    docs,
    /Ring I, left\/right: \[BDB\]Pigman, Deltaforce/,
  );
  assert.match(
    docs,
    /Ring II, clockwise from twelve o'clock: Zodiac, pinoy16, MouldyBoars39381,[\s\S]*Sladk0Eshka, Dil_Pascana, Emaren/,
  );
  assert.match(
    docs,
    /Zodiac takes somniosator's former Ring II seat/,
  );
  assert.match(docs, /Deltaforce ↔ c0LoRz/);
  assert.match(
    docs,
    /Julio Alvarez takes Sniper's former Frontier seat/,
  );
  assert.match(docs, /Emaren ↔ - Ra/);
});
