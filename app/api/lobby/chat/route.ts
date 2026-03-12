import { NextRequest, NextResponse } from "next/server";
import { ensureLobbyRoom, getLobbyMessages } from "@/lib/communityStore";
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

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: { id: true },
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

  const messages = await getLobbyMessages(prisma, room.slug, 30);
  return NextResponse.json({ ok: true, messages });
}
