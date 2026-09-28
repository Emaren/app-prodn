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
          cleanup();
          return false;
        }
      };

      const write = (
        eventName: string,
        payload: Record<string, unknown>,
      ) =>
        safeEnqueue(
          encoder.encode(
            `event: ${eventName}\n` +
              `data: ${JSON.stringify(payload)}\n\n`,
          ),
        );

      if (!safeEnqueue(encoder.encode("retry: 2000\n"))) return;

      unsubscribe = subscribeToClanHallEvents(
        slug,
        (event: ClanHallEvent) => {
          write("hall", event);
        },
      );

      heartbeat = setInterval(() => {
        safeEnqueue(
          encoder.encode(`: hall-fire ${Date.now()}\n\n`),
        );
      }, 15_000);
      heartbeat.unref?.();

      write("ready", {
        slug,
        at: new Date().toISOString(),
      });
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
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
