import { NextRequest, NextResponse } from "next/server";

import { requestAiConciergeReply, ensureAiConciergeUser } from "@/lib/aiConcierge";
import { AI_CONCIERGE_UID } from "@/lib/aiConciergeConfig";
import {
  getOrCreateConversationByUsers,
  loadInboxPayload,
  normalizeInboxMessageBody,
  resolvePrimaryAdminContact,
} from "@/lib/contactInbox";
import {
  DIRECT_MESSAGE_REACTIONS,
  MAX_DIRECT_AUDIO_BYTES,
  MAX_DIRECT_IMAGE_BYTES,
} from "@/lib/contactInboxConfig";
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

type InboxAttachmentInput = {
  kind: "image" | "audio";
  name: string | null;
  mimeType: string | null;
  dataUrl: string;
  durationSeconds: number | null;
};

function readTargetUid(value: FormDataEntryValue | string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readDurationSeconds(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed);
}

async function readAttachmentInput(
  file: File,
  durationValue: FormDataEntryValue | null
): Promise<InboxAttachmentInput> {
  const mimeType = file.type || "application/octet-stream";
  const kind = mimeType.startsWith("image/")
    ? "image"
    : mimeType.startsWith("audio/")
      ? "audio"
      : null;

  if (!kind) {
    throw new Error("Only screenshots and voice notes are supported.");
  }

  if (kind === "image" && file.size > MAX_DIRECT_IMAGE_BYTES) {
    throw new Error("Screenshots must be 2.5MB or smaller.");
  }

  if (kind === "audio" && file.size > MAX_DIRECT_AUDIO_BYTES) {
    throw new Error("Voice notes must be 6MB or smaller.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    kind,
    name: file.name || null,
    mimeType,
    dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
    durationSeconds: kind === "audio" ? readDurationSeconds(durationValue) : null,
  };
}

async function readMessageInput(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const attachmentEntry = formData.get("attachment");
    const attachment =
      attachmentEntry instanceof File && attachmentEntry.size > 0
        ? await readAttachmentInput(
            attachmentEntry,
            formData.get("attachmentDurationSeconds")
          )
        : null;

    return {
      body: normalizeInboxMessageBody(String(formData.get("body") || "")),
      targetUid: readTargetUid(formData.get("targetUid")),
      attachment,
    };
  }

  const payload = (await request.json().catch(() => ({}))) as {
    body?: string;
    targetUid?: string;
  };

  return {
    body: normalizeInboxMessageBody(payload.body || ""),
    targetUid: readTargetUid(payload.targetUid),
    attachment: null,
  };
}

