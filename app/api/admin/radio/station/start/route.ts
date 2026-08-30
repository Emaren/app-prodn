import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireRadioWoloOperator,
} from "@/lib/radioWoloOperator";
import {
  buildRadioProgramTimeline,
} from "@/lib/radioWoloStation";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "private, no-store, max-age=0",
};

export async function POST(
  request: NextRequest,
) {
  const gate =
    await requireRadioWoloOperator(
      request,
    );

  if ("error" in gate) {
    return gate.error;
  }

  const body =
    (await request
      .json()
      .catch(
        () => null,
      )) as
      | Record<
          string,
          unknown
        >
      | null;

  const programId =
    Number(
      body?.programId,
    );

  if (
    !Number.isSafeInteger(
      programId,
    ) ||
    programId <= 0
  ) {
    return NextResponse.json(
      {
        detail:
          "Choose a valid Radio WOLO program.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const program =
    await gate.prisma.radioProgram.findUnique(
      {
        where: {
          id:
            programId,
        },
        select: {
          id: true,
          name: true,
          status: true,
          items: {
            orderBy: {
              position:
                "asc",
            },
            select: {
              transition:
                true,
              crossfadeMs:
                true,
              asset: {
                select: {
                  id: true,
                  title: true,
                  durationMs:
                    true,
                  status: true,
                },
              },
            },
          },
        },
      },
    );

  if (!program) {
    return NextResponse.json(
      {
        detail:
          "Radio WOLO program not found.",
      },
      {
        status: 404,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  if (
    program.status !==
    "ready"
  ) {
    return NextResponse.json(
      {
        detail:
          "Only a READY Radio WOLO program can go on air.",
      },
      {
        status: 409,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  if (
    program.items.length ===
    0
  ) {
    return NextResponse.json(
      {
        detail:
          "The Radio WOLO program has no broadcast items.",
      },
      {
        status: 409,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const unavailable =
    program.items.find(
      (item) =>
        item.asset.status !==
        "ready",
    );

  if (unavailable) {
    return NextResponse.json(
      {
        detail:
          `Vault asset "${unavailable.asset.title}" is not ready for broadcast.`,
      },
      {
        status: 409,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const timeline =
    buildRadioProgramTimeline(
      program.items.map(
        (item) => ({
          value:
            item.asset.id,
          durationMs:
            item.asset
              .durationMs,
          transition:
            item.transition,
          crossfadeMs:
            item.crossfadeMs,
        }),
      ),
    );

  if (
    timeline.durationMs <=
    0
  ) {
    return NextResponse.json(
      {
        detail:
          "The Radio WOLO program has no playable duration.",
      },
      {
        status: 409,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const now =
    new Date();

  const result =
    await gate.prisma.$transaction(
      async (tx) => {
        await tx.radioStationState.upsert(
          {
            where: {
              id: 1,
            },
            create: {
              id: 1,
              state:
                "off_air",
            },
            update: {},
          },
        );

        const current =
          await tx.radioStationState.findUnique(
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
                        transition:
                          true,
                        crossfadeMs:
                          true,
                        asset: {
                          select: {
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
          current?.state ===
            "on_air" &&
          current.startedAt &&
          current.program
        ) {
          const currentTimeline =
            buildRadioProgramTimeline(
              current.program.items.map(
                (item) => ({
                  value: null,
                  durationMs:
                    item.asset
                      .durationMs,
                  transition:
                    item.transition,
                  crossfadeMs:
                    item.crossfadeMs,
                }),
              ),
            );

          const ended =
            now.getTime() -
              current.startedAt.getTime() >=
            currentTimeline.durationMs;

          if (!ended) {
            return {
              conflict:
                true,
            };
          }

          await tx.radioStationState.update(
            {
              where: {
                id: 1,
              },
              data: {
                state:
                  "off_air",
                stoppedAt:
                  new Date(
                    current.startedAt.getTime() +
                      currentTimeline.durationMs,
                  ),
              },
            },
          );
        }

        const claimed =
          await tx.radioStationState.updateMany(
            {
              where: {
                id: 1,
                state:
                  "off_air",
              },
              data: {
                programId,
                state:
                  "on_air",
                startedAt:
                  now,
                stoppedAt:
                  null,
                launchedByUid:
                  gate.user
                    .uid,
              },
            },
          );

        if (
          claimed.count !==
          1
        ) {
          return {
            conflict:
              true,
          };
        }

        return {
          conflict:
            false,
        };
      },
    );

  if (
    result.conflict
  ) {
    return NextResponse.json(
      {
        detail:
          "Radio WOLO is already on air. Stop the current transmission before launching another program.",
      },
      {
        status: 409,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      station: {
        state:
          "on_air",
        programId,
        programName:
          program.name,
        startedAt:
          now.toISOString(),
        durationMs:
          timeline.durationMs,
      },
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}
