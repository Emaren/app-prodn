import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTrafficBrowserInsights } from "../lib/publicTrafficInsights.ts";

const valid = () => ({
  ok: true,
  status: "OBSERVED_ONLY",
  source: "browser_beacon",
  scope: "last_7_completed_utc_days",
  from_day: "2026-10-14",
  through_day: "2026-10-20",
  coverage: {
    browser_page_views: 120,
    geolocated_page_views: 110,
    observed_browser_sessions: 30,
    positive_duration_sessions: 22,
    excluded_zero_duration_sessions: 8,
    rows_scanned: 370,
  },
  top_countries: [{ name: "Canada", unique_browser_ids: 20 }],
  top_pages: [{ path: "/traffic", page_views: 19 }],
  average_visible_seconds: 94,
});

test("a bounded completed-day observed browser cohort normalizes without implying human certification", () => {
  const result = normalizeTrafficBrowserInsights(valid(), "2026-10-21");
  assert.equal(result.status, "OBSERVED_ONLY");
  assert.equal(result.coverage.positiveDurationSessions, 22);
  assert.equal(result.coverage.excludedZeroDurationSessions, 8);
  assert.equal(result.averageVisibleSeconds, 94);
  assert.deepEqual(result.topPages, [{ path: "/traffic", pageViews: 19 }]);
});

test("rejects a report containing the current UTC day", () => {
  assert.throws(
    () => normalizeTrafficBrowserInsights(
      { ...valid(), through_day: "2026-10-21" }, "2026-10-21",
    ),
    /current\/invalid UTC day/,
  );
});

test("rejects inconsistent qualifying and excluded duration cohorts", () => {
  const raw = valid();
  raw.coverage.excluded_zero_duration_sessions = 4;
  assert.throws(
    () => normalizeTrafficBrowserInsights(raw, "2026-10-21"),
    /Inconsistent observed browser coverage/,
  );
});

test("rejects countries below the five-identifier privacy floor", () => {
  const raw = valid();
  raw.top_countries[0].unique_browser_ids = 4;
  assert.throws(
    () => normalizeTrafficBrowserInsights(raw, "2026-10-21"),
    /privacy threshold/,
  );
});

test("rejects fabricated zero duration when qualifying visits exist", () => {
  const raw = valid();
  raw.average_visible_seconds = null as unknown as number;
  assert.throws(
    () => normalizeTrafficBrowserInsights(raw, "2026-10-21"),
    /Average duration\/qualifying cohort disagreement/,
  );
});

test("rejects unapproved status or invalid public path", () => {
  assert.throws(
    () => normalizeTrafficBrowserInsights(
      { ...valid(), status: "CERTIFIED_HUMAN" }, "2026-10-21",
    ),
    /Unexpected browser evidence status/,
  );
  const raw = valid();
  raw.top_pages[0].path = "/admin/secret";
  assert.throws(
    () => normalizeTrafficBrowserInsights(raw, "2026-10-21"),
    /Invalid page/,
  );
});
