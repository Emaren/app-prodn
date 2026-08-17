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

let rawCorpusCache: RawCorpusCacheEntry | null = null;
let rawCorpusPromise:
  Promise<PublicLeaderboardRawGame[]> | null =
  null;

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

  const run = prisma.gameStats.findMany({
    where: {
      is_final: true,
      NOT: {
        parse_reason:
          "superseded_by_later_upload",
      },
    },
    orderBy: [
      { timestamp: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
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
  }) as Promise<PublicLeaderboardRawGame[]>;

  rawCorpusPromise = run;

  try {
    const value = await run;

    rawCorpusCache = {
      expiresAt:
        Date.now() +
        RAW_CORPUS_TTL_MS,
      value,
    };

    return value;
  } finally {
    if (rawCorpusPromise === run) {
      rawCorpusPromise = null;
    }
  }
}

export function invalidatePublicLeaderboardRawGameCache() {
  rawCorpusCache = null;
  rawCorpusPromise = null;
}
