import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "./generated/prisma/index.js";
import {
  buildRosterHash,
  normalizeReplayPlayer,
  normalizeReplayPlayers,
  type CanonicalReplayPlayer,
} from "./teamResolution.ts";
import { loadReplayDesyncIncidentProvenance } from "./replayDesyncIncidents.ts";

export const REPLAY_RESULT_ACCEPTED = "accepted" as const;
export const REPLAY_RESULT_PENDING_ADMIN = "pending_admin_approval" as const;

export type ReplayResultDecisionStatus =
  | typeof REPLAY_RESULT_ACCEPTED
  | typeof REPLAY_RESULT_PENDING_ADMIN;

export type ReplayResultReviewerRole = "site_admin" | "verified_submitter";

export type ReplayResultReviewAccess = {
  allowed: boolean;
  role: ReplayResultReviewerRole | null;
  isAdmin: boolean;
  hasReviewerCapability: boolean;
  hasVerifiedSubmission: boolean;
};

export type ReplayResultTeamInput = {
  teamKey?: unknown;
  playerKeys?: unknown;
  players?: unknown;
};

export type ReplayResultAdjudicationInput = {
  idempotencyKey?: unknown;
  sourceReplayHash?: unknown;
  sourceParseIteration?: unknown;
  sourceRosterHash?: unknown;
  teams?: unknown;
  teamAssignments?: unknown;
  winningTeamKey?: unknown;
  reason?: unknown;
  evidence?: unknown;
  supersedesId?: unknown;
};

export type CanonicalReplayResultTeam = {
  teamKey: string;
  players: Array<{
    stablePlayerKey: string;
    name: string;
    normalizedName: string;
    steamId: string | null;
    sourceTeamId: string | null;
    playerNumber: number | null;
  }>;
};

export type ValidatedReplayResultInput = {
  idempotencyKey: string;
  sourceReplayHash: string;
  sourceParseIteration: number;
  sourceRosterHash: string;
  sourcePropositionHash: string;
  teams: CanonicalReplayResultTeam[];
  winningTeamKey: string;
  winningPlayerKeys: string[];
  reason: string;
  evidence: Prisma.InputJsonValue | null;
  supersedesId: number | null;
  inputHash: string;
};

type ReviewableGame = {
  id: number;
  userUid: string | null;
  replay_file: string;
  replayHash: string;
  createdAt: Date;
  game_version: string | null;
  map: Prisma.JsonValue | null;
  game_type: string | null;
  duration: number | null;
  game_duration: number | null;
  winner: string | null;
  players: Prisma.JsonValue | null;
  event_types: Prisma.JsonValue | null;
  key_events: Prisma.JsonValue | null;
  timestamp: Date | null;
  played_on: Date | null;
  parse_iteration: number;
  is_final: boolean;
  disconnect_detected: boolean;
  parse_source: string;
  parse_reason: string;
  original_filename: string | null;
};

export type EffectiveReplayResultAdjudication = {
  id: number;
  idempotencyKey?: string;
  decisionStatus: string;
  affectsStats: boolean;
  affectsBets: boolean;
  actorDisplayNameSnapshot: string;
  actorRole: string;
  teamAssignments: Prisma.JsonValue;
  winningTeamKey: string;
  winningPlayerKeys: Prisma.JsonValue;
  reason: string;
  evidence?: Prisma.JsonValue | null;
  sourceReplayHash: string;
  sourceParseIteration: number;
  sourceRosterHash: string;
  sourcePropositionHash: string;
  createdAt: Date | string;
};

export function replayResultAdjudicationAuthorizesBets(
  adjudication:
    | Pick<
        EffectiveReplayResultAdjudication,
        "decisionStatus" | "affectsBets"
      > & {
        idempotencyKey?: string | null;
      }
    | null
    | undefined
) {
  if (
    !adjudication ||
    adjudication.decisionStatus !==
      REPLAY_RESULT_ACCEPTED
  ) {
    return false;
  }

  return (
    adjudication.affectsBets === true &&
    adjudication.idempotencyKey?.startsWith(
      "financial-authority:"
    ) === true
  );
}

type MarketSnapshotPrisma = Pick<PrismaClient, "betMarket" | "pendingWoloClaim">;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_EVIDENCE_BYTES = 32 * 1024;

export class ReplayResultReviewError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ReplayResultReviewError";
    this.status = status;
    this.code = code;
  }
}

function fail(status: number, code: string, message: string): never {
  throw new ReplayResultReviewError(status, code, message);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJson(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function cleanTeamKey(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return String(Math.trunc(value));
  }
  return cleanText(value, 128);
}

function positiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function nonNegativeInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function stableJsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
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
  return null;
}

function jsonClone(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(stableJsonValue(value))) as Prisma.InputJsonValue;
}

function sha256(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableJsonValue(value)))
    .digest("hex");
}

function canonicalPlayers(value: unknown) {
  return normalizeReplayPlayers(parseJson(value));
}

function canonicalPlayerKeys(players: CanonicalReplayPlayer[]) {
  return players.map((player) => player.stablePlayerKey).sort();
}

function inputPlayerKeys(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string") return entry.trim();
    const source = record(entry);
    return cleanText(source?.stablePlayerKey, 160);
  });
}

function normalizeEvidence(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") {
    fail(400, "invalid_evidence", "Evidence must be a JSON object or array.");
  }
  const normalized = stableJsonValue(value);
  const encoded = JSON.stringify(normalized);
  if (Buffer.byteLength(encoded, "utf8") > MAX_EVIDENCE_BYTES) {
    fail(413, "evidence_too_large", "Evidence must be 32 KB or smaller.");
  }
  return JSON.parse(encoded) as Prisma.InputJsonValue;
}

export function decideReplayResultReviewAccess(input: {
  isAdmin: boolean;
  canReviewOwnReplayResults: boolean;
  hasVerifiedSubmission: boolean;
}): ReplayResultReviewAccess {
  if (input.isAdmin) {
    return {
      allowed: true,
      role: "site_admin",
      isAdmin: true,
      hasReviewerCapability: input.canReviewOwnReplayResults,
      hasVerifiedSubmission: input.hasVerifiedSubmission,
    };
  }

  const allowed = input.canReviewOwnReplayResults && input.hasVerifiedSubmission;
  return {
    allowed,
    role: allowed ? "verified_submitter" : null,
    isAdmin: false,
    hasReviewerCapability: input.canReviewOwnReplayResults,
    hasVerifiedSubmission: input.hasVerifiedSubmission,
  };
}

export function replayResultDecisionStatus(
  role: ReplayResultReviewerRole,
  hasLinkedMarket: boolean
): ReplayResultDecisionStatus {
  return role === "verified_submitter" && hasLinkedMarket
    ? REPLAY_RESULT_PENDING_ADMIN
    : REPLAY_RESULT_ACCEPTED;
}

