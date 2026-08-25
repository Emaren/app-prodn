import type { Prisma, PrismaClient } from "@/lib/generated/prisma";

import {
  WARGRAPH_ATTESTATION_SCHEMA,
  type WarGraphWatcherAttestation,
} from "./attestations.ts";

export const WARGRAPH_CANONICAL_SLUG = "living-wargraph" as const;
export const WARGRAPH_CORRELATION_JOB_TYPE =
  "correlate_attestation" as const;
export const WARGRAPH_CORRELATION_JOB_SCHEMA =
  "aoe2war-wargraph-correlation-job/v1" as const;
export const WARGRAPH_START_CORRELATION_JOB_SCHEMA =
  "aoe2war-wargraph-start-correlation-job/v1" as const;

const HEX_64 = /^[a-f0-9]{64}$/u;

export type WarGraphCorrelationQualificationReason =
  | "NOT_PARTICIPANT_BOUND"
  | "NOT_SIGNED_LIVE_PROVENANCE"
  | "NOT_FINAL"
  | "ARCHIVE_NOT_VERIFIED"
  | "RESULT_NOT_TRUSTED"
  | "PLATFORM_MATCH_ID_MISSING"
  | "LIVE_GAME_FINGERPRINT_MISSING"
  | "ROSTER_HASH_MISSING"
  | "RESULT_HASH_MISSING"
  | "COMMENCED_AT_MISSING"
  | "ROSTER_NOT_EXACT_TWO"
  | "WINNER_NOT_EXACT_ONE"
  | "WINNER_NOT_IN_ROSTER";

export type WarGraphCorrelationQualification =
  | { eligible: true; winnerPlayerKeyHash: string }
  | { eligible: false; reason: WarGraphCorrelationQualificationReason };

export type WarGraphStartCorrelationQualificationReason =
  | "NOT_START_PHASE"
  | "NOT_PARTICIPANT_BOUND"
  | "NOT_SIGNED_LIVE_PROVENANCE"
  | "LIVE_GAME_FINGERPRINT_MISSING"
  | "ROSTER_HASH_MISSING"
  | "COMMENCED_AT_MISSING"
  | "ROSTER_NOT_EXACT_TWO";

export type WarGraphStartCorrelationQualification =
  | { eligible: true }
  | { eligible: false; reason: WarGraphStartCorrelationQualificationReason };

export type WarGraphAttestationCreateData = {
  sourceSchema: string;
  sourceAttestationId: string;
  idempotencyKey: string;
  receiptHash: string;
  uploaderUserId: number;
  apiKeyId: number | null;
  gameStatsId: number | null;
  replayParseAttemptId: number | null;
  uploaderUidSnapshot: string;
  ingestionProvenance: string | null;
  liveProvenance: boolean;
  provenanceSignatureVerified: boolean;
  replayHash: string;
  replayFingerprint: string | null;
  liveGameFingerprint: string | null;
  platformMatchId: string | null;
  watcherIdentityHash: string;
  watcherSessionHash: string;
  rosterHash: string | null;
  rosterPlayerKeyHashes: string[];
  uploaderPlayerKeyHash: string | null;
  participantBound: boolean;
  commencedAt: Date | null;
  isFinal: boolean;
  archiveVerified: boolean;
  fileRole: string | null;
  finalityStatus: string | null;
  resultTrusted: boolean;
  resultProvenance: string | null;
  winningPlayerKeyHashes: string[];
  resultHash: string | null;
  receipt: Prisma.InputJsonObject;
};

type WarGraphCorrelationJobBase = {
  graphId: number;
  jobType: typeof WARGRAPH_CORRELATION_JOB_TYPE;
  dedupeKey: string;
  availableAt: Date;
};

export type WarGraphCorrelationJobCreateData = WarGraphCorrelationJobBase & {
  payload: {
    schema: typeof WARGRAPH_CORRELATION_JOB_SCHEMA;
    phase: "final";
    sourceAttestationId: string;
    receiptHash: string;
    gameStatsId: number;
    replayHash: string;
    liveGameFingerprint: string;
    platformMatchId: string | null;
    rosterHash: string;
    rosterPlayerKeyHashes: string[];
    winnerPlayerKeyHash: string;
    resultHash: string;
    commencedAt: string;
  };
};

