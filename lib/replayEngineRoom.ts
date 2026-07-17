import { createHash } from "node:crypto";

export const REPLAY_ENGINE_MAX_BATCH_SIZE = 500;
export const REPLAY_ENGINE_MAX_JOB_ARTIFACTS = 100_000;
export const REPLAY_ENGINE_MAX_ATTEMPTS_PER_ARTIFACT = 10;

export const HD_REPLAY_PARSER_CONTRACT = {
  parserName: "aoe2war.mgz_hd",
  parserVersion: "1.8.51",
  schemaVersion: "2026-07-16.4",
  passName: "hd_deterministic_evidence",
  passVersion: "6",
} as const;

export const REPLAY_ENGINE_APPEND_ONLY_TABLES = [
  "replay_artifacts",
  "replay_submissions",
  "replay_parse_runs",
  "replay_observations",
  "replay_observation_promotions",
  "replay_evidence_artifacts",
  "replay_evidence_links",
  "replay_reprocess_jobs",
  "replay_reprocess_job_events",
] as const;

export const REPLAY_REPROCESS_EVENT_TYPES = [
  "queued",
  "leased",
  "batch_started",
  "artifact_completed",
  "checkpointed",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;

export type ReplayReprocessEventType =
  (typeof REPLAY_REPROCESS_EVENT_TYPES)[number];
export type ReplayReprocessDerivedStatus =
  | "created"
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

type JsonPrimitive = string | number | boolean | null;
export type ReplayEngineJson =
  | JsonPrimitive
  | ReplayEngineJson[]
  | { [key: string]: ReplayEngineJson };

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export class ReplayEngineRoomContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReplayEngineRoomContractError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new ReplayEngineRoomContractError(code, message);
}

function cleanText(value: unknown, field: string, maxLength: number) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text) fail(`invalid_${field}`, `${field} is required.`);
  if (text.length > maxLength) {
    fail(`invalid_${field}`, `${field} must be ${maxLength} characters or fewer.`);
  }
  return text;
}

function optionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text || text.length > maxLength) {
    fail("invalid_optional_text", `Optional text must be ${maxLength} characters or fewer.`);
  }
  return text;
}

function sha256Text(value: unknown, field: string) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!SHA256_PATTERN.test(normalized)) {
    fail(`invalid_${field}`, `${field} must be a lowercase SHA-256 digest.`);
  }
  return normalized;
}

function positiveInteger(
  value: unknown,
  field: string,
  maximum = Number.MAX_SAFE_INTEGER
) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    fail(`invalid_${field}`, `${field} must be an integer between 1 and ${maximum}.`);
  }
  return parsed;
}

function nonNegativeInteger(value: unknown, field: string) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail(`invalid_${field}`, `${field} must be a non-negative integer.`);
  }
  return parsed;
}

function stableJsonValue(value: unknown): ReplayEngineJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("invalid_json", "JSON numbers must be finite.");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonValue(entry)])
    );
  }
  fail("invalid_json", "Value must be JSON serializable.");
}

export function stableReplayEngineJson(value: unknown): ReplayEngineJson {
  return stableJsonValue(value);
}

export function replayEngineSha256(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableJsonValue(value)))
    .digest("hex");
}

function idempotencyKey(value: unknown, fallbackPrefix: string, digest: string) {
  if (value === undefined || value === null || value === "") {
    return `${fallbackPrefix}:${digest}`;
  }
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!SAFE_KEY_PATTERN.test(normalized)) {
    fail(
      "invalid_idempotency_key",
      "idempotencyKey must be 8-128 URL-safe characters."
    );
  }
  return normalized;
}

export type ReplayArtifactManifest = {
  sha256: string;
  byteSize: number;
  storageProvider: string;
  storageKey: string;
  originalExtension: string | null;
  mediaType: string | null;
  headerFingerprint: string | null;
  archiveMetadata: ReplayEngineJson | null;
  idempotencyKey: string;
};

export function buildReplayArtifactManifest(input: {
  sha256: unknown;
  byteSize: unknown;
  storageProvider?: unknown;
  storageKey: unknown;
  originalExtension?: unknown;
  mediaType?: unknown;
  headerFingerprint?: unknown;
  archiveMetadata?: unknown;
  idempotencyKey?: unknown;
}): ReplayArtifactManifest {
  const sha256 = sha256Text(input.sha256, "sha256");
  const byteSize = positiveInteger(input.byteSize, "byte_size");
  const storageProvider = input.storageProvider
    ? cleanText(input.storageProvider, "storage_provider", 32)
    : "filesystem";
  const storageKey = cleanText(input.storageKey, "storage_key", 1000);
  const originalExtension = optionalText(input.originalExtension, 32);
  const mediaType = optionalText(input.mediaType, 100);
  const headerFingerprint = optionalText(input.headerFingerprint, 128);
  const archiveMetadata =
    input.archiveMetadata === undefined || input.archiveMetadata === null
      ? null
      : stableJsonValue(input.archiveMetadata);

  return {
    sha256,
    byteSize,
    storageProvider,
    storageKey,
    originalExtension,
    mediaType,
    headerFingerprint,
    archiveMetadata,
    idempotencyKey: idempotencyKey(input.idempotencyKey, "artifact", sha256),
  };
}