export function validateReplayResultAdjudication(input: {
  payload: ReplayResultAdjudicationInput;
  replayHash: string;
  parseIteration: number;
  players: unknown;
}): ValidatedReplayResultInput {
  const idempotencyKey = cleanText(input.payload.idempotencyKey, 128);
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    fail(
      400,
      "invalid_idempotency_key",
      "Provide an idempotency key between 8 and 128 safe characters."
    );
  }

  const sourceReplayHash = cleanText(input.payload.sourceReplayHash, 64).toLowerCase();
  if (!SHA256_PATTERN.test(sourceReplayHash) || sourceReplayHash !== input.replayHash.toLowerCase()) {
    fail(409, "stale_replay_hash", "The replay changed. Reload before submitting a verdict.");
  }

  const sourceParseIteration = nonNegativeInteger(input.payload.sourceParseIteration);
  if (sourceParseIteration === null || sourceParseIteration !== input.parseIteration) {
    fail(409, "stale_parse_iteration", "A newer parser pass exists. Reload before submitting.");
  }

  const players = canonicalPlayers(input.players);
  if (players.length < 2) {
    fail(422, "roster_incomplete", "At least two canonical replay players are required.");
  }
  const playerKeys = canonicalPlayerKeys(players);
  if (new Set(playerKeys).size !== playerKeys.length) {
    fail(422, "ambiguous_roster", "The canonical roster contains duplicate player identities.");
  }

  const computedRosterHash = buildRosterHash(players);
  const sourceRosterHash = cleanText(input.payload.sourceRosterHash, 64).toLowerCase();
  if (
    !computedRosterHash ||
    !SHA256_PATTERN.test(sourceRosterHash) ||
    sourceRosterHash !== computedRosterHash
  ) {
    fail(409, "stale_roster", "The canonical roster changed. Reload before submitting.");
  }

  const rawTeams = Array.isArray(input.payload.teams)
    ? input.payload.teams
    : Array.isArray(input.payload.teamAssignments)
      ? input.payload.teamAssignments
      : [];
  if (rawTeams.length !== 2) {
    fail(422, "expected_two_teams", "Assign the complete roster to exactly two teams.");
  }

  const playersByKey = new Map(players.map((player) => [player.stablePlayerKey, player]));
  const seenTeamKeys = new Set<string>();
  const assignedKeys: string[] = [];
  const teams = rawTeams.map((entry, teamIndex): CanonicalReplayResultTeam => {
    const source = record(entry) as ReplayResultTeamInput | null;
    const teamKey = cleanTeamKey(source?.teamKey);
    if (!teamKey) {
      fail(422, "team_key_missing", `Team ${teamIndex + 1} needs a stable team key.`);
    }
    if (seenTeamKeys.has(teamKey)) {
      fail(422, "duplicate_team_key", "Each team key must be unique.");
    }
    seenTeamKeys.add(teamKey);

    const keys = inputPlayerKeys(source?.playerKeys ?? source?.players);
    if (keys.length === 0) {
      fail(422, "empty_team", `Team ${teamKey} must contain at least one player.`);
    }
    if (new Set(keys).size !== keys.length) {
      fail(422, "duplicate_team_member", `Team ${teamKey} contains a player more than once.`);
    }

    const teamPlayers = keys.map((stablePlayerKey) => {
      const player = playersByKey.get(stablePlayerKey);
      if (!player) {
        fail(422, "noncanonical_player", "Every selected player must come from the canonical roster.");
      }
      assignedKeys.push(stablePlayerKey);
      return {
        stablePlayerKey,
        name: player.name,
        normalizedName: player.normalizedName,
        steamId: player.steamId,
        sourceTeamId: player.teamId,
        playerNumber: player.playerNumber,
      };
    });

    return {
      teamKey,
      players: teamPlayers.sort((left, right) =>
        left.stablePlayerKey.localeCompare(right.stablePlayerKey)
      ),
    };
  });

  const sortedAssignedKeys = [...assignedKeys].sort();
  if (
    sortedAssignedKeys.length !== playerKeys.length ||
    sortedAssignedKeys.some((key, index) => key !== playerKeys[index])
  ) {
    fail(
      422,
      "roster_assignment_mismatch",
      "Every canonical player must be assigned exactly once, with no additions or omissions."
    );
  }

  const winningTeamKey = cleanTeamKey(input.payload.winningTeamKey);
  const winningTeam = teams.find((team) => team.teamKey === winningTeamKey);
  if (!winningTeam) {
    fail(422, "winning_team_missing", "Select one complete team as the winner.");
  }
  const winningPlayerKeys = winningTeam.players.map((player) => player.stablePlayerKey).sort();

  const reason = cleanText(input.payload.reason, 2_000);
  if (reason.length < 8) {
    fail(422, "reason_required", "Add a short reason for this result correction.");
  }
  const evidence = normalizeEvidence(input.payload.evidence);
  const supersedesId = input.payload.supersedesId == null
    ? null
    : positiveInteger(input.payload.supersedesId);
  if (input.payload.supersedesId != null && supersedesId === null) {
    fail(400, "invalid_supersedes_id", "Supersedes id must be a positive integer.");
  }

  const canonicalTeams = [...teams].sort((left, right) => left.teamKey.localeCompare(right.teamKey));
  const sourcePropositionHash = sha256({
    rosterHash: sourceRosterHash,
    teams: canonicalTeams.map((team) => ({
      teamKey: team.teamKey,
      playerKeys: team.players.map((player) => player.stablePlayerKey),
    })),
  });
  const inputHash = sha256({
    sourceReplayHash,
    sourceParseIteration,
    sourceRosterHash,
    sourcePropositionHash,
    teams: canonicalTeams,
    winningTeamKey,
    winningPlayerKeys,
    reason,
    evidence,
    supersedesId,
  });

  return {
    idempotencyKey,
    sourceReplayHash,
    sourceParseIteration,
    sourceRosterHash,
    sourcePropositionHash,
    teams: canonicalTeams,
    winningTeamKey,
    winningPlayerKeys,
    reason,
    evidence,
    supersedesId,
    inputHash,
  };
}

function rawPlayers(value: unknown) {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
      )
    : [];
}

function jsonRecord(value: unknown) {
  return record(parseJson(value)) ?? {};
}

function adjudicationTeams(value: unknown) {
  if (!Array.isArray(value)) return [] as CanonicalReplayResultTeam[];
  return value
    .map((entry) => {
      const source = record(entry);
      const teamKey = cleanTeamKey(source?.teamKey);
      const players = Array.isArray(source?.players)
        ? source.players
            .map((playerEntry) => {
              const player = record(playerEntry);
              const stablePlayerKey = cleanText(player?.stablePlayerKey, 160);
              const name = cleanText(player?.name, 100);
              return stablePlayerKey && name
                ? {
                    stablePlayerKey,
                    name,
                    normalizedName: cleanText(player?.normalizedName, 100),
                    steamId: cleanText(player?.steamId, 32) || null,
                    sourceTeamId: cleanText(player?.sourceTeamId, 128) || null,
                    playerNumber: nonNegativeInteger(player?.playerNumber),
                  }
                : null;
            })
            .filter((player): player is CanonicalReplayResultTeam["players"][number] => Boolean(player))
        : [];
      return teamKey && players.length > 0 ? { teamKey, players } : null;
    })
    .filter((team): team is CanonicalReplayResultTeam => Boolean(team));
}

