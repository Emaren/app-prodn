import { NextRequest, NextResponse } from "next/server";

import {
  buildClanInviteBody,
  canSendClanInvite,
  looksLikeClanInvite,
  parseClanInviteStatus,
  replaceClanInviteStatus,
  type ClanInviteStatus,
} from "@/lib/clanInvites";
import { publishClanHallEvent } from "@/lib/clanHallEvents";
import { clanHallFeatureEnabled } from "@/lib/clanHallFeatures";
import { getOrCreateConversationByUsers } from "@/lib/contactInbox";
import { publishDirectMessageEvent } from "@/lib/directMessageEvents";
import { isInternalSystemUid } from "@/lib/internalSystemAccounts";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function normalizeSlug(value: string) {
  return decodeURIComponent(value).trim().toLowerCase().slice(0, 80);
}

function displayName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function parseMessageId(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function readSlug(context: { params: Promise<{ slug: string }> }) {
  const params = await context.params;
  return normalizeSlug(params.slug);
}

async function loadViewerAndClan(request: NextRequest, slug: string) {
  const uid = await getSessionUid(request);
  if (!uid) return null;

  const prisma = getPrisma();
  const [viewer, clan] = await Promise.all([
    prisma.user.findUnique({
      where: { uid },
      select: {
        id: true,
        uid: true,
        isAdmin: true,
        inGameName: true,
        steamPersonaName: true,
      },
    }),
    prisma.clan.findFirst({
      where: { slug, status: "active" },
      select: { id: true, slug: true, name: true },
    }),
  ]);

  if (!viewer || !clan) return null;

  const membership = await prisma.clanMember.findUnique({
    where: {
      clanId_userId: {
        clanId: clan.id,
        userId: viewer.id,
      },
    },
    select: { role: true, status: true },
  });

  return { prisma, viewer, clan, membership };
}

async function assertManager(request: NextRequest, slug: string) {
  const context = await loadViewerAndClan(request, slug);
  if (!context) return null;

  if (
    !canSendClanInvite({
      siteAdmin: context.viewer.isAdmin,
      membershipRole: context.membership?.role ?? null,
      membershipStatus: context.membership?.status ?? null,
    })
  ) {
    return null;
  }

  return context;
}

async function loadInvitationForViewer(
  request: NextRequest,
  slug: string,
  messageId: number,
) {
  const context = await loadViewerAndClan(request, slug);
  if (!context) return null;

  const message = await context.prisma.directMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      body: true,
      senderUserId: true,
      conversation: {
        select: {
          participants: {
            select: { userId: true },
          },
        },
      },
      sender: {
        select: {
          id: true,
          uid: true,
          isAdmin: true,
          inGameName: true,
          steamPersonaName: true,
          clanMemberships: {
            where: { clanId: context.clan.id },
            take: 1,
            select: { role: true, status: true },
          },
        },
      },
    },
  });

  if (!message) return null;
  if (
    !message.conversation.participants.some(
      (participant) => participant.userId === context.viewer.id,
    )
  ) {
    return null;
  }
  if (message.senderUserId === context.viewer.id) return null;
  if (
    !looksLikeClanInvite({
      body: message.body,
      clanName: context.clan.name,
      clanSlug: context.clan.slug,
      messageId: message.id,
    })
  ) {
    return null;
  }

  const senderMembership = message.sender.clanMemberships[0] ?? null;
  const senderAuthorized = canSendClanInvite({
    siteAdmin: message.sender.isAdmin,
    membershipRole: senderMembership?.role ?? null,
    membershipStatus: senderMembership?.status ?? null,
  });

  return {
    ...context,
    message,
    senderAuthorized,
    status: parseClanInviteStatus(message.body),
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const slug = await readSlug(context);
    if (!clanHallFeatureEnabled(slug, "inviteDoor")) {
      return NextResponse.json(
        { detail: "Invite Door is not enabled for this Hall." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const messageId = parseMessageId(
      request.nextUrl.searchParams.get("messageId"),
    );
    if (!messageId) {
      return NextResponse.json(
        { detail: "Invitation id is required." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const invitation = await loadInvitationForViewer(request, slug, messageId);
    if (!invitation) {
      return NextResponse.json(
        { detail: "Invitation not found." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const existingMembership = await invitation.prisma.clanMember.findUnique({
      where: {
        clanId_userId: {
          clanId: invitation.clan.id,
          userId: invitation.viewer.id,
        },
      },
      select: { status: true },
    });

    return NextResponse.json(
      {
        messageId,
        clanName: invitation.clan.name,
        clanSlug: invitation.clan.slug,
        inviterName: displayName(invitation.message.sender),
        status:
          existingMembership?.status === "active"
            ? "accepted"
            : invitation.status,
        canAccept:
          invitation.status === "pending" &&
          invitation.senderAuthorized &&
          existingMembership?.status !== "active",
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to load Clan invitation:", error);
    return NextResponse.json(
      { detail: "Invitation is temporarily unavailable." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const slug = await readSlug(context);
    if (!clanHallFeatureEnabled(slug, "inviteDoor")) {
      return NextResponse.json(
        { detail: "Invite Door is not enabled for this Hall." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      targetUid?: string;
      messageId?: number;
    };

    if (body.action === "send") {
      const manager = await assertManager(request, slug);
      if (!manager) {
        return NextResponse.json(
          { detail: "Only Hall leadership can send invitations." },
          { status: 403, headers: NO_STORE_HEADERS },
        );
      }

      const targetUid = String(body.targetUid || "").trim().slice(0, 120);
      if (!targetUid) {
        return NextResponse.json(
          { detail: "Choose a warrior to invite." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }

      const target = await manager.prisma.user.findUnique({
        where: { uid: targetUid },
        select: {
          id: true,
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      });
      if (!target) {
        return NextResponse.json(
          { detail: "Warrior not found." },
          { status: 404, headers: NO_STORE_HEADERS },
        );
      }
      if (isInternalSystemUid(target.uid)) {
        return NextResponse.json(
          { detail: "System identities cannot receive Clan invitations." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
      if (target.id === manager.viewer.id) {
        return NextResponse.json(
          { detail: "You are already standing in your own Hall." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }

      const existing = await manager.prisma.clanMember.findUnique({
        where: {
          clanId_userId: {
            clanId: manager.clan.id,
            userId: target.id,
          },
        },
        select: { status: true },
      });
      if (existing?.status === "active") {
        return NextResponse.json(
          { detail: `${displayName(target)} is already in the clan.` },
          { status: 409, headers: NO_STORE_HEADERS },
        );
      }

      const conversation = await getOrCreateConversationByUsers(
        manager.prisma,
        manager.viewer.id,
        target.id,
      );

      const recentInviteMessages =
        await manager.prisma.directMessage.findMany({
          where: {
            conversationId: conversation.id,
            senderUserId: manager.viewer.id,
            body: {
              startsWith: `🏰 ${manager.clan.name} invitation\n`,
            },
          },
          orderBy: { id: "desc" },
          take: 20,
          select: {
            id: true,
            body: true,
          },
        });

      const pendingInvite =
        recentInviteMessages.find((row) =>
          parseClanInviteStatus(row.body) === "pending" &&
          looksLikeClanInvite({
            body: row.body,
            clanName: manager.clan.name,
            clanSlug: manager.clan.slug,
            messageId: row.id,
          }),
        );

      if (pendingInvite) {
        return NextResponse.json(
          {
            detail: `An invitation to ${displayName(target)} is already pending.`,
            messageId: pendingInvite.id,
          },
          { status: 409, headers: NO_STORE_HEADERS },
        );
      }

      const placeholder = await manager.prisma.directMessage.create({
        data: {
          conversationId: conversation.id,
          senderUserId: manager.viewer.id,
          body: "Preparing Clan invitation…",
        },
        select: { id: true },
      });

      const invitationBody = buildClanInviteBody({
        clanName: manager.clan.name,
        clanSlug: manager.clan.slug,
        inviterName: displayName(manager.viewer),
        messageId: placeholder.id,
        origin: request.nextUrl.origin,
        status: "pending",
      });

      await manager.prisma.$transaction([
        manager.prisma.directMessage.update({
          where: { id: placeholder.id },
          data: { body: invitationBody },
        }),
        manager.prisma.directConversation.update({
          where: { id: conversation.id },
          data: { updatedAt: new Date() },
        }),
      ]);

      publishDirectMessageEvent(target.uid, {
        type: "message",
        targetUid: manager.viewer.uid,
        messageId: placeholder.id,
      });

      return NextResponse.json(
        {
          ok: true,
          messageId: placeholder.id,
          targetUid: target.uid,
          targetName: displayName(target),
        },
        { status: 201, headers: NO_STORE_HEADERS },
      );
    }

    if (body.action !== "accept" && body.action !== "decline") {
      return NextResponse.json(
        { detail: "Choose an invitation action." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const messageId = parseMessageId(body.messageId);
    if (!messageId) {
      return NextResponse.json(
        { detail: "Invitation id is required." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const invitation = await loadInvitationForViewer(request, slug, messageId);
    if (!invitation || invitation.status !== "pending") {
      return NextResponse.json(
        { detail: "That invitation is no longer pending." },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }
    if (!invitation.senderAuthorized) {
      return NextResponse.json(
        { detail: "That invitation is no longer authorized." },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    const nextStatus: ClanInviteStatus =
      body.action === "accept" ? "accepted" : "declined";
    const nextBody = replaceClanInviteStatus(
      invitation.message.body || "",
      nextStatus,
    );
    if (!nextBody) {
      return NextResponse.json(
        { detail: "Invitation state could not be verified." },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    if (body.action === "accept") {
      await invitation.prisma.clanMember.upsert({
        where: {
          clanId_userId: {
            clanId: invitation.clan.id,
            userId: invitation.viewer.id,
          },
        },
        create: {
          clanId: invitation.clan.id,
          userId: invitation.viewer.id,
          role: "member",
          status: "active",
        },
        update: {
          role: "member",
          status: "active",
        },
      });
    }

    await invitation.prisma.directMessage.update({
      where: { id: invitation.message.id },
      data: { body: nextBody },
    });

    publishDirectMessageEvent(invitation.message.sender.uid, {
      type: "message_updated",
      targetUid: invitation.viewer.uid,
      messageId: invitation.message.id,
    });
    publishDirectMessageEvent(invitation.viewer.uid, {
      type: "message_updated",
      targetUid: invitation.message.sender.uid,
      messageId: invitation.message.id,
    });

    if (body.action === "accept") {
      publishClanHallEvent(slug, { type: "roster" });
    }

    return NextResponse.json(
      {
        ok: true,
        status: nextStatus,
        joined: body.action === "accept",
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to process Clan invitation:", error);
    return NextResponse.json(
      { detail: "Clan invitation could not be processed." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
