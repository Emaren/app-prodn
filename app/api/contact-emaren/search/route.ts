import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sessionUid = await getSessionUid(request);
  if (!sessionUid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const targetUid = request.nextUrl.searchParams.get("user")?.trim();
  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 120);
  if (!targetUid || !query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const prisma = getPrisma();
  const [viewer, target] = await Promise.all([
    prisma.user.findUnique({ where: { uid: sessionUid }, select: { id: true } }),
    prisma.user.findUnique({ where: { uid: targetUid }, select: { id: true } }),
  ]);
  if (!viewer || !target) return NextResponse.json({ results: [] });

  const pairKey = [viewer.id, target.id].sort((a, b) => a - b).join(":");
  const conversation = await prisma.directConversation.findUnique({
    where: { pairKey },
    select: { id: true, participants: { select: { userId: true } } },
  });
  if (!conversation || !conversation.participants.some((participant) => participant.userId === viewer.id)) {
    return NextResponse.json({ detail: "Conversation not found" }, { status: 404 });
  }

  const results = await prisma.directMessage.findMany({
    where: {
      conversationId: conversation.id,
      OR: [
        { body: { contains: query, mode: "insensitive" } },
        { transcription: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 40,
    select: {
      id: true,
      body: true,
      transcription: true,
      createdAt: true,
      sender: { select: { uid: true, inGameName: true, steamPersonaName: true } },
    },
  });

  return NextResponse.json({
    results: results.map((message) => ({
      messageId: message.id,
      body: message.body || message.transcription || "Message",
      createdAt: message.createdAt.toISOString(),
      senderName: message.sender.inGameName || message.sender.steamPersonaName || message.sender.uid,
    })),
  });
}
