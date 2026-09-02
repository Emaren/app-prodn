export const RADIO_WOLO_LISTENER_HEARTBEAT_MS =
  30_000;

export const RADIO_WOLO_LISTENER_ACTIVE_WINDOW_MS =
  150_000;

const LISTENER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RadioWoloRatingStyle =
  | "icons"
  | "emoji";

export function radioWoloListenerIdIsValid(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    LISTENER_UUID_RE.test(
      value.trim(),
    )
  );
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
