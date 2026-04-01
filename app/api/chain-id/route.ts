import { NextResponse } from "next/server";

import { fetchWoloStatusSnapshot } from "@/lib/woloRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
  const snapshot = await fetchWoloStatusSnapshot();

  return NextResponse.json(
    {
      chainId: snapshot.chainId,
      chainName: snapshot.chainName,
      prefix: snapshot.addressPrefix,
      baseDenom: snapshot.baseDenom,
      displayDenom: snapshot.displayDenom,
      decimals: snapshot.coinDecimals,
      monetaryPolicy: snapshot.monetaryPolicy,
      rpc: snapshot.source,
      sourceLabel: snapshot.sourceLabel,
      latestBlockHeight: snapshot.latestBlockHeight,
      latestBlockTime: snapshot.latestBlockTime,
      healthy: snapshot.healthy,
      catchingUp: snapshot.catchingUp,
      peers: snapshot.peers,
      moniker: snapshot.moniker,
      nodeVersion: snapshot.nodeVersion,
    },
    {
      headers: NO_STORE_HEADERS,
    }
  );
}