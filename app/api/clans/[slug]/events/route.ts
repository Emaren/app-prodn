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
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

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
      controllerRef = controller;

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

  const abortStream = () => {
    cleanup();
    try {
      controllerRef?.close();
    } catch {
      // The browser or framework may already have closed the stream.
    }
  };
  request.signal.addEventListener("abort", abortStream, { once: true });
  if (request.signal.aborted) abortStream();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
