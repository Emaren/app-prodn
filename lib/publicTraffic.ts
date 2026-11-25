const V3_METRIC_VERSION = "v3-utc-day-slice" as const;
const LEGACY_METRIC_VERSION = "legacy-canonical-session" as const;

export type TrafficMetricTransition = {
  firstDate: string;
  fromVersion: typeof LEGACY_METRIC_VERSION;
  toVersion: typeof V3_METRIC_VERSION;
};

export type PublicTrafficPoint = {
  metricVersion?: typeof V3_METRIC_VERSION;
  date: string;
  values: {
    totalTraffic: number;
    suspectedHuman: number;
    confirmedHuman: number;
  };
};

export type PublicTrafficPayload = {
  ok: true;
  startDate: string | null;
  coverageEndedAt: string | null;
  archiveCalculatedAt: string | null;
  semantics: Record<string, unknown> | null;
  points: PublicTrafficPoint[];
  metricTransition?: TrafficMetricTransition;
};

type CanonicalTrafficPayload = {
  metric_transition?: unknown;
  coverage_started_at?: string | null;
  coverage_ended_at?: string | null;
  archive_calculated_at?: string | null;
  semantics?: Record<string, unknown>;
  points?: Array<{
    date?: string;
    calculatedAt?: string | null;
    metricVersion?: unknown;
    values?: {
      totalTraffic?: number;
      suspectedHuman?: number;
      confirmedHuman?: number;
    };
  }>;
};

const DAY_MS = 86_400_000;

/** Publication provenance is display-only, never evidence of missing days. */
export function normalizeArchiveCalculationUtc(value: unknown): string | null {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function trafficCount(value: unknown, day: string, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid canonical Traffic ${label} on ${day}.`);
  }
  return value;
}

function isPublishedCompleteDay(
  day: string,
  calculatedAt: string | null | undefined,
  todayUtc: string,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day >= todayUtc) return false;
  const start = Date.parse(`${day}T00:00:00Z`);
  const today = Date.parse(`${todayUtc}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(today) ||
    new Date(start).toISOString().slice(0, 10) !== day) return false;
  const end = start + DAY_MS;
  if (calculatedAt) {
    const published = Date.parse(calculatedAt);
    return Number.isFinite(published) && published >= end;
  }
  // Legacy archive: a 06:15 current-day sample must not be promoted
  // to completed history at the very next UTC midnight.
  return end + DAY_MS <= today;
}

export function normalizePublicTrafficPayload(
  payload: CanonicalTrafficPayload,
  todayUtc = new Date().toISOString().slice(0, 10),
): PublicTrafficPayload {
  // The upstream cert ledger supplies the first actual V3 day. Reject
  // orphan, mixed or unknown metric versions, never infer a transition.
  const tagged = (Array.isArray(payload.points) ? payload.points : [])
    .filter(point => point?.metricVersion !== undefined);
  const raw = payload.metric_transition;
  let metricTransition: TrafficMetricTransition | undefined;
  if (raw !== undefined || tagged.length) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error("Canonical Traffic metric transition missing or invalid.");
    }
    const t = raw as Record<string, unknown>;
    const first = t.first_date;
    if (typeof first !== "string" || first < "2026-11-23" ||
        !isPublishedCompleteDay(first, todayUtc + "T00:00:00Z", todayUtc) ||
        t.from_version !== LEGACY_METRIC_VERSION ||
        t.to_version !== V3_METRIC_VERSION ||
        typeof t.description !== "string" || !t.description.trim() ||
        !tagged.length ||
        tagged.some(point => point.metricVersion !== V3_METRIC_VERSION ||
          typeof point.date !== "string" || point.date < first) ||
        !tagged.some(point => point.date === first) ||
        (payload.points ?? []).some(point => typeof point?.date === "string" &&
          point.date >= first && point.metricVersion !== V3_METRIC_VERSION)) {
      throw new Error("Canonical Traffic metric transition mismatch.");
    }
    metricTransition = { firstDate: first, fromVersion: LEGACY_METRIC_VERSION, toVersion: V3_METRIC_VERSION };
  }

  // Without timestamps, the archive's FINAL row can be a partial day
  // captured at the morning forge. This remains unsafe even weeks later
  // when a failed timer has stopped publishing subsequent days.
  const legacyFinalDay =
    !payload.archive_calculated_at && Array.isArray(payload.points)
      ? payload.points
          .filter((p) => typeof p?.date === "string")
          .map((p) => p.date as string)
          .sort()
          .at(-1) ?? null
      : null;

  const points = Array.isArray(payload.points)
    ? payload.points
        .filter(
          (point) =>
            typeof point?.date === "string" &&
            Boolean(point.values) &&
            !(legacyFinalDay === point.date && !point.calculatedAt) &&
            isPublishedCompleteDay(
              point.date,
              point.calculatedAt ?? payload.archive_calculated_at,
              todayUtc,
            ),
        )
        .map((point) => {
          const totalTraffic = trafficCount(point.values?.totalTraffic, point.date!, "total");
          const suspectedHuman = trafficCount(point.values?.suspectedHuman, point.date!, "potential");
          const confirmedHuman = trafficCount(point.values?.confirmedHuman, point.date!, "confirmed");

          if (
            totalTraffic < suspectedHuman ||
            suspectedHuman < confirmedHuman
          ) {
            throw new Error(
              `Canonical Traffic hierarchy failed on ${point.date}.`,
            );
          }

          return {
            date: point.date as string,
            ...(point.metricVersion === V3_METRIC_VERSION ? { metricVersion: V3_METRIC_VERSION } : {}),
            values: {
              totalTraffic,
              suspectedHuman,
              confirmedHuman,
            },
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  for (let i = 1; i < points.length; i++) {
    if (points[i].date === points[i - 1].date) {
      throw new Error(`Duplicate canonical Traffic date ${points[i].date}.`);
    }
  }

  const firstDate = metricTransition?.firstDate;
  if (firstDate &&
      (points.filter(point => point.metricVersion === V3_METRIC_VERSION).length !== tagged.length ||
       !points.some(point => point.date === firstDate &&
         point.metricVersion === V3_METRIC_VERSION))) {
    throw new Error("Canonical Traffic metric transition contains unpublished days.");
  }
  return {
    ok: true,
    ...(metricTransition ? { metricTransition } : {}),
    startDate: payload.coverage_started_at || null,
    coverageEndedAt: payload.coverage_ended_at || null,
    archiveCalculatedAt: normalizeArchiveCalculationUtc(payload.archive_calculated_at),
    semantics: payload.semantics || null,
    points,
  };
}

export async function loadPublicTraffic(): Promise<PublicTrafficPayload> {
  const base = (
    process.env.TRAFFIC_API_BASE || "http://127.0.0.1:3345"
  ).replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `${base}/api/projects/aoe2hdbets/public-audience-series`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(
        `Canonical Traffic upstream returned ${response.status}.`,
      );
    }

    return normalizePublicTrafficPayload(
      (await response.json()) as CanonicalTrafficPayload,
    );
  } finally {
    clearTimeout(timeout);
  }
}
