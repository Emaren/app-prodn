import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKSHOP_TIME_ZONE,
  formatWorkshopDateTime,
} from "../lib/workshopTime.ts";

test("Workshop SSR-visible timestamps are deterministic across process timezones", () => {
  const original = process.env.TZ;
  try {
    const values = ["UTC", "America/Edmonton", "Asia/Tokyo"].map((tz) => {
      process.env.TZ = tz;
      return formatWorkshopDateTime("2026-09-14T01:30:00Z");
    });
    assert.deepEqual(values, [values[0], values[0], values[0]]);
    assert.equal(values[0], "Sep 13, 7:30 PM");
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("Workshop owns one explicit canonical presentation timezone", () => {
  assert.equal(WORKSHOP_TIME_ZONE, "America/Edmonton");
});
