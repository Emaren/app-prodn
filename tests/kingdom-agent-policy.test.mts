import test from "node:test";
import assert from "node:assert/strict";
import { inspectionAgentState, projectInspectionWatchposts, systemAgentState } from "../lib/kingdomAgentPolicy.ts";
import { INSPECTION_CATEGORY_WEIGHTS, category, check } from "../lib/generalInspections/scoring.ts";
import type { GeneralInspectionsSnapshot } from "../lib/generalInspections/types.ts";

test("inspection watchposts cannot claim green on partial earned points", () => {
  assert.equal(inspectionAgentState("green", 1, "PASS"), "healthy");
  assert.equal(inspectionAgentState("green", 0.95, "PASS"), "watch");
  assert.equal(inspectionAgentState("green", Number.NaN, "PASS"), "watch");
  assert.equal(inspectionAgentState("amber", 1, "PASS"), "watch");
  assert.equal(inspectionAgentState("red", 0, "PASS"), "blocked");
});

test("OS working requires actual active-process evidence", () => {
  assert.equal(systemAgentState("RUNNING", true), "working");
  assert.equal(systemAgentState("RUNNING", false), "watch");
  assert.equal(systemAgentState("ACTIVE", false), "watch");
  assert.equal(systemAgentState("HEALTHY", false), "healthy");
});

test("blocked and unknown never turn healthy from a timestamp", () => {
  assert.equal(systemAgentState("BLOCKED", true), "blocked");
  assert.equal(systemAgentState("FAILED", false), "blocked");
  assert.equal(systemAgentState("UNKNOWN", false), "unknown");
  assert.equal(systemAgentState("", false), "unknown");
});

test("full inspection credit cannot turn stale or unknown evidence healthy", () => {
  assert.equal(inspectionAgentState("green", 1, "STALE"), "unknown");
  assert.equal(inspectionAgentState("green", 1, "UNKNOWN"), "unknown");
});

test("a published failing cohort cannot be hidden by a full weighted score", () => {
  assert.equal(inspectionAgentState("green", 1, "FAIL"), "blocked");
});

test("an expired red observation is unknown rather than a current outage", () => {
  assert.equal(inspectionAgentState("red", 0, "STALE"), "unknown");
});

const OBSERVED = "2026-10-26T12:00:00.000Z";
const NOW = Date.parse(OBSERVED);

function inspection(): GeneralInspectionsSnapshot {
  return {
    schema: 1,
    generatedAt: OBSERVED,
    releaseSha: "a".repeat(40),
    buildVersion: "test-only-build",
    overallScore: 100,
    overallState: "green",
    categories: Object.entries(INSPECTION_CATEGORY_WEIGHTS).map(([id, weights]) =>
      category(id, id, "Synthetic test observations", weights.map((weight, index) =>
        check("test-" + index, "Test " + index, weight, 1, "PASS", { evidenceAt: OBSERVED }),
      )),
    ),
    notes: [],
  };
}

test("fresh watchposts preserve the original score and observation, without claiming producer authentication", () => {
  const snapshot = inspection();
  const before = structuredClone(snapshot);
  const agents = projectInspectionWatchposts(snapshot, NOW);
  assert.equal(agents.length, 66);
  assert.ok(agents.every((row) => row.state === "healthy" && row.evidenceStatus === "PASS"));
  assert.ok(agents.every((row) => row.evidenceAt === OBSERVED));
  assert.ok(agents.every((row) => row.evidenceReason === "scored-full-on-published-evidence"));
  assert.deepEqual(snapshot, before);
});

test("replayed snapshot expires at the read clock even if every check has full credit", () => {
  const snapshot = inspection();
  assert.ok(projectInspectionWatchposts(snapshot, NOW + 6 * 3_600_000)
    .every((row) => row.state === "healthy"));
  const expired = projectInspectionWatchposts(snapshot, NOW + 6 * 3_600_000 + 1);
  assert.ok(expired.every((row) => row.state === "unknown" && row.evidenceStatus === "STALE"));
  assert.ok(expired.every((row) => row.evidenceReason === "stale-snapshot"));
  assert.equal(snapshot.overallScore, 100);
});

test("a fresh snapshot does not renew an old producer observation", () => {
  const snapshot = inspection();
  snapshot.categories[0].checks[0].evidenceAt = "2026-10-18T12:00:00.000Z";
  const agents = projectInspectionWatchposts(snapshot, NOW);
  assert.equal(agents[0].state, "unknown");
  assert.equal(agents[0].evidenceStatus, "STALE");
  assert.equal(agents[0].evidenceReason, "stale-evidence");
  assert.match(agents[0].signal, /^STALE EVIDENCE/);
  assert.equal(agents[1].state, "healthy");
});

test("missing and future producer observations are unknown", () => {
  const snapshot = inspection();
  snapshot.categories[0].checks[0].evidenceAt = null;
  snapshot.categories[0].checks[1].evidenceAt = "2026-10-26T12:06:00.000Z";
  const agents = projectInspectionWatchposts(snapshot, NOW);
  assert.equal(agents[0].state, "unknown");
  assert.equal(agents[0].evidenceReason, "missing-observation-time");
  assert.equal(agents[1].state, "unknown");
  assert.equal(agents[1].evidenceReason, "future-dated-evidence");
});

test("watchposts expose an observed failing ratio even behind a contradictory green state", () => {
  const snapshot = inspection();
  snapshot.categories[0].checks[0].ratio = { passed: 19, total: 20 };
  const agent = projectInspectionWatchposts(snapshot, NOW)[0];
  assert.equal(agent.state, "blocked");
  assert.equal(agent.evidenceStatus, "FAIL");
  assert.equal(agent.evidenceReason, "observed-cohort-failure");
  assert.match(agent.signal, /19\/20 checks/);
  assert.equal(snapshot.overallScore, 100);
});

test("missing source binding and invalid score contracts fail closed for every watchpost", () => {
  for (const mutate of [
    (snapshot: GeneralInspectionsSnapshot) => { snapshot.releaseSha = null; },
    (snapshot: GeneralInspectionsSnapshot) => { snapshot.categories[0].checks[0].weight = 100; },
    (snapshot: GeneralInspectionsSnapshot) => { snapshot.overallScore = 99; },
  ]) {
    const snapshot = inspection();
    mutate(snapshot);
    const agents = projectInspectionWatchposts(snapshot, NOW);
    assert.ok(agents.every((row) => row.state === "unknown" && row.evidenceStatus === "UNKNOWN"));
    assert.ok(agents.every((row) => row.evidenceReason === "invalid-or-unbound-inspection-snapshot"));
  }
});
