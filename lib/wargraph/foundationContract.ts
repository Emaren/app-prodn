import { WARGRAPH_TIME_ZONE } from "./constants.ts";

export function stableWarGraphJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableWarGraphJson).join(",")}]`;
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableWarGraphJson(record[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function normalizeWarGraphIdentity(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Stable identity for the one-argument PostgreSQL advisory-lock namespace.
 * Every writer that can change a WarGraph projection must use this exact key.
 */
export function warGraphAdvisoryLockKey(graphId: number): string {
  if (!Number.isSafeInteger(graphId) || graphId <= 0) {
    throw new Error("WARGRAPH_LOCK_GRAPH_ID_INVALID");
  }
  return `wargraph:${graphId}`;
}

function parseDateKey(key: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error("WARGRAPH_NIGHT_KEY_INVALID");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error("WARGRAPH_NIGHT_KEY_INVALID");
  }
  return { year, month, day };
}

function edmontonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: WARGRAPH_TIME_ZONE,
    timeZoneName: "longOffset",
    hour: "2-digit",
  }).formatToParts(at);
  const label = parts.find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(label ?? "");
  if (!match) throw new Error("WARGRAPH_TIME_ZONE_OFFSET_UNAVAILABLE");
  const magnitude = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? magnitude : -magnitude;
}

/** Convert a constitutional Edmonton wall-clock boundary to an exact UTC instant. */
export function warGraphBoundaryInstant(
  nightKey: string,
  minuteOfDay: number,
): Date {
  const { year, month, day } = parseDateKey(nightKey);
  if (
    !Number.isInteger(minuteOfDay) ||
    minuteOfDay < 0 ||
    minuteOfDay >= 24 * 60
  ) {
    throw new Error("WARGRAPH_BOUNDARY_MINUTE_INVALID");
  }
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const noonProbe = new Date(Date.UTC(year, month - 1, day, 12));
  const offset = edmontonOffsetMinutes(noonProbe);
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute) - offset * 60_000,
  );
}
