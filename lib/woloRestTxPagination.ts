/**
 * Native wolo-1 Cosmos REST uses unprefixed page=N&limit=100.
 * It ignores pagination.offset and pagination.page. Fail closed on repeated
 * pages, truncated responses, malformed counts and upstream errors.
 * The caller must finish all searches successfully before any DB mutation.
 */
export type CosmosRestPage<T> = {
  code?: number | string;
  message?: string;
  tx_responses?: T[];
  pagination?: { total?: string };
};

export async function collectPagedCosmosRestTxs<T extends { txhash?: string }>({
  restUrl,
  query,
  limit,
  maxLimit,
  pageSize = 100,
  fetchPage,
}: {
  restUrl: string;
  query: string;
  limit: number;
  maxLimit: number;
  pageSize?: number;
  fetchPage: (url: string) => Promise<CosmosRestPage<T>>;
}): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize !== 100 ||
      !Number.isSafeInteger(maxLimit) || maxLimit < 1 ||
      !Number.isFinite(limit) || limit < 1) {
    throw new Error("WOLO_REST_PAGINATION_LIMIT_INVALID");
  }
  const requested = Math.max(1, Math.min(maxLimit, Math.floor(limit)));
  const found: T[] = [];
  const seen = new Set<string>();
  let observedTotal: number | null = null;
  const maxPages = Math.ceil(requested / pageSize);

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      query,
      order_by: "ORDER_BY_DESC",
      page: String(page),
      limit: String(pageSize),
    });
    const payload = await fetchPage(
      `${restUrl.replace(/\/+$/, "")}/cosmos/tx/v1beta1/txs?${params}`
    );
    if (!payload || typeof payload !== "object" ||
        (payload.code !== undefined && String(payload.code) !== "0") ||
        !Array.isArray(payload.tx_responses)) {
      throw new Error("WOLO_REST_TX_PAGE_INVALID");
    }
    const rows = payload.tx_responses;
    if (rows.length > pageSize) {
      throw new Error("WOLO_REST_TX_PAGE_OVERSIZE");
    }
    const total = payload.pagination?.total;
    if (total !== undefined) {
      if (!/^(0|[1-9][0-9]*)$/.test(total)) {
        throw new Error("WOLO_REST_TX_TOTAL_INVALID");
      }
      const parsed = Number(total);
      if (!Number.isSafeInteger(parsed) ||
          (observedTotal !== null && parsed !== observedTotal)) {
        throw new Error("WOLO_REST_TX_TOTAL_DRIFT");
      }
      observedTotal = parsed;
    }
    for (const row of rows) {
      const hash = row && typeof row.txhash === "string"
        ? row.txhash.toUpperCase() : "";
      if (!/^[A-F0-9]{64}$/.test(hash) || seen.has(hash)) {
        throw new Error("WOLO_REST_TX_DUPLICATE_OR_MISSING_HASH");
      }
      seen.add(hash);
      found.push(row);
    }
    const goal = observedTotal === null
      ? requested : Math.min(requested, observedTotal);
    if (found.length >= goal) break;
    if (rows.length < pageSize) {
      if (observedTotal !== null && found.length < goal) {
        throw new Error("WOLO_REST_TX_PREMATURE_END");
      }
      break;
    }
  }
  if (observedTotal !== null &&
      found.length < Math.min(requested, observedTotal)) {
    throw new Error("WOLO_REST_TX_INCOMPLETE");
  }
  return found.slice(0, requested);
}