export type WarGraphStartCorrelationJobCreateData =
  WarGraphCorrelationJobBase & {
    payload: {
      schema: typeof WARGRAPH_START_CORRELATION_JOB_SCHEMA;
      phase: "start";
      sourceAttestationId: string;
      receiptHash: string;
      gameStatsId: number;
      replayHash: string;
      liveGameFingerprint: string;
      platformMatchId: string | null;
      rosterHash: string;
      rosterPlayerKeyHashes: string[];
      commencedAt: string;
    };
  };

export type WarGraphAnyCorrelationJobCreateData =
  | WarGraphCorrelationJobCreateData
  | WarGraphStartCorrelationJobCreateData;

export type WarGraphAppendResult = "created" | "existing";

export type WarGraphReplayEvidenceAdapter = {
  resolveUploaderUserId: (uid: string) => Promise<number | null>;
  appendAttestation: (
    data: WarGraphAttestationCreateData,
  ) => Promise<WarGraphAppendResult>;
  appendCorrelationJob: (
    data: WarGraphAnyCorrelationJobCreateData,
  ) => Promise<WarGraphAppendResult>;
};

export type WarGraphReplayEvidenceFailure = {
  code:
    | "WARGRAPH_ATTESTATION_INVALID"
    | "WARGRAPH_UPLOADER_UNRESOLVED"
    | "WARGRAPH_ATTESTATION_PERSISTENCE_FAILED"
    | "WARGRAPH_ACTIVE_GRAPH_UNAVAILABLE"
    | "WARGRAPH_GRAPH_RESOLUTION_FAILED"
    | "WARGRAPH_CORRELATION_ENQUEUE_FAILED";
  message: string;
};

export type WarGraphReplayEvidencePersistenceResult = {
  receivedCount: number;
  createdCount: number;
  existingCount: number;
  failedCount: number;
  nonqualifyingCount: number;
  enqueuedCount: number;
  existingJobCount: number;
  notEnqueuedCount: number;
  retryableFailure: WarGraphReplayEvidenceFailure | null;
};

export type WarGraphReplayEvidenceStore = {
  user: {
    findUnique: (args: {
      where: { uid: string };
      select: { id: true };
    }) => Promise<{ id: number } | null>;
  };
  warGraphWatcherAttestation: {
    createMany: (args: {
      data: WarGraphAttestationCreateData;
      skipDuplicates: true;
    }) => Promise<{ count: number }>;
    findFirst: (args: {
      where: {
        OR: Array<
          | { sourceAttestationId: string }
          | { idempotencyKey: string }
          | { receiptHash: string }
        >;
      };
      select: {
        sourceSchema: true;
        sourceAttestationId: true;
        idempotencyKey: true;
        receiptHash: true;
        uploaderUserId: true;
        gameStatsId: true;
      };
    }) => Promise<{
      sourceSchema: string;
      sourceAttestationId: string;
      idempotencyKey: string;
      receiptHash: string;
      uploaderUserId: number;
      gameStatsId: number | null;
    } | null>;
  };
  warGraph: {
    findFirst: (args: {
      where: { slug: typeof WARGRAPH_CANONICAL_SLUG; status: "active" };
      select: { id: true };
    }) => Promise<{ id: number } | null>;
  };
  warGraphJob: {
    createMany: (args: {
      data: WarGraphAnyCorrelationJobCreateData;
      skipDuplicates: true;
    }) => Promise<{ count: number }>;
    findUnique: (args: {
      where: { dedupeKey: string };
      select: { graphId: true; jobType: true; dedupeKey: true; payload: true };
    }) => Promise<{
      graphId: number;
      jobType: string;
      dedupeKey: string;
      payload: unknown;
    } | null>;
  };
};

/** Compile-time guard for the exact generated Prisma delegate names we use. */
export type WarGraphGeneratedPrismaStore = Pick<
  PrismaClient,
  "user" | "warGraphWatcherAttestation" | "warGraph" | "warGraphJob"
>;

export type WarGraphGraphResolver<TStore> = (
  store: TStore,
) => Promise<number | null>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function persistenceIdempotencyKey(attestationId: string) {
  return `wargraph-attestation:${attestationId}`;
}

function correlationDedupeKey(
  phase: "start" | "final",
  receiptHash: string,
) {
  return `wargraph-correlate:${phase}:${receiptHash}`;
}

