import { NextRequest, NextResponse } from "next/server";
import { getLobbyMessages } from "@/lib/communityStore";
import {
  createGuestReactionSessionId,
  ensureGuestReactionSessionId,
  readGuestReactionSessionIdFromRequest,
  writeGuestReactionSessionId,
} from "@/lib/guestReactionSession";
import { LOBBY_MESSAGE_REACTIONS } from "@/lib/lobbyReactionConfig";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    messageId?: number;
    emoji?: string;
  };

  if (typeof body.messageId !== "number") {
    return NextResponse.json({ detail: "Message id is required." }, { status: 400 });
  }

  if (
    typeof body.emoji !== "string" ||
    !LOBBY_MESSAGE_REACTIONS.includes(body.emoji as (typeof LOBBY_MESSAGE_REACTIONS)[number])
  ) {
    return NextResponse.json({ detail: "Reaction is not supported." }, { status: 400 });
  }

  const prisma = getPrisma();
  const message = await prisma.chatMessage.findUnique({
    where: { id: body.messageId },
    select: {
      id: true,
      room: {
        select: {
          slug: true,
        },
      },
    },
  });

  if (!message) {
    return NextResponse.json({ detail: "Message not found." }, { status: 404 });
  }

  const viewerUid = await getSessionUid(request);

  if (viewerUid) {
    const user = await prisma.user.findUnique({
      where: { uid: viewerUid },
      select: { id: true, uid: true },
    });

    if (!user) {
      return NextResponse.json({ detail: "User not found." }, { status: 404 });
    }

    const existing = await prisma.chatMessageReaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId: message.id,
          userId: user.id,
          emoji: body.emoji,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.chatMessageReaction.delete({
        where: {
          messageId_userId_emoji: {
            messageId: message.id,
            userId: user.id,
            emoji: body.emoji,
          },
        },
      });
    } else {
      await prisma.chatMessageReaction.create({
        data: {
          messageId: message.id,
          userId: user.id,
          emoji: body.emoji,
        },
      });
    }

    const messages = await getLobbyMessages(prisma, message.room.slug, 60, {
      uid: viewerUid,
    });
    return NextResponse.json({ ok: true, messages });
  }

  const guestSessionId = readGuestReactionSessionIdFromRequest(request) || null;
  const effectiveGuestSessionId = guestSessionId || createGuestReactionSessionId();
  const existing = await prisma.chatMessageGuestReaction.findUnique({
    where: {
      messageId_guestSessionId_emoji: {
        messageId: message.id,
        guestSessionId: effectiveGuestSessionId,
        emoji: body.emoji,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.chatMessageGuestReaction.delete({
      where: {
        messageId_guestSessionId_emoji: {
          messageId: message.id,
          guestSessionId: effectiveGuestSessionId,
          emoji: body.emoji,
        },
      },
    });
  } else {
    await prisma.chatMessageGuestReaction.create({
      data: {
        messageId: message.id,
        guestSessionId: effectiveGuestSessionId,
        emoji: body.emoji,
      },
    });
  }

  const messages = await getLobbyMessages(prisma, message.room.slug, 60, {
    guestSessionId: effectiveGuestSessionId,
  });
  const response = NextResponse.json({ ok: true, messages });
  if (!guestSessionId) {
    writeGuestReactionSessionId(response, effectiveGuestSessionId);
  } else {
    ensureGuestReactionSessionId(request, response, effectiveGuestSessionId);
  }
  return response;
}
