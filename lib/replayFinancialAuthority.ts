import { createHash } from "node:crypto";

import {
  Prisma,
  type PrismaClient,
} from "./generated/prisma/index.js";
import {
  REPLAY_RESULT_ACCEPTED,
  ReplayResultReviewError,
  replayResultAdjudicationAuthorizesBets,
  type CanonicalReplayResultTeam,
  type EffectiveReplayResultAdjudication,
} from "./replayResultAdjudications.ts";
import {
  buildRosterHash,
  normalizeReplayPlayers,
  validateMarketFinalIntegrity,
} from "./teamResolution.ts";

export const REPLAY_FINANCIAL_AUTHORITY_CONFIRMATION =
  "AUTHORIZE FINANCIAL RECONCILIATION";

export function isReplayFinancialAuthorityConfirmation(
  value: unknown
) {
  return (
    value ===
    REPLAY_FINANCIAL_AUTHORITY_CONFIRMATION
  );
}

const AUTHORITY_IDEMPOTENCY_PREFIX =
  "financial-authority:";

type FinancialAuthorityDb = Pick<
  PrismaClient,
  | "user"
  | "gameStats"
  | "replayResultAdjudication"
  | "replayDesyncIncident"
  | "betMarket"
  | "pendingWoloClaim"
>;

type AuthorityBlocker = {
  code: string;
  message: string;
  marketId?: number;
};

type AuthorityWager = {
  id: number;
  side: string;
  amountWolo: number;
  payoutWolo: number | null;
  status: string;
  executionMode: string;
  stakeTxHash: string | null;
  payoutTxHash: string | null;
  stakeLockedAt: Date | null;
  settledAt: Date | null;
};

type AuthorityMarket = {
  id: number;
  title: string;
  status: string;
  marketType: string;
  leftLabel: string;
  rightLabel: string;
  propositionHash: string | null;
  sourceRosterHash: string | null;
  leftRosterSnapshot: Prisma.JsonValue | null;
  rightRosterSnapshot: Prisma.JsonValue | null;
  integrityStatus: string;
  integrityReason: string | null;
  winnerSide: string | null;
  resolutionReason: string | null;
  voidedAt: Date | null;
  refundStatus: string | null;
  settlementStatus: string | null;
  settlementExecutedAt: Date | null;
  seedLeftWolo: number;
  seedRightWolo: number;
  wagers: AuthorityWager[];
  integrityIncidents: Array<{
    id: number;
    status: string;
    incidentType: string;
    publicSummary: string;
    evidence: Prisma.JsonValue;
  }>;
};

type AuthorityAdjudication = EffectiveReplayResultAdjudication & {
  inputHash: string;
  actorUserId: number;
  actorUidSnapshot: string;
  evidence: Prisma.JsonValue | null;
  marketSnapshot: Prisma.JsonValue | null;
};

type AuthorityGame = {
  id: number;
  replayHash: string;
  replay_file: string;
  original_filename: string | null;
  parse_iteration: number;
  parse_source: string;
  parse_reason: string;
  is_final: boolean;
  winner: string | null;
  players: Prisma.JsonValue | null;
  key_events: Prisma.JsonValue | null;
  event_types: Prisma.JsonValue | null;
  map: Prisma.JsonValue | null;
  game_type: string | null;
  game_version: string | null;
  duration: number | null;
  game_duration: number | null;
  played_on: Date | null;
  timestamp: Date | null;
};

type FrozenAuthorityEvaluation = {
  ok: boolean;
  winnerSide: "left" | "right" | null;
  reasonCodes: string[];
  leftTeamKey: string | null;
  rightTeamKey: string | null;
};

export type ReplayFinancialAuthorityPlan = {
  gameStatsId: number;
  ready: boolean;
  alreadyAuthorized: boolean;
  fingerprint: string;
  confirmationPhrase: typeof REPLAY_FINANCIAL_AUTHORITY_CONFIRMATION;
  replay: {
    replayHash: string;
    parseIteration: number;
    sourceRosterHash: string | null;
    isFinal: boolean;
  };
  adjudication: {
    id: number | null;
    actor: string | null;
    winningTeamKey: string | null;
    winningPlayerKeys: string[];
    affectsBets: boolean;
  };
  exposure: {
    marketCount: number;
    wagerCount: number;
    activeWagerCount: number;
    totalWolo: number;
    activeWolo: number;
    seedWolo: number;
    pendingClaimWolo: number;
  };
  markets: Array<{
    id: number;
    title: string;
    status: string;
    integrityStatus: string;
    propositionHash: string | null;
    leftLabel: string;
    rightLabel: string;
    winningSide: "left" | "right" | null;
    wagerCount: number;
    activeWagerCount: number;
    totalWolo: number;
    activeWolo: number;
    seedWolo: number;
    wagers: Array<{
      id: number;
      side: string;
      amountWolo: number;
      status: string;
      executionMode: string;
      stakeTxHash: string | null;
    }>;
  }>;
  blockers: AuthorityBlocker[];
};

type InternalReplayFinancialAuthorityPlan = ReplayFinancialAuthorityPlan & {
  authorityTeams: CanonicalReplayResultTeam[];
  authorityWinningTeamKey: string | null;
  latestAdjudication: AuthorityAdjudication | null;
  game: AuthorityGame;
  marketSnapshot: Prisma.InputJsonValue;
  recoverableIntegrityIncidentIds: number[];
};

export class ReplayFinancialAuthorityError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string
  ) {
    super(message);
    this.name =
      "ReplayFinancialAuthorityError";
    this.status = status;
    this.code = code;
  }
}

