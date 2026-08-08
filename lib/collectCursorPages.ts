export async function collectCursorPages<T extends { id: number }>(
  pageSize: number,
  readPage: (cursorId: number | null) => Promise<T[]>,
  maxRows = 250_000,
) {
  const boundedPageSize = Math.max(1, Math.trunc(pageSize));
  const boundedMaximum = Math.max(boundedPageSize, Math.trunc(maxRows));
  const rows: T[] = [];
  let cursorId: number | null = null;

  while (true) {
    const page = await readPage(cursorId);
    rows.push(...page);
    if (rows.length > boundedMaximum) {
      throw new Error(
        `Cursor ledger exceeded the ${boundedMaximum.toLocaleString()}-row reconciliation fence.`,
      );
    }
    if (page.length < boundedPageSize) return rows;
    const nextCursorId = page[page.length - 1]?.id ?? null;
    if (nextCursorId === null) return rows;
    if (cursorId !== null && nextCursorId <= cursorId) {
      throw new Error("Cursor ledger page did not advance its reconciliation cursor.");
    }
    cursorId = nextCursorId;
  }
}