export type ReplaySubmissionReceipt = {
  artifactSha256: string;
  source: string;
  submitterUidSnapshot: string | null;
  originalFilename: string | null;
  clientSubmissionId: string | null;
  transportMetadata: ReplayEngineJson | null;
  receiptIdentityHash: string;
  idempotencyKey: string;
};

export function buildReplaySubmissionReceipt(input: {
  artifactSha256: unknown;
  source: unknown;
  submitterUidSnapshot?: unknown;
  originalFilename?: unknown;
  clientSubmissionId?: unknown;
  transportMetadata?: unknown;
  idempotencyKey?: unknown;
}): ReplaySubmissionReceipt {
  const artifactSha256 = sha256Text(input.artifactSha256, "artifact_sha256");
  const source = cleanText(input.source, "source", 32);
  const submitterUidSnapshot = optionalText(input.submitterUidSnapshot, 100);
  const originalFilename = optionalText(input.originalFilename, 255);
  const clientSubmissionId = optionalText(input.clientSubmissionId, 128);
  if (!clientSubmissionId && !input.idempotencyKey) {
    fail(
      "submission_idempotency_required",
      "A transport idempotency key or clientSubmissionId is required."
    );
  }
  const transportMetadata =
    input.transportMetadata === undefined || input.transportMetadata === null
      ? null
      : stableJsonValue(input.transportMetadata);
  const receiptIdentityHash = replayEngineSha256({
    artifactSha256,
    source,
    submitterUidSnapshot,
    clientSubmissionId,
  });

  return {
    artifactSha256,
    source,
    submitterUidSnapshot,
    originalFilename,
    clientSubmissionId,
    transportMetadata,
    receiptIdentityHash,
    idempotencyKey: idempotencyKey(
      input.idempotencyKey,
      "submission",
      receiptIdentityHash
    ),
  };
}

export type ReplayParseRunIdentity = {
  artifactSha256: string;
  parserName: string;
  parserVersion: string;
  parserBuild: string | null;
  passName: string;
  passVersion: string;
  schemaVersion: string;
  inputHash: string;
  parserConfig: ReplayEngineJson;
  parserConfigHash: string;
  runIdentityHash: string;
  idempotencyKey: string;
  candidateOnly: true;
  affectsPublicAggregates: false;
};

export function buildReplayParseRunIdentity(input: {
  artifactSha256: unknown;
  parserName: unknown;
  parserVersion: unknown;
  parserBuild?: unknown;
  passName: unknown;
  passVersion: unknown;
  schemaVersion: unknown;
  inputHash?: unknown;
  parserConfig?: unknown;
  idempotencyKey?: unknown;
}): ReplayParseRunIdentity {
  const artifactSha256 = sha256Text(input.artifactSha256, "artifact_sha256");
  const parserName = cleanText(input.parserName, "parser_name", 64);
  const parserVersion = cleanText(input.parserVersion, "parser_version", 64);
  const parserBuild = optionalText(input.parserBuild, 128);
  const passName = cleanText(input.passName, "pass_name", 64);
  const passVersion = cleanText(input.passVersion, "pass_version", 64);
  const schemaVersion = cleanText(input.schemaVersion, "schema_version", 64);
  const inputHash = input.inputHash
    ? sha256Text(input.inputHash, "input_hash")
    : artifactSha256;
  if (parserBuild !== null) {
    fail(
      "unsupported_parser_build",
      "The production worker identity does not carry a separate parser build."
    );
  }
  if (inputHash !== artifactSha256) {
    fail(
      "input_hash_mismatch",
      "The production worker input hash must equal the immutable artifact hash."
    );
  }
  const parserConfig = stableJsonValue(input.parserConfig ?? {});
  const parserConfigHash = replayEngineSha256(parserConfig);
  // This snake-case envelope is the Python worker's persisted identity contract.
  // Change it only with the cross-language golden vectors in both repos.
  const parser = {
    implementation: parserName,
    implementation_version: parserVersion,
    schema_version: schemaVersion,
    pass_name: passName,
    pass_version: passVersion,
    options: parserConfig,
  };
  const runIdentityHash = replayEngineSha256({
    artifact_sha256: artifactSha256,
    parser,
  });
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) {
    const supplied = sha256Text(input.idempotencyKey, "idempotency_key");
    if (supplied !== runIdentityHash) {
      fail(
        "parse_run_idempotency_mismatch",
        "The parse-run idempotency key must equal the canonical worker identity hash."
      );
    }
  }

  return {
    artifactSha256,
    parserName,
    parserVersion,
    parserBuild,
    passName,
    passVersion,
    schemaVersion,
    inputHash,
    parserConfig,
    parserConfigHash,
    runIdentityHash,
    idempotencyKey: runIdentityHash,
    candidateOnly: true,
    affectsPublicAggregates: false,
  };
}

