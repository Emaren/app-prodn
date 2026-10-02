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

test("Watcher 1.6.2 public release identity is exact", () => {
  assert.match(release, /version: "1\.6\.2"/);
  assert.match(release, /previousVersion: "1\.6\.1"/);
  assert.match(release, /releasedOn: "Sep 29, 2026"/);
  assert.match(release, /Active replay-folder recovery/);
  assert.match(release, /Fresh replay adoption after restart/);
  assert.match(release, /Localized out-of-sync MP save support/);
  assert.match(release, /Replay-priority streaming/);
  assert.match(release, /Low-footprint tray background mode/);
  assert.match(release, /Dashboard-free replay monitoring/);
  assert.match(release, /Safe self-update handoff/);
  assert.match(release, /Disk-backed historical replay imports/);
  assert.match(release, /Bounded historical parser retries/);
  assert.match(release, /Windows-safe replay snapshot cleanup/);
  assert.match(release, /Sandboxed dashboard renderer/);
  assert.match(release, /Adaptive Watcher resource profiling/);
  assert.match(release, /Heartbeat-scoped resource telemetry/);
  assert.match(release, /Renderer bootstrap health telemetry/);
  assert.match(release, /One-shot dashboard self-recovery/);
  assert.match(release, /Buffered runtime diagnostics/);
  assert.match(release, /Bounded historical Watcher state/);
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

test("Watcher release sync preserves reliability, media shedding, and 1.6.2 support truth", () => {
  for (const feature of [
    "Adaptive Watcher resource profiling",
    "Heartbeat-scoped resource telemetry",
    "Renderer bootstrap health telemetry",
    "One-shot dashboard self-recovery",
    "Buffered runtime diagnostics",
    "Bounded historical Watcher state",
  ]) {
    assert.match(sync, new RegExp(feature));
  }

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

test("Watcher 1.6.2 docs bind public metadata to certified artifacts", () => {
  assert.match(docs, /version: 1\.6\.2/);
  assert.match(docs, /1d1e9b3ca9f95a89cf47ab582219e4c85b725603/);
  assert.match(docs, /b1e3b1353aa48840bdaa7d8afc353e1afc5bf22d/);
  assert.match(docs, /36649412730/);
  assert.match(docs, /36649412594/);

  for (const hash of [
    "80c04168949c791cfdc0c67432c2ac4868459219923d8b7c96efc40f24d8d0c3",
    "4b7d0709dae6e9a80ea400bbb88a87a3880b0d5bf99dac11bcdb5e8b6ff129f7",
    "89860bc8d3a95283cb49d9d86f8a8b8b07e0423b3c7f53ddd5ddd003b1c8df95",
    "d2bfb053cf78418fa90d1dca20d223f8488c3baa82071d5db515dbbaceb38a78",
    "a73367344321e0e9399192dd47e588adab68770aa1632636ab4f3f3e1743237a",
    "c14e65579e54b2417766c5ab816798fb2f87221798b3fee5fd4c788fa3beaf63",
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
