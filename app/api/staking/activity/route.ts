import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { loadMainnetTransferStakingActivityPage } from "@/lib/staking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function clampLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 16;
  return Math.max(1, Math.min(parsed, 40));
}

function parseBefore(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: NextRequest) {
  try {
    const filterParam = request.nextUrl.searchParams.get("filter");
    const payload = await loadMainnetTransferStakingActivityPage(getPrisma(), {
      limit: clampLimit(request.nextUrl.searchParams.get("limit")),
      before: parseBefore(request.nextUrl.searchParams.get("before")),
      mode: request.nextUrl.searchParams.get("mode") === "grouped" ? "grouped" : "ledger",
      filter:
        filterParam === "staking" || filterParam === "bets" || filterParam === "transfers"
          ? filterParam
          : "all",
    });

    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Staking activity is unavailable.";
    return NextResponse.json(
      { detail, rows: [], hasMore: false, nextBefore: null },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
