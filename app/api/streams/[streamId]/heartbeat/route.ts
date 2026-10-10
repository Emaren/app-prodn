import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  isAoE2WarManagedStream,
  resolveStreamRequestActor,
} from "@/lib/streamRequestAuth";
import {
  normalizeStreamMediaMimeType,
  normalizeStreamThumbnailUrl,
} from "@/lib/streamMedia";
import { maybeEndFinalizedStream } from "@/lib/streamFinalitySentinel";
import { toWatchStreamPayload } from "@/lib/watchStreams";
import { lockVideoBroadcaster, lockVideoSessionPrimary } from "@/lib/streamAdvisoryLocks";

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
  if (!replayKey || replayKey.startsWith("watcher:") || replayKey.startsWith("free:")) return null;
  if (replayKey.startsWith("platform:")) {
    const platformId = replayKey.slice("platform:".length);
    if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(platformId)) return null;
    const rows = await prisma.$queryRaw<Array<{ session_key: string | null }>>`
      select 'platform:' || (gs.key_events::jsonb ->> 'platform_match_id') as session_key
      from game_stats gs
      where gs.user_uid = ${userUid}
        and gs.key_events is not null
        and (gs.key_events::jsonb ->> 'platform_match_id') = ${platformId}
      order by gs.created_at desc, gs.id desc
      limit 1
    `;
    return cleanText(rows[0]?.session_key, 255) || null;
  }
  if (/^(?:[a-z]:[\\/]|[/\\]{2}|[/]|file:\/\/)/i.test(replayKey)) return null;

  const rows = await prisma.$queryRaw<Array<{ session_key: string | null }>>`
    select
      case
        when gs.key_events::jsonb ? 'platform_match_id'
        then 'platform:' || (gs.key_events::jsonb ->> 'platform_match_id')
        else ${replayKey}
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
  const rawThumbnailUrl = cleanText(body.thumbnailUrl, 256_001);
  const thumbnailUrl = rawThumbnailUrl
    ? normalizeStreamThumbnailUrl(rawThumbnailUrl) ?? undefined
    : undefined;
  const rawMediaMimeType = cleanText(body.mediaMimeType, 120);
  const mediaMimeType = rawMediaMimeType
    ? normalizeStreamMediaMimeType(rawMediaMimeType) ?? undefined
    : undefined;
  const status = cleanText(body.status, 24);

  if (rawThumbnailUrl && !thumbnailUrl) {
    return NextResponse.json(
      { detail: "Stream thumbnail is invalid." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  if (rawMediaMimeType && !mediaMimeType) {
    return NextResponse.json(
      { detail: "Only WebM stream media is accepted." },
      { status: 415, headers: NO_STORE_HEADERS }
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

  if (stream.status === "ended" || stream.status === "removed") {
    return NextResponse.json(
      { stream: toWatchStreamPayload(stream) },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  }

  const finalizedStream = await maybeEndFinalizedStream(prisma, stream);
  if (finalizedStream) {
    return NextResponse.json(
      { stream: toWatchStreamPayload(finalizedStream), finality: "replay_final" },
      { headers: NO_STORE_HEADERS }
    );
  }

  // A broadcaster started before replay discovery may send a stronger
  // current-replay claim later. Only an exact replay/platform record owned by
  // the authenticated account can promote weak stream identity. Recency,
  // player names, source window labels and filenames without proof cannot.
  const claimedSessionKey = cleanText(body.sessionKey, 255);
  const weakStreamKey =
    stream.sessionKey.startsWith("watcher:") || stream.sessionKey.startsWith("free:");
  const safeExactClaim = claimedSessionKey &&
    !claimedSessionKey.startsWith("watcher:") &&
    !claimedSessionKey.startsWith("free:") &&
    !/^(?:[a-z]:[\\/]|[/\\]{2}|[/]|file:\/\/)/i.test(claimedSessionKey);
  const replayBackedSessionKey = weakStreamKey && safeExactClaim
    ? claimedSessionKey
    : stream.sessionKey;
  const platformSessionKey =
    stream.provider === "aoe2war" && stream.sourceType === "watcher_native"
      ? await resolvePlatformSessionKeyForReplay(prisma, actor.user.uid, replayBackedSessionKey)
      : null;

  // The original stream may have been replaced/finalized after the first
  // read. Recheck status under the same account lock used by stream start.
  // Only an exact owner-proven replay key may trigger session-primary changes.
  const result = await prisma.$transaction(async (tx) => {
    await lockVideoBroadcaster(tx, actor.user.id);
    const current = await tx.gameWatchStream.findUnique({ where: { id } });
    if (!current || !isAoE2WarManagedStream(current, actor.user.id) ||
        !["starting", "live"].includes(current.status)) {
      return { updated: current, rebound: false };
    }
    const rebound = Boolean(
      platformSessionKey &&
      current.sessionKey !== platformSessionKey &&
      (current.sessionKey.startsWith("watcher:") ||
       current.sessionKey.startsWith("free:")),
    );
    if (rebound && platformSessionKey) {
      await lockVideoSessionPrimary(tx, platformSessionKey);
    }
    const priorPrimary = rebound && platformSessionKey
      ? await tx.gameWatchStream.count({
          where: {
            sessionKey: platformSessionKey,
            provider: "aoe2war",
            status: { in: ["starting", "live"] },
            isPrimary: true,
            id: { not: id },
          },
        })
      : 0;
    const updatedRows = await tx.gameWatchStream.updateMany({
      where: { id, status: { in: ["starting", "live"] } },
      data: {
        status: status === "live" ? "live" : "starting",
        lastHeartbeatAt: new Date(),
        thumbnailUrl,
        mediaMimeType,
        ...(rebound && platformSessionKey
          ? { sessionKey: platformSessionKey, isPrimary: priorPrimary === 0 }
          : {}),
      },
    });
    const updated = await tx.gameWatchStream.findUnique({ where: { id } });
    if (updatedRows.count !== 1 || !updated ||
        !["starting", "live"].includes(updated.status)) {
      return { updated, rebound: false };
    }
    if (rebound && platformSessionKey) {
      if (updated.isPrimary) {
        await tx.gameWatchStream.updateMany({
          where: {
            sessionKey: platformSessionKey, id: { not: updated.id },
            provider: "aoe2war",
            status: { in: ["starting", "live"] },
          },
          data: { isPrimary: false },
        });
      }
      await tx.gameWatchStream.updateMany({
        where: {
          OR: [
            { sessionKey: platformSessionKey },
            { sessionKey: replayBackedSessionKey },
          ],
          id: { not: updated.id },
          provider: { not: "aoe2war" },
          sourceType: "external",
          chunkCount: 0,
          status: { in: ["starting", "live"] },
        },
        data: { status: "removed", isPrimary: false },
      });
    }
    return { updated, rebound };
  }, { maxWait: 4_000, timeout: 12_000 });

  const updated = result.updated;
  if (!updated || !isAoE2WarManagedStream(updated, actor.user.id)) {
    return NextResponse.json(
      { detail: "Stream not found." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  if (!["starting", "live"].includes(updated.status)) {
    return NextResponse.json(
      { stream: toWatchStreamPayload(updated) },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }
  if (result.rebound) {
    console.info("[streams/heartbeat] exact account-owned camera promotion", {
      streamId: updated.id, sessionKey: updated.sessionKey,
    });
  }

  return NextResponse.json(
    { stream: toWatchStreamPayload(updated) },
    { headers: NO_STORE_HEADERS }
  );
}
