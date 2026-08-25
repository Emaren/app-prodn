import { createHash } from "node:crypto";

import { qualifyWarGraphGame } from "./eligibility.ts";
import { stableWarGraphJson } from "./foundationContract.ts";
import { isWarGraphLayer } from "./eligibility.ts";
import type {
  WarGraphBoundPairingTiming,
  WarGraphEligibilityReason,
  WarGraphLayer,
} from "./types.ts";

export const WARGRAPH_SETTLEMENT_JOB_TYPE = "settle_contest" as const;
export const WARGRAPH_SETTLEMENT_JOB_SCHEMA =
  "aoe2war-wargraph-settlement-job/v1" as const;

export const WARGRAPH_FINAL_CORRELATION_JOB_SCHEMA =
  "aoe2war-wargraph-correlation-job/v1" as const;
export const WARGRAPH_START_CORRELATION_JOB_SCHEMA =
  "aoe2war-wargraph-start-correlation-job/v1" as const;
const HEX_64 = /^[a-f0-9]{64}$/u;
const MAX_PLATFORM_MATCH_ID_LENGTH = 128;

type WarGraphCorrelationJobCommon = {
  sourceAttestationId: string;
  receiptHash: string;
  gameStatsId: number;
  replayHash: string;
  liveGameFingerprint: string;
  platformMatchId: string | null;
  rosterHash: string;
  rosterPlayerKeyHashes: readonly [string, string];
  commencedAt: string;
};

export type WarGraphCorrelationJobPayload =
  WarGraphCorrelationJobCommon & {
  schema: typeof WARGRAPH_FINAL_CORRELATION_JOB_SCHEMA;
  phase: "final";
  winnerPlayerKeyHash: string;
  resultHash: string;
};

export type WarGraphStartCorrelationJobPayload =
  WarGraphCorrelationJobCommon & {
    schema: typeof WARGRAPH_START_CORRELATION_JOB_SCHEMA;
    phase: "start";
  };

export type WarGraphAnyCorrelationJobPayload =
  | WarGraphCorrelationJobPayload
  | WarGraphStartCorrelationJobPayload;

export type WarGraphCorrelationAttestation = {
  id: bigint;
  sourceAttestationId: string;
  receiptHash: string;
  uploaderUserId: number;
  gameStatsId: number | null;
  ingestionProvenance: string | null;
  liveProvenance: boolean;
  provenanceSignatureVerified: boolean;
  replayHash: string;
  liveGameFingerprint: string | null;
  platformMatchId: string | null;
  watcherIdentityHash: string;
  watcherSessionHash: string;
  rosterHash: string | null;
  rosterPlayerKeyHashes: unknown;
  uploaderPlayerKeyHash: string | null;
  participantBound: boolean;
  commencedAt: Date | null;
  isFinal: boolean;
  archiveVerified: boolean;
  resultTrusted: boolean;
  winningPlayerKeyHashes: unknown;
  resultHash: string | null;
  claimedContestId: number | null;
};

export type WarGraphCorrelationMembership = {
  id: number;
  publicId: string;
  userId: number;
  playerKey: string;
  status: string;
  startNodeId: number | null;
  startLayer: number | null;
  startVersion: number | null;
  actionsUsed: number;
  hasConflictingEngagement: boolean;
};

export type WarGraphCorrelationPairing = {
  path: "ORGANIC" | "BOUND_PAIRING";
  id: number;
  advanceRequestId: number | null;
  aggressorMembershipId: number;
  defenderMembershipId: number;
  aggressorStartNodeId: number;
  defenderStartNodeId: number;
  aggressorStartLayer: number;
  defenderStartLayer: number;
  aggressorStartVersion: number;
  defenderStartVersion: number;
  nightId: number;
  rulesetId: number;
  acceptedAt: Date;
  launchDeadlineAt: Date;
  commencedAt: Date | null;
  advanceCreatedAt: Date | null;
  status: string;
};

export type WarGraphCorrelationContext = {
  graphId: number;
  nightId: number;
  rulesetId: number;
  gameStats: {
    id: number;
    replayHash: string;
    isFinal: boolean;
  } | null;
  latestDesyncOccurred: boolean | null;
  latestAcceptedAdjudication?: {
    sourceReplayHash: string;
    sourceRosterHash: string;
    winningPlayerKeys: unknown;
  } | null;
  attestations: readonly WarGraphCorrelationAttestation[];
  memberships: readonly WarGraphCorrelationMembership[];
  pairing: WarGraphCorrelationPairing | null;
};