function validNullableText(
  value: string | null,
  maximum: number,
): boolean {
  return value === null || (value.length > 0 && value.length <= maximum);
}

function isPersistableAttestation(
  attestation: WarGraphWatcherAttestation,
): boolean {
  return Boolean(
    attestation &&
      attestation.schema === WARGRAPH_ATTESTATION_SCHEMA &&
      HEX_64.test(attestation.attestationId) &&
      HEX_64.test(attestation.evidenceHash) &&
      HEX_64.test(attestation.replayHash) &&
      HEX_64.test(attestation.watcherIdentityHash) &&
      HEX_64.test(attestation.watcherSessionHash) &&
      Number.isSafeInteger(attestation.gameStatsId) &&
      attestation.gameStatsId > 0 &&
      attestation.uploaderUid.length > 0 &&
      attestation.uploaderUid.length <= 100 &&
      validNullableText(attestation.ingestionProvenance, 32) &&
      validNullableText(attestation.replayFingerprint, 160) &&
      validNullableText(attestation.platformMatchId, 128) &&
      validNullableText(attestation.fileRole, 24) &&
      validNullableText(attestation.finalityStatus, 32) &&
      validNullableText(attestation.resultProvenance, 48) &&
      (attestation.rosterHash === null || HEX_64.test(attestation.rosterHash)) &&
      (attestation.uploaderPlayerKeyHash === null ||
        HEX_64.test(attestation.uploaderPlayerKeyHash)) &&
      (attestation.resultHash === null || HEX_64.test(attestation.resultHash)) &&
      (attestation.liveGameFingerprint === null ||
        HEX_64.test(attestation.liveGameFingerprint)) &&
      attestation.rosterPlayerKeyHashes.length <= 2 &&
      attestation.rosterPlayerKeyHashes.every((value) => HEX_64.test(value)) &&
      attestation.winningPlayerKeyHashes.length <= 2 &&
      attestation.winningPlayerKeyHashes.every((value) => HEX_64.test(value)) &&
      (attestation.commencedAt === null ||
        Number.isFinite(attestation.commencedAt.getTime())) &&
      (!attestation.participantBound ||
        Boolean(
          attestation.rosterHash &&
            attestation.uploaderPlayerKeyHash &&
            attestation.rosterPlayerKeyHashes.length === 2,
        )) &&
      (!attestation.resultTrusted ||
        Boolean(
          attestation.isFinal &&
            attestation.archiveVerified &&
            attestation.resultHash &&
            attestation.resultProvenance &&
            attestation.winningPlayerKeyHashes.length === 1,
        )) &&
      record(attestation.canonicalReceipt) !== null,
  );
}

export function qualifyWarGraphAttestationForCorrelation(
  attestation: WarGraphWatcherAttestation,
): WarGraphCorrelationQualification {
  if (!attestation.participantBound) {
    return { eligible: false, reason: "NOT_PARTICIPANT_BOUND" };
  }
  if (
    !attestation.liveProvenance ||
    !attestation.provenanceSignatureVerified ||
    attestation.ingestionProvenance !== "live_monitor"
  ) {
    return { eligible: false, reason: "NOT_SIGNED_LIVE_PROVENANCE" };
  }
  if (!attestation.isFinal) {
    return { eligible: false, reason: "NOT_FINAL" };
  }
  if (!attestation.archiveVerified) {
    return { eligible: false, reason: "ARCHIVE_NOT_VERIFIED" };
  }
  if (!attestation.resultTrusted) {
    return { eligible: false, reason: "RESULT_NOT_TRUSTED" };
  }
  if (!attestation.liveGameFingerprint) {
    return { eligible: false, reason: "LIVE_GAME_FINGERPRINT_MISSING" };
  }
  if (!attestation.rosterHash) {
    return { eligible: false, reason: "ROSTER_HASH_MISSING" };
  }
  if (!attestation.resultHash) {
    return { eligible: false, reason: "RESULT_HASH_MISSING" };
  }
  if (!attestation.commencedAt) {
    return { eligible: false, reason: "COMMENCED_AT_MISSING" };
  }
  if (
    attestation.rosterPlayerKeyHashes.length !== 2 ||
    new Set(attestation.rosterPlayerKeyHashes).size !== 2
  ) {
    return { eligible: false, reason: "ROSTER_NOT_EXACT_TWO" };
  }
  if (attestation.winningPlayerKeyHashes.length !== 1) {
    return { eligible: false, reason: "WINNER_NOT_EXACT_ONE" };
  }

  const winnerPlayerKeyHash = attestation.winningPlayerKeyHashes[0];
  if (!attestation.rosterPlayerKeyHashes.includes(winnerPlayerKeyHash)) {
    return { eligible: false, reason: "WINNER_NOT_IN_ROSTER" };
  }

  return { eligible: true, winnerPlayerKeyHash };
}

