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

const BROWSER_STREAM_STALE_MS = 45_000;

function isVisibleStream(stream: ReturnType<typeof toWatchStreamPayload>) {
  if (stream.sourceType !== "browser" && stream.provider !== "aoe2war") {
    return stream.status !== "removed";
  }

  if (!["starting", "live"].includes(stream.status)) {
    return false;
  }

  const lastSeen = stream.lastHeartbeatAt || stream.updatedAt;
  const lastSeenMs = new Date(lastSeen).getTime();
  return Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs <= BROWSER_STREAM_STALE_MS;
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

  return NextResponse.json(
    { streams: streams.map(toWatchStreamPayload).filter(isVisibleStream) },
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