function fail(
  status: number,
  code: string,
  message: string
): never {
  throw new ReplayFinancialAuthorityError(
    status,
    code,
    message
  );
}

function stableJsonValue(
  value: unknown
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>
      )
        .filter(([, entry]) =>
          entry !== undefined
        )
        .sort(([left], [right]) =>
          left.localeCompare(right)
        )
        .map(([key, entry]) => [
          key,
          stableJsonValue(entry),
        ])
    );
  }

  return null;
}

function jsonInput(
  value: unknown
) {
  return JSON.parse(
    JSON.stringify(
      stableJsonValue(value)
    )
  ) as Prisma.InputJsonValue;
}

export function replayFinancialAuthorityFingerprint(
  value: unknown
) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stableJsonValue(value)
      )
    )
    .digest("hex");
}

function playerKeySet(
  value: unknown
) {
  return normalizeReplayPlayers(value)
    .map((player) =>
      player.stablePlayerKey
    )
    .sort();
}

function equalKeys(
  left: string[],
  right: string[]
) {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) =>
        entry === right[index]
    )
  );
}

function assignmentTeams(
  value: unknown
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry)
      ) {
        return null;
      }

      const source =
        entry as Record<string, unknown>;
      const teamKey =
        typeof source.teamKey === "string"
          ? source.teamKey
          : typeof source.teamKey === "number"
            ? String(source.teamKey)
            : "";
      const players =
        Array.isArray(source.players)
          ? source.players
          : [];
      const keys = players
        .map((player) => {
          if (
            !player ||
            typeof player !== "object" ||
            Array.isArray(player)
          ) {
            return "";
          }

          const key = (
            player as Record<string, unknown>
          ).stablePlayerKey;
          return typeof key === "string"
            ? key
            : "";
        })
        .filter(Boolean)
        .sort();

      return teamKey && keys.length > 0
        ? {
            teamKey,
            keys,
            players,
          }
        : null;
    })
    .filter(
      (
        team
      ): team is {
        teamKey: string;
        keys: string[];
        players: unknown[];
      } =>
        team !== null
    );
}

function matchingTeamKey(
  resolutionTeams: Array<{
    teamKey: string;
    players: Array<{
      stablePlayerKey: string;
    }>;
  }>,
  keys: string[]
) {
  return (
    resolutionTeams.find(
      (team) =>
        equalKeys(
          team.players
            .map((player) =>
              player.stablePlayerKey
            )
            .sort(),
          keys
        )
    )?.teamKey ??
    null
  );
}

export function evaluateFrozenReplayMarketAuthority(
  input: {
    gamePlayers: unknown;
    sourceRosterHash: string | null;
    teamAssignments: unknown;
    winningTeamKey: string;
    propositionHash: string | null;
    marketSourceRosterHash: string | null;
    leftRosterSnapshot: unknown;
    rightRosterSnapshot: unknown;
  }
): FrozenAuthorityEvaluation {
  const reasons: string[] = [];
  const gamePlayers =
    normalizeReplayPlayers(
      input.gamePlayers
    );
  const gameKeys =
    gamePlayers
      .map((player) =>
        player.stablePlayerKey
      )
      .sort();
  const currentRosterHash =
    buildRosterHash(
      gamePlayers
    );
  const leftPlayers =
    normalizeReplayPlayers(
      input.leftRosterSnapshot
    );
  const rightPlayers =
    normalizeReplayPlayers(
      input.rightRosterSnapshot
    );
  const leftKeys =
    leftPlayers
      .map((player) =>
        player.stablePlayerKey
      )
      .sort();
  const rightKeys =
    rightPlayers
      .map((player) =>
        player.stablePlayerKey
      )
      .sort();
  const marketKeys = [
    ...leftKeys,
    ...rightKeys,
  ].sort();

  if (
    gamePlayers.length < 2 ||
    new Set(gameKeys).size !==
      gameKeys.length
  ) {
    reasons.push(
      "current_roster_incomplete"
    );
  }

  if (
    !currentRosterHash ||
    currentRosterHash !==
      input.sourceRosterHash
  ) {
    reasons.push(
      "adjudication_roster_hash_stale"
    );
  }

  if (
    !input.marketSourceRosterHash ||
    input.marketSourceRosterHash !==
      currentRosterHash
  ) {
    reasons.push(
      "market_roster_hash_mismatch"
    );
  }

  if (
    leftKeys.length === 0 ||
    rightKeys.length === 0 ||
    !equalKeys(
      gameKeys,
      marketKeys
    )
  ) {
    reasons.push(
      "frozen_market_roster_mismatch"
    );
  }

  const assignments =
    assignmentTeams(
      input.teamAssignments
    );

  if (
    assignments.length !== 2
  ) {
    reasons.push(
      "adjudication_team_shape_invalid"
    );
  }

  const leftAssignment =
    assignments.find((team) =>
      equalKeys(
        team.keys,
        leftKeys
      )
    );
  const rightAssignment =
    assignments.find((team) =>
      equalKeys(
        team.keys,
        rightKeys
      )
    );

  if (
    !leftAssignment ||
    !rightAssignment ||
    leftAssignment.teamKey ===
      rightAssignment.teamKey
  ) {
    reasons.push(
      "adjudication_teams_do_not_match_frozen_sides"
    );
  }

  const winningSide =
    leftAssignment?.teamKey ===
      input.winningTeamKey
      ? "left"
      : rightAssignment?.teamKey ===
          input.winningTeamKey
        ? "right"
        : null;

  if (!winningSide) {
    reasons.push(
      "adjudicated_winner_not_frozen_side"
    );
  }

  const frozenFinalPlayers = [
    ...leftPlayers.map((player) => ({
      ...player,
      winner:
        winningSide === "left",
    })),
    ...rightPlayers.map((player) => ({
      ...player,
      winner:
        winningSide === "right",
    })),
  ];

  const integrity =
    validateMarketFinalIntegrity({
      propositionHash:
        input.propositionHash,
      leftRosterSnapshot:
        input.leftRosterSnapshot,
      rightRosterSnapshot:
        input.rightRosterSnapshot,
      finalPlayers:
        frozenFinalPlayers,
      finalWinner:
        null,
      finalBettingEligible:
        true,
    });

  reasons.push(
    ...integrity.reasonCodes
  );

  const leftTeamKey =
    matchingTeamKey(
      integrity.finalResolution
        .teams,
      leftKeys
    );
  const rightTeamKey =
    matchingTeamKey(
      integrity.finalResolution
        .teams,
      rightKeys
    );

  if (
    !leftTeamKey ||
    !rightTeamKey
  ) {
    reasons.push(
      "frozen_team_key_unavailable"
    );
  }

  return {
    ok:
      reasons.length === 0 &&
      integrity.ok &&
      integrity.winningSide ===
        winningSide,
    winnerSide:
      winningSide,
    reasonCodes: [
      ...new Set(reasons),
    ],
    leftTeamKey,
    rightTeamKey,
  };
}