function buildAiPromptBody(payload: Awaited<ReturnType<typeof readMessageInput>>) {
  const lines: string[] = [];
  if (payload.body) {
    lines.push(payload.body);
  }

  if (payload.attachment) {
    lines.push(
      payload.attachment.kind === "image"
        ? `Attachment included: image${payload.attachment.name ? ` (${payload.attachment.name})` : ""}.`
        : `Attachment included: voice note${payload.attachment.durationSeconds ? ` (${payload.attachment.durationSeconds}s)` : ""}.`
    );
  }

  return lines.join("\n").trim();
}

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

    const payload = await readMessageInput(request);

    if (payload.body.length < 1 && !payload.attachment) {
      return NextResponse.json(
        { detail: "Message cannot be empty unless you attach a screenshot or voice note." },
        { status: 400 }
      );
    }

    let targetUser =
      viewer.isAdmin && payload.targetUid
        ? await prisma.user.findUnique({
            where: { uid: payload.targetUid },
            select: VIEWER_SELECT,
          })
        : null;

    if (!viewer.isAdmin) {
      if (payload.targetUid === AI_CONCIERGE_UID) {
        targetUser = await ensureAiConciergeUser(prisma);
      } else {
        targetUser = await resolvePrimaryAdminContact(prisma);
      }
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
    const aiPromptBody =
      targetUser.uid === AI_CONCIERGE_UID ? buildAiPromptBody(payload) : "";
    const priorAiThreadMessages =
      targetUser.uid === AI_CONCIERGE_UID
        ? await prisma.directMessage.findMany({
            where: {
              conversationId: conversation.id,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 10,
            select: {
              body: true,
              senderUserId: true,
            },
          })
        : [];

    await prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        senderUserId: viewer.id,
        body: payload.body || null,
        attachmentKind: payload.attachment?.kind ?? null,
        attachmentName: payload.attachment?.name ?? null,
        attachmentMimeType: payload.attachment?.mimeType ?? null,
        attachmentDataUrl: payload.attachment?.dataUrl ?? null,
        attachmentDurationSeconds: payload.attachment?.durationSeconds ?? null,
      },
    });

    if (targetUser.uid === AI_CONCIERGE_UID && aiPromptBody) {
      let aiReplyBody: string;

      try {
        const aiReply = await requestAiConciergeReply({
          prisma,
          viewer: {
            uid: viewer.uid,
            displayName: viewer.inGameName || viewer.steamPersonaName || viewer.uid,
          },
          source: "contact_thread",
          userMessage: aiPromptBody,
          conversationHistory: priorAiThreadMessages
            .slice()
            .reverse()
            .filter((message) => Boolean(message.body?.trim()))
            .map((message) => ({
              role: message.senderUserId === viewer.id ? "user" : "assistant",
              content: String(message.body || "").trim(),
            })),
        });
        aiReplyBody = aiReply.body;
      } catch (aiError) {
        console.warn("AI concierge contact reply failed:", aiError);
        aiReplyBody = "AI Concierge is offline for a moment. Try again shortly.";
      }

      await prisma.directMessage.create({
        data: {
          conversationId: conversation.id,
          senderUserId: targetUser.id,
          body: aiReplyBody,
        },
      });
    }

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
        typingUpdatedAt: null,
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
    const detail = error instanceof Error ? error.message : "Message failed.";
    const status =
      detail.includes("supported") ||
      detail.includes("smaller") ||
      detail.includes("empty")
        ? 400
        : 500;
    return NextResponse.json({ detail }, { status });
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
      messageId?: number;
      emoji?: string;
      isTyping?: boolean;
    };

    let targetUser =
      viewer.isAdmin && payload.targetUid
        ? await prisma.user.findUnique({
            where: { uid: payload.targetUid },
            select: VIEWER_SELECT,
          })
        : null;

    if (!viewer.isAdmin) {
      if (payload.targetUid === AI_CONCIERGE_UID) {
        targetUser = await ensureAiConciergeUser(prisma);
      } else {
        targetUser = await resolvePrimaryAdminContact(prisma);
      }
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

      case "toggle_reaction": {
        if (typeof payload.messageId !== "number") {
          return NextResponse.json({ detail: "Message id is required" }, { status: 400 });
        }

        if (
          typeof payload.emoji !== "string" ||
          !DIRECT_MESSAGE_REACTIONS.includes(payload.emoji as (typeof DIRECT_MESSAGE_REACTIONS)[number])
        ) {
          return NextResponse.json({ detail: "Reaction is not supported" }, { status: 400 });
        }

        const conversation = await prisma.directConversation.findUnique({
          where: { pairKey: [viewer.id, targetUser.id].sort((a, b) => a - b).join(":") },
          select: { id: true },
        });

        if (!conversation) {
          return NextResponse.json({ detail: "Conversation not found" }, { status: 404 });
        }

        const message = await prisma.directMessage.findFirst({
          where: {
            id: payload.messageId,
            conversationId: conversation.id,
          },
          select: { id: true },
        });

        if (!message) {
          return NextResponse.json({ detail: "Message not found" }, { status: 404 });
        }

        const existingReaction = await prisma.directMessageReaction.findUnique({
          where: {
            messageId_userId_emoji: {
              messageId: message.id,
              userId: viewer.id,
              emoji: payload.emoji,
            },
          },
          select: { id: true },
        });

        if (existingReaction) {
          await prisma.directMessageReaction.delete({
            where: {
              messageId_userId_emoji: {
                messageId: message.id,
                userId: viewer.id,
                emoji: payload.emoji,
              },
            },
          });
        } else {
          await prisma.directMessageReaction.create({
            data: {
              messageId: message.id,
              userId: viewer.id,
              emoji: payload.emoji,
            },
          });
        }
        break;
      }

      case "set_typing": {
        const conversation = await getOrCreateConversationByUsers(prisma, viewer.id, targetUser.id);

        await prisma.directConversationParticipant.updateMany({
          where: {
            conversationId: conversation.id,
            userId: viewer.id,
          },
          data: {
            typingUpdatedAt: payload.isTyping ? new Date() : null,
          },
        });

        return NextResponse.json({ ok: true });
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
