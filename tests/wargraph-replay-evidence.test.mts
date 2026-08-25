import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyReplayIngestReceipt,
  coordinateReplayPostIngest,
  replayPostIngestReportSucceeded,
} from "../lib/replayPostIngest.ts";
import {
  parseWarGraphWatcherAttestation,
  type WarGraphWatcherAttestation,
} from "../lib/wargraph/attestations.ts";
import {
  WARGRAPH_CANONICAL_SLUG,
  WARGRAPH_CORRELATION_JOB_SCHEMA,
  WARGRAPH_CORRELATION_JOB_TYPE,
  buildWarGraphAttestationCreateData,
  createPrismaWarGraphReplayEvidenceAdapter,
  persistWarGraphReplayEvidenceWithAdapter,
  qualifyWarGraphAttestationForCorrelation,
  resolveCanonicalActiveWarGraphId,
  type WarGraphAttestationCreateData,
  type WarGraphAnyCorrelationJobCreateData,
  type WarGraphCorrelationJobCreateData,
  type WarGraphReplayEvidenceAdapter,
  type WarGraphReplayEvidencePersistenceResult,
} from "../lib/wargraph/replayEvidencePersistence.ts";

const HASH = Object.freeze({
  attestation: "a".repeat(64),
  replay: "b".repeat(64),
  watcher: "c".repeat(64),
  session: "d".repeat(64),
  roster: "e".repeat(64),
  left: "f".repeat(64),
  right: "1".repeat(64),
  result: "2".repeat(64),
  live: "3".repeat(64),
});

function parsedAttestation(
  overrides: Record<string, unknown> = {},
): WarGraphWatcherAttestation {
  const parsed = parseWarGraphWatcherAttestation({
    schema: "aoe2war-wargraph-watcher-attestation/v1",
    transport_authenticated: true,
    attestation_id: HASH.attestation,
    uploader_uid: "user_wargraph_one",
    game_stats_id: 42,
    replay_hash: HASH.replay,
    replay_fingerprint: "live-session-42",
    live_game_fingerprint: HASH.live,
    platform_match_id: "platform-match-42",
    watcher_identity_hash: HASH.watcher,
    watcher_session_hash: HASH.session,
    roster_hash: HASH.roster,
    roster_player_key_hashes: [HASH.left, HASH.right],
    uploader_player_key_hash: HASH.left,
    participant_bound: true,
    ingestion_provenance: "live_monitor",
    provenance_signature_verified: true,
    live_provenance: true,
    commenced_at: "2026-08-24T01:00:00.000Z",
    is_final: true,
    archive_verified: true,
    file_role: "final",
    finality_status: "trusted_final",
    result_trusted: true,
    result_provenance: "watcher_terminal",
    winning_player_key_hashes: [HASH.left],
    result_hash: HASH.result,
    ...overrides,
  });
  if (!parsed.ok) throw new Error(parsed.reason);
  assert.equal(parsed.ok, true);
  return parsed.value;
}

function persistenceResult(
  overrides: Partial<WarGraphReplayEvidencePersistenceResult> = {},
): WarGraphReplayEvidencePersistenceResult {
  return {
    receivedCount: 1,
    createdCount: 1,
    existingCount: 0,
    failedCount: 0,
    nonqualifyingCount: 0,
    enqueuedCount: 1,
    existingJobCount: 0,
    notEnqueuedCount: 0,
    retryableFailure: null,
    ...overrides,
  };
}

