import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  syncWatcherRelease,
  validateWatcherReleaseBundle,
} from "../scripts/sync-watcher-release.mjs";

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


function sha256(data: Buffer | string) {
  return createHash("sha256").update(data).digest("hex");
}

function fakeCanonicalFiles(version: string) {
  return [
    `AoE2HDBets Watcher Setup ${version}.exe`,
    `AoE2HDBets Watcher ${version}.exe`,
    `AoE2HDBets Watcher-${version}-arm64.dmg`,
    "aoe2hdbets-watcher-direct.zip",
    `AoE2HDBets Watcher-${version}.AppImage`,
    `AoE2HDBets Watcher-${version}-arm64.dmg.blockmap`,
    "latest.yml",
    "latest-mac.yml",
    "latest-linux.yml",
  ];
}

function writeFakeCertifiedBundle(
  dist: string,
  version: string,
  { badChecksum = false }: { badChecksum?: boolean } = {},
) {
  fs.mkdirSync(dist, { recursive: true });

  const contents = new Map<string, Buffer>([
    [`AoE2HDBets Watcher Setup ${version}.exe`, Buffer.from("installer")],
    [`AoE2HDBets Watcher ${version}.exe`, Buffer.from("portable")],
    [`AoE2HDBets Watcher-${version}-arm64.dmg`, Buffer.from("dmg")],
    ["aoe2hdbets-watcher-direct.zip", Buffer.from("direct-zip")],
    [`AoE2HDBets Watcher-${version}.AppImage`, Buffer.from("appimage")],
    [`AoE2HDBets Watcher-${version}-arm64.dmg.blockmap`, Buffer.from("blockmap")],
    [
      "latest.yml",
      Buffer.from(
        `version: ${version}\npath: AoE2HDBets Watcher Setup ${version}.exe\n`,
      ),
    ],
    [
      "latest-mac.yml",
      Buffer.from(
        `version: ${version}\npath: AoE2HDBets Watcher-${version}-arm64.dmg\n`,
      ),
    ],
    [
      "latest-linux.yml",
      Buffer.from(
        `version: ${version}\npath: AoE2HDBets Watcher-${version}.AppImage\n`,
      ),
    ],
  ]);

  for (const [name, data] of contents) {
    fs.writeFileSync(path.join(dist, name), data);
  }

  const rows = fakeCanonicalFiles(version).map((filename) => {
    const data = contents.get(filename);
    assert.ok(data);
    return {
      filename,
      bytes: data.length,
      sha256: sha256(data),
    };
  });

  const checksumRows = rows.map((row, index) => {
    const digest = badChecksum && index === 0 ? "0".repeat(64) : row.sha256;
    return `${digest}  ${row.filename}\n`;
  });

  fs.writeFileSync(
    path.join(dist, `SHA256SUMS-${version}.txt`),
    checksumRows.join(""),
  );
  fs.writeFileSync(
    path.join(dist, `watcher-release-manifest-${version}.json`),
    JSON.stringify(
      {
        schema: 1,
        version,
        files: rows,
      },
      null,
      2,
    ) + "\n",
  );
}

function makeFakeWatcher(root: string, version: string, options = {}) {
  const watcherDir = path.join(root, "aoe2-watcher");
  const dist = path.join(watcherDir, "dist");
  fs.mkdirSync(watcherDir, { recursive: true });
  fs.writeFileSync(
    path.join(watcherDir, "package.json"),
    JSON.stringify({ version }) + "\n",
  );
  writeFakeCertifiedBundle(dist, version, options);
  return { watcherDir, dist };
}

