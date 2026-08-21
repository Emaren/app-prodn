import {
  NextRequest,
  NextResponse,
} from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  buildClanInviteBody,
} from "@/lib/clanInvites";
import {
  CHALLENGE_PROTOCOL_NAME,
  CHALLENGE_PROTOCOL_UID,
} from "@/lib/internalSystemAccounts";
import {
  buildMarketplaceInboxMessage,
} from "@/lib/marketplaceInboxMessage";
import {
  postMarketplaceProtocolMessage,
} from "@/lib/marketplaceBusiness";
import {
  nextVacantMarketplaceAwning,
} from "@/lib/marketplaceOwnerControl";
import {
  marketplaceBusinessProposalHeroTarget,
  marketplaceBusinessProposalSignTarget,
} from "@/lib/systemMessageMedia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control":
    "no-store, max-age=0",
};

export async function POST(
  request: NextRequest,
) {
  const gate =
    await requireAdmin(request);

  if ("error" in gate) {
    return gate.error;
  }

  const body =
    (await request
      .json()
      .catch(() => ({}))) as {
      kind?: string;
      proposalEventId?: number | null;
    };

  const systemUser =
    await gate.prisma.user.upsert({
      where: {
        uid: CHALLENGE_PROTOCOL_UID,
      },
      update: {
        inGameName:
          CHALLENGE_PROTOCOL_NAME,
        verified: true,
        lockName: true,
        verificationLevel: 1,
        verificationMethod:
          "system",
      },
      create: {
        uid: CHALLENGE_PROTOCOL_UID,
        inGameName:
          CHALLENGE_PROTOCOL_NAME,
        verified: true,
        lockName: true,
        verificationLevel: 1,
        verificationMethod:
          "system",
      },
      select: {
        id: true,
      },
    });

  if (
    body.kind ===
    "clan_invitation"
  ) {
    const clan =
      await gate.prisma.clan.findUnique({
        where: {
          slug: "aoe2war",
        },
        select: {
          name: true,
          slug: true,
        },
      });

    if (!clan) {
      return NextResponse.json(
        {
          detail:
            "AoE2WAR clan is unavailable for invitation preview.",
        },
        {
          status: 404,
          headers: HEADERS,
        },
      );
    }

    const protocol =
      await postMarketplaceProtocolMessage(
        gate.prisma,
        {
          senderUserId:
            systemUser.id,
          targetUserId:
            gate.user.id,
          body:
            "Clan invitation system preview",
        },
      );

    const inviteBody =
      buildClanInviteBody({
        clanName: clan.name,
        clanSlug: clan.slug,
        inviterName:
          CHALLENGE_PROTOCOL_NAME,
        messageId:
          protocol.message.id,
        origin:
          request.nextUrl.origin,
        status: "pending",
      }) +
      "\nSystem Preview: true";

    await gate.prisma.directMessage.update({
      where: {
        id: protocol.message.id,
      },
      data: {
        body: inviteBody,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        kind: body.kind,
        messageId:
          protocol.message.id,
      },
      {
        headers: HEADERS,
      },
    );
  }

  if (
    body.kind ===
    "business_authorization"
  ) {
    const proposalEventId =
      Number(body.proposalEventId);

    if (
      !Number.isInteger(
        proposalEventId,
      ) ||
      proposalEventId < 1
    ) {
      return NextResponse.json(
        {
          detail:
            "Choose a business proposal first.",
        },
        {
          status: 400,
          headers: HEADERS,
        },
      );
    }

    const proposal =
      await gate.prisma
        .userActivityEvent
        .findFirst({
          where: {
            id: proposalEventId,
            type:
              "market_shop_proposal",
          },
          include: {
            user: {
              select: {
                inGameName: true,
                steamPersonaName: true,
                uid: true,
              },
            },
          },
        });

    if (!proposal) {
      return NextResponse.json(
        {
          detail:
            "Business proposal not found.",
        },
        {
          status: 404,
          headers: HEADERS,
        },
      );
    }

    const metadata =
      proposal.metadata &&
      typeof proposal.metadata ===
        "object" &&
      !Array.isArray(
        proposal.metadata,
      )
        ? (proposal.metadata as Record<
            string,
            unknown
          >)
        : {};

    const shopName =
      String(
        metadata.shopName || "",
      ).trim();

    const heroTarget =
      marketplaceBusinessProposalHeroTarget(
        proposalEventId,
      );
    const signTarget =
      marketplaceBusinessProposalSignTarget(
        proposalEventId,
      );

    const [hero, sign] =
      await Promise.all([
        gate.prisma
          .managedMediaAsset
          .findFirst({
            where: {
              kind: "background",
              target: heroTarget,
              active: true,
            },
            select: { id: true },
          }),
        gate.prisma
          .managedMediaAsset
          .findFirst({
            where: {
              kind: "logo",
              target: signTarget,
              active: true,
            },
            select: { id: true },
          }),
      ]);

    if (!hero || !sign) {
      return NextResponse.json(
        {
          detail:
            "Upload and lock both the business hero and sign before testing authorization.",
        },
        {
          status: 409,
          headers: HEADERS,
        },
      );
    }

    const awning =
      await nextVacantMarketplaceAwning(
        gate.prisma,
      );
    const marketHref =
      `/market#market-awning-${awning.streetKey}-${awning.slot}`;

    const bodyText =
      buildMarketplaceInboxMessage({
        kind: "approval",
        shop:
          shopName ||
          "Business Preview",
        shopSlug: null,
        proposalEventId,
        actor:
          "The Kingdom · Preview",
        amountWolo: 0,
        recordId:
          `preview-${proposalEventId}`,
        payment:
          "System preview",
        profileHref:
          marketHref,
        requestText: [
          "Congratulations, Citizen.",
          "The kingdom has approved your business.",
        ].join("\n"),
      });

    const protocol =
      await postMarketplaceProtocolMessage(
        gate.prisma,
        {
          senderUserId:
            systemUser.id,
          targetUserId:
            gate.user.id,
          body: bodyText,
        },
      );

    return NextResponse.json(
      {
        ok: true,
        kind: body.kind,
        messageId:
          protocol.message.id,
      },
      {
        headers: HEADERS,
      },
    );
  }

  return NextResponse.json(
    {
      detail:
        "Choose a supported system-message preview.",
    },
    {
      status: 400,
      headers: HEADERS,
    },
  );
}
