import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectIntelligenceHealthEvidence } from "../lib/kingdomIntelligenceEvidence.ts";
import { compareReportedToCertifiedRuntime, explainKingdomOperationalState } from "../lib/kingdomOperationalDiagnostics.ts";
import { writeAoe2OsKingdomIntelligence } from "../lib/aoe2Os.ts";
import { loadPublicKingdomIntelligence } from "../lib/kingdomIntelligencePublic.ts";
import { buildWorkshopBrainSnapshot } from "../lib/workshopBrain.ts";

const NOW = Date.parse("2026-10-25T16:00:00.000Z");
const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
const ID = "xqX6Oi-zV5gSKH1kIC4zC";
const at = (time: number) => new Date(time).toISOString();

function reported(overrides: Record<string, unknown> = {}) {
  return inspectIntelligenceHealthEvidence({
    source: { exact: true, production: { source_sha: SHA, build_id: ID }, certification: { status: "CERTIFIED" } },
    health: { p0: 0, p1: 0, doctor_status: "ATTENTION" },
    invariants: [],
    capturedAt: at(NOW - 10_000),
    receivedAt: at(NOW - 5_000),
    nowMs: NOW,
    ...overrides,
  }).observation;
}
const certified = {
  sourceSha: SHA, nextBuildId: ID, observedAt: at(NOW - 3_000),
  ttlSeconds: 900, certificateStatus: "CERTIFIED" as const,
};

test("independent source/build equality is MATCH_REPORTED, never a certificate by itself", () => {
  assert.equal(compareReportedToCertifiedRuntime(reported(), certified, NOW), "MATCH_REPORTED");
  assert.equal(explainKingdomOperationalState({ available: true, observation: reported(), nowMs: NOW })[0].code,
    "independent-runtime-verification-unavailable");
});

test("full 40-hex SHA is mandatory; prefixes and case normalization never manufacture a match", () => {
  assert.equal(compareReportedToCertifiedRuntime(reported(), { ...certified, sourceSha: OTHER }, NOW), "SOURCE_MISMATCH");
  assert.equal(compareReportedToCertifiedRuntime(reported(), { ...certified, sourceSha: SHA.slice(0, 12) }, NOW), "UNKNOWN");
  assert.equal(compareReportedToCertifiedRuntime(reported(), { ...certified, sourceSha: SHA.toUpperCase() }, NOW), "MATCH_REPORTED");
});

test("actual Next BUILD_ID must agree; a public buildVersion is not an acceptable substitute", () => {
  assert.equal(compareReportedToCertifiedRuntime(reported(), { ...certified, nextBuildId: "another-build" }, NOW), "BUILD_MISMATCH");
  assert.equal(compareReportedToCertifiedRuntime(reported(), { ...certified, nextBuildId: null }, NOW), "UNKNOWN");
  assert.equal(compareReportedToCertifiedRuntime(reported(), { ...certified, nextBuildId: "path/secret" }, NOW), "UNKNOWN");
  assert.equal(compareReportedToCertifiedRuntime(reported({ source: { exact: true, production: { source_sha: SHA } } }), certified, NOW), "UNKNOWN");
});

test("HELD, missing, future, stale, untrusted observations cannot be promoted", () => {
  assert.equal(compareReportedToCertifiedRuntime(reported(), null, NOW), "UNKNOWN");
  assert.equal(compareReportedToCertifiedRuntime(reported(), { ...certified, certificateStatus: "HELD" }, NOW), "UNKNOWN");
  assert.equal(compareReportedToCertifiedRuntime(reported(), { ...certified, ttlSeconds: 0 }, NOW), "UNKNOWN");
  assert.equal(compareReportedToCertifiedRuntime(reported(), { ...certified, observedAt: at(NOW + 31_000) }, NOW), "UNKNOWN");
  assert.equal(compareReportedToCertifiedRuntime(reported(), { ...certified, observedAt: at(NOW - 901_000) }, NOW), "STALE");
  assert.equal(compareReportedToCertifiedRuntime(reported({ capturedAt: at(NOW - 901_000) }), certified, NOW), "UNKNOWN");
});

