import { NextRequest } from "next/server";

import { publishDirectMessageEvent, subscribeToDirectMessageEvents } from "@/lib/directMessageEvents";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { isLiveProductionReadOnlyPreview } from "@/lib/previewDataSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sessionUid = await getSessionUid(request);
  if (!sessionUid) {
    return new Response("No active session", { status: 401 });
  }

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({
    where: { uid: sessionUid },
    select: { id: true, uid: true },
  });
  if (!viewer) {
    return new Response("Viewer not found", { status: 404 });
  }

  const memberships = await prisma.directConversationParticipant.findMany({
    where: { userId: viewer.id },
    select: { conversationId: true },
  });
  const conversationIds = memberships.map((membership) => membership.conversationId);
  if (
    !isLiveProductionReadOnlyPreview() &&
    conversationIds.length > 0
  ) {
    const pendingSenders = await prisma.directMessage.findMany({
      where: {
        conversationId: { in: conversationIds },
        senderUserId: { not: viewer.id },
        deliveredAt: null,
      },
      distinct: ["senderUserId"],
      select: { sender: { select: { uid: true } } },
    });
    const deliveredAt = new Date();
    await prisma.directMessage.updateMany({
      where: {
        conversationId: { in: conversationIds },
        senderUserId: { not: viewer.id },
        deliveredAt: null,
      },
      data: { deliveredAt },
    });
    for (const row of pendingSenders) {
      publishDirectMessageEvent(row.sender.uid, { type: "receipt", targetUid: viewer.uid });
    }
  }

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      send({ type: "connected", at: new Date().toISOString() });
      unsubscribe = subscribeToDirectMessageEvents(viewer.uid, send);
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
      }, 20_000);
    },
    cancel() {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  request.signal.addEventListener("abort", () => {
    unsubscribe();
    if (heartbeat) clearInterval(heartbeat);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
