import {
  stat,
} from "node:fs/promises";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  radioStoragePath,
} from "@/lib/radioWolo";
import {
  parseRadioByteRange,
} from "@/lib/radioWoloAssets";
import {
  createRadioFileStream,
} from "@/lib/radioWoloFileStream";
import {
  requireRadioWoloOperator,
} from "@/lib/radioWoloOperator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control":
    "private, no-store, max-age=0",
  "Accept-Ranges": "bytes",
  "X-Content-Type-Options":
    "nosniff",
};

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
          PRIVATE_HEADERS,
      },
    );
  }

  const asset =
    await gate.prisma.radioAsset.findUnique(
      {
        where: {
          id,
        },
        select: {
          audioStorageKey:
            true,
          audioMediaType:
            true,
        },
      },
    );

  if (!asset) {
    return NextResponse.json(
      {
        detail:
          "Radio WOLO asset not found.",
      },
      {
        status: 404,
        headers:
          PRIVATE_HEADERS,
      },
    );
  }

  const target =
    radioStoragePath(
      asset.audioStorageKey,
    );

  try {
    const metadata =
      await stat(target);

    if (
      !metadata.isFile() ||
      metadata.size <= 0
    ) {
      throw new Error(
        "Invalid media file.",
      );
    }

    const requestedRange =
      parseRadioByteRange(
        request.headers.get(
          "range",
        ),
        metadata.size,
      );

    if (
      requestedRange ===
      "invalid"
    ) {
      return new NextResponse(
        null,
        {
          status: 416,
          headers: {
            ...PRIVATE_HEADERS,
            "Content-Range":
              `bytes */${metadata.size}`,
          },
        },
      );
    }

    const start =
      requestedRange
        ? requestedRange.start
        : 0;

    const end =
      requestedRange
        ? requestedRange.end
        : metadata.size - 1;

    const length =
      end - start + 1;

    const stream =
      await createRadioFileStream(
        target,
        start,
        end,
      );

    if (
      !requestedRange
    ) {
      return new NextResponse(
        stream,
        {
          status: 200,
          headers: {
            ...PRIVATE_HEADERS,
            "Content-Type":
              asset.audioMediaType,
            "Content-Length":
              String(length),
          },
        },
      );
    }

    return new NextResponse(
      stream,
      {
        status: 206,
        headers: {
          ...PRIVATE_HEADERS,
          "Content-Type":
            asset.audioMediaType,
          "Content-Length":
            String(length),
          "Content-Range":
            `bytes ${start}-${end}/${metadata.size}`,
        },
      },
    );
  } catch (
    error
  ) {
    console.warn(
      "Radio WOLO media unavailable:",
      error,
    );

    return NextResponse.json(
      {
        detail:
          "Radio WOLO media is unavailable.",
      },
      {
        status: 404,
        headers:
          PRIVATE_HEADERS,
      },
    );
  }
}
