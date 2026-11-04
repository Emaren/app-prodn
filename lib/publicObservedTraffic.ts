/** Public, observational filtered-GET/IP counts — never human-certified sessions. */
export type ProvisionalObservedDay = {
  date: string;
  observedQualifyingIps: number;
  observedGetEvents: number;
  updatedAt: string;
  utcDayComplete: boolean;
  certifiedHuman: false;
};

export type PublicProvisionalObservedActivity = {
  kind: "provisional_observed_project_daily";
  lastCertifiedDay: string;
  generatedAt: string;
  points: ProvisionalObservedDay[];
};

function utcDay(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid provisional Traffic " + label);
  }
  const time = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid provisional Traffic " + label);
  }
  return value;
}

function nonnegative(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("Invalid provisional Traffic " + label);
  }
  return value as number;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(value) ||
      !Number.isFinite(Date.parse(value))) {
    throw new Error("Invalid provisional Traffic " + label);
  }
  return value;
}

export function normalizePublicProvisionalActivity(
  raw: unknown,
  todayUtc = new Date().toISOString().slice(0, 10),
): PublicProvisionalObservedActivity {
  const today = utcDay(todayUtc, "current UTC day");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Observed Traffic archive missing");
  }
  const data = raw as Record<string, unknown>;
  if (data.ok !== true || data.kind !== "provisional_observed_project_daily" ||
      data.project_slug !== "aoe2hdbets" || !Array.isArray(data.points) ||
      data.points.length > 45) {
    throw new Error("Provisional Traffic source/format rejected");
  }
  const lastCertifiedDay = utcDay(data.last_certified_day, "certified boundary");
  if (lastCertifiedDay >= today) {
    throw new Error("Certified Traffic boundary is current or in future");
  }
  const generatedAt = timestamp(data.generated_at, "generation time");
  const points: ProvisionalObservedDay[] = [];
  let previous = lastCertifiedDay;
  const oldestAllowed = new Date(Date.parse(today + "T00:00:00Z") - 45 * 86400000)
    .toISOString().slice(0, 10);
  for (const item of data.points) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Invalid provisional Traffic row");
    }
    const row = item as Record<string, unknown>;
    const date = utcDay(row.date, "row day");
    if (date <= previous || date > today || date < oldestAllowed) {
      throw new Error("Provisional Traffic day overlaps certification, duplicates or future");
    }
    if (row.certified_human !== false || typeof row.utc_day_complete !== "boolean" ||
        row.utc_day_complete !== (date < today)) {
      throw new Error("Provisional Traffic certification/partial status changed");
    }
    const observedQualifyingIps = nonnegative(row.observed_qualifying_ips, "qualifying IPs");
    const observedGetEvents = nonnegative(row.observed_get_events, "filtered GETs");
    if (observedQualifyingIps > observedGetEvents) {
      throw new Error("Provisional Traffic IP/GET hierarchy inconsistent");
    }
    const updatedAt = timestamp(row.updated_at, "row update");
    if (Date.parse(updatedAt) < Date.parse(date + "T00:00:00Z") ||
        Date.parse(updatedAt) > Date.parse(generatedAt) + 300000) {
      throw new Error("Provisional Traffic source timestamp inconsistent");
    }
    points.push({
      date, observedQualifyingIps, observedGetEvents, updatedAt,
      utcDayComplete: row.utc_day_complete, certifiedHuman: false,
    });
    previous = date;
  }
  return {
    kind: "provisional_observed_project_daily", lastCertifiedDay, generatedAt, points,
  };
}

export async function loadPublicProvisionalActivity(): Promise<PublicProvisionalObservedActivity> {
  const base = (process.env.TRAFFIC_API_BASE || "http://127.0.0.1:3345").replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const result = await fetch(
      base + "/api/projects/aoe2hdbets/observed-daily-series",
      { cache: "no-store", signal: controller.signal },
    );
    if (!result.ok) {
      throw new Error("Observed Traffic API unavailable: " + result.status);
    }
    return normalizePublicProvisionalActivity(await result.json());
  } finally {
    clearTimeout(timeout);
  }
}
