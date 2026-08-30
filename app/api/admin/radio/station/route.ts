import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireRadioWoloOperator,
} from "@/lib/radioWoloOperator";
import {
  resolveRadioStationPosition,
} from "@/lib/radioWoloStation";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "private, no-store, max-age=0",
};

const PROGRAM_SELECT = {
  id: true,
  publicId: true,
  name: true,
  targetDurationMs: true,
  status: true,
  items: {
    orderBy: {
      position:
        "asc" as const,
    },
    select: {
      id: true,
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
          credit: true,
          kind: true,
          durationMs:
            true,
          status: true,
        },
      },
    },
  },
};

function stationTimeline(
  program: {
    items: Array<{
      id: number;
      position: number;
      transition: string;
      crossfadeMs: number;
      asset: {
        id: number;
        publicId: string;
        title: string;
        credit:
          | string
          | null;
        kind: string;
        durationMs: number;
        status: string;
      };
    }>;
  },
  elapsedMs: number,
) {
  return resolveRadioStationPosition(
    program.items.map(
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
    elapsedMs,
  );
}

function serializeClockItem(
  item:
    | ReturnType<
        typeof stationTimeline
      >["current"]
    | ReturnType<
        typeof stationTimeline
      >["next"],
) {
  if (!item) {
    return null;
  }

  return {
    position:
      item.position,
    startMs:
      item.startMs,
    endMs:
      item.endMs,
    durationMs:
      item.durationMs,
    transition:
      item.transition,
    crossfadeMs:
      item.crossfadeMs,
    overlapMs:
      item.overlapMs,
    ...(
      "offsetMs" in item
        ? {
            offsetMs:
              item.offsetMs,
            remainingMs:
              item.remainingMs,
          }
        : {}
    ),
    asset: {
      id:
        item.value.asset.id,
      publicId:
        item.value.asset
          .publicId,
      title:
        item.value.asset
          .title,
      credit:
        item.value.asset
          .credit,
      kind:
        item.value.asset
          .kind,
      durationMs:
        item.value.asset
          .durationMs,
    },
  };
}

export async function GET(
  request: NextRequest,
) {
  const gate =
    await requireRadioWoloOperator(
      request,
    );

  if ("error" in gate) {
    return gate.error;
  }

  let station =
    await gate.prisma.radioStationState.upsert(
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
        select: {
          id: true,
          programId:
            true,
          state: true,
          startedAt:
            true,
          stoppedAt:
            true,
          launchedByUid:
            true,
          updatedAt:
            true,
          program: {
            select:
              PROGRAM_SELECT,
          },
        },
      },
    );

  const now =
    new Date();

  let clock:
    ReturnType<
      typeof stationTimeline
    > | null = null;

  let endedNaturally =
    false;

  if (
    station.state ===
      "on_air" &&
    station.startedAt &&
    station.program
  ) {
    clock =
      stationTimeline(
        station.program,
        now.getTime() -
          station.startedAt.getTime(),
      );

    if (clock.ended) {
      const naturalStop =
        new Date(
          station.startedAt.getTime() +
            clock.durationMs,
        );

      station =
        await gate.prisma.radioStationState.update(
          {
            where: {
              id: 1,
            },
            data: {
              state:
                "off_air",
              stoppedAt:
                naturalStop,
            },
            select: {
              id: true,
              programId:
                true,
              state: true,
              startedAt:
                true,
              stoppedAt:
                true,
              launchedByUid:
                true,
              updatedAt:
                true,
              program: {
                select:
                  PROGRAM_SELECT,
              },
            },
          },
        );

      clock = null;

      endedNaturally =
        true;
    }
  }

  return NextResponse.json(
    {
      station: {
        state:
          station.state,
        startedAt:
          station.startedAt?.toISOString() ??
          null,
        stoppedAt:
          station.stoppedAt?.toISOString() ??
          null,
        endedNaturally,
        program:
          station.program
            ? {
                id:
                  station.program
                    .id,
                publicId:
                  station.program
                    .publicId,
                name:
                  station.program
                    .name,
                targetDurationMs:
                  station.program
                    .targetDurationMs,
                status:
                  station.program
                    .status,
                itemCount:
                  station.program
                    .items
                    .length,
              }
            : null,
        clock:
          clock
            ? {
                now:
                  now.toISOString(),
                elapsedMs:
                  clock.elapsedMs,
                durationMs:
                  clock.durationMs,
                remainingMs:
                  clock.remainingMs,
                current:
                  serializeClockItem(
                    clock.current,
                  ),
                next:
                  serializeClockItem(
                    clock.next,
                  ),
              }
            : null,
      },
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}
