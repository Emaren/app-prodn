import type {
  PrismaClient,
} from "@/lib/generated/prisma";

import type {
  LobbyMatchRow,
} from "@/lib/lobby";

export async function hydrateLobbyDesyncMarkers(
  prisma: PrismaClient,
  rows: LobbyMatchRow[]
): Promise<LobbyMatchRow[]> {
  const gameStatsIds = [
    ...new Set(
      rows
        .map((row) => Number(row.id))
        .filter(
          (id) =>
            Number.isSafeInteger(id) &&
            id > 0
        )
    ),
  ];

  if (gameStatsIds.length === 0) {
    return rows;
  }

  /*
   * Desync truth is append-only.
   *
   * Read newest-first across the requested battles and retain
   * only the first row seen for each gameStatsId. That gives the
   * effective current human desync conclusion without rewriting
   * or collapsing historical incident provenance.
   */
  const incidents =
    await prisma.replayDesyncIncident.findMany({
      where: {
        gameStatsId: {
          in: gameStatsIds,
        },
      },

      orderBy: [
        {
          createdAt:
            "desc",
        },
        {
          id:
            "desc",
        },
      ],

      select: {
        gameStatsId:
          true,

        desyncOccurred:
          true,
      },
    });

  const currentTruth =
    new Map<
      number,
      boolean
    >();

  for (
    const incident of
    incidents
  ) {
    if (
      currentTruth.has(
        incident.gameStatsId
      )
    ) {
      continue;
    }

    currentTruth.set(
      incident.gameStatsId,
      incident.desyncOccurred
    );
  }

  return rows.map(
    (row) => ({
      ...row,

      humanConfirmedDesync:
        currentTruth.get(
          row.id
        ) === true,
    })
  );
}
