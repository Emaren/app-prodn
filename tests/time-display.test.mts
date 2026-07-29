import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatDateTime,
  markAccountTimeDisplayDefaultMigration,
  needsAccountTimeDisplayDefaultMigration,
  resolveBrowserTimeZone,
  resolveTimeZone,
} from "../lib/timeDisplay.ts";

const WINTER_INSTANT = "2026-01-15T12:00:00.000Z";
const SUMMER_INSTANT = "2026-07-15T12:00:00.000Z";

test("unhydrated local display resolves deterministically to UTC", () => {
  assert.equal(
    resolveTimeZone(
      {
        timeDisplayMode: "local",
        timeClockMode: "24h",
        timezoneOverride: null,
      },
      null
    ),
    "UTC"
  );

  assert.equal(
    formatDateTime(
      WINTER_INSTANT,
      {
        timeDisplayMode: "local",
        timeClockMode: "24h",
        timezoneOverride: null,
      },
      {
        browserTimeZone: null,
        includeZone: true,
      }
    ),
    "Jan 15, 12:00 UTC"
  );
});

test("the current browser timezone wins over a persisted fallback", () => {
  assert.equal(
    resolveBrowserTimeZone("America/Edmonton", "America/Toronto"),
    "America/Edmonton"
  );
  assert.equal(resolveBrowserTimeZone(null, "America/Toronto"), "America/Toronto");
  assert.equal(resolveBrowserTimeZone("not-a-timezone", null), null);

  assert.equal(
    resolveTimeZone(
      {
        timeDisplayMode: "local",
        timezoneOverride: "America/Toronto",
      },
      "America/Edmonton"
    ),
    "America/Edmonton"
  );
});

test("UTC mode remains authoritative even when a browser timezone exists", () => {
  assert.equal(
    resolveTimeZone(
      {
        timeDisplayMode: "utc",
        timezoneOverride: "America/Toronto",
      },
      "America/Edmonton"
    ),
    "UTC"
  );
});

test("account browser-local default migration is versioned independently per user", () => {
  const values = new Map<string, string>();
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
    },
  };

  try {
    assert.equal(needsAccountTimeDisplayDefaultMigration("jim"), true);
    markAccountTimeDisplayDefaultMigration("jim");
    assert.equal(needsAccountTimeDisplayDefaultMigration("jim"), false);
    assert.equal(needsAccountTimeDisplayDefaultMigration("emaren"), true);
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = previousWindow;
    }
  }
});

test("browser-local labels use the timestamp's historical DST offset", () => {
  const preference = {
    timeDisplayMode: "local" as const,
    timeClockMode: "24h" as const,
    timezoneOverride: null,
  };

  const winter = formatDateTime(WINTER_INSTANT, preference, {
    browserTimeZone: "America/Edmonton",
    includeZone: true,
  });
  const summer = formatDateTime(SUMMER_INSTANT, preference, {
    browserTimeZone: "America/Edmonton",
    includeZone: true,
  });

  assert.equal(winter, "Jan 15, 05:00 MST");
  assert.equal(summer, "Jul 15, 06:00 MDT");
});

test("date-only rendering follows the browser calendar day without leaking a clock", () => {
  const preference = {
    timeDisplayMode: "local" as const,
    timeClockMode: "24h" as const,
    timezoneOverride: null,
  };

  assert.equal(
    formatDateTime("2026-07-15T02:00:00.000Z", preference, {
      browserTimeZone: "America/Edmonton",
      dateOnly: true,
      includeYear: true,
      includeZone: false,
      month: "long",
    }),
    "July 14, 2026"
  );
});

test("time-only rendering keeps the browser clock and historical zone", () => {
  assert.equal(
    formatDateTime(
      SUMMER_INSTANT,
      {
        timeDisplayMode: "local",
        timeClockMode: "24h",
        timezoneOverride: null,
      },
      {
        browserTimeZone: "America/Edmonton",
        timeOnly: true,
        includeZone: true,
      }
    ),
    "06:00 MDT"
  );
});

test("invalid timestamps retain the shared empty-state contract", () => {
  assert.equal(
    formatDateTime("not-a-date", {
      timeDisplayMode: "local",
      timezoneOverride: null,
    }),
    "—"
  );
});

test("TimeDisplayText keeps server and first client render on UTC until appearance hydration", () => {
  const source = readFileSync(
    new URL("../components/time/TimeDisplayText.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /appearanceLoaded/);
  assert.match(
    source,
    /const resolvedDisplayMode = appearanceLoaded \? timeDisplayMode : "utc"/
  );
  assert.match(
    source,
    /const resolvedBrowserTimeZone = appearanceLoaded \? browserTimeZone : null/
  );
});
