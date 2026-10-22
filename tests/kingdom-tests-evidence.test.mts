import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evidenceAge, inspectKingdomTestsEvidence } from "../lib/kingdomTestsEvidence.ts";

const now = Date.parse("2026-10-22T18:00:00.000Z");
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
const fixture = () => ({ schema: 1, generatedAt: at(0), releaseSha: "a".repeat(40), buildVersion: "build-v1", overallScore: 100, categories: [{ id: "tests", score: 100, state: "green", checks: [{ id: "node-tests", label: "Node contracts", state: "green", earned: 100, evidenceAt: at(1), detail: "PASS" }] }] });

test("fresh, green, 100-scored readiness claims never become independently verified tests", () => {
  const found = inspectKingdomTestsEvidence(fixture(), now);
  assert.equal(found.state, "CLAIMS_ONLY");
  assert.equal(found.independentlyVerified, null);
  assert.equal(found.checks[0].age, "DATED_CLAIM");
  assert.equal(found.checks[0].reportedState, "GREEN");
  assert.ok(!("score" in found));
});

test("fresh transport cannot renew ancient underlying proof", () => {
  const input = fixture(); input.categories[0].checks[0].evidenceAt = "2020-01-01T00:00:00.000Z";
  const found = inspectKingdomTestsEvidence(input, now);
  assert.equal(found.assemblyAge, "DATED_CLAIM");
  assert.equal(found.checks[0].age, "STALE");
});

test("future evidence is not current", () => {
  const input = fixture(); input.categories[0].checks[0].evidenceAt = "2099-01-01T00:00:00.000Z";
  assert.equal(inspectKingdomTestsEvidence(input, now).checks[0].age, "FUTURE");
  assert.equal(evidenceAge("2099-01-01T00:00:00.000Z", now), "FUTURE");
});

test("malformed timestamps remain UNKNOWN, never measured zero", () => {
  const input = fixture(); delete (input.categories[0].checks[0] as {evidenceAt?: string}).evidenceAt;
  assert.equal(inspectKingdomTestsEvidence(input, now).checks[0].age, "UNKNOWN");
});

test("missing release identity is explicit even when source looks green", () => {
  const input = fixture(); input.releaseSha = "not-a-sha";
  assert.equal(inspectKingdomTestsEvidence(input, now).releaseSha, null);
});

test("missing test category does not create fabricated empty test results", () => {
  const input = fixture(); input.categories = [];
  const found = inspectKingdomTestsEvidence(input, now);
  assert.equal(found.state, "UNAVAILABLE");
  assert.deepEqual(found.checks, []);
});

test("duplicate identities are rejected, not counted twice", () => {
  const input = fixture(); input.categories[0].checks.push({ ...input.categories[0].checks[0] });
  assert.equal(inspectKingdomTestsEvidence(input, now).state, "UNAVAILABLE");
});

test("overlarge data or wrong schema is rejected", () => {
  assert.equal(inspectKingdomTestsEvidence({ schema: 2, categories: [] }, now).state, "UNAVAILABLE");
  const input = fixture(); input.categories[0].checks = Array(41).fill(input.categories[0].checks[0]);
  assert.equal(inspectKingdomTestsEvidence(input, now).state, "UNAVAILABLE");
});

test("reported failure is not silently upgraded to PASS", () => {
  const input = fixture(); input.categories[0].checks[0].state = "red";
  const found = inspectKingdomTestsEvidence(input, now);
  assert.equal(found.checks[0].reportedState, "RED");
  assert.equal(found.independentlyVerified, null);
});

test("route keeps shared instrument and adds on-demand read-only evidence inspector", () => {
  const page = readFileSync("app/kingdom-tests/page.tsx", "utf8");
  const component = readFileSync("components/kingdom-tests/KingdomTestProofPanel.tsx", "utf8");
  assert.match(page, /<KingdomInstruments kind="tests"\s*\/>/);
  assert.match(page, /<KingdomTestProofPanel\s*\/>/);
  assert.match(component, /\/api\/general-inspections/);
  assert.match(component, /AbortController/);
  assert.match(component, /type="button"/);
  assert.doesNotMatch(component, /setInterval|method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
});

test("duplicate test categories cannot select an ambiguous authority", () => {
  const input = fixture(); input.categories.push({ ...input.categories[0] });
  assert.equal(inspectKingdomTestsEvidence(input, now).state, "UNAVAILABLE");
});

test("invalid calendar dates are not accepted as proof timestamps", () => {
  assert.equal(evidenceAge("2026-02-30T12:00:00.000Z", now), "UNKNOWN");
});
