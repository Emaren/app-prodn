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

function userAssetPoolTarget(uid: string) {
  const target = normalizeManagedMediaTarget(`user-${uid}-pool`);

  if (!target) {
    throw new Error("Could not build user asset pool target.");
  }

  return target;
}

function userCurrentTarget(uid: string) {
  const target = normalizeManagedMediaTarget(`user-${uid}`);

  if (!target) {
    throw new Error("Could not build user current asset target.");
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
    const rawAssetIds = Array.isArray(body.assetIds) ? body.assetIds : [body.assetId];
    const assetIds = Array.from(
      new Set(
        rawAssetIds
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      )
    );

    if (!uid) {
      return NextResponse.json(
        { detail: "Choose a warrior first." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (assetIds.length === 0) {
      return NextResponse.json(
        { detail: "Choose one or more assets." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const [user, sourceAssets] = await Promise.all([
      gate.prisma.user.findUnique({
        where: { uid },
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
          email: true,
        },
      }),
      gate.prisma.managedMediaAsset.findMany({
        where: {
          id: { in: assetIds },
        },
        orderBy: [{ id: "asc" }],
      }),
    ]);

    if (!user) {
      return NextResponse.json(
        { detail: "Warrior not found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (sourceAssets.length === 0) {
      return NextResponse.json(
        { detail: "No source assets found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const displayName = user.inGameName || user.steamPersonaName || user.email || user.uid;
    const poolTarget = userAssetPoolTarget(user.uid);
    const currentTarget = userCurrentTarget(user.uid);

    const assignedAssets = await gate.prisma.$transaction(async (tx) => {
      const results = [];

      for (const sourceAsset of sourceAssets) {
        if (sourceAsset.target?.startsWith("user-")) {
          continue;
        }

        const currentActiveForKind = await tx.managedMediaAsset.findFirst({
          where: {
            kind: sourceAsset.kind,
            target: poolTarget,
            active: true,
          },
          select: { id: true },
        });

        const existingAssignment = await tx.managedMediaAsset.findFirst({
          where: {
            kind: sourceAsset.kind,
            target: poolTarget,
            url: sourceAsset.url,
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        });

        let assignedAsset = existingAssignment;
        let shouldMakeCurrentAvatar = false;

        if (existingAssignment) {
          if (!currentActiveForKind && !existingAssignment.active) {
            assignedAsset = await tx.managedMediaAsset.update({
              where: { id: existingAssignment.id },
              data: { active: true },
            });
            shouldMakeCurrentAvatar = sourceAsset.kind === "avatar";
          } else {
            shouldMakeCurrentAvatar = sourceAsset.kind === "avatar" && existingAssignment.active;
          }
        } else {
          const shouldBeActive = !currentActiveForKind || sourceAsset.kind !== "avatar";

          assignedAsset = await tx.managedMediaAsset.create({
            data: {
              key: `${sourceAsset.kind}:${poolTarget}:assigned:${Date.now()}:${randomUUID().slice(0, 8)}`,
              kind: sourceAsset.kind,
              target: poolTarget,
              label: sourceAsset.kind === "avatar" ? `${displayName} avatar` : sourceAsset.label,
              url: sourceAsset.url,
              alt: sourceAsset.kind === "avatar" ? `${displayName} avatar` : sourceAsset.alt,
              mimeType: sourceAsset.mimeType,
              originalName: sourceAsset.originalName,
              sizeBytes: sourceAsset.sizeBytes,
              active: shouldBeActive,
              uploadedByUid: gate.user.uid,
            },
          });

          shouldMakeCurrentAvatar = sourceAsset.kind === "avatar" && shouldBeActive;
        }

        if (assignedAsset && shouldMakeCurrentAvatar) {
          const currentSameAvatar = await tx.managedMediaAsset.findFirst({
            where: {
              kind: "avatar",
              target: currentTarget,
              active: true,
              url: assignedAsset.url,
            },
            select: { id: true },
          });

          if (!currentSameAvatar) {
            await tx.managedMediaAsset.updateMany({
              where: {
                kind: "avatar",
                target: currentTarget,
                active: true,
              },
              data: { active: false },
            });

            await tx.managedMediaAsset.create({
              data: {
                key: `avatar:${currentTarget}:ref:${Date.now()}:${randomUUID().slice(0, 8)}`,
                kind: "avatar",
                target: currentTarget,
                label: `${displayName} selected avatar`,
                url: assignedAsset.url,
                alt: assignedAsset.alt || `${displayName} avatar`,
                mimeType: null,
                originalName: null,
                sizeBytes: 0,
                active: true,
                uploadedByUid: gate.user.uid,
              },
            });
          }
        }

        if (assignedAsset) {
          results.push(assignedAsset);
        }
      }

      return results;
    });

    return NextResponse.json(
      {
        assets: assignedAssets,
        assignedCount: assignedAssets.length,
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
        detail: error instanceof Error ? error.message : "Could not assign assets.",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
