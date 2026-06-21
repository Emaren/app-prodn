import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { normalizeManagedMediaTarget } from "@/lib/managedMediaAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function cleanText(value: unknown, max = 120) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function userAvatarTarget(uid: string) {
  const target = normalizeManagedMediaTarget(`user-${uid}`);

  if (!target) {
    throw new Error("Could not build user avatar target.");
  }

  return target;
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);

  if ("error" in gate) {
    return gate.error;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const uid = cleanText(body.uid, 100);
    const assetId = Number(body.assetId);

    if (!uid) {
      return NextResponse.json(
        { detail: "Choose a warrior first." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!Number.isInteger(assetId) || assetId < 1) {
      return NextResponse.json(
        { detail: "Choose an avatar asset." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const [user, sourceAsset] = await Promise.all([
      gate.prisma.user.findUnique({
        where: { uid },
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
          email: true,
        },
      }),
      gate.prisma.managedMediaAsset.findUnique({
        where: { id: assetId },
      }),
    ]);

    if (!user) {
      return NextResponse.json(
        { detail: "Warrior not found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (!sourceAsset || sourceAsset.kind !== "avatar") {
      return NextResponse.json(
        { detail: "Avatar asset not found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const displayName = user.inGameName || user.steamPersonaName || user.email || user.uid;
    const target = userAvatarTarget(user.uid);

    const assignedAsset = await gate.prisma.$transaction(async (tx) => {
      await tx.managedMediaAsset.updateMany({
        where: {
          kind: "avatar",
          target,
          active: true,
        },
        data: {
          active: false,
        },
      });

      return tx.managedMediaAsset.create({
        data: {
          key: `avatar:${target}:assigned:${Date.now()}:${randomUUID().slice(0, 8)}`,
          kind: "avatar",
          target,
          label: `${displayName} avatar`,
          url: sourceAsset.url,
          alt: `${displayName} avatar`,
          mimeType: sourceAsset.mimeType,
          originalName: sourceAsset.originalName,
          sizeBytes: sourceAsset.sizeBytes,
          active: true,
          uploadedByUid: gate.user.uid,
        },
      });
    });

    return NextResponse.json(
      {
        asset: assignedAsset,
        user: {
          uid: user.uid,
          displayName,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        detail: error instanceof Error ? error.message : "Could not assign avatar.",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
