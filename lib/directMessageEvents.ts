import { EventEmitter } from "node:events";

export type DirectMessageEvent = {
  type: "message" | "typing" | "reaction" | "receipt" | "draft" | "pin" | "message_updated";
  targetUid?: string | null;
  messageId?: number | null;
  at: string;
};

type GlobalWithDirectEvents = typeof globalThis & {
  __aoe2DirectMessageEvents?: EventEmitter;
};

const globalWithEvents = globalThis as GlobalWithDirectEvents;
const emitter = globalWithEvents.__aoe2DirectMessageEvents ?? new EventEmitter();
emitter.setMaxListeners(500);
globalWithEvents.__aoe2DirectMessageEvents = emitter;

export function publishDirectMessageEvent(userUid: string, event: Omit<DirectMessageEvent, "at">) {
  emitter.emit(userUid, { ...event, at: new Date().toISOString() } satisfies DirectMessageEvent);
}

export function subscribeToDirectMessageEvents(
  userUid: string,
  listener: (event: DirectMessageEvent) => void
) {
  emitter.on(userUid, listener);
  return () => emitter.off(userUid, listener);
}
