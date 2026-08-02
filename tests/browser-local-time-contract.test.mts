import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatDateTime } from "../lib/timeDisplay.ts";

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("an absolute replay instant renders in the browser timezone", () => {
  const rendered = formatDateTime(
    "2026-08-02T05:21:00Z",
    {
      timeDisplayMode: "local",
      timeClockMode: "24h",
      timezoneOverride: null,
    },
    {
      browserTimeZone: "America/Edmonton",
      includeZone: true,
    }
  );

  assert.match(rendered, /Aug 1/);
  assert.match(rendered, /23:21/);
  assert.match(rendered, /MDT/);
});

test("shared primary timestamp display never falls back to UTC", () => {
  const source = readSource("../components/time/TimeDisplayText.tsx");

  assert.doesNotMatch(source, /appearanceLoaded\s*\?\s*timeDisplayMode\s*:\s*["']utc["']/);
  assert.match(source, /formatForMode\([\s\S]*?["']local["']/);
  assert.match(source, /if \(!resolvedBrowserTimeZone\) return ["']—["']/);
});

test("public controls cannot switch the site back to UTC", () => {
  const challenge = readSource("../components/challenge/ChallengeWorkspace.tsx");
  const profile = readSource("../app/profile/page.tsx");
  const home = readSource("../app/HomePageClient.tsx");

  assert.doesNotMatch(challenge, /Show UTC sitewide|toggleSiteTimePreference/);
  assert.doesNotMatch(profile, /TimeDisplayModeToggle|setTimeDisplayMode/);
  assert.match(profile, /timeDisplayMode:\s*["']local["']/);
  assert.doesNotMatch(home, /^\s*timeDisplayMode,\s*$/m);
  assert.match(home, /timeDisplayMode:\s*["']local["']/);
});