export type ReplayParseRunCandidateOutput = {
  candidateOutputHash: string;
  candidateOutputStorageProvider: string;
  candidateOutputStorageKey: string;
  candidateOutputByteSize: number;
  observationCount: number;
  actionCount: number;
  inlineCandidateOutput: false;
  candidateOnly: true;
  affectsPublicAggregates: false;
};

export function buildReplayParseRunCandidateOutput(input: {
  candidateOutputHash: unknown;
  candidateOutputStorageProvider?: unknown;
  candidateOutputStorageKey: unknown;
  candidateOutputByteSize: unknown;
  observationCount: unknown;
  actionCount: unknown;
}): ReplayParseRunCandidateOutput {
  return {
    candidateOutputHash: sha256Text(
      input.candidateOutputHash,
      "candidate_output_hash"
    ),
    candidateOutputStorageProvider: input.candidateOutputStorageProvider
      ? cleanText(
          input.candidateOutputStorageProvider,
          "candidate_output_storage_provider",
          32
        )
      : "filesystem",
    candidateOutputStorageKey: cleanText(
      input.candidateOutputStorageKey,
      "candidate_output_storage_key",
      1000
    ),
    candidateOutputByteSize: positiveInteger(
      input.candidateOutputByteSize,
      "candidate_output_byte_size"
    ),
    observationCount: nonNegativeInteger(
      input.observationCount,
      "observation_count"
    ),
    actionCount: nonNegativeInteger(input.actionCount, "action_count"),
    inlineCandidateOutput: false,
    candidateOnly: true,
    affectsPublicAggregates: false,
  };
}

export type ReplayObservationCandidate = {
  parseRunIdentityHash: string;
  observationKey: string;
  observationKind: string;
  fieldPath: string;
  value: ReplayEngineJson;
  valueHash: string;
  confidenceBps: number | null;
  provenance: ReplayEngineJson;
  idempotencyKey: string;
  candidateOnly: true;
  affectsPublicAggregates: false;
};

export function buildReplayObservationCandidate(input: {
  parseRunIdentityHash: unknown;
  observationKey: unknown;
  observationKind: unknown;
  fieldPath: unknown;
  value: unknown;
  confidenceBps?: unknown;
  provenance: unknown;
  idempotencyKey?: unknown;
}): ReplayObservationCandidate {
  const parseRunIdentityHash = sha256Text(
    input.parseRunIdentityHash,
    "parse_run_identity_hash"
  );
  const observationKey = cleanText(input.observationKey, "observation_key", 160);
  const observationKind = cleanText(input.observationKind, "observation_kind", 40);
  const fieldPath = cleanText(input.fieldPath, "field_path", 255);
  const value = stableJsonValue(input.value);
  const provenance = stableJsonValue(input.provenance);
  const valueHash = replayEngineSha256(value);
  const confidenceBps =
    input.confidenceBps === undefined || input.confidenceBps === null
      ? null
      : nonNegativeInteger(input.confidenceBps, "confidence_bps");
  if (confidenceBps !== null && confidenceBps > 10_000) {
    fail("invalid_confidence_bps", "confidenceBps cannot exceed 10000.");
  }
  const identity = replayEngineSha256({ parseRunIdentityHash, observationKey });

  return {
    parseRunIdentityHash,
    observationKey,
    observationKind,
    fieldPath,
    value,
    valueHash,
    confidenceBps,
    provenance,
    idempotencyKey: idempotencyKey(input.idempotencyKey, "observation", identity),
    candidateOnly: true,
    affectsPublicAggregates: false,
  };
}

export type ReplayObservationPromotionDecision = {
  observationIdentityHash: string;
  promotionKey: string;
  policyVersion: string;
  reason: string;
  supersedesId: number | null;
  decisionHash: string;
  idempotencyKey: string;
  affectsPublicAggregates: false;
};

