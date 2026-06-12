import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  isAoE2WarManagedStream,
  resolveStreamRequestActor,
} from "@/lib/streamRequestAuth";
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ streamId: string }> }
) {
  const prisma = getPrisma();
  const actor = await resolveStreamRequestActor(prisma, request, { touchWatcherKey: false });
  if (!actor) {
    return NextResponse.json(
      { detail: "No active session" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const { streamId } = await context.params;
  const id = Number(streamId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { detail: "Invalid stream id." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const thumbnailUrl = cleanText(body.thumbnailUrl, 200_000) || undefined;
  const mediaMimeType = cleanText(body.mediaMimeType, 120) || undefined;
  const status = cleanText(body.status, 24);

  const stream = await prisma.gameWatchStream.findUnique({
    where: { id },
  });

  if (!stream || !isAoE2WarManagedStream(stream, actor.user.id)) {
    return NextResponse.json(
      { detail: "Stream not found." },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const updated = await prisma.gameWatchStream.update({
    where: { id },
    data: {
      status: status === "live" ? "live" : stream.status === "ended" ? "ended" : "starting",
      lastHeartbeatAt: new Date(),
      thumbnailUrl,
      mediaMimeType,
    },
  });

  return NextResponse.json(
    { stream: toWatchStreamPayload(updated) },
    { headers: NO_STORE_HEADERS }
  );
}
