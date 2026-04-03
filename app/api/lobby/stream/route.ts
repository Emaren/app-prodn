import { NextRequest } from "next/server";
import { readGuestReactionSessionIdFromRequest } from "@/lib/guestReactionSession";
import { loadLobbySnapshot } from "@/lib/lobbySnapshot";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function formatSse(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: NextRequest) {
  const prisma = getPrisma();
  const viewerUid = await getSessionUid(request);
  const guestReactionSessionId = readGuestReactionSessionIdFromRequest(request);

  let interval: NodeJS.Timeout | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let snapshotInFlight = false;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        if (heartbeat) clearInterval(heartbeat);
      };

      const safeEnqueue = (payload: Uint8Array) => {
        if (closed || request.signal.aborted) {
          return false;
        }

        try {
          controller.enqueue(payload);
          return true;
        } catch {
          cleanup();
          return false;
        }
      };

      const pushSnapshot = async () => {
        if (closed || request.signal.aborted || snapshotInFlight) {
          return;
        }

        snapshotInFlight = true;

        try {
          const snapshot = await loadLobbySnapshot(
            prisma,
            viewerUid,
            guestReactionSessionId
          );
          safeEnqueue(formatSse("snapshot", snapshot));
        } catch (error) {
          console.warn("Failed to stream lobby snapshot:", error);
          safeEnqueue(formatSse("error", { detail: "Failed to load live lobby snapshot." }));
        } finally {
          snapshotInFlight = false;
        }
      };

      await pushSnapshot();

      interval = setInterval(() => {
        void pushSnapshot();
      }, 8_000);

      heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(":keep-alive\n\n"));
      }, 15_000);

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      if (closed) return;
      closed = true;
      if (interval) clearInterval(interval);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