function blockerMessage(
  code: string
) {
  const messages:
    Record<string, string> = {
      current_roster_incomplete:
        "The current replay roster is incomplete or ambiguous.",
      adjudication_roster_hash_stale:
        "The accepted adjudication no longer matches the replay roster hash.",
      market_roster_hash_mismatch:
        "The frozen market roster hash does not match the final replay.",
      frozen_market_roster_mismatch:
        "The frozen market does not contain the exact final replay roster.",
      adjudication_team_shape_invalid:
        "The accepted adjudication does not contain exactly two complete teams.",
      adjudication_teams_do_not_match_frozen_sides:
        "The accepted teams do not exactly match the two frozen market sides.",
      adjudicated_winner_not_frozen_side:
        "The adjudicated winning team does not map to one frozen market side.",
      market_proposition_snapshot_missing:
        "The market has no frozen proposition hash.",
      market_roster_snapshot_missing:
        "The market has no complete frozen roster snapshots.",
      final_replay_not_betting_eligible:
        "The reviewed result is not eligible for betting reconciliation.",
      market_roster_snapshot_invalid:
        "The frozen market roster cannot be resolved as two confident teams.",
      stored_proposition_hash_mismatch:
        "The stored proposition hash does not match the frozen market roster.",
      final_proposition_hash_mismatch:
        "The approved final teams do not match the frozen market proposition.",
      final_roster_size_mismatch:
        "The final roster size differs from the frozen market.",
      final_roster_identity_mismatch:
        "The final player identities differ from the frozen market.",
      final_winning_team_not_coherent:
        "The approved winner is not coherent across the complete team.",
      winner_string_conflicts_with_winning_team:
        "The winner label conflicts with the approved winning team.",
      frozen_team_key_unavailable:
        "The frozen team identifiers could not be reconstructed safely.",
    };

  return (
    messages[code] ??
    `Market integrity blocked: ${code}.`
  );
}

function activeWager(
  wager: AuthorityWager
) {
  return wager.status === "active";
}

function terminalMoney(
  market: AuthorityMarket
) {
  return (
    Boolean(
      market.voidedAt ||
      market.refundStatus ||
      market.settlementExecutedAt
    ) ||
    market.wagers.some(
      (wager) =>
        Boolean(
          wager.payoutWolo ||
          wager.payoutTxHash ||
          wager.settledAt
        ) ||
        wager.status === "won" ||
        wager.status === "lost" ||
        wager.status === "void"
    )
  );
}

function incidentEvidenceReason(
  evidence: unknown
) {
  if (
    !evidence ||
    typeof evidence !== "object" ||
    Array.isArray(evidence)
  ) {
    return "";
  }

  const reason = (
    evidence as Record<
      string,
      unknown
    >
  ).reason;

  return typeof reason ===
    "string"
    ? reason.trim()
    : "";
}

function recoverableMissingResultIncident(
  incident: {
    incidentType: string;
    evidence: unknown;
  }
) {
  if (
    incident.incidentType !==
    "settlement_integrity_blocked"
  ) {
    return false;
  }

  const reason =
    incidentEvidenceReason(
      incident.evidence
    );

  if (
    reason.startsWith(
      "FINAL_REPLAY_REQUIRED:"
    )
  ) {
    return true;
  }

  const marker =
    " final proposition failed:";
  const markerIndex =
    reason.indexOf(marker);

  if (
    !reason.startsWith(
      "MARKET_INTEGRITY_BLOCKED:"
    ) ||
    markerIndex < 0
  ) {
    return false;
  }

  const reasonCodes =
    reason
      .slice(
        markerIndex +
          marker.length
      )
      .split(",")
      .map((code) =>
        code.trim()
      )
      .filter(Boolean);
  const allowed =
    new Set([
      "final_replay_not_betting_eligible",
      "final_winning_team_not_coherent",
    ]);

  return (
    reasonCodes.length > 0 &&
    reasonCodes.every(
      (code) =>
        allowed.has(code)
    )
  );
}

