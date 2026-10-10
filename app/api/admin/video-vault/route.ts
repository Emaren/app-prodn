import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { getStreamStorageUsage, getStreamVolumeHeadroom, STREAM_MIN_FREE_BYTES, removeStreamChunks, MAX_STREAM_BYTES, MAX_STREAM_CHUNKS } from "@/lib/streamStorage";
import { estimateTelevisionRecordingBudget } from "@/lib/televisionCapacityPlan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const MAX_ROWS = 60;

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  const [totalCount, records] = await Promise.all([
    gate.prisma.gameWatchStream.count({where:{provider:"aoe2war"}}),
    gate.prisma.gameWatchStream.findMany({
      where:{provider:"aoe2war"},
      orderBy:{id:"desc"},
      take:MAX_ROWS,
      select:{
        id:true, sessionKey:true, sourceType:true, status:true, chunkCount:true,
        latestChunkSeq:true, createdAt:true, startedAt:true, endedAt:true,
        updatedAt:true, lastHeartbeatAt:true, user:{select:{uid:true,inGameName:true,steamPersonaName:true}},
        retainedDemo:{select:{streamId:true,expiresAt:true}},
      },
    }),
  ]);
  // Associate bounded failure telemetry by server-issued stream ID only.
  const eventStreamIds = records.map(stream => "stream_" + stream.id);
  const issueEvents = eventStreamIds.length === 0 ? [] :
    await gate.prisma.watcherClientEvent.findMany({
      where: {
        sessionId: { in: eventStreamIds },
        eventType: { in: [
          "stream_error", "stream_recorder_error", "stream_track_ended",
          "stream_chunk_failed", "stream_media_shed", "stream_heartbeat_failed",
        ] },
      },
      orderBy: { createdAt: "desc" },
      take: 180,
      select: { sessionId: true, eventType: true, parseReason: true,
        appVersion: true, platform: true, createdAt: true, metadata: true },
    });
  const latestIssueByStream = new Map<number, {
    eventType: string; reason: string | null; at: string;
    appVersion: string | null; platform: string | null;
  }>();
  for (const event of issueEvents) {
    const id = Number(event.sessionId?.replace(/^stream_/, ""));
    if (!Number.isSafeInteger(id) || !eventStreamIds.includes("stream_" + id)
        || latestIssueByStream.has(id)) continue;
    const raw = event.metadata;
    const info = raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, unknown> : {};
    // Machine-readable codes only; never send arbitrary paths/window titles.
    const candidate = typeof info.reason === "string" ? info.reason : event.parseReason;
    const reason = typeof candidate === "string" &&
      /^[a-zA-Z0-9_-]{1,80}$/.test(candidate) ? candidate : null;
    latestIssueByStream.set(id, {
      eventType: event.eventType, reason, at: event.createdAt.toISOString(),
      appVersion: event.appVersion, platform: event.platform,
    });
  }

  // Bounded to recent records. Filesystem usage is measured, never guessed from
  // a packet count. All unlisted older recordings are explicitly excluded.
  const rows = await Promise.all(records.map(async stream => {
    const usage = await getStreamStorageUsage(stream.id).catch(() => null);
    return {
      id:stream.id, sessionKey:stream.sessionKey, sourceType:stream.sourceType,
      status:stream.status, chunkCount:stream.chunkCount,
      actualChunkCount:usage?.chunkCount ?? null, bytes:usage?.totalBytes ?? null,
      lastSeq:stream.latestChunkSeq,
      player:stream.user?.inGameName || stream.user?.steamPersonaName || stream.user?.uid || "Unlinked",
      startedAt:stream.startedAt?.toISOString() ?? null,
      endedAt:stream.endedAt?.toISOString() ?? null,
      updatedAt:stream.updatedAt.toISOString(),
      retained: Boolean(stream.retainedDemo),
      retainedUntil:stream.retainedDemo?.expiresAt.toISOString() ?? null,
      lastHeartbeatAgeSeconds: stream.lastHeartbeatAt
        ? Math.max(0, Math.round((Date.now() - stream.lastHeartbeatAt.getTime()) / 1000))
        : null,
      latestIssue: latestIssueByStream.get(stream.id) ?? null,
    };
  }));
  const recentBytes = rows.reduce((sum,row)=>sum+(row.bytes??0),0);
  const volume = await getStreamVolumeHeadroom().catch(() => null);
  return NextResponse.json({
    rows, totalCount, scanned:rows.length, recentBytes,
    issuesSampled: issueEvents.length,
    complete:rows.length===totalCount && rows.every(row=>row.bytes !== null),
    limits:{perStreamBytes:MAX_STREAM_BYTES,perStreamChunks:MAX_STREAM_CHUNKS},
    recordingBudget:estimateTelevisionRecordingBudget(),
    volume: volume ?? { freeBytes:null, reserveBytes:STREAM_MIN_FREE_BYTES, writableVideoBytes:null },
    note:"Sizes are measured for the newest 60 first-party streams only. Older/orphaned files are not in this subtotal.",
  },{headers:NO_STORE});
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  // Cookie authenticated destructive actions also require a matching browser origin.
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({detail:"Same-origin operator action required."},{status:403,headers:NO_STORE});
  }
  const body = await request.json().catch(()=>null) as {streamId?:unknown}|null;
  const streamId=Number(body?.streamId);
  if (!Number.isSafeInteger(streamId)||streamId<=0) {
    return NextResponse.json({detail:"Invalid stream ID."},{status:400,headers:NO_STORE});
  }
  const stream=await gate.prisma.gameWatchStream.findUnique({where:{id:streamId},
    select:{id:true,provider:true,status:true,retainedDemo:{select:{slot:true}}}});
  if (!stream || stream.provider!=="aoe2war") {
    return NextResponse.json({detail:"Recording not found."},{status:404,headers:NO_STORE});
  }
  if (stream.retainedDemo || !["ended","failed"].includes(stream.status)) {
    return NextResponse.json({detail:"Live, protected or retained recordings cannot be deleted here."},
      {status:409,headers:NO_STORE});
  }
  try {
    await removeStreamChunks(streamId);
  } catch (error) {
    console.error("[video-vault] deletion failed", {streamId,error});
    return NextResponse.json({detail:"File deletion failed; recording registry preserved."},
      {status:503,headers:NO_STORE});
  }
  await gate.prisma.gameWatchStream.updateMany({
    where:{id:streamId, status:{in:["ended","failed"]},provider:"aoe2war"},
    data:{status:"removed",isPrimary:false},
  });
  return NextResponse.json({deleted:true,streamId},{headers:NO_STORE});
}
