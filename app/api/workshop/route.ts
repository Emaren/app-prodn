import { NextRequest, NextResponse } from "next/server";

import {
  loadCachedPublicWorkshop,
  loadCachedPublicWorkshopSummary,
} from "@/lib/workshopCached";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("summary") === "1") {
    const summary = await loadCachedPublicWorkshopSummary();
    return NextResponse.json(summary, {
      headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" },
    });
  }

  const data = await loadCachedPublicWorkshop();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=30" },
  });
}
