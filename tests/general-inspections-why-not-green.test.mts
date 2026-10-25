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

test("preserves published score but flags an expired Test & Build gate as unknown", () => {
  const snap = fixture();
  const tests = snap.categories.find((c) => c.id === "tests")!;
  tests.checks.forEach((item) => { item.evidenceAt = OLD; });
  const report = buildWhyNotGreenReport(snap);
  assert.equal(report.observedOverallScore, 100);
  assert.equal(report.totalMissingCategoryPoints, 0);
  assert.equal(report.matrix.find((c) => c.id === "tests")?.status, "unknown");
  assert.equal(report.gaps.find((g) => g.categoryId === "tests")?.reason, "stale-evidence");
  assert.equal(report.gaps.find((g) => g.categoryId === "tests")?.ttlHours, 168);
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

test("full-credit but failing cohort ratio is explicitly FAIL, without changing score", () => {
  const snap = fixture();
  const cohort = snap.categories.find((c) => c.id === "speed")!.checks[0];
  cohort.ratio = { passed: 19, total: 20, label: "cold-browser cohort" };
  const report = buildWhyNotGreenReport(snap);
  assert.equal(report.observedOverallScore, 100);
  assert.equal(report.measuredHealthChanged, false);
  const row = report.evidenceChecks.find((c) => c.checkKey === "speed/check-0")!;
  assert.equal(row.evidenceStatus, "FAIL");
  assert.equal(row.reason, "observed-cohort-failure");
  assert.equal(row.earned, row.weight);
  assert.equal(report.gaps.find((g) => g.checkKey === row.checkKey)?.missingPoints, 0);
  assert.equal(report.matrix.find((c) => c.id === "speed")?.status, "fail");
  assert.match(row.owner, /SpeedOS/);
  assert.match(row.repair, /cold-phone/);
});

test("complete check ledger distinguishes STALE, UNKNOWN, FAIL and PASS with exact TTL due date", () => {
  const snap = fixture();
  const speed = snap.categories.find((c) => c.id === "speed")!.checks;
  speed[0].evidenceAt = OLD; // 12 days expired
  speed[1].evidenceAt = null;
  speed[2].ratio = { passed: 0, total: 4, label: "replayed images" };
  const report = buildWhyNotGreenReport(snap);
  assert.equal(report.evidenceChecks.length, Object.values(INSPECTION_CATEGORY_WEIGHTS).reduce((n, weights) => n + weights.length, 0));
  const first = report.evidenceChecks.find((c) => c.checkKey === "speed/check-0")!;
  assert.equal(first.evidenceStatus, "STALE");
  assert.equal(first.nextDueAt, "2026-10-20T12:00:00.000Z");
  assert.equal(report.gaps.find((c) => c.checkKey === first.checkKey)?.status, "unknown"); // v1 compatibility
  assert.equal(report.evidenceChecks.find((c) => c.checkKey === "speed/check-1")?.evidenceStatus, "UNKNOWN");
  assert.equal(report.evidenceChecks.find((c) => c.checkKey === "speed/check-2")?.evidenceStatus, "FAIL");
  assert.equal(report.evidenceChecks.find((c) => c.checkKey === "speed/check-3")?.evidenceStatus, "PASS");
  assert.equal(report.matrix.find((c) => c.id === "speed")?.staleChecks, 1);
  assert.equal(report.matrix.find((c) => c.id === "speed")?.failedChecks, 1);
  assert.equal(report.matrix.find((c) => c.id === "speed")?.unknownChecks, 1);
});

test("missing-time failing ratio remains UNKNOWN, never asserted as current FAIL", () => {
  const snap = fixture();
  const cohort = snap.categories.find((c) => c.id === "speed")!.checks[0];
  cohort.evidenceAt = null;
  cohort.ratio = { passed: 1, total: 3 };
  const report = buildWhyNotGreenReport(snap);
  const row = report.evidenceChecks.find((c) => c.checkKey === "speed/check-0")!;
  assert.equal(row.evidenceStatus, "UNKNOWN");
  assert.equal(row.reason, "missing-observation-time");
  assert.equal(row.nextDueAt, null);
  assert.equal(report.matrix.find((c) => c.id === "speed")?.failedChecks, 0);
});

test("malformed cohort ratios are never accepted as observed FAIL", () => {
  const snap = fixture();
  const speed = snap.categories.find((c) => c.id === "speed")!.checks[0];
  speed.earned = 0;
  speed.ratio = { passed: 100, total: 1 };
  rescore(snap);
  const report = buildWhyNotGreenReport(snap);
  assert.equal(report.evidenceChecks.find((c) => c.checkKey === "speed/check-0")?.evidenceStatus, "UNKNOWN");
  assert.equal(report.gaps.find((c) => c.checkKey === "speed/check-0")?.reason, "invalid-cohort-ratio");
  const fullScore = fixture();
  fullScore.categories.find((c) => c.id === "speed")!.checks[0].ratio = { passed: 10, total: 0 };
  const fullReport = buildWhyNotGreenReport(fullScore);
  assert.equal(fullReport.observedOverallScore, 100);
  assert.equal(fullReport.evidenceChecks.find((c) => c.checkKey === "speed/check-0")?.evidenceStatus, "UNKNOWN");
  assert.equal(fullReport.gaps.find((c) => c.checkKey === "speed/check-0")?.missingPoints, 0);
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
  assert.equal(docsGap.owner, "Central/DocsV2-single-writer");
  assert.equal(report.matrix.find((c) => c.id === "release")?.status, "fail");
  assert.equal(report.gaps.find((g) => g.checkId === "estate-findings")?.reason, "observed-invariant-gap");
  assert.equal(report.totalMissingCategoryPoints, 30);
});

test("a replayed snapshot becomes STALE at request time without laundering old 100-point credit", () => {
  const snap = fixture();
  const time = Date.parse(NOW) + 7 * 3_600_000;
  const report = buildWhyNotGreenReport(snap, time);
  assert.equal(report.observedOverallScore, 100);
  assert.equal(report.totalMissingCategoryPoints, 0);
  assert.equal(report.snapshotEvidenceStatus, "STALE");
  assert.equal(report.snapshotAgeHours, 7);
  assert.equal(report.evaluatedAt, "2026-10-25T19:00:00.000Z");
  assert.equal(report.evidenceChecks.length, Object.values(INSPECTION_CATEGORY_WEIGHTS).reduce((n, weights) => n + weights.length, 0));
  assert.ok(report.evidenceChecks.every((row) => row.evidenceStatus === "STALE" && row.reason === "stale-snapshot"));
  assert.ok(report.matrix.every((category) => category.evidenceStatus === "STALE"));
  assert.equal(report.measuredHealthChanged, false);
  assert.equal(report.evidenceChecks[0].originalProducerReceiptId, null);
  assert.equal(report.evidenceChecks[0].originalProducerReceiptDigest, null);
  assert.equal(report.evidenceChecks[0].claimedReleaseSha, SHA);
});

test("live statfs and immutable certifications require original observation times", () => {
  const snap = fixture();
  const org = snap.categories.find((c) => c.id === "organization")!.checks[0];
  org.id = "root-free";
  org.evidenceAt = null;
  const cert = snap.categories.find((c) => c.id === "release")!.checks[0];
  cert.id = "certified";
  cert.evidenceAt = null;
  const report = buildWhyNotGreenReport(snap);
  const statfs = report.evidenceChecks.find((c) => c.checkKey === "organization/root-free")!;
  assert.equal(statfs.evidenceStatus, "UNKNOWN");
  assert.equal(statfs.reason, "missing-observation-time");
  assert.equal(statfs.ttlHours, 6);
  const certified = report.evidenceChecks.find((c) => c.checkKey === "release/certified")!;
  assert.equal(certified.evidenceStatus, "UNKNOWN");
  assert.equal(certified.reason, "missing-observation-time");
  assert.equal(certified.ttlHours, null);
  assert.equal(report.observedOverallScore, 100); // zero score rewriting
});

test("actual live capacity deficit is FAIL but aged bridge fallback is UNKNOWN", () => {
  const snap = fixture();
  const organization = snap.categories.find((c) => c.id === "organization")!;
  const root = organization.checks[0];
  root.id = "root-free";
  root.earned = 0;
  root.detail = "3.00 GiB free";
  const volume = organization.checks[1];
  volume.id = "volume-used";
  volume.earned = 0;
  volume.detail = "92.0% used · live VPS";
  rescore(snap);
  const measured = buildWhyNotGreenReport(snap);
  assert.equal(measured.evidenceChecks.find((x) => x.checkKey === "organization/root-free")?.evidenceStatus, "FAIL");
  assert.equal(measured.evidenceChecks.find((x) => x.checkKey === "organization/volume-used")?.evidenceStatus, "FAIL");
  volume.detail = "92.0% used · operator bridge fallback";
  const fallback = buildWhyNotGreenReport(snap);
  assert.equal(fallback.evidenceChecks.find((x) => x.checkKey === "organization/volume-used")?.evidenceStatus, "UNKNOWN");
  assert.equal(fallback.evidenceChecks.find((x) => x.checkKey === "organization/volume-used")?.reason, "degraded-fallback-capacity-proof");
  assert.equal(fallback.observedOverallScore, measured.observedOverallScore);
});

test("request-clock skew and invalid times cannot promote cached snapshots to current proof", () => {
  const snap = fixture();
  const futureSkew = buildWhyNotGreenReport(snap, Date.parse(NOW) - 6 * 60_000);
  assert.equal(futureSkew.snapshotEvidenceStatus, "UNKNOWN");
  assert.equal(futureSkew.evidenceChecks[0].reason, "future-dated-snapshot");
  assert.throws(() => buildWhyNotGreenReport(snap, NaN), /Incomplete or unbound/);
  assert.throws(() => buildWhyNotGreenReport(snap, Infinity), /Incomplete or unbound/);
  const fresh = buildWhyNotGreenReport(snap, Date.parse(NOW) + 60_000);
  assert.equal(fresh.snapshotEvidenceStatus, "PASS");
  assert.equal(fresh.evidenceChecks[0].evidenceStatus, "PASS");
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
  assert.match(src, /buildWhyNotGreenReport\\(snapshot, Date\\.now\\(\\)\\)/);
  assert.match(src, /Cache-Control/);
});
