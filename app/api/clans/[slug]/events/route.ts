import { NextRequest } from "next/server";

import {
  subscribeToClanHallEvents,
  type ClanHallEvent,
} from "@/lib/clanHallEvents";
import { clanHallFeatureEnabled } from "@/lib/clanHallFeatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeSlug(value: string) {
  return decodeURIComponent(value)
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const params = await context.params;
  const slug = normalizeSlug(params.slug);

  if (!clanHallFeatureEnabled(slug, "realtime")) {
    return Response.json(
      { detail: "Live Hall events are not enabled for this clan." },
      {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const write = (
        eventName: string,
        payload: Record<string, unknown>,
      ) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(
            `event: ${eventName}\n` +
              `data: ${JSON.stringify(payload)}\n\n`,
          ),
        );
      };

      const unsubscribe = subscribeToClanHallEvents(
        slug,
        (event: ClanHallEvent) => {
          write("hall", event);
        },
      );

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`: hall-fire ${Date.now()}\n\n`),
        );
      }, 15_000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Browser may already have closed the stream.
        }
      };

      cleanup = close;
      request.signal.addEventListener("abort", close, {
        once: true,
      });

      controller.enqueue(encoder.encode("retry: 2000\n"));
      write("ready", {
        slug,
        at: new Date().toISOString(),
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
