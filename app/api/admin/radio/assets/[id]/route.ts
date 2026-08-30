import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  normalizeRadioAssetCredit,
  normalizeRadioAssetKind,
  normalizeRadioAssetTags,
  normalizeRadioAssetTitle,
} from "@/lib/radioWoloAssets";
import {
  requireRadioWoloOperator,
} from "@/lib/radioWoloOperator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "private, no-store, max-age=0",
};

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
    Number(rawId);

  if (
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    return NextResponse.json(
      {
        detail:
          "Invalid Radio WOLO asset id.",
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
      .catch(() => null)) as
      | Record<string, unknown>
      | null;

  if (!body) {
    return NextResponse.json(
      {
        detail:
          "Invalid Radio WOLO asset update.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const existing =
    await gate.prisma.radioAsset.findUnique(
      {
        where: {
          id,
        },
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
    );

  if (!existing) {
    return NextResponse.json(
      {
        detail:
          "Radio WOLO asset not found.",
      },
      {
        status: 404,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const requestedStatus =
    typeof body.status === "string"
      ? body.status.trim()
      : existing.status;

  if (
    ![
      "draft",
      "ready",
      "archived",
    ].includes(
      requestedStatus,
    )
  ) {
    return NextResponse.json(
      {
        detail:
          "Invalid Radio WOLO asset status.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const notes =
    typeof body.notes === "string"
      ? body.notes
          .replace(/\0/g, "")
          .trim()
          .slice(0, 6000) ||
        null
      : undefined;

  await gate.prisma.radioAsset.update(
    {
      where: {
        id,
      },
      data: {
        title:
          body.title === undefined
            ? undefined
            : normalizeRadioAssetTitle(
                body.title,
                existing.title,
              ),
        credit:
          body.credit === undefined
            ? undefined
            : normalizeRadioAssetCredit(
                body.credit,
              ),
        kind:
          body.kind === undefined
            ? undefined
            : normalizeRadioAssetKind(
                body.kind,
              ),
        tags:
          body.tags === undefined
            ? undefined
            : normalizeRadioAssetTags(
                body.tags,
              ),
        notes,
        status:
          requestedStatus,
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
