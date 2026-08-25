export function warGraphFossilizationStage(dormantNights: number): number {
  if (!Number.isSafeInteger(dormantNights) || dormantNights <= 0) return 0;
  if (dormantNights === 1) return 1;
  if (dormantNights === 2) return 2;
  if (dormantNights === 3) return 3;
  if (dormantNights <= 6) return 4;
  if (dormantNights <= 13) return 5;
  return 6;
}

export function participatedDuringWarGraphDay(
  membership: {
    lastParticipationAt: Date | null;
    presence: {
      graphSeenAt: Date | null;
      watcherSeenAt: Date | null;
    } | null;
  },
  opensAt: Date,
  closesAt: Date,
): boolean {
  return [
    membership.lastParticipationAt,
    membership.presence?.graphSeenAt,
    membership.presence?.watcherSeenAt,
  ].some((value) => Boolean(value && value >= opensAt && value < closesAt));
}

export const warGraphFossilizationInternals = {
  participatedDuringWarGraphDay,
};