export function applyReplayResultAdjudication<T extends object>(
  row: T,
  adjudication: EffectiveReplayResultAdjudication | null | undefined
): T {
  if (!adjudication || adjudication.decisionStatus !== REPLAY_RESULT_ACCEPTED) return row;

  const source = row as Record<string, unknown>;
  const currentReplayHash = cleanText(source.replayHash ?? source.replay_hash, 64).toLowerCase();
  if (
    currentReplayHash &&
    currentReplayHash !== adjudication.sourceReplayHash.toLowerCase()
  ) {
    return row;
  }
  const teams = adjudicationTeams(adjudication.teamAssignments);
  const teamByPlayerKey = new Map<string, string>();
  const nameByPlayerKey = new Map<string, string>();
  for (const team of teams) {
    for (const player of team.players) {
      teamByPlayerKey.set(player.stablePlayerKey, team.teamKey);
      nameByPlayerKey.set(player.stablePlayerKey, player.name);
    }
  }
  const winningPlayerKeys = new Set(
    Array.isArray(adjudication.winningPlayerKeys)
      ? adjudication.winningPlayerKeys.map((key) => String(key))
      : []
  );
  if (winningPlayerKeys.size === 0 || teamByPlayerKey.size === 0) return row;

  const players = rawPlayers(source.players);
  const canonicalCurrentPlayers = players.map((player) => normalizeReplayPlayer(player));
  if (
    canonicalCurrentPlayers.some((player) => player === null) ||
    canonicalCurrentPlayers.some(
      (player) => player && !teamByPlayerKey.has(player.stablePlayerKey)
    )
  ) {
    return row;
  }
  const currentRosterHash = buildRosterHash(
    canonicalCurrentPlayers.filter((player): player is CanonicalReplayPlayer => Boolean(player))
  );
  if (
    currentRosterHash &&
    currentRosterHash !== adjudication.sourceRosterHash.toLowerCase()
  ) {
    return row;
  }
  if (
    [...winningPlayerKeys].some((playerKey) => !teamByPlayerKey.has(playerKey))
  ) {
    return row;
  }
  const projectedPlayers = players.map((player) => {
    const canonical = normalizeReplayPlayer(player);
    if (!canonical || !teamByPlayerKey.has(canonical.stablePlayerKey)) return player;
    const teamKey = teamByPlayerKey.get(canonical.stablePlayerKey) as string;
    return {
      ...player,
      team_id: teamKey,
      teamId: teamKey,
      winner: winningPlayerKeys.has(canonical.stablePlayerKey),
    };
  });
  const winningNames = [...winningPlayerKeys]
    .map((key) => nameByPlayerKey.get(key))
    .filter((name): name is string => Boolean(name));
  if (winningNames.length === 0) return row;

  const originalWinner = source.winner ?? null;
  const originalParseReason = source.parse_reason ?? source.parseReason ?? null;
  const originalParseSource = source.parse_source ?? source.parseSource ?? null;
  const manualEvidence = {
    adjudication_id: adjudication.id,
    idempotency_key: adjudication.idempotencyKey,
    winning_team_key: adjudication.winningTeamKey,
    winning_player_keys: [...winningPlayerKeys],
    adjudicated_by: adjudication.actorDisplayNameSnapshot,
    actor_role: adjudication.actorRole,

    /*
     * Preserve the authority contract inside the projected evidence.
     *
     * Public statistics truth may trust only an accepted verdict that
     * explicitly affects statistics. Betting authority remains explicit
     * and independently false for statistics-only adjudications.
     */
    decision_status: adjudication.decisionStatus,
    affects_stats: adjudication.affectsStats,
    affects_bets: adjudication.affectsBets,

    reason: adjudication.reason,
    source_replay_hash: adjudication.sourceReplayHash,
    source_parse_iteration: adjudication.sourceParseIteration,
    source_roster_hash: adjudication.sourceRosterHash,
    source_proposition_hash: adjudication.sourcePropositionHash,
    created_at:
      adjudication.createdAt instanceof Date
        ? adjudication.createdAt.toISOString()
        : adjudication.createdAt,
    original_winner: originalWinner,
    original_parse_reason: originalParseReason,
    original_parse_source: originalParseSource,
  };
  const keyEvents = jsonRecord(source.key_events ?? source.keyEvents);
  const automaticEvidence =
    adjudication.idempotencyKey?.startsWith("evidence:auto:") === true;
  const projectedParseReason = automaticEvidence
    ? "automatic_result_evidence"
    : "manual_result_adjudication";
  const projectedParseSource = automaticEvidence
    ? "replay_result_evidence"
    : "replay_result_review";

  return {
    ...source,
    winner: winningNames[0],
    winnerPlayers: winningNames,
    winningPlayerKeys: [...winningPlayerKeys],
    winningTeamKey: adjudication.winningTeamKey,
    winnerProof: "replay_result_adjudication",
    reviewNeeded: false,
    players: projectedPlayers,
    parse_reason: projectedParseReason,
    parseReason: projectedParseReason,
    parse_source: projectedParseSource,
    parseSource: projectedParseSource,
    unresolvedResult: null,
    key_events: {
      ...keyEvents,
      replay_result_adjudication: manualEvidence,
    },
    keyEvents: {
      ...keyEvents,
      replay_result_adjudication: manualEvidence,
    },
    replayResultAdjudication: manualEvidence,
  } as T;
}

async function buildMarketSnapshot(
  prisma: MarketSnapshotPrisma,
  gameStatsId: number,
  linkedSessionKeys: Array<string | null | undefined> = []
) {
  const sessionKeys = [...new Set(
    linkedSessionKeys
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean)
  )];
  const markets = await prisma.betMarket.findMany({
    where: {
      OR: [
        { linkedGameStatsId: gameStatsId },
        ...(sessionKeys.length > 0
          ? [{ linkedSessionKey: { in: sessionKeys } }]
          : []),
      ],
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      winnerSide: true,
      resolutionReason: true,
      integrityStatus: true,
      integrityReason: true,
      propositionHash: true,
      sourceRosterHash: true,
      leftRosterSnapshot: true,
      rightRosterSnapshot: true,
      firstStakeAcceptedAt: true,
      settledAt: true,
      voidedAt: true,
      refundStatus: true,
      commissionerReviewState: true,
      settlementStatus: true,
      settlementFailureCode: true,
      settlementAttemptedAt: true,
      settlementExecutedAt: true,
      wagers: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          side: true,
          amountWolo: true,
          payoutWolo: true,
          status: true,
          executionMode: true,
          stakeTxHash: true,
          payoutTxHash: true,
          stakeLockedAt: true,
          settledAt: true,
          createdAt: true,
        },
      },
      stakeIntents: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          side: true,
          amountWolo: true,
          status: true,
          stakeTxHash: true,
          verifiedAt: true,
          recordedAt: true,
          orphanedAt: true,
          createdAt: true,
        },
      },
      integrityIncidents: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          incidentKey: true,
          incidentType: true,
          status: true,
          publicSummary: true,
          evidence: true,
          originalPayoutWolo: true,
          voidEntitlementWolo: true,
          underpaymentWolo: true,
          overpaymentWolo: true,
          bettingFeeReversedWolo: true,
          operatorReturnStatus: true,
          createdAt: true,
          resolvedAt: true,
          adjustments: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              originalStakeWolo: true,
              amountAlreadyPaidWolo: true,
              voidEntitlementWolo: true,
              amountStillOwedWolo: true,
              overpaymentWolo: true,
              adjustmentStatus: true,
              correctiveClaimId: true,
              correctiveTxHash: true,
              voluntaryReturnStatus: true,
              voluntaryReturnTxHash: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
  const marketIds = markets.map((market) => market.id);
  const claims = await prisma.pendingWoloClaim.findMany({
    where: {
      OR: [
        { sourceGameStatsId: gameStatsId },
        ...(marketIds.length > 0 ? [{ sourceMarketId: { in: marketIds } }] : []),
      ],
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      normalizedPlayerName: true,
      displayPlayerName: true,
      amountWolo: true,
      claimKind: true,
      claimGroupKey: true,
      status: true,
      sourceMarketId: true,
      sourceGameStatsId: true,
      payoutTxHash: true,
      errorState: true,
      payoutAttemptedAt: true,
      claimedAt: true,
      rescindedAt: true,
      createdAt: true,
    },
  });

  return {
    hasLinkedMarket: markets.length > 0,
    snapshot: jsonClone({ capturedAt: new Date(), markets, claims }),
    summary: markets.map((market) => ({
      id: market.id,
      slug: market.slug,
      title: market.title,
      status: market.status,
      integrityStatus: market.integrityStatus,
      settlementStatus: market.settlementStatus,
      wagerCount: market.wagers.length,
      hasTerminalMoney: market.wagers.some(
        (wager) => Boolean(wager.payoutWolo || wager.payoutTxHash || wager.settledAt)
      ) || claims.some((claim) =>
        claim.sourceMarketId === market.id &&
        ["claimed", "rescinded"].includes(claim.status)
      ),
    })),
  };
}

function rawParserSnapshot(game: ReviewableGame) {
  return jsonClone({
    id: game.id,
    replayHash: game.replayHash,
    replayFile: game.replay_file,
    originalFilename: game.original_filename,
    parseIteration: game.parse_iteration,
    parseSource: game.parse_source,
    parseReason: game.parse_reason,
    isFinal: game.is_final,
    winner: game.winner,
    players: game.players,
    keyEvents: game.key_events,
    eventTypes: game.event_types,
    map: game.map,
    gameType: game.game_type,
    gameVersion: game.game_version,
    duration: game.game_duration ?? game.duration,
    playedOn: game.played_on,
    parserTimestamp: game.timestamp,
  });
}

