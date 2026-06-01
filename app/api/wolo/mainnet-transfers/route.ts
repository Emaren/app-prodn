import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { loadWoloIndexedTransferDashboard } from "@/lib/woloMainnetTransfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function clampLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(50, parsed));
}

export async function GET(request: NextRequest) {
  try {
    const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
    const dashboard = await loadWoloIndexedTransferDashboard(getPrisma(), limit);

    return NextResponse.json(
      {
        ok: true,
        ...dashboard,
        indexer: {
          adminBackfillRoute: "/api/admin/wolo-transfers/backfill",
          script: "scripts/backfill-wolo-mainnet-transfers.mjs",
          mode: "wolo-1 REST tx search",
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "WOLO mainnet transfer index unavailable.";
    return NextResponse.json(
      { ok: false, detail },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
