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
