import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  normalizeWarGraphIdentity,
  stableWarGraphJson,
  warGraphAdvisoryLockKey,
  warGraphBoundaryInstant,
} from "../lib/wargraph/foundationContract.ts";

test("Edmonton constitutional boundaries are exact and DST-safe", () => {
  assert.equal(
    warGraphBoundaryInstant("2026-08-24", 17 * 60).toISOString(),
    "2026-08-24T23:00:00.000Z",
  );
  assert.equal(
    warGraphBoundaryInstant("2026-08-24", 23 * 60).toISOString(),
    "2026-08-25T05:00:00.000Z",
  );
  assert.equal(
    warGraphBoundaryInstant("2026-01-24", 17 * 60).toISOString(),
    "2026-01-25T00:00:00.000Z",
  );
  assert.equal(
    warGraphBoundaryInstant("2026-01-24", 23 * 60).toISOString(),
    "2026-01-25T06:00:00.000Z",
  );
});

test("foundation rejects malformed local dates and boundary minutes", () => {
  assert.throws(
    () => warGraphBoundaryInstant("2026-02-30", 17 * 60),
    /WARGRAPH_NIGHT_KEY_INVALID/,
  );
  assert.throws(
    () => warGraphBoundaryInstant("2026-08-24", 24 * 60),
    /WARGRAPH_BOUNDARY_MINUTE_INVALID/,
  );
});

test("founding aliases normalize without fuzzy identity assignment", () => {
  assert.equal(
    normalizeWarGraphIdentity("  Dil_Pascana "),
    "dilpascana",
  );
  assert.equal(
    normalizeWarGraphIdentity("c0LoRz"),
    "c0lorz",
  );
  assert.notEqual(
    normalizeWarGraphIdentity("Jimothy"),
    "jim",
  );
});

test("stable JSON is key-order invariant for ruleset hashing", () => {
  assert.equal(
    stableWarGraphJson({ b: 2, a: { d: 4, c: 3 } }),
    stableWarGraphJson({ a: { c: 3, d: 4 }, b: 2 }),
  );
});

test("graph advisory lock keys are stable and reject ambiguous identities", () => {
  assert.equal(warGraphAdvisoryLockKey(1), "wargraph:1");
  assert.equal(warGraphAdvisoryLockKey(42), "wargraph:42");
  assert.throws(
    () => warGraphAdvisoryLockKey(0),
    /WARGRAPH_LOCK_GRAPH_ID_INVALID/,
  );
  assert.throws(
    () => warGraphAdvisoryLockKey(Number.NaN),
    /WARGRAPH_LOCK_GRAPH_ID_INVALID/,
  );
});

test(
  "foundation never updates established append-only topology nodes",
  () => {
    const source = readFileSync(
      new URL(
        "../lib/wargraph/foundation.ts",
        import.meta.url,
      ),
      "utf8",
    );

    const topology =
      source.match(
        /async function ensureTopology[\s\S]*?async function eligibleUsers/,
      )?.[0] ?? "";

    assert.ok(topology);
    assert.doesNotMatch(
      topology,
      /warGraphNode\.upsert/,
    );
    assert.match(
      topology,
      /warGraphNode\.findUnique/,
    );
    assert.match(
      topology,
      /warGraphNode\.create/,
    );
    assert.match(
      topology,
      /WARGRAPH_TOPOLOGY_NODE_MISMATCH/,
    );
  },
);
