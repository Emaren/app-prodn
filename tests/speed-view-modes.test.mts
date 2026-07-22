import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const preferences = fs.readFileSync("lib/tileViewPreferences.ts", "utf8");
const observatory = fs.readFileSync("components/speed/SpeedObservatory.tsx", "utf8");

test("Speed participates in canonical B/A/E view preferences with Extreme as default", () => {
  assert.match(preferences, /"speed",/);
  assert.match(preferences, /speed: "extreme"/);
  assert.match(observatory, /useTileViewPreference\("speed"\)/);
  assert.match(observatory, /TILE_VIEW_MODES\.map/);
});

test("Basic preserves the compact personal Speed Observatory", () => {
  assert.match(observatory, /data-speed-view="basic"/);
  assert.match(observatory, /max-w-6xl/);
  assert.match(observatory, /This tab’s recent measurements/);
});

test("Advanced widens the observatory and adds a premium report rail", () => {
  assert.match(observatory, /data-speed-view="advanced"/);
  assert.match(observatory, /max-w-\[1380px\]/);
  assert.match(observatory, /Report what you actually felt\./);
  assert.match(observatory, /Session ledger/);
});

test("Extreme is a full-width visual performance field inspired by Traffic and Statistics", () => {
  assert.match(observatory, /data-speed-view="extreme"/);
  assert.match(observatory, /w-full max-w-none/);
  assert.match(observatory, /Session performance field/);
  assert.match(observatory, /Measured across this browser journey/);
  assert.match(observatory, /polyline/);
  assert.match(observatory, /speed-glow-amber/);
  assert.match(observatory, /Flight recorder/);
});
