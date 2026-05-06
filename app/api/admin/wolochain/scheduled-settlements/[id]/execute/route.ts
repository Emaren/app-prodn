import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  ScheduledMatchSettlementError,
  executeScheduledMatchSettlement,
} from "@/lib/scheduledMatchSettlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) {
      return gate.error;
    }

    const { id } = await context.params;
    const matchId = Number.parseInt(id, 10);
    if (!Number.isFinite(matchId) || matchId < 1) {
      return NextResponse.json(
        { detail: "Scheduled match id is required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await executeScheduledMatchSettlement(
      gate.prisma,
      matchId,
      gate.user.id
    );

    return NextResponse.json(result, {
      status: result.execution.ok ? 200 : 409,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    if (error instanceof ScheduledMatchSettlementError) {
      return NextResponse.json(
        {
          detail: error.message,
          code: error.code,
        },
        { status: error.status, headers: NO_STORE_HEADERS }
      );
    }

    console.error("Failed to execute scheduled match settlement:", error);
    return NextResponse.json(
      { detail: "Scheduled match settlement execution failed." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
