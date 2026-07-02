import { Prisma, type GameWatchStream, type PrismaClient } from "@/lib/generated/prisma";
import { AOE2WAR_STREAM_SOURCE_TYPES } from "@/lib/streamRequestAuth";

const ACTIVE_STREAM_STATUSES = ["starting", "live"] as const;
const MANAGED_SOURCE_TYPES = new Set<string>(AOE2WAR_STREAM_SOURCE_TYPES);

type StreamCandidate = {
  id: number;
  sessionKey: string;
  provider: string;
  sourceType?: string | null;
  status: string;
};

type FinalReplayRow = {
  id: number;
  created_at: Date;
};

function clean(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function streamBasename(value: string) {
  const trimmed = clean(value);
  if (!trimmed) return "";
  return trimmed.split(/[\\/]/).pop() || trimmed;
}

function platformIdFromSessionKey(value: string) {
  const trimmed = clean(value);
  if (!trimmed.toLowerCase().startsWith("platform:")) return "";
  return trimmed.slice("platform:".length).trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

async function findFinalReplayForStream(prisma: PrismaClient, stream: StreamCandidate) {
  const sessionKey = clean(stream.sessionKey);
  if (!sessionKey) return null;

  const basename = streamBasename(sessionKey);
  const platformId = platformIdFromSessionKey(sessionKey);
  const candidates = unique([sessionKey, basename, platformId]);

  const rows = await prisma.$queryRaw<FinalReplayRow[]>(Prisma.sql`
    with candidates(value) as (
      values
        (${candidates[0] ?? ""}),
        (${candidates[1] ?? ""}),
        (${candidates[2] ?? ""})
    )
    select gs.id, gs.created_at
    from game_stats gs
    where gs.is_final = true
      and nullif(trim(coalesce(gs.winner, '')), '') is not null
      and coalesce(gs.winner, '') <> 'Unknown'
      and (
        exists (
          select 1
          from candidates c
          where c.value is not null
            and c.value <> ''
            and (
              lower(gs.replay_file) = lower(c.value)
              or lower(coalesce(gs.original_filename, '')) = lower(c.value)
            )
        )
        or (
          ${platformId} <> ''
          and gs.key_events is not null
          and gs.key_events::jsonb ->> 'platform_match_id' = ${platformId}
        )
        or (
          ${sessionKey} like 'platform:%'
          and gs.key_events is not null
          and 'platform:' || (gs.key_events::jsonb ->> 'platform_match_id') = ${sessionKey}
        )
      )
    order by gs.created_at desc
    limit 1
  `);

  return rows[0] ?? null;
}

export async function maybeEndFinalizedStream(prisma: PrismaClient, stream: StreamCandidate): Promise<GameWatchStream | null> {
  if (!stream || stream.provider !== "aoe2war") return null;
  if (!MANAGED_SOURCE_TYPES.has(stream.sourceType || "")) return null;
  if (!ACTIVE_STREAM_STATUSES.includes(stream.status as (typeof ACTIVE_STREAM_STATUSES)[number])) return null;

  const finalReplay = await findFinalReplayForStream(prisma, stream);
  if (!finalReplay) return null;

  const now = new Date();

  await prisma.gameWatchStream.updateMany({
    where: {
      id: stream.id,
      status: {
        in: [...ACTIVE_STREAM_STATUSES],
      },
    },
    data: {
      status: "ended",
      endedAt: now,
      updatedAt: now,
    },
  });

  const updated = await prisma.gameWatchStream.findUnique({
    where: { id: stream.id },
  });

  if (updated) {
    console.info("[streams/finality-sentinel] ended stream after final replay", {
      streamId: updated.id,
      sessionKey: updated.sessionKey,
      sourceType: updated.sourceType,
      finalGameStatsId: finalReplay.id,
    });
  }

  return updated;
}

export async function maybeEndFinalizedStreams(prisma: PrismaClient) {
  const streams = await prisma.gameWatchStream.findMany({
    where: {
      provider: "aoe2war",
      sourceType: {
        in: [...AOE2WAR_STREAM_SOURCE_TYPES],
      },
      status: {
        in: [...ACTIVE_STREAM_STATUSES],
      },
    },
    orderBy: [
      { lastHeartbeatAt: "desc" },
      { updatedAt: "desc" },
    ],
    take: 50,
  });

  const results = await Promise.allSettled(
    streams.map((stream) => maybeEndFinalizedStream(prisma, stream))
  );

  return {
    checked: streams.length,
    ended: results.filter((result) => result.status === "fulfilled" && result.value).length,
  };
}
