import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { planReplayCandidateBatch } from "@/lib/adminReplayOperations";
import {
  parseReplayCandidatePlanRequest,
  ReplayOperationsContractError,
} from "@/lib/replayOperationsContracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;

    const payload = await request.json().catch(() => ({}));
    const plan = parseReplayCandidatePlanRequest(payload);
    return NextResponse.json(
      await planReplayCandidateBatch(gate.prisma, plan),
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof ReplayOperationsContractError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status, headers: NO_STORE_HEADERS }
      );
    }
    console.error("[replay-operations] candidate plan failed", error);
    return NextResponse.json(
      {
        detail:
          "Candidate planning is temporarily unavailable. No parser job was scheduled.",
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
