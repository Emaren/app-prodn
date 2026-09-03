import type {
  Prisma,
} from "@/lib/generated/prisma";

import {
  WINNER_MARKET_TYPE,
} from "@/lib/desyncSideMarket";

export type FreshBetMarketLike = {
  status?: unknown;
  marketType?: unknown;
  closeAt?: Date | string | null;
  linkedSessionKey?: string | null;
  scheduledMatchId?: number | null;
};

export type FreshBettingCloseReason =
  | "market_not_open"
  | "market_type_not_wagerable"
  | "watcher_battle_already_started"
  | "scheduled_cutoff_missing"
  | "scheduled_cutoff_invalid"
  | "scheduled_cutoff_reached";

function normalizedText(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

function readTimestamp(
  value:
    | Date
    | string
    | null
    | undefined,
) {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return Date.parse(value);
  }

  return Number.NaN;
}

function hasScheduledMatchIdentity(
  value: unknown,
) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  );
}

/**
 * Canonical V1 law for admitting a NEW financial commitment.
 *
 * - Fresh competitive betting is pre-game only.
 * - Watcher-discovered unscheduled battles are already underway by the
 *   time their market exists, so they cannot accept fresh stakes.
 * - Desync side markets are currently born only from live watcher battles
 *   and therefore cannot accept fresh stakes in V1.
 * - Scheduled markets must have a real cutoff and must be strictly before it.
 * - Plain manual/static open markets may remain open without closeAt.
 *
 * Post-broadcast recovery is deliberately NOT represented here. Recovery
 * is a separate rail for a pre-cutoff intent whose bound chain transfer
 * lands inside the narrowly bounded inclusion tolerance.
 */
export function freshBettingCloseReason(
  market:
    | FreshBetMarketLike
    | null
    | undefined,
  now = new Date(),
): FreshBettingCloseReason | null {
  if (!market) {
    return "market_not_open";
  }

  if (
    normalizedText(
      market.marketType,
    ) !==
    normalizedText(
      WINNER_MARKET_TYPE,
    )
  ) {
    return "market_type_not_wagerable";
  }

  const linkedSessionKey =
    typeof market.linkedSessionKey ===
      "string"
      ? market.linkedSessionKey.trim()
      : "";

  const hasScheduledMatch =
    hasScheduledMatchIdentity(
      market.scheduledMatchId,
    );

  /*
   * A watcher session is discovered from an underway battle. Without a
   * scheduled-match identity there was no authoritative pre-game betting
   * phase to preserve.
   */
  if (
    linkedSessionKey &&
    !hasScheduledMatch
  ) {
    return "watcher_battle_already_started";
  }

  if (
    normalizedText(
      market.status,
    ) !== "open"
  ) {
    return "market_not_open";
  }

  const closeAt =
    readTimestamp(
      market.closeAt,
    );

  if (hasScheduledMatch) {
    if (
      market.closeAt === null ||
      market.closeAt === undefined
    ) {
      return "scheduled_cutoff_missing";
    }

    if (
      !Number.isFinite(closeAt)
    ) {
      return "scheduled_cutoff_invalid";
    }

    if (
      now.getTime() >= closeAt
    ) {
      return "scheduled_cutoff_reached";
    }
  } else if (
    market.closeAt !== null &&
    market.closeAt !== undefined
  ) {
    if (
      !Number.isFinite(closeAt)
    ) {
      return "scheduled_cutoff_invalid";
    }

    if (
      now.getTime() >= closeAt
    ) {
      return "scheduled_cutoff_reached";
    }
  }

  return null;
}

export function isFreshBetMarketWagerable(
  market:
    | FreshBetMarketLike
    | null
    | undefined,
  now = new Date(),
) {
  return (
    freshBettingCloseReason(
      market,
      now,
    ) === null
  );
}

/**
 * Database-side equivalent of the fresh commitment law.
 *
 * This exists because a JS preflight is not enough for money. The final
 * transactional write must independently prove that the market is still
 * pre-game at the instant the wager is admitted.
 */
export function buildFreshBetMarketWriteWhere(
  now = new Date(),
): Prisma.BetMarketWhereInput {
  return {
    status: "open",

    /*
     * Current Desync markets are created only after watcher gameplay has
     * begun. They are evidence surfaces in V1, not fresh money markets.
     */
    marketType:
      WINNER_MARKET_TYPE,

    OR: [
      /*
       * Scheduled market: the authoritative start clock is mandatory and
       * must still be strictly in the future.
       */
      {
        scheduledMatchId: {
          not: null,
        },
        closeAt: {
          gt: now,
        },
      },

      /*
       * Manual/static market: no watcher-live identity is allowed. An
       * explicit closeAt, when present, is still authoritative.
       */
      {
        scheduledMatchId:
          null,
        linkedSessionKey:
          null,
        OR: [
          {
            closeAt: null,
          },
          {
            closeAt: {
              gt: now,
            },
          },
        ],
      },
    ],
  };
}