export async function requireReplayResultReviewAccess(
  prisma: PrismaClient,
  viewerUid: string,
  gameStatsId: number
) {
  const [viewer, game] = await Promise.all([
    prisma.user.findUnique({
      where: { uid: viewerUid },
      select: {
        id: true,
        uid: true,
        isAdmin: true,
        canReviewOwnReplayResults: true,
        inGameName: true,
        steamPersonaName: true,
      },
    }),
    prisma.gameStats.findUnique({
      where: { id: gameStatsId },
      select: { id: true, userUid: true },
    }),
  ]);
  if (!viewer) fail(401, "viewer_not_found", "Sign in again before reviewing a result.");
  if (!game) fail(404, "game_not_found", "Replay game not found.");

  const hasVerifiedSubmission =
    game.userUid === viewer.uid ||
    Boolean(
      await prisma.replayParseAttempt.findFirst({
        where: { gameStatsId, userUid: viewer.uid },
        select: { id: true },
      })
    );
  const access = decideReplayResultReviewAccess({
    isAdmin: viewer.isAdmin,
    canReviewOwnReplayResults: viewer.canReviewOwnReplayResults,
    hasVerifiedSubmission,
  });
  if (!access.allowed) {
    fail(
      403,
      "review_forbidden",
      "Result review is limited to site admins and approved reviewers for replays they submitted."
    );
  }

  return { viewer, access };
}

const REVIEWABLE_GAME_SELECT = {
  id: true,
  userUid: true,
  replay_file: true,
  replayHash: true,
  createdAt: true,
  game_version: true,
  map: true,
  game_type: true,
  duration: true,
  game_duration: true,
  winner: true,
  players: true,
  event_types: true,
  key_events: true,
  timestamp: true,
  played_on: true,
  parse_iteration: true,
  is_final: true,
  disconnect_detected: true,
  parse_source: true,
  parse_reason: true,
  original_filename: true,
} as const;

export function replayResultAdjudicationDto<T extends { marketSnapshot: unknown }>(
  adjudication: T,
  options: { includeFinancialSnapshot: boolean }
) {
  return {
    ...adjudication,
    marketSnapshot: options.includeFinancialSnapshot
      ? adjudication.marketSnapshot
      : null,
  };
}

export async function loadReplayResultReviewState(
  prisma: PrismaClient,
  viewerUid: string | null,
  gameStatsId: number
) {
  const viewer = viewerUid
    ? await prisma.user.findUnique({
        where: {
          uid: viewerUid,
        },
        select: {
          id: true,
          uid: true,
          isAdmin: true,
          canReviewOwnReplayResults: true,
          inGameName: true,
          steamPersonaName: true,
        },
      })
    : null;

  const [
    game,
    adjudications,
    desyncProvenance,
  ] = await Promise.all([
    prisma.gameStats.findUnique({
      where: {
        id: gameStatsId,
      },
      select:
        REVIEWABLE_GAME_SELECT,
    }),

    prisma.replayResultAdjudication.findMany({
      where: {
        gameStatsId,
      },
      orderBy: [
        {
          createdAt:
            "desc",
        },
        {
          id:
            "desc",
        },
      ],
    }),

    loadReplayDesyncIncidentProvenance(
      prisma,
      gameStatsId
    ),
  ]);

  if (!game) {
    fail(
      404,
      "game_not_found",
      "Replay game not found."
    );
  }

  const access:
    ReplayResultReviewAccess = {
      /*
       * Public read authority.
       *
       * Write authority is represented exclusively by
       * isAdmin and independently enforced by every
       * mutation route and the adjudication domain layer.
       */
      allowed: true,

      role:
        viewer?.isAdmin
          ? "site_admin"
          : null,

      isAdmin:
        Boolean(
          viewer?.isAdmin
        ),

      hasReviewerCapability:
        Boolean(
          viewer
            ?.canReviewOwnReplayResults
        ),

      hasVerifiedSubmission:
        false,
    };

  const marketState =
    await buildMarketSnapshot(
      prisma,
      gameStatsId,
      [
        game.original_filename,
        game.replay_file,
      ]
    );

  const players =
    canonicalPlayers(
      game.players
    );

  const sourceRosterHash =
    buildRosterHash(
      players
    );

  const effectiveAdjudication =
    adjudications.find(
      (entry) =>
        entry.decisionStatus ===
        REPLAY_RESULT_ACCEPTED
    ) ?? null;

  const effectiveGame =
    applyReplayResultAdjudication(
      game,
      effectiveAdjudication
    );

  /*
   * Public viewers may inspect provenance.
   * Protected financial snapshots remain admin-only.
   */
  const includeFinancialSnapshot =
    Boolean(
      viewer?.isAdmin
    );

  return {
    access: {
      ...access,
      ownerMarketCorrectionsRequireAdminApproval:
        true,
    },

    game: {
      ...game,
      sourceRosterHash,
      canonicalRoster:
        players,
    },

    effectiveGame,

    currentAdjudication:
      effectiveAdjudication
        ? replayResultAdjudicationDto(
            effectiveAdjudication,
            {
              includeFinancialSnapshot,
            }
          )
        : null,

    adjudications:
      adjudications.map(
        (entry) =>
          replayResultAdjudicationDto(
            entry,
            {
              includeFinancialSnapshot,
            }
          )
      ),

    ...desyncProvenance,

    linkedMarkets:
      marketState.summary,
  };
}

function displayName(viewer: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return viewer.inGameName || viewer.steamPersonaName || viewer.uid;
}