test("only complete participant-bound signed live finals qualify for correlation", () => {
  const eligible = qualifyWarGraphAttestationForCorrelation(parsedAttestation());
  assert.deepEqual(eligible, {
    eligible: true,
    winnerPlayerKeyHash: HASH.left,
  });
  assert.equal(
    qualifyWarGraphAttestationForCorrelation(
      parsedAttestation({ platform_match_id: null }),
    ).eligible,
    true,
  );

  const cases: Array<
    [Record<string, unknown>, string]
  > = [
    [{ participant_bound: false }, "NOT_PARTICIPANT_BOUND"],
    [
      {
        participant_bound: false,
        uploader_player_key_hash: null,
        live_provenance: false,
        provenance_signature_verified: false,
        ingestion_provenance: "historical_import",
      },
      "NOT_PARTICIPANT_BOUND",
    ],
    [
      {
        live_provenance: false,
        provenance_signature_verified: false,
        ingestion_provenance: "historical_import",
      },
      "NOT_SIGNED_LIVE_PROVENANCE",
    ],
    [
      {
        is_final: false,
        result_trusted: false,
        result_hash: null,
        winning_player_key_hashes: [],
      },
      "NOT_FINAL",
    ],
    [
      {
        archive_verified: false,
        result_trusted: false,
        result_hash: null,
        winning_player_key_hashes: [],
      },
      "ARCHIVE_NOT_VERIFIED",
    ],
    [
      {
        result_trusted: false,
        result_hash: null,
        winning_player_key_hashes: [],
      },
      "RESULT_NOT_TRUSTED",
    ],
    [{ live_game_fingerprint: null }, "LIVE_GAME_FINGERPRINT_MISSING"],
    [
      {
        participant_bound: false,
        uploader_player_key_hash: null,
        roster_hash: null,
      },
      "NOT_PARTICIPANT_BOUND",
    ],
    [{ commenced_at: null }, "COMMENCED_AT_MISSING"],
    [
      {
        participant_bound: false,
        uploader_player_key_hash: null,
        roster_player_key_hashes: [HASH.left],
      },
      "NOT_PARTICIPANT_BOUND",
    ],
    [{ winning_player_key_hashes: ["3".repeat(64)] }, "WINNER_NOT_IN_ROSTER"],
  ];

  for (const [overrides, reason] of cases) {
    const decision = qualifyWarGraphAttestationForCorrelation(
      parsedAttestation(overrides),
    );
    assert.equal(decision.eligible, false);
    if (!decision.eligible) assert.equal(decision.reason, reason);
  }

  const defensiveCases: Array<
    [WarGraphWatcherAttestation, string]
  > = [
    [{ ...parsedAttestation(), rosterHash: null }, "ROSTER_HASH_MISSING"],
    [{ ...parsedAttestation(), resultHash: null }, "RESULT_HASH_MISSING"],
    [
      {
        ...parsedAttestation(),
        rosterPlayerKeyHashes: [HASH.left],
      },
      "ROSTER_NOT_EXACT_TWO",
    ],
    [
      {
        ...parsedAttestation(),
        winningPlayerKeyHashes: [],
      },
      "WINNER_NOT_EXACT_ONE",
    ],
  ];
  for (const [attestation, reason] of defensiveCases) {
    const decision = qualifyWarGraphAttestationForCorrelation(attestation);
    assert.equal(decision.eligible, false);
    if (!decision.eligible) assert.equal(decision.reason, reason);
  }
});

test("persistence mapping preserves nullable projections and provenance booleans", () => {
  const attestation = parsedAttestation({
    replay_fingerprint: null,
    platform_match_id: null,
    roster_hash: null,
    participant_bound: false,
    uploader_player_key_hash: null,
    ingestion_provenance: "historical_import",
    provenance_signature_verified: false,
    live_provenance: false,
    commenced_at: null,
    is_final: false,
    archive_verified: false,
    file_role: null,
    finality_status: "live",
    result_trusted: false,
    result_provenance: null,
    winning_player_key_hashes: [],
    result_hash: null,
  });

  const data = buildWarGraphAttestationCreateData(attestation, 77);
  assert.equal(data.apiKeyId, null);
  assert.equal(data.replayParseAttemptId, null);
  assert.equal(data.replayFingerprint, null);
  assert.equal(data.platformMatchId, null);
  assert.equal(data.rosterHash, null);
  assert.equal(data.commencedAt, null);
  assert.equal(data.resultHash, null);
  assert.equal(data.liveGameFingerprint, HASH.live);
  assert.equal(data.ingestionProvenance, "historical_import");
  assert.equal(data.liveProvenance, false);
  assert.equal(data.provenanceSignatureVerified, false);
  assert.equal(data.receiptHash, attestation.evidenceHash);
  assert.equal(data.idempotencyKey, `wargraph-attestation:${HASH.attestation}`);
  assert.deepEqual(data.receipt, attestation.canonicalReceipt);
});

