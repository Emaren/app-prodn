import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import published from "../config/kingdom-index-companions.json" with { type: "json" };
import review from "../config/kingdom-index-watcher-166-source-review.json" with { type: "json" };
import rubric from "../config/kingdom-index-quality-rubric.json" with { type: "json" };

const server = readFileSync(new URL("../lib/kingdomIndex.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../components/kingdom-index/KingdomIndex.tsx", import.meta.url), "utf8");
const watcher = published.companions.find(c => c.id === review.companionId);

test("published Watcher grade remains UNMEASURED rather than the draft estimate", () => {
  assert.ok(watcher);
  assert.equal(watcher.version, "1.6.5");
  assert.equal(watcher.gates.length, 9);
  assert.equal(review.publishedReleaseStill, watcher.version);
  assert.match(server, /status:"unmeasured" as const,score:null/);
  assert.doesNotMatch(ui, /<b aria-label="Approximately 58 out of 100/);
  assert.match(ui, /No independently certified desktop quality score/);
  assert.match(ui, /UNMEASURED/);
});

test("one server-side source review binds candidate to its matching published companion", () => {
  assert.match(server, /kingdom-index-watcher-166-source-review\.json/);
  assert.match(server, /draftSourceReview:/);
  assert.doesNotMatch(ui, /import watcherDraftReview from/);
  assert.match(ui, /companion\.draftSourceReview/);
  assert.equal(review.candidateState, "DRAFT_UNRELEASED");
  assert.equal(review.scoreAuthority, "AI_ASSISTED_SOURCE_TRIAGE_UNCERTIFIED");
});

test("unpublished estimate is arithmetically consistent, separately identified and traceable", () => {
  assert.equal(review.criteria.length, 20);
  assert.equal(new Set(review.criteria.map(c => c.id)).size, 20);
  const criteria = Object.entries(rubric.dimensions).flatMap(([dimension, block]) =>
    block.criteria.map(item => ({ id: item.id, dimension, max: item.max })));
  for (const c of criteria) {
    const found = review.criteria.find(x => x.id === c.id);
    assert.ok(found, c.id);
    assert.equal(found.dimension, c.dimension);
    assert.equal(found.max, c.max);
    assert.ok(Number.isInteger(found.estimated) && found.estimated >= 0 && found.estimated <= found.max);
  }
  assert.equal(review.criteria.reduce((sum, c) => sum + c.estimated, 0), review.score);
  for (const [dimension, points] of Object.entries(review.dimensions)) {
    assert.equal(review.criteria.filter(c => c.dimension === dimension).reduce((sum, c) => sum + c.estimated, 0), points);
  }
  assert.match(ui, /AI-assisted/i);
  assert.match(ui, /NOT THE LIVE WATCHER QUALITY SCORE/);
  assert.match(ui, /review age/i);
  assert.match(ui, /candidate source/i);
  assert.match(ui, /companion\.gates\.map\(/);
  assert.match(ui, /companion\.draftSourceReview\.refs/);
});
