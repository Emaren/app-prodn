import { createHash } from "node:crypto";

export const WARGRAPH_ATTESTATION_SCHEMA =
  "aoe2war-wargraph-watcher-attestation/v1" as const;

const HEX_64 = /^[a-f0-9]{64}$/;
const FINALITY_STATUSES = new Set([
  "live",
  "live_pending_parse",
  "final_not_ready",
  "final_unparsed_proof",
  "final_recorded",
  "final_recorded_duplicate",
  "final_recorded_refreshed",
  "trusted_final",
  "trusted_final_duplicate",
  "trusted_final_refreshed",
  "reviewed_match_duplicate",
  "reviewed_match_refreshed",
]);
const INGESTION_PROVENANCE = new Set([
  "live_monitor",
  "historical_import",
]);

type JsonRecord = Record<string, unknown>;

export type WarGraphWatcherAttestation = {
  schema: typeof WARGRAPH_ATTESTATION_SCHEMA;
  attestationId: string;
  uploaderUid: string;
  gameStatsId: number;
  replayHash: string;
  replayFingerprint: string | null;
  liveGameFingerprint: string | null;
  platformMatchId: string | null;
  watcherIdentityHash: string;
  watcherSessionHash: string;
  rosterHash: string | null;
  rosterPlayerKeyHashes: readonly string[];
  uploaderPlayerKeyHash: string | null;
  participantBound: boolean;
  ingestionProvenance: string | null;
  provenanceSignatureVerified: boolean;
  liveProvenance: boolean;
  commencedAt: Date | null;
  isFinal: boolean;
  archiveVerified: boolean;
  fileRole: string | null;
  finalityStatus: string | null;
  resultTrusted: boolean;
  resultProvenance: string | null;
  winningPlayerKeyHashes: readonly string[];
  resultHash: string | null;
  evidenceHash: string;
  canonicalReceipt: JsonRecord;
};

export type WarGraphAttestationParseResult =
  | { ok: true; value: WarGraphWatcherAttestation }
  | { ok: false; reason: string };

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) return null;
  return normalized;
}

function optionalText(value: unknown, maximum: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value, maximum);
}

function hex(value: unknown, nullable = false): string | null {
  if (nullable && (value === null || value === undefined || value === "")) {
    return null;
  }
  const normalized = text(value, 64)?.toLowerCase() ?? null;
  return normalized && HEX_64.test(normalized) ? normalized : null;
}

function hexArray(value: unknown, maximum: number): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const values = value.map((entry) => hex(entry));
  if (values.some((entry) => entry === null)) return null;
  const normalized = values as string[];
  if (new Set(normalized).size !== normalized.length) return null;
  return [...normalized].sort();
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