export function buildReplayObservationPromotionDecision(input: {
  observationIdentityHash: unknown;
  promotionKey: unknown;
  policyVersion: unknown;
  reason: unknown;
  supersedesId?: unknown;
  idempotencyKey?: unknown;
}): ReplayObservationPromotionDecision {
  const observationIdentityHash = sha256Text(
    input.observationIdentityHash,
    "observation_identity_hash"
  );
  const promotionKey = cleanText(input.promotionKey, "promotion_key", 255);
  const policyVersion = cleanText(input.policyVersion, "policy_version", 64);
  const reason = cleanText(input.reason, "reason", 10_000);
  if (reason.length < 8) fail("invalid_reason", "reason must be at least 8 characters.");
  const supersedesId =
    input.supersedesId === undefined || input.supersedesId === null
      ? null
      : positiveInteger(input.supersedesId, "supersedes_id");
  const decisionHash = replayEngineSha256({
    observationIdentityHash,
    promotionKey,
    policyVersion,
    reason,
    supersedesId,
  });

  return {
    observationIdentityHash,
    promotionKey,
    policyVersion,
    reason,
    supersedesId,
    decisionHash,
    idempotencyKey: idempotencyKey(input.idempotencyKey, "promotion", decisionHash),
    affectsPublicAggregates: false,
  };
}

export type ReplayEvidenceArtifactManifest = {
  sha256: string;
  byteSize: number;
  storageProvider: string;
  storageKey: string;
  evidenceKind: string;
  mediaType: string | null;
  sourceParseRunIdentityHash: string | null;
  sourceCandidateOutputHash: string | null;
  capturedAt: string | null;
  metadata: ReplayEngineJson | null;
  idempotencyKey: string;
};

export function buildReplayEvidenceArtifactManifest(input: {
  sha256: unknown;
  byteSize: unknown;
  storageProvider?: unknown;
  storageKey: unknown;
  evidenceKind: unknown;
  mediaType?: unknown;
  sourceParseRunIdentityHash?: unknown;
  sourceCandidateOutputHash?: unknown;
  capturedAt?: unknown;
  metadata?: unknown;
  idempotencyKey?: unknown;
}): ReplayEvidenceArtifactManifest {
  const sha256 = sha256Text(input.sha256, "sha256");
  const sourceParseRunIdentityHash =
    input.sourceParseRunIdentityHash === undefined ||
    input.sourceParseRunIdentityHash === null
      ? null
      : sha256Text(
          input.sourceParseRunIdentityHash,
          "source_parse_run_identity_hash"
        );
  const sourceCandidateOutputHash =
    input.sourceCandidateOutputHash === undefined ||
    input.sourceCandidateOutputHash === null
      ? null
      : sha256Text(
          input.sourceCandidateOutputHash,
          "source_candidate_output_hash"
        );
  if (Boolean(sourceParseRunIdentityHash) !== Boolean(sourceCandidateOutputHash)) {
    fail(
      "incomplete_source_output_reference",
      "Evidence must reference both the parse run and its exact candidate output hash."
    );
  }
  let capturedAt: string | null = null;
  if (input.capturedAt !== undefined && input.capturedAt !== null) {
    const parsed = new Date(String(input.capturedAt));
    if (Number.isNaN(parsed.getTime())) {
      fail("invalid_captured_at", "capturedAt must be an ISO-compatible timestamp.");
    }
    capturedAt = parsed.toISOString();
  }

  return {
    sha256,
    byteSize: positiveInteger(input.byteSize, "byte_size"),
    storageProvider: input.storageProvider
      ? cleanText(input.storageProvider, "storage_provider", 32)
      : "filesystem",
    storageKey: cleanText(input.storageKey, "storage_key", 1000),
    evidenceKind: cleanText(input.evidenceKind, "evidence_kind", 40),
    mediaType: optionalText(input.mediaType, 100),
    sourceParseRunIdentityHash,
    sourceCandidateOutputHash,
    capturedAt,
    metadata:
      input.metadata === undefined || input.metadata === null
        ? null
        : stableJsonValue(input.metadata),
    idempotencyKey: idempotencyKey(input.idempotencyKey, "evidence", sha256),
  };
}

export type ReplayReprocessJobManifest = {
  scopeKind: string;
  scope: ReplayEngineJson;
  scopeHash: string;
  parserName: string;
  parserVersion: string;
  schemaVersion: string;
  passName: string;
  passVersion: string;
  parserConfig: ReplayEngineJson;
  parserConfigHash: string;
  batchSize: number;
  maxArtifacts: number;
  maxAttemptsPerArtifact: number;
  dryRun: boolean;
  jobIdentityHash: string;
  idempotencyKey: string;
  candidateOnly: true;
  affectsPublicAggregates: false;
};

