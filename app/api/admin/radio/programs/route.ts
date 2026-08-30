import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  calculateRadioProgramDurationMs,
  normalizeRadioProgramName,
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

  const programs =
    await gate.prisma.radioProgram.findMany(
      {
        where: {
          status: {
            not:
              "archived",
          },
        },
        orderBy: [
          {
            updatedAt:
              "desc",
          },
          {
            id: "desc",
          },
        ],
        take: 250,
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
    );

  return NextResponse.json(
    {
      programs:
        programs.map(
          (program) => {
            const durationItems =
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
              );

            return {
              id:
                program.id,
              publicId:
                program.publicId,
              name:
                program.name,
              targetDurationMs:
                program.targetDurationMs,
              builtDurationMs:
                calculateRadioProgramDurationMs(
                  durationItems,
                ),
              itemCount:
                program.items
                  .length,
              status:
                program.status,
              createdAt:
                program.createdAt.toISOString(),
              updatedAt:
                program.updatedAt.toISOString(),
            };
          },
        ),
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}

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

  if (!body) {
    return NextResponse.json(
      {
        detail:
          "Invalid Radio WOLO program.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const name =
    normalizeRadioProgramName(
      body.name,
    );

  const targetDurationMs =
    normalizeRadioProgramTargetDurationMs(
      body.targetDurationMs ??
        3_600_000,
    );

  if (
    !name ||
    targetDurationMs ===
      null
  ) {
    return NextResponse.json(
      {
        detail:
          "A program name and valid target duration are required.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const program =
    await gate.prisma.radioProgram.create(
      {
        data: {
          name,
          targetDurationMs,
          status:
            "draft",
          createdByUid:
            gate.user.uid,
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
        },
      },
    );

  return NextResponse.json(
    {
      ok: true,
      program: {
        ...program,
        builtDurationMs:
          0,
        itemCount: 0,
        createdAt:
          program.createdAt.toISOString(),
        updatedAt:
          program.updatedAt.toISOString(),
      },
    },
    {
      status: 201,
      headers:
        NO_STORE_HEADERS,
    },
  );
}
