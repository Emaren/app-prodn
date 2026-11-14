/**
 * Bounded, read-only CometBFT /rpc/block projection for public wolo-1 displays.
 * No wallet, signer, settlement or financial API can be reached from this helper.
 */
export type PublicWoloBlock = {
  height: string;
  hash: string;
  time: string;
  transactionCount: number;
  transactionBase64: string[];
};
type Obj = Record<string, unknown>;
function object(value: unknown): Obj {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("WOLO_BLOCK_MALFORMED");
  return value as Obj;
}
export function parseWoloPublicBlock(raw: unknown, requestedHeight: string, nowMs: number): PublicWoloBlock {
  if (!/^[1-9][0-9]{0,15}$/.test(requestedHeight)) throw new Error("WOLO_BLOCK_INVALID_HEIGHT");
  const result = object(object(raw).result);
  const block = object(result.block);
  const header = object(block.header);
  const blockId = object(result.block_id);
  const data = object(block.data);
  if (header.chain_id !== "wolo-1") throw new Error("WOLO_BLOCK_WRONG_CHAIN");
  if (header.height !== requestedHeight) throw new Error("WOLO_BLOCK_HEIGHT_MISMATCH");
  if (typeof blockId.hash !== "string" || !/^[a-f0-9]{64}$/i.test(blockId.hash)) throw new Error("WOLO_BLOCK_HASH_INVALID");
  const time = header.time;
  if (typeof time !== "string" || time.length > 40 || !Number.isFinite(Date.parse(time))) throw new Error("WOLO_BLOCK_INVALID_TIME");
  if (Date.parse(time) - nowMs > 30_000) throw new Error("WOLO_BLOCK_FUTURE_TIME");
  const txs = data.txs === null ? [] : data.txs;
  if (!Array.isArray(txs) || txs.length > 2000) throw new Error("WOLO_BLOCK_INVALID_TXS");
  const samples: string[] = [];
  for (const tx of txs.slice(0, 8)) {
    if (typeof tx === "string" && tx.length > 0 && tx.length <= 150_000 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(tx)) samples.push(tx);
  }
  return {
    height: requestedHeight,
    hash: blockId.hash.toUpperCase(),
    time,
    transactionCount: txs.length,
    transactionBase64: samples,
  };
}
