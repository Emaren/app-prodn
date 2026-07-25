import { normalizePublicReplayText } from "./unresolvedWatcherResult.ts";
import type {
  Prisma,
  PrismaClient,
} from "./generated/prisma/index.js";
import {
  applyReplayResultAdjudication,
  type EffectiveReplayResultAdjudication,
} from "./replayResultAdjudications.ts";

export type ReplayAdjudication = {
  gameStatsId: number;
  winner: string;
  source: "commissioner_review";
  adjudicatedBy: string;
  reason: string;
  affectsStats: boolean;
  affectsBets: boolean;
  linkedMarketId?: number;
  settlementNote?: string;
};

const REPLAY_ADJUDICATIONS: ReplayAdjudication[] = [
  {
    gameStatsId: 10252,
    winner: "Emaren",
    source: "commissioner_review",
    adjudicatedBy: "Emaren",
    reason:
      "Commissioner verified Emaren defeated Tell3z. Parser proof was incomplete and the prior uploader-opponent inference was rejected.",
    affectsStats: true,
    affectsBets: false,
    linkedMarketId: 236955,
    settlementNote:
      "Linked market was already settled from rejected parser inference. This overlay does not mutate wagers, markets, claims, or settlement history.",
  },
];

export const EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION = {
  where: { decisionStatus: "accepted" },
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  take: 1,
  select: {
    id: true,
    decisionStatus: true,
    affectsStats: true,
    affectsBets: true,
    actorDisplayNameSnapshot: true,
    actorRole: true,
    teamAssignments: true,
    winningTeamKey: true,
    winningPlayerKeys: true,
    reason: true,
    sourceReplayHash: true,
    sourceParseIteration: true,
    sourceRosterHash: true,
    sourcePropositionHash: true,
    createdAt: true,
  },
} satisfies Prisma.GameStats$replayResultAdjudicationsArgs;

function readId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

function readPlayers(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
    );
  }

  if (typeof value === "string") {
    try {
      return readPlayers(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

export function getReplayAdjudicationForGameStatsId(id: unknown) {
  const gameStatsId = readId(id);
  if (gameStatsId === null) return null;
  return REPLAY_ADJUDICATIONS.find((entry) => entry.gameStatsId === gameStatsId) ?? null;
}

export function listReplayAdjudications() {
  return [...REPLAY_ADJUDICATIONS];
}

export function resolveReplayAdjudicatedWinner(row: { id?: unknown }) {
  return getReplayAdjudicationForGameStatsId(row.id)?.winner ?? null;
}

export function hasReplayAdjudication(row: { id?: unknown }) {
  return Boolean(getReplayAdjudicationForGameStatsId(row.id));
}

export function applyReplayAdjudicationToGameStats<T extends object>(row: T): T {
  const source = row as Record<string, unknown>;
  const durableEntries = Array.isArray(source["replayResultAdjudications"])
    ? (source["replayResultAdjudications"] as EffectiveReplayResultAdjudication[])
    : [];
  const durableAdjudication = durableEntries.find(
    (entry) => entry?.decisionStatus === "accepted"
  );
  if (durableAdjudication) {
    return applyReplayResultAdjudication(row, durableAdjudication);
  }

  const adjudication = getReplayAdjudicationForGameStatsId(source["id"]);
  if (!adjudication) return row;

  const next: Record<string, unknown> = { ...source };
  const originalWinner = source["winner"];
  const originalParseReason = source["parse_reason"] ?? source["parseReason"];
  const originalParseSource = source["parse_source"] ?? source["parseSource"];

  next["winner"] = adjudication.winner;
  next["parse_reason"] = "manual_recovery";
  next["parseReason"] = "manual_recovery";
  next["parse_source"] = "commissioner_review";
  next["parseSource"] = "commissioner_review";
  next["unresolvedResult"] = null;
  next["replayAdjudication"] = {
    ...adjudication,
    originalWinner,
    originalParseReason,
    originalParseSource,
  };

  const players = readPlayers(source["players"]);
  if (players.length > 0) {
    next["players"] = players.map((player) => {
      const name = normalizePublicReplayText(player.name);
      return {
        ...player,
        winner: name ? name.toLowerCase() === adjudication.winner.toLowerCase() : null,
      };
    });
  }

  const keyEvents = readRecord(source["key_events"] ?? source["keyEvents"]);
  if (Object.keys(keyEvents).length > 0 || source["key_events"] !== undefined || source["keyEvents"] !== undefined) {
    const commissionerAdjudication = {
      winner: adjudication.winner,
      source: adjudication.source,
      adjudicated_by: adjudication.adjudicatedBy,
      affects_stats: adjudication.affectsStats,
      affects_bets: adjudication.affectsBets,
      reason: adjudication.reason,
      original_winner: originalWinner,
      original_parse_reason: originalParseReason,
      original_parse_source: originalParseSource,
    };
    next["key_events"] = {
      ...keyEvents,
      commissioner_adjudication: commissionerAdjudication,
    };
    next["keyEvents"] = next["key_events"];
  }

  return next as T;
}

export function applyReplayAdjudicationsToGameStatsRows<T extends object>(
  rows: T[]
): T[] {
  return rows.map((row) => applyReplayAdjudicationToGameStats(row));
}


type ReplayAdjudicationHydrationPrisma = PrismaClient;

function replayGameStatsId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

/**
 * Backend /api/game_stats responses are plain JSON and cannot contain
 * local Prisma relations. Public projection needs the latest accepted
 * durable adjudication attached before applyReplayAdjudicationToGameStats()
 * can project reviewed winner truth.
 *
 * This helper enriches rows only. It never mutates parser evidence,
 * markets, wagers, claims, settlements, or chain state.
 */
export async function hydrateEffectiveReplayResultAdjudications<
  T extends object
>(
  prisma: ReplayAdjudicationHydrationPrisma,
  rows: T[]
): Promise<T[]> {
  const ids = [
    ...new Set(
      rows
        .map((row) =>
          replayGameStatsId(
            (row as Record<string, unknown>)["id"]
          )
        )
        .filter((id): id is number => id !== null)
    ),
  ];

  if (ids.length === 0) return rows;

  const hydrated = await prisma.gameStats.findMany({
    where: {
      id: {
        in: ids,
      },
    },
    select: {
      id: true,
      replayResultAdjudications:
        EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
    },
  });

  const adjudicationsByGameId = new Map(
    hydrated.map((entry) => [
      entry.id,
      entry.replayResultAdjudications,
    ])
  );

  return rows.map((row) => {
    const source = row as Record<string, unknown>;
    const id = replayGameStatsId(source["id"]);

    if (id === null) return row;

    const replayResultAdjudications =
      adjudicationsByGameId.get(id);

    if (!replayResultAdjudications) return row;

    return {
      ...source,
      replayResultAdjudications,
    } as T;
  });
}
