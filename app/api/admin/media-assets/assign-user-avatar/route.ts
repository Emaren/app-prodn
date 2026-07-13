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
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function userAvatarPoolTarget(uid: string) {
  const target =
    normalizeManagedMediaTarget(`user-${uid}-pool`);

  if (!target) {
    throw new Error(
      "Could not build user avatar pool target."
    );
  }

  return target;
}

function userFeaturedAvatarTarget(uid: string) {
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
        { detail: "Choose an avatar asset." },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const [user, sourceAsset] =
      await Promise.all([
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
          where: {
            id: assetId,
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

    if (
      !sourceAsset ||
      sourceAsset.kind !== "avatar" ||
      sourceAsset.target?.startsWith("user-")
    ) {
      return NextResponse.json(
        {
          detail:
            "Choose an avatar from the global library.",
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

    const poolTarget =
      userAvatarPoolTarget(user.uid);

    const featuredTarget =
      userFeaturedAvatarTarget(user.uid);

    const result =
      await gate.prisma.$transaction(
        async (tx) => {
          const currentSelected =
            await tx.managedMediaAsset.findFirst({
              where: {
                kind: "avatar",
                target: poolTarget,
                active: true,
              },
              select: {
                id: true,
              },
            });

          const existingAssignment =
            await tx.managedMediaAsset.findFirst({
              where: {
                kind: "avatar",
                target: poolTarget,
                url: sourceAsset.url,
              },
              orderBy: [
                { updatedAt: "desc" },
                { id: "desc" },
              ],
            });

          let assignedAsset =
            existingAssignment;

          if (existingAssignment) {
            if (
              !currentSelected &&
              !existingAssignment.active
            ) {
              assignedAsset =
                await tx.managedMediaAsset.update({
                  where: {
                    id: existingAssignment.id,
                  },
                  data: {
                    active: true,
                  },
                });
            }
          } else {
            assignedAsset =
              await tx.managedMediaAsset.create({
                data: {
                  key: `avatar:${poolTarget}:assigned:${Date.now()}:${randomUUID().slice(0, 8)}`,
                  kind: "avatar",
                  target: poolTarget,

                  label:
                    `${displayName} AoE2WAR avatar`,

                  url: sourceAsset.url,

                  alt:
                    sourceAsset.alt ||
                    `${displayName} AoE2WAR avatar`,

                  mimeType:
                    sourceAsset.mimeType,

                  originalName:
                    sourceAsset.originalName,

                  sizeBytes:
                    sourceAsset.sizeBytes,

                  active:
                    !currentSelected,

                  uploadedByUid:
                    gate.user.uid,
                },
              });
          }

          const existingFeatured =
            await tx.managedMediaAsset.findFirst({
              where: {
                kind: "avatar",
                target: featuredTarget,
                active: true,
              },
              select: {
                id: true,
              },
            });

          let featuredSeeded = false;

          if (
            assignedAsset &&
            !existingFeatured
          ) {
            await tx.managedMediaAsset.create({
              data: {
                key: `avatar:${featuredTarget}:ref:${Date.now()}:${randomUUID().slice(0, 8)}`,
                kind: "avatar",
                target: featuredTarget,

                label:
                  `${displayName} Featured Warrior avatar`,

                url: assignedAsset.url,

                alt:
                  assignedAsset.alt ||
                  `${displayName} Featured Warrior`,

                mimeType: null,
                originalName: null,
                sizeBytes: 0,
                active: true,

                uploadedByUid:
                  gate.user.uid,
              },
            });

            featuredSeeded = true;
          }

          return {
            asset: assignedAsset,
            featuredSeeded,
          };
        }
      );

    return NextResponse.json(
      {
        asset: result.asset,

        featuredSeeded:
          result.featuredSeeded,

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
            : "Could not assign avatar.",
      },
      {
        status: 400,
        headers: NO_STORE_HEADERS,
      }
    );
  }
}
