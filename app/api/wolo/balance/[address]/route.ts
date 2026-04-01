import { NextRequest, NextResponse } from "next/server";

import { WOLO_ADDRESS_PREFIX } from "@/lib/woloChain";
import { fetchWoloBalanceAmount } from "@/lib/woloRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ address: string }> }
) {
  const { address } = await context.params;
  const trimmed = address?.trim() || "";

  if (!trimmed) {
    return NextResponse.json({ detail: "Address is required." }, { status: 400 });
  }

  if (!trimmed.startsWith(`${WOLO_ADDRESS_PREFIX}1`)) {
    return NextResponse.json(
      { detail: `Address must start with ${WOLO_ADDRESS_PREFIX}1` },
      { status: 400 }
    );
  }

  try {
    const amount = await fetchWoloBalanceAmount(trimmed);
    return NextResponse.json(
      { amount, address: trimmed },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Balance lookup failed.";
    return NextResponse.json({ detail }, { status: 502 });
  }
}