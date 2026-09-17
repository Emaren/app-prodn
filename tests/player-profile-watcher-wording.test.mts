import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("components/players/PlayerProfilePage.tsx", "utf8");
const profile = readFileSync("lib/playerProfile.ts", "utf8");

test("player profile labels watcher-network evidence without implying uploader ownership", () => {
  assert.match(page, /Watcher-Captured/);
  assert.match(page, /Replay evidence may come from any participant watcher/);
  assert.doesNotMatch(page, /label=\"Watcher Proof\"/);
  assert.match(profile, /watcher-captured games/);
  assert.doesNotMatch(profile, /watcher-backed proofs/);
});
