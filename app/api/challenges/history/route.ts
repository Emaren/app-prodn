import { NextRequest, NextResponse } from "next/server";

import { loadChallengeHistoryPage } from "@/lib/challenges";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const viewerUid = await getSessionUid(request);
  if (!viewerUid) {
    return NextResponse.json({ detail: "No active session" }, { status: 401 });
  }

  const cursorValue = Number.parseInt(request.nextUrl.searchParams.get("cursor") || "", 10);
  const limitValue = Number.parseInt(request.nextUrl.searchParams.get("limit") || "", 10);

  try {
    const payload = await loadChallengeHistoryPage(getPrisma(), viewerUid, {
      cursor: Number.isFinite(cursorValue) && cursorValue > 0 ? cursorValue : null,
      limit: Number.isFinite(limitValue) ? limitValue : undefined,
    });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Failed to load older Challenge records:", error);
    return NextResponse.json({ detail: "Challenge history unavailable." }, { status: 500 });
  }
}