test("bounded typed incident explains source owner, affected pages, age, TTL, status and safe action", () => {
  const observation = reported({ health: { p0: 0, p1: null } });
  const incidents = explainKingdomOperationalState({ available: true, observation, nowMs: NOW });
  assert.equal(incidents[0].code, "p0-p1-missing-or-invalid");
  assert.equal(incidents[0].status, "UNKNOWN");
  assert.equal(incidents[0].owner, "Kingdom Intelligence");
  assert.deepEqual(incidents[0].dependencyIds, ["intelligence"]);
  assert.ok(incidents[0].affectedRoutes.includes("/workshop"));
  assert.ok(incidents[0].affectedRoutes.includes("/kingdom-brain"));
  assert.equal(incidents[0].evidence.ageSeconds, 10);
  assert.equal(incidents[0].evidence.ttlSeconds, 900);
  assert.equal(incidents[0].evidence.evidenceUri, null);
  assert.equal(incidents[0].nextAction, "RECHECK_BRIDGE_READ_ONLY");
  assert.equal(incidents.at(-1)?.owner, "Release OS");
  assert.match(incidents.at(-1)?.safeAction ?? "", /protected release control/);
});

test("contradictions, stale evidence, absent service and full identity conflicts remain explained", () => {
  const contradicted = reported({
    health: { p0: 0, p1: 4 },
    invariants: [{ key: "estate-p1-zero", status: "PASS" }],
  });
  assert.equal(contradicted.status, "CONTRADICTORY");
  assert.equal(explainKingdomOperationalState({ available: true, observation: contradicted, nowMs: NOW })[0].status, "CONTRADICTORY");
  const stale = reported({ capturedAt: at(NOW - 901_000) });
  assert.equal(explainKingdomOperationalState({ available: true, observation: stale, nowMs: NOW })[0].status, "STALE");
  assert.equal(explainKingdomOperationalState({ available: false, observation: null, nowMs: NOW })[0].status, "UNAVAILABLE");
  const compared = explainKingdomOperationalState({ available: true, observation: reported(), nowMs: NOW, identityComparison: "SOURCE_MISMATCH" });
  assert.equal(compared.at(-1)?.status, "SOURCE_MISMATCH");
  assert.deepEqual(compared.at(-1)?.dependencyIds, ["release", "intelligence"]);
});

