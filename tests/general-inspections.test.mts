import assert from "node:assert/strict";
import test from "node:test";

import {
  INSPECTION_CATEGORY_WEIGHTS,
  category,
  check,
  freshnessFraction,
  legacyReceiptProof,
  stateForFraction,
  thresholdFraction,
} from "../lib/generalInspections/scoring.ts";

test("every General Inspection category totals exactly 100 points", () => {
  for (const [name, weights] of Object.entries(INSPECTION_CATEGORY_WEIGHTS)) {
    assert.equal(
      weights.reduce((sum, weight) => sum + weight, 0),
      100,
      name + " must total exactly 100",
    );
  }
});

test("inspection state bands are deterministic", () => {
  assert.equal(stateForFraction(1), "green");
  assert.equal(stateForFraction(0.9), "green");
  assert.equal(stateForFraction(0.89), "amber");
  assert.equal(stateForFraction(0.67), "amber");
  assert.equal(stateForFraction(0.66), "red");
});

test("threshold scoring respects lower-is-better and higher-is-better metrics", () => {
  assert.equal(thresholdFraction(600, 650, 900, "lte"), 1);
  assert.equal(thresholdFraction(800, 650, 900, "lte"), 0.75);
  assert.equal(thresholdFraction(7, 6, 5, "gte"), 1);
  assert.equal(thresholdFraction(5.5, 6, 5, "gte"), 0.75);
});

test("freshness scoring degrades instead of staying permanently green", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");
  assert.equal(freshnessFraction("2026-09-19T11:30:00Z", 1, 5, now), 1);
  assert.equal(freshnessFraction("2026-09-19T07:00:00Z", 1, 5, now), 0);
  assert.equal(freshnessFraction(null, 1, 5, now), 0);
});

test("category constructor rejects fake 100-point boards", () => {
  assert.throws(
    () =>
      category("bad", "Bad", "Bad board", [
        check("only", "Only", 99, 1, "not enough"),
      ]),
    /must total 100/,
  );
});

test("ratio checks expose numerator and denominator", () => {
  const item = check("node", "Node", 20, 1, "329/329", {
    ratio: { passed: 329, total: 329 },
  });
  assert.deepEqual(item.ratio, { passed: 329, total: 329 });
  assert.equal(item.state, "green");
});


test("a stale fully-passing cohort cannot display green after its earned points expire", () => {
  const stale = check("edge", "Static edge cohort", 10, 0, "20/20 historically", {
    ratio: { passed: 20, total: 20 },
    evidenceAt: "2026-10-13T00:00:00Z",
  });
  assert.equal(stale.earned, 0);
  assert.equal(stale.state, "red");
  const partial = check("edge", "Static edge cohort", 10, 0.8, "8/10", {
    ratio: { passed: 8, total: 10 },
  });
  assert.equal(partial.state, "amber");
});


test("far future observation timestamps cannot mint fresh inspection proof", () => {
  const now = Date.parse("2026-10-25T12:00:00Z");
  assert.equal(freshnessFraction("2026-10-26T12:00:00Z", 1, 6, now), 0);
  assert.equal(freshnessFraction("2026-10-25T12:04:00Z", 1, 6, now), 1);
});

test("local Finish fallback cannot award old or mismatched browser cohorts", () => {
  const now = Date.parse("2026-10-25T12:00:00Z");
  const sha = "a".repeat(40);
  const fixture = {
    receiptAt: "2026-10-25T11:55:00Z",
    receiptReleaseSha: sha,
    activeSourceSha: sha,
    certifiedReleaseSha: sha,
    activeBuildId: "live-build-id",
    certifiedBuildId: "live-build-id",
    finishAt: "2026-10-25T11:50:00Z",
    now,
  };
  assert.equal(legacyReceiptProof(fixture), 1);
  assert.equal(legacyReceiptProof({ ...fixture, receiptAt: "2026-10-13T12:00:00Z" }), 0);
  assert.equal(legacyReceiptProof({ ...fixture, receiptReleaseSha: "b".repeat(40) }), 0);
  assert.equal(legacyReceiptProof({ ...fixture, activeSourceSha: "b".repeat(40) }), 0);
  assert.equal(legacyReceiptProof({ ...fixture, activeBuildId: "another-build" }), 0);
  assert.equal(legacyReceiptProof({ ...fixture, activeBuildId: null }), 0);
  assert.equal(legacyReceiptProof({ ...fixture, finishAt: "2026-10-13T12:00:00Z" }), 0);
  assert.equal(legacyReceiptProof({ ...fixture, receiptAt: "2026-10-26T12:00:00Z" }), 0);
});
