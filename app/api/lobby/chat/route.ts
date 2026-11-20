import { NextRequest, NextResponse } from "next/server";
import {
  ensureAiPersonaUser,
  requestAiConciergeReply,
  type RequestAiConciergeReplyArgs,
} from "@/lib/aiConcierge";
import {
  loadAiAgentBySlug,
  type AiAgentRuntimeConfig,
} from "@/lib/aiAgents";
import {
  type AiPersonaId,
} from "@/lib/aiConciergeConfig";
import { requestEnabledAiReplies } from "@/lib/aiPersonaOrchestrator";
import { ensureLobbyRoom, getLobbyMessages } from "@/lib/communityStore";
import { readGuestReactionSessionIdFromRequest } from "@/lib/guestReactionSession";
import { LOBBY_ROOM_SLUG, normalizeChatBody } from "@/lib/lobby";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";
import { getSessionUid } from "@/lib/session";
import { usesNonfinancialProductionAuth } from "@/lib/productionAuth";
import {
  callSocialWriter, readBoundedSocialJson, signedSocialCookie,
  validateSocialWriteOrigin,
} from "@/lib/socialWriterClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LOBBY_NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const LOBBY_REQUEST_KEY = /^[0-9a-f]{32}$/;

type LobbyMutationPayload = Record<string, unknown> & {
  action?: string;
  roomSlug?: string;
  messageId?: number;
  body?: string;
};

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

function readRoomSlug(body: Record<string, unknown>) {
  return typeof body.roomSlug === "string" && body.roomSlug.trim().length > 0
    ? body.roomSlug.trim()
    : LOBBY_ROOM_SLUG;
}

function readPositiveQueryInteger(value: string | null, fallback: number, max: number) {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

  return Math.min(parsed, max);
}

function readQueryRoomSlug(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("roomSlug");
  return value && value.trim().length > 0 ? value.trim() : LOBBY_ROOM_SLUG;
}

export async function GET(request: NextRequest) {
  const prisma = getPrisma();
  const roomSlug = readQueryRoomSlug(request);
  const beforeId = readPositiveQueryInteger(
    request.nextUrl.searchParams.get("beforeId"),
    0,
    2147483647
  );
  const limit = readPositiveQueryInteger(request.nextUrl.searchParams.get("limit"), 40, 120);

  const messages = await getLobbyMessages(prisma, roomSlug, limit, undefined, {
    beforeId: beforeId || null,
  });

  return NextResponse.json({
    ok: true,
    messages,
    hasMore: messages.length >= limit,
  });
}


async function resolveChatRoom(
  prisma: ReturnType<typeof getPrisma>,
  roomSlug: string
) {
  return roomSlug === LOBBY_ROOM_SLUG
    ? await ensureLobbyRoom(prisma)
    : await prisma.chatRoom.findUnique({
        where: { slug: roomSlug },
        select: { id: true, slug: true },
      });
}

function canManageLobbyMessage(
  viewer: { id: number; isAdmin: boolean },
  ownerUserId: number
) {
  return viewer.isAdmin || viewer.id === ownerUserId;
}

