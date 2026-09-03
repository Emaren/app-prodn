import { browserVisitorIdIsValid } from "./browserVisitorId.ts";

export const RADIO_WOLO_LISTENER_HEARTBEAT_MS =
  30_000;

export const RADIO_WOLO_LISTENER_ACTIVE_WINDOW_MS =
  150_000;

export type RadioWoloRatingStyle =
  | "icons"
  | "emoji";

export function radioWoloListenerIdIsValid(
  value: unknown,
): value is string {
  return browserVisitorIdIsValid(value);
}

export function radioWoloRatingIsValid(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 10
  );
}

export function radioWoloRaterKey(
  userId: number | null,
  listenerId: string,
) {
  if (
    typeof userId === "number" &&
    Number.isInteger(userId) &&
    userId > 0
  ) {
    return `user:${userId}`;
  }

  return `anonymous:${listenerId}`;
}

export function radioWoloListenerIsEffectivelyOn(
  input: {
    listening: boolean;
    lastSeenAt:
      | Date
      | string;
  },
  now = new Date(),
) {
  if (!input.listening) {
    return false;
  }

  const lastSeenAt =
    input.lastSeenAt instanceof Date
      ? input.lastSeenAt
      : new Date(
          input.lastSeenAt,
        );

  if (
    !Number.isFinite(
      lastSeenAt.getTime(),
    )
  ) {
    return false;
  }

  return (
    now.getTime() -
      lastSeenAt.getTime() <=
    RADIO_WOLO_LISTENER_ACTIVE_WINDOW_MS
  );
}
