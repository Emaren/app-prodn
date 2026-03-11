import { NextRequest } from "next/server";
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

  let interval: NodeJS.Timeout | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const pushSnapshot = async () => {
        try {
          const snapshot = await loadLobbySnapshot(prisma, viewerUid);
          controller.enqueue(formatSse("snapshot", snapshot));
        } catch (error) {
          console.warn("Failed to stream lobby snapshot:", error);
          controller.enqueue(
            formatSse("error", { detail: "Failed to load live lobby snapshot." })
          );
        }
      };

      await pushSnapshot();

      interval = setInterval(() => {
        void pushSnapshot();
      }, 8_000);

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(":keep-alive\n\n"));
      }, 15_000);

      request.signal.addEventListener("abort", () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        if (heartbeat) clearInterval(heartbeat);
        controller.close();
      });
    },
    cancel() {
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
