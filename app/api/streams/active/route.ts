import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";
import { maybeCleanupBrowserStreams } from "@/lib/streamCleanup";
import { AOE2WAR_STREAM_SOURCE_TYPES } from "@/lib/streamRequestAuth";
import { toWatchStreamPayload } from "@/lib/watchStreams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const STALE_AFTER_MS = 120_000;

function isFreshEnough(lastHeartbeatAt: Date | null, updatedAt: Date) {
  const activityTime = lastHeartbeatAt?.getTime() ?? updatedAt.getTime();
  return Date.now() - activityTime <= STALE_AFTER_MS;
}

export async function GET(request: NextRequest) {
  const sessionKey = request.nextUrl.searchParams.get("sessionKey")?.trim() || null;
  const mine = request.nextUrl.searchParams.get("mine") === "1";
  const uid = mine ? await resolveRequestUid(request) : null;
  const prisma = getPrisma();

  await maybeCleanupBrowserStreams(prisma).catch((error) => {
    console.warn("Browser stream cleanup skipped:", error);
  });

  const user = uid
    ? await prisma.user.findUnique({
        where: { uid },
        select: { id: true },
      })
    : null;

  const streams = await prisma.gameWatchStream
    .findMany({
      where: {
        sourceType: {
          in: [...AOE2WAR_STREAM_SOURCE_TYPES],
        },
        status: {
          in: ["starting", "live"],
        },
        ...(sessionKey ? { sessionKey } : {}),
        ...(mine && user ? { userId: user.id } : {}),
        ...(mine && !user ? { id: -1 } : {}),
      },
      orderBy: [
        { isPrimary: "desc" },
        { lastHeartbeatAt: "desc" },
        { updatedAt: "desc" },
        { id: "desc" },
      ],
      take: sessionKey || mine ? 12 : 36,
    })
    .catch((error) => {
      console.warn("Failed to load active browser streams:", error);
      return [];
    });

  return NextResponse.json(
    {
      streams: streams
        .filter((stream) => isFreshEnough(stream.lastHeartbeatAt, stream.updatedAt))
        .map(toWatchStreamPayload),
    },
    { headers: NO_STORE_HEADERS }
  );
}
