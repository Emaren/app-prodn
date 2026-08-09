export function sliceVisibleOffsetPage<T>({
  isVisible,
  limit,
  offset,
  rows,
}: {
  isVisible: (row: T) => boolean;
  limit: number;
  offset: number;
  rows: T[];
}) {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.max(0, Math.floor(limit));

  return rows
    .filter(isVisible)
    .slice(safeOffset, safeOffset + safeLimit);
}