export async function POST(request: NextRequest) {
  // R25's web reader has no legacy chat_messages INSERT or sequence grant.
  // The only production mutation is a separately admitted, signed-session
  // AF_UNIX high-level Lobby V1 function. No client UID reaches this writer.
  if (usesNonfinancialProductionAuth()) {
    const uid = await getSessionUid(request);
    if (!uid) return NextResponse.json(
      { detail: "Sign in with Steam to chat." },
      { status: 401, headers: LOBBY_NO_STORE },
    );
    if (!validateSocialWriteOrigin(request)) return NextResponse.json(
      { detail: "Same-origin request required." },
      { status: 403, headers: LOBBY_NO_STORE },
    );
    const token = signedSocialCookie(request);
    if (!token) return NextResponse.json(
      { detail: "Signed session required." },
      { status: 401, headers: LOBBY_NO_STORE },
    );
    let raw: unknown;
    try { raw = await readBoundedSocialJson(request); }
    catch { return NextResponse.json(
      { detail: "Bounded plain-text JSON required." },
      { status: 400, headers: LOBBY_NO_STORE },
    ); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return NextResponse.json(
        { detail: "Invalid Lobby message request." },
        { status: 400, headers: LOBBY_NO_STORE },
      );
    const input = raw as Record<string, unknown>;
    const permitted = [
      "message", "roomSlug", "idempotencyKey", "aiEnabled",
      "aiVisibility", "aiScribeEnabled", "aiGrimerEnabled",
    ];
    const message = normalizeChatBody(input.message);
    const key = input.idempotencyKey;
    if (Object.keys(input).some((name) => !permitted.includes(name)) ||
        input.roomSlug !== LOBBY_ROOM_SLUG ||
        !message || message.length > 280 ||
        Buffer.byteLength(message, "utf8") > 1120 ||
        typeof key !== "string" || !LOBBY_REQUEST_KEY.test(key))
      return NextResponse.json(
        { detail: "Invalid Lobby message or request key." },
        { status: 400, headers: LOBBY_NO_STORE },
      );
    const reply = await callSocialWriter("lobby", token, {
      message, requestKey: key,
    });
    if (reply.status !== 201) return NextResponse.json(reply.body,
      { status: reply.status, headers: LOBBY_NO_STORE });
    const messageId = reply.body.messageId;
    if (!Number.isSafeInteger(messageId) || (messageId as number) < 1)
      return NextResponse.json({
        persisted: true,
        detail: "Check Lobby history before retrying.",
      }, { status: 202, headers: LOBBY_NO_STORE });
    // A committed write stays committed even when the web reader fails.
    const aiWarning = input.aiEnabled !== false
      ? "AI voices are unavailable on the restricted Lobby writer; human messages only."
      : null;
    try {
      const messages = await getLobbyMessages(getPrisma(), LOBBY_ROOM_SLUG, 30, {
        uid, guestSessionId: null,
      });
      return NextResponse.json({
        ok: true, persisted: true, messageId,
        replayed: reply.body.replayed === true, messages, aiWarning,
      }, { status: 201, headers: LOBBY_NO_STORE });
    } catch {
      return NextResponse.json({
        persisted: true, messageId,
        replayed: reply.body.replayed === true,
        detail: "Message saved; Lobby history is temporarily unavailable.",
        aiWarning,
      }, { status: 202, headers: LOBBY_NO_STORE });
    }
  }

  // Unrestricted local development retains its original behaviour only.
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
  const selectedPersonaIds = parseSelectedPersonaIds(body, aiEnabled);

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

  const requestedRoomSlug = readRoomSlug(body);
  const room = await resolveChatRoom(prisma, requestedRoomSlug);

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

  if (recentMessage && Date.now() - recentMessage.createdAt.getTime() < 4_000) {
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

  const warnings: string[] = [];
  const personaConfigs = new Map<AiPersonaId, AiAgentRuntimeConfig>();

  if (aiEnabled && selectedPersonaIds.length > 0) {
    const configuredPersonas = await Promise.all(
      (["scribe", "grimer", "guy"] as const).map(async (personaId) => ({
        personaId,
        config: await loadAiAgentBySlug(prisma, personaId, { enabledOnly: true }).catch(
          () => null
        ),
      }))
    );

    for (const { personaId, config } of configuredPersonas) {
      if (config) personaConfigs.set(personaId, config);
    }

    const activePersonaIds = selectedPersonaIds.filter((personaId) => {
      if (personaConfigs.has(personaId)) return true;
      warnings.push(`${personaId === "scribe" ? "The AI Scribe" : "Grimer"} is disabled or unavailable; no model call was made.`);
      return false;
    });

    if (activePersonaIds.length === 0) {
      const messages = await getLobbyMessages(prisma, room.slug, 30, {
        uid,
        guestSessionId: readGuestReactionSessionIdFromRequest(request),
      });

      return NextResponse.json({
        ok: true,
        messages,
        aiWarning: warnings.join(" ").trim() || null,
      });
    }

    try {
      const aiReplies = await requestEnabledAiReplies(
        {
          prisma,
          viewer: {
            uid: user.uid,
            displayName: user.inGameName || user.steamPersonaName || "Community member",
          },
          source: "lobby_public",
          userMessage: messageBody,
          visibility: "public",
          roomSlug: room.slug,
          selectedPersonaIds: activePersonaIds,
          guyEnabled: personaConfigs.has("guy"),
        },
        async (requestArgs: RequestAiConciergeReplyArgs) => {
          const personaId = requestArgs.personaId as AiPersonaId;
          const agentConfig = personaConfigs.get(personaId);
          if (!agentConfig) {
            throw new Error(`${personaId} is disabled or unavailable.`);
          }

          return requestAiConciergeReply({
            ...requestArgs,
            agentConfig,
          });
        }
      );

      for (const aiReply of aiReplies) {
        const personaId = aiReply.personaId as AiPersonaId;
        const aiUser = await ensureAiPersonaUser(prisma, personaId);

        await prisma.chatMessage.create({
          data: {
            roomId: room.id,
            userId: aiUser.id,
            body: normalizeChatBody(aiReply.body) || `${aiReply.personaName} checked in.`,
          },
        });
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
    aiWarning: warnings.join(" ").trim() || null,
  });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as LobbyMutationPayload;
  const uid = await resolveRequestUid(request, body);

  if (!uid) {
    return NextResponse.json({ detail: "Sign in with Steam to manage messages." }, { status: 401 });
  }

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      isAdmin: true,
    },
  });

  if (!viewer) {
    return NextResponse.json({ detail: "User not found." }, { status: 404 });
  }

  const roomSlug = readRoomSlug(body);
  const room = await resolveChatRoom(prisma, roomSlug);

  if (!room) {
    return NextResponse.json({ detail: "Chat room not found." }, { status: 404 });
  }

  if (typeof body.messageId !== "number") {
    return NextResponse.json({ detail: "Message id is required." }, { status: 400 });
  }

  const existingMessage = await prisma.chatMessage.findFirst({
    where: {
      id: body.messageId,
      roomId: room.id,
    },
    select: {
      id: true,
      userId: true,
      sharedFromDirectMessage: {
        select: { id: true },
      },
    },
  });

  if (!existingMessage) {
    return NextResponse.json({ detail: "Message not found." }, { status: 404 });
  }

  if (!canManageLobbyMessage(viewer, existingMessage.userId)) {
    return NextResponse.json({ detail: "Forbidden." }, { status: 403 });
  }

  switch (body.action) {
    case "edit_message": {
      const nextBody = normalizeChatBody(body.body);
      if (!nextBody) {
        return NextResponse.json({ detail: "Message cannot be empty." }, { status: 400 });
      }

      if (existingMessage.sharedFromDirectMessage?.id) {
        await prisma.$transaction([
          prisma.chatMessage.update({
            where: { id: existingMessage.id },
            data: { body: nextBody },
          }),
          prisma.directMessage.update({
            where: { id: existingMessage.sharedFromDirectMessage.id },
            data: { body: nextBody },
          }),
        ]);
      } else {
        await prisma.chatMessage.update({
          where: { id: existingMessage.id },
          data: { body: nextBody },
        });
      }
      break;
    }

    case "delete_message": {
      await prisma.chatMessage.delete({
        where: { id: existingMessage.id },
      });
      break;
    }

    default:
      return NextResponse.json({ detail: "Unknown chat action." }, { status: 400 });
  }

  const messages = await getLobbyMessages(prisma, room.slug, 30, {
    uid,
    guestSessionId: readGuestReactionSessionIdFromRequest(request),
  });

  return NextResponse.json({
    ok: true,
    messages,
  });
}
