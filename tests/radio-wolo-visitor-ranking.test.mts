import assert from "node:assert/strict";
import test from "node:test";

import {
  compareAdminRadioWoloVisitors,
  RADIO_WOLO_VISIT_LEADERBOARD_THRESHOLD,
} from "../lib/adminRadioWoloVisitorRanking.ts";

type Row = Parameters<typeof compareAdminRadioWoloVisitors>[0];

function sort(rows: Row[]) {
  return [...rows].sort(compareAdminRadioWoloVisitors);
}

test("live visitors always outrank offline visitor leaders and live ordering is freshest first", () => {
  const rows: Row[] = [
    {
      activeOnSite: false,
      identityKind: "user",
      visitCount: 500,
      lastSeenAt: "2026-10-06T16:00:00Z",
    },
    {
      activeOnSite: true,
      identityKind: "anonymous",
      visitCount: 1,
      lastSeenAt: "2026-10-06T16:02:00Z",
    },
    {
      activeOnSite: true,
      identityKind: "user",
      visitCount: 100,
      lastSeenAt: "2026-10-06T16:01:00Z",
    },
  ];

  const ordered = sort(rows);
  assert.equal(ordered[0]?.activeOnSite, true);
  assert.equal(ordered[0]?.lastSeenAt, "2026-10-06T16:02:00Z");
  assert.equal(ordered[1]?.activeOnSite, true);
  assert.equal(ordered[2]?.visitCount, 500);
});

test("offline members and repeat anonymous visitors form a descending visit leaderboard", () => {
  const rows: Row[] = [
    {
      activeOnSite: false,
      identityKind: "anonymous",
      visitCount: RADIO_WOLO_VISIT_LEADERBOARD_THRESHOLD,
      lastSeenAt: "2026-10-06T15:00:00Z",
    },
    {
      activeOnSite: false,
      identityKind: "user",
      visitCount: 20,
      lastSeenAt: "2026-10-01T15:00:00Z",
    },
    {
      activeOnSite: false,
      identityKind: "anonymous",
      visitCount: 50,
      lastSeenAt: "2026-09-01T15:00:00Z",
    },
  ];

  assert.deepEqual(
    sort(rows).map((row) => row.visitCount),
    [50, 20, RADIO_WOLO_VISIT_LEADERBOARD_THRESHOLD],
  );
});

test("low-frequency anonymous tail falls back to recency", () => {
  const rows: Row[] = [
    {
      activeOnSite: false,
      identityKind: "anonymous",
      visitCount: 4,
      lastSeenAt: "2026-10-05T15:00:00Z",
    },
    {
      activeOnSite: false,
      identityKind: "anonymous",
      visitCount: 1,
      lastSeenAt: "2026-10-06T15:00:00Z",
    },
    {
      activeOnSite: false,
      identityKind: "anonymous",
      visitCount: 3,
      lastSeenAt: "2026-10-04T15:00:00Z",
    },
  ];

  assert.deepEqual(
    sort(rows).map((row) => row.lastSeenAt),
    [
      "2026-10-06T15:00:00Z",
      "2026-10-05T15:00:00Z",
      "2026-10-04T15:00:00Z",
    ],
  );
});