export function qualifyWarGraphAttestationForStartCorrelation(
  attestation: WarGraphWatcherAttestation,
): WarGraphStartCorrelationQualification {
  if (attestation.isFinal) {
    return { eligible: false, reason: "NOT_START_PHASE" };
  }
  if (!attestation.participantBound) {
    return { eligible: false, reason: "NOT_PARTICIPANT_BOUND" };
  }
  if (
    !attestation.liveProvenance ||
    !attestation.provenanceSignatureVerified ||
    attestation.ingestionProvenance !== "live_monitor"
  ) {
    return { eligible: false, reason: "NOT_SIGNED_LIVE_PROVENANCE" };
  }
  if (!attestation.liveGameFingerprint) {
    return { eligible: false, reason: "LIVE_GAME_FINGERPRINT_MISSING" };
  }
  if (!attestation.rosterHash) {
    return { eligible: false, reason: "ROSTER_HASH_MISSING" };
  }
  if (!attestation.commencedAt) {
    return { eligible: false, reason: "COMMENCED_AT_MISSING" };
  }
  if (
    attestation.rosterPlayerKeyHashes.length !== 2 ||
    new Set(attestation.rosterPlayerKeyHashes).size !== 2
  ) {
    return { eligible: false, reason: "ROSTER_NOT_EXACT_TWO" };
  }
  return { eligible: true };
}

export function buildWarGraphAttestationCreateData(
  attestation: WarGraphWatcherAttestation,
  uploaderUserId: number,
): WarGraphAttestationCreateData {
  if (!isPersistableAttestation(attestation)) {
    throw new TypeError("WarGraph attestation is not persistence-safe");
  }
  if (!Number.isSafeInteger(uploaderUserId) || uploaderUserId <= 0) {
    throw new TypeError("WarGraph uploader user id is invalid");
  }

  const data: WarGraphAttestationCreateData = {
    sourceSchema: attestation.schema,
    sourceAttestationId: attestation.attestationId,
    idempotencyKey: persistenceIdempotencyKey(attestation.attestationId),
    receiptHash: attestation.evidenceHash,
    uploaderUserId,
    apiKeyId: null,
    gameStatsId: attestation.gameStatsId,
    replayParseAttemptId: null,
    uploaderUidSnapshot: attestation.uploaderUid,
    ingestionProvenance: attestation.ingestionProvenance,
    liveProvenance: attestation.liveProvenance,
    provenanceSignatureVerified: attestation.provenanceSignatureVerified,
    replayHash: attestation.replayHash,
    replayFingerprint: attestation.replayFingerprint,
    liveGameFingerprint: attestation.liveGameFingerprint,
    platformMatchId: attestation.platformMatchId,
    watcherIdentityHash: attestation.watcherIdentityHash,
    watcherSessionHash: attestation.watcherSessionHash,
    rosterHash: attestation.rosterHash,
    rosterPlayerKeyHashes: [...attestation.rosterPlayerKeyHashes],
    uploaderPlayerKeyHash: attestation.uploaderPlayerKeyHash,
    participantBound: attestation.participantBound,
    commencedAt: attestation.commencedAt,
    isFinal: attestation.isFinal,
    archiveVerified: attestation.archiveVerified,
    fileRole: attestation.fileRole,
    finalityStatus: attestation.finalityStatus,
    resultTrusted: attestation.resultTrusted,
    resultProvenance: attestation.resultProvenance,
    winningPlayerKeyHashes: [...attestation.winningPlayerKeyHashes],
    resultHash: attestation.resultHash,
    receipt: { ...attestation.canonicalReceipt } as Prisma.InputJsonObject,
  };
  return data satisfies Prisma.WarGraphWatcherAttestationCreateManyInput;
}

