import { NextRequest, NextResponse } from "next/server";

import {
  WOLO_ADDRESS_PREFIX,
  WOLO_BASE_DENOM,
  WOLO_CHAIN_ID,
  WOLO_COIN_DECIMALS,
} from "@/lib/woloChain";
import { fetchWoloBalanceSnapshot } from "@/lib/woloRuntime";
import { isValidBech32AccountAddress } from "@/lib/woloBalanceRead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Expires: "0",
  Pragma: "no-cache",
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ address: string }> }
) {
  const { address } = await context.params;
  const trimmed = address?.trim() || "";

  if (!trimmed) {
    return NextResponse.json(
      { detail: "Address is required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (!isValidBech32AccountAddress(trimmed, WOLO_ADDRESS_PREFIX)) {
    return NextResponse.json(
      { detail: `Address must be a valid ${WOLO_ADDRESS_PREFIX}1 account address.` },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const snapshot = await fetchWoloBalanceSnapshot(trimmed);
    return NextResponse.json(
      {
        amount: snapshot.amount,
        address: trimmed,
        denom: WOLO_BASE_DENOM,
        decimals: WOLO_COIN_DECIMALS,
        chainId: WOLO_CHAIN_ID,
        source: snapshot.source,
        observedAt: snapshot.observedAt,
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    console.error("Wolo balance lookup failed:", error);
    return NextResponse.json(
      { detail: "Balance lookup unavailable." },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }
}
