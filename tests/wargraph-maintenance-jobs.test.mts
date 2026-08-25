import assert from "node:assert/strict";
import test from "node:test";

import {
  parseWarGraphMaintenanceJobPayload,
  warGraphMaintenanceRetryDelayMs,
} from "../lib/wargraph/maintenanceJobsContract.ts";

test("maintenance job payloads are strict, typed, and bounded", () => {
  assert.deepEqual(
    parseWarGraphMaintenanceJobPayload("apply_gravity", {
      schema: "aoe2war-wargraph-gravity-job/v1",
      nightId: 2,
      triggerContestId: 9,
    }),
    { kind: "gravity", nightId: 2, triggerContestId: 9 },
  );
  assert.equal(
    parseWarGraphMaintenanceJobPayload("apply_gravity", {
      schema: "aoe2war-wargraph-gravity-job/v1",
      nightId: 2,
      triggerContestId: 9,
      injected: true,
    }),
    null,
  );
  const fossil = parseWarGraphMaintenanceJobPayload(
    "advance_fossilization",
    {
      schema: "aoe2war-wargraph-fossilization-job/v1",
      nightId: 2,
      nextPrimeOpensAt: "2026-08-25T23:00:00.000Z",
    },
  );
  assert.equal(fossil?.kind, "fossilization");
  assert.equal(
    fossil?.kind === "fossilization"
      ? fossil.nextPrimeOpensAt.toISOString()
      : null,
    "2026-08-25T23:00:00.000Z",
  );
});

test("maintenance retry backoff is deterministic and capped", () => {
  assert.equal(warGraphMaintenanceRetryDelayMs(1), 5_000);
  assert.equal(warGraphMaintenanceRetryDelayMs(4), 40_000);
  assert.equal(warGraphMaintenanceRetryDelayMs(99), 300_000);
});
