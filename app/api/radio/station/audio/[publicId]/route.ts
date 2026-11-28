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
  buildRadioProgramTimeline,
} from "@/lib/radioWoloStation";
import {
  getPrisma,
} from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma";
import { isNonfinancialPublicReadProfile } from "@/lib/nonfinancialPublicReadProfile";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const MEDIA_HEADERS = {
  "Cache-Control":
    "private, no-store, max-age=0",
  "Accept-Ranges":
    "bytes",
  "X-Content-Type-Options":
    "nosniff",
};

function unavailable() {
  return NextResponse.json(
    {
      detail:
        "Radio WOLO media is unavailable.",
    },
    {
      status: 404,
      headers:
        MEDIA_HEADERS,
    },
  );
}

type StationAudioMedia = { audioStorageKey: string; audioMediaType: string };

async function resolveStationAudio(publicId: string): Promise<StationAudioMedia | null> {
  if (isNonfinancialPublicReadProfile()) {
    const rows = await getPrisma().$queryRaw<StationAudioMedia[]>(Prisma.sql`
      SELECT audio_storage_key AS "audioStorageKey",
             audio_media_type AS "audioMediaType"
      FROM aoe2war_public_v2.radio_on_air_media
      WHERE public_id = CAST(${publicId} AS uuid) LIMIT 2
    `);
    return rows.length === 1 ? rows[0] : null;
  }
  const station =
    await getPrisma().radioStationState.findUnique(
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
                      publicId:
                        true,
                      audioStorageKey:
                        true,
                      audioMediaType:
                        true,
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

  const timeline =
    buildRadioProgramTimeline(
      station.program.items.map(
        (item) => ({
          value:
            item.asset
              .publicId,
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

  const elapsedMs =
    Date.now() -
    station.startedAt.getTime();

  if (
    elapsedMs < 0 ||
    timeline.durationMs <= 0
  ) {
    return null;
  }

  const matched =
    station.program.items.find(
      (item) =>
        item.asset
          .publicId ===
        publicId,
    );

  if (!matched) {
    return null;
  }

  return matched.asset;
}

export async function GET(
  request: NextRequest,
  context: {
    params:
      Promise<{
        publicId: string;
      }>;
  },
) {
  const {
    publicId,
  } =
    await context.params;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      publicId,
    )
  ) {
    return unavailable();
  }

  let media: StationAudioMedia | null;
  try {
    media = await resolveStationAudio(publicId);
  } catch {
    return NextResponse.json(
      { detail: "Radio WOLO service is temporarily unavailable." },
      { status: 503, headers: { ...MEDIA_HEADERS, "Retry-After": "30" } },
    );
  }
  if (!media) return unavailable();
  if (!new Set(["audio/wav", "audio/ogg", "audio/mp4", "audio/mpeg"]).has(media.audioMediaType)) {
    return unavailable();
  }

  try {
    const target = radioStoragePath(media.audioStorageKey);
    const metadata =
      await stat(target);

    if (
      !metadata.isFile() ||
      metadata.size <= 0
    ) {
      return unavailable();
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
            ...MEDIA_HEADERS,
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

    return new NextResponse(
      stream,
      {
        status:
          requestedRange
            ? 206
            : 200,
        headers: {
          ...MEDIA_HEADERS,
          "Content-Type":
            media.audioMediaType,
          "Content-Length":
            String(length),
          ...(
            requestedRange
              ? {
                  "Content-Range":
                    `bytes ${start}-${end}/${metadata.size}`,
                }
              : {}
          ),
        },
      },
    );
  } catch {
    return unavailable();
  }
}
