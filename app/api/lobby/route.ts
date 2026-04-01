import { NextRequest, NextResponse } from "next/server";
import { readGuestReactionSessionIdFromRequest } from "@/lib/guestReactionSession";
import { loadLobbySnapshot } from "@/lib/lobbySnapshot";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const prisma = getPrisma();
  const viewerUid = await getSessionUid(request);
  return NextResponse.json(
    await loadLobbySnapshot(
      prisma,
      viewerUid,
      readGuestReactionSessionIdFromRequest(request)
    )
  );
}