export function buildWarGraphCorrelationJobCreateData(input: {
  graphId: number;
  attestation: WarGraphWatcherAttestation;
  qualification: Extract<WarGraphCorrelationQualification, { eligible: true }>;
  availableAt: Date;
}): WarGraphCorrelationJobCreateData {
  const { attestation } = input;
  if (
    !Number.isSafeInteger(input.graphId) ||
    input.graphId <= 0 ||
    !Number.isFinite(input.availableAt.getTime()) ||
    !attestation.liveGameFingerprint ||
    !attestation.rosterHash ||
    !attestation.resultHash ||
    !attestation.commencedAt
  ) {
    throw new TypeError("WarGraph correlation job input is invalid");
  }

  const data: WarGraphCorrelationJobCreateData = {
    graphId: input.graphId,
    jobType: WARGRAPH_CORRELATION_JOB_TYPE,
    dedupeKey: correlationDedupeKey("final", attestation.evidenceHash),
    payload: {
      schema: WARGRAPH_CORRELATION_JOB_SCHEMA,
      phase: "final",
      sourceAttestationId: attestation.attestationId,
      receiptHash: attestation.evidenceHash,
      gameStatsId: attestation.gameStatsId,
      replayHash: attestation.replayHash,
      liveGameFingerprint: attestation.liveGameFingerprint,
      platformMatchId: attestation.platformMatchId,
      rosterHash: attestation.rosterHash,
      rosterPlayerKeyHashes: [...attestation.rosterPlayerKeyHashes],
      winnerPlayerKeyHash: input.qualification.winnerPlayerKeyHash,
      resultHash: attestation.resultHash,
      commencedAt: attestation.commencedAt.toISOString(),
    },
    availableAt: new Date(input.availableAt.getTime()),
  };
  return data satisfies Prisma.WarGraphJobCreateManyInput;
}

export function buildWarGraphStartCorrelationJobCreateData(input: {
  graphId: number;
  attestation: WarGraphWatcherAttestation;
  qualification: Extract<
    WarGraphStartCorrelationQualification,
    { eligible: true }
  >;
  availableAt: Date;
}): WarGraphStartCorrelationJobCreateData {
  const { attestation } = input;
  if (
    !Number.isSafeInteger(input.graphId) ||
    input.graphId <= 0 ||
    !Number.isFinite(input.availableAt.getTime()) ||
    !attestation.liveGameFingerprint ||
    !attestation.rosterHash ||
    !attestation.commencedAt
  ) {
    throw new TypeError("WarGraph start-correlation job input is invalid");
  }
  return {
    graphId: input.graphId,
    jobType: WARGRAPH_CORRELATION_JOB_TYPE,
    dedupeKey: correlationDedupeKey("start", attestation.evidenceHash),
    payload: {
      schema: WARGRAPH_START_CORRELATION_JOB_SCHEMA,
      phase: "start",
      sourceAttestationId: attestation.attestationId,
      receiptHash: attestation.evidenceHash,
      gameStatsId: attestation.gameStatsId,
      replayHash: attestation.replayHash,
      liveGameFingerprint: attestation.liveGameFingerprint,
      platformMatchId: attestation.platformMatchId,
      rosterHash: attestation.rosterHash,
      rosterPlayerKeyHashes: [...attestation.rosterPlayerKeyHashes],
      commencedAt: attestation.commencedAt.toISOString(),
    },
    availableAt: new Date(input.availableAt.getTime()),
  };
}

function exactAttestationRow(
  existing: {
    sourceSchema: string;
    sourceAttestationId: string;
    idempotencyKey: string;
    receiptHash: string;
    uploaderUserId: number;
    gameStatsId: number | null;
  },
  data: WarGraphAttestationCreateData,
) {
  return (
    existing.sourceSchema === data.sourceSchema &&
    existing.sourceAttestationId === data.sourceAttestationId &&
    existing.idempotencyKey === data.idempotencyKey &&
    existing.receiptHash === data.receiptHash &&
    existing.uploaderUserId === data.uploaderUserId &&
    existing.gameStatsId === data.gameStatsId
  );
}

function exactCorrelationJob(
  existing: {
    graphId: number;
    jobType: string;
    dedupeKey: string;
    payload: unknown;
  },
  data: WarGraphAnyCorrelationJobCreateData,
) {
  const payload = record(existing.payload);
  return Boolean(
    existing.graphId === data.graphId &&
      existing.jobType === data.jobType &&
      existing.dedupeKey === data.dedupeKey &&
      payload?.schema === data.payload.schema &&
      payload?.phase === data.payload.phase &&
      payload?.sourceAttestationId === data.payload.sourceAttestationId &&
      payload?.receiptHash === data.payload.receiptHash &&
      payload?.liveGameFingerprint === data.payload.liveGameFingerprint,
  );
}

