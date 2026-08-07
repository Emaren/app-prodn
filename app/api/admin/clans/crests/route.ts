import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  clanCrestPoolTarget,
  clanCurrentCrestTarget,
} from "@/lib/clanCrests";
import { saveManagedMediaReference } from "@/lib/managedMediaAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function parseIds(value: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [value])
        .map((candidate) => Number(candidate))
        .filter(
          (candidate) =>
            Number.isInteger(candidate) &&
            candidate > 0,
        ),
    ),
  );
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);

  if ("error" in gate) {
    return gate.error;
  }

  try {
    const body = (await request
      .json()
      .catch(() => ({}))) as Record<string, unknown>;
    const clanId = Number(body.clanId);
    const assetIds = parseIds(body.assetIds);

    if (
      !Number.isInteger(clanId) ||
      clanId < 1 ||
      assetIds.length === 0
    ) {
      return NextResponse.json(
        {
          detail:
            "Choose a clan and at least one crest.",
        },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    const [clan, sourceAssets] =
      await Promise.all([
        gate.prisma.clan.findUnique({
          where: {
            id: clanId,
          },
        }),
        gate.prisma.managedMediaAsset.findMany(
          {
            where: {
              id: {
                in: assetIds,
              },
              kind: "crest",
              target: null,
            },
            orderBy: {
              id: "asc",
            },
          },
        ),
      ]);

    if (!clan) {
      return NextResponse.json(
        {
          detail: "Clan not found.",
        },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    if (sourceAssets.length === 0) {
      return NextResponse.json(
        {
          detail:
            "No global crest assets were found.",
        },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    const poolTarget =
      clanCrestPoolTarget(clan.slug);
    const currentTarget =
      clanCurrentCrestTarget(clan.slug);

    const result =
      await gate.prisma.$transaction(
        async (tx) => {
          const assigned = [];

          for (const source of sourceAssets) {
            let poolAsset =
              await tx.managedMediaAsset.findFirst(
                {
                  where: {
                    kind: "crest",
                    target: poolTarget,
                    url: source.url,
                  },
                  orderBy: {
                    id: "desc",
                  },
                },
              );

            if (!poolAsset) {
              poolAsset =
                await tx.managedMediaAsset.create({
                  data: {
                    key:
                      `crest:${poolTarget}:assigned:` +
                      `${Date.now()}:` +
                      randomUUID().slice(0, 8),
                    kind: "crest",
                    target: poolTarget,
                    label:
                      `${clan.name} crest option · ${source.label}`,
                    url: source.url,
                    alt:
                      source.alt ||
                      `${clan.name} crest`,
                    mimeType: source.mimeType,
                    originalName:
                      source.originalName,
                    sizeBytes:
                      source.sizeBytes,
                    active: true,
                    uploadedByUid:
                      gate.user.uid,
                  },
                });
            }

            assigned.push(poolAsset);
          }

          let selectedUrl = clan.crestUrl;

          if (!selectedUrl && assigned[0]) {
            await tx.managedMediaAsset.updateMany(
              {
                where: {
                  kind: "crest",
                  target: currentTarget,
                  active: true,
                },
                data: {
                  active: false,
                },
              },
            );

            await tx.managedMediaAsset.create({
              data: {
                key:
                  `crest:${currentTarget}:ref:` +
                  `${Date.now()}:` +
                  randomUUID().slice(0, 8),
                kind: "crest",
                target: currentTarget,
                label:
                  `${clan.name} selected crest`,
                url: assigned[0].url,
                alt:
                  assigned[0].alt ||
                  `${clan.name} crest`,
                mimeType: null,
                originalName: null,
                sizeBytes: 0,
                active: true,
                uploadedByUid: gate.user.uid,
              },
            });

            selectedUrl = assigned[0].url;

            await tx.clan.update({
              where: {
                id: clan.id,
              },
              data: {
                crestUrl: selectedUrl,
              },
            });
          }

          return {
            assigned,
            selectedUrl,
          };
        },
      );

    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      {
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not assign clan crests.",
      },
      {
        status: 400,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(request);

  if ("error" in gate) {
    return gate.error;
  }

  try {
    const body = (await request
      .json()
      .catch(() => ({}))) as Record<string, unknown>;
    const clanId = Number(body.clanId);
    const assetId = Number(body.assetId);

    if (
      !Number.isInteger(clanId) ||
      clanId < 1 ||
      !Number.isInteger(assetId) ||
      assetId < 1
    ) {
      return NextResponse.json(
        {
          detail:
            "Choose a clan and one assigned crest.",
        },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    const clan =
      await gate.prisma.clan.findUnique({
        where: {
          id: clanId,
        },
      });

    if (!clan) {
      return NextResponse.json(
        {
          detail: "Clan not found.",
        },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    const poolTarget =
      clanCrestPoolTarget(clan.slug);
    const currentTarget =
      clanCurrentCrestTarget(clan.slug);
    const asset =
      await gate.prisma.managedMediaAsset.findFirst(
        {
          where: {
            id: assetId,
            kind: "crest",
            target: {
              in: [poolTarget, currentTarget],
            },
          },
        },
      );

    if (!asset) {
      return NextResponse.json(
        {
          detail:
            "That crest is not assigned to this clan.",
        },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    const selected =
      await saveManagedMediaReference({
        prisma: gate.prisma,
        kind: "crest",
        target: currentTarget,
        url: asset.url,
        label: `${clan.name} selected crest`,
        alt: asset.alt || `${clan.name} crest`,
        uploadedByUid: gate.user.uid,
      });

    await gate.prisma.clan.update({
      where: {
        id: clan.id,
      },
      data: {
        crestUrl: selected.url,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        crestUrl: selected.url,
      },
      {
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not select clan crest.",
      },
      {
        status: 400,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
