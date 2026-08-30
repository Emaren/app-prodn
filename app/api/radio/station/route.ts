import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getPrisma,
} from "@/lib/prisma";
import {
  publicRadioAssetProjection,
  RADIO_WOLO_TAGLINE,
} from "@/lib/radioWoloPublicStation";
import {
  resolveRadioStationPosition,
} from "@/lib/radioWoloStation";
import {
  getSessionUid,
} from "@/lib/session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "private, no-store, max-age=0",
  Vary: "Cookie",
};

type StationProgram = {
  id: number;
  publicId: string;
  name: string;
  items: Array<{
    id: number;
    position: number;
    transition: string;
    crossfadeMs: number;
    asset: {
      publicId: string;
      title: string;
      credit:
        | string
        | null;
      kind: string;
      durationMs: number;
    };
  }>;
};

function resolveProgramClock(
  program:
    StationProgram,
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
        typeof resolveProgramClock
      >["current"]
    | ReturnType<
        typeof resolveProgramClock
      >["next"],
  authenticated: boolean,
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
    asset:
      publicRadioAssetProjection(
        item.value.asset,
        authenticated,
      ),
  };
}

function offAirResponse(
  authenticated: boolean,
  options?: {
    startedAt?:
      | string
      | null;
    stoppedAt?:
      | string
      | null;
    endedNaturally?:
      boolean;
  },
) {
  return NextResponse.json(
    {
      station: {
        identity:
          RADIO_WOLO_TAGLINE,
        state:
          "off_air",
        authenticated,
        startedAt:
          options?.startedAt ??
          null,
        stoppedAt:
          options?.stoppedAt ??
          null,
        endedNaturally:
          options?.endedNaturally ??
          false,
        program: null,
        clock: null,
      },
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}

export async function GET(
  request: NextRequest,
) {
  const uid =
    await getSessionUid(
      request,
    );

  const authenticated =
    Boolean(uid);

  const prisma =
    getPrisma();

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
          stoppedAt:
            true,
          program: {
            select: {
              id: true,
              publicId:
                true,
              name: true,
              items: {
                orderBy: {
                  position:
                    "asc",
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
    return offAirResponse(
      authenticated,
      {
        startedAt:
          station?.startedAt?.toISOString() ??
          null,
        stoppedAt:
          station?.stoppedAt?.toISOString() ??
          null,
      },
    );
  }

  const now =
    new Date();

  const clock =
    resolveProgramClock(
      station.program,
      now.getTime() -
        station.startedAt.getTime(),
    );

  if (clock.ended) {
    const stoppedAt =
      new Date(
        station.startedAt.getTime() +
          clock.durationMs,
      );

    return offAirResponse(
      authenticated,
      {
        startedAt:
          station.startedAt.toISOString(),
        stoppedAt:
          stoppedAt.toISOString(),
        endedNaturally:
          true,
      },
    );
  }

  return NextResponse.json(
    {
      station: {
        identity:
          RADIO_WOLO_TAGLINE,
        state:
          "on_air",
        authenticated,
        startedAt:
          station.startedAt.toISOString(),
        stoppedAt:
          null,
        endedNaturally:
          false,

        program:
          authenticated
            ? {
                name:
                  station.program
                    .name,
              }
            : null,

        clock: {
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
              authenticated,
            ),
          next:
            serializeClockItem(
              clock.next,
              authenticated,
            ),
        },
      },
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}
