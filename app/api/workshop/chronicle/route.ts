import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { loadWorkshopChroniclePage } from "@/lib/workshop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const occurredAt = request.nextUrl.searchParams.get("beforeOccurredAt");
  const beforeId = request.nextUrl.searchParams.get("beforeId");

  const before =
    occurredAt && beforeId
      ? {
          occurredAt,
          id: positiveInt(beforeId, 0),
        }
      : null;

  if (before && before.id <= 0) {
    return NextResponse.json(
      { detail: "Invalid Workshop Chronicle cursor." },
      { status: 400 },
    );
  }

  try {
    const page = await loadWorkshopChroniclePage(getPrisma(), {
      take: positiveInt(request.nextUrl.searchParams.get("limit"), 18),
      before,
    });

    return NextResponse.json(page, {
      headers: {
        "Cache-Control": "public, max-age=5, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    console.error("Workshop Chronicle load failed:", error);

    return NextResponse.json(
      { detail: "Could not load older Workshop history." },
      { status: 500 },
    );
  }
}
