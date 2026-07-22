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
  decisionStatus: string;
  actorDisplayNameSnapshot: string;
  actorRole: string;
  teamAssignments: Prisma.JsonValue;
  winningTeamKey: string;
  winningPlayerKeys: Prisma.JsonValue;
  reason: string;
  sourceReplayHash: string;
  sourceParseIteration: number;
  sourceRosterHash: string;
  sourcePropositionHash: string;
  createdAt: Date | string;
};

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
    winning_team_key: adjudication.winningTeamKey,
    winning_player_keys: [...winningPlayerKeys],
    adjudicated_by: adjudication.actorDisplayNameSnapshot,
    actor_role: adjudication.actorRole,
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

  return {
    ...source,
    winner: winningNames[0],
    winnerPlayers: winningNames,
    winningPlayerKeys: [...winningPlayerKeys],
    winningTeamKey: adjudication.winningTeamKey,
    players: projectedPlayers,
    parse_reason: "manual_result_adjudication",
    parseReason: "manual_result_adjudication",
    parse_source: "replay_result_review",
    parseSource: "replay_result_review",
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
