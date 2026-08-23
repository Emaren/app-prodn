import { NextRequest, NextResponse } from "next/server";

import {
  approveMarketplaceProposal,
  loadMarketplaceOwnerConsole,
  requireMarketplaceKingdomOwner,
} from "@/lib/marketplaceOwnerControl";
import {
  normalizeMarketplaceLine,
  normalizeMarketplaceText,
} from "@/lib/marketplaceBusiness";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

async function gate(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) return null;

  const prisma = getPrisma();
  const owner = await requireMarketplaceKingdomOwner(prisma, uid);
  return owner ? { prisma, owner } : null;
}

export async function GET(request: NextRequest) {
  const resolved = await gate(request);
  if (!resolved) {
    return NextResponse.json(
      { detail: "Marketplace owner authority required." },
      { status: 403, headers: HEADERS }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      ownerUid: resolved.owner.uid,
      ...(await loadMarketplaceOwnerConsole(resolved.prisma)),
    },
    { headers: HEADERS }
  );
}

export async function PATCH(request: NextRequest) {
  try {
    const resolved = await gate(request);
    if (!resolved) {
      return NextResponse.json(
        { detail: "Marketplace owner authority required." },
        { status: 403, headers: HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      proposalEventId?: unknown;
      shopPublicId?: unknown;
      displayEnabled?: unknown;
      name?: unknown;
      offer?: unknown;
      ownerUid?: unknown;
    };

    const action = normalizeMarketplaceLine(body.action, 40);

    if (action === "approve") {
      const proposalEventId = Number(body.proposalEventId);
      if (!Number.isInteger(proposalEventId) || proposalEventId < 1) {
        return NextResponse.json(
          { detail: "Choose a valid Marketplace proposal." },
          { status: 400, headers: HEADERS }
        );
      }

      const shop = await approveMarketplaceProposal(resolved.prisma, {
        proposalEventId,
        approvedByUserId: resolved.owner.id,
      });

      return NextResponse.json(
        {
          ok: true,
          action,
          shopPublicId: shop.publicId,
          console: await loadMarketplaceOwnerConsole(resolved.prisma),
        },
        { headers: HEADERS }
      );
    }

    const shopPublicId = normalizeMarketplaceLine(body.shopPublicId, 80);
    const shop = await resolved.prisma.marketplaceShop.findUnique({
      where: { publicId: shopPublicId },
      include: {
        owner: { select: { walletAddress: true } },
      },
    });

    if (!shop) {
      return NextResponse.json(
        { detail: "Marketplace business not found." },
        { status: 404, headers: HEADERS }
      );
    }

    if (action === "display") {
      const displayEnabled = body.displayEnabled === true;

      if (
        displayEnabled &&
        shop.kind === "player" &&
        !shop.owner?.walletAddress
      ) {
        return NextResponse.json(
          { detail: "That proprietor must link a WOLO wallet before opening." },
          { status: 409, headers: HEADERS }
        );
      }

      if (displayEnabled && shop.status !== "active") {
        return NextResponse.json(
          { detail: "Approve the business before opening its awning." },
          { status: 409, headers: HEADERS }
        );
      }

      await resolved.prisma.marketplaceShop.update({
        where: { id: shop.id },
        data: { displayEnabled },
      });
    } else if (action === "details") {
      const name = normalizeMarketplaceLine(body.name, 100);
      const offer = normalizeMarketplaceText(body.offer, 900);

      if (!name || !offer) {
        return NextResponse.json(
          { detail: "Business name and offer are required." },
          { status: 400, headers: HEADERS }
        );
      }

      await resolved.prisma.marketplaceShop.update({
        where: { id: shop.id },
        data: { name, offer },
      });
    } else if (action === "assign") {
      const ownerUid =
        normalizeMarketplaceLine(
          body.ownerUid,
          100
        );

      if (!ownerUid) {
        return NextResponse.json(
          { detail: "Choose a proprietor." },
          { status: 400, headers: HEADERS }
        );
      }

      const proprietor =
        await resolved.prisma.user.findUnique({
          where: { uid: ownerUid },
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            walletAddress: true,
          },
        });

      if (!proprietor) {
        return NextResponse.json(
          {
            detail:
              "That AoE2WAR proprietor could not be found.",
          },
          {
            status: 404,
            headers: HEADERS,
          }
        );
      }

      const proprietorLabel =
        proprietor.inGameName ||
        proprietor.steamPersonaName ||
        proprietor.uid;

      await resolved.prisma.marketplaceShop.update({
        where: { id: shop.id },
        data: {
          ownerUserId: proprietor.id,
          proprietorLabel,

          // A proprietor without a WOLO wallet may
          // own the charter, but cannot receive live
          // Marketplace payments yet.
          displayEnabled:
            proprietor.walletAddress
              ? shop.displayEnabled
              : false,
        },
      });
    } else {
      return NextResponse.json(
        { detail: "That owner action is not supported." },
        { status: 400, headers: HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        action,
        console: await loadMarketplaceOwnerConsole(resolved.prisma),
      },
      { headers: HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Marketplace owner action failed.",
      },
      { status: 500, headers: HEADERS }
    );
  }
}
