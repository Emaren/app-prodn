import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../app/workshop/page.tsx", import.meta.url),
  "utf8",
);

const chronicle = readFileSync(
  new URL("../components/workshop/WorkshopChronicle.tsx", import.meta.url),
  "utf8",
);

test("obsolete Workshop hero copy is removed", () => {
  assert.doesNotMatch(page, /The strange machine is forged in public/);
  assert.doesNotMatch(page, /\{data\.status\.description\}/);
});

test("Workshop presents the current War Protocol", () => {
  assert.match(page, /The War Protocol/);
  assert.match(page, /Public Match Rooms/);
  assert.match(page, /Public Match Chronicle/);
  assert.match(page, /Challenge custody & settlement/);
  assert.match(page, /Human DESYNC incidents/);
  assert.match(page, /Independent DESYNC market/);
  assert.match(page, /Speed Observatory/);
  assert.match(page, /Screenshot Evidence Lab/);
});

test("Workshop describes public Match Rooms without exposing private DMs", () => {
  assert.match(page, /Public Match Room messages belong only to/);
  assert.match(page, /never import or expose private DM history/);
  assert.match(page, /Public Match Rooms are separate Challenge-scoped/);
});

test("old parser campaign framing is no longer the current headline", () => {
  assert.doesNotMatch(page, /Campaign IV · Parser Front/);
  assert.doesNotMatch(page, />\s*Into the Fog\.\s*</);
});

test("Workshop Chronicle includes players in the living build history", () => {
  assert.match(chronicle, /Emaren, AI, players, and the Kingdom/);
});
