import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildReplayArtifactManifest,
  buildReplayEvidenceArtifactManifest,
  buildReplayObservationCandidate,
  buildReplayObservationPromotionDecision,
  buildReplayParseRunCandidateOutput,
  buildReplayParseRunIdentity,
  buildReplayReprocessJobEvent,
  buildReplayReprocessJobManifest,
  buildReplaySubmissionReceipt,
  deriveReplayReprocessJobState,
  HD_REPLAY_PARSER_CONTRACT,
  planReplayReprocessBatch,
  REPLAY_ENGINE_APPEND_ONLY_TABLES,
  ReplayEngineRoomContractError,
  replayEngineSha256,
} from "../lib/replayEngineRoom.ts";

const replayHash = "a".repeat(64);

test("artifact and submission identities are content-addressed and retry-safe", () => {
  const artifact = buildReplayArtifactManifest({
    sha256: replayHash.toUpperCase(),
    byteSize: 43210,
    storageKey: `aa/aa/${replayHash}.aoe2record`,
    originalExtension: ".aoe2record",
    archiveMetadata: { source: "watcher", durable: true },
  });
  assert.equal(artifact.sha256, replayHash);
  assert.equal(artifact.idempotencyKey, `artifact:${replayHash}`);

  const first = buildReplaySubmissionReceipt({
    artifactSha256: replayHash,
    source: "watcher_final",
    submitterUidSnapshot: "u_jim",
    originalFilename: "MP Replay v5.8.aoe2record",
    clientSubmissionId: "watcher-upload-42",
  });
  const retry = buildReplaySubmissionReceipt({
    artifactSha256: replayHash,
    source: "watcher_final",
    submitterUidSnapshot: "u_jim",
    originalFilename: "renamed-copy.aoe2record",
    clientSubmissionId: "watcher-upload-42",
  });
  assert.equal(first.receiptIdentityHash, retry.receiptIdentityHash);
  assert.equal(first.idempotencyKey, retry.idempotencyKey);

  assert.throws(
    () =>
      buildReplaySubmissionReceipt({
        artifactSha256: replayHash,
        source: "manual_upload",
      }),
    (error) =>
      error instanceof ReplayEngineRoomContractError &&
      error.code === "submission_idempotency_required"
  );
});

test("the same parser pass is idempotent while a version change creates a new run", () => {
  const left = buildReplayParseRunIdentity({
    artifactSha256: replayHash,
    parserName: HD_REPLAY_PARSER_CONTRACT.parserName,
    parserVersion: HD_REPLAY_PARSER_CONTRACT.parserVersion,
    passName: HD_REPLAY_PARSER_CONTRACT.passName,
    passVersion: HD_REPLAY_PARSER_CONTRACT.passVersion,
    schemaVersion: HD_REPLAY_PARSER_CONTRACT.schemaVersion,
    parserConfig: { apply_hd_early_exit_rules: true },
  });
  const reordered = buildReplayParseRunIdentity({
    artifactSha256: replayHash,
    parserName: HD_REPLAY_PARSER_CONTRACT.parserName,
    parserVersion: HD_REPLAY_PARSER_CONTRACT.parserVersion,
    passName: HD_REPLAY_PARSER_CONTRACT.passName,
    passVersion: HD_REPLAY_PARSER_CONTRACT.passVersion,
    schemaVersion: HD_REPLAY_PARSER_CONTRACT.schemaVersion,
    parserConfig: { apply_hd_early_exit_rules: true },
  });
  const upgraded = buildReplayParseRunIdentity({
    artifactSha256: replayHash,
    parserName: HD_REPLAY_PARSER_CONTRACT.parserName,
    parserVersion: "1.8.52",
    passName: HD_REPLAY_PARSER_CONTRACT.passName,
    passVersion: HD_REPLAY_PARSER_CONTRACT.passVersion,
    schemaVersion: HD_REPLAY_PARSER_CONTRACT.schemaVersion,
    parserConfig: { apply_hd_early_exit_rules: true },
  });

  assert.equal(left.runIdentityHash, reordered.runIdentityHash);
  assert.equal(left.idempotencyKey, reordered.idempotencyKey);
  assert.equal(
    left.runIdentityHash,
    "7861990f2ad2d56bffbc97c0a4bc8fa00ef58892366038535333393a60fe9bc2"
  );
  assert.equal(left.idempotencyKey, left.runIdentityHash);
  assert.notEqual(left.runIdentityHash, upgraded.runIdentityHash);
  assert.equal(left.candidateOnly, true);
  assert.equal(left.affectsPublicAggregates, false);
});

