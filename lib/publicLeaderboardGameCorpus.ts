import type { PrismaClient } from "@/lib/generated/prisma";
import {
  EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
} from "@/lib/replayAdjudications";

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

type RawCorpusCacheEntry = {
  expiresAt: number;
  value: PublicLeaderboardRawGame[];
};

const RAW_CORPUS_TTL_MS = 15_000;

/*
 * Historical public leaderboard truth must remain complete.
 *
 * The old implementation fetched the complete wide final-game corpus in one
 * PostgreSQL result stream. That preserved truth but could push multi-megabyte
 * result sets through PostgreSQL -> Next.js in one burst.
 *
 * Keep lifetime truth. Bound transport.
 */
const RAW_CORPUS_PAGE_SIZE = 1_000;

let rawCorpusCache: RawCorpusCacheEntry | null = null;

let rawCorpusPromise:
  Promise<PublicLeaderboardRawGame[]> | null =
  null;

/*
 * Identity mutation may invalidate this corpus while a refresh is still
 * running. The generation fence prevents that stale refresh from restoring
 * itself into cache after invalidation.
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
): Promise<PublicLeaderboardRawGame[]> {
  const now = Date.now();

  if (
    rawCorpusCache &&
    rawCorpusCache.expiresAt > now
  ) {
    return rawCorpusCache.value;
  }

  if (rawCorpusPromise) {
    return rawCorpusPromise;
  }

  const generation =
    rawCorpusGeneration;

  const run =
    loadPublicLeaderboardRawGamesFresh(
      prisma,
    );

  rawCorpusPromise = run;

  try {
    const value = await run;

    if (
      generation ===
      rawCorpusGeneration
    ) {
      rawCorpusCache = {
        expiresAt:
          Date.now() +
          RAW_CORPUS_TTL_MS,
        value,
      };
    }

    return value;
  } finally {
    if (rawCorpusPromise === run) {
      rawCorpusPromise = null;
    }
  }
}

export function invalidatePublicLeaderboardRawGameCache() {
  rawCorpusGeneration += 1;
  rawCorpusCache = null;
  rawCorpusPromise = null;
}
