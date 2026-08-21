import { NextRequest, NextResponse } from "next/server";

import {
  livingKingdomHub,
  type LivingKingdomRoomFanoutView,
} from "@/lib/livingKingdom/hub";
import { livingKingdomFeatureMode } from "@/lib/livingKingdom/identity";
import {
  LIVING_KINGDOM_PROTOCOL_VERSION,
  LIVING_KINGDOM_SSE_HEARTBEAT_MS,
  type LivingKingdomDeltaEvent,
  type LivingKingdomPublicActor,
  type LivingKingdomRoomEvent,
  type LivingKingdomSnapshotEvent,
} from "@/lib/livingKingdom/protocol";
import {
  isLivingKingdomRealmId,
  type LivingKingdomRealmId,
} from "@/lib/livingKingdom/realms";
import { getSessionUid } from "@/lib/session";
import {
  livingKingdomClientAddress,
  livingKingdomStreamRegistry,
} from "@/lib/livingKingdom/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const eventRoomViews = new WeakMap<LivingKingdomRoomEvent, {
  realmId: LivingKingdomRealmId;
  view: LivingKingdomRoomFanoutView;
}>();

function formatEvent(name: string, data: unknown) {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

function encodeEvent(name: string, data: unknown) {
  return encoder.encode(formatEvent(name, data));
}

function roomViewForFanout(
  realmId: LivingKingdomRealmId,
  event?: LivingKingdomRoomEvent,
) {
  if (event) {
    const cached = eventRoomViews.get(event);
    if (cached?.realmId === realmId) return cached.view;
  }

  const view = livingKingdomHub.createRoomFanoutView(realmId);
  if (event) eventRoomViews.set(event, { realmId, view });
  return view;
}

function snapshotForRoom(
  realmId: LivingKingdomRealmId,
  uid: string | null,
  event?: LivingKingdomRoomEvent,
) {
  const room = roomViewForFanout(realmId, event).snapshotForUid(uid);
  const snapshot: LivingKingdomSnapshotEvent = {
    protocol: LIVING_KINGDOM_PROTOCOL_VERSION,
    realmId,
    actors: room.actors,
    overflowCount: room.overflowCount,
  };
  if (room.selfId) snapshot.selfId = room.selfId;
  return snapshot;
}

function actorFingerprint(actor: LivingKingdomPublicActor) {
  return [
    actor.displayName,
    actor.avatarUrl,
    actor.realmId,
    actor.href,
    actor.depthBand,
    actor.motion,
  ].join("\u0000");
}

export async function GET(request: NextRequest) {
  if (livingKingdomFeatureMode() === "off") {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  const rawRealm = request.nextUrl.searchParams.get("realm");
  if (!isLivingKingdomRealmId(rawRealm)) {
    return NextResponse.json(
      { detail: "Invalid realm" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const realmId = rawRealm;
  const uid = await getSessionUid(request);
  if (request.signal.aborted) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const streamLease = livingKingdomStreamRegistry.acquire({
    ip: livingKingdomClientAddress(request),
    uid,
  });
  if (!streamLease.allowed) {
    return NextResponse.json(
      { detail: "Presence stream rate exceeded" },
      {
        status: streamLease.reason === "capacity" ? 503 : 429,
        headers: { "Cache-Control": "no-store", "Retry-After": "5" },
      },
    );
  }

  let deliver: (event: LivingKingdomRoomEvent) => void = () => undefined;
  const unsubscribe = livingKingdomHub.subscribe(realmId, (event) => deliver(event));
  if (!unsubscribe) {
    streamLease.release();
    return NextResponse.json(
      { detail: "Presence stream capacity reached" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "5" },
      },
    );
  }

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let needsSnapshot = false;
  let visibleActors = new Map<string, LivingKingdomPublicActor>();
  let visibleOverflowCount = 0;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    streamLease.release();
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    deliver = () => undefined;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;

      const enqueueSnapshot = (event?: LivingKingdomRoomEvent) => {
        if (closed) return false;
        if (controller.desiredSize !== null && controller.desiredSize <= 0) return false;
        try {
          const snapshot = snapshotForRoom(realmId, uid, event);
          controller.enqueue(encodeEvent("snapshot", snapshot));
          visibleActors = new Map(snapshot.actors.map((actor) => [actor.id, actor]));
          visibleOverflowCount = snapshot.overflowCount;
          needsSnapshot = false;
          return true;
        } catch {
          cleanup();
          return false;
        }
      };

      deliver = (event) => {
        if (closed) return;
        if (controller.desiredSize !== null && controller.desiredSize <= 0) {
          needsSnapshot = true;
          livingKingdomHub.recordDropped();
          return;
        }
        if (needsSnapshot) {
          if (!enqueueSnapshot(event)) livingKingdomHub.recordDropped();
          return;
        }
        try {
          if (event.kind === "door") {
            controller.enqueue(encodeEvent("door", event.data));
            return;
          }

          const snapshot = snapshotForRoom(realmId, uid, event);
          const nextActors = new Map(snapshot.actors.map((actor) => [actor.id, actor]));
          const upserts = snapshot.actors.filter((actor) => {
            const previous = visibleActors.get(actor.id);
            return !previous || actorFingerprint(previous) !== actorFingerprint(actor);
          });
          const removals = Array.from(visibleActors.keys()).filter(
            (actorId) => !nextActors.has(actorId),
          );
          if (
            upserts.length > 0 ||
            removals.length > 0 ||
            snapshot.overflowCount !== visibleOverflowCount
          ) {
            const delta: LivingKingdomDeltaEvent = {
              protocol: LIVING_KINGDOM_PROTOCOL_VERSION,
              realmId,
              upserts,
              removals,
              overflowCount: snapshot.overflowCount,
            };
            controller.enqueue(encodeEvent("delta", delta));
          }
          visibleActors = nextActors;
          visibleOverflowCount = snapshot.overflowCount;
        } catch (error) {
          cleanup();
          try {
            controller.error(error);
          } catch {
            // The network consumer may already have closed the stream.
          }
        }
      };

      try {
        const initialSnapshot = snapshotForRoom(realmId, uid);
        controller.enqueue(
          encoder.encode(`retry: 3000\n\n${formatEvent("snapshot", initialSnapshot)}`),
        );
        visibleActors = new Map(initialSnapshot.actors.map((actor) => [actor.id, actor]));
        visibleOverflowCount = initialSnapshot.overflowCount;
        heartbeat = setInterval(() => {
          if (closed) return;
          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            needsSnapshot = true;
            livingKingdomHub.recordDropped();
            return;
          }
          if (needsSnapshot) {
            enqueueSnapshot();
            return;
          }
          try {
            controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          } catch {
            cleanup();
          }
        }, LIVING_KINGDOM_SSE_HEARTBEAT_MS);
        heartbeat.unref?.();
      } catch (error) {
        cleanup();
        try {
          controller.error(error);
        } catch {
          // The stream may already be closed.
        }
      }
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
      // The network consumer may already have closed the stream.
    }
  };
  request.signal.addEventListener("abort", abortStream, { once: true });
  // AbortSignal does not replay an abort to a listener installed after an
  // awaited session lookup. Close synchronously if that race already happened.
  if (request.signal.aborted) abortStream();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
