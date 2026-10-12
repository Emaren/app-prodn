import assert from "node:assert/strict";
import test from "node:test";
import { formatInspectionEvidence, formatInspectionJson } from "../lib/generalInspections/evidenceExport.ts";
import type { GeneralInspectionsSnapshot } from "../lib/generalInspections/types.ts";

function makeSnapshot(): GeneralInspectionsSnapshot {
  return {
    schema: 1,
    generatedAt: "2026-10-12T02:00:00Z",
    releaseSha: "25e67900b719536a3bc3f042f6f15ed04a4b0af7",
    buildVersion: "20261012012713-61d04e820a",
    overallScore: 77,
    overallState: "amber",
    notes: ["Only published receipts count."],
    categories: [
      {
        id: "release",
        title: "Release & Runtime Integrity",
        description: "Source and evidence",
        score: 54,
        maxScore: 100,
        state: "red",
        checks: [
          {
            id: "doctor",
            label: "Doctor",
            weight: 15,
            earned: 15,
            state: "green",
            detail: "100/100",
          },
          {
            id: "build-parity",
            label: "Runtime parity",
            weight: 10,
            earned: 0,
            state: "red",
            detail: "Bridge/runtime parity pending",
            evidenceAt: "2026-10-12T00:00:00Z",
          },
        ],
      },
    ],
  };
}

test("exports exactly the received inspection scores and missing check evidence", () => {
  const result = formatInspectionEvidence(makeSnapshot());
  assert.match(result, /General Inspections: 77\/100/);
  assert.match(result, /Release & Runtime Integrity: 54\/100/);
  assert.match(result, /build-parity: 0\/10 \| Bridge\/runtime parity pending/);
  assert.match(result, /2026-10-12T00:00:00Z/);
  assert.doesNotMatch(result, /doctor: 15\/15/);
  assert.match(result, /Only published receipts count/);
});

test("preserves zero and unknown categories; does not certify missing proof", () => {
  const data = makeSnapshot();
  data.categories[0].checks[1].earned = 0;
  data.categories[0].checks[1].detail = "Not proven";
  const result = formatInspectionEvidence(data);
  assert.match(result, /Not proven/);
  assert.doesNotMatch(result, /CERTIFIED/);
});

test("UI export copies existing snapshot without additional API calls", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(
    new URL("../components/general-inspections/GeneralInspections.tsx", import.meta.url),
    "utf8",
  );
  assert.match(src, /navigator\.clipboard\.writeText\(formatInspectionEvidence\(snapshot\)\)/);
  assert.match(src, /aria-label="Copy current inspection evidence"/);
  assert.match(src, /Inspection evidence copied/);
});

test("machine-readable export round-trips the exact sanitized snapshot", () => {
  const snapshot = makeSnapshot();
  const encoded = formatInspectionJson(snapshot);
  assert.deepEqual(JSON.parse(encoded), snapshot);
  assert.match(encoded, /"schema": 1/);
  assert.match(encoded, /"evidenceAt": "2026-10-12T00:00:00Z"/);
});

test("UI JSON export uses already-loaded evidence with no second request", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(
    new URL("../components/general-inspections/GeneralInspections.tsx", import.meta.url),
    "utf8",
  );
  assert.match(src, /navigator\.clipboard\.writeText\(formatInspectionJson\(snapshot\)\)/);
  assert.match(src, /aria-label="Copy current inspection JSON"/);
  assert.match(src, /Inspection JSON copied/);
  const copyJson = src.slice(src.indexOf("const copyJson ="), src.indexOf("  return (\n    <main"));
  assert.doesNotMatch(copyJson, /fetch\(|XMLHttpRequest|load\(/);
});
