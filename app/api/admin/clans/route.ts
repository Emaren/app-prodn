import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  clanCrestPoolTarget,
  clanCurrentCrestTarget,
} from "@/lib/clanCrests";
import {
  CLAN_HALL_REQUEST_MARKER,
  normalizeClanFoundingMessage,
  normalizeClanHallName,
  parseClanHallRequestText,
  slugifyClanHallName,
} from "@/lib/clanHallRequests";
import type { PrismaClient } from "@/lib/generated/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function displayName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return (
    user.inGameName ||
    user.steamPersonaName ||
    user.uid
  );
}

async function loadPayload(prisma: PrismaClient) {
  const clans = await prisma.clan.findMany({
    orderBy: [
      {
        status: "asc",
      },
      {
        name: "asc",
      },
      {
        id: "asc",
      },
    ],
    include: {
      members: {
        where: {
          status: "active",
          role: {
            in: ["owner", "admin"],
          },
        },
        orderBy: [
          {
            role: "asc",
          },
          {
            joinedAt: "asc",
          },
        ],
        include: {
          user: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
      },
      _count: {
        select: {
          members: {
            where: {
              status: "active",
            },
          },
        },
      },
    },
  });

  const crestTargets = clans.flatMap((clan) => [
    clanCrestPoolTarget(clan.slug),
    clanCurrentCrestTarget(clan.slug),
  ]);

  const [crestAssets, paidRequestRows, crestLibrary] =
    await Promise.all([
      crestTargets.length > 0
        ? prisma.managedMediaAsset.findMany({
            where: {
              kind: "crest",
              target: {
                in: crestTargets,
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
        : [],
      prisma.featureRequest.findMany({
        where: {
          requestText: {
            startsWith:
              CLAN_HALL_REQUEST_MARKER,
          },
          paymentStatus: "confirmed",
          status: {
            in: ["submitted", "accepted"],
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
        take: 40,
      }),
      prisma.managedMediaAsset.findMany({
        where: {
          kind: "crest",
          target: null,
        },
        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],
      }),
    ]);

  return {
    clans: clans.map((clan) => {
      const poolTarget =
        clanCrestPoolTarget(clan.slug);
      const currentTarget =
        clanCurrentCrestTarget(clan.slug);
      const optionsByUrl = new Map<
        string,
        (typeof crestAssets)[number] & {
          current: boolean;
        }
      >();

      for (const asset of crestAssets) {
        if (
          asset.target === poolTarget ||
          asset.target === currentTarget
        ) {
          const current =
            asset.target === currentTarget &&
            asset.active;
          const previous =
            optionsByUrl.get(asset.url);

          optionsByUrl.set(asset.url, {
            ...(previous || asset),
            current:
              current ||
              previous?.current ||
              false,
          });
        }
      }

      return {
        id: clan.id,
        slug: clan.slug,
        name: clan.name,
        tagline: clan.tagline,
        description: clan.description,
        crestUrl: clan.crestUrl,
        status: clan.status,
        memberCount: clan._count.members,
        managers: clan.members.map(
          (membership) => ({
            uid: membership.user.uid,
            displayName: displayName(
              membership.user,
            ),
            role: membership.role,
          }),
        ),
        crestOptions: Array.from(
          optionsByUrl.values(),
        ),
      };
    }),
    crestLibrary,
    paidRequests: paidRequestRows.flatMap(
      (request) => {
        const details =
          parseClanHallRequestText(
            request.requestText,
          );

        return details
          ? [
              {
                publicId: request.publicId,
                requesterUid:
                  request.requesterUidSnapshot,
                requesterName:
                  request.requesterDisplayNameSnapshot ||
                  request.requesterUidSnapshot,
                clanName: details.clanName,
                desiredSlug:
                  details.desiredSlug,
                foundingMessage:
                  details.foundingMessage,
                amountWolo:
                  request.sponsorAmountWolo,
                txHash:
                  request.sponsorTxHash,
                status: request.status,
                createdAt:
                  request.createdAt.toISOString(),
                acceptedAt:
                  request.acceptedAt?.toISOString() ??
                  null,
              },
            ]
          : [];
      },
    ),
  };
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);

  if ("error" in gate) {
    return gate.error;
  }

  return NextResponse.json(
    await loadPayload(gate.prisma),
    {
      headers: NO_STORE_HEADERS,
    },
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
    const action = cleanText(body.action, 40);

    if (action === "create_clan") {
      const name = normalizeClanHallName(
        body.name,
      );
      const slug = slugifyClanHallName(
        body.slug || name,
      );

      if (!name || !slug) {
        return NextResponse.json(
          {
            detail:
              "A clan name and valid slug are required.",
          },
          {
            status: 400,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      await gate.prisma.clan.upsert({
        where: {
          slug,
        },
        create: {
          slug,
          name,
          tagline:
            cleanText(body.tagline, 180) ||
            null,
          description:
            String(body.description ?? "")
              .trim()
              .slice(0, 5_000) || null,
          status: "active",
          chatAudiencePolicy: "public",
        },
        update: {
          name,
          tagline:
            cleanText(body.tagline, 180) ||
            null,
          description:
            String(body.description ?? "")
              .trim()
              .slice(0, 5_000) || null,
          status: "active",
        },
      });
    } else if (action === "set_manager") {
      const clanId = Number(body.clanId);
      const uid = cleanText(body.uid, 100);
      const role = cleanText(
        body.role,
        20,
      ).toLowerCase();

      if (
        !Number.isInteger(clanId) ||
        clanId < 1 ||
        !uid ||
        !["owner", "admin", "member"].includes(
          role,
        )
      ) {
        return NextResponse.json(
          {
            detail:
              "Choose a clan, user UID, and valid clan role.",
          },
          {
            status: 400,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const user =
        await gate.prisma.user.findUnique({
          where: {
            uid,
          },
          select: {
            id: true,
          },
        });

      if (!user) {
        return NextResponse.json(
          {
            detail:
              "No AoE2WAR user has that UID.",
          },
          {
            status: 404,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      await gate.prisma.clanMember.upsert({
        where: {
          clanId_userId: {
            clanId,
            userId: user.id,
          },
        },
        create: {
          clanId,
          userId: user.id,
          role,
          status: "active",
        },
        update: {
          role,
          status: "active",
        },
      });
    } else if (action === "accept_request") {
      const publicId = cleanText(
        body.publicId,
        80,
      );
      const purchase =
        await gate.prisma.featureRequest.findFirst(
          {
            where: {
              publicId,
              requestText: {
                startsWith:
                  CLAN_HALL_REQUEST_MARKER,
              },
              paymentStatus: "confirmed",
              status: {
                in: ["submitted", "accepted"],
              },
            },
          },
        );

      if (!purchase) {
        return NextResponse.json(
          {
            detail:
              "That verified Clan Alert could not be found.",
          },
          {
            status: 404,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const details =
        parseClanHallRequestText(
          purchase.requestText,
        );

      if (!details) {
        return NextResponse.json(
          {
            detail:
              "That Clan Alert is malformed.",
          },
          {
            status: 400,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const clan =
        await gate.prisma.$transaction(
          async (tx) => {
            const savedClan =
              await tx.clan.upsert({
                where: {
                  slug: details.desiredSlug,
                },
                create: {
                  slug: details.desiredSlug,
                  name: details.clanName,
                  tagline:
                    "A new banner rises in AoE2WAR.",
                  description:
                    normalizeClanFoundingMessage(
                      details.foundingMessage,
                    ),
                  status: "active",
                  chatAudiencePolicy: "public",
                },
                update: {
                  name: details.clanName,
                  description:
                    normalizeClanFoundingMessage(
                      details.foundingMessage,
                    ),
                  status: "active",
                },
              });

            await tx.clanMember.upsert({
              where: {
                clanId_userId: {
                  clanId: savedClan.id,
                  userId:
                    purchase.requesterUserId,
                },
              },
              create: {
                clanId: savedClan.id,
                userId:
                  purchase.requesterUserId,
                role: "owner",
                status: "active",
              },
              update: {
                role: "owner",
                status: "active",
              },
            });

            await tx.featureRequest.update({
              where: {
                id: purchase.id,
              },
              data: {
                status: "accepted",
                acceptedAt:
                  purchase.acceptedAt ??
                  new Date(),
              },
            });

            return savedClan;
          },
        );

      return NextResponse.json(
        {
          ok: true,
          clan,
          payload: await loadPayload(
            gate.prisma,
          ),
        },
        {
          headers: NO_STORE_HEADERS,
        },
      );
    } else {
      return NextResponse.json(
        {
          detail:
            "That Clan Command action is not supported.",
        },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        payload: await loadPayload(gate.prisma),
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
            : "Clan Command failed.",
      },
      {
        status: 400,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
