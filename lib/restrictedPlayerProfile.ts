import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma";

export type PublicWatcherActivity = {
  eventCount: number;
  streamedGames: number;
  hasWatcherKey: boolean;
  lastWatcherAt: string | null;
};

export async function loadRestrictedWatcherActivity(
  prisma: Pick<PrismaClient, "$queryRaw">, uid: string,
): Promise<PublicWatcherActivity | null> {
  const rows = await prisma.$queryRaw<Array<{
    eventCount: bigint; streamedGames: bigint; hasWatcherKey: boolean; lastWatcherAt: Date | null;
  }>>`
    SELECT "eventCount", "streamedGames", "hasWatcherKey", "lastWatcherAt"
    FROM aoe2war_public_v6.champions_chaos_activity
    WHERE "userUid" = ${uid}
  `;
  const row = rows[0];
  if (!row) return null;
  const eventCount = Number(row.eventCount), streamedGames = Number(row.streamedGames);
  if (!Number.isSafeInteger(eventCount) || eventCount < 0 ||
      !Number.isSafeInteger(streamedGames) || streamedGames < 0) return null;
  return { eventCount, streamedGames, hasWatcherKey: row.hasWatcherKey,
    lastWatcherAt: row.lastWatcherAt?.toISOString() ?? null };
}

/** Caller must supply the authenticated viewer, never a requested profile UID. */
export async function loadRestrictedViewerMemberships(
  prisma: Pick<PrismaClient, "$queryRaw">, viewerUid: string | null, gameIds: number[],
): Promise<Set<number>> {
  const ids = [...new Set(gameIds.filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!viewerUid || !ids.length) return new Set();
  const digest = createHash("sha256").update(viewerUid, "utf8").digest("hex");
  const rows = await prisma.$queryRaw<Array<{ gameStatsId: number }>>(Prisma.sql`
    SELECT "gameStatsId" FROM aoe2war_public_v10.viewer_final_replay_memberships
    WHERE "viewerUidSha256" = ${digest} AND "gameStatsId" IN (${Prisma.join(ids)})
  `);
  const requested = new Set(ids);
  return new Set(rows.map(row => row.gameStatsId).filter(id => requested.has(id)));
}

/** Exact Steam candidate identity through the admitted accepted-projection view.
 * Final-corpus and participant checks remain in the profile caller. */
export async function loadRestrictedExactSteamSnapshots(
  prisma: Pick<PrismaClient, "$queryRaw">, steamId: string,
): Promise<Array<{ gameStatsId: number; displayName: string }>> {
  return prisma.$queryRaw<Array<{ gameStatsId: number; displayName: string }>>`
    SELECT s.game_stats_id AS "gameStatsId", s.display_name AS "displayName"
    FROM public.replay_player_snapshots AS s
    JOIN aoe2war_public_v1.accepted_replay_projections AS p ON p.id = s.projection_id
    WHERE s.player_key = ${`steam:${steamId}`}
  `;
}
