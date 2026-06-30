import assert from "node:assert/strict";
import test from "node:test";

import {
  isPublicZodiacTrainingContactUid,
  selectFeaturedZodiacMatches,
  ZODIAC_TRAINING_CONFIG,
} from "../lib/zodiacTraining.ts";

test("Zodiac is the enabled founding Academy advisor", () => {
  assert.equal(ZODIAC_TRAINING_CONFIG.enabled, true);
  assert.equal(ZODIAC_TRAINING_CONFIG.route, "/zodiac");
  assert.equal(ZODIAC_TRAINING_CONFIG.userId, 124585);
  assert.equal(ZODIAC_TRAINING_CONFIG.primaryCtaMode, "direct_message");
  assert.equal(ZODIAC_TRAINING_CONFIG.publicContactEnabled, true);
  assert.equal(ZODIAC_TRAINING_CONFIG.headline, "Train Under Zodiac");
  assert.equal(ZODIAC_TRAINING_CONFIG.coachingPriceWolo, 100);
  assert.equal(
    ZODIAC_TRAINING_CONFIG.firstLessonMemo,
    "AoE2WAR Academy · Zodiac · first lesson"
  );
  assert.equal(ZODIAC_TRAINING_CONFIG.steamGroupUrl, null);
});

test("only the configured Zodiac uid opens the public advisor line", () => {
  assert.equal(
    isPublicZodiacTrainingContactUid(ZODIAC_TRAINING_CONFIG.userUid),
    true
  );
  assert.equal(isPublicZodiacTrainingContactUid("u_not_zodiac"), false);
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
