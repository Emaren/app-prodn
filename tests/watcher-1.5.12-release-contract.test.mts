import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const release = fs.readFileSync(
  "lib/watcherRelease.ts",
  "utf8",
);

const telemetry = fs.readFileSync(
  "lib/watcherTelemetry.ts",
  "utf8",
);

const sync = fs.readFileSync(
  "scripts/sync-watcher-release.mjs",
  "utf8",
);

const docs = fs.readFileSync(
  "docs/WATCHER_TELEMETRY.md",
  "utf8",
);

const reliabilityEvents = [
  "monitor_watchdog_blocked",
  "monitor_watchdog_reattach",
  "monitor_watchdog_folder_unavailable",
  "watch_folder_auto_repair_started",
  "watch_folder_auto_repaired",
  "watch_folder_auto_repair_failed",
];

test("Watcher 1.5.12 public release identity is exact", () => {
  assert.match(release, /version: "1\.5\.12"/);
  assert.match(release, /releasedOn: "Sep 16, 2026"/);
  assert.match(release, /Active replay-folder recovery/);
  assert.match(release, /Replay-priority streaming/);
  assert.doesNotMatch(release, /version: "1\.5\.9"/);
});

test("Watcher release sync preserves reliability and 1.5.11 media shedding", () => {
  assert.match(sync, /Active replay-folder recovery/);
  assert.match(sync, /Replay-priority streaming/);
  assert.match(sync, /Capability-negotiated media shedding/);
  assert.match(sync, /Replay folder self-healing/);
});

test("Watcher reliability telemetry remains admitted server-side", () => {
  for (const event of reliabilityEvents) {
    const quoted = `"${event}"`;
    assert.equal(
      telemetry.split(quoted).length - 1,
      1,
      `${event} must appear exactly once in the telemetry allowlist`,
    );
  }
});

test("Watcher 1.5.12 docs bind public metadata to certified artifacts", () => {
  assert.match(docs, /version: 1\.5\.12/);
  assert.match(docs, /329d0e99924126b0fc13f31ddcc26f81607b35cd/);
  assert.match(docs, /35165618190/);
  assert.match(docs, /35165618193/);

  for (const hash of [
    "611a98f710c42bf3c4486cca68bad6036662943cb0fbc67d0945ec9496509bf0",
    "d2d771b7cdc6abacca4b2ca6128ac16004d51cf151d286d5c87323721ce52d37",
    "68b18066888fc60392921b6dc44d66c0a32f23fc70556d2e4a0c7fed98f14ac3",
    "cdfdfbc9180bb403086d98009cb3516f2b81ba05488742fb4f01ea1e2dc694f4",
    "f53318079f00de092c93a5d3fbf0a747b0dfd520d736dfbddf4fa0629ac58057",
  ]) {
    assert.match(docs, new RegExp(hash));
  }

  assert.match(docs, /valid-but-stale/);
  assert.match(docs, /Video is expendable; replay live\/final delivery is not/);
  assert.match(docs, /authenticated Watcher API key/);
  assert.match(docs, /server-media-shed-v1/);
  assert.match(docs, /STREAM_MEDIA_SHED/);
});
