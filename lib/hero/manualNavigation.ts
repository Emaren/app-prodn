// Manual navigation must follow the requested cursor, not the most recently
// decoded image. Rapid clicks can skip unread images without losing intent.
export function nextHeroRequestedIndex(
  requestedIndex: number,
  direction: number,
  count: number,
): number {
  if (!Number.isInteger(count) || count <= 1) return 0;
  const safeIndex = Number.isInteger(requestedIndex)
    ? ((requestedIndex % count) + count) % count
    : 0;
  const step = direction < 0 ? -1 : 1;
  return (safeIndex + step + count) % count;
}
