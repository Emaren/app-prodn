import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { loadScheduledMatchSettlementPlans } from "@/lib/scheduledMatchSettlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function parseIds(value: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function parseTake(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return 40;
  return Math.max(1, Math.min(parsed, 100));
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) {
      return gate.error;
    }

    const url = new URL(request.url);
    const ids = parseIds(url.searchParams.get("ids"));
    const dryRun = url.searchParams.get("dryRun") === "1";
    const payload = await loadScheduledMatchSettlementPlans(gate.prisma, {
      ids,
      dryRun,
      take: parseTake(url.searchParams.get("take")),
    });

    return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to load scheduled match settlement plans:", error);
    return NextResponse.json(
      { detail: "Scheduled match settlement plans unavailable" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
