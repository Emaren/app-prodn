import assert from "node:assert/strict";
import test from "node:test";

import {
  isPublicZodiacTrainingContactUid,
  selectFeaturedZodiacMatches,
  ZODIAC_TRAINING_CONFIG,
} from "../lib/zodiacTraining.ts";

test("Zodiac training page exposes the intended public route and safe v1 defaults", () => {
  assert.equal(ZODIAC_TRAINING_CONFIG.enabled, true);
  assert.equal(ZODIAC_TRAINING_CONFIG.route, "/zodiac");
  assert.equal(ZODIAC_TRAINING_CONFIG.userId, 124585);
  assert.equal(ZODIAC_TRAINING_CONFIG.primaryCtaMode, "direct_message");
  assert.equal(ZODIAC_TRAINING_CONFIG.publicContactEnabled, true);
  assert.equal(ZODIAC_TRAINING_CONFIG.coachingPriceWolo, null);
  assert.equal(ZODIAC_TRAINING_CONFIG.steamGroupUrl, null);
});

test("only Zodiac's configured uid opens the public mentor contact rail", () => {
  assert.equal(
    isPublicZodiacTrainingContactUid(ZODIAC_TRAINING_CONFIG.userUid),
    true
  );
  assert.equal(isPublicZodiacTrainingContactUid("u_someone_else"), false);
  assert.equal(isPublicZodiacTrainingContactUid(null), false);
});

test("featured match selection defaults to the latest six replay-backed rows", () => {
  const matches = Array.from({ length: 9 }, (_, index) => ({
    id: 100 - index,
    label: `Match ${index + 1}`,
  }));

  assert.deepEqual(
    selectFeaturedZodiacMatches(matches).map((match) => match.id),
    [100, 99, 98, 97, 96, 95]
  );
});