function rawParserSnapshot(
  game: AuthorityGame
) {
  return jsonInput({
    id: game.id,
    replayHash:
      game.replayHash,
    replayFile:
      game.replay_file,
    originalFilename:
      game.original_filename,
    parseIteration:
      game.parse_iteration,
    parseSource:
      game.parse_source,
    parseReason:
      game.parse_reason,
    isFinal:
      game.is_final,
    winner:
      game.winner,
    players:
      game.players,
    keyEvents:
      game.key_events,
    eventTypes:
      game.event_types,
    map:
      game.map,
    gameType:
      game.game_type,
    gameVersion:
      game.game_version,
    duration:
      game.game_duration ??
      game.duration,
    playedOn:
      game.played_on,
    parserTimestamp:
      game.timestamp,
  });
}

async function requireAdmin(
  prisma: FinancialAuthorityDb,
  viewerUid: string
) {
  const viewer =
    await prisma.user.findUnique({
      where: {
        uid: viewerUid,
      },
      select: {
        id: true,
        uid: true,
        isAdmin: true,
        inGameName: true,
        steamPersonaName: true,
      },
    });

  if (!viewer) {
    fail(
      401,
      "viewer_not_found",
      "Sign in again before authorizing financial reconciliation."
    );
  }

  if (!viewer.isAdmin) {
    fail(
      403,
      "financial_authority_admin_required",
      "Only a site admin can authorize replay evidence for betting reconciliation."
    );
  }

  return viewer;
}

function displayName(
  viewer: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
  }
) {
  return (
    viewer.inGameName ||
    viewer.steamPersonaName ||
    viewer.uid
  );
}

