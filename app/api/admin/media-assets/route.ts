import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  activateManagedMediaAsset,
  MANAGED_MEDIA_KINDS,
  normalizeManagedMediaKind,
  normalizeManagedMediaTarget,
  saveManagedMediaUpload,
} from "@/lib/managedMediaAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);

  if ("error" in gate) {
    return gate.error;
  }

  const assets = await gate.prisma.managedMediaAsset.findMany({
    orderBy: [
      { active: "desc" },
      { updatedAt: "desc" },
      { id: "desc" },
    ],
  });

  return NextResponse.json(
    {
      assets,
      kinds: MANAGED_MEDIA_KINDS,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) {
    return gate.error;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { detail: "Choose a media file first." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const normalizedKind = normalizeManagedMediaKind(formData.get("kind"));
    const normalizedTarget = normalizeManagedMediaTarget(formData.get("target"));
    const isUserAvatarPoolUpload =
      normalizedKind === "avatar" && Boolean(normalizedTarget?.startsWith("user-"));

    const existingSelectedUserAvatar = isUserAvatarPoolUpload
      ? await gate.prisma.managedMediaAsset.findFirst({
          where: { kind: "avatar", target: normalizedTarget, active: true },
          select: { id: true },
        })
      : null;

    const asset = await saveManagedMediaUpload({
      prisma: gate.prisma,
      file,
      kind: normalizedKind,
      target: normalizedTarget,
      label: formData.get("label"),
      alt: formData.get("alt"),
      uploadedByUid: gate.user.uid,
      active: isUserAvatarPoolUpload ? !existingSelectedUserAvatar : true,
      replaceActive: !isUserAvatarPoolUpload,
    });

    return NextResponse.json({ asset }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not save managed media asset.",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) {
    return gate.error;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json(
        { detail: "Choose a valid media asset." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const asset = await activateManagedMediaAsset(gate.prisma, id, Boolean(body.active));
    return NextResponse.json({ asset }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not update managed media asset.",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
