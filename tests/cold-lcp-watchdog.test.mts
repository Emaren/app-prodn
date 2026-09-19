import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../scripts/aoe2_speed_cold_lcp.mjs", import.meta.url),
  "utf8",
);

test("cold LCP harness bounds CDP commands and retries poisoned fresh-browser samples", () => {
  assert.match(source, /command-timeout-ms/);
  assert.match(source, /CDP command timed out after/);
  assert.match(source, /pending\.delete\(id\)/);
  assert.match(source, /sample-attempts/);
  assert.match(source, /for \(let attempt = 1; attempt <= sampleAttempts; attempt \+= 1\)/);
  assert.match(source, /row\.harnessAttempt = attempt/);
  assert.match(source, /retriedSamples:/);
});

test("cold LCP harness keeps retries bounded", () => {
  assert.match(
    source,
    /const sampleAttempts = Math\.max\(1, Math\.min\(3, Number\(args\["sample-attempts"\] \|\| 2\)\)\)/,
  );
});
