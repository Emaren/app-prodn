import assert from "node:assert/strict";
import test from "node:test";

import {
  appearancePreferenceFingerprint,
  appearancePreferenceNeedsSave,
  type AppearancePreferenceInput,
} from "../lib/appearancePreference.ts";

const BASE: AppearancePreferenceInput = {
  themeKey: "dark",
  tileThemeKey: "dark",
  viewMode: "basic",
  textColor: "default",
  timeDisplayMode: "local",
  timeClockMode: "24h",
  timezoneOverride: "America/Edmonton",
  tileViewPreferences: { forum: "extreme", live_games: "basic" },
  leaderboardLane: "rm",
};

test("appearance fingerprint is stable across tile preference key order", () => {
  const reordered: AppearancePreferenceInput = {
    ...BASE,
    tileViewPreferences: { live_games: "basic", forum: "extreme" },
  };

  assert.equal(
    appearancePreferenceFingerprint(BASE),
    appearancePreferenceFingerprint(reordered),
  );
});

test("appearance fingerprint changes for browser timezone persistence", () => {
  assert.notEqual(
    appearancePreferenceFingerprint(BASE),
    appearancePreferenceFingerprint({
      ...BASE,
      timezoneOverride: "America/Toronto",
    }),
  );
});

test("appearance fingerprint changes for account time-default migration", () => {
  assert.notEqual(
    appearancePreferenceFingerprint(BASE),
    appearancePreferenceFingerprint({
      ...BASE,
      timeDisplayMode: "utc",
    }),
  );
});

test("appearance fingerprint changes for tile-default migration and user edits", () => {
  assert.notEqual(
    appearancePreferenceFingerprint(BASE),
    appearancePreferenceFingerprint({
      ...BASE,
      tileViewPreferences: { forum: "extreme" },
    }),
  );
  assert.notEqual(
    appearancePreferenceFingerprint(BASE),
    appearancePreferenceFingerprint({
      ...BASE,
      timeClockMode: "12h",
    }),
  );
});

import { readFileSync } from "node:fs";

test("appearance save guard suppresses only true duplicates", () => {
  assert.equal(appearancePreferenceNeedsSave("same", null, "same"), false);
  assert.equal(
    appearancePreferenceNeedsSave("old", "pending", "pending"),
    false,
  );
  assert.equal(appearancePreferenceNeedsSave("old", null, "new"), true);
  assert.equal(
    appearancePreferenceNeedsSave(
      "persisted",
      "different-pending",
      "persisted",
    ),
    true,
  );
});

test("appearance provider suppresses persisted and in-flight echo writes", () => {
  const source = readFileSync(
    new URL("../components/lobby/LobbyAppearanceContext.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /persistedAppearanceFingerprintRef/);
  assert.match(source, /pendingAppearanceFingerprintRef/);
  assert.match(
    source,
    /appearancePreferenceNeedsSave\([\s\S]*?persistedAppearanceFingerprintRef\.current[\s\S]*?pendingAppearanceFingerprintRef\.current[\s\S]*?nextFingerprint[\s\S]*?return;/,
  );
  assert.match(
    source,
    /persistedAppearanceFingerprintRef\.current\s*=\s*appearancePreferenceFingerprint\(preference\)/,
  );
  assert.match(
    source,
    /saveUserAppearancePreference\(nextPreference\)[\s\S]*?appearancePreferenceFingerprint\(saved\)/,
  );
});

test("appearance API skips unchanged upsert and activity work", () => {
  const source = readFileSync(
    new URL("../app/api/user/appearance/route.ts", import.meta.url),
    "utf8",
  );
  const noOpIndex = source.indexOf("appearancePreferenceFingerprint(current)");
  const upsertIndex = source.indexOf("upsertAppearancePreference(");
  const activityIndex = source.indexOf("recordUserActivity(");

  assert.ok(noOpIndex >= 0);
  assert.ok(upsertIndex > noOpIndex);
  assert.ok(activityIndex > upsertIndex);
  assert.match(
    source.slice(noOpIndex, upsertIndex),
    /return NextResponse\.json\(current\)/,
  );
});
