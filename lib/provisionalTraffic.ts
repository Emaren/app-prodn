/** Separate provisional project activity, deliberately not human-certified Traffic. */
export type ProvisionalTrafficPoint = {
  date: string;
  observedQualifyingIps: number;
  observedGetEvents: number;
  utcDayComplete: boolean;
};

export type ProvisionalTrafficPayload = {
  kind: "provisional_observed_project_daily";
  lastCertifiedDay: string | null;
  points: ProvisionalTrafficPoint[];
};

type RawPayload = {
  ok?: unknown;
  project_slug?: unknown;
  kind?: unknown;
  last_certified_day?: unknown;
  points?: unknown;
};

const DAY_MS = 86_400_000;
const MAX_DAYS = 45;

function validUtcDay(raw: unknown): raw is string {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const parsed = Date.parse(raw + "T00:00:00Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === raw;
}

export function normalizeProvisionalTraffic(
  value: RawPayload,
  todayUtc = new Date().toISOString().slice(0, 10),
): ProvisionalTrafficPayload {
  if (!validUtcDay(todayUtc) || value?.ok !== true ||
      value.project_slug !== "aoe2hdbets" ||
      value.kind !== "provisional_observed_project_daily") {
    throw new Error("Untrusted provisional project activity source.");
  }
  const lastCertifiedDay = value.last_certified_day === null
    ? null : value.last_certified_day;
  if (lastCertifiedDay !== null &&
      (!validUtcDay(lastCertifiedDay) || lastCertifiedDay >= todayUtc)) {
    throw new Error("Provisional source has invalid canonical cutoff.");
  }
  if (!Array.isArray(value.points) || value.points.length > MAX_DAYS) {
    throw new Error("Provisional activity exceeds bounded daily evidence.");
  }
  const earliest = Date.parse(todayUtc + "T00:00:00Z") - (MAX_DAYS-1) * DAY_MS;
  let previous: string | null = null;
  const points: ProvisionalTrafficPoint[] = value.points.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Malformed provisional day.");
    }
    const point = raw as Record<string, unknown>;
    const date = point.date;
    const ips = point.observed_qualifying_ips;
    const events = point.observed_get_events;
    if (!validUtcDay(date) || date > todayUtc ||
        Date.parse(date + "T00:00:00Z") < earliest ||
        (previous !== null && date <= previous) ||
        (lastCertifiedDay !== null && date <= lastCertifiedDay) ||
        typeof ips !== "number" || !Number.isSafeInteger(ips) || ips < 0 ||
        typeof events !== "number" || !Number.isSafeInteger(events) || events < ips ||
        point.certified_human !== false ||
        point.utc_day_complete !== (date < todayUtc)) {
      throw new Error("Provisional activity invariant failed.");
    }
    previous = date;
    return {
      date,
      observedQualifyingIps: ips,
      observedGetEvents: events,
      utcDayComplete: point.utc_day_complete as boolean,
    };
  });
  return {
    kind: "provisional_observed_project_daily",
    lastCertifiedDay,
    points,
  };
}

export async function loadProvisionalTraffic(
  canonicalLastDay: string | null,
): Promise<ProvisionalTrafficPayload> {
  const base = (process.env.TRAFFIC_API_BASE || "http://127.0.0.1:3345").replace(/\/+$/, "");
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(
      base + "/api/projects/aoe2hdbets/observed-daily-series",
      { cache: "no-store", signal: controller.signal },
    );
    if (!response.ok) throw new Error("Provisional Traffic API unavailable.");
    const payload = normalizeProvisionalTraffic(await response.json() as RawPayload);
    if (payload.lastCertifiedDay !== canonicalLastDay) {
      throw new Error("Canonical/provisional Traffic cutoff mismatch.");
    }
    return payload;
  } finally {
    clearTimeout(deadline);
  }
}
