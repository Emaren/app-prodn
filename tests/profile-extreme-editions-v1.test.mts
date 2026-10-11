import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profile = readFileSync("app/profile/page.tsx", "utf8");
const config = readFileSync("next.config.js", "utf8");

test("E1 remains a separate full Extreme profile; E2 has its own page composition", () => {
  assert.match(profile, /function ExtremeProfileView\(/);
  assert.match(profile, /function ExtremeProfileE2View\(/);
  assert.match(profile, /extremeEdition === "e2" \? ExtremeProfileE2View : ExtremeProfileView/);
  assert.match(profile, /data-profile-edition="e2"/);
  const e1 = profile.split("function ExtremeProfileView(")[1]?.split("// E2 forks the E1 page composition")[0];
  const e2 = profile.split("function ExtremeProfileE2View(")[1]?.split("EXTREME PROFILE — ARMORY")[0];
  assert.ok(e1 && e2 && e1.includes("ExtremeAvatarStage") && e1.includes("ExtremeProfileArmory"));
  assert.ok(e2 && e2.includes("ExtremeAvatarStage") && e2.includes("ExtremeProfileArmory"));
});

test("Extreme hover and keyboard focus offer numbered slots, preserving only built editions", () => {
  assert.match(profile, /group-hover:visible/);
  assert.match(profile, /group-focus-within:visible/);
  assert.match(profile, /\["e1", "e2", "e3", "e4"\] as const/);
  assert.match(profile, /slot === "e1" \|\| slot === "e2"/);
  assert.match(profile, /disabled=\{!available\}/);
  assert.match(profile, /onChange\("extreme", slot\)/);
});

test("new users default to E2 while explicit E1 and Basic\/Advanced choices are stored per UID", () => {
  assert.match(profile, /PROFILE_VIEW_STORAGE_PREFIX = "aoe2war:profile-layout:v1:"/);
  assert.match(profile, /return \{ mode: "extreme", edition: "e2" \}/);
  assert.match(profile, /value\?\.edition === "e1" \? "e1" : "e2"/);
  assert.match(profile, /window\.localStorage\.getItem/);
  assert.match(profile, /window\.localStorage\.setItem/);
  assert.match(profile, /profileSelectionLoaded/);
});

test("local PWA icon is an explicitly allowed first-party image, not a wildcard bypass", () => {
  assert.match(config, /\{ pathname: "\/icons\/icon-192x192\.png" \}/);
  assert.doesNotMatch(config, /\{ pathname: "\/icons\/\*\*" \}/);
});