export function createPrismaWarGraphReplayEvidenceAdapter(
  store: WarGraphReplayEvidenceStore,
): WarGraphReplayEvidenceAdapter {
  return {
    resolveUploaderUserId: async (uid) => {
      const user = await store.user.findUnique({
        where: { uid },
        select: { id: true },
      });
      return user?.id ?? null;
    },
    appendAttestation: async (data) => {
      const inserted = await store.warGraphWatcherAttestation.createMany({
        data,
        skipDuplicates: true,
      });
      if (inserted.count === 1) return "created";
      if (inserted.count !== 0) {
        throw new Error("Unexpected WarGraph attestation insert count");
      }

      const existing = await store.warGraphWatcherAttestation.findFirst({
        where: {
          OR: [
            { sourceAttestationId: data.sourceAttestationId },
            { idempotencyKey: data.idempotencyKey },
            { receiptHash: data.receiptHash },
          ],
        },
        select: {
          sourceSchema: true,
          sourceAttestationId: true,
          idempotencyKey: true,
          receiptHash: true,
          uploaderUserId: true,
          gameStatsId: true,
        },
      });
      if (!existing || !exactAttestationRow(existing, data)) {
        throw new Error("WarGraph attestation identity collision");
      }
      return "existing";
    },
    appendCorrelationJob: async (data) => {
      const inserted = await store.warGraphJob.createMany({
        data,
        skipDuplicates: true,
      });
      if (inserted.count === 1) return "created";
      if (inserted.count !== 0) {
        throw new Error("Unexpected WarGraph job insert count");
      }

      const existing = await store.warGraphJob.findUnique({
        where: { dedupeKey: data.dedupeKey },
        select: {
          graphId: true,
          jobType: true,
          dedupeKey: true,
          payload: true,
        },
      });
      if (!existing || !exactCorrelationJob(existing, data)) {
        throw new Error("WarGraph correlation job identity collision");
      }
      return "existing";
    },
  };
}

export async function resolveCanonicalActiveWarGraphId(
  store: Pick<WarGraphReplayEvidenceStore, "warGraph">,
): Promise<number | null> {
  const graph = await store.warGraph.findFirst({
    where: { slug: WARGRAPH_CANONICAL_SLUG, status: "active" },
    select: { id: true },
  });
  return graph?.id ?? null;
}

function emptyResult(receivedCount: number): WarGraphReplayEvidencePersistenceResult {
  return {
    receivedCount,
    createdCount: 0,
    existingCount: 0,
    failedCount: 0,
    nonqualifyingCount: 0,
    enqueuedCount: 0,
    existingJobCount: 0,
    notEnqueuedCount: 0,
    retryableFailure: null,
  };
}

function noteFailure(
  result: WarGraphReplayEvidencePersistenceResult,
  failure: WarGraphReplayEvidenceFailure,
) {
  if (!result.retryableFailure) result.retryableFailure = failure;
}

