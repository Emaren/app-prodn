import type {
  PrismaClient,
} from "@/lib/generated/prisma";

import type {
  LobbyMatchRow,
} from "@/lib/lobby";

const REVIEW_SCREENSHOT_PURPOSE_PREFIX =
  "replay_review_screenshot:";

export async function hydrateLobbyHumanEvidenceMarkers(
  prisma: PrismaClient,
  rows: LobbyMatchRow[]
): Promise<LobbyMatchRow[]> {
  const gameStatsIds = [
    ...new Set(
      rows
        .map((row) =>
          Number(row.id)
        )
        .filter(
          (id) =>
            Number.isSafeInteger(id) &&
            id > 0
        )
    ),
  ];

  if (
    gameStatsIds.length === 0
  ) {
    return rows;
  }

  const links =
    await prisma.replayEvidenceLink.findMany({
      where: {
        gameStatsId: {
          in:
            gameStatsIds,
        },

        purpose: {
          startsWith:
            REVIEW_SCREENSHOT_PURPOSE_PREFIX,
        },
      },

      select: {
        gameStatsId:
          true,
      },
    });

  const counts =
    new Map<
      number,
      number
    >();

  for (
    const link of
    links
  ) {
    if (
      typeof link.gameStatsId !==
      "number"
    ) {
      continue;
    }

    counts.set(
      link.gameStatsId,
      (
        counts.get(
          link.gameStatsId
        ) || 0
      ) + 1
    );
  }

  return rows.map(
    (row) => {
      const count =
        counts.get(
          row.id
        ) || 0;

      if (
        count === 0
      ) {
        return {
          ...row,

          humanSuppliedEvidence:
            false,

          humanSuppliedEvidenceCount:
            0,
        };
      }

      return {
        ...row,

        humanSuppliedEvidence:
          true,

        humanSuppliedEvidenceCount:
          count,
      };
    }
  );
}
