export const PLAYER_MATCH_FEED_RECONCILE_BATCH_SIZE = 512;

export function playerMatchFeedRefreshDepth({
  currentlyLoaded,
  initialWindow,
  nextTotal,
  previousTotal,
}: {
  currentlyLoaded: number;
  initialWindow: number;
  nextTotal: number;
  previousTotal: number;
}) {
  const safeNextTotal = Math.max(0, Math.floor(nextTotal));
  const newlyInsertedRows = Math.max(
    0,
    safeNextTotal - Math.max(0, Math.floor(previousTotal)),
  );

  return Math.min(
    safeNextTotal,
    Math.max(
      Math.max(0, Math.floor(initialWindow)),
      Math.max(0, Math.floor(currentlyLoaded)) + newlyInsertedRows,
    ),
  );
}

export function playerMatchFeedNextCursor(
  loadedRows: number,
  totalRows: number,
) {
  const safeLoadedRows = Math.max(0, Math.floor(loadedRows));
  const safeTotalRows = Math.max(0, Math.floor(totalRows));

  return safeLoadedRows < safeTotalRows
    ? safeLoadedRows
    : null;
}
