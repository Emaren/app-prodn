import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  isAoE2WarManagedStream,
  resolveStreamRequestActor,
} from "@/lib/streamRequestAuth";
import { toWatchStreamPayload } from "@/lib/watchStreams";
import { lockVideoChunkWriter } from "@/lib/streamAdvisoryLocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ streamId: string }> }
) {
  const prisma = getPrisma();
  const actor = await resolveStreamRequestActor(prisma, request, { touchWatcherKey: true });
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

  const stream = await prisma.gameWatchStream.findUnique({
    where: { id },
  });

  if (!stream || !isAoE2WarManagedStream(stream, actor.user.id)) {
    return NextResponse.json(
      { detail: "Stream not found." },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  // A user Stop request must not race the final accepted WebM write.
  // The writer and this stop share a PostgreSQL transaction-scoped lock.
  const updated = await prisma.$transaction(async (tx) => {
    await lockVideoChunkWriter(tx, id);
    await tx.gameWatchStream.updateMany({
      where: {
        id, userId: actor.user.id,
        status: { in: ["starting", "live"] },
      },
      data: {
        status: "ended",
        endedAt: new Date(),
        isPrimary: false,
      },
    });
    return tx.gameWatchStream.findUnique({ where: { id } });
  }, { maxWait: 4_000, timeout: 12_000 });
  if (!updated || !isAoE2WarManagedStream(updated, actor.user.id)) {
    return NextResponse.json(
      { detail: "Stream not found." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { stream: toWatchStreamPayload(updated) },
    { headers: NO_STORE_HEADERS }
  );
}
