import assert from "node:assert/strict";
import test from "node:test";

import { buildWhyNotGreenReport } from "../lib/generalInspections/gapReport.ts";
import { INSPECTION_CATEGORY_WEIGHTS, category, check } from "../lib/generalInspections/scoring.ts";
import type { GeneralInspectionsSnapshot } from "../lib/generalInspections/types.ts";

const SHA = "a".repeat(40);
const NOW = "2026-10-25T12:00:00Z";
const OLD = "2026-10-13T12:00:00Z";
const IDS = ["speed", "documentation", "organization", "tests", "release", "security", "data"] as const;

function fixture(): GeneralInspectionsSnapshot {
  const categories = IDS.map((id) =>
    category(id, id, "Test-only synthetic receipts", INSPECTION_CATEGORY_WEIGHTS[id].map((weight, i) =>
      check(`check-${i}`, `Check ${i}`, weight, 1, "PASS", { evidenceAt: NOW }),
    )),
  );
  return {
    schema: 1,
    generatedAt: NOW,
    releaseSha: SHA,
    buildVersion: "test-build",
    overallScore: 100,
    overallState: "green",
    categories,
    notes: [],
  };
}

function rescore(snapshot: GeneralInspectionsSnapshot) {
  for (const row of snapshot.categories) {
    row.score = Math.round(row.checks.reduce((sum, item) => sum + item.earned, 0));
  }
  snapshot.overallScore = Math.round(snapshot.categories.reduce((sum, row) => sum + row.score, 0) / 7);
}

test("preserves canonical weights, measured score and source/build-scoped Test & Build 100", () => {
  const snap = fixture();
  const tests = snap.categories.find((c) => c.id === "tests")!;
  tests.checks.forEach((item) => { item.evidenceAt = OLD; });
  const report = buildWhyNotGreenReport(snap);
  assert.equal(report.observedOverallScore, 100);
  assert.equal(report.totalMissingCategoryPoints, 0);
  assert.equal(report.matrix.find((c) => c.id === "tests")?.status, "pass");
  assert.equal(report.measuredHealthChanged, false);
});

test("expired speed receipt stays UNKNOWN even when an upstream producer awarded full points", () => {
  const snap = fixture();
  snap.categories.find((c) => c.id === "speed")!.checks[0].evidenceAt = OLD;
  const report = buildWhyNotGreenReport(snap);
  assert.equal(report.matrix.find((c) => c.id === "speed")?.status, "unknown");
  assert.equal(report.gaps.find((c) => c.categoryId === "speed")?.reason, "stale-evidence");
  assert.equal(report.gaps.find((c) => c.categoryId === "speed")?.missingPoints, 0);
});

test("missing DocsV2 proof stays UNKNOWN while a fresh observed P0 invariant fails", () => {
  const snap = fixture();
  const doc = snap.categories.find((c) => c.id === "documentation")!;
  doc.checks[1].earned = 0;
  doc.checks[1].evidenceAt = null;
  const release = snap.categories.find((c) => c.id === "release")!;
  const invariant = release.checks[2];
  invariant.id = "estate-findings";
  invariant.earned = 0;
  invariant.detail = "P0 2 · P1 4";
  rescore(snap);
  const report = buildWhyNotGreenReport(snap);
  const docsGap = report.gaps.find((g) => g.categoryId === "documentation")!;
  assert.equal(docsGap.status, "unknown");
  assert.equal(docsGap.reason, "missing-observation-time");
  assert.match(docsGap.repair, /DocsV2 registry\/review queue/);
  assert.equal(report.matrix.find((c) => c.id === "release")?.status, "fail");
  assert.equal(report.gaps.find((g) => g.checkId === "estate-findings")?.reason, "observed-invariant-gap");
  assert.equal(report.totalMissingCategoryPoints, 30);
});

test("rejects corrupt scores, missing source, duplicate checks and altered weights", () => {
  const wrongRelease = fixture();
  wrongRelease.releaseSha = null;
  assert.throws(() => buildWhyNotGreenReport(wrongRelease), /Incomplete or unbound/);
  const wrongScore = fixture();
  wrongScore.overallScore = 42;
  assert.throws(() => buildWhyNotGreenReport(wrongScore), /overall-score mismatch/);
  const wrongWeights = fixture();
  wrongWeights.categories[0].checks[0].weight += 1;
  assert.throws(() => buildWhyNotGreenReport(wrongWeights), /Invalid canonical weighted check/);
  const duplicate = fixture();
  duplicate.categories[0].checks[1].id = duplicate.categories[0].checks[0].id;
  assert.throws(() => buildWhyNotGreenReport(duplicate), /Invalid canonical weighted check/);
});

test("public API report selects one collector snapshot, never a second scan", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../app/api/general-inspections/route.ts", import.meta.url), "utf8");
  assert.match(src, /requestedReport === "why-not-green"/);
  assert.equal((src.match(/buildGeneralInspectionsSnapshot\(\)/g) || []).length, 1);
  assert.match(src, /Cache-Control/);
});
