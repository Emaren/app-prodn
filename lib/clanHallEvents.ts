import { EventEmitter } from "node:events";

import { clanHallFeatureEnabled } from "@/lib/clanHallFeatures";

export type ClanHallEventType =
  | "message"
  | "reaction"
  | "message_updated"
  | "message_deleted"
  | "policy"
  | "roster";

export type ClanHallEvent = {
  type: ClanHallEventType;
  messageId?: number | null;
  at: string;
};

type GlobalWithClanHallEvents = typeof globalThis & {
  __aoe2ClanHallEvents?: EventEmitter;
};

const globalWithEvents = globalThis as GlobalWithClanHallEvents;
const emitter =
  globalWithEvents.__aoe2ClanHallEvents ?? new EventEmitter();

emitter.setMaxListeners(500);
globalWithEvents.__aoe2ClanHallEvents = emitter;

function normalizeSlug(slug: string) {
  return slug.trim().toLowerCase().slice(0, 80);
}

function channel(slug: string) {
  return `clan-hall:${normalizeSlug(slug)}`;
}

export function publishClanHallEvent(
  slug: string,
  event: Omit<ClanHallEvent, "at">,
) {
  const normalized = normalizeSlug(slug);
  if (!clanHallFeatureEnabled(normalized, "realtime")) return;

  emitter.emit(channel(normalized), {
    ...event,
    at: new Date().toISOString(),
  } satisfies ClanHallEvent);
}

export function subscribeToClanHallEvents(
  slug: string,
  listener: (event: ClanHallEvent) => void,
) {
  const normalized = normalizeSlug(slug);
  if (!clanHallFeatureEnabled(normalized, "realtime")) {
    return () => {};
  }

  const eventName = channel(normalized);
  emitter.on(eventName, listener);
  return () => emitter.off(eventName, listener);
}
