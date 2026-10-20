import assert from "node:assert/strict";
import test from "node:test";

import { formatAcademyReplayEvidence } from "../app/academy/advisorEvidence.ts";

test("zero accepted snapshots is an observed zero, not an unavailable rail", () => {
  assert.equal(formatAcademyReplayEvidence(0), "0 accepted replay snapshots");
});

test("measured accepted snapshot count displays its actual query grain", () => {
  assert.equal(
    formatAcademyReplayEvidence(1234),
    "1,234 accepted replay snapshots"
  );
});

test("missing replay evidence never becomes a fabricated zero", () => {
  assert.equal(formatAcademyReplayEvidence(null), "Replay evidence unavailable");
});

test("invalid replay counts fail closed", () => {
  for (const invalid of [-1, Number.POSITIVE_INFINITY, Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(formatAcademyReplayEvidence(invalid), "Replay evidence unavailable");
  }
});