export function buildReplayReprocessJobManifest(input: {
  scopeKind: unknown;
  scope: unknown;
  parserName: unknown;
  parserVersion: unknown;
  schemaVersion: unknown;
  passName: unknown;
  passVersion: unknown;
  parserConfig?: unknown;
  batchSize?: unknown;
  maxArtifacts: unknown;
  maxAttemptsPerArtifact?: unknown;
  dryRun?: unknown;
  idempotencyKey?: unknown;
}): ReplayReprocessJobManifest {
  const scopeKind = cleanText(input.scopeKind, "scope_kind", 40);
  const scope = stableJsonValue(input.scope);
  const scopeHash = replayEngineSha256(scope);
  const parserName = cleanText(input.parserName, "parser_name", 64);
  const parserVersion = cleanText(input.parserVersion, "parser_version", 64);
  const schemaVersion = cleanText(input.schemaVersion, "schema_version", 64);
  const passName = cleanText(input.passName, "pass_name", 64);
  const passVersion = cleanText(input.passVersion, "pass_version", 64);
  const parserConfig = stableJsonValue(input.parserConfig ?? {});
  const parserConfigHash = replayEngineSha256(parserConfig);
  const maxArtifacts = positiveInteger(
    input.maxArtifacts,
    "max_artifacts",
    REPLAY_ENGINE_MAX_JOB_ARTIFACTS
  );
  if (scopeKind !== "frozen_csv_manifest") {
    fail(
      "unsupported_scope_kind",
      "The production worker persists only frozen_csv_manifest jobs."
    );
  }
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    fail("invalid_scope", "A persisted worker scope must be a JSON object.");
  }
  if (scope.kind !== scopeKind || scope.manifest_rows !== maxArtifacts) {
    fail(
      "scope_manifest_mismatch",
      "The frozen scope kind and manifest row count must match the immutable job fields."
    );
  }
  const requestedBatchSize =
    input.batchSize === undefined || input.batchSize === null
      ? Math.min(50, maxArtifacts)
      : positiveInteger(
          input.batchSize,
          "batch_size",
          REPLAY_ENGINE_MAX_BATCH_SIZE
        );
  const batchSize = Math.min(requestedBatchSize, maxArtifacts);
  const maxAttemptsPerArtifact =
    input.maxAttemptsPerArtifact === undefined || input.maxAttemptsPerArtifact === null
      ? 1
      : positiveInteger(
          input.maxAttemptsPerArtifact,
          "max_attempts_per_artifact",
          REPLAY_ENGINE_MAX_ATTEMPTS_PER_ARTIFACT
        );
  if (maxAttemptsPerArtifact !== 1) {
    fail(
      "unsupported_attempt_limit",
      "The production candidate worker uses exactly one immutable attempt per parser identity."
    );
  }
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") {
    fail("invalid_dry_run", "dryRun must be a boolean.");
  }
  const dryRun = input.dryRun ?? false;
  if (dryRun) {
    fail(
      "dry_run_not_persisted",
      "Read-only plans are not persisted as Engine Room jobs."
    );
  }
  // Keep byte-for-byte parity with api-prodn build_job_spec().
  const parser = {
    implementation: parserName,
    implementation_version: parserVersion,
    schema_version: schemaVersion,
    pass_name: passName,
    pass_version: passVersion,
    options: parserConfig,
  };
  const jobIdentityHash = replayEngineSha256({
    scope_hash: scopeHash,
    parser,
    batch_size: batchSize,
    max_attempts_per_artifact: maxAttemptsPerArtifact,
    candidate_only: true,
    affects_public_aggregates: false,
  });
  const canonicalIdempotencyKey = `replay-engine-room:${jobIdentityHash}`;
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) {
    const supplied = cleanText(input.idempotencyKey, "idempotency_key", 128);
    if (supplied !== canonicalIdempotencyKey) {
      fail(
        "reprocess_idempotency_mismatch",
        "The reprocess idempotency key must equal the canonical worker key."
      );
    }
  }

  return {
    scopeKind,
    scope,
    scopeHash,
    parserName,
    parserVersion,
    schemaVersion,
    passName,
    passVersion,
    parserConfig,
    parserConfigHash,
    batchSize,
    maxArtifacts,
    maxAttemptsPerArtifact,
    dryRun,
    jobIdentityHash,
    idempotencyKey: canonicalIdempotencyKey,
    candidateOnly: true,
    affectsPublicAggregates: false,
  };
}

export type ReplayReprocessJobEventSnapshot = {
  sequence: number;
  eventType: ReplayReprocessEventType;
  checkpointCursor?: string | null;
  attemptNumber?: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
};

