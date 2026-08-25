import {
  WARGRAPH_MATCH_LAUNCH_MS,
  WARGRAPH_PRIME_END_MINUTE,
  WARGRAPH_PRIME_START_MINUTE,
  WARGRAPH_RING_RESPONSE_MS,
  WARGRAPH_TIME_ZONE,
} from "./constants.ts";

import type {
  EdmontonLocalDateTime,
  WarGraphBoundPairingTiming,
  WarGraphClock,
  WarGraphOperationalPhase,
} from "./types.ts";

const edmontonFormatter = new Intl.DateTimeFormat(
  "en-CA",
  {
    timeZone: WARGRAPH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  },
);

function isValidDate(value: unknown): value is Date {
  return (
    value instanceof Date &&
    Number.isFinite(value.getTime())
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKey(
  year: number,
  month: number,
  day: number,
): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function previousDateKey(
  local: EdmontonLocalDateTime,
): string {
  const cursor = new Date(
    Date.UTC(
      local.year,
      local.month - 1,
      local.day - 1,
    ),
  );

  return dateKey(
    cursor.getUTCFullYear(),
    cursor.getUTCMonth() + 1,
    cursor.getUTCDate(),
  );
}

export function getEdmontonLocalDateTime(
  at: Date,
): EdmontonLocalDateTime | null {
  if (!isValidDate(at)) {
    return null;
  }

  const parts = new Map(
    edmontonFormatter
      .formatToParts(at)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const year = Number(parts.get("year"));
  const month = Number(parts.get("month"));
  const day = Number(parts.get("day"));
  const hour = Number(parts.get("hour"));
  const minute = Number(parts.get("minute"));
  const second = Number(parts.get("second"));

  if (
    ![
      year,
      month,
      day,
      hour,
      minute,
      second,
    ].every(Number.isInteger)
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateKey: dateKey(year, month, day),
    minuteOfDay: hour * 60 + minute,
  };
}

export function getWarGraphClock(at: Date): WarGraphClock {
  const local = getEdmontonLocalDateTime(at);

  if (!local) {
    return {
      valid: false,
      reason: "INVALID_TIMESTAMP",
    };
  }

  const isPrimeWindow =
    local.minuteOfDay >= WARGRAPH_PRIME_START_MINUTE &&
    local.minuteOfDay < WARGRAPH_PRIME_END_MINUTE;

  const phase = isPrimeWindow
    ? "PRIME"
    : local.minuteOfDay >= WARGRAPH_PRIME_END_MINUTE
      ? "LAST_CALL_PASSED"
      : "BEFORE_PRIME";

  return {
    valid: true,
    phase,
    isPrimeWindow,
    local,
    nightKey:
      local.minuteOfDay >= WARGRAPH_PRIME_START_MINUTE
        ? local.dateKey
        : previousDateKey(local),
  };
}

export function isWarGraphPrimeWindow(at: Date): boolean {
  const clock = getWarGraphClock(at);
  return clock.valid && clock.isPrimeWindow;
}

export function getWarGraphNightKey(
  at: Date,
): string | null {
  const clock = getWarGraphClock(at);
  return clock.valid ? clock.nightKey : null;
}

/**
 * Time alone cannot distinguish Afterburn from Static State: a legally
 * commenced AoE game may continue across midnight. The caller must supply
 * authoritative contract state rather than infer settlement from the clock.
 */
export function getWarGraphOperationalPhase(
  at: Date,
  hasOpenNightContracts: boolean,
): WarGraphOperationalPhase | null {
  const clock = getWarGraphClock(at);

  if (
    !clock.valid ||
    typeof hasOpenNightContracts !== "boolean"
  ) {
    return null;
  }

  if (clock.isPrimeWindow) {
    return "PRIME";
  }

  return hasOpenNightContracts
    ? "AFTERBURN"
    : "STATIC";
}

export function getRingResponseDeadline(
  advanceCreatedAt: Date,
): Date | null {
  if (
    !isValidDate(advanceCreatedAt) ||
    !isWarGraphPrimeWindow(advanceCreatedAt)
  ) {
    return null;
  }

  return new Date(
    advanceCreatedAt.getTime() +
      WARGRAPH_RING_RESPONSE_MS,
  );
}

export function getMatchLaunchDeadline(
  acceptedAt: Date,
): Date | null {
  if (!isValidDate(acceptedAt)) {
    return null;
  }

  return new Date(
    acceptedAt.getTime() +
      WARGRAPH_MATCH_LAUNCH_MS,
  );
}

export function isBoundPairingCommencementEligible(
  commencedAt: Date,
  timing: WarGraphBoundPairingTiming,
): boolean {
  if (
    !isValidDate(commencedAt) ||
    !isValidDate(timing?.advanceCreatedAt) ||
    !isValidDate(timing?.acceptedAt)
  ) {
    return false;
  }

  const responseDeadline =
    getRingResponseDeadline(
      timing.advanceCreatedAt,
    );

  const launchDeadline =
    getMatchLaunchDeadline(timing.acceptedAt);

  if (!responseDeadline || !launchDeadline) {
    return false;
  }

  const advanceMs = timing.advanceCreatedAt.getTime();
  const acceptedMs = timing.acceptedAt.getTime();
  const commencedMs = commencedAt.getTime();

  return (
    acceptedMs >= advanceMs &&
    acceptedMs < responseDeadline.getTime() &&
    commencedMs >= acceptedMs &&
    commencedMs < launchDeadline.getTime()
  );
}
