import { NextRequest, NextResponse } from "next/server";

import {
  getOrCreateConversationByUsers,
  loadInboxPayload,
  normalizeInboxMessageBody,
  resolvePrimaryAdminContact,
} from "@/lib/contactInbox";
import { recordUserActivity } from "@/lib/userExperience";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEWER_SELECT = {
  id: true,
  uid: true,
  isAdmin: true,
  inGameName: true,
  steamPersonaName: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const prisma = getPrisma();
    const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";
    const targetUid = request.nextUrl.searchParams.get("user");
    const payload = await loadInboxPayload(prisma, sessionUid, {
      summaryOnly,
      targetUid,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to load Contact Emaren inbox:", error);
    return NextResponse.json({ detail: "Inbox unavailable" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: VIEWER_SELECT,
    });

    if (!viewer) {
      return NextResponse.json({ detail: "Viewer not found" }, { status: 404 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      body?: string;
      targetUid?: string;
    };

    const messageBody = normalizeInboxMessageBody(payload.body || "");
    if (messageBody.length < 1) {
      return NextResponse.json({ detail: "Message cannot be empty" }, { status: 400 });
    }

    let targetUser =
      viewer.isAdmin && payload.targetUid
        ? await prisma.user.findUnique({
            where: { uid: payload.targetUid },
            select: VIEWER_SELECT,
          })
        : null;

    if (!viewer.isAdmin) {
      targetUser = await resolvePrimaryAdminContact(prisma);
      if (!targetUser) {
        return NextResponse.json(
          { detail: "Emaren contact is not configured yet." },
          { status: 503 }
        );
      }
    }

    if (!targetUser) {
      return NextResponse.json({ detail: "Choose a user to message." }, { status: 400 });
    }

    if (targetUser.id === viewer.id) {
      return NextResponse.json({ detail: "You cannot message yourself." }, { status: 400 });
    }

    const conversation = await getOrCreateConversationByUsers(prisma, viewer.id, targetUser.id);

    await prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        senderUserId: viewer.id,
        body: messageBody,
      },
    });

    const now = new Date();
    await prisma.directConversation.update({
      where: { id: conversation.id },
      data: {
        updatedAt: now,
      },
    });

    await prisma.directConversationParticipant.updateMany({
      where: {
        conversationId: conversation.id,
        userId: viewer.id,
      },
      data: {
        lastReadAt: now,
      },
    });

    await recordUserActivity(prisma, {
      userId: viewer.id,
      type: "message_sent",
      path: "/contact-emaren",
      label: targetUser.uid,
      metadata: {
        targetUid: targetUser.uid,
      },
      dedupeWithinSeconds: 0,
    });

    const refreshed = await loadInboxPayload(prisma, viewer.uid, {
      targetUid: targetUser.uid,
    });

    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to send Contact Emaren message:", error);
    return NextResponse.json({ detail: "Message failed." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: VIEWER_SELECT,
    });

    if (!viewer) {
      return NextResponse.json({ detail: "Viewer not found" }, { status: 404 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      action?: string;
      badgeId?: number;
      giftId?: number;
      targetUid?: string;
      displayOnProfile?: boolean;
    };

    let targetUser =
      viewer.isAdmin && payload.targetUid
        ? await prisma.user.findUnique({
            where: { uid: payload.targetUid },
            select: VIEWER_SELECT,
          })
        : null;

    if (!viewer.isAdmin) {
      targetUser = await resolvePrimaryAdminContact(prisma);
      if (!targetUser) {
        return NextResponse.json(
          { detail: "Emaren contact is not configured yet." },
          { status: 503 }
        );
      }
    }

    if (!targetUser) {
      return NextResponse.json({ detail: "Choose a user first." }, { status: 400 });
    }

    const displayOnProfile = Boolean(payload.displayOnProfile);

    switch (payload.action) {
      case "accept_badge": {
        if (typeof payload.badgeId !== "number") {
          return NextResponse.json({ detail: "Badge id is required" }, { status: 400 });
        }
        const badge = await prisma.userBadge.findFirst({
          where: {
            id: payload.badgeId,
            userId: viewer.id,
            createdByUserId: targetUser.id,
          },
          select: {
            id: true,
            label: true,
          },
        });

        if (!badge) {
          return NextResponse.json({ detail: "Badge not found" }, { status: 404 });
        }

        await prisma.userBadge.update({
          where: { id: badge.id },
          data: {
            status: "accepted",
            acceptedAt: new Date(),
            displayOnProfile,
          },
        });

        await recordUserActivity(prisma, {
          userId: viewer.id,
          type: "badge_accepted",
          path: "/contact-emaren",
          label: badge.label,
          metadata: {
            badgeId: badge.id,
            displayOnProfile,
          },
          dedupeWithinSeconds: 0,
        });
        break;
      }

      case "decline_badge": {
        if (typeof payload.badgeId !== "number") {
          return NextResponse.json({ detail: "Badge id is required" }, { status: 400 });
        }

        const badge = await prisma.userBadge.findFirst({
          where: {
            id: payload.badgeId,
            userId: viewer.id,
            createdByUserId: targetUser.id,
          },
          select: {
            id: true,
            label: true,
          },
        });

        if (!badge) {
          return NextResponse.json({ detail: "Badge not found" }, { status: 404 });
        }

        await prisma.userBadge.update({
          where: { id: badge.id },
          data: {
            status: "declined",
            acceptedAt: null,
            displayOnProfile: false,
          },
        });

        await recordUserActivity(prisma, {
          userId: viewer.id,
          type: "badge_declined",
          path: "/contact-emaren",
          label: badge.label,
          metadata: {
            badgeId: badge.id,
          },
          dedupeWithinSeconds: 0,
        });
        break;
      }

      case "set_badge_display": {
        if (typeof payload.badgeId !== "number") {
          return NextResponse.json({ detail: "Badge id is required" }, { status: 400 });
        }

        const badge = await prisma.userBadge.findFirst({
          where: {
            id: payload.badgeId,
            userId: viewer.id,
            createdByUserId: targetUser.id,
            status: "accepted",
          },
          select: {
            id: true,
            label: true,
          },
        });

        if (!badge) {
          return NextResponse.json({ detail: "Accepted badge not found" }, { status: 404 });
        }

        await prisma.userBadge.update({
          where: { id: badge.id },
          data: {
            displayOnProfile,
          },
        });

        await recordUserActivity(prisma, {
          userId: viewer.id,
          type: "badge_display_changed",
          path: "/contact-emaren",
          label: badge.label,
          metadata: {
            badgeId: badge.id,
            displayOnProfile,
          },
          dedupeWithinSeconds: 0,
        });
        break;
      }

      case "accept_gift": {
        if (typeof payload.giftId !== "number") {
          return NextResponse.json({ detail: "Gift id is required" }, { status: 400 });
        }
        const gift = await prisma.userGift.findFirst({
          where: {
            id: payload.giftId,
            userId: viewer.id,
            createdByUserId: targetUser.id,
          },
          select: {
            id: true,
            kind: true,
            amount: true,
          },
        });

        if (!gift) {
          return NextResponse.json({ detail: "Gift not found" }, { status: 404 });
        }

        await prisma.userGift.update({
          where: { id: gift.id },
          data: {
            status: "accepted",
            acceptedAt: new Date(),
            displayOnProfile,
          },
        });

        await recordUserActivity(prisma, {
          userId: viewer.id,
          type: "gift_accepted",
          path: "/contact-emaren",
          label: gift.kind,
          metadata: {
            giftId: gift.id,
            amount: gift.amount,
            displayOnProfile,
          },
          dedupeWithinSeconds: 0,
        });
        break;
      }

      case "decline_gift": {
        if (typeof payload.giftId !== "number") {
          return NextResponse.json({ detail: "Gift id is required" }, { status: 400 });
        }

        const gift = await prisma.userGift.findFirst({
          where: {
            id: payload.giftId,
            userId: viewer.id,
            createdByUserId: targetUser.id,
          },
          select: {
            id: true,
            kind: true,
            amount: true,
          },
        });

        if (!gift) {
          return NextResponse.json({ detail: "Gift not found" }, { status: 404 });
        }

        await prisma.userGift.update({
          where: { id: gift.id },
          data: {
            status: "declined",
            acceptedAt: null,
            displayOnProfile: false,
          },
        });

        await recordUserActivity(prisma, {
          userId: viewer.id,
          type: "gift_declined",
          path: "/contact-emaren",
          label: gift.kind,
          metadata: {
            giftId: gift.id,
            amount: gift.amount,
          },
          dedupeWithinSeconds: 0,
        });
        break;
      }

      case "set_gift_display": {
        if (typeof payload.giftId !== "number") {
          return NextResponse.json({ detail: "Gift id is required" }, { status: 400 });
        }

        const gift = await prisma.userGift.findFirst({
          where: {
            id: payload.giftId,
            userId: viewer.id,
            createdByUserId: targetUser.id,
            status: "accepted",
          },
          select: {
            id: true,
            kind: true,
          },
        });

        if (!gift) {
          return NextResponse.json({ detail: "Accepted gift not found" }, { status: 404 });
        }

        await prisma.userGift.update({
          where: { id: gift.id },
          data: {
            displayOnProfile,
          },
        });

        await recordUserActivity(prisma, {
          userId: viewer.id,
          type: "gift_display_changed",
          path: "/contact-emaren",
          label: gift.kind,
          metadata: {
            giftId: gift.id,
            displayOnProfile,
          },
          dedupeWithinSeconds: 0,
        });
        break;
      }

      default:
        return NextResponse.json({ detail: "Unknown inbox action" }, { status: 400 });
    }

    const refreshed = await loadInboxPayload(prisma, viewer.uid, {
      targetUid: targetUser.uid,
    });

    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to update Contact Emaren item:", error);
    return NextResponse.json({ detail: "Inbox action failed." }, { status: 500 });
  }
}