test("eligible evidence is appended before one durable correlation job", async () => {
  const appendedAttestations: WarGraphAttestationCreateData[] = [];
  const appendedJobs: WarGraphAnyCorrelationJobCreateData[] = [];
  const adapter: WarGraphReplayEvidenceAdapter = {
    resolveUploaderUserId: async () => 77,
    appendAttestation: async (data) => {
      appendedAttestations.push(data);
      return "created";
    },
    appendCorrelationJob: async (data) => {
      appendedJobs.push(data);
      return "created";
    },
  };

  const result = await persistWarGraphReplayEvidenceWithAdapter({
    attestations: [parsedAttestation()],
    adapter,
    resolveGraphId: async () => 9,
    now: () => new Date("2026-08-24T02:00:00.000Z"),
  });

  assert.deepEqual(result, persistenceResult());
  assert.equal(appendedAttestations.length, 1);
  assert.equal(appendedJobs.length, 1);
  assert.equal(appendedJobs[0].graphId, 9);
  assert.equal(appendedJobs[0].jobType, WARGRAPH_CORRELATION_JOB_TYPE);
  assert.equal(appendedJobs[0].payload.schema, WARGRAPH_CORRELATION_JOB_SCHEMA);
  assert.equal(appendedJobs[0].payload.phase, "final");
  if (appendedJobs[0].payload.phase === "final") {
    assert.equal(appendedJobs[0].payload.winnerPlayerKeyHash, HASH.left);
    assert.equal(appendedJobs[0].payload.resultHash, HASH.result);
  }
  assert.equal("movement" in appendedJobs[0].payload, false);
});

test("historical evidence stays audit-only while unfinished live proof enters start correlation", async () => {
  const stored: WarGraphAttestationCreateData[] = [];
  const jobs: WarGraphAnyCorrelationJobCreateData[] = [];
  let graphResolutions = 0;
  let jobCalls = 0;
  const adapter: WarGraphReplayEvidenceAdapter = {
    resolveUploaderUserId: async () => 77,
    appendAttestation: async (data) => {
      stored.push(data);
      return "created";
    },
    appendCorrelationJob: async (data) => {
      jobCalls += 1;
      jobs.push(data);
      return "created";
    },
  };
  const historical = parsedAttestation({
    ingestion_provenance: "historical_import",
    provenance_signature_verified: false,
    live_provenance: false,
  });
  const unfinished = parsedAttestation({
    is_final: false,
    result_trusted: false,
    result_hash: null,
    winning_player_key_hashes: [],
  });

  const result = await persistWarGraphReplayEvidenceWithAdapter({
    attestations: [historical, unfinished],
    adapter,
    resolveGraphId: async () => {
      graphResolutions += 1;
      return 9;
    },
  });

  assert.equal(result.createdCount, 2);
  assert.equal(result.nonqualifyingCount, 1);
  assert.equal(result.enqueuedCount, 1);
  assert.equal(result.retryableFailure, null);
  assert.equal(graphResolutions, 1);
  assert.equal(jobCalls, 1);
  assert.equal(jobs[0]?.payload.phase, "start");
  assert.equal(jobs[0]?.payload.liveGameFingerprint, HASH.live);
  assert.match(jobs[0]?.dedupeKey ?? "", /:start:/u);
  assert.equal(stored.length, 2);
});

