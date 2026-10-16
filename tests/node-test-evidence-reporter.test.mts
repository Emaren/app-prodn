import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import reporter from "../scripts/node-test-evidence-reporter.mjs";

type Event = { type: string; data: Record<string, unknown> };
async function output(events: Event[]) {
  async function* source() { yield* events; }
  const lines: string[] = [];
  for await (const value of reporter(source())) lines.push(value);
  return lines.join("");
}
const fail = (name: string, message = "Expected equal") => ({
  type: "test:fail",
  data: {
    name, file: "/app/tests/safe.test.mts", line: 42, column: 8,
    details: { error: { code: "ERR_TEST_FAILURE", failureType: "testCodeFailure",
      cause: { code: "ERR_ASSERTION", message } } },
  },
});
const summary = {
  type: "test:summary",
  data: { counts: { passed: 101, failed: 1, skipped: 2, cancelled: 0 } },
};

test("prints bounded test identity and location instead of 2,000 silent dots", async () => {
  const events = Array.from({ length: 101 }, () => ({ type: "test:pass", data: {} }));
  events.push(fail("escrow source must match"));
  events.push(summary);
  const text = await output(events);
  assert.match(text, /Node contract progress: 100 passed/);
  assert.match(text, /FAIL escrow source must match \(\/app\/tests\/safe\.test\.mts:42:8\) \[ERR_ASSERTION\]/);
  assert.match(text, /Node contract summary: 101 passed, 1 failed, 2 skipped, 0 cancelled/);
});

test("reports original failing child, not a duplicate subtest aggregate", async () => {
  const text = await output([
    fail("child"),
    { type: "test:fail", data: { name: "parent", details: { error: { failureType: "subtestsFailed" } } } },
    summary,
  ]);
  assert.equal(text.split("FAIL ").length - 1, 1);
  assert.match(text, /FAIL child/);
  assert.doesNotMatch(text, /FAIL parent/);
});

test("bounds diagnostic cardinality and does not echo multiline actual/expected", async () => {
  const events = Array.from({ length: 28 }, (_, i) =>
    fail("case " + i, "Mismatch\nPRIVATE_RECORD_DO_NOT_PRINT"));
  events.push(summary);
  const text = await output(events);
  assert.equal(text.split("FAIL ").length - 1, 24);
  assert.match(text, /4 additional failures omitted/);
  assert.doesNotMatch(text, /PRIVATE_RECORD_DO_NOT_PRINT/);
});

test("prints missing summary evidence explicitly; does not fabricate a green suite", async () => {
  const text = await output([{ type: "test:pass", data: {} }]);
  assert.match(text, /stream ended without a final summary/);
  assert.doesNotMatch(text, /0 failed/);
});

test("the centralized test contract uses this source-defined reporter", () => {
  const fs = requireFile("config/test-contract.json");
  const contract = JSON.parse(fs);
  assert.ok(contract.runner.node_flags.includes("--test-reporter=./scripts/node-test-evidence-reporter.mjs"));
  assert.ok(!contract.runner.node_flags.includes("--test-reporter=dot"));
});
function requireFile(path: string) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}
