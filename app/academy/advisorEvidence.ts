/**
 * Display only measurements whose underlying replay-snapshot count was read.
 * Prisma's count is a row count, not a Steam win/loss or ELO authority.
 */
export function formatAcademyReplayEvidence(count: number | null): string {
  if (count === null || !Number.isSafeInteger(count) || count < 0) {
    return "Replay evidence unavailable";
  }

  return `${count.toLocaleString("en-CA")} accepted replay snapshots`;
}
