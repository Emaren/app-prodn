import { NextResponse } from "next/server";

import { lookupWoloTxStatus } from "@/lib/woloTransactionRecovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ txHash: string }> }
) {
  const { txHash } = await context.params;
  const normalized = decodeURIComponent(txHash || "").trim().toUpperCase();

  if (!/^[A-F0-9]{16,128}$/i.test(normalized)) {
    return NextResponse.json(
      { detail: "Enter a valid WOLO transaction hash." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const chain = await lookupWoloTxStatus(normalized);
  return NextResponse.json({ ok: true, chain }, { headers: NO_STORE_HEADERS });
}
