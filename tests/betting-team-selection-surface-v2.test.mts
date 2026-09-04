import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "app/bets/page.tsx",
  "utf8",
);

test("team winner markets expose one meaningful selection surface", () => {
  assert.match(
    source,
    /function ExtremeTeamPanel/,
  );

  assert.doesNotMatch(
    source,
    /function ExtremePlayerChips/,
  );

  assert.doesNotMatch(
    source,
    /<ExtremePlayerChips/,
  );
});

test("redundant Player Pick language is gone", () => {
  assert.doesNotMatch(
    source,
    /Player pick backs that player/,
  );

  assert.doesNotMatch(
    source,
    /Team-settled/,
  );
});

test("team panels retain roster context and select actual sides", () => {
  assert.match(
    source,
    /roster\.players\.map/,
  );

  assert.match(
    source,
    /onSelect\(market, "left"\)/,
  );

  assert.match(
    source,
    /onSelect\(market, "right"\)/,
  );
});
