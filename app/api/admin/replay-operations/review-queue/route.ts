import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { loadReplayOperationsReviewQueue } from "@/lib/adminReplayOperations";
import {
  parseReplayReviewQuery,
  ReplayOperationsContractError,
} from "@/lib/replayOperationsContracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;

    const options = parseReplayReviewQuery(request.nextUrl.searchParams);
    return NextResponse.json(
      await loadReplayOperationsReviewQueue(gate.prisma, options),
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof ReplayOperationsContractError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status, headers: NO_STORE_HEADERS }
      );
    }
    console.error("[replay-operations] review queue failed", error);
    return NextResponse.json(
      {
        detail:
          "Replay review exposure is temporarily unavailable. No verdict or settlement was changed.",
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