async function buildInternalPlan(
  prisma: FinancialAuthorityDb,
  gameStatsId: number
): Promise<InternalReplayFinancialAuthorityPlan> {
  const [
    game,
    adjudications,
    desync,
    markets,
    directClaims,
  ] =
    await Promise.all([
      prisma.gameStats.findUnique({
        where: {
          id: gameStatsId,
        },
        select: {
          id: true,
          replayHash: true,
          replay_file: true,
          original_filename: true,
          parse_iteration: true,
          parse_source: true,
          parse_reason: true,
          is_final: true,
          winner: true,
          players: true,
          key_events: true,
          event_types: true,
          map: true,
          game_type: true,
          game_version: true,
          duration: true,
          game_duration: true,
          played_on: true,
          timestamp: true,
        },
      }),
      prisma.replayResultAdjudication.findMany({
        where: {
          gameStatsId,
        },
        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        select: {
          id: true,
          actorUserId: true,
          idempotencyKey: true,
          inputHash: true,
          decisionStatus: true,
          actorUidSnapshot: true,
          actorDisplayNameSnapshot:
            true,
          actorRole: true,
          teamAssignments: true,
          winningTeamKey: true,
          winningPlayerKeys: true,
          reason: true,
          evidence: true,
          sourceReplayHash: true,
          sourceParseIteration:
            true,
          sourceRosterHash: true,
          sourcePropositionHash:
            true,
          rawParserSnapshot: true,
          marketSnapshot: true,
          hasLinkedMarket: true,
          financialDisposition:
            true,
          affectsStats: true,
          affectsBets: true,
          createdAt: true,
        },
      }),
      prisma.replayDesyncIncident.findFirst({
        where: {
          gameStatsId,
        },
        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        select: {
          id: true,
          desyncOccurred: true,
        },
      }),
      prisma.betMarket.findMany({
        where: {
          linkedGameStatsId:
            gameStatsId,
        },
        orderBy: {
          id: "asc",
        },
        select: {
          id: true,
          title: true,
          status: true,
          marketType: true,
          leftLabel: true,
          rightLabel: true,
          propositionHash: true,
          sourceRosterHash: true,
          leftRosterSnapshot: true,
          rightRosterSnapshot: true,
          integrityStatus: true,
          integrityReason: true,
          winnerSide: true,
          resolutionReason: true,
          voidedAt: true,
          refundStatus: true,
          settlementStatus: true,
          settlementExecutedAt:
            true,
          seedLeftWolo: true,
          seedRightWolo: true,
          wagers: {
            orderBy: {
              id: "asc",
            },
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
            },
          },
          integrityIncidents: {
            where: {
              status: "open",
            },
            orderBy: {
              id: "asc",
            },
            select: {
              id: true,
              status: true,
              incidentType: true,
              publicSummary: true,
              evidence: true,
            },
          },
        },
      }),
      prisma.pendingWoloClaim.findMany({
        where: {
          sourceGameStatsId:
            gameStatsId,
        },
        orderBy: {
          id: "asc",
        },
        select: {
          id: true,
          sourceMarketId: true,
          amountWolo: true,
          status: true,
          claimKind: true,
          payoutTxHash: true,
          claimedAt: true,
          rescindedAt: true,
        },
      }),
    ]);

  if (!game) {
    fail(
      404,
      "game_not_found",
      "Replay game not found."
    );
  }

  const marketIds =
    markets.map(
      (market) =>
        market.id
    );
  const marketClaims =
    marketIds.length > 0
      ? await prisma.pendingWoloClaim.findMany({
          where: {
            sourceMarketId: {
              in:
                marketIds,
            },
          },
          orderBy: {
            id: "asc",
          },
          select: {
            id: true,
            sourceMarketId:
              true,
            amountWolo:
              true,
            status:
              true,
            claimKind:
              true,
            payoutTxHash:
              true,
            claimedAt:
              true,
            rescindedAt:
              true,
          },
        })
      : [];
  const claims = [
    ...directClaims,
    ...marketClaims,
  ].filter(
    (claim, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.id ===
          claim.id
      ) === index
  );

  const typedAdjudications =
    adjudications as AuthorityAdjudication[];
  const latestOverall =
    typedAdjudications[0] ??
    null;
  const latestAccepted =
    typedAdjudications.find(
      (entry) =>
        entry.decisionStatus ===
        REPLAY_RESULT_ACCEPTED
    ) ??
    null;
  const blockers:
    AuthorityBlocker[] = [];

  if (!game.is_final) {
    blockers.push({
      code:
        "final_replay_required",
      message:
        "Financial authority requires a stored final replay row.",
    });
  }

  if (!latestAccepted) {
    blockers.push({
      code:
        "accepted_adjudication_required",
      message:
        "Lock an accepted complete result before planning betting reconciliation.",
    });
  }

  if (
    latestAccepted &&
    latestOverall?.id !==
      latestAccepted.id
  ) {
    blockers.push({
      code:
        "latest_verdict_not_accepted",
      message:
        "A newer non-accepted verdict exists. Resolve it before authorizing money.",
    });
  }

  if (
    latestAccepted &&
    latestAccepted.sourceReplayHash
      .toLowerCase() !==
      game.replayHash.toLowerCase()
  ) {
    blockers.push({
      code:
        "stale_replay_hash",
      message:
        "The accepted verdict references a different replay hash.",
    });
  }

  if (
    latestAccepted &&
    latestAccepted
      .sourceParseIteration !==
      game.parse_iteration
  ) {
    blockers.push({
      code:
        "stale_parse_iteration",
      message:
        "The replay has a newer parser pass than the accepted verdict.",
    });
  }

  const currentPlayers =
    normalizeReplayPlayers(
      game.players
    );
  const currentRosterHash =
    buildRosterHash(
      currentPlayers
    );

  if (
    latestAccepted &&
    latestAccepted
      .sourceRosterHash !==
      currentRosterHash
  ) {
    blockers.push({
      code:
        "stale_roster_hash",
      message:
        "The accepted verdict does not match the current canonical roster.",
    });
  }

  if (desync?.desyncOccurred) {
    blockers.push({
      code:
        "active_desync_incident",
      message:
        `Desync incident #${desync.id} is active. Winner settlement remains paused.`,
    });
  }

  if (markets.length === 0) {
    blockers.push({
      code:
        "linked_market_required",
      message:
        "No directly linked market exists for this final game.",
    });
  }

  const terminalClaims =
    claims.filter(
      (claim) =>
        Boolean(
          claim.payoutTxHash ||
          claim.claimedAt ||
          claim.rescindedAt
        ) ||
        claim.status ===
          "claimed" ||
        claim.status ===
          "rescinded"
    );

  if (
    terminalClaims.length > 0
  ) {
    blockers.push({
      code:
        "terminal_claim_state",
      message:
        `${terminalClaims.length} linked WOLO claim${terminalClaims.length === 1 ? "" : "s"} already has terminal financial history.`,
    });
  }

  const authorityTeams:
    CanonicalReplayResultTeam[] = [];
  let authorityWinningTeamKey:
    string | null = null;
  const marketRows =
    markets as AuthorityMarket[];
  const marketPlans:
    ReplayFinancialAuthorityPlan["markets"] = [];
  const propositionHashes =
    new Set<string>();
  const recoverableIntegrityIncidentIds:
    number[] = [];

  for (const market of marketRows) {
    const marketBlockers:
      AuthorityBlocker[] = [];

    if (
      market.marketType !==
        "winner"
    ) {
      marketBlockers.push({
        code:
          "winner_market_required",
        message:
          "Only ordinary winner markets can use replay financial authority.",
        marketId:
          market.id,
      });
    }

    const blockingIntegrityIncidents =
      market.integrityIncidents.filter(
        (incident) =>
          !recoverableMissingResultIncident(
            incident
          )
      );
    const recoverableIntegrityIncidents =
      market.integrityIncidents.filter(
        recoverableMissingResultIncident
      );
    recoverableIntegrityIncidentIds.push(
      ...recoverableIntegrityIncidents.map(
        (incident) =>
          incident.id
      )
    );
    const recoverableSettlementReview =
      market.integrityStatus ===
        "under_review" &&
      market.integrityIncidents.length >
        0 &&
      blockingIntegrityIncidents.length ===
        0 &&
      recoverableIntegrityIncidents.length ===
        market.integrityIncidents.length;

    if (
      market.integrityStatus !==
        "verified" &&
      !recoverableSettlementReview
    ) {
      marketBlockers.push({
        code:
          "market_integrity_not_verified",
        message:
          `Market #${market.id} integrity is ${market.integrityStatus}, not verified.`,
        marketId:
          market.id,
      });
    }

    if (
      blockingIntegrityIncidents
        .length > 0
    ) {
      marketBlockers.push({
        code:
          "open_market_integrity_incident",
        message:
          `Market #${market.id} has a non-recoverable open integrity incident.`,
        marketId:
          market.id,
      });
    }

    if (
      market.winnerSide === "left" ||
      market.winnerSide === "right" ||
      terminalMoney(market)
    ) {
      marketBlockers.push({
        code:
          "terminal_market_money",
        message:
          `Market #${market.id} already has terminal result or money state and cannot be rewritten.`,
        marketId:
          market.id,
      });
    }

    if (
      ![
        "awaiting_final_proof",
        "under_review",
      ].includes(
        market.status
      )
    ) {
      marketBlockers.push({
        code:
          "market_liquidity_not_closed",
        message:
          `Market #${market.id} status ${market.status} can still accept or close liquidity. Financial authority requires under-review or closed/final state.`,
        marketId:
          market.id,
      });
    }

    const evaluation =
      latestAccepted
        ? evaluateFrozenReplayMarketAuthority({
            gamePlayers:
              game.players,
            sourceRosterHash:
              latestAccepted
                .sourceRosterHash,
            teamAssignments:
              latestAccepted
                .teamAssignments,
            winningTeamKey:
              latestAccepted
                .winningTeamKey,
            propositionHash:
              market.propositionHash,
            marketSourceRosterHash:
              market.sourceRosterHash,
            leftRosterSnapshot:
              market.leftRosterSnapshot,
            rightRosterSnapshot:
              market.rightRosterSnapshot,
          })
        : {
            ok: false,
            winnerSide: null,
            reasonCodes: [],
            leftTeamKey: null,
            rightTeamKey: null,
          };

    for (
      const code of
      evaluation.reasonCodes
    ) {
      marketBlockers.push({
        code,
        message:
          blockerMessage(code),
        marketId:
          market.id,
      });
    }

    blockers.push(
      ...marketBlockers
    );

    if (
      market.propositionHash
    ) {
      propositionHashes.add(
        market.propositionHash
      );
    }

    if (
      authorityTeams.length === 0 &&
      latestAccepted &&
      evaluation.ok &&
      evaluation.leftTeamKey &&
      evaluation.rightTeamKey &&
      evaluation.winnerSide
    ) {
      const latestTeams =
        assignmentTeams(
          latestAccepted
            .teamAssignments
        );
      const leftKeys =
        playerKeySet(
          market.leftRosterSnapshot
        );
      const rightKeys =
        playerKeySet(
          market.rightRosterSnapshot
        );
      const leftSource =
        latestTeams.find(
          (team) =>
            equalKeys(
              team.keys,
              leftKeys
            )
        );
      const rightSource =
        latestTeams.find(
          (team) =>
            equalKeys(
              team.keys,
              rightKeys
            )
        );

      if (
        leftSource &&
        rightSource
      ) {
        authorityTeams.push(
          {
            teamKey:
              evaluation.leftTeamKey,
            players:
              leftSource
                .players as CanonicalReplayResultTeam["players"],
          },
          {
            teamKey:
              evaluation.rightTeamKey,
            players:
              rightSource
                .players as CanonicalReplayResultTeam["players"],
          }
        );
        authorityWinningTeamKey =
          evaluation.winnerSide ===
          "left"
            ? evaluation.leftTeamKey
            : evaluation.rightTeamKey;
      }
    }

    const active =
      market.wagers.filter(
        activeWager
      );
    marketPlans.push({
      id: market.id,
      title: market.title,
      status: market.status,
      integrityStatus:
        market.integrityStatus,
      propositionHash:
        market.propositionHash,
      leftLabel:
        market.leftLabel,
      rightLabel:
        market.rightLabel,
      winningSide:
        evaluation.winnerSide,
      wagerCount:
        market.wagers.length,
      activeWagerCount:
        active.length,
      totalWolo:
        market.wagers.reduce(
          (total, wager) =>
            total +
            wager.amountWolo,
          0
        ),
      activeWolo:
        active.reduce(
          (total, wager) =>
            total +
            wager.amountWolo,
          0
        ),
      seedWolo:
        market.seedLeftWolo +
        market.seedRightWolo,
      wagers:
        market.wagers.map(
          (wager) => ({
            id: wager.id,
            side: wager.side,
            amountWolo:
              wager.amountWolo,
            status:
              wager.status,
            executionMode:
              wager.executionMode,
            stakeTxHash:
              wager.stakeTxHash,
          })
        ),
    });
  }

  if (
    propositionHashes.size > 1
  ) {
    blockers.push({
      code:
        "linked_market_proposition_conflict",
      message:
        "Linked markets do not share one frozen proposition. Reconcile them individually before authorization.",
    });
  }

  if (
    markets.length > 0 &&
    authorityTeams.length !== 2
  ) {
    blockers.push({
      code:
        "authority_team_projection_unavailable",
      message:
        "The accepted teams could not be projected onto the frozen market identifiers.",
    });
  }

  const wagerCount =
    marketRows.reduce(
      (total, market) =>
        total +
        market.wagers.length,
      0
    );
  const activeWagers =
    marketRows.flatMap(
      (market) =>
        market.wagers.filter(
          activeWager
        )
    );
  const exposure = {
    marketCount:
      marketRows.length,
    wagerCount,
    activeWagerCount:
      activeWagers.length,
    totalWolo:
      marketRows.reduce(
        (total, market) =>
          total +
          market.wagers.reduce(
            (sum, wager) =>
              sum +
              wager.amountWolo,
            0
          ),
        0
      ),
    activeWolo:
      activeWagers.reduce(
        (total, wager) =>
          total +
          wager.amountWolo,
        0
      ),
    seedWolo:
      marketRows.reduce(
        (total, market) =>
          total +
          market.seedLeftWolo +
          market.seedRightWolo,
        0
      ),
    pendingClaimWolo:
      claims
        .filter(
          (claim) =>
            claim.status ===
            "pending"
        )
        .reduce(
          (total, claim) =>
            total +
            claim.amountWolo,
          0
        ),
  };

  const alreadyAuthorized =
    replayResultAdjudicationAuthorizesBets(
      latestAccepted
    );

  if (alreadyAuthorized) {
    blockers.push({
      code:
        "already_financially_authorized",
      message:
        `Adjudication #${latestAccepted?.id} already carries automatic-evidence or explicit betting authority.`,
    });
  }

  const uniqueBlockers =
    blockers.filter(
      (blocker, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.code ===
              blocker.code &&
            candidate.marketId ===
              blocker.marketId
        ) === index
    );
  const marketSnapshot =
    jsonInput({
      markets:
        marketRows,
      claims,
    });
  const fingerprintPayload = {
    game: {
      id: game.id,
      replayHash:
        game.replayHash,
      parseIteration:
        game.parse_iteration,
      rosterHash:
        currentRosterHash,
      isFinal:
        game.is_final,
    },
    adjudication:
      latestAccepted
        ? {
            id:
              latestAccepted.id,
            inputHash:
              latestAccepted
                .inputHash,
            sourceReplayHash:
              latestAccepted
                .sourceReplayHash,
            sourceParseIteration:
              latestAccepted
                .sourceParseIteration,
            sourceRosterHash:
              latestAccepted
                .sourceRosterHash,
            teamAssignments:
              latestAccepted
                .teamAssignments,
            winningTeamKey:
              latestAccepted
                .winningTeamKey,
            winningPlayerKeys:
              latestAccepted
                .winningPlayerKeys,
          }
        : null,
    desync:
      desync
        ? {
            id: desync.id,
            desyncOccurred:
              desync.desyncOccurred,
          }
        : null,
    markets:
      marketRows,
    claims,
  };
  const fingerprint =
    replayFinancialAuthorityFingerprint(
      fingerprintPayload
    );

  return {
    gameStatsId,
    ready:
      uniqueBlockers.length === 0,
    alreadyAuthorized,
    fingerprint,
    confirmationPhrase:
      REPLAY_FINANCIAL_AUTHORITY_CONFIRMATION,
    replay: {
      replayHash:
        game.replayHash,
      parseIteration:
        game.parse_iteration,
      sourceRosterHash:
        currentRosterHash,
      isFinal:
        game.is_final,
    },
    adjudication: {
      id:
        latestAccepted?.id ??
        null,
      actor:
        latestAccepted
          ?.actorDisplayNameSnapshot ??
        null,
      winningTeamKey:
        latestAccepted
          ?.winningTeamKey ??
        null,
      winningPlayerKeys:
        Array.isArray(
          latestAccepted
            ?.winningPlayerKeys
        )
          ? latestAccepted
              .winningPlayerKeys
              .map(String)
              .sort()
          : [],
      affectsBets:
        latestAccepted
          ?.affectsBets === true,
    },
    exposure,
    markets:
      marketPlans,
    blockers:
      uniqueBlockers,
    authorityTeams,
    authorityWinningTeamKey,
    latestAdjudication:
      latestAccepted,
    game:
      game as AuthorityGame,
    marketSnapshot,
    recoverableIntegrityIncidentIds: [
      ...new Set(
        recoverableIntegrityIncidentIds
      ),
    ].sort(
      (left, right) =>
        left - right
    ),
  };
}