test("missing active graph preserves evidence and returns a retryable queue gap", async () => {
  let appendMode: "created" | "existing" = "created";
  let jobCalls = 0;
  const adapter: WarGraphReplayEvidenceAdapter = {
    resolveUploaderUserId: async () => 77,
    appendAttestation: async () => appendMode,
    appendCorrelationJob: async () => {
      jobCalls += 1;
      return "created";
    },
  };
  const attestation = parsedAttestation();

  const absent = await persistWarGraphReplayEvidenceWithAdapter({
    attestations: [attestation],
    adapter,
    resolveGraphId: async () => null,
  });
  assert.equal(absent.createdCount, 1);
  assert.equal(absent.notEnqueuedCount, 1);
  assert.equal(
    absent.retryableFailure?.code,
    "WARGRAPH_ACTIVE_GRAPH_UNAVAILABLE",
  );
  assert.equal(jobCalls, 0);

  appendMode = "existing";
  const retry = await persistWarGraphReplayEvidenceWithAdapter({
    attestations: [attestation],
    adapter,
    resolveGraphId: async () => 9,
  });
  assert.equal(retry.existingCount, 1);
  assert.equal(retry.enqueuedCount, 1);
  assert.equal(retry.retryableFailure, null);
});

test("Prisma adapter ignores only an exact immutable attestation duplicate", async () => {
  const attestation = parsedAttestation();
  const data = buildWarGraphAttestationCreateData(attestation, 77);
  let existing = {
    sourceSchema: data.sourceSchema,
    sourceAttestationId: data.sourceAttestationId,
    idempotencyKey: data.idempotencyKey,
    receiptHash: data.receiptHash,
    uploaderUserId: data.uploaderUserId,
    gameStatsId: data.gameStatsId,
  };
  const store = {
    user: {
      findUnique: async () => ({ id: 77 }),
    },
    warGraphWatcherAttestation: {
      createMany: async () => ({ count: 0 }),
      findFirst: async () => existing,
    },
    warGraph: {
      findFirst: async () => ({ id: 9 }),
    },
    warGraphJob: {
      createMany: async () => ({ count: 1 }),
      findUnique: async () => null,
    },
  };
  const adapter = createPrismaWarGraphReplayEvidenceAdapter(store);

  assert.equal(await adapter.appendAttestation(data), "existing");
  existing = { ...existing, receiptHash: "9".repeat(64) };
  await assert.rejects(
    () => adapter.appendAttestation(data),
    /identity collision/u,
  );
});

test("Prisma adapter idempotently preserves one exact correlation job", async () => {
  const attestation = parsedAttestation();
  const qualification = qualifyWarGraphAttestationForCorrelation(attestation);
  assert.equal(qualification.eligible, true);
  if (!qualification.eligible) return;

  let createdJob: WarGraphCorrelationJobCreateData | null = null;
  const store = {
    user: {
      findUnique: async () => ({ id: 77 }),
    },
    warGraphWatcherAttestation: {
      createMany: async () => ({ count: 1 }),
      findFirst: async () => null,
    },
    warGraph: {
      findFirst: async () => ({ id: 9 }),
    },
    warGraphJob: {
      createMany: async (args: {
        data: WarGraphAnyCorrelationJobCreateData;
        skipDuplicates: true;
      }) => {
        createdJob = args.data;
        return { count: 0 };
      },
      findUnique: async () => {
        assert.ok(createdJob);
        return {
          graphId: createdJob.graphId,
          jobType: createdJob.jobType,
          dedupeKey: createdJob.dedupeKey,
          payload: createdJob.payload,
        };
      },
    },
  };
  const adapter = createPrismaWarGraphReplayEvidenceAdapter(store);
  const result = await persistWarGraphReplayEvidenceWithAdapter({
    attestations: [attestation],
    adapter,
    resolveGraphId: async () => 9,
  });

  assert.equal(result.createdCount, 1);
  assert.equal(result.existingJobCount, 1);
  assert.equal(result.retryableFailure, null);
});

