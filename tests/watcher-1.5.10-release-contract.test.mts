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

test("Watcher 1.5.10 public release identity is exact", () => {
  assert.match(release, /version: "1\.5\.10"/);
  assert.match(release, /releasedOn: "Sep 6, 2026"/);
  assert.match(release, /Active replay-folder recovery/);
  assert.match(release, /Replay-priority streaming/);
  assert.doesNotMatch(release, /version: "1\.5\.9"/);
});

test("Watcher release sync preserves 1.5.10 reliability features", () => {
  assert.match(sync, /Active replay-folder recovery/);
  assert.match(sync, /Replay-priority streaming/);
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

test("Watcher 1.5.10 docs bind public metadata to certified artifacts", () => {
  assert.match(docs, /version: 1\.5\.10/);
  assert.match(docs, /f499e5a64e48a048fe3506ab52a9681c8f3b5966/);
  assert.match(docs, /34082963205/);
  assert.match(docs, /34083586837/);

  for (const hash of [
    "294b5b39f8347cf17c72ab992be79d55e0494f33c7432a9452d7e0b54154ab63",
    "a389d4cedd11a354ab87f46175194b7030ccf45717c4d8907ddaa5eb6d637b81",
    "93c580bd42727cb68c94e9c2959403703a874099f6b382214c058edef5d7fc14",
    "d4cc8dd10a3be7bae4c1027b4580d1d8595b6404252fcdafec3dc11ebba70a02",
    "f2511e68f383642b7478b08abc588201dbe30c1ba1640650b34d5ff1d7449421",
  ]) {
    assert.match(docs, new RegExp(hash));
  }

  assert.match(docs, /valid-but-stale/);
  assert.match(docs, /Video is expendable; replay live\/final delivery is not/);
  assert.match(docs, /authenticated Watcher API key/);
});
