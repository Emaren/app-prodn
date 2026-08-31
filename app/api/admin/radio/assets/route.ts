import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  RADIO_ASSET_MAX_AUDIO_BYTES,
  normalizeRadioAssetCredit,
  normalizeRadioAssetKind,
  normalizeRadioAssetTags,
  normalizeRadioAssetTitle,
  normalizeRadioDurationMs,
} from "@/lib/radioWoloAssets";
import {
  persistRadioVaultAudio,
  removeRadioVaultFile,
} from "@/lib/radioWoloAssetStorage";
import {
  safeOriginalFilename,
} from "@/lib/radioWolo";
import {
  requireRadioWoloOperator,
} from "@/lib/radioWoloOperator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "private, no-store, max-age=0",
};

function serializeAsset(
  asset: {
    id: number;
    publicId: string;
    title: string;
    credit: string | null;
    kind: string;
    tags: string[];
    notes: string | null;
    audioOriginalFilename: string;
    audioMediaType: string;
    audioByteSize: bigint;
    audioSha256: string;
    durationMs: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  },
) {
  return {
    ...asset,
    audioByteSize:
      asset.audioByteSize.toString(),
    createdAt:
      asset.createdAt.toISOString(),
    updatedAt:
      asset.updatedAt.toISOString(),
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

  const assets =
    await gate.prisma.radioAsset.findMany(
      {
        where: {
          status: {
            not: "archived",
          },
        },
        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        take: 500,
        select: {
          id: true,
          publicId: true,
          title: true,
          credit: true,
          kind: true,
          tags: true,
          notes: true,
          audioOriginalFilename:
            true,
          audioMediaType: true,
          audioByteSize: true,
          audioSha256: true,
          durationMs: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    );

  return NextResponse.json(
    {
      assets:
        assets.map(
          serializeAsset,
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

  const form =
    await request
      .formData()
      .catch(() => null);

  if (!form) {
    return NextResponse.json(
      {
        detail:
          "Invalid Radio WOLO upload.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const audio =
    form.get("audio");

  if (
    !(audio instanceof File) ||
    audio.size <= 0 ||
    audio.size >
      RADIO_ASSET_MAX_AUDIO_BYTES
  ) {
    return NextResponse.json(
      {
        detail:
          "Choose an MP3, WAV, OGG, or M4A file no larger than 250 MB.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const durationMs =
    normalizeRadioDurationMs(
      form.get("durationMs"),
    );

  if (durationMs === null) {
    return NextResponse.json(
      {
        detail:
          "A valid audio duration is required.",
      },
      {
        status: 400,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  const bytes =
    new Uint8Array(
      await audio.arrayBuffer(),
    );

  let stored:
    | Awaited<
        ReturnType<
          typeof persistRadioVaultAudio
        >
      >
    | null = null;

  try {
    stored =
      await persistRadioVaultAudio(
        bytes,
      );

    const duplicate =
      await gate.prisma.radioAsset.findFirst(
        {
          where: {
            audioSha256:
              stored.sha256,
          },
          select: {
            id: true,
            title: true,
          },
        },
      );

    if (duplicate) {
      await removeRadioVaultFile(
        stored.target,
      );

      return NextResponse.json(
        {
          detail:
            `That exact audio already exists in the Vault as "${duplicate.title}".`,
          duplicateId:
            duplicate.id,
        },
        {
          status: 409,
          headers:
            NO_STORE_HEADERS,
        },
      );
    }

    const title =
      normalizeRadioAssetTitle(
        form.get("title"),
        audio.name,
      );

    const credit =
      normalizeRadioAssetCredit(
        form.get("credit"),
      );

    const kind =
      normalizeRadioAssetKind(
        form.get("kind"),
      );

    const tags =
      normalizeRadioAssetTags(
        form.get("tags"),
      );

    const asset =
      await gate.prisma.radioAsset.create(
        {
          data: {
            title,
            credit,
            kind,
            tags,
            audioOriginalFilename:
              safeOriginalFilename(
                audio.name,
              ),
            audioStorageKey:
              stored.storageKey,
            audioMediaType:
              stored.mediaType,
            audioByteSize:
              BigInt(
                bytes.byteLength,
              ),
            audioSha256:
              stored.sha256,
            durationMs,
            status: "ready",
            createdByUid:
              gate.user.uid,
          },
          select: {
            id: true,
            publicId: true,
            title: true,
            credit: true,
            kind: true,
            tags: true,
            notes: true,
            audioOriginalFilename:
              true,
            audioMediaType:
              true,
            audioByteSize: true,
            audioSha256: true,
            durationMs: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      );

    return NextResponse.json(
      {
        ok: true,
        asset:
          serializeAsset(asset),
      },
      {
        status: 201,
        headers:
          NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    if (stored) {
      await removeRadioVaultFile(
        stored.target,
      ).catch(() => undefined);
    }

    console.warn(
      "Radio WOLO Vault upload failed:",
      error,
    );

    return NextResponse.json(
      {
        detail:
          "Could not preserve the Radio WOLO asset. No partial upload was retained.",
      },
      {
        status: 500,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }
}
