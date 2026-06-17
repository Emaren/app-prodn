import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  AOE2WAR_STREAM_SOURCE_TYPES,
  normalizeAoE2WarStreamSourceType,
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
  const thumbnailUrl = cleanText(body.thumbnailUrl, 200_000) || null;
  const mediaMimeType = cleanText(body.mediaMimeType, 120) || "video/webm";
  const sourceType = normalizeAoE2WarStreamSourceType(
    body.sourceType,
    actor.authMode === "watcher_key" ? "watcher_native" : "browser"
  );
  const user = actor.user;

  let sessionKey = requestedSessionKey || `free:${user.uid}`;

  if (
    sourceType === "watcher_native" &&
    (!requestedSessionKey ||
      requestedSessionKey.startsWith("watcher:session_") ||
      requestedSessionKey.startsWith("free:"))
  ) {
    const recentReplayRows = await prisma.$queryRaw<Array<{ replay_file: string | null }>>`
      select replay_file
      from watcher_client_events
      where user_id = ${user.id}
        and coalesce(replay_file, '') <> ''
        and created_at >= now() - interval '45 minutes'
        and (
          event_type in (
            'parse_succeeded',
            'upload_succeeded',
            'final_candidate_accepted',
            'final_candidate_ready',
            'parse_result_unknown_fields'
          )
          or parse_source in ('watcher_live', 'watcher_final')
        )
      order by
        case when coalesce(replay_hash, '') <> '' then 0 else 1 end,
        case
          when parse_source = 'watcher_live' then 0
          when parse_source = 'watcher_final' then 1
          else 2
        end,
        created_at desc
      limit 1
    `;

    const recentReplayFile = cleanText(recentReplayRows[0]?.replay_file, 255);
    if (recentReplayFile) {
      sessionKey = recentReplayFile;
      console.info("[streams/start] bound watcher stream to recent replay", {
        userId: user.id,
        requestedSessionKey,
        sessionKey,
      });
    }
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

  const now = new Date();
  await prisma.gameWatchStream.updateMany({
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