export type WarGraphCorrelationEvidenceLink = {
  attestationId: bigint;
  membershipId: number;
  uploaderUserId: number;
  participantRole: "aggressor" | "defender";
  evidencePhase: "start" | "final";
  validationHash: string;
  idempotencyKey: string;
};

type WarGraphContestPlanBase = {
  graphId: number;
  nightId: number;
  rulesetId: number;
  pairingId: number | null;
  advanceRequestId: number | null;
  aggressorMembershipId: number;
  defenderMembershipId: number;
  aggressorStartNodeId: number;
  defenderStartNodeId: number;
  aggressorStartLayer: WarGraphLayer;
  defenderStartLayer: WarGraphLayer;
  aggressorStartVersion: number;
  defenderStartVersion: number;
  idempotencyKey: string;
  liveGameFingerprint: string;
  platformMatchId: string | null;
  gameStatsId: number;
  authoritativeOrderKey: string;
  commencedAt: Date;
  rosterHash: string;
  propositionHash: string;
};

export type WarGraphLiveContestPlan = WarGraphContestPlanBase & {
  evidencePhase: "start";
  winnerMembershipId: null;
  loserMembershipId: null;
  outcomeCode: null;
  resultHash: null;
  evidenceLinks: readonly [
    WarGraphCorrelationEvidenceLink,
    WarGraphCorrelationEvidenceLink,
  ];
};

export type WarGraphQualifiedContestPlan = WarGraphContestPlanBase & {
  evidencePhase: "final";
  winnerMembershipId: number;
  loserMembershipId: number;
  outcomeCode: "AGGRESSOR_WIN" | "DEFENDER_WIN";
  resultHash: string;
  evidenceLinks: readonly [
    WarGraphCorrelationEvidenceLink,
    WarGraphCorrelationEvidenceLink,
  ];
};

export type WarGraphCorrelationDecision =
  | {
      kind: "live";
      plan: WarGraphLiveContestPlan;
    }
  | {
      kind: "qualified";
      plan: WarGraphQualifiedContestPlan;
    }
  | {
      kind: "retry";
      code: WarGraphCorrelationRetryCode;
      detail: string;
    }
  | {
      kind: "dead";
      code: WarGraphCorrelationDeadCode;
      detail: string;
    };

export type WarGraphCorrelationRetryCode =
  | "WARGRAPH_SECOND_ATTESTATION_PENDING"
  | "WARGRAPH_GAME_STATS_PENDING"
  | "WARGRAPH_ACTIVE_MEMBERSHIP_PENDING"
  | "WARGRAPH_START_STATE_PENDING"
  | "WARGRAPH_NIGHT_PENDING";

export type WarGraphCorrelationDeadCode =
  | "WARGRAPH_JOB_PAYLOAD_INVALID"
  | "WARGRAPH_SOURCE_ATTESTATION_MISSING"
  | "WARGRAPH_EVIDENCE_CONFLICT"
  | "WARGRAPH_UPLOADERS_NOT_DISTINCT"
  | "WARGRAPH_WATCHER_PROOF_NOT_INDEPENDENT"
  | "WARGRAPH_MEMBERSHIP_IDENTITY_MISMATCH"
  | "WARGRAPH_REPLAY_TRUTH_MISMATCH"
  | "WARGRAPH_AUTHORITATIVE_DESYNC"
  | "WARGRAPH_PAIRING_CONFLICT"
  | WarGraphEligibilityReason;

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(stableWarGraphJson(value))
    .digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactHashArray(value: unknown, length: number): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    !value.every((item) => typeof item === "string" && HEX_64.test(item))
  ) {
    return null;
  }
  const hashes = [...value].sort();
  return new Set(hashes).size === length ? hashes : null;
}

function safePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function exactIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString() === value
  );
}

