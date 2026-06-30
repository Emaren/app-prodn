import assert from "node:assert/strict";
import test from "node:test";

import {
  MARKETPLACE_CONFIG,
  normalizeAvatarArchetypes,
  normalizeBeltPlacement,
  normalizeMarketplaceBrief,
  normalizeMarketplaceLine,
} from "../lib/marketplace.ts";

test("the founding market shop has a clear craft, price, and delivery rail", () => {
  assert.equal(MARKETPLACE_CONFIG.avatarShopName, "The Visage Forge");
  assert.equal(MARKETPLACE_CONFIG.avatarCraftName, "Visagewright");
  assert.equal(MARKETPLACE_CONFIG.avatarPriceUsd, 100);
  assert.equal(
    MARKETPLACE_CONFIG.avatarDeliveryLabel,
    "AoE2WAR profile avatar vault"
  );
});

test("avatar commission signals accept only known values and at most three", () => {
  assert.deepEqual(
    normalizeAvatarArchetypes([
      "warlord",
      "strategist",
      "not-real",
      "royal",
      "shadow",
      "warlord",
    ]),
    ["warlord", "strategist", "royal"]
  );
  assert.equal(normalizeBeltPlacement("hand"), "hand");
  assert.equal(normalizeBeltPlacement("floating"), "none");
});

test("market request copy is normalized and bounded", () => {
  assert.equal(normalizeMarketplaceLine("  The   Banner  Forge "), "The Banner Forge");
  assert.equal(
    normalizeMarketplaceBrief("first  \r\nsecond\n\n\n\nthird"),
    "first\nsecond\n\nthird"
  );
  assert.equal(normalizeMarketplaceBrief("x".repeat(1400)).length, 1200);
});
