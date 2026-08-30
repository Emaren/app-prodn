import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  calculateRadioProgramDurationMs,
  normalizeRadioProgramItems,
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

export async function PUT(
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

  const programId =
    Number(rawId);

  if (
    !Number.isSafeInteger(
      programId,
    ) ||
    programId <= 0
  ) {
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

  const items =
    normalizeRadioProgramItems(
      body?.items,
    );

  if (items === null) {
    return NextResponse.json(
      {
        detail:
          "Invalid Radio WOLO program chain.",
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
          status: true,
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
    program.status ===
    "archived"
  ) {
    return NextResponse.json(
      {
        detail:
          "Archived Radio WOLO programs cannot be edited.",
      },
      {
        status: 409,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const distinctAssetIds =
    Array.from(
      new Set(
        items.map(
          (item) =>
            item.assetId,
        ),
      ),
    );

  const assets =
    distinctAssetIds.length
      ? await gate.prisma.radioAsset.findMany(
          {
            where: {
              id: {
                in:
                  distinctAssetIds,
              },
              status:
                "ready",
            },
            select: {
              id: true,
              durationMs:
                true,
            },
          },
        )
      : [];

  if (
    assets.length !==
    distinctAssetIds.length
  ) {
    return NextResponse.json(
      {
        detail:
          "Every program item must reference an active ready Vault asset.",
      },
      {
        status: 409,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const assetById =
    new Map(
      assets.map(
        (asset) => [
          asset.id,
          asset,
        ],
      ),
    );

  const durationItems =
    items.map(
      (item) => ({
        durationMs:
          assetById.get(
            item.assetId,
          )?.durationMs ??
          0,
        transition:
          item.transition,
        crossfadeMs:
          item.crossfadeMs,
      }),
    );

  await gate.prisma.$transaction(
    async (tx) => {
      await tx.radioProgramItem.deleteMany(
        {
          where: {
            programId,
          },
        },
      );

      if (
        items.length
      ) {
        await tx.radioProgramItem.createMany(
          {
            data:
              items.map(
                (
                  item,
                  index,
                ) => ({
                  programId,
                  assetId:
                    item.assetId,
                  position:
                    index,
                  transition:
                    item.transition,
                  crossfadeMs:
                    item.crossfadeMs,
                }),
              ),
          },
        );
      }

      await tx.radioProgram.update(
        {
          where: {
            id:
              programId,
          },
          data: {
            status:
              "draft",
          },
        },
      );
    },
  );

  return NextResponse.json(
    {
      ok: true,
      itemCount:
        items.length,
      builtDurationMs:
        calculateRadioProgramDurationMs(
          durationItems,
        ),
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}
