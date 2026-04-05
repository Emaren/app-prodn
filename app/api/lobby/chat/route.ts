import { NextRequest, NextResponse } from "next/server";
import {
  ensureAiPersonaUser,
  requestAiConciergeReply,
  type RequestAiConciergeReplyArgs,
} from "@/lib/aiConcierge";
import {
  AI_VISIBILITY_OPTIONS,
  DEFAULT_AI_VISIBILITY,
  getAiPersonaConfig,
  type AiPersonaId,
  type AiVisibilityOption,
} from "@/lib/aiConciergeConfig";
import { requestEnabledAiReplies } from "@/lib/aiPersonaOrchestrator";
import { ensureLobbyRoom, getLobbyMessages } from "@/lib/communityStore";
import { getOrCreateConversationByUsers } from "@/lib/contactInbox";
import { readGuestReactionSessionIdFromRequest } from "@/lib/guestReactionSession";
import { LOBBY_ROOM_SLUG, normalizeChatBody } from "@/lib/lobby";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

type PreparedPersonaThread = {
  personaId: AiPersonaId;
  aiUserId: number;
  conversationId: number;
  history: ConversationHistoryTurn[];
};

function parseAiVisibility(value: unknown): AiVisibilityOption {
  return typeof value === "string" && AI_VISIBILITY_OPTIONS.includes(value as AiVisibilityOption)
    ? (value as AiVisibilityOption)
    : DEFAULT_AI_VISIBILITY;
}

function parseSelectedPersonaIds(
  body: Record<string, unknown>,
  aiEnabled: boolean
): Exclude<AiPersonaId, "guy">[] {
  if (!aiEnabled) {
    return [];
  }

  const personaIds: Exclude<AiPersonaId, "guy">[] = [];

  if (body.aiScribeEnabled !== false) {
    personaIds.push("scribe");
  }

  if (body.aiGrimerEnabled !== false) {
    personaIds.push("grimer");
  }

  return personaIds;
}

function buildPrivateNotice(personaIds: AiPersonaId[]) {
  if (personaIds.length === 0) {
    return "Message sent privately.";
  }

  if (personaIds.length === 1) {
    return `Message sent privately to ${getAiPersonaConfig(personaIds[0]).name}.`;
  }

  const personaNames = personaIds.map((personaId) => getAiPersonaConfig(personaId).name);
  const lastName = personaNames.pop();
  return `Message sent privately to ${personaNames.join(", ")} and ${lastName}.`;
}

async function preparePersonaThread(args: {
  prisma: ReturnType<typeof getPrisma>;
  viewerUserId: number;
  personaId: AiPersonaId;
  messageBody: string;
}): Promise<PreparedPersonaThread> {
  const { prisma, viewerUserId, personaId, messageBody } = args;

  const aiUser = await ensureAiPersonaUser(prisma, personaId);
  const aiConversation = await getOrCreateConversationByUsers(prisma, viewerUserId, aiUser.id);
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
      senderUserId: viewerUserId,
      body: messageBody,
    },
  });

  return {
    personaId,
    aiUserId: aiUser.id,
    conversationId: aiConversation.id,
    history: priorAiThreadMessages
      .slice()
      .reverse()
      .filter((message) => Boolean(message.body?.trim()))
      .map((message) => ({
        role: message.senderUserId === viewerUserId ? "user" : "assistant",
        content: String(message.body || "").trim(),
      })),
  };
}

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
  const aiVisibility = parseAiVisibility(body.aiVisibility);
  const selectedPersonaIds = parseSelectedPersonaIds(body, aiEnabled);
  const privateThreadPersonaIds: Exclude<AiPersonaId, "guy">[] =
    aiVisibility === "private"
      ? selectedPersonaIds.length > 0
        ? selectedPersonaIds
        : ["scribe"]
      : selectedPersonaIds;

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

  if (aiVisibility === "public") {
    const recentMessage = await prisma.chatMessage.findFirst({
      where: {
        roomId: room.id,
        userId: user.id,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    if (recentMessage && Date.now() - recentMessage.createdAt.getTime() < 4_000) {
      return NextResponse.json(
        { detail: "You are sending messages too quickly. Wait a few seconds." },
        { status: 429 }
      );
    }
  } else {
    const recentDirectMessage = await prisma.directMessage.findFirst({
      where: {
        senderUserId: user.id,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    if (recentDirectMessage && Date.now() - recentDirectMessage.createdAt.getTime() < 4_000) {
      return NextResponse.json(
        { detail: "You are sending messages too quickly. Wait a few seconds." },
        { status: 429 }
      );
    }
  }

  if (aiVisibility === "public") {
    await prisma.chatMessage.create({
      data: {
        roomId: room.id,
        userId: user.id,
        body: messageBody,
      },
    });
  }

  const notices: string[] = [];
  const warnings: string[] = [];

  if (aiVisibility === "private") {
    notices.push(buildPrivateNotice(privateThreadPersonaIds));
  }

  const preparedThreads = new Map<AiPersonaId, PreparedPersonaThread>();

  for (const personaId of privateThreadPersonaIds) {
    const thread = await preparePersonaThread({
      prisma,
      viewerUserId: user.id,
      personaId,
      messageBody,
    });
    preparedThreads.set(personaId, thread);
  }

  if (aiEnabled && selectedPersonaIds.length > 0) {
    try {
      const aiReplies = await requestEnabledAiReplies(
        {
          prisma,
          viewer: {
            uid: user.uid,
            displayName: user.inGameName || user.steamPersonaName || user.uid,
          },
          source: aiVisibility === "public" ? "lobby_public" : "lobby_private",
          userMessage: messageBody,
          visibility: aiVisibility,
          roomSlug: room.slug,
          selectedPersonaIds,
          guyEnabled: aiVisibility === "public",
        },
        async (requestArgs: RequestAiConciergeReplyArgs) => {
          const personaId = requestArgs.personaId as AiPersonaId;
          const thread = preparedThreads.get(personaId);

          return requestAiConciergeReply({
            ...requestArgs,
            conversationHistory: thread?.history ?? [],
          });
        }
      );

      for (const aiReply of aiReplies) {
        const personaId = aiReply.personaId as AiPersonaId;
        let thread = preparedThreads.get(personaId);

        if (!thread) {
          thread = await preparePersonaThread({
            prisma,
            viewerUserId: user.id,
            personaId,
            messageBody,
          });
          preparedThreads.set(personaId, thread);
        }

        const aiThreadMessage = await prisma.directMessage.create({
          data: {
            conversationId: thread.conversationId,
            senderUserId: thread.aiUserId,
            body: aiReply.body,
          },
          select: { id: true },
        });

        if (aiVisibility === "public") {
          const publicAiMessage = await prisma.chatMessage.create({
            data: {
              roomId: room.id,
              userId: thread.aiUserId,
              body: normalizeChatBody(aiReply.body) || `${aiReply.personaName} checked in.`,
            },
            select: { id: true },
          });

          await prisma.directMessage.update({
            where: { id: aiThreadMessage.id },
            data: {
              sharedLobbyMessageId: publicAiMessage.id,
            },
          });
        }
      }
    } catch (aiError) {
      console.warn("Lobby booth reply failed:", aiError);
      warnings.push("The booth is offline right now. Your message still posted.");
    }
  }

  const messages = await getLobbyMessages(prisma, room.slug, 30, {
    uid,
    guestSessionId: readGuestReactionSessionIdFromRequest(request),
  });

  return NextResponse.json({
    ok: true,
    messages,
    aiWarning: [...notices, ...warnings].join(" ").trim() || null,
  });
}