export function parseWarGraphCorrelationJobPayload(
  value: unknown,
): WarGraphAnyCorrelationJobPayload | null {
  const source = record(value);
  if (!source) return null;
  const roster = exactHashArray(source.rosterPlayerKeyHashes, 2);
  const platformMatchId =
    source.platformMatchId === null
      ? null
      : typeof source.platformMatchId === "string" &&
          source.platformMatchId.length >= 1 &&
          source.platformMatchId.length <= MAX_PLATFORM_MATCH_ID_LENGTH
        ? source.platformMatchId
        : undefined;
  if (
    typeof source.sourceAttestationId !== "string" ||
    !HEX_64.test(source.sourceAttestationId) ||
    typeof source.receiptHash !== "string" ||
    !HEX_64.test(source.receiptHash) ||
    !safePositiveInteger(source.gameStatsId) ||
    typeof source.replayHash !== "string" ||
    !HEX_64.test(source.replayHash) ||
    typeof source.liveGameFingerprint !== "string" ||
    !HEX_64.test(source.liveGameFingerprint) ||
    platformMatchId === undefined ||
    typeof source.rosterHash !== "string" ||
    !HEX_64.test(source.rosterHash) ||
    !roster ||
    !exactIsoTimestamp(source.commencedAt)
  ) {
    return null;
  }
  const common: WarGraphCorrelationJobCommon = {
    sourceAttestationId: source.sourceAttestationId,
    receiptHash: source.receiptHash,
    gameStatsId: source.gameStatsId,
    replayHash: source.replayHash,
    liveGameFingerprint: source.liveGameFingerprint,
    platformMatchId,
    rosterHash: source.rosterHash,
    rosterPlayerKeyHashes: [roster[0], roster[1]],
    commencedAt: source.commencedAt,
  };
  if (
    source.schema === WARGRAPH_START_CORRELATION_JOB_SCHEMA &&
    source.phase === "start"
  ) {
    return {
      ...common,
      schema: WARGRAPH_START_CORRELATION_JOB_SCHEMA,
      phase: "start",
    };
  }
  if (
    source.schema !== WARGRAPH_FINAL_CORRELATION_JOB_SCHEMA ||
    source.phase !== "final" ||
    typeof source.winnerPlayerKeyHash !== "string" ||
    !HEX_64.test(source.winnerPlayerKeyHash) ||
    !roster.includes(source.winnerPlayerKeyHash) ||
    typeof source.resultHash !== "string" ||
    !HEX_64.test(source.resultHash)
  ) {
    return null;
  }
  return {
    ...common,
    schema: WARGRAPH_FINAL_CORRELATION_JOB_SCHEMA,
    phase: "final",
    winnerPlayerKeyHash: source.winnerPlayerKeyHash,
    resultHash: source.resultHash,
  };
}

function dead(
  code: WarGraphCorrelationDeadCode,
  detail: string,
): WarGraphCorrelationDecision {
  return { kind: "dead", code, detail };
}

function retry(
  code: WarGraphCorrelationRetryCode,
  detail: string,
): WarGraphCorrelationDecision {
  return { kind: "retry", code, detail };
}

function sameInstant(left: Date | null, right: Date): boolean {
  return Boolean(
    left &&
      Number.isFinite(left.getTime()) &&
      left.getTime() === right.getTime(),
  );
}

function isExactAttestation(
  row: WarGraphCorrelationAttestation,
  payload: WarGraphAnyCorrelationJobPayload,
  commencedAt: Date,
): boolean {
  const roster = exactHashArray(row.rosterPlayerKeyHashes, 2);
  const common = Boolean(
    row.participantBound &&
      row.liveProvenance &&
      row.provenanceSignatureVerified &&
      row.ingestionProvenance === "live_monitor" &&
      row.liveGameFingerprint === payload.liveGameFingerprint &&
      row.platformMatchId === payload.platformMatchId &&
      row.rosterHash === payload.rosterHash &&
      roster &&
      roster[0] === payload.rosterPlayerKeyHashes[0] &&
      roster[1] === payload.rosterPlayerKeyHashes[1] &&
      row.uploaderPlayerKeyHash &&
      roster.includes(row.uploaderPlayerKeyHash) &&
      sameInstant(row.commencedAt, commencedAt)
  );
  if (payload.phase === "start") return common && !row.isFinal;
  if (!common) return false;
  const winners = exactHashArray(row.winningPlayerKeyHashes, 1);
  return Boolean(
    row.isFinal &&
      row.archiveVerified &&
      row.resultTrusted &&
      row.gameStatsId === payload.gameStatsId &&
      row.replayHash === payload.replayHash &&
      winners &&
      winners[0] === payload.winnerPlayerKeyHash &&
      row.resultHash === payload.resultHash,
  );
}