export type ReplayReprocessJobState = {
  status: ReplayReprocessDerivedStatus;
  nextSequence: number;
  checkpointCursor: string | null;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  remainingArtifacts: number | null;
  terminal: boolean;
  lastEventType: ReplayReprocessEventType | null;
};

const TERMINAL_EVENT_TYPES = new Set<ReplayReprocessEventType>([
  "completed",
  "failed",
  "cancelled",
]);

function statusForEvent(eventType: ReplayReprocessEventType): ReplayReprocessDerivedStatus {
  if (eventType === "queued") return "queued";
  if (eventType === "paused") return "paused";
  if (eventType === "completed") return "completed";
  if (eventType === "failed") return "failed";
  if (eventType === "cancelled") return "cancelled";
  return "running";
}

export function deriveReplayReprocessJobState(
  sourceEvents: ReplayReprocessJobEventSnapshot[],
  maxArtifacts?: number
): ReplayReprocessJobState {
  const events = [...sourceEvents].sort((left, right) => left.sequence - right.sequence);
  const limit =
    maxArtifacts === undefined
      ? null
      : positiveInteger(
          maxArtifacts,
          "max_artifacts",
          REPLAY_ENGINE_MAX_JOB_ARTIFACTS
        );

  if (events.length === 0) {
    return {
      status: "created",
      nextSequence: 0,
      checkpointCursor: null,
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      skippedCount: 0,
      remainingArtifacts: limit,
      terminal: false,
      lastEventType: null,
    };
  }

  let prior: ReplayReprocessJobEventSnapshot | null = null;
  let checkpointCursor: string | null = null;
  for (const [index, event] of events.entries()) {
    if (!REPLAY_REPROCESS_EVENT_TYPES.includes(event.eventType)) {
      fail("invalid_event_type", `Unsupported event type ${String(event.eventType)}.`);
    }
    if (event.sequence !== index) {
      fail("event_sequence_gap", `Expected event sequence ${index}.`);
    }
    if (index === 0 && event.eventType !== "queued") {
      fail("missing_queued_event", "Sequence zero must be queued.");
    }
    if (index > 0 && event.eventType === "queued") {
      fail("duplicate_queued_event", "Queued is valid only at sequence zero.");
    }
    if (prior && TERMINAL_EVENT_TYPES.has(prior.eventType)) {
      fail("event_after_terminal", "A terminal job cannot accept another event.");
    }

    const processedCount = nonNegativeInteger(event.processedCount, "processed_count");
    const succeededCount = nonNegativeInteger(event.succeededCount, "succeeded_count");
    const failedCount = nonNegativeInteger(event.failedCount, "failed_count");
    const skippedCount = nonNegativeInteger(event.skippedCount, "skipped_count");
    if (processedCount !== succeededCount + failedCount + skippedCount) {
      fail("invalid_event_counts", "Processed count must equal all terminal outcomes.");
    }
    if (index === 0 && processedCount !== 0) {
      fail("queued_counts_nonzero", "The queued event must start with zero counters.");
    }
    if (
      prior &&
      (processedCount < prior.processedCount ||
        succeededCount < prior.succeededCount ||
        failedCount < prior.failedCount ||
        skippedCount < prior.skippedCount)
    ) {
      fail("non_monotonic_event_counts", "Job counters must be monotonic.");
    }
    if (limit !== null && processedCount > limit) {
      fail("job_limit_exceeded", "Job events exceed the immutable artifact limit.");
    }
    if (prior) {
      if (
        event.eventType === "artifact_completed" &&
        processedCount !== prior.processedCount + 1
      ) {
        fail(
          "invalid_artifact_completion_count",
          "artifact_completed must advance processedCount by exactly one."
        );
      }
      if (
        event.eventType !== "artifact_completed" &&
        (processedCount !== prior.processedCount ||
          succeededCount !== prior.succeededCount ||
          failedCount !== prior.failedCount ||
          skippedCount !== prior.skippedCount)
      ) {
        fail(
          "non_artifact_counter_change",
          "Only artifact_completed may advance job counters."
        );
      }
    }
    if (event.eventType === "completed" && limit !== null && processedCount !== limit) {
      fail(
        "incomplete_job_completion",
        "A completed job must account for every immutable manifest artifact."
      );
    }
    if (event.checkpointCursor !== undefined && event.checkpointCursor !== null) {
      checkpointCursor = cleanText(
        event.checkpointCursor,
        "checkpoint_cursor",
        500
      );
    }
    prior = {
      ...event,
      processedCount,
      succeededCount,
      failedCount,
      skippedCount,
    };
  }

  const last = prior as ReplayReprocessJobEventSnapshot;
  return {
    status: statusForEvent(last.eventType),
    nextSequence: last.sequence + 1,
    checkpointCursor,
    processedCount: last.processedCount,
    succeededCount: last.succeededCount,
    failedCount: last.failedCount,
    skippedCount: last.skippedCount,
    remainingArtifacts:
      limit === null ? null : Math.max(0, limit - last.processedCount),
    terminal: TERMINAL_EVENT_TYPES.has(last.eventType),
    lastEventType: last.eventType,
  };
}

