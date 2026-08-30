import {
  createReadStream,
} from "node:fs";
import {
  stat,
} from "node:fs/promises";
import {
  Readable,
} from "node:stream";
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
          audioStorageKey: true,
          audioMediaType: true,
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

    if (!requestedRange) {
      const nodeStream =
        createReadStream(
          target,
        );

      return new NextResponse(
        Readable.toWeb(
          nodeStream,
        ) as ReadableStream,
        {
          status: 200,
          headers: {
            ...PRIVATE_HEADERS,
            "Content-Type":
              asset.audioMediaType,
            "Content-Length":
              String(
                metadata.size,
              ),
          },
        },
      );
    }

    const nodeStream =
      createReadStream(
        target,
        {
          start:
            requestedRange.start,
          end:
            requestedRange.end,
        },
      );

    return new NextResponse(
      Readable.toWeb(
        nodeStream,
      ) as ReadableStream,
      {
        status: 206,
        headers: {
          ...PRIVATE_HEADERS,
          "Content-Type":
            asset.audioMediaType,
          "Content-Length":
            String(
              requestedRange.length,
            ),
          "Content-Range":
            `bytes ${requestedRange.start}-${requestedRange.end}/${metadata.size}`,
        },
      },
    );
  } catch {
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
