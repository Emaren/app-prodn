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
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    unsubscribe = () => {};
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (payload: Uint8Array) => {
        if (closed || request.signal.aborted) {
          cleanup();
          return false;
        }

        try {
          controller.enqueue(payload);
          return true;
        } catch {
          // The network consumer can disappear without a useful abort stack.
          // Treat a closed controller as stream teardown, never a process error.
          cleanup();
          return false;
        }
      };

      const send = (event: unknown) => {
        safeEnqueue(
          encoder.encode(
            `data: ${JSON.stringify(event)}\n\n`,
          ),
        );
      };

      if (!safeEnqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "connected",
            at: new Date().toISOString(),
          })}\n\n`,
        ),
      )) {
        return;
      }

      unsubscribe = subscribeToDirectMessageEvents(
        viewer.uid,
        send,
      );
      heartbeat = setInterval(() => {
        safeEnqueue(
          encoder.encode(
            `: heartbeat ${Date.now()}\n\n`,
          ),
        );
      }, 20_000);
      heartbeat.unref?.();
    },
    cancel() {
      cleanup();
    },
  });

  // The framework owns response-body cancellation. On request abort we only
  // release application subscriptions/timers; manually closing the controller
  // here can race a later framework close.
  request.signal.addEventListener("abort", cleanup, { once: true });
  if (request.signal.aborted) cleanup();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
