import { NextResponse } from "next/server";

import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ROSTER_LIMIT = 22;
const WATCHER_LIVE_WINDOW_MS = 3 * 60 * 1000;

const WATCHER_OFF_EVENTS = new Set([
  "watcher_stopped",
  "watching_stopped",
  "monitor_stop",
  "watcher_error",
]);

export async function GET() {
  const prisma = getPrisma();

  const leaderboard = await loadLobbyLeaderboard(prisma, {
    offset: 0,
    limit: ROSTER_LIMIT,
    includePendingClaimed: true,
    includeFeaturedClaimed: false,
    scope: "claimed",
    lane: "rm",
  });

  const entries = leaderboard.entries
    .filter((entry) => entry.claimed)
    .slice(0, ROSTER_LIMIT);

  const userUids = entries
    .map((entry) => entry.uid)
    .filter((value): value is string => Boolean(value));

  const cutoff = new Date(Date.now() - WATCHER_LIVE_WINDOW_MS);

  const recentEvents = userUids.length
    ? await prisma.watcherClientEvent.findMany({
        where: {
          userUid: {
            in: userUids,
          },
          createdAt: {
            gte: cutoff,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          userUid: true,
          eventType: true,
          createdAt: true,
        },
        take: 256,
      })
    : [];

  const latestByUid = new Map<
    string,
    {
      eventType: string;
      createdAt: Date;
    }
  >();

  for (const event of recentEvents) {
    if (!event.userUid || latestByUid.has(event.userUid)) continue;
    latestByUid.set(event.userUid, {
      eventType: event.eventType,
      createdAt: event.createdAt,
    });
  }

  const generatedAt = new Date();

  const players = entries.map((entry, index) => {
    const latestWatcherEvent = entry.uid
      ? latestByUid.get(entry.uid) ?? null
      : null;

    const watcherOnline = Boolean(
      latestWatcherEvent &&
        !WATCHER_OFF_EVENTS.has(latestWatcherEvent.eventType)
    );

    const watcherAgeSeconds = latestWatcherEvent
      ? Math.max(
          0,
          Math.round(
            (generatedAt.getTime() - latestWatcherEvent.createdAt.getTime()) /
              1000
          )
        )
      : null;

    return {
      seed: index + 1,
      rank: entry.rank,
      key: entry.key,
      name: entry.name,
      href: entry.href,
      uid: entry.uid,
      rating: entry.primaryRatingLabel,
      ratingSource: entry.primaryRatingSourceLabel,
      wins: entry.wins,
      losses: entry.losses,
      totalMatches: entry.totalMatches,
      watcherOnline,
      watcherAgeSeconds,
      watcherEventType: latestWatcherEvent?.eventType ?? null,
    };
  });

  return NextResponse.json(
    {
      ok: true,
      generatedAt: generatedAt.toISOString(),
      capacity: ROSTER_LIMIT,
      playerCount: players.length,
      openSlots: Math.max(0, ROSTER_LIMIT - players.length),
      players,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
