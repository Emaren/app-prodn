import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  compareAdminRadioWoloVisitors,
  RADIO_WOLO_VISIT_LEADERBOARD_THRESHOLD,
} from "../lib/adminRadioWoloVisitorRanking.ts";

test("Radio WOLO visitor ranking pins live people above visit leaders", () => {
  const rows = [
    {
      name: "repeat",
      activeOnSite: false,
      identityKind: "anonymous" as const,
      visitCount: 500,
      lastSeenAt: "2026-10-06T17:00:00Z",
    },
    {
      name: "live",
      activeOnSite: true,
      identityKind: "anonymous" as const,
      visitCount: 1,
      lastSeenAt: "2026-10-06T16:00:00Z",
    },
  ].sort(compareAdminRadioWoloVisitors);

  assert.equal(rows[0]?.name, "live");
  assert.equal(rows[1]?.name, "repeat");
});

test("Radio WOLO visitor ranking uses visits until the anonymous low-frequency tail", () => {
  assert.equal(RADIO_WOLO_VISIT_LEADERBOARD_THRESHOLD, 5);

  const rows = [
    {
      name: "anon-recent",
      activeOnSite: false,
      identityKind: "anonymous" as const,
      visitCount: 2,
      lastSeenAt: "2026-10-06T18:00:00Z",
    },
    {
      name: "member",
      activeOnSite: false,
      identityKind: "user" as const,
      visitCount: 3,
      lastSeenAt: "2026-10-01T18:00:00Z",
    },
    {
      name: "anon-top",
      activeOnSite: false,
      identityKind: "anonymous" as const,
      visitCount: 53,
      lastSeenAt: "2026-09-01T18:00:00Z",
    },
    {
      name: "anon-old",
      activeOnSite: false,
      identityKind: "anonymous" as const,
      visitCount: 2,
      lastSeenAt: "2026-10-05T18:00:00Z",
    },
  ].sort(compareAdminRadioWoloVisitors);

  assert.deepEqual(
    rows.map((row) => row.name),
    ["anon-top", "member", "anon-recent", "anon-old"],
  );
});

test("Radio WOLO admin rail keeps one account row, durable sound history, and Traffic drill-down", () => {
  const analytics = readFileSync(
    new URL("../lib/adminRadioWoloAnalytics.ts", import.meta.url),
    "utf8",
  );
  const component = readFileSync(
    new URL("../components/admin/RadioWoloListenerSignals.tsx", import.meta.url),
    "utf8",
  );

  assert.match(analytics, /all_time:\s*true/);
  assert.match(analytics, /include_operators:\s*true/);
  assert.match(analytics, /user:\$\{row\.userUid\}/);
  assert.match(analytics, /trafficRowsById/);
  assert.match(analytics, /compareAdminRadioWoloVisitors/);
  assert.match(analytics, /pathTrail/);

  assert.match(component, /expandedListener/);
  assert.match(component, /Traffic path/);
  assert.match(component, /historicalSound/);
  assert.match(component, /"USED"/);
  assert.match(component, /"heard radio"/);
  assert.match(component, /currentTrailIndex/);
  assert.match(component, /Browser \{browserIndex \+ 1\}/);
  assert.match(component, /new visit/);
  assert.match(component, /shadow-\[0_0_8px_rgba\(110,231,183,0\.8\)\]/);
});
