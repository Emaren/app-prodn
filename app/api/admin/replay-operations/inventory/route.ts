import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { loadReplayOperationsInventory } from "@/lib/adminReplayOperations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) return gate.error;

    return NextResponse.json(
      await loadReplayOperationsInventory(gate.prisma),
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[replay-operations] inventory failed", error);
    return NextResponse.json(
      {
        detail:
          "Replay inventory is temporarily unavailable. No replay or financial records were changed.",
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