export type ReplayReprocessJobEventContract = ReplayReprocessJobEventSnapshot & {
  jobId: number;
  jobIdentityHash: string;
  artifactSha256: string | null;
  parseRunIdentityHash: string | null;
  manifestCursor: string | null;
  workerKey: string | null;
  checkpointCursor: string | null;
  attemptNumber: number;
  idempotencyKey: string;
};

export function buildReplayReprocessJobEvent(input: {
  jobId: unknown;
  jobIdentityHash: unknown;
  manifest: Pick<
    ReplayReprocessJobManifest,
    "maxArtifacts" | "maxAttemptsPerArtifact"
  >;
  state: ReplayReprocessJobState;
  eventType: ReplayReprocessEventType;
  artifactSha256?: unknown;
  parseRunIdentityHash?: unknown;
  manifestCursor?: unknown;
  workerKey?: unknown;
  checkpointCursor?: unknown;
  attemptNumber?: unknown;
  processedCount?: unknown;
  succeededCount?: unknown;
  failedCount?: unknown;
  skippedCount?: unknown;
  idempotencyKey?: unknown;
}): ReplayReprocessJobEventContract {
  if (input.state.terminal) {
    fail("job_is_terminal", "A terminal reprocessing job cannot accept another event.");
  }
  if (!REPLAY_REPROCESS_EVENT_TYPES.includes(input.eventType)) {
    fail("invalid_event_type", `Unsupported event type ${String(input.eventType)}.`);
  }
  if (input.state.nextSequence === 0 && input.eventType !== "queued") {
    fail("missing_queued_event", "Sequence zero must be queued.");
  }
  if (input.state.nextSequence > 0 && input.eventType === "queued") {
    fail("duplicate_queued_event", "Queued is valid only at sequence zero.");
  }

  const jobId = positiveInteger(input.jobId, "job_id");
  const jobIdentityHash = sha256Text(input.jobIdentityHash, "job_identity_hash");
  const maxArtifacts = positiveInteger(
    input.manifest.maxArtifacts,
    "max_artifacts",
    REPLAY_ENGINE_MAX_JOB_ARTIFACTS
  );
  const maxAttempts = positiveInteger(
    input.manifest.maxAttemptsPerArtifact,
    "max_attempts_per_artifact",
    REPLAY_ENGINE_MAX_ATTEMPTS_PER_ARTIFACT
  );
  const processedCount =
    input.processedCount === undefined
      ? input.state.processedCount
      : nonNegativeInteger(input.processedCount, "processed_count");
  const succeededCount =
    input.succeededCount === undefined
      ? input.state.succeededCount
      : nonNegativeInteger(input.succeededCount, "succeeded_count");
  const failedCount =
    input.failedCount === undefined
      ? input.state.failedCount
      : nonNegativeInteger(input.failedCount, "failed_count");
  const skippedCount =
    input.skippedCount === undefined
      ? input.state.skippedCount
      : nonNegativeInteger(input.skippedCount, "skipped_count");
  if (processedCount !== succeededCount + failedCount + skippedCount) {
    fail("invalid_event_counts", "Processed count must equal all terminal outcomes.");
  }
  if (
    processedCount < input.state.processedCount ||
    succeededCount < input.state.succeededCount ||
    failedCount < input.state.failedCount ||
    skippedCount < input.state.skippedCount
  ) {
    fail("non_monotonic_event_counts", "Job counters must be monotonic.");
  }
  if (processedCount > maxArtifacts) {
    fail("job_limit_exceeded", "Job event exceeds the immutable artifact limit.");
  }
  if (input.state.nextSequence === 0 && processedCount !== 0) {
    fail("queued_counts_nonzero", "The queued event must start with zero counters.");
  }
  if (
    input.eventType !== "artifact_completed" &&
    (processedCount !== input.state.processedCount ||
      succeededCount !== input.state.succeededCount ||
      failedCount !== input.state.failedCount ||
      skippedCount !== input.state.skippedCount)
  ) {
    fail(
      "non_artifact_counter_change",
      "Only artifact_completed may advance job counters."
    );
  }
  if (input.eventType === "completed" && processedCount !== maxArtifacts) {
    fail(
      "incomplete_job_completion",
      "A completed job must account for every immutable manifest artifact."
    );
  }

  const attemptNumber =
    input.attemptNumber === undefined
      ? 0
      : nonNegativeInteger(input.attemptNumber, "attempt_number");
  if (attemptNumber > maxAttempts) {
    fail("attempt_limit_exceeded", "Job event exceeds the per-artifact attempt limit.");
  }
  const artifactSha256 =
    input.artifactSha256 === undefined || input.artifactSha256 === null
      ? null
      : sha256Text(input.artifactSha256, "artifact_sha256");
  const parseRunIdentityHash =
    input.parseRunIdentityHash === undefined || input.parseRunIdentityHash === null
      ? null
      : sha256Text(input.parseRunIdentityHash, "parse_run_identity_hash");
  const manifestCursor = optionalText(input.manifestCursor, 500);
  if (input.eventType === "artifact_completed") {
    if (!artifactSha256) {
      fail("artifact_required", "artifact_completed requires an artifact identity.");
    }
    if (attemptNumber < 1) {
      fail("attempt_required", "artifact_completed requires an attempt number.");
    }
    if (!parseRunIdentityHash) {
      fail("parse_run_required", "artifact_completed requires a parse-run identity.");
    }
    if (!manifestCursor) {
      fail("manifest_cursor_required", "artifact_completed requires a manifest cursor.");
    }
    if (processedCount !== input.state.processedCount + 1) {
      fail(
        "invalid_artifact_completion_count",
        "artifact_completed must advance processedCount by exactly one."
      );
    }
  }
  const workerKey = optionalText(input.workerKey, 128);
  const checkpointCursor = optionalText(input.checkpointCursor, 500);
  if (input.eventType === "leased" && !workerKey) {
    fail("worker_required", "leased requires a worker key.");
  }
  if (input.eventType === "checkpointed" && !checkpointCursor) {
    fail("checkpoint_required", "checkpointed requires a cursor.");
  }
  const sequence = input.state.nextSequence;
  // Database event IDs intentionally follow the worker's retry keys, which use
  // a manifest cursor for artifact outcomes and sequence for control events.
  const eventIdentityHash =
    input.eventType === "artifact_completed"
      ? replayEngineSha256({
          job_id: jobId,
          event_type: input.eventType,
          manifest_cursor: manifestCursor,
        })
      : replayEngineSha256({
          job_id: jobId,
          sequence,
          event_type: input.eventType,
          worker_key: workerKey,
          checkpoint_cursor: checkpointCursor,
        });
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) {
    const supplied = sha256Text(input.idempotencyKey, "idempotency_key");
    if (supplied !== eventIdentityHash) {
      fail(
        "reprocess_event_idempotency_mismatch",
        "The event idempotency key must equal the canonical worker event hash."
      );
    }
  }

  return {
    jobId,
    jobIdentityHash,
    sequence,
    eventType: input.eventType,
    artifactSha256,
    parseRunIdentityHash,
    manifestCursor,
    workerKey,
    checkpointCursor,
    attemptNumber,
    processedCount,
    succeededCount,
    failedCount,
    skippedCount,
    idempotencyKey: eventIdentityHash,
  };
}

