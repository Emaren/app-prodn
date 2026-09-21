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

test("Watcher 1.5.13 public release identity is exact", () => {
  assert.match(release, /version: "1\.5\.13"/);
  assert.match(release, /releasedOn: "Sep 20, 2026"/);
  assert.match(release, /Active replay-folder recovery/);
  assert.match(release, /Fresh replay adoption after restart/);
  assert.match(release, /Localized out-of-sync MP save support/);
  assert.match(release, /Replay-priority streaming/);
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

test("Watcher 1.5.13 docs bind public metadata to certified artifacts", () => {
  assert.match(docs, /version: 1\.5\.13/);
  assert.match(docs, /79c4641e77df26e488c252738ff6f44e89772de6/);
  assert.match(docs, /35552739520/);
  assert.match(docs, /35552739589/);

  for (const hash of [
    "73a432687fd3b1989ff4cb5063d9e29589b6471186e277df399b6bb5599a91ec",
    "4583ce46bebd864a32b2db4d0b57792b6e70d31dfd9c56a414644c857e674248",
    "87c9545364bab48ee0e45cb7cb3e145a953a52ea480481ba427f0b55cdd4e140",
    "80eea06fc3beec7c905379d59180a04e2cf36303f9712f07397403700a81c142",
    "823b6a29836dea8caf2953201e68681adbdc4d3855b1b25a5c19bff8d618770e",
  ]) {
    assert.match(docs, new RegExp(hash));
  }

  assert.match(docs, /valid-but-stale/);
  assert.match(docs, /Video is expendable; replay live\/final delivery is not/);
  assert.match(docs, /authenticated Watcher API key/);
  assert.match(docs, /fresh-unknown recovery admission/);
  assert.match(docs, /English and localized out-of-sync MP saves/);
  assert.match(docs, /server-media-shed-v1/);
  assert.match(docs, /STREAM_MEDIA_SHED/);
});