test("candidate output uses a private durable locator instead of hot inline JSON", () => {
  const output = buildReplayParseRunCandidateOutput({
    candidateOutputHash: "c".repeat(64),
    candidateOutputStorageProvider: "volume",
    candidateOutputStorageKey:
      "replay-engine-room/candidates/cc/cc/output.json.zst",
    candidateOutputByteSize: 245_760,
    observationCount: 187,
    actionCount: 42_901,
  });

  assert.equal(output.candidateOutputHash, "c".repeat(64));
  assert.equal(output.candidateOutputStorageProvider, "volume");
  assert.equal(output.observationCount, 187);
  assert.equal(output.actionCount, 42_901);
  assert.equal(output.inlineCandidateOutput, false);
  assert.equal(output.affectsPublicAggregates, false);
});

test("parser observations remain candidates and promotion is a separate private fact", () => {
  const run = buildReplayParseRunIdentity({
    artifactSha256: replayHash,
    parserName: "hd-parser",
    parserVersion: "5.8.1",
    passName: "team_result",
    passVersion: "2",
    schemaVersion: "replay-observation/v1",
  });
  const observation = buildReplayObservationCandidate({
    parseRunIdentityHash: run.runIdentityHash,
    observationKey: "result:winning-team",
    observationKind: "result_candidate",
    fieldPath: "result.winning_player_keys",
    value: ["steam:1", "steam:2"],
    confidenceBps: 9800,
    provenance: { method: "complete_losing_team_resignation", direct: true },
  });
  const promotion = buildReplayObservationPromotionDecision({
    observationIdentityHash: replayEngineSha256({
      parseRunIdentityHash: run.runIdentityHash,
      observationKey: observation.observationKey,
    }),
    promotionKey: "game:42:result.winning_player_keys",
    policyVersion: "engine-room/v1",
    reason: "Complete team resignation evidence passed the HD truth contract.",
  });

  assert.equal(observation.candidateOnly, true);
  assert.equal(observation.affectsPublicAggregates, false);
  assert.equal(promotion.affectsPublicAggregates, false);
  assert.match(observation.valueHash, /^[a-f0-9]{64}$/);
  assert.match(promotion.decisionHash, /^[a-f0-9]{64}$/);
  assert.notEqual(observation.idempotencyKey, promotion.idempotencyKey);
});

test("evidence is content-addressed independently from parser output", () => {
  const evidence = buildReplayEvidenceArtifactManifest({
    sha256: "b".repeat(64),
    byteSize: 8192,
    storageKey: "evidence/bb/final-screen.png",
    evidenceKind: "postgame_screenshot",
    mediaType: "image/png",
    sourceParseRunIdentityHash: "d".repeat(64),
    sourceCandidateOutputHash: "c".repeat(64),
    capturedAt: "2026-07-14T18:00:00Z",
    metadata: { submittedBy: "Jim" },
  });
  assert.equal(evidence.idempotencyKey, `evidence:${"b".repeat(64)}`);
  assert.equal(evidence.capturedAt, "2026-07-14T18:00:00.000Z");
  assert.equal(evidence.sourceCandidateOutputHash, "c".repeat(64));

  assert.throws(
    () =>
      buildReplayEvidenceArtifactManifest({
        sha256: "b".repeat(64),
        byteSize: 8192,
        storageKey: "evidence/bb/final-screen.png",
        evidenceKind: "postgame_screenshot",
        capturedAt: "not-a-date",
      }),
    (error) =>
      error instanceof ReplayEngineRoomContractError &&
      error.code === "invalid_captured_at"
  );
  assert.throws(
    () =>
      buildReplayEvidenceArtifactManifest({
        sha256: "e".repeat(64),
        byteSize: 1024,
        storageKey: "evidence/ee/output-excerpt.json",
        evidenceKind: "candidate_output_excerpt",
        sourceParseRunIdentityHash: "d".repeat(64),
      }),
    (error) =>
      error instanceof ReplayEngineRoomContractError &&
      error.code === "incomplete_source_output_reference"
  );
});

