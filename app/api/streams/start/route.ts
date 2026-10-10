import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  AOE2WAR_STREAM_SOURCE_TYPES,
  normalizeAoE2WarStreamSourceType,
  resolveStreamRequestActor,
} from "@/lib/streamRequestAuth";
import {
  normalizeStreamMediaMimeType,
  normalizeStreamThumbnailUrl,
} from "@/lib/streamMedia";
import { toWatchStreamPayload } from "@/lib/watchStreams";
import { getStreamVolumeHeadroom, MAX_STREAM_BYTES } from "@/lib/streamStorage";

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

export async function POST(request: NextRequest) {
  const prisma = getPrisma();
  const actor = await resolveStreamRequestActor(prisma, request, { touchWatcherKey: true });
  if (!actor) {
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
  const rawThumbnailUrl = cleanText(body.thumbnailUrl, 256_001);
  const thumbnailUrl = normalizeStreamThumbnailUrl(rawThumbnailUrl);
  const mediaMimeType = normalizeStreamMediaMimeType(
    cleanText(body.mediaMimeType, 120) || "video/webm"
  );
  if (rawThumbnailUrl && !thumbnailUrl) {
    return NextResponse.json(
      { detail: "Stream thumbnail is invalid." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  if (!mediaMimeType) {
    return NextResponse.json(
      { detail: "Only WebM stream media is accepted." },
      { status: 415, headers: NO_STORE_HEADERS }
    );
  }
  const sourceType = normalizeAoE2WarStreamSourceType(
    body.sourceType,
    actor.authMode === "watcher_key" ? "watcher_native" : "browser"
  );
  // Verify the *actual* capture filesystem before ending any prior stream
  // or creating a phantom "starting" session. Installed Watchers otherwise
  // capture the desktop only to hit a media-volume 413 on the first chunk.
  // Reserve a full per-POV quota for this admission check; concurrent cameras
  // still require independent total-volume and runtime backpressure limits.
  let writableVideoBytes: number | null = null;
  let mountedSeparately = false;
  try {
    const volume = await getStreamVolumeHeadroom();
    writableVideoBytes = volume.writableVideoBytes;
    mountedSeparately = volume.mountedSeparately;
  } catch {
    // Missing/unmounted directory or unavailable statfs must fail closed for
    // video only. The separate replay monitoring pipeline is untouched.
  }
  if (writableVideoBytes === null || writableVideoBytes < MAX_STREAM_BYTES ||
      (process.env.NODE_ENV === "production" && !mountedSeparately)) {
    return NextResponse.json({
      detail: "Video storage is not ready. The operator must verify the mounted media volume; normal replay watching is unaffected.",
      code: "STREAM_VIDEO_VOLUME_NOT_READY",
      terminal: true,
    }, { status: 503, headers: NO_STORE_HEADERS });
  }
  const user = actor.user;

  let sessionKey = requestedSessionKey || `free:${user.uid}`;

  // A weak Watcher session is NEVER matched to the most recent replay by time.
  // A prior game can still be within that window. Preserve the weak stream
  // identity until the server proves this account's exact replay/platform ID.
  if (sourceType === "watcher_native" &&
      /^(?:[a-z]:[\\/]|[/\\]{2}|[/]|file:\/\/)/i.test(sessionKey)) {
    sessionKey = `watcher:session_${user.id}_${Date.now()}`;
  }

  if (sourceType === "watcher_native") {
    const platformSessionKey = await resolvePlatformSessionKeyForReplay(
      prisma,
      user.uid,
      sessionKey
    );

    if (platformSessionKey && platformSessionKey !== sessionKey) {
      console.info("[streams/start] bound watcher stream to platform session", {
        userId: user.id,
        requestedSessionKey,
        replaySessionKey: sessionKey,
        platformSessionKey,
      });
      sessionKey = platformSessionKey;
    }
  }

  // Do not end an existing broadcaster until the replacement stream and
  // public manifest identity commit together. Any write failure rolls back
  // the entire replacement, preserving the previous live recorder record.
  const updated = await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.gameWatchStream.updateMany({
      where: {
        userId: user.id,
        provider: "aoe2war",
        sourceType: {
          in: [...AOE2WAR_STREAM_SOURCE_TYPES],
        },
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

    const existingCount = await tx.gameWatchStream.count({
      where: {
        sessionKey,
        status: {
          in: ["starting", "live"],
        },
      },
    });

    const stream = await tx.gameWatchStream.create({
      data: {
        sessionKey,
        userId: user.id,
        provider: "aoe2war",
        sourceType,
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
    const updated = await tx.gameWatchStream.update({
      where: { id: stream.id },
      data: {
        url: `aoe2war://stream/${stream.id}`,
        playbackUrl,
      },
    });

    if (updated.isPrimary) {
      await tx.gameWatchStream.updateMany({
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

    return updated;
  });

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
