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
 * - Scheduled competitive betting remains pre-game only.
 * - Unscheduled watcher winner markets are compatibility live books and may
 *   accept fresh stakes while the market remains authoritatively open/live.
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

  const status =
    normalizedText(
      market.status,
    );

  const unscheduledWatcherWinner =
    Boolean(
      linkedSessionKey &&
      !hasScheduledMatch,
    );

  /*
   * Compatibility bridge:
   *
   * An unscheduled watcher winner market does not exist before the Watcher
   * discovers the battle. It may therefore accept fresh bets while the
   * canonical market itself remains open/live.
   *
   * Scheduled markets retain their stricter pre-game start fence below.
   */
  if (
    unscheduledWatcherWinner
  ) {
    if (
      status !== "open" &&
      status !== "live"
    ) {
      return "market_not_open";
    }
  } else if (
    status !== "open"
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
    /*
     * Desync remains outside fresh-money admission. Winner books alone
     * participate in this compatibility bridge.
     */
    marketType:
      WINNER_MARKET_TYPE,

    OR: [
      /*
       * Scheduled/challenge book:
       * open only and strictly before its authoritative cutoff.
       */
      {
        status:
          "open",
        scheduledMatchId: {
          not: null,
        },
        closeAt: {
          gt: now,
        },
      },

      /*
       * Manual/static winner book:
       * no watcher identity and open only.
       */
      {
        status:
          "open",
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

      /*
       * Unscheduled Watcher winner compatibility book:
       * admission exists only while the canonical battle market remains
       * open/live. An explicit closeAt, if one exists, is still honored.
       */
      {
        status: {
          in: [
            "open",
            "live",
          ],
        },
        scheduledMatchId:
          null,
        linkedSessionKey: {
          not: null,
        },
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
