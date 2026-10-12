import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_PROFILE_VIEW,
  isProfileViewVariant,
  profileViewFamily,
  profileViewStorageKey,
} from "../lib/profileViewVariant.ts";

test("E2 is the default and B/A/E have two explicit selectable variants", () => {
  assert.equal(DEFAULT_PROFILE_VIEW, "e2");
  for (const family of ["b", "a", "e"]) {
    for (const version of [1, 2]) {
      assert.equal(isProfileViewVariant(family + version), true);
    }
  }
  assert.equal(isProfileViewVariant("extreme"), false);
  assert.equal(profileViewFamily("e1"), "extreme");
  assert.equal(profileViewFamily("e2"), "extreme");
  assert.equal(profileViewFamily("b2"), "basic");
  assert.equal(profileViewFamily("a1"), "advanced");
});

test("profile view preferences are account scoped and encoded", () => {
  assert.notEqual(profileViewStorageKey("uid/a"), profileViewStorageKey("uid/b"));
  assert.match(profileViewStorageKey("uid/a"), /uid%2Fa/);
});

test("E2 renders on the existing Extreme profile stage and preserves E1", () => {
  const page = readFileSync(new URL("../app/profile/page.tsx", import.meta.url), "utf8");
  assert.match(page, /profileFamily === "extreme"/);
  assert.match(page, /profileViewMode === "e2"/);
  assert.match(page, /readProfileViewVariant\(uid\)/);
  assert.match(page, /saveProfileViewVariant\(uid, next\)/);
  const selector = readFileSync(new URL("../components/profile/ProfileViewSelector.tsx", import.meta.url), "utf8");
  assert.match(selector, /onPointerEnter/);
  assert.match(selector, /onPointerLeave/);
  assert.match(selector, /onKeyDown/);
  assert.match(selector, /aria-expanded/);
});

test("Mecha UI shows only server-owned preview status; not an on-chain wallet", () => {
  const card = readFileSync(new URL("../components/profile/MechaAutoBetCard.tsx", import.meta.url), "utf8");
  assert.match(card, /role="switch"/);
  assert.match(card, /WAR SATCHEL/);
  assert.match(card, /NO WOLO MOVED · NO BET PLACED/);
  assert.match(card, /MAX_AUTO_GAME_WOLO = 1_000/);
  assert.match(card, /expectedVersion: server.preset.version/);
  assert.match(card, /if \(armed\) void pause\(\)/);
  assert.match(card, /action: "pause"/);
  assert.match(card, /\/api\/user\/bet-automation/);
});
