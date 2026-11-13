/**
 * Browser-only read model for the existing same-origin /rpc/status reverse proxy.
 * NEVER use as an authority for settlement, custody, transfers, funding or bets.
 * Invalid/old/cross-chain responses throw instead of inventing a genesis height.
 */
type Obj = Record<string, unknown>;
function object(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("WOLO_RPC_MALFORMED");
  }
  return value as Obj;
}
function boundedText(value: unknown, fallback = "unknown"): string {
  return typeof value === "string" && value.length > 0 && value.length <= 80
    ? value.replace(/[\x00-\x1f\x7f]/g, "")
    : fallback;
}
function optionalHex(value: unknown): string | null {
  return typeof value === "string" && /^[A-Fa-f0-9]{64}$/.test(value)
    ? value.toUpperCase()
    : null;
}
export function parseWoloBrowserRpcStatus(
  input: unknown,
  previousHeight: string | null,
  nowMs: number,
) {
  const result = object(object(input).result);
  const node = object(result.node_info);
  const sync = object(result.sync_info);
  if (node.network !== "wolo-1") throw new Error("WOLO_RPC_WRONG_CHAIN");
  const rawHeight = sync.latest_block_height;
  if (typeof rawHeight !== "string" || !/^[1-9][0-9]{0,17}$/.test(rawHeight)) {
    throw new Error("WOLO_RPC_INVALID_HEIGHT");
  }
  if (typeof sync.latest_block_time !== "string") throw new Error("WOLO_RPC_MISSING_TIME");
  const blockTime = sync.latest_block_time;
  const blockMs = Date.parse(blockTime);
  if (!Number.isFinite(blockMs) || !Number.isFinite(nowMs)) {
    throw new Error("WOLO_RPC_INVALID_TIME");
  }
  const deltaSeconds = Math.floor((nowMs - blockMs) / 1000);
  if (deltaSeconds < -15) throw new Error("WOLO_RPC_FUTURE_BLOCK");
  if (typeof sync.catching_up !== "boolean") throw new Error("WOLO_RPC_MISSING_SYNC");
  const age = Math.max(0, deltaSeconds);
  const stale = age > 20;
  const catchingUp = sync.catching_up;
  const progressing =
    previousHeight !== null &&
    /^[1-9][0-9]{0,17}$/.test(previousHeight) &&
    BigInt(rawHeight) > BigInt(previousHeight);
  const regressed =
    previousHeight !== null &&
    /^[1-9][0-9]{0,17}$/.test(previousHeight) &&
    BigInt(rawHeight) < BigInt(previousHeight);
  if (regressed) throw new Error("WOLO_RPC_HEIGHT_REGRESSION");
  const consensusStatus = catchingUp
    ? "catching_up" as const
    : stale ? "stalled" as const : progressing ? "advancing" as const : "standby" as const;
  const statusLabel = catchingUp
    ? "Catching up" : stale ? "Stalled" : progressing ? "Advancing" : "Fresh block";
  const healthy = !catchingUp && !stale;
  return {
    healthy,
    chainId: "wolo-1",
    moniker: boundedText(node.moniker, "WoloChain"),
    nodeVersion: boundedText(node.version),
    latestBlockHeight: rawHeight,
    latestBlockTime: blockTime,
    lastBlockAgeSeconds: age,
    staleAfterSeconds: 20,
    peers: null, // /rpc/status has no peer count: UNKNOWN, never zero.
    catchingUp,
    consensusStatus,
    statusLabel,
    validatorAddress: null,
    latestBlockHash: optionalHex(sync.latest_block_hash),
    latestAppHash: optionalHex(sync.latest_app_hash),
    source: "/rpc/status",
    terminalLines: [
      "[read-only] same-origin public WoloChain RPC",
      "[verified] chain id wolo-1; no financial service required",
      `[block] height ${rawHeight} age ${age}s`,
      `[consensus] ${statusLabel.toLowerCase()}`,
      "[safety] bets and financial operations remain quarantined",
    ],
  };
}
