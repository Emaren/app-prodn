import { NextRequest, NextResponse } from "next/server";

import { loadOgBoardPage } from "@/lib/ogBoard";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readInteger(request: NextRequest, key: string, fallback: number) {
  const value = Number.parseInt(request.nextUrl.searchParams.get(key) || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const page = await loadOgBoardPage(getPrisma(), {
      offset: readInteger(request, "offset", 0),
      limit: readInteger(request, "limit", 24),
    });
    return NextResponse.json({ ok: true, ...page });
  } catch (error) {
    console.error("Failed to load OG leaderboard:", error);
    return NextResponse.json(
      { ok: false, detail: "The battle archive is temporarily unavailable." },
      { status: 500 }
    );
  }
}