function chooseExactEvidence(
  rows: readonly WarGraphCorrelationAttestation[],
  payload: WarGraphAnyCorrelationJobPayload,
  commencedAt: Date,
):
  | readonly [
      WarGraphCorrelationAttestation,
      WarGraphCorrelationAttestation,
    ]
  | WarGraphCorrelationDecision {
  const source = rows.find(
    (row) => row.sourceAttestationId === payload.sourceAttestationId,
  );
  if (!source) {
    return dead(
      "WARGRAPH_SOURCE_ATTESTATION_MISSING",
      "The durable job no longer resolves to its immutable source receipt.",
    );
  }
  if (
    source.receiptHash !== payload.receiptHash ||
    source.gameStatsId !== payload.gameStatsId ||
    source.replayHash !== payload.replayHash ||
    !isExactAttestation(source, payload, commencedAt)
  ) {
    return dead(
      "WARGRAPH_EVIDENCE_CONFLICT",
      "The source receipt conflicts with the immutable correlation payload.",
    );
  }

  const exactRows = rows.filter((row) =>
    isExactAttestation(row, payload, commencedAt),
  );
  const uploaderIds = new Set(exactRows.map((row) => row.uploaderUserId));
  if (uploaderIds.size < 2) {
    return retry(
      "WARGRAPH_SECOND_ATTESTATION_PENDING",
      "A second independently authenticated participant receipt has not arrived.",
    );
  }
  if (uploaderIds.size !== 2) {
    return dead(
      "WARGRAPH_EVIDENCE_CONFLICT",
      "More than two authenticated participant identities claim the exact two-player game.",
    );
  }

  const other = exactRows.find(
    (row) => row.uploaderUserId !== source.uploaderUserId,
  );
  if (!other) {
    return dead(
      "WARGRAPH_UPLOADERS_NOT_DISTINCT",
      "Double-Watcher proof requires two distinct authenticated users.",
    );
  }
  if (
    source.uploaderPlayerKeyHash === other.uploaderPlayerKeyHash ||
    !source.uploaderPlayerKeyHash ||
    !other.uploaderPlayerKeyHash
  ) {
    return dead(
      "WARGRAPH_UPLOADERS_NOT_DISTINCT",
      "Each uploader must prove a different player in the exact roster.",
    );
  }
  if (
    source.watcherIdentityHash === other.watcherIdentityHash ||
    source.watcherSessionHash === other.watcherSessionHash
  ) {
    return dead(
      "WARGRAPH_WATCHER_PROOF_NOT_INDEPENDENT",
      "Double-Watcher proof cannot reuse a Watcher identity or session.",
    );
  }
  return [source, other];
}

function activeMembershipForUploader(
  memberships: readonly WarGraphCorrelationMembership[],
  uploaderUserId: number,
): WarGraphCorrelationMembership | null {
  const rows = memberships.filter(
    (row) => row.userId === uploaderUserId && row.status === "active",
  );
  return rows.length === 1 ? rows[0] : null;
}

function membershipPlayerKeyHash(
  membership: WarGraphCorrelationMembership,
): string {
  return sha256Text(membership.playerKey.trim().toLocaleLowerCase("en-US"));
}

function validStartState(
  membership: WarGraphCorrelationMembership,
): membership is WarGraphCorrelationMembership & {
  startNodeId: number;
  startLayer: WarGraphLayer;
  startVersion: number;
} {
  return Boolean(
    safePositiveInteger(membership.startNodeId) &&
      isWarGraphLayer(membership.startLayer) &&
      Number.isSafeInteger(membership.startVersion) &&
      Number(membership.startVersion) >= 0 &&
      Number.isSafeInteger(membership.actionsUsed) &&
      membership.actionsUsed >= 0,
  );
}