function instant(value: unknown): Date | null {
  const supplied = optionalText(value, 64);
  if (!supplied) return null;
  // API/DB timestamps without an explicit offset are UTC in this estate.
  // Normalize them here so browser and worker locales never reinterpret them.
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(supplied)
    ? supplied
    : `${supplied}Z`;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const object = value as JsonRecord;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function fail(reason: string): WarGraphAttestationParseResult {
  return { ok: false, reason };
}

/**
 * Parse the privacy-bounded receipt emitted only after the replay API has
 * authenticated the Watcher key against its owning User. Unknown/raw fields
 * are deliberately discarded and never persisted.
 */
export function parseWarGraphWatcherAttestation(
  input: unknown,
): WarGraphAttestationParseResult {
  const source = record(input);
  if (!source) return fail("ATTESTATION_NOT_AN_OBJECT");
  if (source.schema !== WARGRAPH_ATTESTATION_SCHEMA) {
    return fail("ATTESTATION_SCHEMA_UNSUPPORTED");
  }
  if (source.transport_authenticated !== true) {
    return fail("ATTESTATION_TRANSPORT_UNAUTHENTICATED");
  }

  const attestationId = hex(source.attestation_id);
  const uploaderUid = text(source.uploader_uid, 100);
  const gameStatsId = positiveInteger(source.game_stats_id);
  const replayHash = hex(source.replay_hash);
  const liveGameFingerprint = hex(source.live_game_fingerprint, true);
  const watcherIdentityHash = hex(source.watcher_identity_hash);
  const watcherSessionHash = hex(source.watcher_session_hash);
  const rosterHash = hex(source.roster_hash, true);
  const rosterPlayerKeyHashes = hexArray(
    source.roster_player_key_hashes,
    2,
  );
  const uploaderPlayerKeyHash = hex(
    source.uploader_player_key_hash,
    true,
  );
  const participantBound = boolean(source.participant_bound);
  const ingestionProvenance = optionalText(
    source.ingestion_provenance,
    32,
  );
  const provenanceSignatureVerified =
    source.provenance_signature_verified == null
      ? false
      : boolean(source.provenance_signature_verified);
  const liveProvenance =
    source.live_provenance == null
      ? false
      : boolean(source.live_provenance);
  const isFinal = boolean(source.is_final);
  const archiveVerified = boolean(source.archive_verified);
  const resultTrusted = boolean(source.result_trusted);
  const resultHash = hex(source.result_hash, true);
  const resultProvenance = optionalText(source.result_provenance, 48);
  const winningPlayerKeyHashes = hexArray(
    source.winning_player_key_hashes,
    2,
  );

  if (!attestationId || !uploaderUid || uploaderUid === "system") {
    return fail("ATTESTATION_IDENTITY_INVALID");
  }
  if (!gameStatsId || !replayHash) {
    return fail("ATTESTATION_REPLAY_IDENTITY_INVALID");
  }
  if (!watcherIdentityHash || !watcherSessionHash) {
    return fail("ATTESTATION_WATCHER_IDENTITY_INVALID");
  }
  if (
    rosterPlayerKeyHashes === null ||
    winningPlayerKeyHashes === null ||
    participantBound === null ||
    provenanceSignatureVerified === null ||
    liveProvenance === null ||
    isFinal === null ||
    archiveVerified === null ||
    resultTrusted === null
  ) {
    return fail("ATTESTATION_CONTRACT_INVALID");
  }

  if (
    (ingestionProvenance &&
      !INGESTION_PROVENANCE.has(ingestionProvenance)) ||
    (liveProvenance &&
      (!provenanceSignatureVerified ||
        ingestionProvenance !== "live_monitor"))
  ) {
    return fail("ATTESTATION_PROVENANCE_INVALID");
  }

  const finalityStatus = optionalText(source.finality_status, 32);
  if (finalityStatus && !FINALITY_STATUSES.has(finalityStatus)) {
    return fail("ATTESTATION_FINALITY_INVALID");
  }

  if (
    participantBound &&
    (!rosterHash ||
      !uploaderPlayerKeyHash ||
      rosterPlayerKeyHashes.length !== 2 ||
      !rosterPlayerKeyHashes.includes(uploaderPlayerKeyHash))
  ) {
    return fail("ATTESTATION_PARTICIPANT_BINDING_INVALID");
  }

  if (
    resultTrusted &&
    (!isFinal ||
      !archiveVerified ||
      !resultHash ||
      !resultProvenance ||
      winningPlayerKeyHashes.length !== 1)
  ) {
    return fail("ATTESTATION_TRUST_CLAIM_INVALID");
  }

  const canonicalReceipt: JsonRecord = {
    schema: WARGRAPH_ATTESTATION_SCHEMA,
    attestation_id: attestationId,
    uploader_uid: uploaderUid,
    game_stats_id: gameStatsId,
    replay_hash: replayHash,
    replay_fingerprint: optionalText(source.replay_fingerprint, 120),
    live_game_fingerprint: liveGameFingerprint,
    platform_match_id: optionalText(source.platform_match_id, 120),
    watcher_identity_hash: watcherIdentityHash,
    watcher_session_hash: watcherSessionHash,
    roster_hash: rosterHash,
    roster_player_key_hashes: rosterPlayerKeyHashes,
    uploader_player_key_hash: uploaderPlayerKeyHash,
    participant_bound: participantBound,
    ingestion_provenance: ingestionProvenance,
    provenance_signature_verified: provenanceSignatureVerified,
    live_provenance: liveProvenance,
    commenced_at: instant(source.commenced_at)?.toISOString() ?? null,
    is_final: isFinal,
    archive_verified: archiveVerified,
    file_role: optionalText(source.file_role, 24),
    finality_status: finalityStatus,
    result_trusted: resultTrusted,
    result_provenance: resultProvenance,
    winning_player_key_hashes: winningPlayerKeyHashes,
    result_hash: resultHash,
  };
  const evidenceHash = createHash("sha256")
    .update(stableJson(canonicalReceipt))
    .digest("hex");

  return {
    ok: true,
    value: {
      schema: WARGRAPH_ATTESTATION_SCHEMA,
      attestationId,
      uploaderUid,
      gameStatsId,
      replayHash,
      replayFingerprint: canonicalReceipt.replay_fingerprint as string | null,
      liveGameFingerprint,
      platformMatchId: canonicalReceipt.platform_match_id as string | null,
      watcherIdentityHash,
      watcherSessionHash,
      rosterHash,
      rosterPlayerKeyHashes,
      uploaderPlayerKeyHash,
      participantBound,
      ingestionProvenance,
      provenanceSignatureVerified,
      liveProvenance,
      commencedAt: instant(source.commenced_at),
      isFinal,
      archiveVerified,
      fileRole: canonicalReceipt.file_role as string | null,
      finalityStatus,
      resultTrusted,
      resultProvenance: canonicalReceipt.result_provenance as string | null,
      winningPlayerKeyHashes,
      resultHash,
      evidenceHash,
      canonicalReceipt,
    },
  };
}

export function extractWarGraphWatcherAttestation(
  replayReceipt: unknown,
): WarGraphAttestationParseResult | null {
  const receipt = record(replayReceipt);
  if (!receipt || receipt.wargraph_attestation == null) return null;
  return parseWarGraphWatcherAttestation(receipt.wargraph_attestation);
}
