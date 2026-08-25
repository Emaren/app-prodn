import { createHash } from "node:crypto";

export type WarGraphGravityCandidate = {
  membershipId: number;
  membershipPublicId: string;
  lastParticipationAt: Date | null;
  verifiedGamesPlayed: number;
  occupiedAt: Date;
  lastGravityAt: Date | null;
};

function gravityTieKey(
  nightId: number,
  targetNodePublicId: string,
  membershipPublicId: string,
): string {
  return createHash("sha256")
    .update("aoe2war-wargraph-gravity-tie/v1\n")
    .update(String(nightId))
    .update("\n")
    .update(targetNodePublicId)
    .update("\n")
    .update(membershipPublicId)
    .digest("hex");
}

function descendingTimestamp(left: Date | null, right: Date | null): number {
  const leftTime = left?.getTime() ?? null;
  const rightTime = right?.getTime() ?? null;
  if (leftTime === rightTime) return 0;
  if (leftTime === null) return 1;
  if (rightTime === null) return -1;
  return rightTime - leftTime;
}

function ascendingTimestamp(left: Date | null, right: Date | null): number {
  const leftTime = left?.getTime() ?? null;
  const rightTime = right?.getTime() ?? null;
  if (leftTime === rightTime) return 0;
  if (leftTime === null) return -1;
  if (rightTime === null) return 1;
  return leftTime - rightTime;
}

/** Constitutional priority with a deterministic, non-client-controlled tie. */
export function rankWarGraphGravityCandidates(
  candidates: readonly WarGraphGravityCandidate[],
  input: { nightId: number; targetNodePublicId: string },
): WarGraphGravityCandidate[] {
  return [...candidates].sort((left, right) => {
    const participation = descendingTimestamp(
      left.lastParticipationAt,
      right.lastParticipationAt,
    );
    if (participation !== 0) return participation;
    if (left.verifiedGamesPlayed !== right.verifiedGamesPlayed) {
      return right.verifiedGamesPlayed - left.verifiedGamesPlayed;
    }
    const stranded = left.occupiedAt.getTime() - right.occupiedAt.getTime();
    if (stranded !== 0) return stranded;
    const gravity = ascendingTimestamp(left.lastGravityAt, right.lastGravityAt);
    if (gravity !== 0) return gravity;
    const leftTie = gravityTieKey(
      input.nightId,
      input.targetNodePublicId,
      left.membershipPublicId,
    );
    const rightTie = gravityTieKey(
      input.nightId,
      input.targetNodePublicId,
      right.membershipPublicId,
    );
    return leftTie.localeCompare(rightTie) || left.membershipId - right.membershipId;
  });
}

export const warGraphGravityContractInternals = { gravityTieKey };
