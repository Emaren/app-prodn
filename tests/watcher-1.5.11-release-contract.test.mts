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

test("Watcher 1.5.11 public release identity is exact", () => {
  assert.match(release, /version: "1\.5\.11"/);
  assert.match(release, /releasedOn: "Sep 14, 2026"/);
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

test("Watcher 1.5.11 docs bind public metadata to certified artifacts", () => {
  assert.match(docs, /version: 1\.5\.11/);
  assert.match(docs, /758804e673f2fd06460cb30919ddb7629c76a555/);
  assert.match(docs, /34847268397/);
  assert.match(docs, /34847268637/);

  for (const hash of [
    "be936b480aca200d4cfdc8db1475715ff640e161771be85017828fdfcec2fcf5",
    "25301abbc260ecb746a36f8e6466bdcc75840243a6b91bcf2a81558c8f4efda5",
    "300b270298534b7753e2533fd114e445075dc750a309ef430f716e2982c249cb",
    "4d0530304ed4fa8c4b5dca1837f22fd0ed06901269325569f99aead598706985",
    "0e01f821fcfeafa2c7bbff654b1ba22260ac9c47c3878b776c5cd0d9f0d1e715",
  ]) {
    assert.match(docs, new RegExp(hash));
  }

  assert.match(docs, /valid-but-stale/);
  assert.match(docs, /Video is expendable; replay live\/final delivery is not/);
  assert.match(docs, /authenticated Watcher API key/);
  assert.match(docs, /server-media-shed-v1/);
  assert.match(docs, /STREAM_MEDIA_SHED/);
});