test("Watcher 1.6.0 public release identity is exact", () => {
  assert.match(release, /version: "1\.6\.0"/);
  assert.match(release, /previousVersion: "1\.5\.13"/);
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

test("Watcher release sync transaction commits certified bytes before metadata", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "watcher-sync-ok-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const version = "9.9.9";
  const { watcherDir, dist } = makeFakeWatcher(root, version);
  const downloadsDir = path.join(root, "downloads");
  const releaseModulePath = path.join(root, "watcherRelease.ts");
  fs.mkdirSync(downloadsDir);
  fs.writeFileSync(
    releaseModulePath,
    'export const WATCHER_RELEASE = { version: "1.0.0", releasedOn: "Jan 1, 2026" };\n',
  );
  fs.writeFileSync(path.join(downloadsDir, "latest.yml"), "old-updater\n");
  fs.writeFileSync(
    path.join(downloadsDir, "aoe2hdbets-watcher-direct.zip"),
    "old-direct",
  );

  await validateWatcherReleaseBundle(dist, version);
  await syncWatcherRelease({
    watcherDir,
    releaseModulePath,
    downloadsDir,
    now: new Date("2026-09-21T18:00:00Z"),
  });

  for (const name of fakeCanonicalFiles(version)) {
    assert.deepEqual(
      fs.readFileSync(path.join(downloadsDir, name)),
      fs.readFileSync(path.join(dist, name)),
      name,
    );
  }

  const metadata = fs.readFileSync(releaseModulePath, "utf8");
  assert.match(metadata, /version: "9\.9\.9"/);
  assert.match(metadata, /previousVersion: "1\.0\.0"/);
  assert.match(metadata, /releasedOn: "Sep 21, 2026"/);
  assert.equal(
    fs.readdirSync(downloadsDir).filter((name) => name.startsWith(".watcher-sync-")).length,
    0,
  );
});

test("Watcher release sync rejects bad receipts before any target mutation", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "watcher-sync-bad-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const version = "9.9.9";
  const { watcherDir } = makeFakeWatcher(root, version, { badChecksum: true });
  const downloadsDir = path.join(root, "downloads");
  const releaseModulePath = path.join(root, "watcherRelease.ts");
  fs.mkdirSync(downloadsDir);
  fs.writeFileSync(releaseModulePath, "old-metadata\n");
  fs.writeFileSync(path.join(downloadsDir, "latest.yml"), "old-updater\n");

  await assert.rejects(
    syncWatcherRelease({
      watcherDir,
      releaseModulePath,
      downloadsDir,
    }),
    /checksum and release manifest disagree/,
  );

  assert.equal(fs.readFileSync(releaseModulePath, "utf8"), "old-metadata\n");
  assert.equal(
    fs.readFileSync(path.join(downloadsDir, "latest.yml"), "utf8"),
    "old-updater\n",
  );
  assert.equal(
    fs.existsSync(
      path.join(downloadsDir, `AoE2HDBets Watcher Setup ${version}.exe`),
    ),
    false,
  );
});

test("Watcher release sync rolls vault back if metadata commit fails", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "watcher-sync-rb-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const version = "9.9.9";
  const { watcherDir } = makeFakeWatcher(root, version);
  const downloadsDir = path.join(root, "downloads");
  const releaseModulePath = path.join(
    root,
    "missing-metadata-parent",
    "watcherRelease.ts",
  );
  fs.mkdirSync(downloadsDir);
  fs.writeFileSync(path.join(downloadsDir, "latest.yml"), "old-updater\n");
  fs.writeFileSync(
    path.join(downloadsDir, "aoe2hdbets-watcher-direct.zip"),
    "old-direct",
  );

  await assert.rejects(
    syncWatcherRelease({
      watcherDir,
      releaseModulePath,
      downloadsDir,
    }),
    /ENOENT/,
  );

  assert.equal(
    fs.readFileSync(path.join(downloadsDir, "latest.yml"), "utf8"),
    "old-updater\n",
  );
  assert.equal(
    fs.readFileSync(
      path.join(downloadsDir, "aoe2hdbets-watcher-direct.zip"),
      "utf8",
    ),
    "old-direct",
  );
  assert.equal(
    fs.existsSync(
      path.join(downloadsDir, `AoE2HDBets Watcher Setup ${version}.exe`),
    ),
    false,
  );
  assert.equal(
    fs.readdirSync(downloadsDir).filter((name) => name.startsWith(".watcher-sync-")).length,
    0,
  );
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