test("reprocess manifests are bounded, candidate-only, and deterministic", () => {
  const manifest = buildReplayReprocessJobManifest({
    scopeKind: "frozen_csv_manifest",
    scope: {
      version: 1,
      kind: "frozen_csv_manifest",
      manifest_sha256: "b".repeat(64),
      manifest_filename: "fixture.csv",
      manifest_rows: 5,
      unique_artifacts: 5,
      archive_root: "/mnt/archive",
    },
    parserName: HD_REPLAY_PARSER_CONTRACT.parserName,
    parserVersion: "1.8.51",
    schemaVersion: HD_REPLAY_PARSER_CONTRACT.schemaVersion,
    passName: HD_REPLAY_PARSER_CONTRACT.passName,
    passVersion: HD_REPLAY_PARSER_CONTRACT.passVersion,
    parserConfig: { apply_hd_early_exit_rules: true },
    maxArtifacts: 5,
    maxAttemptsPerArtifact: 1,
    dryRun: false,
  });
  const duplicate = buildReplayReprocessJobManifest({
    scopeKind: "frozen_csv_manifest",
    scope: {
      archive_root: "/mnt/archive",
      unique_artifacts: 5,
      manifest_rows: 5,
      manifest_filename: "fixture.csv",
      manifest_sha256: "b".repeat(64),
      kind: "frozen_csv_manifest",
      version: 1,
    },
    parserName: HD_REPLAY_PARSER_CONTRACT.parserName,
    parserVersion: "1.8.51",
    schemaVersion: HD_REPLAY_PARSER_CONTRACT.schemaVersion,
    passName: HD_REPLAY_PARSER_CONTRACT.passName,
    passVersion: HD_REPLAY_PARSER_CONTRACT.passVersion,
    parserConfig: { apply_hd_early_exit_rules: true },
    maxArtifacts: 5,
    maxAttemptsPerArtifact: 1,
    dryRun: false,
  });

  assert.equal(manifest.batchSize, 5);
  assert.equal(manifest.jobIdentityHash, duplicate.jobIdentityHash);
  assert.equal(
    manifest.jobIdentityHash,
    "e4ba0425ac249f6ae69dee8a3bb3c76381e688602a4175f8494211a5abdb7163"
  );
  assert.equal(manifest.idempotencyKey, `replay-engine-room:${manifest.jobIdentityHash}`);
  assert.equal(manifest.candidateOnly, true);
  assert.equal(manifest.affectsPublicAggregates, false);
  assert.throws(
    () =>
      buildReplayReprocessJobManifest({
        scopeKind: "frozen_csv_manifest",
        scope: { kind: "frozen_csv_manifest", manifest_rows: 1000 },
        parserName: "aoc-mgz",
        parserVersion: "1.8.51",
        schemaVersion: HD_REPLAY_PARSER_CONTRACT.schemaVersion,
        passName: "primary_hd",
        passVersion: "3",
        batchSize: 501,
        maxArtifacts: 1000,
        maxAttemptsPerArtifact: 1,
        dryRun: false,
      }),
    (error) =>
      error instanceof ReplayEngineRoomContractError &&
      error.code === "invalid_batch_size"
  );
});

test("job state resumes from an append-only checkpoint and plans one bounded batch", () => {
  const events = [
    {
      sequence: 0,
      eventType: "queued" as const,
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      skippedCount: 0,
    },
    {
      sequence: 1,
      eventType: "leased" as const,
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      skippedCount: 0,
    },
    {
      sequence: 2,
      eventType: "artifact_completed" as const,
      checkpointCursor: "artifact:101",
      processedCount: 1,
      succeededCount: 1,
      failedCount: 0,
      skippedCount: 0,
    },
    {
      sequence: 3,
      eventType: "paused" as const,
      processedCount: 1,
      succeededCount: 1,
      failedCount: 0,
      skippedCount: 0,
    },
  ];
  const state = deriveReplayReprocessJobState(events, 3);
  const batch = planReplayReprocessBatch({
    manifest: { batchSize: 2, maxArtifacts: 3 },
    state,
    candidateArtifactIds: [102, 102, 103, 104],
  });

  assert.equal(state.status, "paused");
  assert.equal(state.nextSequence, 4);
  assert.equal(state.checkpointCursor, "artifact:101");
  assert.equal(state.remainingArtifacts, 2);
  assert.deepEqual(batch.artifactIds, [102, 103]);
  assert.equal(batch.remainingAfterBatch, 0);
  assert.equal(batch.bounded, true);
});