test("canonical graph resolver uses the exact active living-wargraph identity", async () => {
  let observed: unknown = null;
  const result = await resolveCanonicalActiveWarGraphId({
    warGraph: {
      findFirst: async (args) => {
        observed = args;
        return null;
      },
    },
  });

  assert.equal(result, null);
  assert.deepEqual(observed, {
    where: { slug: WARGRAPH_CANONICAL_SLUG, status: "active" },
    select: { id: true },
  });
});

test("post-ingest retains rejected reason without invoking trusted persistence", async () => {
  const rejected = classifyReplayIngestReceipt(
    {
      replay_hash: HASH.replay,
      game_id: 42,
      finality_status: "final_recorded",
      wargraph_attestation: {
        schema: "unsupported",
      },
    },
    true,
  );
  let persistenceCalls = 0;

  const report = await coordinateReplayPostIngest({
    prisma: {},
    receipts: [rejected],
    source: "watcher",
    dependencies: {
      persistWarGraphReplayEvidence: async () => {
        persistenceCalls += 1;
        return persistenceResult();
      },
      reconcileTournamentMatchProofs: async () => undefined,
      ensureBetMarkets: async () => undefined,
    },
  });

  assert.equal(persistenceCalls, 0);
  assert.equal(report.warGraph.rejectedCount, 1);
  assert.deepEqual(report.warGraph.rejectedReasons, [
    "ATTESTATION_SCHEMA_UNSUPPORTED",
  ]);
  assert.equal(report.warGraph.succeeded, true);
});

test("post-ingest rejects an attestation bound to a different outer replay", async () => {
  const attestation = parsedAttestation();
  const classified = classifyReplayIngestReceipt(
    {
      replay_hash: "9".repeat(64),
      game_id: 43,
      finality_status: "trusted_final",
      wargraph_attestation: {
        ...attestation.canonicalReceipt,
        transport_authenticated: true,
      },
    },
    true,
  );

  assert.equal(classified.warGraph.attestation, null);
  assert.equal(
    classified.warGraph.rejectedReason,
    "ATTESTATION_REPLAY_RECEIPT_MISMATCH",
  );
});

test("WarGraph persistence failure remains retryable without suppressing financial stages", async () => {
  const attestation = parsedAttestation();
  const receipt = classifyReplayIngestReceipt(
    {
      replay_hash: HASH.replay,
      game_id: 42,
      finality_status: "trusted_final",
      final_accepted: true,
      should_settle: true,
      effective_is_final: true,
      wargraph_attestation: {
        ...attestation.canonicalReceipt,
        transport_authenticated: true,
      },
    },
    true,
  );
  const calls: string[] = [];

  const report = await coordinateReplayPostIngest({
    prisma: {},
    receipts: [receipt],
    source: "watcher",
    dependencies: {
      persistWarGraphReplayEvidence: async () => {
        calls.push("wargraph");
        throw new Error("temporary evidence database outage");
      },
      reconcileAutomaticWatcherTerminalResults: async () => {
        calls.push("automatic-result");
        return { createdCount: 0, existingCount: 0, skippedCount: 1 };
      },
      ensureReplayIdentityProjections: async () => {
        calls.push("identity");
        return { createdCount: 0, existingCount: 0, skippedCount: 1 };
      },
      reconcileTournamentMatchProofs: async () => {
        calls.push("tournament");
      },
      ensureBetMarkets: async () => {
        calls.push("markets");
      },
    },
  });

  assert.deepEqual(calls, [
    "wargraph",
    "automatic-result",
    "identity",
    "tournament",
    "markets",
  ]);
  assert.equal(report.warGraph.succeeded, false);
  assert.equal(report.warGraph.retryableCode, "WARGRAPH_EVIDENCE_STAGE_FAILED");
  assert.equal(report.financial.tournament.succeeded, true);
  assert.equal(report.financial.markets.succeeded, true);
  assert.equal(replayPostIngestReportSucceeded(report), false);
});
