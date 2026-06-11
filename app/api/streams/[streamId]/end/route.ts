import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";
import { toWatchStreamPayload } from "@/lib/watchStreams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ streamId: string }> }
) {
  const uid = await resolveRequestUid(request);
  if (!uid) {
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

  const prisma = getPrisma();
  const stream = await prisma.gameWatchStream.findUnique({
    where: { id },
    include: {
      user: {
        select: { uid: true },
      },
    },
  });

  if (!stream || stream.user?.uid !== uid || stream.sourceType !== "browser") {
    return NextResponse.json(
      { detail: "Stream not found." },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const updated = await prisma.gameWatchStream.update({
    where: { id },
    data: {
      status: "ended",
      endedAt: new Date(),
      isPrimary: false,
    },
  });

  return NextResponse.json(
    { stream: toWatchStreamPayload(updated) },
    { headers: NO_STORE_HEADERS }
  );
}
