import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  calculateRadioProgramDurationMs,
  normalizeRadioProgramName,
  normalizeRadioProgramStatus,
  normalizeRadioProgramTargetDurationMs,
} from "@/lib/radioWoloPrograms";
import {
  requireRadioWoloOperator,
} from "@/lib/radioWoloOperator";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "private, no-store, max-age=0",
};

function parseProgramId(
  value: string,
) {
  const id =
    Number(value);

  return Number.isSafeInteger(
    id,
  ) && id > 0
    ? id
    : null;
}

export async function GET(
  request: NextRequest,
  context: {
    params:
      Promise<{
        id: string;
      }>;
  },
) {
  const gate =
    await requireRadioWoloOperator(
      request,
    );

  if ("error" in gate) {
    return gate.error;
  }

  const {
    id: rawId,
  } = await context.params;

  const id =
    parseProgramId(
      rawId,
    );

  if (id === null) {
    return NextResponse.json(
      {
        detail:
          "Invalid Radio WOLO program id.",
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
          id,
        },
        select: {
          id: true,
          publicId: true,
          name: true,
          targetDurationMs:
            true,
          status: true,
          createdAt: true,
          updatedAt: true,
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
                  id: true,
                  publicId:
                    true,
                  title: true,
                  credit:
                    true,
                  kind: true,
                  tags: true,
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

  const builtDurationMs =
    calculateRadioProgramDurationMs(
      program.items.map(
        (item) => ({
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

  return NextResponse.json(
    {
      program: {
        ...program,
        builtDurationMs,
        createdAt:
          program.createdAt.toISOString(),
        updatedAt:
          program.updatedAt.toISOString(),
      },
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}

export async function PATCH(
  request: NextRequest,
  context: {
    params:
      Promise<{
        id: string;
      }>;
  },
) {
  const gate =
    await requireRadioWoloOperator(
      request,
    );

  if ("error" in gate) {
    return gate.error;
  }

  const {
    id: rawId,
  } = await context.params;

  const id =
    parseProgramId(
      rawId,
    );

  if (id === null) {
    return NextResponse.json(
      {
        detail:
          "Invalid Radio WOLO program id.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
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

  if (!body) {
    return NextResponse.json(
      {
        detail:
          "Invalid Radio WOLO program update.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const existing =
    await gate.prisma.radioProgram.findUnique(
      {
        where: {
          id,
        },
        select: {
          id: true,
          name: true,
          targetDurationMs:
            true,
          status: true,
        },
      },
    );

  const activeStation =
    await gate.prisma.radioStationState.findUnique(
      {
        where: {
          id: 1,
        },
        select: {
          state: true,
          programId: true,
        },
      },
    );

  if (
    activeStation?.state === "on_air" &&
    activeStation.programId === id
  ) {
    return NextResponse.json(
      {
        detail:
          "That Radio WOLO program is currently on air.",
      },
      {
        status: 409,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  if (!existing) {
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

  const name =
    body.name ===
    undefined
      ? existing.name
      : normalizeRadioProgramName(
          body.name,
        );

  const targetDurationMs =
    body.targetDurationMs ===
    undefined
      ? existing.targetDurationMs
      : normalizeRadioProgramTargetDurationMs(
          body.targetDurationMs,
        );

  const status =
    body.status ===
    undefined
      ? normalizeRadioProgramStatus(
          existing.status,
        )
      : normalizeRadioProgramStatus(
          body.status,
        );

  if (
    !name ||
    targetDurationMs ===
      null ||
    status === null
  ) {
    return NextResponse.json(
      {
        detail:
          "Invalid Radio WOLO program metadata.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  await gate.prisma.radioProgram.update(
    {
      where: {
        id,
      },
      data: {
        name,
        targetDurationMs,
        status,
      },
    },
  );

  return NextResponse.json(
    {
      ok: true,
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}