export async function persistWarGraphReplayEvidenceWithAdapter(input: {
  attestations: readonly WarGraphWatcherAttestation[];
  adapter: WarGraphReplayEvidenceAdapter;
  resolveGraphId: () => Promise<number | null>;
  now?: () => Date;
}): Promise<WarGraphReplayEvidencePersistenceResult> {
  const result = emptyResult(input.attestations.length);
  const qualifyingPersisted: Array<
    | {
        phase: "final";
        attestation: WarGraphWatcherAttestation;
        qualification: Extract<
          WarGraphCorrelationQualification,
          { eligible: true }
        >;
      }
    | {
        phase: "start";
        attestation: WarGraphWatcherAttestation;
        qualification: Extract<
          WarGraphStartCorrelationQualification,
          { eligible: true }
        >;
      }
  > = [];
  const uploaderIds = new Map<string, Promise<number | null>>();

  for (const attestation of input.attestations) {
    if (!isPersistableAttestation(attestation)) {
      result.failedCount += 1;
      noteFailure(result, {
        code: "WARGRAPH_ATTESTATION_INVALID",
        message: "WarGraph attestation was not safe to persist.",
      });
      continue;
    }

    const finalQualification =
      qualifyWarGraphAttestationForCorrelation(attestation);
    const startQualification =
      qualifyWarGraphAttestationForStartCorrelation(attestation);

    try {
      let uploaderIdPromise = uploaderIds.get(attestation.uploaderUid);
      if (!uploaderIdPromise) {
        uploaderIdPromise = input.adapter.resolveUploaderUserId(
          attestation.uploaderUid,
        );
        uploaderIds.set(attestation.uploaderUid, uploaderIdPromise);
      }
      const uploaderUserId = await uploaderIdPromise;
      if (uploaderUserId === null) {
        result.failedCount += 1;
        noteFailure(result, {
          code: "WARGRAPH_UPLOADER_UNRESOLVED",
          message: "WarGraph attestation uploader is not yet resolvable.",
        });
        continue;
      }

      const appendResult = await input.adapter.appendAttestation(
        buildWarGraphAttestationCreateData(attestation, uploaderUserId),
      );
      if (appendResult === "created") result.createdCount += 1;
      else result.existingCount += 1;

      if (finalQualification.eligible) {
        qualifyingPersisted.push({
          phase: "final",
          attestation,
          qualification: finalQualification,
        });
      } else if (startQualification.eligible) {
        qualifyingPersisted.push({
          phase: "start",
          attestation,
          qualification: startQualification,
        });
      } else {
        result.nonqualifyingCount += 1;
      }
    } catch {
      result.failedCount += 1;
      noteFailure(result, {
        code: "WARGRAPH_ATTESTATION_PERSISTENCE_FAILED",
        message: "WarGraph attestation persistence must be retried.",
      });
    }
  }

  if (qualifyingPersisted.length === 0) return result;

  let graphId: number | null;
  try {
    graphId = await input.resolveGraphId();
  } catch {
    result.notEnqueuedCount += qualifyingPersisted.length;
    noteFailure(result, {
      code: "WARGRAPH_GRAPH_RESOLUTION_FAILED",
      message: "Canonical WarGraph resolution must be retried.",
    });
    return result;
  }

  if (graphId === null) {
    result.notEnqueuedCount += qualifyingPersisted.length;
    noteFailure(result, {
      code: "WARGRAPH_ACTIVE_GRAPH_UNAVAILABLE",
      message: "Canonical active WarGraph is not available yet.",
    });
    return result;
  }

  for (const candidate of qualifyingPersisted) {
    try {
      const availableAt = input.now?.() ?? new Date();
      const data =
        candidate.phase === "final"
          ? buildWarGraphCorrelationJobCreateData({
              graphId,
              attestation: candidate.attestation,
              qualification: candidate.qualification,
              availableAt,
            })
          : buildWarGraphStartCorrelationJobCreateData({
              graphId,
              attestation: candidate.attestation,
              qualification: candidate.qualification,
              availableAt,
            });
      const appendResult = await input.adapter.appendCorrelationJob(data);
      if (appendResult === "created") result.enqueuedCount += 1;
      else result.existingJobCount += 1;
    } catch {
      result.notEnqueuedCount += 1;
      noteFailure(result, {
        code: "WARGRAPH_CORRELATION_ENQUEUE_FAILED",
        message: "WarGraph correlation enqueue must be retried.",
      });
    }
  }

  return result;
}

export async function persistWarGraphReplayEvidence<
  TStore extends WarGraphGeneratedPrismaStore,
>(input: {
  store: TStore;
  attestations: readonly WarGraphWatcherAttestation[];
  resolveGraphId?: WarGraphGraphResolver<TStore>;
  now?: () => Date;
}): Promise<WarGraphReplayEvidencePersistenceResult> {
  return persistWarGraphReplayEvidenceWithAdapter({
    attestations: input.attestations,
    adapter: createPrismaWarGraphReplayEvidenceAdapter(
      input.store as unknown as WarGraphReplayEvidenceStore,
    ),
    resolveGraphId: () =>
      input.resolveGraphId
        ? input.resolveGraphId(input.store)
        : resolveCanonicalActiveWarGraphId(
            input.store as unknown as Pick<
              WarGraphReplayEvidenceStore,
              "warGraph"
            >,
          ),
    now: input.now,
  });
}
