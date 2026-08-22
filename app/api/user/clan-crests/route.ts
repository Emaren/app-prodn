import { NextRequest, NextResponse } from "next/server";

import {
  canUserManageClan,
  clanCrestPoolTarget,
  clanCurrentCrestTarget,
} from "@/lib/clanCrests";
import { saveManagedMediaReference } from "@/lib/managedMediaAssets";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { isClanChatViewMode, normalizeClanChatViewMode } from "@/lib/clanChatViews";
import { publishClanHallEvent } from "@/lib/clanHallEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

async function requireViewer(request: NextRequest) {
  const uid = await getSessionUid(request);

  if (!uid) {
    return {
      error: NextResponse.json(
        {
          detail: "Sign in to manage a clan crest.",
        },
        {
          status: 401,
          headers: NO_STORE_HEADERS,
        },
      ),
    };
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: {
      uid,
    },
    select: {
      id: true,
      uid: true,
      isAdmin: true,
    },
  });

  if (!user) {
    return {
      error: NextResponse.json(
        {
          detail: "User not found.",
        },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        },
      ),
    };
  }

  return {
    prisma,
    user,
  };
}

async function loadManagedClans(
  prisma: ReturnType<typeof getPrisma>,
  user: {
    id: number;
    isAdmin: boolean;
  },
) {
  const clans = await prisma.clan.findMany({
    where: {
      status: "active",
      ...(user.isAdmin
        ? {}
        : {
            members: {
              some: {
                userId: user.id,
                status: "active",
                role: {
                  in: ["owner", "admin"],
                },
              },
            },
          }),
    },
    orderBy: [
      {
        name: "asc",
      },
      {
        id: "asc",
      },
    ],
    include: {
      hallSetting: {
        select: {
          defaultChatView: true,
        },
      },
    },
  });

  const targets = clans.flatMap((clan) => [
    clanCrestPoolTarget(clan.slug),
    clanCurrentCrestTarget(clan.slug),
  ]);

  const assets =
    targets.length > 0
      ? await prisma.managedMediaAsset.findMany({
          where: {
            kind: "crest",
            target: {
              in: targets,
            },
          },
          orderBy: [
            {
              updatedAt: "desc",
            },
            {
              id: "desc",
            },
          ],
        })
      : [];

  return clans.map((clan) => {
    const poolTarget =
      clanCrestPoolTarget(clan.slug);
    const currentTarget =
      clanCurrentCrestTarget(clan.slug);
    const optionsByUrl = new Map<
      string,
      (typeof assets)[number] & {
        selected: boolean;
      }
    >();

    for (const asset of assets) {
      if (
        asset.target !== poolTarget &&
        asset.target !== currentTarget
      ) {
        continue;
      }

      const selected =
        asset.target === currentTarget &&
        asset.active;

      if (!optionsByUrl.has(asset.url)) {
        optionsByUrl.set(asset.url, {
          ...asset,
          selected,
        });
      } else if (selected) {
        optionsByUrl.set(asset.url, {
          ...optionsByUrl.get(asset.url)!,
          selected: true,
        });
      }
    }

    return {
      id: clan.id,
      slug: clan.slug,
      name: clan.name,
      crestUrl: clan.crestUrl,
      defaultChatView: normalizeClanChatViewMode(
        clan.hallSetting?.defaultChatView,
        "v1",
      ),
      options: Array.from(
        optionsByUrl.values(),
      ).map((asset) => ({
        id: asset.id,
        label: asset.label,
        url: asset.url,
        alt: asset.alt,
        selected:
          asset.selected ||
          asset.url === clan.crestUrl,
      })),
    };
  });
}

export async function GET(request: NextRequest) {
  const gate = await requireViewer(request);

  if ("error" in gate) {
    return gate.error;
  }

  return NextResponse.json(
    {
      clans: await loadManagedClans(
        gate.prisma,
        gate.user,
      ),
    },
    {
      headers: NO_STORE_HEADERS,
    },
  );
}

export async function PATCH(request: NextRequest) {
  const gate = await requireViewer(request);

  if ("error" in gate) {
    return gate.error;
  }

  try {
    const body = (await request
      .json()
      .catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "set_crest");
    const clanId = Number(body.clanId);

    if (!Number.isInteger(clanId) || clanId < 1) {
      return NextResponse.json(
        { detail: "Choose a clan to manage." },
        { status: 400, headers: NO_STORE_HEADERS },
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

    const canManage = await canUserManageClan(
      gate.prisma,
      {
        clanId,
        userId: gate.user.id,
        isSiteAdmin: gate.user.isAdmin,
      },
    );

    if (!canManage) {
      return NextResponse.json(
        {
          detail:
            "Only a clan owner or clan admin can change Hall settings.",
        },
        {
          status: 403,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    if (action === "set_default_chat_view") {
      if (!isClanChatViewMode(body.defaultChatView)) {
        return NextResponse.json(
          { detail: "Choose a valid Hall default view." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }

      const defaultChatView = normalizeClanChatViewMode(
        body.defaultChatView,
        "v1",
      );
      await gate.prisma.clanHallSetting.upsert({
        where: { clanId: clan.id },
        create: {
          clanId: clan.id,
          defaultChatView,
        },
        update: {
          defaultChatView,
        },
      });
      publishClanHallEvent(clan.slug, { type: "policy" });

      return NextResponse.json(
        {
          ok: true,
          defaultChatView,
          clans: await loadManagedClans(gate.prisma, gate.user),
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    const assetId = Number(body.assetId);
    if (!Number.isInteger(assetId) || assetId < 1) {
      return NextResponse.json(
        { detail: "Choose one of the clan's available crests." },
        { status: 400, headers: NO_STORE_HEADERS },
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
            "That crest has not been assigned to your clan.",
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
        clans: await loadManagedClans(
          gate.prisma,
          gate.user,
        ),
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
            : "Could not update clan crest.",
      },
      {
        status: 400,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