function publicPlan(
  plan:
    InternalReplayFinancialAuthorityPlan
): ReplayFinancialAuthorityPlan {
  const {
    authorityTeams:
      authorityTeams,
    authorityWinningTeamKey:
      authorityWinningTeamKey,
    latestAdjudication:
      latestAdjudication,
    game:
      game,
    marketSnapshot:
      marketSnapshot,
    recoverableIntegrityIncidentIds:
      recoverableIntegrityIncidentIds,
    ...safe
  } = plan;

  void authorityTeams;
  void authorityWinningTeamKey;
  void latestAdjudication;
  void game;
  void marketSnapshot;
  void recoverableIntegrityIncidentIds;

  return safe;
}

export async function planReplayFinancialAuthority(
  input: {
    prisma: FinancialAuthorityDb;
    viewerUid: string;
    gameStatsId: number;
  }
) {
  await requireAdmin(
    input.prisma,
    input.viewerUid
  );
  return publicPlan(
    await buildInternalPlan(
      input.prisma,
      input.gameStatsId
    )
  );
}

export async function approveReplayFinancialAuthority(
  input: {
    prisma: PrismaClient;
    viewerUid: string;
    gameStatsId: number;
    expectedFingerprint: string;
    confirmation: string;
  }
) {
  await requireAdmin(
    input.prisma,
    input.viewerUid
  );
  const expectedFingerprint =
    input.expectedFingerprint
      .trim()
      .toLowerCase();

  if (
    !/^[a-f0-9]{64}$/.test(
      expectedFingerprint
    )
  ) {
    fail(
      400,
      "invalid_expected_fingerprint",
      "A complete 64-character plan fingerprint is required."
    );
  }

  if (
    !isReplayFinancialAuthorityConfirmation(
      input.confirmation
    )
  ) {
    fail(
      400,
      "financial_confirmation_required",
      `Type ${REPLAY_FINANCIAL_AUTHORITY_CONFIRMATION} exactly to authorize reconciliation.`
    );
  }

  const idempotencyKey =
    `${AUTHORITY_IDEMPOTENCY_PREFIX}${input.gameStatsId}:${expectedFingerprint}`;

  try {
    const result =
      await input.prisma.$transaction(
        async (tx) => {
          const viewer =
            await requireAdmin(
              tx as unknown as FinancialAuthorityDb,
              input.viewerUid
            );

          await tx.$queryRaw<
            Array<{
              lock_acquired:
                number;
            }>
          >`
            SELECT 1::int AS lock_acquired
            FROM pg_advisory_xact_lock(${input.gameStatsId})
          `;

          const existing =
            await tx.replayResultAdjudication.findUnique({
              where: {
                idempotencyKey,
              },
            });

          if (existing) {
            if (
              existing.gameStatsId !==
                input.gameStatsId ||
              existing.decisionStatus !==
                REPLAY_RESULT_ACCEPTED ||
              existing.affectsBets !==
                true
            ) {
              fail(
                409,
                "financial_idempotency_conflict",
                "That financial authority idempotency key is already bound to another action."
              );
            }

            return {
              adjudication:
                existing,
              created:
                false,
              fingerprint:
                expectedFingerprint,
            };
          }

          /*
           * Wager placement serializes on the BetMarket row, not the
           * GameStats advisory lock. Lock every directly linked market
           * in stable ID order before re-reading wagers and hashing the
           * approval plan so no stake can slip between preview and commit.
           */
          const linkedMarketIds =
            await tx.betMarket.findMany({
              where: {
                linkedGameStatsId:
                  input.gameStatsId,
              },
              orderBy: {
                id: "asc",
              },
              select: {
                id: true,
              },
            });

          for (
            const {
              id,
            } of
            linkedMarketIds
          ) {
            await tx.$queryRaw<
              Array<{
                id: number;
              }>
            >`
              SELECT "id"
              FROM "bet_markets"
              WHERE "id" = ${id}
              FOR UPDATE
            `;
          }

          const plan =
            await buildInternalPlan(
              tx as unknown as FinancialAuthorityDb,
              input.gameStatsId
            );

          if (
            plan.fingerprint !==
            expectedFingerprint
          ) {
            fail(
              409,
              "financial_plan_changed",
              "Replay, roster, market, wager, claim, or integrity state changed. Run a new dry run before authorizing."
            );
          }

          if (!plan.ready) {
            fail(
              409,
              "financial_plan_blocked",
              plan.blockers
                .map(
                  (blocker) =>
                    blocker.message
                )
                .join(" ")
            );
          }

          const latest =
            plan.latestAdjudication;

          if (
            !latest ||
            plan.authorityTeams.length !==
              2 ||
            !plan.authorityWinningTeamKey
          ) {
            fail(
              409,
              "financial_projection_missing",
              "The accepted result cannot be projected onto the exact frozen market proposition."
            );
          }

          const winningTeam =
            plan.authorityTeams.find(
              (team) =>
                team.teamKey ===
                plan.authorityWinningTeamKey
            );

          if (!winningTeam) {
            fail(
              409,
              "financial_winner_projection_missing",
              "The accepted winning team does not match the frozen market."
            );
          }

          const evidence =
            jsonInput({
              kind:
                "admin_financial_authority",
              sourceAdjudicationId:
                latest.id,
              expectedFingerprint,
              confirmation:
                input.confirmation,
              exposure:
                plan.exposure,
              markets:
                plan.markets.map(
                  (market) => ({
                    id:
                      market.id,
                    propositionHash:
                      market.propositionHash,
                    winningSide:
                      market.winningSide,
                    wagerCount:
                      market.wagerCount,
                    activeWolo:
                      market.activeWolo,
                  })
                ),
              recoverableIntegrityIncidentIds:
                plan.recoverableIntegrityIncidentIds,
            });
          const inputHash =
            replayFinancialAuthorityFingerprint({
              sourceAdjudicationId:
                latest.id,
              expectedFingerprint,
              authorityTeams:
                plan.authorityTeams,
              authorityWinningTeamKey:
                plan.authorityWinningTeamKey,
              winningPlayerKeys:
                winningTeam.players
                  .map(
                    (player) =>
                      player.stablePlayerKey
                  )
                  .sort(),
              evidence,
            });
          const adjudication =
            await tx.replayResultAdjudication.create({
              data: {
                gameStatsId:
                  input.gameStatsId,
                actorUserId:
                  viewer.id,
                supersedesId:
                  latest.id,
                idempotencyKey,
                inputHash,
                decisionStatus:
                  REPLAY_RESULT_ACCEPTED,
                actorUidSnapshot:
                  viewer.uid,
                actorDisplayNameSnapshot:
                  displayName(
                    viewer
                  ),
                actorRole:
                  "site_admin",
                teamAssignments:
                  plan.authorityTeams as unknown as Prisma.InputJsonValue,
                winningTeamKey:
                  plan.authorityWinningTeamKey,
                winningPlayerKeys:
                  winningTeam.players
                    .map(
                      (player) =>
                        player.stablePlayerKey
                    )
                    .sort() as Prisma.InputJsonValue,
                reason:
                  latest.reason,
                evidence,
                sourceReplayHash:
                  plan.game.replayHash,
                sourceParseIteration:
                  plan.game
                    .parse_iteration,
                sourceRosterHash:
                  plan.replay
                    .sourceRosterHash as string,
                sourcePropositionHash:
                  plan.markets[0]
                    .propositionHash as string,
                rawParserSnapshot:
                  rawParserSnapshot(
                    plan.game
                  ),
                marketSnapshot:
                  jsonInput({
                    authorizedAt:
                      new Date(),
                    expectedFingerprint,
                    exposure:
                      plan.exposure,
                    snapshot:
                      plan.marketSnapshot,
                  }),
                hasLinkedMarket:
                  true,
                financialDisposition:
                  "operator_review_required",
                affectsStats:
                  true,
                affectsBets:
                  true,
              },
            });

          return {
            adjudication,
            created: true,
            fingerprint:
              expectedFingerprint,
          };
        }
      );

    return result;
  } catch (error) {
    if (
      error instanceof
      ReplayResultReviewError
    ) {
      throw new ReplayFinancialAuthorityError(
        error.status,
        error.code,
        error.message
      );
    }

    throw error;
  }
}
