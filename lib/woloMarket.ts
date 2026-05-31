export type WoloMarketSnapshot = {
  label: string;
  poolId: string | null;
  poolUrl: string | null;
  pairLabel: string;
  priceUsd: number | null;
  priceStatus: "unavailable";
  registryStatus: "pending";
  updatedAt: string;
};

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function loadWoloMarketSnapshot(): WoloMarketSnapshot {
  const poolId = cleanEnv(process.env.WOLO_OSMOSIS_POOL_ID) ?? "3461";
  const poolUrl =
    cleanEnv(process.env.WOLO_OSMOSIS_POOL_URL) ??
    (poolId === "3461" ? "https://app.osmosis.zone/pool/3461" : null);
  const label = cleanEnv(process.env.WOLO_MARKET_LABEL) ?? "WOLO Market";

  return {
    label,
    poolId,
    poolUrl,
    pairLabel: "WOLO / USDC",
    priceUsd: null,
    priceStatus: "unavailable",
    registryStatus: "pending",
    updatedAt: new Date().toISOString(),
  };
}
