#!/usr/bin/env node
/**
 * Read-only General Inspections evidence/score delta report.
 * Input is the sanitized /api/general-inspections JSON; this command makes no
 * network requests or runtime changes. It refuses missing/partial API snapshots.
 */
import { readFileSync } from "node:fs";

const ONE_DECIMAL = (value) => Math.round(value * 10) / 10;
const SHA = /^[0-9a-f]{40}$/;

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function analyzeInspections(snapshot, expectedRelease = null) {
  if (!snapshot || snapshot.schema !== 1 || !Array.isArray(snapshot.categories) ||
      snapshot.categories.length !== 7 || !finite(snapshot.overallScore)) {
    throw new Error("STOP: incomplete or unavailable General Inspections evidence (seven categories required)");
  }
  if (!SHA.test(String(snapshot.releaseSha || ""))) {
    throw new Error("STOP: snapshot is not bound to an exact 40-digit release SHA");
  }
  if (expectedRelease && snapshot.releaseSha !== expectedRelease) {
    throw new Error("STOP: snapshot release SHA differs from the requested certified source");
  }
  if (!Number.isFinite(Date.parse(snapshot.generatedAt || ""))) {
    throw new Error("STOP: snapshot has no valid generation timestamp");
  }

  const names = new Set();
  const gaps = [];
  let totalScore = 0;

  for (const category of snapshot.categories) {
    if (!category || typeof category.id !== "string" || names.has(category.id) ||
        !finite(category.score) || category.score < 0 || category.score > 100 ||
        !Array.isArray(category.checks) || category.checks.length === 0) {
      throw new Error("STOP: invalid or duplicate category evidence");
    }
    names.add(category.id);
    let weightTotal = 0;
    let earnedTotal = 0;
    const checkIds = new Set();

    for (const check of category.checks) {
      if (!check || typeof check.id !== "string" || checkIds.has(check.id) ||
          !finite(check.weight) || !finite(check.earned) || check.weight <= 0 ||
          check.earned < 0 || check.earned > check.weight + 0.0001) {
        throw new Error("STOP: invalid or duplicate weighted check");
      }
      checkIds.add(check.id);
      weightTotal += check.weight;
      earnedTotal += check.earned;
      const missing = ONE_DECIMAL(check.weight - check.earned);
      if (missing > 0) {
        gaps.push({
          category: String(category.title || category.id),
          categoryId: category.id,
          id: check.id,
          label: String(check.label || check.id),
          missing,
          earned: check.earned,
          weight: check.weight,
          detail: String(check.detail || ""),
          evidenceAt: check.evidenceAt || null,
        });
      }
    }
    if (Math.abs(weightTotal - 100) > 0.01 ||
        Math.abs(Math.round(earnedTotal) - category.score) > 0.01) {
      throw new Error("STOP: weighted category total disagrees with the published category score");
    }
    totalScore += category.score;
  }
  if (Math.round(totalScore / snapshot.categories.length) !== snapshot.overallScore) {
    throw new Error("STOP: overall score disagrees with the seven published categories");
  }
  gaps.sort((a, b) => b.missing - a.missing ||
    a.categoryId.localeCompare(b.categoryId) || a.id.localeCompare(b.id));

  return {
    generatedAt: snapshot.generatedAt,
    releaseSha: snapshot.releaseSha,
    buildVersion: snapshot.buildVersion || null,
    overallScore: snapshot.overallScore,
    categories: snapshot.categories.map(({ id, title, score }) => ({ id, title, score })),
    gaps,
  };
}

function clean(value, limit = 145) {
  return String(value || "").replace(/[\r\n\t\x00-\x1f]+/g, " ").slice(0, limit);
}

export function renderReport(report) {
  const lines = [
    "⚔️  AOE2WAR GENERAL INSPECTIONS — EVIDENCE DELTA",
    "Generated:  " + report.generatedAt,
    "Source:     " + report.releaseSha,
    "Build:      " + (report.buildVersion || "not reported"),
    "Overall:    " + report.overallScore + "/100",
    "",
    "CATEGORY SCORES",
    ...report.categories.map((row) =>
      "  " + row.title + ": " + row.score + "/100"),
    "",
    "LARGEST MISSING CHECK POINTS — NO THRESHOLD ADJUSTMENT",
    ...report.gaps.slice(0, 30).map((row, i) =>
      String(i + 1).padStart(2) + ". " + row.category + " / " +
      clean(row.label, 100) + "  -" + row.missing.toFixed(1) +
      " (" + row.earned + "/" + row.weight + ")" +
      "\n    Evidence: " + clean(row.detail) +
      (row.evidenceAt ? "\n    Captured: " + clean(row.evidenceAt, 60) : "")),
    "",
    "Report reads existing evidence only. Zero application, Wolo, or database mutations.",
  ];
  if (!report.gaps.length) lines.push("Every check has full awarded points.");
  return lines.join("\n") + "\n";
}

function main() {
  const args = process.argv.slice(2);
  const expectedOption = args.find((arg) => arg.startsWith("--expected-release="));
  const expectedRelease = expectedOption ? expectedOption.slice("--expected-release=".length) : null;
  const files = args.filter((arg) => !arg.startsWith("--"));
  if (args.some((arg) => arg.startsWith("--") &&
      arg !== "--stdin" && arg !== expectedOption) || files.length > 1 ||
      (args.includes("--stdin") && files.length)) {
    throw new Error("Usage: node scripts/report_general_inspections.mjs --stdin [--expected-release=<40-character SHA>] OR <json-file>");
  }
  if (expectedRelease && !SHA.test(expectedRelease)) {
    throw new Error("STOP: expected release must be a full SHA");
  }
  const input = args.includes("--stdin") || !files.length
    ? readFileSync(0, "utf8")
    : readFileSync(files[0], "utf8");
  const report = analyzeInspections(JSON.parse(input), expectedRelease);
  process.stdout.write(renderReport(report));
}

if (process.argv[1]?.endsWith("/report_general_inspections.mjs")) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
