import { NextRequest, NextResponse } from "next/server";

import {
  normalizeWatchStreamInput,
  toWatchStreamPayload,
} from "@/lib/watchStreams";
import { getPrisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const BROWSER_STREAM_STALE_MS = 120_000;
const BROWSER_STREAM_ARCHIVE_MS = 6 * 60 * 60 * 1000;
const EXTERNAL_STREAM_STALE_MS = 20 * 60 * 1000;

function isVisibleStream(
  stream: ReturnType<typeof toWatchStreamPayload>,
  retainedStreamIds: ReadonlySet<number>,
) {
  if (stream.sourceType !== "browser" && stream.provider !== "aoe2war") {
    if (stream.status === "removed") return false;
    if (!["starting", "live"].includes(stream.status)) return true;
    const lastSeenMs = new Date(stream.updatedAt).getTime();
    return Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs <= EXTERNAL_STREAM_STALE_MS;
  }

  if (!["starting", "live", "ended"].includes(stream.status)) {
    return false;
  }

  const lastSeen = stream.status === "ended"
    ? stream.endedAt || stream.updatedAt
    : stream.lastHeartbeatAt || stream.updatedAt;
  const lastSeenMs = new Date(lastSeen).getTime();
  if (stream.status === "ended" && retainedStreamIds.has(stream.id)) return true;
  const maxAge = stream.status === "ended" ? BROWSER_STREAM_ARCHIVE_MS : BROWSER_STREAM_STALE_MS;
  return Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs <= maxAge;
}

export async function GET(request: NextRequest) {
  const sessionKey = request.nextUrl.searchParams.get("sessionKey")?.trim();

  if (!sessionKey) {
    return NextResponse.json(
      { error: "sessionKey is required" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const prisma = getPrisma();
  const retainedRows = await prisma.gameWatchRetainedDemo
    .findMany({
      where: {
        expiresAt: { gt: new Date() },
        stream: { sessionKey },
      },
      select: { streamId: true },
      take: 1,
    })
    .catch((error) => {
      console.warn("Failed to load retained Watch demo:", error);
      return [];
    });
  const retainedStreamIds = new Set(retainedRows.map((row) => row.streamId));
  const streams = await prisma.gameWatchStream
    .findMany({
      where: {
        sessionKey,
        status: {
          not: "removed",
        },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    })
    .catch((error) => {
      console.warn("Failed to load watch streams:", error);
      return [];
    });

  const visibleStreams = streams
    .map(toWatchStreamPayload)
    .filter((stream) => isVisibleStream(stream, retainedStreamIds));
  return NextResponse.json(
    { streams: visibleStreams },
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) {
    return gate.error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const input = normalizeWatchStreamInput(body as Record<string, unknown>);
    const existingCount = await gate.prisma.gameWatchStream.count({
      where: {
        sessionKey: input.sessionKey,
        status: {
          not: "removed",
        },
      },
    });

    const shouldBePrimary = input.isPrimary || existingCount === 0;

    const stream = await gate.prisma.gameWatchStream.create({
      data: {
        sessionKey: input.sessionKey,
        provider: input.provider,
        role: input.role,
        label: input.label,
        url: input.url,
        embedId: input.embedId,
        playerLabel: input.playerLabel,
        isPrimary: shouldBePrimary,
        status: "live",
      },
    });

    if (shouldBePrimary) {
      await gate.prisma.gameWatchStream.updateMany({
        where: {
          sessionKey: input.sessionKey,
          id: {
            not: stream.id,
          },
        },
        data: {
          isPrimary: false,
        },
      });
    }

    return NextResponse.json(
      { stream: toWatchStreamPayload(stream) },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save watch stream." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
