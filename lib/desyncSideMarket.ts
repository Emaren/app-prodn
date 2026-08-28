export const WINNER_MARKET_TYPE =
  "winner" as const;

export const DESYNC_SIDE_MARKET_TYPE =
  "desync" as const;

export const DESYNC_SIDE_MARKET_LEFT_LABEL =
  "NO" as const;

export const DESYNC_SIDE_MARKET_RIGHT_LABEL =
  "YES" as const;

export const DEFAULT_DESYNC_MARKET_REVIEW_GRACE_MINUTES =
  10;

const DESYNC_SLUG_PREFIX =
  "desync-";

export function isDesyncSideMarketType(
  value: string | null | undefined
) {
  return value === DESYNC_SIDE_MARKET_TYPE;
}

export function buildDesyncSideMarketSlug(
  winnerMarketSlug: string
) {
  const clean =
    winnerMarketSlug
      .trim()
      .replace(
        /^desync-/,
        ""
      );

  return `${DESYNC_SLUG_PREFIX}${clean}`
    .slice(
      0,
      180
    );
}

export function winnerSlugFromDesyncSideMarketSlug(
  desyncMarketSlug: string
) {
  const clean =
    desyncMarketSlug.trim();

  if (
    !clean.startsWith(
      DESYNC_SLUG_PREFIX
    )
  ) {
    return null;
  }

  return (
    clean.slice(
      DESYNC_SLUG_PREFIX.length
    ) || null
  );
}

export type DesyncSideMarketLink = {
  id: number;
  parentMarketId?: number | null;
  slug: string;
  marketType: string;
  linkedSessionKey?: string | null;
};

/**
 * Project desync propositions as children of their winner proposition.
 *
 * Database rows remain separate because each proposition has its own pools,
 * wagers, truth gate, and settlement. The public board is deliberately not
 * flat: a desync row is reachable only through the matching winner market.
 * Explicit parent ids win, deterministic slugs repair older rows, and session
 * fallback is accepted only when the session has exactly one winner and one
 * desync proposition. Ambiguous children fail closed and never become a
 * top-level book.
 */
export function nestDesyncSideMarkets<
  T extends DesyncSideMarketLink,
>(
  markets: readonly T[]
): Array<T & { desyncMarket: T | null }> {
  const winnerMarkets = markets.filter(
    (market) => market.marketType === WINNER_MARKET_TYPE
  );
  const desyncMarkets = markets.filter(
    (market) => isDesyncSideMarketType(market.marketType)
  );
  const winnerById = new Map(
    winnerMarkets.map((market) => [market.id, market] as const)
  );
  const winnerBySlug = new Map(
    winnerMarkets.map((market) => [market.slug, market] as const)
  );
  const winnersBySession = new Map<string, T[]>();
  const desyncsBySession = new Map<string, T[]>();

  for (const market of winnerMarkets) {
    const sessionKey = market.linkedSessionKey?.trim();
    if (!sessionKey) continue;
    const bucket = winnersBySession.get(sessionKey) ?? [];
    bucket.push(market);
    winnersBySession.set(sessionKey, bucket);
  }

  for (const market of desyncMarkets) {
    const sessionKey = market.linkedSessionKey?.trim();
    if (!sessionKey) continue;
    const bucket = desyncsBySession.get(sessionKey) ?? [];
    bucket.push(market);
    desyncsBySession.set(sessionKey, bucket);
  }

  const desyncByWinnerId = new Map<number, T>();
  const link = (winner: T | undefined, desync: T) => {
    if (!winner || desyncByWinnerId.has(winner.id)) return;
    desyncByWinnerId.set(winner.id, desync);
  };

  for (const desync of [...desyncMarkets].sort((left, right) => left.id - right.id)) {
    const explicitParent =
      typeof desync.parentMarketId === "number"
        ? winnerById.get(desync.parentMarketId)
        : undefined;
    if (explicitParent) {
      link(explicitParent, desync);
      continue;
    }

    const winnerSlug = winnerSlugFromDesyncSideMarketSlug(desync.slug);
    const slugParent = winnerSlug ? winnerBySlug.get(winnerSlug) : undefined;
    if (slugParent) {
      link(slugParent, desync);
      continue;
    }

    const sessionKey = desync.linkedSessionKey?.trim();
    if (!sessionKey) continue;
    const sessionWinners = winnersBySession.get(sessionKey) ?? [];
    const sessionDesyncs = desyncsBySession.get(sessionKey) ?? [];
    if (sessionWinners.length === 1 && sessionDesyncs.length === 1) {
      link(sessionWinners[0], desync);
    }
  }

  return winnerMarkets.map((market) => ({
    ...market,
    desyncMarket: desyncByWinnerId.get(market.id) ?? null,
  }));
}

export function desyncReviewDeadlineMs(
  parentSettledAtMs: number,
  reviewGraceMinutes:
    number =
      DEFAULT_DESYNC_MARKET_REVIEW_GRACE_MINUTES
) {
  const minutes =
    Math.max(
      1,
      Math.floor(
        reviewGraceMinutes
      )
    );

  return (
    parentSettledAtMs +
    minutes * 60_000
  );
}

export function resolveDesyncSideMarketWinner(
  input: {
    desyncOccurred:
      boolean;

    humanDesyncDecisionPresent?:
      boolean;

    parentStatus:
      string | null | undefined;

    parentWinnerSide:
      string | null | undefined;

    parentSettledAtMs:
      number | null | undefined;

    nowMs:
      number;

    reviewGraceMinutes?:
      number;
  }
):
  | "left"
  | "right"
  | null {
  /*
   * RIGHT = YES.
   *
   * Current human-confirmed desync truth resolves YES independently of the
   * competitive winner proposition. An explicit human correction to false is
   * equally authoritative and resolves NO immediately. This presence bit is
   * what keeps an explicit false decision distinct from no incident at all.
   */
  if (
    input.desyncOccurred
  ) {
    return "right";
  }

  if (
    input.humanDesyncDecisionPresent
  ) {
    return "left";
  }

  /*
   * LEFT = NO.
   *
   * Mere absence of a human desync incident is never enough
   * to resolve NO.
   */
  if (
    input.parentStatus !==
      "settled" ||
    (
      input.parentWinnerSide !==
        "left" &&
      input.parentWinnerSide !==
        "right"
    ) ||
    typeof input.parentSettledAtMs !==
      "number"
  ) {
    return null;
  }

  const deadline =
    desyncReviewDeadlineMs(
      input.parentSettledAtMs,
      input.reviewGraceMinutes
    );

  if (
    input.nowMs <
    deadline
  ) {
    return null;
  }

  return "left";
}
