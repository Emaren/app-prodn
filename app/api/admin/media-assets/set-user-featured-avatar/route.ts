import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  normalizeManagedMediaTarget,
  saveManagedMediaReference,
} from "@/lib/managedMediaAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function cleanText(value: unknown, max = 120) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function profileTargetFor(uid: string) {
  const target =
    normalizeManagedMediaTarget(`user-${uid}`);

  if (!target) {
    throw new Error(
      "Could not build Profile avatar target."
    );
  }

  return target;
}

function poolTargetFor(uid: string) {
  const target =
    normalizeManagedMediaTarget(`user-${uid}-pool`);

  if (!target) {
    throw new Error(
      "Could not build avatar library target."
    );
  }

  return target;
}

function featuredTargetFor(uid: string) {
  const target =
    normalizeManagedMediaTarget(
      `user-${uid}-featured`
    );

  if (!target) {
    throw new Error(
      "Could not build Featured Warrior target."
    );
  }

  return target;
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);

  if ("error" in gate) {
    return gate.error;
  }

  try {
    const body =
      (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

    const uid = cleanText(body.uid, 100);
    const assetId = Number(body.assetId);

    if (!uid) {
      return NextResponse.json(
        { detail: "Choose a warrior first." },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    if (!Number.isInteger(assetId) || assetId < 1) {
      return NextResponse.json(
        { detail: "Choose an avatar." },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const [user, asset] =
      await Promise.all([
        gate.prisma.user.findUnique({
          where: {
            uid,
          },
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            email: true,
          },
        }),

        gate.prisma.managedMediaAsset.findFirst({
          where: {
            id: assetId,
            kind: "avatar",
            target: {
              in: [
                profileTargetFor(uid),
                poolTargetFor(uid),
              ],
            },
          },
        }),
      ]);

    if (!user) {
      return NextResponse.json(
        { detail: "Warrior not found." },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    if (!asset) {
      return NextResponse.json(
        {
          detail:
            "That image is not in this warrior's avatar library.",
        },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const displayName =
      user.inGameName ||
      user.steamPersonaName ||
      user.email ||
      user.uid;

    const currentFeatured =
      await gate.prisma.managedMediaAsset.findFirst({
        where: {
          kind: "avatar",
          target:
            featuredTargetFor(user.uid),
          active: true,
        },
        orderBy: [
          { updatedAt: "desc" },
          { id: "desc" },
        ],
      });

    if (currentFeatured?.url === asset.url) {
      return NextResponse.json(
        {
          asset: currentFeatured,
          user: {
            uid: user.uid,
            displayName,
          },
        },
        {
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const featuredAsset =
      await saveManagedMediaReference({
        prisma: gate.prisma,
        kind: "avatar",
        target:
          featuredTargetFor(user.uid),
        url: asset.url,

        label:
          `${displayName} Featured Warrior avatar`,

        alt:
          asset.alt ||
          `${displayName} Featured Warrior`,

        uploadedByUid:
          gate.user.uid,
      });

    return NextResponse.json(
      {
        asset: featuredAsset,

        user: {
          uid: user.uid,
          displayName,
        },
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
            : "Could not set Featured Warrior avatar.",
      },
      {
        status: 400,
        headers: NO_STORE_HEADERS,
      }
    );
  }
}
