export type ListRowWithId = {
  id: number;
};

export function appendUniqueRowsById<T extends ListRowWithId>(
  current: T[],
  incoming: T[],
) {
  const seen = new Set<number>();

  return [...current, ...incoming].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

/**
 * Replace the previously fetched leading window with the latest server window.
 *
 * Fresh rows always win for a repeated ID, rows removed from the leading window
 * disappear, and explicitly loaded older pages remain behind the new window.
 */
export function replaceAuthoritativeListWindow<T extends ListRowWithId>(
  current: T[],
  previousWindowIds: ReadonlySet<number>,
  latestWindow: T[],
) {
  const latestIds = new Set(latestWindow.map((row) => row.id));
  const preservedOlderRows = current.filter(
    (row) =>
      !previousWindowIds.has(row.id) &&
      !latestIds.has(row.id),
  );

  return appendUniqueRowsById(latestWindow, preservedOlderRows);
}

export function authoritativePrefixDepthThroughTail<
  T extends ListRowWithId,
>(
  current: T[],
  refreshedPrefix: T[],
  minimumDepth = 0,
) {
  const safeMinimumDepth = Math.max(0, Math.floor(minimumDepth));
  const currentTailId = current.at(-1)?.id;
  const tailIndex = currentTailId === undefined
    ? -1
    : refreshedPrefix.findIndex((row) => row.id === currentTailId);
  const desiredDepth = tailIndex >= 0
    ? tailIndex + 1
    : current.length;

  return Math.min(
    refreshedPrefix.length,
    Math.max(safeMinimumDepth, desiredDepth),
  );
}
