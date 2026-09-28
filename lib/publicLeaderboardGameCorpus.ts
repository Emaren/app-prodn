import type { PrismaClient } from "@/lib/generated/prisma";
import {
  EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
} from "@/lib/replayAdjudications";
import { createGenerationKeyedLoader } from "@/lib/generationKeyedLoader";
import { loadPublicReplayGeneration } from "@/lib/publicReplayGeneration";

export type PublicLeaderboardRawGame = {
  createdAt: Date;
  event_types: unknown;
  id: number;
  is_final: boolean;
  key_events: unknown;
  original_filename: string | null;
  played_on: Date | null;
  players: unknown;
  replay_file: string | null;
  replayHash: string | null;
  timestamp: Date | null;
  winner: string | null;
  parse_reason: string | null;
  parse_source: string | null;
  replayResultAdjudications: unknown;
};

const loadRawCorpusByGeneration =
  createGenerationKeyedLoader<
    PrismaClient,
    PublicLeaderboardRawGame[]
  >(2);

/*
 * Manual mutation invalidation participates in the key as a local epoch.
 * This preserves immediate same-process invalidation even inside the replay
 * generation's one-second read-coalescing window.
 */
let rawCorpusGeneration = 0;

async function loadPublicLeaderboardSnapshotMaxId(
  prisma: PrismaClient,
): Promise<number | null> {
  const rows = await prisma.gameStats.findMany({
    where: {
      is_final: true,
      NOT: {
        parse_reason:
          "superseded_by_later_upload",
      },
    },

    orderBy: [
      {
        id: "desc",
      },
    ],

    take: 1,

    select: {
      id: true,
    },
  });

  /*
   * Production returns at most one row. Taking the maximum also keeps simple
   * test doubles that ignore query arguments deterministic.
   */
  let maxId: number | null = null;

  for (const row of rows) {
    if (
      typeof row.id === "number" &&
      (maxId === null || row.id > maxId)
    ) {
      maxId = row.id;
    }
  }

  return maxId;
}

async function loadPublicLeaderboardRawGamePage(
  prisma: PrismaClient,
  afterId: number | null,
  snapshotMaxId: number,
): Promise<PublicLeaderboardRawGame[]> {
  const run = prisma.gameStats.findMany({
    where: {
      is_final: true,

      NOT: {
        parse_reason:
          "superseded_by_later_upload",
      },

      id:
        afterId === null
          ? {
              lte: snapshotMaxId,
            }
          : {
              gt: afterId,
              lte: snapshotMaxId,
            },
    },

    /*
     * This is transport order only.
     *
     * Leaderboard and player-directory consumers perform their canonical
     * played-at/evidence ordering after adjudication and cleanup.
     */
    orderBy: [
      {
        id: "asc",
      },
    ],

    take:
      RAW_CORPUS_PAGE_SIZE,

    select: {
      createdAt: true,
      event_types: true,
      id: true,
      is_final: true,
      key_events: true,
      original_filename: true,
      played_on: true,
      players: true,
      replay_file: true,
      replayHash: true,
      timestamp: true,
      winner: true,
      parse_reason: true,
      parse_source: true,
      replayResultAdjudications:
        EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
    },
  });

  return run as Promise<
    PublicLeaderboardRawGame[]
  >;
}

async function loadPublicLeaderboardRawGamesFresh(
  prisma: PrismaClient,
): Promise<PublicLeaderboardRawGame[]> {
  const snapshotMaxId =
    await loadPublicLeaderboardSnapshotMaxId(
      prisma,
    );

  if (snapshotMaxId === null) {
    return [];
  }

  const result:
    PublicLeaderboardRawGame[] = [];

  let afterId: number | null = null;

  while (true) {
    const page =
      await loadPublicLeaderboardRawGamePage(
        prisma,
        afterId,
        snapshotMaxId,
      );

    result.push(...page);

    if (
      page.length <
      RAW_CORPUS_PAGE_SIZE
    ) {
      break;
    }

    const nextAfterId =
      page[page.length - 1]?.id;

    if (
      typeof nextAfterId !== "number" ||
      nextAfterId <=
        (afterId ?? 0)
    ) {
      throw new Error(
        "public leaderboard raw-game paging did not advance",
      );
    }

    afterId = nextAfterId;
  }

  return result;
}

export async function loadPublicLeaderboardRawGames(
  prisma: PrismaClient,
  replayGeneration: string | null = null,
): Promise<PublicLeaderboardRawGame[]> {
  let generation =
    replayGeneration;

  if (!generation) {
    try {
      generation =
        await loadPublicReplayGeneration(
          prisma,
        );
    } catch (error) {
      // Correctness wins over reuse when generation authority is unavailable.
      // Do not retain an unversioned lifetime corpus.
      console.warn(
        "Public leaderboard replay generation unavailable; loading fresh corpus:",
        error,
      );
      return loadPublicLeaderboardRawGamesFresh(
        prisma,
      );
    }
  }

  const cacheKey =
    `${generation}:epoch:${rawCorpusGeneration}`;

  return loadRawCorpusByGeneration(
    prisma,
    cacheKey,
    () =>
      loadPublicLeaderboardRawGamesFresh(
        prisma,
      ),
  );
}

export function invalidatePublicLeaderboardRawGameCache() {
  rawCorpusGeneration += 1;
}