test("job event contracts derive the next idempotent sequence within hard limits", () => {
  const manifest = buildReplayReprocessJobManifest({
    scopeKind: "frozen_csv_manifest",
    scope: {
      kind: "frozen_csv_manifest",
      manifest_rows: 2,
      fixture: "hd-team",
    },
    parserName: "hd-parser",
    parserVersion: "5.8.1",
    schemaVersion: "replay-observation/v1",
    passName: "team_result",
    passVersion: "2",
    maxArtifacts: 2,
    batchSize: 1,
    maxAttemptsPerArtifact: 1,
    dryRun: false,
  });
  const created = deriveReplayReprocessJobState([], manifest.maxArtifacts);
  const queued = buildReplayReprocessJobEvent({
    jobId: 42,
    jobIdentityHash: manifest.jobIdentityHash,
    manifest,
    state: created,
    eventType: "queued",
  });
  const queuedRetry = buildReplayReprocessJobEvent({
    jobId: 42,
    jobIdentityHash: manifest.jobIdentityHash,
    manifest,
    state: created,
    eventType: "queued",
  });
  assert.equal(queued.sequence, 0);
  assert.equal(queued.idempotencyKey, queuedRetry.idempotencyKey);

  const queuedState = deriveReplayReprocessJobState([queued], manifest.maxArtifacts);
  const completed = buildReplayReprocessJobEvent({
    jobId: 42,
    jobIdentityHash: manifest.jobIdentityHash,
    manifest,
    state: queuedState,
    eventType: "artifact_completed",
    artifactSha256: replayHash,
    parseRunIdentityHash: "d".repeat(64),
    manifestCursor: "000001:aaaaaaaaaaaaaaaa",
    attemptNumber: 1,
    processedCount: 1,
    succeededCount: 1,
  });
  assert.equal(completed.sequence, 1);
  assert.equal(completed.processedCount, 1);
  assert.equal(
    completed.idempotencyKey,
    "9d68f0fb4f1a0ff3909d55314d6bbb761e54510c0c85e3383bc73e44994ff3be"
  );
  assert.throws(
    () =>
      buildReplayReprocessJobEvent({
        jobId: 42,
        jobIdentityHash: manifest.jobIdentityHash,
        manifest,
        state: queuedState,
        eventType: "artifact_completed",
        artifactSha256: replayHash,
        parseRunIdentityHash: "d".repeat(64),
        manifestCursor: "000002:aaaaaaaaaaaaaaaa",
        attemptNumber: 3,
        processedCount: 1,
        succeededCount: 1,
      }),
    (error) =>
      error instanceof ReplayEngineRoomContractError &&
      error.code === "attempt_limit_exceeded"
  );
});

test("job history rejects gaps, regressing counters, and events after terminal", () => {
  const queued = {
    sequence: 0,
    eventType: "queued" as const,
    processedCount: 0,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
  };
  assert.throws(
    () =>
      deriveReplayReprocessJobState([
        queued,
        {
          ...queued,
          sequence: 2,
          eventType: "leased",
        },
      ]),
    (error) =>
      error instanceof ReplayEngineRoomContractError &&
      error.code === "event_sequence_gap"
  );
  assert.throws(
    () =>
      deriveReplayReprocessJobState([
        queued,
        {
          sequence: 1,
          eventType: "artifact_completed",
          processedCount: 1,
          succeededCount: 1,
          failedCount: 0,
          skippedCount: 0,
        },
        {
          ...queued,
          sequence: 2,
          eventType: "checkpointed",
        },
      ]),
    (error) =>
      error instanceof ReplayEngineRoomContractError &&
      error.code === "non_monotonic_event_counts"
  );
  assert.throws(
    () =>
      deriveReplayReprocessJobState([
        queued,
        { ...queued, sequence: 1, eventType: "completed" },
        { ...queued, sequence: 2, eventType: "leased" },
      ]),
    (error) =>
      error instanceof ReplayEngineRoomContractError &&
      error.code === "event_after_terminal"
  );
  assert.throws(
    () =>
      deriveReplayReprocessJobState(
        [
          queued,
          {
            sequence: 1,
            eventType: "leased",
            processedCount: 1,
            succeededCount: 1,
            failedCount: 0,
            skippedCount: 0,
          },
        ],
        1
      ),
    (error) =>
      error instanceof ReplayEngineRoomContractError &&
      error.code === "non_artifact_counter_change"
  );
  assert.throws(
    () =>
      deriveReplayReprocessJobState(
        [
          queued,
          {
            ...queued,
            sequence: 1,
            eventType: "completed",
          },
        ],
        1
      ),
    (error) =>
      error instanceof ReplayEngineRoomContractError &&
      error.code === "incomplete_job_completion"
  );
});

test("migration preserves every Engine Room table and never writes public aggregates", () => {
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20260714190000_add_replay_engine_room_foundation/migration.sql",
      import.meta.url
    ),
    "utf8"
  );

  for (const table of REPLAY_ENGINE_APPEND_ONLY_TABLES) {
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.match(migration, /prevent_replay_engine_room_mutation/);
  assert.match(migration, /enforce_replay_reprocess_event_stream/);
  assert.match(migration, /candidate_output_storage_key/);
  assert.match(migration, /observation_count/);
  assert.match(migration, /action_count/);
  assert.match(migration, /enforce_replay_evidence_source_output/);
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.match(migration, /BEFORE TRUNCATE/);
  assert.match(migration, /only artifact_completed may advance reprocess job counters/);
  assert.match(migration, /completed reprocess job must account for every manifest artifact/);
  assert.match(migration, /parse_run_id must belong to artifact_id/);
  assert.match(migration, /uq_replay_reprocess_events_job_manifest_cursor/);
  assert.match(migration, /game_stats_id must match its observation parse run/);
  assert.match(migration, /preserve field and subject/);
  assert.match(migration, /candidate_only" = TRUE/);
  assert.match(migration, /affects_public_aggregates" = FALSE/);
  assert.doesNotMatch(
    migration,
    /\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+"game_stats"/i
  );
});