test("incident output is capped and cannot reflect arbitrary private bridge paths or URLs", () => {
  const obs = { ...reported(), unknownReasons: [...Array.from({ length: 40 }, (_, i) => "sensitive-" + i)], evidenceUri: null };
  const incidents = explainKingdomOperationalState({ available: true, observation: obs, nowMs: NOW });
  assert.ok(incidents.length <= 8);
  assert.doesNotMatch(JSON.stringify(incidents), /\/Users\/|\/mnt\/private|http:\/\//);
  assert.ok(incidents.every(v => v.evidence.evidenceUri === null));
});

async function store<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aoe2war-kingdom-diagnostics-"));
  const previous = process.env.AOE2WAR_OS_STORE_DIR;
  process.env.AOE2WAR_OS_STORE_DIR = dir;
  try { return await fn(); }
  finally {
    if (previous === undefined) delete process.env.AOE2WAR_OS_STORE_DIR;
    else process.env.AOE2WAR_OS_STORE_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}
function payload(overrides: Record<string, unknown> = {}) {
  return {
    kind: "aoe2war-kingdom-intelligence",
    generated_at: new Date().toISOString(),
    operating_state: "HEALTHY",
    source: { exact: true, production: { source_sha: SHA, build_id: ID }, certification: { status: "CERTIFIED" } },
    health: { p0: 0, p1: 0, estate: "HEALTHY", doctor_status: "HEALTHY", doctor_score: 100 },
    system_agents: [{ key: "doctor", label: "System Doctor", state: "ACTIVE", summary: "Doctor running", active_process: true }],
    invariants: [{ key: "source-authority-exact", status: "PASS" }, { key: "estate-p0-zero", status: "PASS" }],
    best_next_action: { title: "Inspect current source", key: "source" },
    ...overrides,
  };
}
async function observed(sourcePayload: Record<string, unknown>) {
  return store(async () => {
    await writeAoe2OsKingdomIntelligence({ bridgeId: "round3-fixture", sourceAction: "brain", payload: sourcePayload });
    const intelligence = await loadPublicKingdomIntelligence();
    return { intelligence, workshop: buildWorkshopBrainSnapshot(intelligence) };
  });
}

test("real zero survives bridge -> sanitized API contract -> Workshop without source self-certification", async () => {
  const { intelligence, workshop } = await observed(payload());
  assert.equal(intelligence.health?.p0, 0);
  assert.equal(intelligence.health?.p1, 0);
  assert.equal(workshop.p0, 0);
  assert.equal(workshop.p1, 0);
  assert.equal(workshop.sourceExact, false);
  assert.equal(workshop.certificationStatus, "UNVERIFIED");
  assert.equal(intelligence.source?.exact, false);
  assert.equal(intelligence.source?.reportedExact, true);
  assert.equal(intelligence.operatingState, "UNKNOWN");
  assert.equal(intelligence.invariants.find(x => x.key === "source-authority-exact")?.status, "UNKNOWN");
  assert.ok(intelligence.diagnostics.length > 0);
  assert.equal(workshop.diagnostics[0]?.code, "independent-runtime-verification-unavailable");
});

test("missing, future, stale or contradictory bridge evidence cannot leave healthy process indicators or counts", async () => {
  const bad = [
    payload({ health: { p0: 0 } }),
    payload({ generated_at: new Date(Date.now() + 60_000).toISOString() }),
    payload({ generated_at: new Date(Date.now() - 60 * 60_000).toISOString() }),
    payload({ health: { p0: 0, p1: 3, estate: "HEALTHY", doctor_status: "HEALTHY", doctor_score: 100 },
      invariants: [{ key: "estate-p1-zero", status: "PASS" }] }),
  ];
  for (const entry of bad) {
    const { intelligence, workshop } = await observed(entry);
    assert.equal(intelligence.health?.p0, null);
    assert.equal(intelligence.health?.p1, null);
    assert.equal(intelligence.health?.doctorScore, null);
    assert.equal(intelligence.operatingState, "UNKNOWN");
    assert.equal(intelligence.systemAgents[0]?.state, "UNKNOWN");
    assert.equal(intelligence.systemAgents[0]?.activeProcess, false);
    assert.equal(workshop.p0, null);
    assert.equal(workshop.p1, null);
    assert.equal(workshop.activeSystemCount, null);
    assert.equal(workshop.doctorScore, null);
    assert.ok(workshop.diagnostics.length >= 1);
  }
});

test("consumer wiring is read-only and Brain policy remains source/freshness graph rather than another scanner", async () => {
  const page = await readFile(new URL("../app/kingdom-intelligence/page.tsx", import.meta.url), "utf8");
  const workshop = await readFile(new URL("../components/workshop/WorkshopBrainPanel.tsx", import.meta.url), "utf8");
  const client = await readFile(new URL("../app/kingdom-brain/KingdomBrainClient.tsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../app/api/kingdom-intelligence/route.ts", import.meta.url), "utf8");
  assert.match(page, /NO INDEPENDENT CERTIFICATE/);
  assert.match(workshop, /primaryIncident\.safeAction/);
  assert.match(workshop, /evidence\.ageSeconds/);
  assert.match(api, /loadPublicKingdomIntelligence\(\)/);
  assert.match(client, /brainSignalPolicy/);
  assert.doesNotMatch(client, /fetch\([^\n]*method:\s*["']POST/);
});