function exactPairing(
  pairing: WarGraphCorrelationPairing | null,
  membershipIds: ReadonlySet<number>,
  commencedAt: Date,
): pairing is WarGraphCorrelationPairing {
  if (!pairing) return false;
  const pairingIds = new Set([
    pairing.aggressorMembershipId,
    pairing.defenderMembershipId,
  ]);
  const common = Boolean(
    membershipIds.size === 2 &&
      pairingIds.size === 2 &&
      [...membershipIds].every((id) => pairingIds.has(id)) &&
      (pairing.status === "accepted" ||
        pairing.status === "engaged" ||
        pairing.status === "live" ||
        pairing.status === "settled" ||
        pairing.status === "voided") &&
      (!pairing.commencedAt || sameInstant(pairing.commencedAt, commencedAt)) &&
      pairing.acceptedAt <= commencedAt
  );
  if (!common) return false;
  return pairing.path === "BOUND_PAIRING"
    ? commencedAt <= pairing.launchDeadlineAt &&
        pairing.advanceCreatedAt !== null
    : sameInstant(pairing.commencedAt, commencedAt);
}

function pairingTiming(
  pairing: WarGraphCorrelationPairing,
): WarGraphBoundPairingTiming {
  return {
    advanceCreatedAt: pairing.advanceCreatedAt as Date,
    acceptedAt: pairing.acceptedAt,
  };
}

/**
 * Builds a fail-closed, persistence-ready plan. It never mutates the graph and
 * deliberately does not infer missing evidence or current board state.
 */
