/**
 * Read-only observed browser evidence: NOT canonical Traffic sessions, NOT
 * independently qualified humans and NEVER raw identifying browser records.
 */
export type TrafficBrowserInsights = {
  status: "OBSERVED_ONLY";
  scope: "last_7_completed_utc_days";
  fromDay: string;
  throughDay: string;
  coverage: {
    browserPageViews: number;
    geolocatedPageViews: number;
    observedBrowserSessions: number;
    positiveDurationSessions: number;
    excludedZeroDurationSessions: number;
  };
  topCountries: Array<{ name: string; uniqueBrowserIds: number | null; smallCohort: boolean; observedBrowserIds: number | null }>;
  topPages: Array<{ path: string; pageViews: number }>;
  averageVisibleSeconds: number | null;
};

function count(value: unknown, key: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("Invalid observed browser metric: " + key);
  }
  return value as number;
}

function dateValue(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value + "T00:00:00Z")) ||
      new Date(Date.parse(value + "T00:00:00Z")).toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid observed browser UTC date");
  }
  return value;
}

export function normalizeTrafficBrowserInsights(
  raw: unknown,
  todayUtc = new Date().toISOString().slice(0, 10),
): TrafficBrowserInsights {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Observed browser report missing");
  }
  const value = raw as Record<string, unknown>;
  if (value.ok !== true || value.status !== "OBSERVED_ONLY" ||
      value.scope !== "last_7_completed_utc_days") {
    throw new Error("Unexpected browser evidence status");
  }
  const fromDay = dateValue(value.from_day);
  const throughDay = dateValue(value.through_day);
  if (throughDay >= todayUtc ||
      (Date.parse(throughDay + "T00:00:00Z") -
       Date.parse(fromDay + "T00:00:00Z")) / 86_400_000 !== 6) {
    throw new Error("Browser report includes a current/invalid UTC day");
  }
  const c = value.coverage as Record<string, unknown> | undefined;
  if (!c || typeof c !== "object") throw new Error("Browser coverage absent");
  const coverage = {
    browserPageViews: count(c.browser_page_views, "page views"),
    geolocatedPageViews: count(c.geolocated_page_views, "geolocated"),
    observedBrowserSessions: count(c.observed_browser_sessions, "sessions"),
    positiveDurationSessions: count(c.positive_duration_sessions, "positive"),
    excludedZeroDurationSessions: count(c.excluded_zero_duration_sessions, "excluded"),
  };
  if (coverage.geolocatedPageViews > coverage.browserPageViews ||
      coverage.positiveDurationSessions + coverage.excludedZeroDurationSessions !== coverage.observedBrowserSessions) {
    throw new Error("Inconsistent observed browser coverage");
  }
  if (!Array.isArray(value.top_countries) || value.top_countries.length > 5 ||
      !Array.isArray(value.top_pages) || value.top_pages.length > 5) {
    throw new Error("Invalid browser ranking arrays");
  }
  const countries = value.top_countries.map((item) => {
    const row = item as Record<string, unknown>;
    if (typeof row?.name !== "string" || !row.name.trim() || row.name.length > 80 ||
        /[<>]/.test(row.name)) throw new Error("Invalid country");
    // The API may rank a real small country, but its exact count must be
    // suppressed. Only an explicit small_cohort=true with a null count is safe.
    const smallCohort = row.small_cohort === true;
    if (smallCohort !== (row.unique_browser_ids === null)) {
      throw new Error("Invalid country small-cohort suppression");
    }
    const uniqueBrowserIds = smallCohort
      ? null : count(row.unique_browser_ids, "country identifiers");
    if (uniqueBrowserIds !== null && uniqueBrowserIds < 5) {
      throw new Error("Country below privacy threshold");
    }
    if (row.small_cohort !== true && row.small_cohort !== false) {
      throw new Error("Missing country privacy flag");
    }
    // API schema evolves additively: the previous certified frontend can
    // continue reading the suppressed legacy fields until its replacement
    // activates. The exact field is a country-only aggregate, not an ID list.
    const observedBrowserIds = row.observed_browser_ids === undefined
      ? null : count(row.observed_browser_ids, "observed country count");
    if (observedBrowserIds !== null &&
        (observedBrowserIds < 1 ||
         (smallCohort && observedBrowserIds >= 5) ||
         (!smallCohort && observedBrowserIds !== uniqueBrowserIds))) {
      throw new Error("Country aggregate disagrees with legacy cohort");
    }
    return { name: row.name, uniqueBrowserIds, smallCohort, observedBrowserIds };
  });
  const pages = value.top_pages.map((item) => {
    const row = item as Record<string, unknown>;
    if (typeof row?.path !== "string" || !row.path.startsWith("/") ||
        row.path.length > 240 || /[<>\s]/.test(row.path) ||
        /^\/(api|admin|_next|static|assets|auth|login|signup|account|settings|billing|profile|internal)(\/|$)/i.test(row.path)) {
      throw new Error("Invalid page");
    }
    const pageViews = count(row.page_views, "page views");
    if (pageViews < 1) throw new Error("Empty ranked page");
    return { path: row.path, pageViews };
  });
  const duration = value.average_visible_seconds;
  const averageVisibleSeconds = duration === null
    ? null : count(duration, "average visible seconds");
  if ((averageVisibleSeconds === null) !== (coverage.positiveDurationSessions === 0)) {
    throw new Error("Average duration/qualifying cohort disagreement");
  }
  return {
    status: "OBSERVED_ONLY",
    scope: "last_7_completed_utc_days",
    fromDay,
    throughDay,
    coverage,
    topCountries: countries,
    topPages: pages,
    averageVisibleSeconds,
  };
}

export async function loadTrafficBrowserInsights(): Promise<TrafficBrowserInsights> {
  const base = (process.env.TRAFFIC_API_BASE || "http://127.0.0.1:3345").replace(/\/+$/, "");
  const controller = new AbortController();
  // Cold browser evidence aggregation is independently bounded to 12s in
  // Traffic API. This separate streamed section may wait longer; the canonical
  // Traffic chart must never block on this API or mistake an outage for zero.
  const timeout = setTimeout(() => controller.abort(), 16000);
  try {
    const response = await fetch(
      base + "/api/projects/aoe2hdbets/observed-browser-insights",
      { cache: "no-store", signal: controller.signal },
    );
    if (!response.ok) throw new Error("Browser evidence API returned " + response.status);
    return normalizeTrafficBrowserInsights(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}
