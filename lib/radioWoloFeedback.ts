import type {
  PrismaClient,
} from "@/lib/generated/prisma";
import {
  resolveRadioStationPosition,
} from "@/lib/radioWoloStation";

export async function resolveCurrentRadioAsset(
  prisma: PrismaClient,
  now = new Date(),
) {
  const station =
    await prisma.radioStationState.findUnique(
      {
        where: {
          id: 1,
        },
        select: {
          state: true,
          startedAt:
            true,
          program: {
            select: {
              items: {
                orderBy: {
                  position:
                    "asc",
                },
                select: {
                  position:
                    true,
                  transition:
                    true,
                  crossfadeMs:
                    true,
                  asset: {
                    select: {
                      id: true,
                      publicId:
                        true,
                      title: true,
                      credit:
                        true,
                      kind: true,
                      durationMs:
                        true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    );

  if (
    !station ||
    station.state !==
      "on_air" ||
    !station.startedAt ||
    !station.program
  ) {
    return null;
  }

  const clock =
    resolveRadioStationPosition(
      station.program.items.map(
        (item) => ({
          value: item,
          durationMs:
            item.asset
              .durationMs,
          transition:
            item.transition,
          crossfadeMs:
            item.crossfadeMs,
        }),
      ),
      now.getTime() -
        station.startedAt.getTime(),
    );

  if (
    clock.ended ||
    !clock.current
  ) {
    return null;
  }

  return (
    clock.current.value
      .asset
  );
}
