export type WoloMarketSnapshot = {
  label: string;
  poolId: string | null;
  poolUrl: string | null;
  pairLabel: string;
  priceUsd: number | null;
  priceStatus: "pool" | "configured" | "unavailable";
  priceSource: string | null;
  registryStatus: "pending";
  updatedAt: string;
};

type OsmosisPoolPayload = {
  pool?: {
    pool_assets?: Array<{
      token?: {
        denom?: string;
        amount?: string;
      };
      weight?: string;
    }>;
  };
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

const DEFAULT_OSMOSIS_LCD_URL = "https://lcd.osmosis.zone";
const DEFAULT_USDC_IBC_DENOM =
  "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4";
const DEFAULT_WOLO_IBC_DENOM =
  "ibc/D09120C7085DFA412DF77608DAD3A4797F5F097A038DA0C2E1D1426FC9CD836D";
const DEFAULT_TOKEN_DECIMALS = 6;
const POOL_FETCH_TIMEOUT_MS = 6_000;
const POOL_PRICE_CACHE_MS = 60_000;

let cachedPoolPrice:
  | {
      key: string;
      expiresAt: number;
      priceUsd: number;
    }
  | null = null;

function numberFromAmount(value: string | null | undefined, decimals: number) {
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value) / 10 ** decimals;
}

export function deriveWeightedPoolWoloPriceUsd(input: {
  usdcAmount: string | null | undefined;
  usdcWeight?: string | null;
  usdcDecimals?: number;
  woloAmount: string | null | undefined;
  woloWeight?: string | null;
  woloDecimals?: number;
}) {
  const usdc = numberFromAmount(input.usdcAmount, input.usdcDecimals ?? DEFAULT_TOKEN_DECIMALS);
  const wolo = numberFromAmount(input.woloAmount, input.woloDecimals ?? DEFAULT_TOKEN_DECIMALS);
  const usdcWeight = Number(input.usdcWeight || "1");
  const woloWeight = Number(input.woloWeight || "1");

  if (!usdc || !wolo || !Number.isFinite(usdcWeight) || !Number.isFinite(woloWeight)) {
    return null;
  }

  const price = (usdc / usdcWeight) / (wolo / woloWeight);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function fetchOsmosisPoolPriceUsd({
  poolId,
  usdcDenom,
  woloDenom,
}: {
  poolId: string;
  usdcDenom: string;
  woloDenom: string;
}) {
  const cacheKey = `${poolId}:${usdcDenom}:${woloDenom}`;
  const now = Date.now();
  if (cachedPoolPrice?.key === cacheKey && cachedPoolPrice.expiresAt > now) {
    return cachedPoolPrice.priceUsd;
  }

  const lcdUrl =
    cleanEnv(process.env.WOLO_OSMOSIS_LCD_URL) ??
    cleanEnv(process.env.OSMOSIS_LCD_URL) ??
    DEFAULT_OSMOSIS_LCD_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POOL_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${lcdUrl.replace(/\/+$/, "")}/osmosis/gamm/v1beta1/pools/${encodeURIComponent(poolId)}`,
      {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      }
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as OsmosisPoolPayload;
    const assets = payload.pool?.pool_assets ?? [];
    const usdc = assets.find((asset) => asset.token?.denom === usdcDenom);
    const wolo = assets.find((asset) => asset.token?.denom === woloDenom);
    const priceUsd = deriveWeightedPoolWoloPriceUsd({
      usdcAmount: usdc?.token?.amount,
      usdcWeight: usdc?.weight,
      woloAmount: wolo?.token?.amount,
      woloWeight: wolo?.weight,
    });

    if (priceUsd != null) {
      cachedPoolPrice = {
        key: cacheKey,
        expiresAt: now + POOL_PRICE_CACHE_MS,
        priceUsd,
      };
    }

    return priceUsd;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadWoloMarketSnapshot(): Promise<WoloMarketSnapshot> {
  const poolId = cleanEnv(process.env.WOLO_OSMOSIS_POOL_ID) ?? "3461";
  const poolUrl =
    cleanEnv(process.env.WOLO_OSMOSIS_POOL_URL) ??
    (poolId === "3461" ? "https://app.osmosis.zone/pool/3461" : null);
  const label = cleanEnv(process.env.WOLO_MARKET_LABEL) ?? "WOLO Market";
  const configuredPrice = parsePositiveNumber(cleanEnv(process.env.WOLO_USD_PRICE));
  const usdcDenom = cleanEnv(process.env.WOLO_OSMOSIS_USDC_DENOM) ?? DEFAULT_USDC_IBC_DENOM;
  const woloDenom = cleanEnv(process.env.WOLO_OSMOSIS_WOLO_DENOM) ?? DEFAULT_WOLO_IBC_DENOM;
  const poolPrice = configuredPrice
    ? null
    : await fetchOsmosisPoolPriceUsd({ poolId, usdcDenom, woloDenom });

  return {
    label,
    poolId,
    poolUrl,
    pairLabel: "WOLO / USDC",
    priceUsd: configuredPrice ?? poolPrice,
    priceStatus: configuredPrice ? "configured" : poolPrice ? "pool" : "unavailable",
    priceSource: configuredPrice ? "WOLO_USD_PRICE" : poolPrice ? `Osmosis pool ${poolId}` : null,
    registryStatus: "pending",
    updatedAt: new Date().toISOString(),
  };
}
