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

test("Watcher 1.6.0 public release identity is exact", () => {
  assert.match(release, /version: "1\.6\.0"/);
  assert.match(release, /releasedOn: "Sep 21, 2026"/);
  assert.match(release, /Active replay-folder recovery/);
  assert.match(release, /Fresh replay adoption after restart/);
  assert.match(release, /Localized out-of-sync MP save support/);
  assert.match(release, /Replay-priority streaming/);
  assert.match(release, /Low-footprint tray background mode/);
  assert.match(release, /Dashboard-free replay monitoring/);
  assert.match(release, /Safe self-update handoff/);
  assert.match(release, /Sandboxed dashboard renderer/);
  assert.doesNotMatch(release, /version: "1\.5\.13"/);
  assert.doesNotMatch(release, /version: "1\.5\.9"/);
});

test("Watcher release sync preserves reliability and 1.5.11 media shedding", () => {
  assert.match(sync, /Active replay-folder recovery/);
  assert.match(sync, /Fresh replay adoption after restart/);
  assert.match(sync, /Localized out-of-sync MP save support/);
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

test("Watcher 1.6.0 docs bind public metadata to certified artifacts", () => {
  assert.match(docs, /version: 1\.6\.0/);
  assert.match(docs, /ee9229009f3b36dc082a1c3aa31305b5fd76a5b7/);
  assert.match(docs, /52d0a42ee68bb6f1f71db16a6298f32810baeeec/);
  assert.match(docs, /35634269184/);
  assert.match(docs, /35634269169/);

  for (const hash of [
    "b6fa8b3ed934bb98dfbb5008148fb739575ca138b3dfc74084dd4a2b7d650f89",
    "d656b66de13cc594e28c2dc88651dc8df5eefd1b35d0fa5b6792c7dfd1ef173d",
    "e128424ca6cecc5ebcf82c57d643e0774380b786780fd8b141190562a50380e3",
    "44845f98996614bac4c3c8a340b037983edc2de9975e47181db2689a4f8712e0",
    "5b35a62b09bab23117e744386c463e2579a3e34d7319094163aaae83d62b1266",
    "d06e9206b9db50401f7da23624d39ea9bfaf35c097db1cb324075586f2fe5c0a",
  ]) {
    assert.match(docs, new RegExp(hash));
  }

  assert.match(docs, /valid-but-stale/);
  assert.match(docs, /Video is expendable; replay live\/final delivery is not/);
  assert.match(docs, /authenticated Watcher API key/);
  assert.match(docs, /fresh-unknown recovery admission/);
  assert.match(docs, /English and localized out-of-sync MP saves/);
  assert.match(docs, /server-media-shed-v1/);
  assert.match(docs, /tray-only background mode/);
  assert.match(docs, /idle monitor no longer blocks/);
  assert.match(docs, /403 Resource not accessible by integration/);
  assert.match(docs, /STREAM_MEDIA_SHED/);
});
