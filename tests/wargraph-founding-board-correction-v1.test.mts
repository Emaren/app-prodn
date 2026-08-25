import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const foundation = readFileSync(
  new URL("../lib/wargraph/foundation.ts", import.meta.url),
  "utf8",
);

const snapshot = readFileSync(
  new URL("../lib/wargraph/snapshot.ts", import.meta.url),
  "utf8",
);

test("WarGraph founding authority is 1/2/6 with Julio and Sladk in the corrected Ring II seats", () => {
  assert.match(
    foundation,
    /layer: "ring-ii",[\s\S]*ordinal: 2,[\s\S]*aliases: \["julioalvarez"\]/,
  );

  assert.match(
    foundation,
    /layer: "ring-ii",[\s\S]*ordinal: 3,[\s\S]*aliases: \["sladk0eshka", "sladkoeshka"\]/,
  );

  const foundingBlock =
    foundation.match(
      /const FOUNDING_SEATS = \[[\s\S]*?\] as const;/,
    )?.[0] ?? "";

  assert.doesNotMatch(foundingBlock, /moose/i);
});

test("legacy founding correction is exact-player, zero-action, zero-reward, and exactly-once", () => {
  assert.match(
    foundation,
    /julioPlayerKey: "steam:76561198190973517"/,
  );
  assert.match(
    foundation,
    /sladkPlayerKey: "steam:76561198075626698"/,
  );
  assert.match(
    foundation,
    /movementType: "FOUNDING_CORRECTION"/,
  );
  assert.match(
    foundation,
    /reasonCode: "FOUNDING_BOARD_CORRECTION_V1"/,
  );
  assert.match(
    foundation,
    /WARGRAPH_FOUNDING_CORRECTION_WINDOW_CLOSED/,
  );
  assert.match(
    foundation,
    /actionsConsumed: 0/,
  );
  assert.match(
    foundation,
    /rewardsCreated: 0/,
  );
});

test("Frontier visual seats compact occupied durable nodes without renumbering database nodes", () => {
  assert.match(
    snapshot,
    /let frontierPresentationSeat = 0;/,
  );

  assert.match(
    snapshot,
    /layer\.kind === "frontier"[\s\S]*\? frontierPresentationSeat\+\+[\s\S]*: node\.ordinal/,
  );

  assert.match(
    snapshot,
    /movementType === "FOUNDING_CORRECTION"[\s\S]*reasonLabel: "Founding board correction"/,
  );
});
