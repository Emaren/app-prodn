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
   * Current human-confirmed desync truth resolves YES
   * independently of the competitive winner proposition.
   */
  if (
    input.desyncOccurred
  ) {
    return "right";
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
