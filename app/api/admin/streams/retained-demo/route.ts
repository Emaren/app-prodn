import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { loadLiveReplayDetailSnapshot } from "@/lib/liveReplayDetail";
import {
  deleteSingleRetainedDemo,
  evaluateRetainedDemoEligibility,
  RETAINED_STREAM_DEMO_SLOT,
  retainedDemoPublicPayload,
  retainSingleStreamDemo,
  RetainedDemoConflictError,
  RetainedDemoStorageError,
} from "@/lib/retainedStreamDemo";
import { getStreamStorageUsage } from "@/lib/streamStorage";
import { toWatchStreamPayload } from "@/lib/watchStreams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const record = await gate.prisma.gameWatchRetainedDemo.findUnique({
    where: { slot: RETAINED_STREAM_DEMO_SLOT },
    include: { stream: true, retainedBy: { select: { uid: true } } },
  });

  return NextResponse.json(
    {
      retainedDemo: record
        ? {
            ...retainedDemoPublicPayload(record),
            retainedByUid: record.retainedBy.uid,
            stream: toWatchStreamPayload(record.stream),
          }
        : null,
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const advertisedLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(advertisedLength) && advertisedLength > 4_096) {
    return NextResponse.json(
      { detail: "Request body is too large." },
      { status: 413, headers: NO_STORE_HEADERS },
    );
  }

  const body = (await request.json().catch(() => null)) as { streamId?: unknown } | null;
  const streamId = Number(body?.streamId);
  if (!Number.isInteger(streamId) || streamId <= 0) {
    return NextResponse.json(
      { detail: "A valid streamId is required." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const stream = await gate.prisma.gameWatchStream.findUnique({ where: { id: streamId } });
  if (!stream) {
    return NextResponse.json(
      { detail: "Stream not found." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const usage = await getStreamStorageUsage(stream.id).catch((error) => {
    console.error("[streams/retained-demo] failed to inspect recording", {
      streamId: stream.id,
      error,
    });
    return null;
  });
  if (!usage) {
    return NextResponse.json(
      { detail: "Recording storage is unavailable." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const eligibility = evaluateRetainedDemoEligibility({
    provider: stream.provider,
    sourceType: stream.sourceType,
    status: stream.status,
    startedAt: stream.startedAt,
    endedAt: stream.endedAt,
    usage,
  });
  if (!eligibility.ok) {
    return NextResponse.json(
      { detail: eligibility.reason },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  const gameSnapshot = await loadLiveReplayDetailSnapshot(
    gate.prisma,
    stream.sessionKey,
  ).catch(() => null);
  if (!gameSnapshot) {
    return NextResponse.json(
      { detail: "The stream is not bound to a server-known game session." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const retained = await retainSingleStreamDemo(gate.prisma, {
      streamId: stream.id,
      retainedByUserId: gate.user.id,
      byteCount: usage.totalBytes,
      durationSeconds: eligibility.durationSeconds,
    });

    return NextResponse.json(
      {
        retainedDemo: {
          ...retainedDemoPublicPayload(retained),
          stream: toWatchStreamPayload(retained.stream),
        },
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof RetainedDemoConflictError) {
      return NextResponse.json(
        { detail: error.message },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }
    console.error("[streams/retained-demo] registry write failed", { streamId, error });
    return NextResponse.json(
      { detail: "The recording could not be retained." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const streamIdValue = request.nextUrl.searchParams.get("streamId");
  const expectedStreamId = streamIdValue === null ? undefined : Number(streamIdValue);
  if (
    expectedStreamId !== undefined &&
    (!Number.isInteger(expectedStreamId) || expectedStreamId <= 0)
  ) {
    return NextResponse.json(
      { detail: "streamId is invalid." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const deleted = await deleteSingleRetainedDemo(gate.prisma, expectedStreamId);
    return NextResponse.json(
      { deleted: Boolean(deleted), streamId: deleted?.streamId ?? null },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof RetainedDemoConflictError) {
      return NextResponse.json(
        { detail: "The retained demo changed; refresh before deleting it." },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }
    if (error instanceof RetainedDemoStorageError) {
      return NextResponse.json(
        { detail: error.message },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    console.error("[streams/retained-demo] delete failed", { expectedStreamId, error });
    return NextResponse.json(
      { detail: "The retained demo could not be deleted." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
