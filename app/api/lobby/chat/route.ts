import { NextRequest, NextResponse } from "next/server";
import { requestAiConciergeReply, ensureAiConciergeUser } from "@/lib/aiConcierge";
import {
  AI_VISIBILITY_OPTIONS,
  type AiVisibilityOption,
  isAiModelId,
} from "@/lib/aiConciergeConfig";
import { ensureLobbyRoom, getLobbyMessages } from "@/lib/communityStore";
import { getOrCreateConversationByUsers } from "@/lib/contactInbox";
import { readGuestReactionSessionIdFromRequest } from "@/lib/guestReactionSession";
import { LOBBY_ROOM_SLUG, normalizeChatBody } from "@/lib/lobby";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const uid = await resolveRequestUid(request, body);

  if (!uid) {
    return NextResponse.json({ detail: "Sign in with Steam to chat." }, { status: 401 });
  }

  const messageBody = normalizeChatBody(body.message);
  if (!messageBody) {
    return NextResponse.json({ detail: "Message cannot be empty." }, { status: 400 });
  }

  const aiEnabled = body.aiEnabled !== false;
  const aiVisibility =
    typeof body.aiVisibility === "string" &&
    AI_VISIBILITY_OPTIONS.includes(body.aiVisibility as AiVisibilityOption)
      ? (body.aiVisibility as AiVisibilityOption)
      : "private";
  const requestedAiModel =
    typeof body.aiModel === "string" && isAiModelId(body.aiModel) ? body.aiModel : null;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
    },
  });

  if (!user) {
    return NextResponse.json({ detail: "User not found." }, { status: 404 });
  }

  const requestedRoomSlug =
    typeof body.roomSlug === "string" && body.roomSlug.trim().length > 0
      ? body.roomSlug.trim()
      : LOBBY_ROOM_SLUG;

  const room =
    requestedRoomSlug === LOBBY_ROOM_SLUG
      ? await ensureLobbyRoom(prisma)
      : await prisma.chatRoom.findUnique({
          where: { slug: requestedRoomSlug },
          select: { id: true, slug: true },
        });

  if (!room) {
    return NextResponse.json({ detail: "Chat room not found." }, { status: 404 });
  }

  const recentMessage = await prisma.chatMessage.findFirst({
    where: {
      roomId: room.id,
      userId: user.id,
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (
    recentMessage &&
    Date.now() - recentMessage.createdAt.getTime() < 4_000
  ) {
    return NextResponse.json(
      { detail: "You are sending messages too quickly. Wait a few seconds." },
      { status: 429 }
    );
  }

  await prisma.chatMessage.create({
    data: {
      roomId: room.id,
      userId: user.id,
      body: messageBody,
    },
  });

  let aiWarning: string | null = null;

  if (aiEnabled) {
    const aiUser = await ensureAiConciergeUser(prisma);
    const aiConversation = await getOrCreateConversationByUsers(prisma, user.id, aiUser.id);
    const priorAiThreadMessages = await prisma.directMessage.findMany({
      where: {
        conversationId: aiConversation.id,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        body: true,
        senderUserId: true,
      },
    });

    await prisma.directMessage.create({
      data: {
        conversationId: aiConversation.id,
        senderUserId: user.id,
        body: messageBody,
      },
    });

    try {
      const aiReply = await requestAiConciergeReply({
        prisma,
        viewer: {
          uid: user.uid,
          displayName: user.inGameName || user.steamPersonaName || user.uid,
        },
        source: aiVisibility === "public" ? "lobby_public" : "lobby_private",
        userMessage: messageBody,
        requestedModel: requestedAiModel,
        visibility: aiVisibility,
        roomSlug: room.slug,
        conversationHistory: priorAiThreadMessages
          .slice()
          .reverse()
          .filter((message) => Boolean(message.body?.trim()))
          .map((message) => ({
            role: message.senderUserId === user.id ? "user" : "assistant",
            content: String(message.body || "").trim(),
          })),
      });

      await prisma.directMessage.create({
        data: {
          conversationId: aiConversation.id,
          senderUserId: aiUser.id,
          body: aiReply.body,
        },
      });

      if (aiVisibility === "public") {
        await prisma.chatMessage.create({
          data: {
            roomId: room.id,
            userId: aiUser.id,
            body: normalizeChatBody(aiReply.body) || "AI Concierge checked in.",
          },
        });
      }
    } catch (aiError) {
      console.warn("Lobby AI concierge reply failed:", aiError);
      aiWarning = "AI Concierge is offline right now. Your message still posted.";

      await prisma.directMessage.create({
        data: {
          conversationId: aiConversation.id,
          senderUserId: aiUser.id,
          body: "AI Concierge is offline for a moment. Try again shortly.",
        },
      });
    }
  }

  const messages = await getLobbyMessages(prisma, room.slug, 30, {
    uid,
    guestSessionId: readGuestReactionSessionIdFromRequest(request),
  });
  return NextResponse.json({ ok: true, messages, aiWarning });
}
