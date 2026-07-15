import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateParserCoverage,
  aggregateUploaderCoverage,
  bucketParserFailures,
  deriveParserLabJobState,
  parserLabCoverageBps,
} from "../lib/adminParserLab.ts";

test("parser coverage combines immutable status rows by parser/pass contract", () => {
  const buckets = aggregateParserCoverage([
    {
      parserName: "aoe2war.mgz_hd",
      parserVersion: "1.8.51",
      passName: "hd_deterministic_evidence",
      passVersion: "1",
      schemaVersion: "2026-07-14.1",
      status: "completed",
      _count: { _all: 91 },
    },
    {
      parserName: "aoe2war.mgz_hd",
      parserVersion: "1.8.51",
      passName: "hd_deterministic_evidence",
      passVersion: "1",
      schemaVersion: "2026-07-14.1",
      status: "failed",
      _count: { _all: 7 },
    },
    {
      parserName: "aoe2war.mgz_hd",
      parserVersion: "1.8.51",
      passName: "hd_deterministic_evidence",
      passVersion: "1",
      schemaVersion: "2026-07-14.1",
      status: "skipped",
      _count: { _all: 2 },
    },
  ]);

  assert.equal(buckets.length, 1);
  assert.deepEqual(
    {
      total: buckets[0]?.total,
      completed: buckets[0]?.completed,
      failed: buckets[0]?.failed,
      skipped: buckets[0]?.skipped,
    },
    { total: 100, completed: 91, failed: 7, skipped: 2 }
  );
});

test("failure buckets retain the latest private diagnostic and rank repeat misses", () => {
  const rows = [
    {
      failureSignature: "hd_header_variant_42",
      failureDetail: "Latest detail for operator inspection",
      parserName: "aoe2war.mgz_hd",
      parserVersion: "1.8.51",
      passName: "hd_deterministic_evidence",
      passVersion: "1",
      createdAt: new Date("2026-07-14T18:03:00.000Z"),
    },
    {
      failureSignature: "hd_header_variant_42",
      failureDetail: "Older detail",
      parserName: "aoe2war.mgz_hd",
      parserVersion: "1.8.51",
      passName: "hd_deterministic_evidence",
      passVersion: "1",
      createdAt: new Date("2026-07-14T18:02:00.000Z"),
    },
    {
      failureSignature: "truncated_body",
      failureDetail: null,
      parserName: "aoe2war.mgz_hd",
      parserVersion: "1.8.51",
      passName: "hd_deterministic_evidence",
      passVersion: "1",
      createdAt: new Date("2026-07-14T18:01:00.000Z"),
    },
  ];

  const buckets = bucketParserFailures(rows, 2);
  assert.equal(buckets.length, 2);
  assert.equal(buckets[0]?.signature, "hd_header_variant_42");
  assert.equal(buckets[0]?.count, 2);
  assert.equal(buckets[0]?.latestDetail, "Latest detail for operator inspection");
});

test("job progress derives from the latest append-only checkpoint without action rows", () => {
  const state = deriveParserLabJobState(100, {
    sequence: 16,
    eventType: "checkpointed",
    processedCount: 40,
    succeededCount: 34,
    failedCount: 4,
    skippedCount: 2,
  });

  assert.equal(state.status, "running");
  assert.equal(state.progressBps, 4_000);
  assert.equal(state.remainingArtifacts, 60);
  assert.equal(state.invariantValid, true);
  assert.equal(state.lastSequence, 16);
});

test("uploader coverage is bounded and sums GameStats-linked parse runs", () => {
  const coverage = aggregateUploaderCoverage(
    [
      {
        userUid: "u_jim",
        user: { inGameName: "Jim", steamPersonaName: null },
        _count: { replayParseRuns: 3 },
      },
      {
        userUid: "u_jim",
        user: { inGameName: "Jim", steamPersonaName: null },
        _count: { replayParseRuns: 2 },
      },
      {
        userUid: "u_julio",
        user: { inGameName: "Julio", steamPersonaName: null },
        _count: { replayParseRuns: 4 },
      },
    ],
    1
  );

  assert.equal(coverage.length, 1);
  assert.deepEqual(coverage[0], {
    key: "uid:u_jim",
    displayName: "Jim",
    userUid: "u_jim",
    gameCount: 2,
    parseRunCount: 5,
  });
});

test("job checkpoint contract violations are visible to operators", () => {
  const state = deriveParserLabJobState(10, {
    sequence: 3,
    eventType: "artifact_completed",
    processedCount: 8,
    succeededCount: 7,
    failedCount: 2,
    skippedCount: 0,
  });

  assert.equal(state.status, "running");
  assert.equal(state.invariantValid, false);
});

test("legacy catalog coverage is bounded to a percentage", () => {
  assert.equal(parserLabCoverageBps(725, 2_900), 2_500);
  assert.equal(parserLabCoverageBps(4_000, 2_900), 10_000);
  assert.equal(parserLabCoverageBps(0, 0), 0);
});
