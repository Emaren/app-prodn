import { NextRequest, NextResponse } from "next/server";

import {
  normalizeManagedMediaTarget,
  saveManagedMediaReference,
  saveManagedMediaUpload,
} from "@/lib/managedMediaAssets";
import { invalidateLivingKingdomIdentity } from "@/lib/livingKingdom/identity";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function userAvatarTarget(uid: string) {
  const target = normalizeManagedMediaTarget(`user-${uid}`);

  if (!target) {
    throw new Error("Could not build user avatar target.");
  }

  return target;
}

function userAvatarPoolTarget(uid: string) {
  const target = normalizeManagedMediaTarget(`user-${uid}-pool`);

  if (!target) {
    throw new Error("Could not build user avatar pool target.");
  }

  return target;
}

async function requireViewer(request: NextRequest) {
  const uid = await getSessionUid(request);

  if (!uid) {
    return {
      error: NextResponse.json(
        { detail: "No active session" },
        { status: 401 }
      ),
    };
  }

  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
    },
  });

  if (!user) {
    return {
      error: NextResponse.json(
        { detail: "User not found" },
        { status: 404 }
      ),
    };
  }

  return { prisma, user };
}

export async function POST(request: NextRequest) {
  const gate = await requireViewer(request);

  if ("error" in gate) {
    return gate.error;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { detail: "Choose an image file first." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const label =
      gate.user.inGameName ||
      gate.user.steamPersonaName ||
      "Profile avatar";

    const asset = await saveManagedMediaUpload({
      prisma: gate.prisma,
      file,
      kind: "avatar",
      target: userAvatarTarget(gate.user.uid),
      label: `${label} personal upload`,
      alt: `${label} avatar`,
      uploadedByUid: gate.user.uid,
    });
    invalidateLivingKingdomIdentity(gate.user.uid);

    return NextResponse.json(
      {
        avatarUrl: asset.url,
        asset,
      },
      {
        status: 201,
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not save avatar.",
      },
      {
        status: 400,
        headers: NO_STORE_HEADERS,
      }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireViewer(request);

  if ("error" in gate) {
    return gate.error;
  }

  try {
    const body =
      (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

    const requestedPreset = String(body.preset || "").trim();
    const assetChoice = requestedPreset.match(/^asset:(\d+)$/i);
    const assetId = Number(body.assetId ?? assetChoice?.[1]);

    if (!Number.isInteger(assetId) || assetId < 1) {
      return NextResponse.json(
        {
          detail:
            "Choose one of the avatars available to your profile.",
        },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const profileTarget = userAvatarTarget(gate.user.uid);
    const poolTarget = userAvatarPoolTarget(gate.user.uid);

    const asset = await gate.prisma.managedMediaAsset.findFirst({
      where: {
        id: assetId,
        kind: "avatar",
        target: {
          in: [profileTarget, poolTarget],
        },
      },
    });

    if (!asset) {
      return NextResponse.json(
        {
          detail:
            "That avatar is not available to your profile.",
        },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const label =
      gate.user.inGameName ||
      gate.user.steamPersonaName ||
      "Profile avatar";

    const selectedAsset = await saveManagedMediaReference({
      prisma: gate.prisma,
      kind: "avatar",
      target: profileTarget,
      url: asset.url,
      label: `${label} selected profile avatar`,
      alt: asset.alt || `${label} avatar`,
      uploadedByUid: gate.user.uid,
    });
    invalidateLivingKingdomIdentity(gate.user.uid);

    return NextResponse.json(
      {
        avatarUrl: selectedAsset.url,
        asset,
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not update avatar.",
      },
      {
        status: 400,
        headers: NO_STORE_HEADERS,
      }
    );
  }
}
