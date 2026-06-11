import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";
import { toWatchStreamPayload } from "@/lib/watchStreams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function POST(request: NextRequest) {
  const uid = await resolveRequestUid(request);
  if (!uid) {
    return NextResponse.json(
      { detail: "No active session" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const requestedSessionKey = cleanText(body.sessionKey, 255);
  const title = cleanText(body.title, 140) || "AoE2WAR live";
  const label = cleanText(body.label, 80) || "AoE2WAR Live";
  const playerLabel = cleanText(body.playerLabel, 80) || null;
  const thumbnailUrl = cleanText(body.thumbnailUrl, 200_000) || null;
  const mediaMimeType = cleanText(body.mediaMimeType, 120) || "video/webm";

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { detail: "User not found" },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const sessionKey = requestedSessionKey || `free:${user.uid}`;
  const now = new Date();
  await prisma.gameWatchStream.updateMany({
    where: {
      userId: user.id,
      sourceType: "browser",
      status: {
        in: ["starting", "live"],
      },
    },
    data: {
      status: "ended",
      endedAt: now,
      isPrimary: false,
    },
  });

  const existingCount = await prisma.gameWatchStream.count({
    where: {
      sessionKey,
      status: {
        in: ["starting", "live"],
      },
    },
  });

  const stream = await prisma.gameWatchStream.create({
    data: {
      sessionKey,
      userId: user.id,
      provider: "aoe2war",
      sourceType: "browser",
      role: "caster",
      label,
      title,
      url: "aoe2war://stream/starting",
      embedId: null,
      playerLabel,
      thumbnailUrl,
      mediaMimeType,
      isPrimary: existingCount === 0,
      status: "starting",
      lastHeartbeatAt: now,
      startedAt: now,
    },
  });

  const playbackUrl = `/api/streams/${stream.id}/manifest`;
  const updated = await prisma.gameWatchStream.update({
    where: { id: stream.id },
    data: {
      url: `aoe2war://stream/${stream.id}`,
      playbackUrl,
    },
  });

  if (updated.isPrimary) {
    await prisma.gameWatchStream.updateMany({
      where: {
        sessionKey,
        id: {
          not: updated.id,
        },
        status: {
          in: ["starting", "live"],
        },
      },
      data: {
        isPrimary: false,
      },
    });
  }

  return NextResponse.json(
    {
      stream: toWatchStreamPayload(updated),
      streamer: {
        uid: user.uid,
        displayName: user.inGameName || user.steamPersonaName || user.uid,
      },
    },
    { status: 201, headers: NO_STORE_HEADERS }
  );
}
