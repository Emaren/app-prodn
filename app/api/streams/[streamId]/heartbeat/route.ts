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


async function resolvePlatformSessionKeyForReplay(
  prisma: ReturnType<typeof getPrisma>,
  userUid: string,
  replaySessionKey: string
) {
  const replayKey = cleanText(replaySessionKey, 255);
  if (!replayKey || replayKey.startsWith("platform:")) return null;

  const rows = await prisma.$queryRaw<Array<{ session_key: string | null }>>`
    select
      case
        when gs.key_events::jsonb ? 'platform_match_id'
        then 'platform:' || (gs.key_events::jsonb ->> 'platform_match_id')
        else null
      end as session_key
    from game_stats gs
    where gs.user_uid = ${userUid}
      and gs.key_events is not null
      and (
        gs.original_filename = ${replayKey}
        or gs.replay_file = ${replayKey}
        or split_part(gs.replay_file, '/', array_length(string_to_array(gs.replay_file, '/'), 1)) = ${replayKey}
      )
    order by gs.created_at desc, gs.id desc
    limit 1
  `;

  return cleanText(rows[0]?.session_key, 255) || null;
}


async function resolveRecentReplaySessionKeyForWatcher(
  prisma: ReturnType<typeof getPrisma>,
  userId: number
) {
  const rows = await prisma.$queryRaw<Array<{ replay_file: string | null }>>`
    select replay_file
    from watcher_client_events
    where user_id = ${userId}
      and coalesce(replay_file, '') <> ''
      and created_at >= now() - interval '4 hours'
    order by created_at desc
    limit 1
  `;

  return cleanText(rows[0]?.replay_file, 255) || null;
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

  if (stream.status === "ended" || stream.status === "removed") {
    return NextResponse.json(
      { stream: toWatchStreamPayload(stream) },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  }

  const replayBackedSessionKey =
    stream.provider === "aoe2war" &&
    stream.sourceType === "watcher_native" &&
    (stream.sessionKey.startsWith("watcher:session_") || stream.sessionKey.startsWith("free:"))
      ? (await resolveRecentReplaySessionKeyForWatcher(prisma, actor.user.id)) ?? stream.sessionKey
      : stream.sessionKey;

  const platformSessionKey =
    stream.provider === "aoe2war" && stream.sourceType === "watcher_native"
      ? (await resolvePlatformSessionKeyForReplay(prisma, actor.user.uid, replayBackedSessionKey)) ??
        (replayBackedSessionKey !== stream.sessionKey ? replayBackedSessionKey : null)
      : null;

  const updated = await prisma.gameWatchStream.update({
    where: { id },
    data: {
      status: status === "live" ? "live" : "starting",
      lastHeartbeatAt: new Date(),
      thumbnailUrl,
      mediaMimeType,
      ...(platformSessionKey && platformSessionKey !== stream.sessionKey
        ? {
            sessionKey: platformSessionKey,
            isPrimary: true,
          }
        : {}),
    },
  });

  if (platformSessionKey && platformSessionKey !== stream.sessionKey) {
    await prisma.gameWatchStream.updateMany({
      where: {
        sessionKey: platformSessionKey,
        id: {
          not: updated.id,
        },
        provider: "aoe2war",
        sourceType: {
          in: ["watcher_native", "browser"],
        },
        status: {
          in: ["starting", "live"],
        },
      },
      data: {
        isPrimary: false,
      },
    });

    await prisma.gameWatchStream.updateMany({
      where: {
        OR: [
          { sessionKey: platformSessionKey },
          { sessionKey: replayBackedSessionKey },
        ],
        id: {
          not: updated.id,
        },
        provider: {
          not: "aoe2war",
        },
        sourceType: "external",
        chunkCount: 0,
        status: {
          in: ["starting", "live"],
        },
      },
      data: {
        status: "removed",
        isPrimary: false,
      },
    });

    console.info("[streams/heartbeat] rebound watcher stream to platform session", {
      streamId: updated.id,
      oldSessionKey: stream.sessionKey,
      replayBackedSessionKey,
      platformSessionKey,
    });
  }

  return NextResponse.json(
    { stream: toWatchStreamPayload(updated) },
    { headers: NO_STORE_HEADERS }
  );
}
