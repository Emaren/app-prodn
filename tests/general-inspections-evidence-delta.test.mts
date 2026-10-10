import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeInspections,
  renderReport,
} from "../scripts/report_general_inspections.mjs";

const RELEASE = "a".repeat(40);
function snapshot() {
  const categories = [
    "speed", "documentation", "organization", "tests",
    "release", "security", "data",
  ].map((id) => ({
    id,
    title: id.toUpperCase(),
    score: 100,
    checks: [
      { id: "one", label: "First", weight: 60, earned: 60, detail: "PASS", evidenceAt: "2026-10-10T19:00:00Z" },
      { id: "two", label: "Second", weight: 40, earned: 40, detail: "PASS", evidenceAt: "2026-10-10T19:00:00Z" },
    ],
  }));
  return {
    schema: 1,
    releaseSha: RELEASE,
    buildVersion: "20261010190014-example",
    generatedAt: "2026-10-10T19:10:00Z",
    overallScore: 100,
    categories,
  };
}

test("sorts lost evidence points without reweighting or inventing scores", () => {
  const proof = snapshot();
  proof.categories[0].checks[0].earned = 42;
  proof.categories[0].score = 82;
  proof.categories[4].checks[1].earned = 32;
  proof.categories[4].score = 92;
  proof.overallScore = Math.round((82 + 92 + 5 * 100) / 7);
  const report = analyzeInspections(proof, RELEASE);
  assert.equal(report.gaps.length, 2);
  assert.equal(report.gaps[0].id, "one");
  assert.equal(report.gaps[0].missing, 18);
  assert.equal(report.gaps[1].missing, 8);
  const output = renderReport(report);
  assert.match(output, /Source:\s+aaaa/);
  assert.match(output, /-18\.0/);
  assert.match(output, /Zero application, Wolo, or database mutations/);
});

test("zero gaps report is explicitly full evidence, not a claimed deployment", () => {
  const report = analyzeInspections(snapshot(), RELEASE);
  assert.equal(report.gaps.length, 0);
  assert.match(renderReport(report), /Every check has full awarded points/);
});

test("fails closed on wrong certified source", () => {
  assert.throws(() => analyzeInspections(snapshot(), "b".repeat(40)),
    /differs from the requested certified source/);
});

test("fails closed on an unavailable 503 response", () => {
  assert.throws(
    () => analyzeInspections({ schema: 1, overallScore: 0, categories: [] }),
    /incomplete or unavailable/,
  );
});

test("fails closed on score arithmetic drift and duplicate check identities", () => {
  const proof = snapshot();
  proof.categories[0].checks[0].earned = 0;
  assert.throws(() => analyzeInspections(proof), /weighted category total/);
  const other = snapshot();
  other.categories[0].checks[1].id = "one";
  assert.throws(() => analyzeInspections(other), /duplicate weighted check/);
  const wrong = snapshot();
  wrong.overallScore = 99;
  assert.throws(() => analyzeInspections(wrong), /overall score disagrees/);
});

test("fails closed on missing timestamps and invalid numerics", () => {
  const proof = snapshot();
  proof.generatedAt = "garbage";
  assert.throws(() => analyzeInspections(proof), /generation timestamp/);
  const other = snapshot();
  other.categories[0].checks[0].earned = Number.NaN;
  assert.throws(() => analyzeInspections(other), /invalid or duplicate weighted check/);
});