export function correlateWarGraphAttestations(
  payloadValue: unknown,
  context: WarGraphCorrelationContext,
): WarGraphCorrelationDecision {
  const payload = parseWarGraphCorrelationJobPayload(payloadValue);
  if (!payload) {
    return dead(
      "WARGRAPH_JOB_PAYLOAD_INVALID",
      "The correlation job payload is malformed or incomplete.",
    );
  }
  const commencedAt = new Date(payload.commencedAt);
  if (!safePositiveInteger(context.nightId) || !safePositiveInteger(context.rulesetId)) {
    return retry(
      "WARGRAPH_NIGHT_PENDING",
      "The authoritative Edmonton night and frozen ruleset are unavailable.",
    );
  }
  if (!context.gameStats) {
    return retry(
      "WARGRAPH_GAME_STATS_PENDING",
      "The source GameStats row is not yet available.",
    );
  }
  if (
    context.gameStats.id !== payload.gameStatsId ||
    context.gameStats.replayHash !== payload.replayHash
  ) {
    return dead(
      "WARGRAPH_REPLAY_TRUTH_MISMATCH",
      "The canonical final replay does not match the independently attested replay.",
    );
  }
  if (payload.phase === "final" && !context.gameStats.isFinal) {
    return retry(
      "WARGRAPH_GAME_STATS_PENDING",
      "The canonical final GameStats row is not yet available.",
    );
  }
  if (context.latestDesyncOccurred === true) {
    return dead(
      "WARGRAPH_AUTHORITATIVE_DESYNC",
      "The latest authoritative human desync decision blocks competitive movement.",
    );
  }
  if (payload.phase === "final" && context.latestAcceptedAdjudication) {
    const adjudicatedWinnerKeys = Array.isArray(
      context.latestAcceptedAdjudication.winningPlayerKeys,
    )
      ? context.latestAcceptedAdjudication.winningPlayerKeys.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
      : [];
    const adjudicatedWinnerHashes = adjudicatedWinnerKeys
      .map((value) =>
        sha256Text(value.trim().toLocaleLowerCase("en-US")),
      )
      .sort();
    if (
      context.latestAcceptedAdjudication.sourceReplayHash !==
        payload.replayHash ||
      context.latestAcceptedAdjudication.sourceRosterHash !==
        payload.rosterHash ||
      adjudicatedWinnerHashes.length !== 1 ||
      adjudicatedWinnerHashes[0] !== payload.winnerPlayerKeyHash
    ) {
      return dead(
        "WARGRAPH_REPLAY_TRUTH_MISMATCH",
        "The latest accepted human result adjudication conflicts with Watcher proof.",
      );
    }
  }

  const evidence = chooseExactEvidence(
    context.attestations,
    payload,
    commencedAt,
  );
  if ("kind" in evidence) return evidence;

  const left = activeMembershipForUploader(
    context.memberships,
    evidence[0].uploaderUserId,
  );
  const right = activeMembershipForUploader(
    context.memberships,
    evidence[1].uploaderUserId,
  );
  if (!left || !right) {
    return retry(
      "WARGRAPH_ACTIVE_MEMBERSHIP_PENDING",
      "Both authenticated uploaders require exactly one active graph membership.",
    );
  }
  if (left.id === right.id || left.userId === right.userId) {
    return dead(
      "WARGRAPH_UPLOADERS_NOT_DISTINCT",
      "Both receipts resolve to the same authenticated graph member.",
    );
  }
  if (
    membershipPlayerKeyHash(left) !== evidence[0].uploaderPlayerKeyHash ||
    membershipPlayerKeyHash(right) !== evidence[1].uploaderPlayerKeyHash
  ) {
    return dead(
      "WARGRAPH_MEMBERSHIP_IDENTITY_MISMATCH",
      "An uploader's authenticated membership does not match the claimed roster identity.",
    );
  }
  if (!validStartState(left) || !validStartState(right)) {
    return retry(
      "WARGRAPH_START_STATE_PENDING",
      "Immutable movement history cannot reconstruct both seats at commencement.",
    );
  }

  const membershipIds = new Set([left.id, right.id]);
  const hasPairing = exactPairing(
    context.pairing,
    membershipIds,
    commencedAt,
  );
  if (
    context.pairing &&
    !hasPairing &&
    context.pairing.commencedAt &&
    !sameInstant(context.pairing.commencedAt, commencedAt)
  ) {
    return dead(
      "WARGRAPH_PAIRING_CONFLICT",
      "A bound pairing carries a different authoritative commencement.",
    );
  }

  const pairing = hasPairing ? context.pairing : null;
  const participant = (
    membership: typeof left,
    role: "left" | "right",
  ) => ({
    playerId: membership.publicId,
    layer: pairing
      ? role === "left" && membership.id === pairing.aggressorMembershipId
        ? (pairing.aggressorStartLayer as WarGraphLayer)
        : role === "right" && membership.id === pairing.aggressorMembershipId
          ? (pairing.aggressorStartLayer as WarGraphLayer)
          : (pairing.defenderStartLayer as WarGraphLayer)
      : membership.startLayer,
    actionsUsed: membership.actionsUsed,
    hasConflictingEngagement: membership.hasConflictingEngagement,
  });
  if (
    pairing &&
    (!isWarGraphLayer(pairing.aggressorStartLayer) ||
      !isWarGraphLayer(pairing.defenderStartLayer))
  ) {
    return dead(
      "INELIGIBLE_GRAPH_STATE_AT_START",
      "The bound pairing has invalid frozen layer geometry.",
    );
  }

  const eligibility = qualifyWarGraphGame({
    commencedAt,
    provenance: "LIVE",
    path: pairing?.path ?? "ORGANIC",
    graphStateAtStartValid: true,
    left: participant(left, "left"),
    right: participant(right, "right"),
    watcherProof: {
      leftWatcherLive: true,
      rightWatcherLive: true,
      sameGame: true,
    },
    ...(pairing?.path === "BOUND_PAIRING"
      ? { pairingTiming: pairingTiming(pairing) }
      : {}),
  });
  if (!eligibility.eligible) {
    return dead(eligibility.reason, "The verified game is not movement-eligible.");
  }

  const aggressor =
    eligibility.aggressor.playerId === left.publicId ? left : right;
  const defender = aggressor.id === left.id ? right : left;
  const aggressorEvidence =
    evidence[0].uploaderUserId === aggressor.userId ? evidence[0] : evidence[1];
  const defenderEvidence =
    evidence[0].uploaderUserId === defender.userId ? evidence[0] : evidence[1];
  const liveGameFingerprint = payload.liveGameFingerprint;
  const contestKey = `wargraph-contest:${liveGameFingerprint}`;
  const aggressorStartNodeId = pairing
    ? pairing.aggressorStartNodeId
    : aggressor.startNodeId;
  const defenderStartNodeId = pairing
    ? pairing.defenderStartNodeId
    : defender.startNodeId;
  const aggressorStartLayer = pairing
    ? (pairing.aggressorStartLayer as WarGraphLayer)
    : aggressor.startLayer;
  const defenderStartLayer = pairing
    ? (pairing.defenderStartLayer as WarGraphLayer)
    : defender.startLayer;
  const aggressorStartVersion = pairing
    ? pairing.aggressorStartVersion
    : aggressor.startVersion;
  const defenderStartVersion = pairing
    ? pairing.defenderStartVersion
    : defender.startVersion;
  const propositionHash = sha256({
    schema: "aoe2war-wargraph-proposition/v1",
    graphId: context.graphId,
    nightId: pairing ? pairing.nightId : context.nightId,
    rulesetId: pairing ? pairing.rulesetId : context.rulesetId,
    aggressorMembershipId: aggressor.id,
    defenderMembershipId: defender.id,
    aggressorStartNodeId,
    defenderStartNodeId,
    aggressorStartLayer,
    defenderStartLayer,
    commencedAt: payload.commencedAt,
    rosterHash: payload.rosterHash,
  });
  const link = (
    row: WarGraphCorrelationAttestation,
    membership: typeof left,
    participantRole: "aggressor" | "defender",
  ): WarGraphCorrelationEvidenceLink => ({
    attestationId: row.id,
    membershipId: membership.id,
    uploaderUserId: row.uploaderUserId,
    participantRole,
    evidencePhase: payload.phase,
    validationHash: sha256({
      schema: "aoe2war-wargraph-contest-evidence-link/v1",
      contestKey,
      attestationId: row.id.toString(),
      receiptHash: row.receiptHash,
      membershipId: membership.id,
      uploaderUserId: row.uploaderUserId,
      participantRole,
      evidencePhase: payload.phase,
    }),
    idempotencyKey: `wargraph-claim:${payload.phase}:${row.receiptHash}`,
  });

  const commonPlan = {
    graphId: context.graphId,
    nightId: pairing ? pairing.nightId : context.nightId,
    rulesetId: pairing ? pairing.rulesetId : context.rulesetId,
    pairingId: pairing?.id ?? null,
    advanceRequestId: pairing?.advanceRequestId ?? null,
    aggressorMembershipId: aggressor.id,
    defenderMembershipId: defender.id,
    aggressorStartNodeId,
    defenderStartNodeId,
    aggressorStartLayer,
    defenderStartLayer,
    aggressorStartVersion,
    defenderStartVersion,
    idempotencyKey: contestKey,
    liveGameFingerprint,
    platformMatchId: payload.platformMatchId,
    gameStatsId: payload.gameStatsId,
    authoritativeOrderKey: `${payload.commencedAt}:${liveGameFingerprint}`,
    commencedAt,
    rosterHash: payload.rosterHash,
    propositionHash,
  } as const;

  if (payload.phase === "start") {
    return {
      kind: "live",
      plan: {
        ...commonPlan,
        evidencePhase: "start",
        winnerMembershipId: null,
        loserMembershipId: null,
        outcomeCode: null,
        resultHash: null,
        evidenceLinks: [
          link(aggressorEvidence, aggressor, "aggressor"),
          link(defenderEvidence, defender, "defender"),
        ],
      },
    };
  }

  const winnerEvidence = evidence.find(
    (row) => row.uploaderPlayerKeyHash === payload.winnerPlayerKeyHash,
  );
  if (!winnerEvidence) {
    return dead(
      "WARGRAPH_EVIDENCE_CONFLICT",
      "The mutually attested winner does not resolve to either authenticated member.",
    );
  }
  const winnerMembershipId =
    winnerEvidence.uploaderUserId === left.userId ? left.id : right.id;
  const loserMembershipId =
    winnerMembershipId === left.id ? right.id : left.id;

  return {
    kind: "qualified",
    plan: {
      ...commonPlan,
      evidencePhase: "final",
      winnerMembershipId,
      loserMembershipId,
      outcomeCode:
        winnerMembershipId === aggressor.id
          ? "AGGRESSOR_WIN"
          : "DEFENDER_WIN",
      resultHash: payload.resultHash,
      evidenceLinks: [
        link(aggressorEvidence, aggressor, "aggressor"),
        link(defenderEvidence, defender, "defender"),
      ],
    },
  };
}

export function buildWarGraphSettlementJob(
  contestId: number,
  plan: WarGraphQualifiedContestPlan,
) {
  if (!safePositiveInteger(contestId)) {
    throw new Error("WARGRAPH_CONTEST_ID_INVALID");
  }
  return {
    graphId: plan.graphId,
    jobType: WARGRAPH_SETTLEMENT_JOB_TYPE,
    dedupeKey: `wargraph-settle:${plan.liveGameFingerprint}`,
    payload: {
      schema: WARGRAPH_SETTLEMENT_JOB_SCHEMA,
      contestId,
      liveGameFingerprint: plan.liveGameFingerprint,
      authoritativeOrderKey: plan.authoritativeOrderKey,
      commencedAt: plan.commencedAt.toISOString(),
    },
  } as const;
}
