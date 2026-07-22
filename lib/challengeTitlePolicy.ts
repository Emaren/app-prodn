export const TITLE_CHALLENGE_ACCEPTANCE_WINDOW_HOURS = 7 * 24;

export const TITLE_RESULT_REVIEW_STATUS = "commissioner_review";
export const TITLE_RESULT_REVIEW_SETTLEMENT_STATUS = "commissioner_review_required";
export const TITLE_FORFEIT_REVIEW_STATUS = "forfeit_pending_commissioner";
export const TITLE_FORFEIT_REVIEW_SETTLEMENT_STATUS = "commissioner_forfeit_review_required";

export const TERMINAL_TITLE_CHALLENGE_STATUSES = [
  "settled",
  "cancelled",
  "canceled",
  "disputed",
  "commissioner_vetoed",
] as const;

export function buildTitleChallengeAcceptBy(
  createdAt = new Date(),
  exactMatchTime?: Date | null
) {
  const titleDeadline = new Date(
    createdAt.getTime() + TITLE_CHALLENGE_ACCEPTANCE_WINDOW_HOURS * 60 * 60 * 1000
  );

  if (
    exactMatchTime &&
    !Number.isNaN(exactMatchTime.getTime()) &&
    exactMatchTime.getTime() < titleDeadline.getTime()
  ) {
    return new Date(exactMatchTime);
  }

  return titleDeadline;
}

export function unacceptedTitleExpiryNeedsCommissionerReview(input: {
  expiryKind: "expired" | "funding_expired";
  acceptedAt: Date | null;
  linkedTitleCount: number;
}) {
  return (
    input.expiryKind === "expired" &&
    input.acceptedAt === null &&
    input.linkedTitleCount > 0
  );
}
