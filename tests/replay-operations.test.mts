import assert from "node:assert/strict";
import test from "node:test";

import {
  parseReplayCandidateExecutionRequest,
  parseReplayCandidatePlanRequest,
  parseReplayReceiptQuery,
  parseReplayReviewQuery,
  replayCandidateRunSucceeded,
  replayMissingCurrentCandidateRunFilter,
  replayReviewSourceCoverage,
  REPLAY_OPERATIONS_EXECUTION_CONFIRMATION,
  REPLAY_OPERATIONS_DRY_RUN_SAFETY,
  REPLAY_OPERATIONS_READ_ONLY_SAFETY,
  REPLAY_REVIEW_QUEUE_SOURCE_LIMIT,
  ReplayOperationsContractError,
} from "../lib/replayOperationsContracts.ts";

test("candidate planning requires an explicit bounded dry-run request", () => {
  const parsed = parseReplayCandidatePlanRequest({
    dryRun: true,
    cohort: "missing_current_pass",
    limit: 40,
  });

  assert.deepEqual(parsed, {
    dryRun: true,
    cohort: "missing_current_pass",
    limit: 40,
  });

  assert.throws(
    () =>
      parseReplayCandidatePlanRequest({
        dryRun: false,
        cohort: "missing_current_pass",
      }),
    (error) =>
      error instanceof ReplayOperationsContractError &&
      /dry-run only/i.test(error.message)
  );

  assert.throws(
    () =>
      parseReplayCandidatePlanRequest({
        dryRun: true,
        cohort: "all_artifacts",
      }),
    (error) =>
      error instanceof ReplayOperationsContractError &&
      /cohort must be one of/i.test(error.message)
  );

  assert.throws(
    () =>
      parseReplayCandidatePlanRequest({
        dryRun: true,
        cohort: "failed_current_pass",
        limit: 101,
      }),
    (error) =>
      error instanceof ReplayOperationsContractError &&
      /between 1 and 100/i.test(error.message)
  );
});

test("candidate execution is explicit, deduplicated, and tightly bounded", () => {
  const expectedPlanFingerprint = "a".repeat(64);
  assert.deepEqual(
    parseReplayCandidateExecutionRequest({
      candidateOnly: true,
      confirmation: REPLAY_OPERATIONS_EXECUTION_CONFIRMATION,
      cohort: "missing_current_pass",
      limit: 25,
      expectedPlanFingerprint,
      gameStatsIds: [41, "41"],
    }),
    {
      candidateOnly: true,
      confirmation: REPLAY_OPERATIONS_EXECUTION_CONFIRMATION,
      cohort: "missing_current_pass",
      limit: 25,
      expectedPlanFingerprint,
      gameStatsIds: [41],
    }
  );

  assert.throws(
    () =>
      parseReplayCandidateExecutionRequest({
        candidateOnly: false,
        confirmation: REPLAY_OPERATIONS_EXECUTION_CONFIRMATION,
        gameStatsIds: [41],
      }),
    /candidateOnly/
  );
  assert.throws(
    () =>
      parseReplayCandidateExecutionRequest({
        candidateOnly: true,
        confirmation: "RUN EVERYTHING",
        gameStatsIds: [41],
      }),
    /confirmation/
  );
  assert.throws(
    () =>
      parseReplayCandidateExecutionRequest({
        candidateOnly: true,
        confirmation: REPLAY_OPERATIONS_EXECUTION_CONFIRMATION,
        cohort: "missing_current_pass",
        limit: 25,
        expectedPlanFingerprint,
        gameStatsIds: [1, 2],
      }),
    /between 1 and 1/
  );
});

test("durably recorded parser failures never count as candidate success", () => {
  assert.equal(
    replayCandidateRunSucceeded({
      workerExitCode: 0,
      runStatus: "completed",
    }),
    true
  );
  assert.equal(
    replayCandidateRunSucceeded({
      workerExitCode: 4,
      runStatus: "failed",
    }),
    false
  );
  assert.equal(
    replayCandidateRunSucceeded({
      workerExitCode: 0,
      runStatus: "failed",
    }),
    false
  );
});

test("candidate inventory counts finals missing the current candidate pass", () => {
  const currentPass = {
    parserName: "mgz-hd",
    parserVersion: "1.8.30",
    passName: "normalized-events",
    passVersion: "2026-07-25.1",
    schemaVersion: "3",
  };

  assert.deepEqual(
    replayMissingCurrentCandidateRunFilter(
      currentPass
    ),
    {
      none: {
        ...currentPass,
        candidateOnly: true,
      },
    }
  );
});

test("review source coverage uses a sentinel row to report partial totals", () => {
  assert.deepEqual(
    replayReviewSourceCoverage(
      REPLAY_REVIEW_QUEUE_SOURCE_LIMIT - 1
    ),
    {
      rowLimit:
        REPLAY_REVIEW_QUEUE_SOURCE_LIMIT,
      rowsScanned:
        REPLAY_REVIEW_QUEUE_SOURCE_LIMIT -
        1,
      hasMore: false,
    }
  );
  assert.deepEqual(
    replayReviewSourceCoverage(
      REPLAY_REVIEW_QUEUE_SOURCE_LIMIT + 1
    ),
    {
      rowLimit:
        REPLAY_REVIEW_QUEUE_SOURCE_LIMIT,
      rowsScanned:
        REPLAY_REVIEW_QUEUE_SOURCE_LIMIT,
      hasMore: true,
    }
  );
});

test("review and receipt queries enforce safe defaults and caps", () => {
  assert.deepEqual(parseReplayReviewQuery(new URLSearchParams()), {
    limit: 20,
    financialOnly: false,
  });
  assert.deepEqual(
    parseReplayReviewQuery(
      new URLSearchParams("limit=75&financialOnly=1")
    ),
    {
      limit: 75,
      financialOnly: true,
    }
  );
  assert.deepEqual(parseReplayReceiptQuery(new URLSearchParams()), {
    limit: 12,
  });

  assert.throws(
    () => parseReplayReceiptQuery(new URLSearchParams("limit=51")),
    ReplayOperationsContractError
  );
});

test("all command-center contracts keep public, financial, and chain writes off", () => {
  for (const safety of [
    REPLAY_OPERATIONS_READ_ONLY_SAFETY,
    REPLAY_OPERATIONS_DRY_RUN_SAFETY,
  ]) {
    assert.equal(safety.writesPerformed, false);
    assert.equal(safety.candidateOnly, true);
    assert.equal(safety.affectsPublicAggregates, false);
    assert.equal(safety.affectsResults, false);
    assert.equal(safety.affectsBets, false);
    assert.equal(safety.affectsChain, false);
  }
});