export async function submitReplayResultAdjudication(input: {
  prisma: PrismaClient;
  viewerUid: string;
  gameStatsId: number;
  payload: ReplayResultAdjudicationInput;
}) {
  const { prisma, viewerUid, gameStatsId, payload } = input;
  const { viewer, access } = await requireReplayResultReviewAccess(prisma, viewerUid, gameStatsId);

  if (!access.isAdmin) {
    fail(
      403,
      "result_admin_required",
      "Only a site admin can lock or correct a battle result."
    );
  }

  let expectedInputHash: string | null = null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // pg_advisory_xact_lock() returns PostgreSQL void. Selecting that
      // value directly makes the Prisma PostgreSQL adapter attempt to
      // deserialize an unsupported void column. Invoke the lock function
      // from FROM and project only a supported integer instead.
      await tx.$queryRaw<Array<{ lock_acquired: number }>>`
        SELECT 1::int AS lock_acquired
        FROM pg_advisory_xact_lock(${gameStatsId})
      `;
      const game = await tx.gameStats.findUnique({
        where: { id: gameStatsId },
        select: REVIEWABLE_GAME_SELECT,
      });
      if (!game) fail(404, "game_not_found", "Replay game not found.");

      const validated = validateReplayResultAdjudication({
        payload,
        replayHash: game.replayHash,
        parseIteration: game.parse_iteration,
        players: game.players,
      });
      expectedInputHash = validated.inputHash;

      const existingIdempotent = await tx.replayResultAdjudication.findUnique({
        where: { idempotencyKey: validated.idempotencyKey },
      });
      if (existingIdempotent) {
        if (
          existingIdempotent.gameStatsId === gameStatsId &&
          existingIdempotent.actorUserId === viewer.id &&
          existingIdempotent.inputHash === validated.inputHash
        ) {
          return { adjudication: existingIdempotent, created: false };
        }
        fail(409, "idempotency_conflict", "That idempotency key was already used for another verdict.");
      }

      const currentDesyncIncident = await tx.replayDesyncIncident.findFirst({
        where: { gameStatsId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { desyncOccurred: true },
      });
      if (currentDesyncIncident?.desyncOccurred) {
        fail(
          409,
          "desync_result_lock_paused",
          "Winner locking is paused for this desynced replay. Resolve the Challenge through rematch or void/refund, or append a no-desync correction."
        );
      }

      const previous = await tx.replayResultAdjudication.findFirst({
        where: { gameStatsId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      if (previous && validated.supersedesId === null) {
        fail(
          409,
          "supersedes_required",
          "This game already has review history. Name the verdict this correction supersedes."
        );
      }
      if (validated.supersedesId !== null) {
        const superseded = await tx.replayResultAdjudication.findFirst({
          where: { id: validated.supersedesId, gameStatsId },
          select: { id: true },
        });
        if (!superseded) {
          fail(409, "supersedes_not_found", "The superseded verdict does not belong to this game.");
        }
        if (previous && validated.supersedesId !== previous.id) {
          fail(
            409,
            "stale_superseded_verdict",
            "A newer verdict exists. Reload before appending this correction."
          );
        }
      }

      const marketState = await buildMarketSnapshot(
        tx as unknown as MarketSnapshotPrisma,
        gameStatsId,
        [game.original_filename, game.replay_file]
      );
      const actorRole = access.role as ReplayResultReviewerRole;
      const decisionStatus = replayResultDecisionStatus(
        actorRole,
        marketState.hasLinkedMarket
      );
      const adjudication = await tx.replayResultAdjudication.create({
        data: {
          gameStatsId,
          actorUserId: viewer.id,
          supersedesId: validated.supersedesId,
          idempotencyKey: validated.idempotencyKey,
          inputHash: validated.inputHash,
          decisionStatus,
          actorUidSnapshot: viewer.uid,
          actorDisplayNameSnapshot: displayName(viewer),
          actorRole,
          teamAssignments: validated.teams as unknown as Prisma.InputJsonValue,
          winningTeamKey: validated.winningTeamKey,
          winningPlayerKeys: validated.winningPlayerKeys as Prisma.InputJsonValue,
          reason: validated.reason,
          ...(validated.evidence === null ? {} : { evidence: validated.evidence }),
          sourceReplayHash: validated.sourceReplayHash,
          sourceParseIteration: validated.sourceParseIteration,
          sourceRosterHash: validated.sourceRosterHash,
          sourcePropositionHash: validated.sourcePropositionHash,
          rawParserSnapshot: rawParserSnapshot(game),
          marketSnapshot: marketState.snapshot,
          hasLinkedMarket: marketState.hasLinkedMarket,
          financialDisposition: marketState.hasLinkedMarket
            ? "operator_review_required"
            : "none",
          affectsStats: decisionStatus === REPLAY_RESULT_ACCEPTED,
          // This ledger never mutates or authorizes wager/claim/chain state.
          affectsBets: false,
        },
      });
      return { adjudication, created: true };
    });

    return {
      ...result,
      access,
      adjudication: replayResultAdjudicationDto(result.adjudication, {
        includeFinancialSnapshot: access.isAdmin,
      }),
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const idempotencyKey = cleanText(payload.idempotencyKey, 128);
      const existing = idempotencyKey
        ? await prisma.replayResultAdjudication.findUnique({ where: { idempotencyKey } })
        : null;
      if (
        existing &&
        existing.gameStatsId === gameStatsId &&
        existing.actorUserId === viewer.id &&
        expectedInputHash !== null &&
        existing.inputHash === expectedInputHash
      ) {
        return {
          adjudication: replayResultAdjudicationDto(existing, {
            includeFinancialSnapshot: access.isAdmin,
          }),
          created: false,
          access,
        };
      }
      fail(409, "idempotency_conflict", "That idempotency key was already used for another verdict.");
    }
    throw error;
  }
}

export const WATCHER_TERMINAL_OWNER_LOSS_POLICY_VERSION =
  "replay-terminal-action-tail-v3" as const;

export const WATCHER_TERMINAL_ADJUDICATION_ACTOR_ROLE =
  "verified_submitter" as const;

export const WATCHER_TERMINAL_LINKED_MARKET_DISPOSITION =
  "operator_review_required" as const;

const WATCHER_TERMINAL_MIN_LOSER_SILENCE_MS = 5_000;
const WATCHER_TERMINAL_MIN_WINNER_LEAD_MS = 2_000;
const WATCHER_TERMINAL_MAX_WINNER_TAIL_MS = 30_000;
const WATCHER_TERMINAL_EVENT_WINDOW_MS = 15 * 60 * 1000;
const WATCHER_TERMINAL_FAILURE_EVENTS = [
  "upload_failed",
  "parse_failed",
  "watcher_error",
] as const;

export type WatcherTerminalOwnerLossEvaluation =
  | {
      eligible: false;
      reason: string;
    }
  | {
      eligible: true;
      reason: "decisive_1v1_terminal_action_tail";
      uploader: CanonicalReplayPlayer;
      loser: CanonicalReplayPlayer;
      winnerPlayer: CanonicalReplayPlayer;
      teams: CanonicalReplayResultTeam[];
      winningTeamKey: string;
      evidence: Prisma.InputJsonValue;
    };

export type WatcherTerminalOwnerLossInput = {
  id: number;
  replayHash: string;
  parseIteration: number;
  parseSource: string | null;
  parseReason: string | null;
  isFinal: boolean;
  winner: unknown;
  players: unknown;
  keyEvents: unknown;
  eventTypes: unknown;
  disconnectDetected: boolean;
  durationSeconds: number | null;
  uploaderSteamId: string | null;
  uploaderUid: string | null;
  uploaderUserId?: number | null;
  hasAdjudicationHistory: boolean;
  currentDesyncOccurred: boolean | null;
  terminalReceipt: unknown;
  terminalFailureCount: number;
  rawActivityByPlayer: unknown;
  parseRun?: unknown;
};

type AutomaticActivityRow = {
  playerNumber: number;
  playerName: string;
  actionPacketCount: number;
  firstActionMs: number;
  lastActionMs: number;
};

function automaticTruth(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function automaticExplicitFalse(value: unknown) {
  return value === false || value === "false" || value === 0 || value === "0";
}

function automaticArray(value: unknown) {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function automaticEventTypes(value: unknown) {
  return new Set(
    automaticArray(value)
      .map((entry) => cleanText(entry, 80).toLowerCase())
      .filter(Boolean)
  );
}

function automaticKnownWinner(value: unknown) {
  const normalized = cleanText(value, 100).toLowerCase();
  return Boolean(
    normalized &&
      ![
        "unknown",
        "unresolved",
        "undetermined",
        "none",
        "null",
        "n/a",
        "tbd",
      ].includes(normalized)
  );
}

function automaticFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function automaticActivityRows(value: unknown): AutomaticActivityRow[] {
  return automaticArray(value)
    .map((entry) => {
      const source = jsonRecord(entry);
      const playerNumber = nonNegativeInteger(source.player_number);
      const actionPacketCount = nonNegativeInteger(source.action_packet_count);
      const firstActionMs = automaticFiniteNumber(source.first_action_ms);
      const lastActionMs = automaticFiniteNumber(source.last_action_ms);
      if (
        playerNumber === null ||
        actionPacketCount === null ||
        actionPacketCount < 1 ||
        firstActionMs === null ||
        lastActionMs === null ||
        firstActionMs < 0 ||
        lastActionMs < firstActionMs
      ) {
        return null;
      }
      return {
        playerNumber,
        playerName: cleanText(source.player_name, 100),
        actionPacketCount,
        firstActionMs,
        lastActionMs,
      };
    })
    .filter((entry): entry is AutomaticActivityRow => entry !== null);
}

function automaticTerminalReceipt(value: unknown) {
  const source = jsonRecord(value);
  const metadata = jsonRecord(source.metadata);
  return {
    eventId: cleanText(source.eventId ?? source.event_id ?? source.id, 80),
    eventType: cleanText(source.eventType ?? source.event_type, 80).toLowerCase(),
    createdAt: cleanText(source.createdAt ?? source.created_at, 80),
    userId: positiveInteger(source.userId ?? source.user_id),
    userUid: cleanText(source.userUid ?? source.user_uid, 100),
    sessionId: cleanText(source.sessionId ?? source.session_id, 80),
    replayHash: cleanText(source.replayHash ?? source.replay_hash, 64).toLowerCase(),
    replayFile: cleanText(source.replayFile ?? source.replay_file, 255),
    metadata,
  };
}

export function evaluateWatcherTerminalOwnerLoss(
  input: WatcherTerminalOwnerLossInput
): WatcherTerminalOwnerLossEvaluation {
  if (!input.isFinal) return { eligible: false, reason: "not_final" };
  if (cleanText(input.parseSource, 40) !== "watcher_final") {
    return { eligible: false, reason: "not_watcher_final" };
  }
  if (cleanText(input.parseReason, 80) !== "watcher_final_submission") {
    return { eligible: false, reason: "parse_reason_not_exact" };
  }
  if (input.parseIteration < 2) {
    return { eligible: false, reason: "parser_iteration_not_stable" };
  }
  if (!input.disconnectDetected) {
    return { eligible: false, reason: "terminal_disconnect_missing" };
  }
  if ((input.durationSeconds ?? 0) < 60) {
    return { eligible: false, reason: "duration_under_60_seconds" };
  }
  if (input.hasAdjudicationHistory) {
    return { eligible: false, reason: "adjudication_history_exists" };
  }
  if (input.currentDesyncOccurred === true) {
    return { eligible: false, reason: "confirmed_desync" };
  }
  if (automaticKnownWinner(input.winner)) {
    return { eligible: false, reason: "stored_winner_exists" };
  }
  if (!Number.isSafeInteger(input.terminalFailureCount) || input.terminalFailureCount !== 0) {
    return { eligible: false, reason: "terminal_failure_present" };
  }

  const players = normalizeReplayPlayers(parseJson(input.players));
  if (
    players.length !== 2 ||
    players.some((player) => !player.steamId || player.playerNumber === null) ||
    new Set(players.map((player) => player.stablePlayerKey)).size !== 2
  ) {
    return { eligible: false, reason: "exact_steam_1v1_required" };
  }

  const uploaderSteamId = cleanText(input.uploaderSteamId, 32);
  if (!uploaderSteamId) {
    return { eligible: false, reason: "uploader_steam_id_missing" };
  }
  const uploaderMatches = players.filter(
    (player) => player.steamId === uploaderSteamId
  );
  if (uploaderMatches.length !== 1) {
    return { eligible: false, reason: "uploader_player_not_exact" };
  }
  const uploader = uploaderMatches[0];

  const keyEvents = jsonRecord(input.keyEvents);
  const watcherUpload = jsonRecord(keyEvents.watcher_upload);
  const teamResolution = jsonRecord(keyEvents.team_resolution);
  const resultResolution = jsonRecord(keyEvents.result_resolution);
  const eventTypes = automaticEventTypes(input.eventTypes);
  const replayHash = cleanText(input.replayHash, 64).toLowerCase();
  const archivedHash = cleanText(
    watcherUpload.server_sha256,
    64
  ).toLowerCase();

  if (
    cleanText(watcherUpload.file_role, 40).toLowerCase() !==
      "final_recording" ||
    !automaticTruth(watcherUpload.final_candidate) ||
    automaticTruth(watcherUpload.checkpoint_final_rejected) ||
    !replayHash ||
    archivedHash !== replayHash
  ) {
    return { eligible: false, reason: "watcher_final_proof_incomplete" };
  }
  if (
    !automaticTruth(keyEvents.rated) ||
    !automaticExplicitFalse(keyEvents.restored) ||
    cleanText(keyEvents.platform_id, 20).toLowerCase() !== "hd" ||
    !automaticExplicitFalse(keyEvents.completed)
  ) {
    return { eligible: false, reason: "rated_hd_terminal_shape_missing" };
  }
  if (
    cleanText(teamResolution.format, 20).toLowerCase() !== "1v1" ||
    cleanText(teamResolution.status, 20).toLowerCase() !== "resolved" ||
    cleanText(teamResolution.confidence, 20).toLowerCase() !== "high"
  ) {
    return { eligible: false, reason: "team_resolution_not_exact" };
  }

  const hasSerializedResult =
    players.some((player) => player.winner === true) ||
    automaticTruth(resultResolution.result_trusted) ||
    Boolean(cleanText(resultResolution.winning_team_id, 100)) ||
    automaticArray(resultResolution.winning_player_names).length > 0 ||
    automaticArray(resultResolution.winning_player_keys).length > 0 ||
    eventTypes.has("resign") ||
    automaticArray(keyEvents.resigned_player_numbers).length > 0 ||
    automaticArray(keyEvents.resigned_player_names).length > 0;

  if (hasSerializedResult) {
    return { eligible: false, reason: "serialized_result_exists" };
  }

  const receipt = automaticTerminalReceipt(input.terminalReceipt);
  const receiptProvided = Boolean(
    receipt.eventType ||
      receipt.replayHash ||
      receipt.sessionId ||
      receipt.replayFile
  );
  const receiptTypeAllowed = [
    "final_settle_observation_complete",
    "legacy_final_monitor_settled",
  ].includes(receipt.eventType);
  const receiptIdentityMatches =
    receiptTypeAllowed &&
    receipt.replayHash === replayHash &&
    Boolean(receipt.sessionId) &&
    Boolean(receipt.replayFile) &&
    (!input.uploaderUserId || receipt.userId === input.uploaderUserId) &&
    (!input.uploaderUid || !receipt.userUid || receipt.userUid === input.uploaderUid);
  const finalStored = receipt.metadata.finalStored;
  if (
    receiptProvided &&
    (!receiptIdentityMatches ||
      (receipt.eventType === "final_settle_observation_complete" &&
        !automaticTruth(finalStored)))
  ) {
    return { eligible: false, reason: "terminal_receipt_conflicts" };
  }

  const activityRows = automaticActivityRows(input.rawActivityByPlayer);
  const activityPairs = players
    .map((player) => {
      if (player.playerNumber === null) return null;
      const rows = activityRows.filter(
        (entry) => entry.playerNumber === player.playerNumber
      );
      if (rows.length !== 1) return null;
      return { player, activity: rows[0] };
    })
    .filter(
      (entry): entry is {
        player: CanonicalReplayPlayer;
        activity: AutomaticActivityRow;
      } => entry !== null
    )
    .sort(
      (left, right) =>
        left.activity.lastActionMs - right.activity.lastActionMs
    );

  if (activityPairs.length !== 2) {
    return { eligible: false, reason: "raw_activity_not_exact" };
  }

  const loser = activityPairs[0].player;
  const loserActivity = activityPairs[0].activity;
  const winnerPlayer = activityPairs[1].player;
  const winnerActivity = activityPairs[1].activity;
  const durationMs = Math.round((input.durationSeconds ?? 0) * 1000);
  const winnerLeadMs =
    winnerActivity.lastActionMs - loserActivity.lastActionMs;
  const loserSilenceMs = durationMs - loserActivity.lastActionMs;
  const winnerTailMs = durationMs - winnerActivity.lastActionMs;

  if (winnerLeadMs < WATCHER_TERMINAL_MIN_WINNER_LEAD_MS) {
    return { eligible: false, reason: "terminal_activity_gap_too_short" };
  }
  if (loserSilenceMs < WATCHER_TERMINAL_MIN_LOSER_SILENCE_MS) {
    return { eligible: false, reason: "loser_terminal_silence_too_short" };
  }
  if (
    winnerTailMs < 0 ||
    winnerTailMs > WATCHER_TERMINAL_MAX_WINNER_TAIL_MS
  ) {
    return { eligible: false, reason: "winner_not_active_at_terminal_tail" };
  }

  const teams: CanonicalReplayResultTeam[] = players
    .map((player) => ({
      teamKey: player.stablePlayerKey,
      players: [
        {
          stablePlayerKey: player.stablePlayerKey,
          name: player.name,
          normalizedName: player.normalizedName,
          steamId: player.steamId,
          sourceTeamId: player.teamId,
          playerNumber: player.playerNumber,
        },
      ],
    }))
    .sort((left, right) => left.teamKey.localeCompare(right.teamKey));

  return {
    eligible: true,
    reason: "decisive_1v1_terminal_action_tail",
    uploader,
    loser,
    winnerPlayer,
    teams,
    winningTeamKey: winnerPlayer.stablePlayerKey,
    evidence: jsonClone({
      submittedVia: "automatic_replay_terminal_policy",
      policyVersion: WATCHER_TERMINAL_OWNER_LOSS_POLICY_VERSION,
      replayHash,
      gameStatsId: input.id,
      uploaderUid: input.uploaderUid,
      uploaderUserId: input.uploaderUserId ?? null,
      uploaderSteamId,
      uploaderPlayerKey: uploader.stablePlayerKey,
      uploaderPlayerName: uploader.name,
      losingPlayerKey: loser.stablePlayerKey,
      losingPlayerName: loser.name,
      winningPlayerKey: winnerPlayer.stablePlayerKey,
      winningPlayerName: winnerPlayer.name,
      durationSeconds: input.durationSeconds,
      exactFinalRecording: true,
      ratedHdOneVsOne: true,
      serializedResultAbsent: true,
      confirmedDesyncAbsent: true,
      terminalReceiptMode: receiptProvided
        ? "exact_watcher_receipt"
        : "action_tail_fallback",
      terminalReceipt: receiptProvided
        ? {
            eventId: receipt.eventId,
            eventType: receipt.eventType,
            createdAt: receipt.createdAt,
            sessionId: receipt.sessionId,
            replayFile: receipt.replayFile,
            metadata: receipt.metadata,
          }
        : null,
      parseRun: input.parseRun ?? null,
      actionTail: {
        loser: loserActivity,
        winner: winnerActivity,
        winnerLeadMs,
        loserSilenceMs,
        winnerTailMs,
        thresholds: {
          minimumWinnerLeadMs: WATCHER_TERMINAL_MIN_WINNER_LEAD_MS,
          minimumLoserSilenceMs: WATCHER_TERMINAL_MIN_LOSER_SILENCE_MS,
          maximumWinnerTailMs: WATCHER_TERMINAL_MAX_WINNER_TAIL_MS,
        },
      },
      financialAuthority: false,
    }),
  };
}

export type AutomaticWatcherTerminalResultReport = {
  requestedCount: number;
  createdCount: number;
  existingCount: number;
  skippedCount: number;
  outcomes: Array<{
    gameStatsId: number;
    outcome: "created" | "existing" | "skipped";
    detail: string;
    adjudicationId: number | null;
  }>;
};

function automaticGameIds(
  values: readonly (string | number | null | undefined)[]
) {
  return [
    ...new Set(
      values
        .map((value) => Number(value))
        .filter(
          (value): value is number =>
            Number.isSafeInteger(value) && value > 0
        )
    ),
  ].sort((left, right) => left - right);
}

function automaticEventReceipt(entry: {
  id: bigint;
  eventType: string;
  createdAt: Date;
  userId: number | null;
  userUid: string | null;
  sessionId: string | null;
  replayHash: string | null;
  replayFile: string | null;
  metadata: Prisma.JsonValue | null;
}) {
  return {
    eventId: entry.id.toString(),
    eventType: entry.eventType,
    createdAt: entry.createdAt.toISOString(),
    userId: entry.userId,
    userUid: entry.userUid,
    sessionId: entry.sessionId,
    replayHash: entry.replayHash,
    replayFile: entry.replayFile,
    metadata: entry.metadata,
  };
}

export async function reconcileAutomaticWatcherTerminalResults(
  prisma: PrismaClient,
  rawGameStatsIds: readonly (string | number | null | undefined)[]
): Promise<AutomaticWatcherTerminalResultReport> {
  const gameStatsIds = automaticGameIds(rawGameStatsIds);
  const outcomes: AutomaticWatcherTerminalResultReport["outcomes"] = [];

  for (const gameStatsId of gameStatsIds) {
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ lock_acquired: number }>>`
          SELECT 1::int AS lock_acquired
          FROM pg_advisory_xact_lock(${gameStatsId})
        `;

        const game = await tx.gameStats.findUnique({
          where: { id: gameStatsId },
          select: {
            ...REVIEWABLE_GAME_SELECT,
            user: {
              select: {
                id: true,
                uid: true,
                steamId: true,
                inGameName: true,
                steamPersonaName: true,
              },
            },
          },
        });
        if (!game) {
          return {
            gameStatsId,
            outcome: "skipped" as const,
            detail: "game_not_found",
            adjudicationId: null,
          };
        }
        if (!game.user?.steamId) {
          return {
            gameStatsId,
            outcome: "skipped" as const,
            detail: "verified_uploader_missing",
            adjudicationId: null,
          };
        }

        const idempotencyKey = [
          "evidence:auto",
          WATCHER_TERMINAL_OWNER_LOSS_POLICY_VERSION,
          gameStatsId,
          game.replayHash.slice(0, 16),
          game.parse_iteration,
        ].join(":");
        const existingIdempotent = await tx.replayResultAdjudication.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        if (existingIdempotent) {
          return {
            gameStatsId,
            outcome: "existing" as const,
            detail: "idempotent_adjudication_exists",
            adjudicationId: existingIdempotent.id,
          };
        }

        const [previousAdjudication, currentDesyncIncident] = await Promise.all([
          tx.replayResultAdjudication.findFirst({
            where: { gameStatsId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true },
          }),
          tx.replayDesyncIncident.findFirst({
            where: { gameStatsId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { desyncOccurred: true },
          }),
        ]);
        if (previousAdjudication) {
          return {
            gameStatsId,
            outcome: "skipped" as const,
            detail: "adjudication_history_exists",
            adjudicationId: previousAdjudication.id,
          };
        }
        if (currentDesyncIncident?.desyncOccurred === true) {
          return {
            gameStatsId,
            outcome: "skipped" as const,
            detail: "confirmed_desync",
            adjudicationId: null,
          };
        }

        const terminalComplete = await tx.watcherClientEvent.findFirst({
          where: {
            userId: game.user.id,
            replayHash: game.replayHash,
            eventType: "final_settle_observation_complete",
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            eventType: true,
            createdAt: true,
            userId: true,
            userUid: true,
            sessionId: true,
            replayHash: true,
            replayFile: true,
            metadata: true,
          },
        });

        let receipt = terminalComplete
          ? automaticEventReceipt(terminalComplete)
          : null;
        let terminalWindowStart = terminalComplete?.createdAt ?? null;
        let terminalWindowEnd = terminalComplete?.createdAt ?? null;

        if (terminalComplete?.sessionId && terminalComplete.replayFile) {
          const settleStarted = await tx.watcherClientEvent.findFirst({
            where: {
              userId: game.user.id,
              sessionId: terminalComplete.sessionId,
              replayFile: terminalComplete.replayFile,
              eventType: "final_settle_observation_started",
              createdAt: {
                gte: new Date(
                  terminalComplete.createdAt.getTime() -
                    WATCHER_TERMINAL_EVENT_WINDOW_MS
                ),
                lte: terminalComplete.createdAt,
              },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { createdAt: true },
          });
          terminalWindowStart = settleStarted?.createdAt ?? terminalComplete.createdAt;
        }

        if (!receipt) {
          const finalEvent = await tx.watcherClientEvent.findFirst({
            where: {
              userId: game.user.id,
              replayHash: game.replayHash,
              eventType: {
                in: ["final_candidate_accepted", "result_review_routed"],
              },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              eventType: true,
              createdAt: true,
              userId: true,
              userUid: true,
              sessionId: true,
              replayHash: true,
              replayFile: true,
              metadata: true,
            },
          });
          if (finalEvent?.sessionId && finalEvent.replayFile) {
            const monitorStop = await tx.watcherClientEvent.findFirst({
              where: {
                userId: game.user.id,
                sessionId: finalEvent.sessionId,
                replayFile: finalEvent.replayFile,
                eventType: "monitor_stop",
                createdAt: {
                  gte: finalEvent.createdAt,
                  lte: new Date(
                    finalEvent.createdAt.getTime() + WATCHER_TERMINAL_EVENT_WINDOW_MS
                  ),
                },
              },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                eventType: true,
                createdAt: true,
                userId: true,
                userUid: true,
                sessionId: true,
                replayHash: true,
                replayFile: true,
                metadata: true,
              },
            });
            if (monitorStop) {
              receipt = {
                eventId: monitorStop.id.toString(),
                eventType: "legacy_final_monitor_settled",
                createdAt: monitorStop.createdAt.toISOString(),
                userId: finalEvent.userId,
                userUid: finalEvent.userUid,
                sessionId: finalEvent.sessionId,
                replayHash: finalEvent.replayHash,
                replayFile: finalEvent.replayFile,
                metadata: {
                  finalEventId: finalEvent.id.toString(),
                  finalEventType: finalEvent.eventType,
                  finalEventCreatedAt: finalEvent.createdAt.toISOString(),
                  monitorStopEventId: monitorStop.id.toString(),
                },
              };
              terminalWindowStart = finalEvent.createdAt;
              terminalWindowEnd = monitorStop.createdAt;
            }
          }
        }

        const terminalFailureCount = await tx.watcherClientEvent.count({
          where:
            receipt && terminalWindowStart && terminalWindowEnd
              ? {
                  userId: game.user.id,
                  sessionId: receipt.sessionId,
                  replayFile: receipt.replayFile,
                  eventType: { in: [...WATCHER_TERMINAL_FAILURE_EVENTS] },
                  createdAt: {
                    gte: terminalWindowStart,
                    lte: terminalWindowEnd,
                  },
                }
              : {
                  userId: game.user.id,
                  replayHash: game.replayHash,
                  eventType: { in: [...WATCHER_TERMINAL_FAILURE_EVENTS] },
                },
        });

        const parseRun = await tx.replayParseRun.findFirst({
          where: {
            gameStatsId,
            artifact: { sha256: game.replayHash },
            status: { in: ["completed", "recovered"] },
          },
          orderBy: [{ completedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            parserName: true,
            parserVersion: true,
            parserBuild: true,
            passName: true,
            passVersion: true,
            schemaVersion: true,
            status: true,
            candidateOnly: true,
            affectsPublicAggregates: true,
            completedAt: true,
            observations: {
              where: { fieldPath: "actions.raw_activity_by_player" },
              orderBy: { id: "desc" },
              take: 1,
              select: { id: true, value: true, provenance: true },
            },
          },
        });
        const activityObservation = parseRun?.observations[0] ?? null;
        if (!parseRun || !activityObservation) {
          return {
            gameStatsId,
            outcome: "skipped" as const,
            detail: "raw_activity_observation_missing",
            adjudicationId: null,
          };
        }

        const evaluation = evaluateWatcherTerminalOwnerLoss({
          id: game.id,
          replayHash: game.replayHash,
          parseIteration: game.parse_iteration,
          parseSource: game.parse_source,
          parseReason: game.parse_reason,
          isFinal: game.is_final,
          winner: game.winner,
          players: game.players,
          keyEvents: game.key_events,
          eventTypes: game.event_types,
          disconnectDetected: game.disconnect_detected,
          durationSeconds: game.game_duration ?? game.duration,
          uploaderSteamId: game.user.steamId,
          uploaderUid: game.user.uid,
          uploaderUserId: game.user.id,
          hasAdjudicationHistory: false,
          currentDesyncOccurred: currentDesyncIncident?.desyncOccurred ?? null,
          terminalReceipt: receipt,
          terminalFailureCount,
          rawActivityByPlayer: activityObservation.value,
          parseRun: {
            id: parseRun.id,
            parserName: parseRun.parserName,
            parserVersion: parseRun.parserVersion,
            parserBuild: parseRun.parserBuild,
            passName: parseRun.passName,
            passVersion: parseRun.passVersion,
            schemaVersion: parseRun.schemaVersion,
            status: parseRun.status,
            candidateOnly: parseRun.candidateOnly,
            affectsPublicAggregates: parseRun.affectsPublicAggregates,
            completedAt: parseRun.completedAt,
            activityObservationId: activityObservation.id,
            activityProvenance: activityObservation.provenance,
          },
        });
        if (!evaluation.eligible) {
          return {
            gameStatsId,
            outcome: "skipped" as const,
            detail: evaluation.reason,
            adjudicationId: null,
          };
        }

        const validated = validateReplayResultAdjudication({
          payload: {
            idempotencyKey,
            sourceReplayHash: game.replayHash,
            sourceParseIteration: game.parse_iteration,
            teams: evaluation.teams,
            winningTeamKey: evaluation.winningTeamKey,
            reason:
              `Automatic terminal evidence: ${evaluation.loser.name} stopped first in the ` +
              `final rated 1v1 while ${evaluation.winnerPlayer.name} remained active.`,
            evidence: evaluation.evidence,
          },
          replayHash: game.replayHash,
          parseIteration: game.parse_iteration,
          players: game.players,
        });
        const marketState = await buildMarketSnapshot(
          tx as unknown as MarketSnapshotPrisma,
          gameStatsId,
          [game.original_filename, game.replay_file]
        );
        const adjudication = await tx.replayResultAdjudication.create({
          data: {
            gameStatsId,
            actorUserId: game.user.id,
            supersedesId: null,
            idempotencyKey: validated.idempotencyKey,
            inputHash: validated.inputHash,
            decisionStatus: REPLAY_RESULT_ACCEPTED,
            actorUidSnapshot: game.user.uid,
            actorDisplayNameSnapshot: displayName(game.user),
            actorRole: WATCHER_TERMINAL_ADJUDICATION_ACTOR_ROLE,
            teamAssignments: validated.teams as unknown as Prisma.InputJsonValue,
            winningTeamKey: validated.winningTeamKey,
            winningPlayerKeys: validated.winningPlayerKeys as Prisma.InputJsonValue,
            reason: validated.reason,
            ...(validated.evidence === null ? {} : { evidence: validated.evidence }),
            sourceReplayHash: validated.sourceReplayHash,
            sourceParseIteration: validated.sourceParseIteration,
            sourceRosterHash: validated.sourceRosterHash,
            sourcePropositionHash: validated.sourcePropositionHash,
            rawParserSnapshot: rawParserSnapshot(game),
            marketSnapshot: marketState.snapshot,
            hasLinkedMarket: marketState.hasLinkedMarket,
            financialDisposition: marketState.hasLinkedMarket
              ? WATCHER_TERMINAL_LINKED_MARKET_DISPOSITION
              : "none",
            affectsStats: true,
            affectsBets: false,
          },
          select: { id: true },
        });
        return {
          gameStatsId,
          outcome: "created" as const,
          detail: evaluation.reason,
          adjudicationId: adjudication.id,
        };
      });
      outcomes.push(outcome);
    } catch (error) {
      console.error(
        `Automatic watcher terminal reconciliation failed for game ${gameStatsId}:`,
        error
      );
      outcomes.push({
        gameStatsId,
        outcome: "skipped",
        detail: "reconciliation_error",
        adjudicationId: null,
      });
    }
  }

  return {
    requestedCount: gameStatsIds.length,
    createdCount: outcomes.filter((entry) => entry.outcome === "created").length,
    existingCount: outcomes.filter((entry) => entry.outcome === "existing").length,
    skippedCount: outcomes.filter((entry) => entry.outcome === "skipped").length,
    outcomes,
  };
}
