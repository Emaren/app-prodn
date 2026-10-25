import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildWorkshopBrainSnapshot } from "../lib/workshopBrain.ts";
import type { PublicKingdomIntelligence } from "../lib/kingdomIntelligencePublic.ts";

// Workshop consumes an already sanitized report; it must never reconstruct
// missing facts or certify the report using flags supplied by the same bridge.
function source(input: {
  p0?: number | null;
  p1?: number | null;
  status?: "SOURCE_REPORTED" | "UNKNOWN" | "STALE" | "CONTRADICTORY";
  stale?: boolean;
  operatingState?: string;
  doctorScore?: number | null;
  reportedExact?: boolean;
  health?: boolean;
} = {}): PublicKingdomIntelligence {
  const {
    status = "SOURCE_REPORTED", stale = false,
    operatingState = "ATTENTION", doctorScore = 59,
    reportedExact = true, health = true,
  } = input;
  // An explicitly present undefined means a missing source field, NOT zero.
  const p0 = Object.prototype.hasOwnProperty.call(input, "p0") ? input.p0 : 0;
  const p1 = Object.prototype.hasOwnProperty.call(input, "p1") ? input.p1 : 0;
  return {
    available: true,
    stale,
    operatingState,
    warDate: "2026.298.1300Z",
    source: {
      exact: reportedExact,
      productionRelease: "a".repeat(12),
      certificationStatus: "CERTIFIED", // Self-reported, must never become proof.
    },
    health: health ? {
      p0,
      p1,
      doctorScore,
      doctorStatus: "ATTENTION",
      estate: "ATTENTION",
      observation: {
        status,
        sourceGitSha: "a".repeat(40),
        buildId: "xqX6Oi-zV5gSKH1kIC4zC",
        collectorAuthority: "aoe2war-operator-bridge",
        producer: "kingdom-intelligence-brain",
        observedAt: "2026-10-25T13:00:00.000Z",
        receivedAt: "2026-10-25T13:00:02.000Z",
        ttlSeconds: 900,
        evidenceUri: null,
        limitations: ["Not independently certified"],
        unknownReasons: [],
      },
    } : null,
    directive: null,
    invariants: [],
    systemAgents: [],
  } as unknown as PublicKingdomIntelligence;
}

test("unavailable Workshop source retains unknown severity rather than zero", () => {
  for (const value of [null, undefined]) {
    const view = buildWorkshopBrainSnapshot(value);
    assert.equal(view.available, false);
    assert.equal(view.operatingState, "UNKNOWN");
    assert.equal(view.doctorScore, null);
    assert.equal(view.p0, null);
    assert.equal(view.p1, null);
    assert.equal(view.sourceExact, false);
  }
});

test("measured zero stays zero and severity count does not become a boolean", () => {
  const view = buildWorkshopBrainSnapshot(source({ p0: 0, p1: 0 }));
  assert.equal(view.available, true);
  assert.equal(view.stale, false);
  assert.equal(view.p0, 0);
  assert.equal(view.p1, 0);
  assert.equal(view.doctorScore, 59);
  // Measured zero incidents does not establish zero live agents.
  assert.equal(view.activeSystemCount, null);
  assert.equal(view.attentionSystemCount, null);
});

test("known nonzero P0/P1 are displayed without threshold manipulation", () => {
  const view = buildWorkshopBrainSnapshot(source({ p0: 2, p1: 4 }));
  assert.equal(view.p0, 2);
  assert.equal(view.p1, 4);
});

test("missing or invalid severity never becomes zero even if sibling count is zero", () => {
  const bad: Array<[number | null | undefined, number | null | undefined]> = [
    [null, 0], [0, null], [null, null], [undefined, 0], [0, undefined],
    [-1, 0], [1.3, 0], [0, Number.POSITIVE_INFINITY],
  ];
  for (const [p0, p1] of bad) {
    const view = buildWorkshopBrainSnapshot(source({ p0, p1 }));
    assert.equal(view.p0, null, String(p0) + ":" + String(p1));
    assert.equal(view.p1, null, String(p0) + ":" + String(p1));
    assert.equal(view.doctorScore, null);
    assert.equal(view.doctorStatus, "UNKNOWN");
  }
  const withoutHealth = buildWorkshopBrainSnapshot(source({ health: false }));
  assert.equal(withoutHealth.p0, null);
  assert.equal(withoutHealth.p1, null);
  assert.equal(withoutHealth.doctorScore, null);
});

test("old collection and invalid or contradictory adapter classifications fail closed", () => {
  const stale = buildWorkshopBrainSnapshot(source({ stale: true, p0: 0, p1: 0, operatingState: "HEALTHY" }));
  assert.equal(stale.p0, null);
  assert.equal(stale.p1, null);
  assert.equal(stale.doctorScore, null);
  assert.equal(stale.operatingState, "UNKNOWN");
  for (const status of ["UNKNOWN", "STALE", "CONTRADICTORY"] as const) {
    const view = buildWorkshopBrainSnapshot(source({ status, p0: 0, p1: 0, operatingState: "HEALTHY" }));
    assert.equal(view.p0, null, status);
    assert.equal(view.p1, null, status);
    assert.equal(view.doctorScore, null, status);
    assert.equal(view.doctorStatus, "UNKNOWN");
    assert.equal(view.operatingState, "UNKNOWN");
  }
});

test("a report's own certification/exactness assertion is not an independent release seal", () => {
  const view = buildWorkshopBrainSnapshot(source({ reportedExact: true }));
  assert.equal(view.sourceExact, false);
  assert.equal(view.certificationStatus, "UNVERIFIED");
  assert.equal(view.productionRelease, "a".repeat(12)); // Source reported, not independently proven.
});

test("all three Workshop variants reuse the same sanitized snapshot and honest severity UI", () => {
  const experience = readFileSync(new URL("../components/workshop/WorkshopExperience.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../components/workshop/WorkshopBrainPanel.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/workshop/page.tsx", import.meta.url), "utf8");
  const adapter = readFileSync(new URL("../lib/workshopBrain.ts", import.meta.url), "utf8");
  assert.equal((experience.match(/<WorkshopBrainPanel brain=\{brain\} \/>/g) ?? []).length, 3);
  assert.match(page, /buildWorkshopBrainSnapshot\(kingdomIntelligence\)/);
  assert.match(panel, /brain\.p0 \?\? "UNKNOWN"/);
  assert.match(panel, /brain\.p1 \?\? "UNKNOWN"/);
  assert.match(panel, /not independently certified/);
  assert.match(adapter, /observation\?\.status === "SOURCE_REPORTED"/);
  assert.doesNotMatch(adapter, /data\.health\?\.p0\s*\?\?\s*0/);
  assert.doesNotMatch(adapter, /data\.health\?\.p1\s*\?\?\s*0/);
});

test("the public Intelligence API and Workshop SSR share the existing sanitized bridge, no redundant scanner or writes", () => {
  const page = readFileSync(new URL("../app/workshop/page.tsx", import.meta.url), "utf8");
  const kiApi = readFileSync(new URL("../app/api/kingdom-intelligence/route.ts", import.meta.url), "utf8");
  assert.match(page, /loadPublicKingdomIntelligence\(\)\.catch\(\(\) => null\)/);
  assert.match(kiApi, /loadPublicKingdomIntelligence\(\)/);
  assert.doesNotMatch(page, /buildGeneralInspectionsSnapshot|fetch\(|method:\s*["']POST/);
});
