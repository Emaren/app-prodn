import { NextRequest, NextResponse } from "next/server";

import { loadChallengeHistoryPage } from "@/lib/challenges";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({ where: { uid }, select: { id: true } });
  if (!viewer) return NextResponse.json({ detail: "Viewer not found" }, { status: 404 });

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20, 50));
  const parsedCursor = Number.parseInt(url.searchParams.get("cursor") || "", 10);
  const cursor = Number.isFinite(parsedCursor) && parsedCursor > 0 ? parsedCursor : null;

  const page = await loadChallengeHistoryPage(prisma, viewer.id, { cursor, limit });
  return NextResponse.json({
    rows: page.tiles,
    page: { hasMore: page.hasMore, nextCursor: page.nextCursor },
  });
}
