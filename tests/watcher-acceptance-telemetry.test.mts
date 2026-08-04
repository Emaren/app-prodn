import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const watcherTelemetrySource = await readFile(
  new URL("../lib/watcherTelemetry.ts", import.meta.url),
  "utf8"
);

test("watcher acceptance telemetry keeps archive, parse, result, and review milestones distinct", () => {
  for (const eventType of [
    "upload_succeeded",
    "replay_archived",
    "parse_succeeded",
    "result_ready",
    "result_review_routed",
    "final_settle_observation_started",
    "final_settle_observation_complete",
  ]) {
    assert.match(
      watcherTelemetrySource,
      new RegExp(`\\"${eventType}\\"`),
      `${eventType} must remain in the watcher telemetry allowlist`
    );
  }
});
