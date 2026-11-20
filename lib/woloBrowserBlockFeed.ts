/**
 * Read-only, browser-safe bounded block projection from the existing same-origin
 * /rpc/blockchain reverse proxy. Never import a validator key or call /broadcast.
 */
type Obj = Record<string, unknown>;
export type WoloRecentBlock = {
  height: string;
  time: string;
  hash: string | null;
  sizeBytes: number | null;
  transactions: number | null;
};
export type WoloRecentBlockFeed = {
  latestHeight: string;
  latestTime: string;
  latestAgeSeconds: number;
  stale: boolean;
  progressing: boolean;
  rows: WoloRecentBlock[];
  source: "/rpc/blockchain";
};
function object(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("WOLO_BLOCK_FEED_INVALID_OBJECT");
  return value as Obj;
}
function height(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,17}$/.test(value))
    throw new Error("WOLO_BLOCK_FEED_BAD_HEIGHT");
  return value;
}
function nonnegative(value: unknown, maximum: number): number | null {
  if (value === undefined || value === null) return null;
  if (!((typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) ||
        (typeof value === "number" && Number.isSafeInteger(value)))) throw new Error("WOLO_BLOCK_FEED_BAD_COUNT");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > maximum) throw new Error("WOLO_BLOCK_FEED_OUT_OF_RANGE");
  return n;
}
function blockTime(value: unknown, nowMs: number): string {
  if (typeof value !== "string" || value.length > 45 || !/^\d{4}-\d\d-\d\dT/.test(value) || !value.endsWith("Z"))
    throw new Error("WOLO_BLOCK_FEED_BAD_TIME");
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms - nowMs > 15_000) throw new Error("WOLO_BLOCK_FEED_FUTURE_TIME");
  return value;
}
export function parseWoloBrowserBlockFeed(
  input: unknown, previousHeight: string | null, nowMs: number,
): WoloRecentBlockFeed {
  if (!Number.isFinite(nowMs)) throw new Error("WOLO_BLOCK_FEED_CLOCK_INVALID");
  const result = object(object(input).result);
  const latestHeight = height(result.last_height);
  const knownPrevious = previousHeight !== null &&
    /^[1-9][0-9]{0,17}$/.test(previousHeight) ? previousHeight : null;
  if (knownPrevious && BigInt(latestHeight) < BigInt(knownPrevious))
    throw new Error("WOLO_BLOCK_FEED_REGRESSION");
  const meta = result.block_metas;
  if (!Array.isArray(meta) || meta.length < 1 || meta.length > 100) throw new Error("WOLO_BLOCK_FEED_BAD_ROWS");
  const parsed = meta.map((raw): WoloRecentBlock => {
    const item=object(raw), header=object(item.header);
    if (header.chain_id !== "wolo-1") throw new Error("WOLO_BLOCK_FEED_WRONG_CHAIN");
    const h=height(header.height);
    if (BigInt(h)>BigInt(latestHeight) ||
        BigInt(latestHeight)-BigInt(h)>BigInt(100)) throw new Error("WOLO_BLOCK_FEED_OUTSIDE_WINDOW");
    const time=blockTime(header.time,nowMs);
    const blockId=object(item.block_id);
    const hashValue=blockId.hash;
    if (hashValue!==null && hashValue!==undefined &&
        (typeof hashValue!=="string" || !/^[a-fA-F0-9]{64}$/.test(hashValue)))
      throw new Error("WOLO_BLOCK_FEED_BAD_HASH");
    return {
      height:h,time,hash:typeof hashValue==="string"?hashValue:null,
      sizeBytes:nonnegative(item.block_size,20_000_000),
      transactions:nonnegative(item.num_txs,10_000),
    };
  }).sort((a,b)=>BigInt(a.height)>BigInt(b.height)?-1:BigInt(a.height)<BigInt(b.height)?1:0);
  const found=new Set<string>(),rows:WoloRecentBlock[]=[];
  for(const row of parsed){
    if(found.has(row.height)) throw new Error("WOLO_BLOCK_FEED_DUPLICATE_HEIGHT");
    found.add(row.height);
    if(rows.length<8)rows.push(row);
  }
  const newest=rows[0];
  if(newest.height!==latestHeight) throw new Error("WOLO_BLOCK_FEED_TIP_MISMATCH");
  const age=Math.max(0,Math.floor((nowMs-Date.parse(newest.time))/1000));
  return {
    latestHeight,latestTime:newest.time,latestAgeSeconds:age,
    stale:age>30,
    progressing:knownPrevious!==null && BigInt(latestHeight)>BigInt(knownPrevious),
    rows,source:"/rpc/blockchain",
  };
}
