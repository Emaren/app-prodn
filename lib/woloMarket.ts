export type WoloMarketSnapshot = {
  label: string;
  poolId: string | null;
  poolUrl: string | null;
  pairLabel: string;
  priceUsd: number | null;
  priceStatus: "default" | "configured" | "unavailable";
  registryStatus: "pending";
  updatedAt: string;
};

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parsePositiveNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function loadWoloMarketSnapshot(): WoloMarketSnapshot {
  const poolId = cleanEnv(process.env.WOLO_OSMOSIS_POOL_ID) ?? "3461";
  const poolUrl =
    cleanEnv(process.env.WOLO_OSMOSIS_POOL_URL) ??
    (poolId === "3461" ? "https://app.osmosis.zone/pool/3461" : null);
  const label = cleanEnv(process.env.WOLO_MARKET_LABEL) ?? "WOLO Market";
  const configuredPrice = parsePositiveNumber(cleanEnv(process.env.WOLO_USD_PRICE));
  const defaultPrice = parsePositiveNumber(cleanEnv(process.env.WOLO_USD_PRICE_DEFAULT)) ?? 0.0001;

  return {
    label,
    poolId,
    poolUrl,
    pairLabel: "WOLO / USDC",
    priceUsd: configuredPrice ?? defaultPrice,
    priceStatus: configuredPrice ? "configured" : "default",
    registryStatus: "pending",
    updatedAt: new Date().toISOString(),
  };
}
