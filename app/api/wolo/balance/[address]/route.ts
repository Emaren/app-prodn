import { NextRequest, NextResponse } from "next/server";

import { fetchWoloBalanceAmount } from "@/lib/woloRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ address: string }> }
) {
  const { address } = await context.params;

  if (!address) {
    return NextResponse.json({ detail: "Address is required." }, { status: 400 });
  }

  try {
    const amount = await fetchWoloBalanceAmount(address);
    return NextResponse.json({ amount });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Balance lookup failed.";
    return NextResponse.json({ detail }, { status: 502 });
  }
}
