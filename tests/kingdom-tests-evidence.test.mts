import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { spawnSync } from "node:child_process";
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
  assert.match(component, /getReader\(\)/);
  assert.match(component, /reader\.cancel\(\)/);
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

test("server-claimed execution and pass counts never enter independently verified state", () => {
  const injected = { ...fixture(), passed: 9999, executed: 9999, certified: true, coverage: 100, kind: "certified" };
  const found = inspectKingdomTestsEvidence(injected, now);
  assert.equal(found.state, "CLAIMS_ONLY");
  assert.equal(found.independentlyVerified, null);
  assert.ok(!("passed" in found));
  assert.ok(!("coverage" in found));
  assert.ok(!("certified" in found));
});

test("zero declared checks is not falsely converted into zero verified executions", () => {
  const input = fixture();
  input.categories[0].checks = [];
  const found = inspectKingdomTestsEvidence(input, now);
  assert.equal(found.state, "CLAIMS_ONLY");
  assert.equal(found.checks.length, 0);
  assert.equal(found.independentlyVerified, null);
});

test("an ancient check and a future assembled response remain independent observations", () => {
  const input = fixture();
  input.generatedAt = "2099-01-01T00:00:00.000Z";
  input.categories[0].checks[0].evidenceAt = "2019-01-01T00:00:00.000Z";
  const found = inspectKingdomTestsEvidence(input, now);
  assert.equal(found.assemblyAge, "FUTURE");
  assert.equal(found.checks[0].age, "STALE");
});

test("non-object and malformed check rows fail closed instead of rendering", () => {
  const input = { ...fixture(), categories: [{ id: "tests", checks: [null, false, "bad"] }] };
  assert.equal(inspectKingdomTestsEvidence(input, now).state, "UNAVAILABLE");
});

test("more than thirty-two declared source categories is rejected", () => {
  const input = { ...fixture(), categories: Array.from({length: 33}, (_, i) => ({id: i === 0 ? "tests" : String(i), checks: []})) };
  assert.equal(inspectKingdomTestsEvidence(input, now).state, "UNAVAILABLE");
});

test("hostile display text remains a bounded source-claim string without HTML interpretation", () => {
  const injected = {
    ...fixture(),
    categories: [{id: "tests", checks: [{
      id: "evil", label: "<img src=x onerror=alert(1)>",
      detail: "<script>window.__owned=1</script>", state: "green",
      evidenceAt: at(2),
    }]}],
  };
  const found = inspectKingdomTestsEvidence(injected, now);
  assert.equal(found.state, "CLAIMS_ONLY");
  assert.equal(found.checks[0].label, "<img src=x onerror=alert(1)>");
  assert.equal(found.checks[0].detail, "<script>window.__owned=1</script>");
  assert.equal(found.independentlyVerified, null);
});

test("keyboard inspection trigger remains focusable while waiting, with explicit cancel", () => {
  const source = readFileSync("components/kingdom-tests/KingdomTestProofPanel.tsx", "utf8");
  assert.match(source, /function cancelInspection\(\)/);
  assert.match(source, /active\.current = null;\s*previous\?\.abort\(\)/);
  assert.match(source, /"Cancel inspection"/);
  assert.doesNotMatch(source, /disabled=\{state === "loading"\}/);
  assert.match(source, /Inspection cancelled; no evidence result was retained/);
});

test("optional source reader is bounded, read-only, and generation-fenced", () => {
  const source = readFileSync("components/kingdom-tests/KingdomTestProofPanel.tsx", "utf8");
  assert.match(source, /READ_DEADLINE_MS = 10_000/);
  assert.match(source, /bytes > 256_000/);
  assert.match(source, /await reader\.cancel\(\)/);
  assert.match(source, /active\.current !== controller \|\| controller\.signal\.aborted/);
  assert.match(source, /credentials: "same-origin"/);
  assert.doesNotMatch(source, /setInterval|method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
});

test("real Next acceptance script is syntactically valid Python without writing generated files", () => {
  const script = "tests/kingdom-tests-next-acceptance.py";
  const result = spawnSync("python3", ["-c", "import ast,pathlib;ast.parse(pathlib.Path(" + JSON.stringify(script) + ").read_text())"], {encoding:"utf8", timeout:15000});
  assert.equal(result.status, 0, result.stderr || result.error?.message || "Python parse failed");
});

test("CI browser runner fails closed on source identity, real build, non-loopback host, and live certified claims", () => {
  const script = readFileSync("tests/kingdom-tests-next-acceptance.py", "utf8");
  assert.match(script, /EXPECTED_CANDIDATE_SHA/);
  assert.match(script, /re\.fullmatch\(r"\[0-9a-f\]\{40\}"/);
  assert.match(script, /status","--porcelain","--untracked-files=no"/);
  assert.match(script, /"\.next"\/"BUILD_ID"/);
  assert.match(script, /origin\.hostname!="127\.0\.0\.1"/);
  assert.match(script, /"Transfer-Encoding", "chunked"/);
  assert.match(script, /330000/);
  assert.match(script, /"certified": True/);
  assert.match(script, /"shared_claim_blocker"/);
  assert.doesNotMatch(script, /workflow_dispatch|POST.*\/api\/general-inspections/);
});
