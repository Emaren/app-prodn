export const RADIO_WOLO_VISIT_LEADERBOARD_THRESHOLD = 5;

export type AdminRadioWoloRankableVisitor = {
  activeOnSite: boolean;
  identityKind: "user" | "anonymous";
  visitCount: number;
  lastSeenAt: string;
};

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

export function compareAdminRadioWoloVisitors(
  left: AdminRadioWoloRankableVisitor,
  right: AdminRadioWoloRankableVisitor,
) {
  if (left.activeOnSite !== right.activeOnSite) {
    return left.activeOnSite ? -1 : 1;
  }

  if (left.activeOnSite && right.activeOnSite) {
    return timestamp(right.lastSeenAt) - timestamp(left.lastSeenAt);
  }

  const leftVisitRanked =
    left.identityKind === "user" ||
    left.visitCount >= RADIO_WOLO_VISIT_LEADERBOARD_THRESHOLD;
  const rightVisitRanked =
    right.identityKind === "user" ||
    right.visitCount >= RADIO_WOLO_VISIT_LEADERBOARD_THRESHOLD;

  if (leftVisitRanked !== rightVisitRanked) {
    return leftVisitRanked ? -1 : 1;
  }

  if (
    leftVisitRanked &&
    rightVisitRanked &&
    left.visitCount !== right.visitCount
  ) {
    return right.visitCount - left.visitCount;
  }

  return timestamp(right.lastSeenAt) - timestamp(left.lastSeenAt);
}
