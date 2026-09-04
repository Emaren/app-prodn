import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const release =
  fs.readFileSync(
    "lib/watcherRelease.ts",
    "utf8",
  );

const telemetry =
  fs.readFileSync(
    "lib/watcherTelemetry.ts",
    "utf8",
  );

const sync =
  fs.readFileSync(
    "scripts/sync-watcher-release.mjs",
    "utf8",
  );

const docs =
  fs.readFileSync(
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

test(
  "Watcher 1.5.9 public release identity is exact",
  () => {
    assert.match(
      release,
      /version: "1\.5\.9"/,
    );

    assert.match(
      release,
      /releasedOn: "Sep 3, 2026"/,
    );

    assert.match(
      release,
      /Steam HD multiplayer folder detection/,
    );

    assert.match(
      release,
      /Custom Steam library detection/,
    );

    assert.match(
      release,
      /Replay folder self-healing/,
    );

    assert.doesNotMatch(
      release,
      /version: "1\.5\.8"/,
    );
  },
);

test(
  "Watcher reliability telemetry is admitted server-side",
  () => {
    for (
      const event of reliabilityEvents
    ) {
      const quoted =
        `"${event}"`;

      assert.equal(
        telemetry
          .split(quoted)
          .length - 1,
        1,
        `${event} must appear exactly once in the telemetry allowlist`,
      );
    }
  },
);

test(
  "Watcher release sync preserves the current discovery features",
  () => {
    assert.match(
      sync,
      /Steam HD multiplayer folder detection/,
    );

    assert.match(
      sync,
      /Custom Steam library detection/,
    );

    assert.match(
      sync,
      /Replay folder self-healing/,
    );
  },
);

test(
  "Watcher telemetry docs bind 1.5.9 to certified release evidence",
  () => {
    assert.match(
      docs,
      /Current manifests report `version: 1\.5\.9`/,
    );

    assert.match(
      docs,
      /3546b86d3cdc1203baa563ae74f9d5a5e82557d7/,
    );

    assert.match(
      docs,
      /33818322254/,
    );

    assert.match(
      docs,
      /Retry-After/,
    );

    assert.match(
      docs,
      /bounded retry jitter/,
    );

    assert.match(
      docs,
      /spawned parser process/,
    );

    for (
      const event of reliabilityEvents
    ) {
      assert.match(
        docs,
        new RegExp(event),
      );
    }

    assert.doesNotMatch(
      docs,
      /Current manifests report `version: 1\.5\.8`/,
    );
  },
);
