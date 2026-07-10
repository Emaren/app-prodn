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
  const snapshot = await loadLobbySnapshot(
    prisma,
    viewerUid,
    readGuestReactionSessionIdFromRequest(request)
  );

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
