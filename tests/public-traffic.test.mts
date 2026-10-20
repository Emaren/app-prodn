import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizePublicTrafficPayload,
} from "../lib/publicTraffic.ts";

test("public Traffic normalization excludes the partial current UTC day", () => {
  const result = normalizePublicTrafficPayload(
    {
      coverage_started_at: "2026-09-09T00:00:00Z",
      coverage_ended_at: "2026-09-11T12:00:00Z",
      archive_calculated_at: "2026-09-11T12:00:00Z",
      points: [
        {
          date: "2026-09-10",
          values: {
            totalTraffic: 100,
            suspectedHuman: 70,
            confirmedHuman: 40,
          },
        },
        {
          date: "2026-09-11",
          values: {
            totalTraffic: 9,
            suspectedHuman: 7,
            confirmedHuman: 4,
          },
        },
      ],
    },
    "2026-09-11",
  );

  assert.deepEqual(
    result.points.map((point) => point.date),
    ["2026-09-10"],
  );
});

test("public Traffic normalization fails closed on impossible audience hierarchy", () => {
  assert.throws(
    () =>
      normalizePublicTrafficPayload(
        {
          points: [
            {
              date: "2026-09-10",
              calculatedAt: "2026-09-11T06:15:00Z",
              values: {
                totalTraffic: 5,
                suspectedHuman: 7,
                confirmedHuman: 4,
              },
            },
          ],
        },
        "2026-09-11",
      ),
    /Canonical Traffic hierarchy failed/,
  );
});


test("Traffic page preloads canonical data on the server without a client fetch waterfall", () => {
  const page = readFileSync("app/traffic/page.tsx", "utf8");
  const route = readFileSync("app/api/traffic/public/route.ts", "utf8");

  assert.doesNotMatch(page, /^"use client"/m);
  assert.doesNotMatch(page, /useEffect|fetch\("\/api\/traffic\/public/);
  assert.match(page, /await loadPublicTraffic\(\)/);
  assert.match(route, /await loadPublicTraffic\(\)/);
});

test("a 06:15 archive cannot publish today's partial result after UTC midnight", () => {
  const result = normalizePublicTrafficPayload({
    archive_calculated_at: "2026-10-19T06:15:00Z",
    points: [
      { date: "2026-10-18", values: { totalTraffic: 700, suspectedHuman: 65, confirmedHuman: 27 } },
      { date: "2026-10-19", values: { totalTraffic: 21, suspectedHuman: 2, confirmedHuman: 1 } },
    ],
  }, "2026-10-20");
  assert.deepEqual(result.points.map(p => p.date), ["2026-10-18"]);
});

test("completed previous day appears when next-day calculation proves midnight", () => {
  const result = normalizePublicTrafficPayload({
    archive_calculated_at: "2026-10-20T06:15:00Z",
    points: [{ date: "2026-10-19", values: { totalTraffic: 800, suspectedHuman: 90, confirmedHuman: 50 } }],
  }, "2026-10-20");
  assert.equal(result.points[0].values.totalTraffic, 800);
});

test("legacy backend without timestamps omits the risky previous day", () => {
  const result = normalizePublicTrafficPayload({
    points: [
      { date: "2026-10-18", values: { totalTraffic: 100, suspectedHuman: 40, confirmedHuman: 12 } },
      { date: "2026-10-19", values: { totalTraffic: 1, suspectedHuman: 0, confirmedHuman: 0 } },
    ],
  }, "2026-10-20");
  assert.deepEqual(result.points.map(p => p.date), ["2026-10-18"]);
});

test("missing counts must never be interpreted as observed zero", () => {
  assert.throws(() => normalizePublicTrafficPayload({
    archive_calculated_at: "2026-10-20T06:15:00Z",
    points: [{ date: "2026-10-19", values: { totalTraffic: 100, confirmedHuman: 10 } }],
  }, "2026-10-20"), /Invalid canonical Traffic potential/);
});

test("invalid calendar dates and future dates cannot appear on chart", () => {
  const result = normalizePublicTrafficPayload({
    archive_calculated_at: "2026-10-20T06:15:00Z",
    points: [
      { date: "2026-10-40", values: { totalTraffic: 1, suspectedHuman: 1, confirmedHuman: 1 } },
      { date: "2026-10-21", values: { totalTraffic: 1, suspectedHuman: 1, confirmedHuman: 1 } },
    ],
  }, "2026-10-20");
  assert.equal(result.points.length, 0);
});