export function planReplayReprocessBatch(input: {
  manifest: Pick<ReplayReprocessJobManifest, "batchSize" | "maxArtifacts">;
  state: ReplayReprocessJobState;
  candidateArtifactIds: Array<number | string>;
}) {
  if (input.state.terminal) {
    fail("job_is_terminal", "A terminal reprocessing job cannot schedule a batch.");
  }
  const batchSize = positiveInteger(
    input.manifest.batchSize,
    "batch_size",
    REPLAY_ENGINE_MAX_BATCH_SIZE
  );
  const maxArtifacts = positiveInteger(
    input.manifest.maxArtifacts,
    "max_artifacts",
    REPLAY_ENGINE_MAX_JOB_ARTIFACTS
  );
  const remaining = Math.max(0, maxArtifacts - input.state.processedCount);
  const seen = new Set<string>();
  const candidates = input.candidateArtifactIds.filter((artifactId) => {
    const key = String(artifactId).trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const artifactIds = candidates.slice(0, Math.min(batchSize, remaining));

  return {
    artifactIds,
    checkpointCursor: input.state.checkpointCursor,
    nextSequence: input.state.nextSequence,
    remainingBeforeBatch: remaining,
    remainingAfterBatch: remaining - artifactIds.length,
    bounded: artifactIds.length <= batchSize && artifactIds.length <= remaining,
    exhausted: remaining === 0 || artifactIds.length === 0,
  };
}
