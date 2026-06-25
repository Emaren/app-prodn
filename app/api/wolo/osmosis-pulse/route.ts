import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PoolAsset = {
  token?: {
    denom?: string;
    amount?: string;
  };
};

type OsmosisPoolResponse = {
  pool?: {
    id?: string;
    pool_assets?: PoolAsset[];
  };
};

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseAmount(amount: string | undefined) {
  if (!amount || !/^\d+$/.test(amount)) return 0;
  return Number(amount) / 1_000_000;
}

function pickPoolAssets(assets: Array<{ denom: string; amount: number }>) {
  const woloDenom = cleanEnv(process.env.WOLO_OSMOSIS_WOLO_DENOM)?.toLowerCase();
  const usdcDenom = cleanEnv(process.env.WOLO_OSMOSIS_USDC_DENOM)?.toLowerCase();

  let wolo = woloDenom
    ? assets.find((asset) => asset.denom.toLowerCase() === woloDenom)
    : null;
  let usdc = usdcDenom
    ? assets.find((asset) => asset.denom.toLowerCase() === usdcDenom)
    : null;

  if (!usdc) {
    usdc = assets.find((asset) => asset.denom.toLowerCase().includes("usdc")) ?? null;
  }

  if (!wolo && usdc) {
    wolo = assets.find((asset) => asset.denom !== usdc?.denom) ?? null;
  }

  if ((!wolo || !usdc) && assets.length >= 2) {
    const sorted = [...assets].sort((left, right) => right.amount - left.amount);
    wolo = wolo ?? sorted[0] ?? null;
    usdc = usdc ?? sorted[sorted.length - 1] ?? null;
  }

  return { wolo, usdc };
}

function buildDepthCurve(reserveWolo: number, reserveUsdc: number) {
  const points: Array<{
    index: number;
    pressure: number;
    priceUsd: number;
  }> = [];

  if (!Number.isFinite(reserveWolo) || !Number.isFinite(reserveUsdc) || reserveWolo <= 0 || reserveUsdc <= 0) {
    return points;
  }

  const k = reserveWolo * reserveUsdc;
  const steps = 31;

  for (let index = 0; index < steps; index += 1) {
    const pressure = -0.18 + (0.36 * index) / (steps - 1);
    const simulatedWoloReserve = Math.max(reserveWolo * (1 + pressure), reserveWolo * 0.18);
    const simulatedUsdcReserve = k / simulatedWoloReserve;
    const priceUsd = simulatedUsdcReserve / simulatedWoloReserve;

    points.push({
      index,
      pressure,
      priceUsd,
    });
  }

  return points;
}

export async function GET() {
  const poolId = cleanEnv(process.env.WOLO_OSMOSIS_POOL_ID) ?? "3461";
  const lcdUrl = (cleanEnv(process.env.WOLO_OSMOSIS_LCD_URL) ?? "https://lcd.osmosis.zone").replace(/\/+$/, "");

  try {
    const response = await fetch(
      `${lcdUrl}/osmosis/gamm/v1beta1/pools/${encodeURIComponent(poolId)}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          detail: `Osmosis pool unavailable: ${response.status}`,
          rawDetail: detail.slice(0, 240),
        },
        {
          status: 502,
          headers: { "Cache-Control": "no-store, max-age=0" },
        }
      );
    }

    const payload = (await response.json()) as OsmosisPoolResponse;
    const assets = (payload.pool?.pool_assets ?? [])
      .map((asset) => ({
        denom: asset.token?.denom ?? "",
        amount: parseAmount(asset.token?.amount),
      }))
      .filter((asset) => asset.denom && asset.amount > 0);

    const { wolo, usdc } = pickPoolAssets(assets);

    if (!wolo || !usdc) {
      return NextResponse.json(
        {
          ok: false,
          detail: "Could not identify WOLO/USDC assets in Osmosis pool.",
          assets,
        },
        {
          status: 502,
          headers: { "Cache-Control": "no-store, max-age=0" },
        }
      );
    }

    const priceUsd = usdc.amount / wolo.amount;
    const liquidityUsd = usdc.amount * 2;

    return NextResponse.json(
      {
        ok: true,
        updatedAt: new Date().toISOString(),
        poolId,
        poolUrl: `https://app.osmosis.zone/pool/${poolId}`,
        source: `Osmosis pool ${poolId}`,
        pairLabel: "WOLO / USDC",
        priceUsd,
        reserveWolo: wolo.amount,
        reserveUsdc: usdc.amount,
        liquidityUsd,
        woloDenom: wolo.denom,
        usdcDenom: usdc.denom,
        depthCurve: buildDepthCurve(wolo.amount, usdc.amount),
      },
      {
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        detail: error instanceof Error ? error.message : "Osmosis pulse unavailable.",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  }
}
