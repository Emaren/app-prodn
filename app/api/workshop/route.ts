import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { loadPublicWorkshop } from "@/lib/workshop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const data = await loadPublicWorkshop(getPrisma());
  if (request.nextUrl.searchParams.get("summary") === "1") {
    return NextResponse.json(
      {
        isOpen: data.status.isOpen,
        isLive: data.status.isLive,
        activityMode: data.status.activityMode,
        headline: data.status.headline,
        currentProject: data.status.currentProject,
        streamLive: Boolean(data.stream),
        updatedAt: data.status.updatedAt,
      },
      { headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=20" } }
    );
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=20" },
  });
}
