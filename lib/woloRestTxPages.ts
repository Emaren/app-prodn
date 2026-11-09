/**
 * Native wolo-1 REST /cosmos/tx/v1beta1/txs pagination.
 * Current node ignores pagination.offset/page but accepts page=N&limit=100.
 * Any overlap, malformed page or truncated known-total result fails closed.
 */
export type NativeTxPage<T> = {
  code?: number;
  message?: string;
  tx_responses?: T[];
  pagination?: { total?: string | number };
};
export type NativeTxWithHash = { txhash?: string };
const MAX_RESULTS = 100_000;
const PAGE_SIZE = 100;
const HASH = /^[0-9a-fA-F]{64}$/;

export async function searchNativeWoloRestPages<T extends NativeTxWithHash>(
  input: Readonly<{
    restUrl: string;
    query: string;
    limit: number;
    load: (url: string) => Promise<NativeTxPage<T>>;
  }>,
): Promise<T[]> {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 ||
      input.limit > MAX_RESULTS || input.restUrl.trim().length === 0 ||
      input.query.length === 0) {
    throw new Error("wolo_rest_pagination_invalid_request");
  }
  const seen = new Set<string>();
  const all: T[] = [];
  const pages = Math.ceil(input.limit / PAGE_SIZE);
  let priorTotal: number | null = null;
  for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
    const url = new URL(input.restUrl.replace(/\/+$/, "") + "/cosmos/tx/v1beta1/txs");
    url.searchParams.set("query", input.query);
    url.searchParams.set("order_by", "ORDER_BY_DESC");
    url.searchParams.set("page", String(pageNumber));
    url.searchParams.set("limit", String(PAGE_SIZE));
    const reply = await input.load(url.toString());
    if (!reply || typeof reply !== "object" || Array.isArray(reply) ||
        (reply.code !== undefined && reply.code !== 0) ||
        !Array.isArray(reply.tx_responses) ||
        reply.tx_responses.length > PAGE_SIZE) {
      throw new Error("wolo_rest_pagination_invalid_response");
    }
    let total: number | null = null;
    if (reply.pagination?.total !== undefined) {
      const n = Number(reply.pagination.total);
      if (!Number.isSafeInteger(n) || n < 0) {
        throw new Error("wolo_rest_pagination_bad_total");
      }
      total = n;
      if (total === 0 && reply.tx_responses.length !== 0) {
        throw new Error("wolo_rest_pagination_bad_total");
      }
      if (priorTotal !== null && total !== priorTotal) {
        throw new Error("wolo_rest_pagination_total_changed");
      }
      priorTotal = total;
    }
    for (const item of reply.tx_responses) {
      const txhash = item?.txhash;
      if (typeof txhash !== "string" || !HASH.test(txhash)) {
        throw new Error("wolo_rest_pagination_invalid_txhash");
      }
      const key = txhash.toUpperCase();
      if (seen.has(key)) {
        throw new Error("wolo_rest_pagination_duplicate_or_replayed_page");
      }
      seen.add(key);
      all.push(item);
    }
    const wanted = Math.min(input.limit, total ?? input.limit);
    if (reply.tx_responses.length < PAGE_SIZE) {
      if (all.length < wanted && total !== null) {
        throw new Error("wolo_rest_pagination_truncated_page");
      }
      break;
    }
    if (all.length >= wanted) break;
  }
  return all.slice(0, input.limit);
}
