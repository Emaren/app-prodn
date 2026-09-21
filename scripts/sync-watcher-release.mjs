#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FEATURE_CHIPS = [
  "Windows installer",
  "Windows portable fallback",
  "macOS DMG + ZIP",
  "Linux AppImage",
  "Historical replay import",
  "Watcher-native streaming",
  "Full-screen capture mode",
  "1s live chunks",
  "Upload backpressure",
  "Immutable replay upload snapshots",
  "Logical upload queue telemetry",
  "Rolling playback",
  "Faster final detection",
  "Connected vs monitoring truth",
  "OneDrive HD folder detection",
  "Steam HD multiplayer folder detection",
  "Custom Steam library detection",
  "Replay folder self-healing",
  "Active replay-folder recovery",
  "Fresh replay adoption after restart",
  "Localized out-of-sync MP save support",
  "Replay-priority streaming",
  "Capability-negotiated media shedding",
  "Mid-game replay recovery",
  "Bounded monitor watchdog",
  "Privacy-safe rich heartbeat",
  "Low-footprint tray background mode",
  "Dashboard-free replay monitoring",
  "Safe self-update handoff",
  "Sandboxed dashboard renderer",
];

const WATCHER_RELEASE_TEMPLATE = ({ version, releasedOn }) => `export type WatcherArtifactPlatform = "windows" | "macos" | "linux";

export type WatcherArtifactKey =
  | "windows-installer"
  | "windows-portable"
  | "mac-dmg"
  | "mac-zip"
  | "linux-appimage";

export type WatcherDownloadArtifact = {
  key: WatcherArtifactKey;
  platform: WatcherArtifactPlatform;
  title: string;
  shortLabel: string;
  badge: string;
  filename: string;
  format: string;
  description: string;
  downloadPath: string;
  trackedHref: string;
  primary: boolean;
  featuredOnDownloadPage: boolean;
};

export const WATCHER_RELEASE = {
  version: ${JSON.stringify(version)},
  label: ${JSON.stringify(`AoE2HDBets Watcher ${version}`)},
  releasedOn: ${JSON.stringify(releasedOn)},
  signingStatus: "Signed and timestamped Windows builds; unsigned macOS build; Linux AppImage available",
  featureChips: ${JSON.stringify(
    [`AoE2HDBets Watcher ${version}`, releasedOn, ...FEATURE_CHIPS],
    null,
    2
  ).replace(/\n/g, "\n  ")},
} as const;

export const WATCHER_DOWNLOAD_ARTIFACTS: readonly WatcherDownloadArtifact[] = [
  {
    key: "windows-installer",
    platform: "windows",
    title: "Windows Installer",
    shortLabel: "NSIS installer",
    badge: "Recommended",
    filename: ${JSON.stringify(`AoE2HDBets Watcher Setup ${version}.exe`)},
    format: "NSIS",
    description:
      "Smoothest Windows path. Installs cleanly, creates shortcuts, and keeps the first run obvious.",
    downloadPath: ${JSON.stringify(`/downloads/${encodeURIComponent(`AoE2HDBets Watcher Setup ${version}.exe`)}`)},
    trackedHref: "/download/watcher/windows-installer",
    primary: true,
    featuredOnDownloadPage: true,
  },
  {
    key: "windows-portable",
    platform: "windows",
    title: "Windows Portable",
    shortLabel: "Backup EXE",
    badge: "Fallback",
    filename: ${JSON.stringify(`AoE2HDBets Watcher ${version}.exe`)},
    format: "portable",
    description:
      "Same signed Windows watcher core in a no-installer package if installer policy gets in the way.",
    downloadPath: ${JSON.stringify(`/downloads/${encodeURIComponent(`AoE2HDBets Watcher ${version}.exe`)}`)},
    trackedHref: "/download/watcher/windows-portable",
    primary: false,
    featuredOnDownloadPage: true,
  },
  {
    key: "mac-dmg",
    platform: "macos",
    title: "macOS DMG",
    shortLabel: "Apple Silicon",
    badge: "Mac first",
    filename: ${JSON.stringify(`AoE2HDBets Watcher-${version}-arm64.dmg`)},
    format: "DMG",
    description:
      "Best Mac install path. Drag in, pair once, and keep it open while AoE2HD runs under macOS or CrossOver.",
    downloadPath: ${JSON.stringify(`/downloads/${encodeURIComponent(`AoE2HDBets Watcher-${version}-arm64.dmg`)}`)},
    trackedHref: "/download/watcher/mac-dmg",
    primary: false,
    featuredOnDownloadPage: true,
  },
  {
    key: "mac-zip",
    platform: "macos",
    title: "macOS Direct ZIP",
    shortLabel: "Manual fallback",
    badge: "Fallback",
    filename: "aoe2hdbets-watcher-direct.zip",
    format: "ZIP",
    description:
      "Same Mac app bundle, packaged as a direct ZIP for users who hit DMG or Gatekeeper friction.",
    downloadPath: "/downloads/aoe2hdbets-watcher-direct.zip",
    trackedHref: "/download/watcher/mac-zip",
    primary: false,
    featuredOnDownloadPage: true,
  },
  {
    key: "linux-appimage",
    platform: "linux",
    title: "Linux AppImage",
    shortLabel: "Linux build",
    badge: "Linux",
    filename: ${JSON.stringify(`AoE2HDBets Watcher-${version}.AppImage`)},
    format: "AppImage",
    description:
      "Portable Linux watcher for Proton or Wine-heavy setups where manual replay-folder selection matters most.",
    downloadPath: ${JSON.stringify(`/downloads/${encodeURIComponent(`AoE2HDBets Watcher-${version}.AppImage`)}`)},
    trackedHref: "/download/watcher/linux-appimage",
    primary: false,
    featuredOnDownloadPage: true,
  },
] as const;

export function getWatcherDownloadArtifact(
  key: string | null | undefined
): WatcherDownloadArtifact | null {
  if (!key) {
    return null;
  }

  return WATCHER_DOWNLOAD_ARTIFACTS.find((artifact) => artifact.key === key) ?? null;
}

export function getWatcherArtifactsForPlatform(platform: WatcherArtifactPlatform) {
  return WATCHER_DOWNLOAD_ARTIFACTS.filter((artifact) => artifact.platform === platform);
}
`;

function readExistingReleaseMetadata(content) {
  const versionMatch = content.match(/version:\s*"([^"]+)"/);
  const releasedOnMatch = content.match(/releasedOn:\s*"([^"]+)"/);

  return {
    version: versionMatch?.[1] ?? null,
    releasedOn: releasedOnMatch?.[1] ?? null,
  };
}

function canonicalReleaseFiles(version) {
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

function receiptFiles(version) {
  return [
    `SHA256SUMS-${version}.txt`,
    `watcher-release-manifest-${version}.json`,
  ];
}

function updaterRules(version) {
  return new Map([
    ["latest.yml", `AoE2HDBets Watcher Setup ${version}.exe`],
    ["latest-mac.yml", `AoE2HDBets Watcher-${version}-arm64.dmg`],
    ["latest-linux.yml", `AoE2HDBets Watcher-${version}.AppImage`],
  ]);
}

async function regularFile(filePath, label = filePath) {
  const stat = await fs.lstat(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Watcher release path is not a regular file: ${label}`);
  }
  return stat;
}

async function sha256File(filePath) {
  return createHash("sha256")
    .update(await fs.readFile(filePath))
    .digest("hex");
}

export async function validateWatcherReleaseBundle(root, version) {
  const canonical = canonicalReleaseFiles(version);
  const receipts = receiptFiles(version);

  for (const name of [...canonical, ...receipts]) {
    await regularFile(path.join(root, name), name);
  }

  const manifestPath = path.join(root, receipts[1]);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (!Number.isInteger(manifest.schema) || manifest.schema < 1) {
    throw new Error("Watcher release manifest schema is invalid");
  }
  if (manifest.version !== version) {
    throw new Error(
      `Watcher release manifest version mismatch: ${manifest.version} !== ${version}`,
    );
  }
  if (!Array.isArray(manifest.files)) {
    throw new Error("Watcher release manifest files are missing");
  }

  const manifestNames = manifest.files.map((row) => row?.filename);
  if (JSON.stringify(manifestNames) !== JSON.stringify(canonical)) {
    throw new Error("Watcher release manifest inventory mismatch");
  }

  const manifestHashes = new Map();
  for (const row of manifest.files) {
    const filePath = path.join(root, row.filename);
    const stat = await regularFile(filePath, row.filename);
    const digest = await sha256File(filePath);

    if (row.bytes !== stat.size) {
      throw new Error(
        `Watcher release manifest byte-size mismatch: ${row.filename}`,
      );
    }
    if (row.sha256 !== digest) {
      throw new Error(
        `Watcher release manifest SHA-256 mismatch: ${row.filename}`,
      );
    }
    manifestHashes.set(row.filename, row.sha256);
  }

  const checksumText = await fs.readFile(path.join(root, receipts[0]), "utf8");
  const checksumEntries = new Map();
  for (const line of checksumText.split(/?
/)) {
    if (!line) {
      continue;
    }
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!match) {
      throw new Error("Watcher checksum receipt contains an invalid row");
    }
    const [, digest, name] = match;
    if (checksumEntries.has(name)) {
      throw new Error(
        `Watcher checksum receipt contains duplicate file: ${name}`,
      );
    }
    checksumEntries.set(name, digest);
  }

  if (
    checksumEntries.size !== canonical.length ||
    canonical.some((name) => !checksumEntries.has(name))
  ) {
    throw new Error("Watcher checksum receipt inventory mismatch");
  }

  for (const name of canonical) {
    if (checksumEntries.get(name) !== manifestHashes.get(name)) {
      throw new Error(
        `Watcher checksum and release manifest disagree: ${name}`,
      );
    }
  }

  for (const [manifestName, expectedPath] of updaterRules(version)) {
    const lines = (
      await fs.readFile(path.join(root, manifestName), "utf8")
    ).split(/?
/);
    if (!lines.includes(`version: ${version}`)) {
      throw new Error(
        `Watcher updater version mismatch: ${manifestName}`,
      );
    }
    if (!lines.includes(`path: ${expectedPath}`)) {
      throw new Error(
        `Watcher updater path mismatch: ${manifestName}`,
      );
    }
  }

  return {
    version,
    canonical,
    receipts,
    manifest,
  };
}

function artifactCopyPlan(version, watcherDistDir, targetRoot) {
  const payloads = [
    {
      source: path.join(
        watcherDistDir,
        `AoE2HDBets Watcher-${version}-arm64.dmg`,
      ),
      target: path.join(
        targetRoot,
        `AoE2HDBets Watcher-${version}-arm64.dmg`,
      ),
    },
    {
      source: path.join(
        watcherDistDir,
        `AoE2HDBets Watcher-${version}-arm64.dmg`,
      ),
      target: path.join(
        targetRoot,
        `AoE2HDBets-Watcher-${version}-arm64.dmg`,
      ),
    },
    {
      source: path.join(
        watcherDistDir,
        `AoE2HDBets Watcher-${version}-arm64.dmg.blockmap`,
      ),
      target: path.join(
        targetRoot,
        `AoE2HDBets Watcher-${version}-arm64.dmg.blockmap`,
      ),
    },
    {
      source: path.join(
        watcherDistDir,
        `AoE2HDBets Watcher-${version}-arm64-mac.zip`,
      ),
      target: path.join(
        targetRoot,
        `AoE2HDBets Watcher-${version}-arm64-mac.zip`,
      ),
      optional: true,
    },
    {
      source: path.join(
        watcherDistDir,
        `AoE2HDBets Watcher-${version}-arm64-mac.zip.blockmap`,
      ),
      target: path.join(
        targetRoot,
        `AoE2HDBets Watcher-${version}-arm64-mac.zip.blockmap`,
      ),
      optional: true,
    },
    {
      source: path.join(watcherDistDir, "aoe2hdbets-watcher-direct.zip"),
      target: path.join(targetRoot, "aoe2hdbets-watcher-direct.zip"),
    },
    {
      source: path.join(
        watcherDistDir,
        `AoE2HDBets Watcher Setup ${version}.exe`,
      ),
      target: path.join(
        targetRoot,
        `AoE2HDBets Watcher Setup ${version}.exe`,
      ),
    },
    {
      source: path.join(
        watcherDistDir,
        `AoE2HDBets Watcher Setup ${version}.exe`,
      ),
      target: path.join(
        targetRoot,
        `AoE2HDBets-Watcher-Setup-${version}.exe`,
      ),
    },
    {
      source: path.join(
        watcherDistDir,
        `AoE2HDBets Watcher Setup ${version}.exe.blockmap`,
      ),
      target: path.join(
        targetRoot,
        `AoE2HDBets Watcher Setup ${version}.exe.blockmap`,
      ),
      optional: true,
    },
    {
      source: path.join(
        watcherDistDir,
        `AoE2HDBets Watcher ${version}.exe`,
      ),
      target: path.join(
        targetRoot,
        `AoE2HDBets Watcher ${version}.exe`,
      ),
    },
    {
      source: path.join(
        watcherDistDir,
        `AoE2HDBets Watcher-${version}.AppImage`,
      ),
      target: path.join(
        targetRoot,
        `AoE2HDBets Watcher-${version}.AppImage`,
      ),
    },
    {
      source: path.join(
        watcherDistDir,
        `AoE2HDBets Watcher-${version}.AppImage`,
      ),
      target: path.join(
        targetRoot,
        `AoE2HDBets-Watcher-${version}.AppImage`,
      ),
    },
    {
      source: path.join(watcherDistDir, `SHA256SUMS-${version}.txt`),
      target: path.join(targetRoot, `SHA256SUMS-${version}.txt`),
    },
    {
      source: path.join(
        watcherDistDir,
        `watcher-release-manifest-${version}.json`,
      ),
      target: path.join(
        targetRoot,
        `watcher-release-manifest-${version}.json`,
      ),
    },
  ];

  const updaters = ["latest.yml", "latest-mac.yml", "latest-linux.yml"].map(
    (name) => ({
      source: path.join(watcherDistDir, name),
      target: path.join(targetRoot, name),
    }),
  );

  return { payloads, updaters };
}

async function stageCopyPlan(entries, stageDir) {
  const staged = [];

  for (const entry of entries) {
    let sourceStat;
    try {
      sourceStat = await regularFile(entry.source);
    } catch (error) {
      if (entry.optional && error?.code === "ENOENT") {
        process.stdout.write(
          `Skipped optional watcher artifact: ${entry.source}\n`,
        );
        continue;
      }
      throw error;
    }

    if (!sourceStat.isFile()) {
      throw new Error(`Watcher source is not a file: ${entry.source}`);
    }

    const stagedPath = path.join(stageDir, path.basename(entry.target));
    await fs.copyFile(entry.source, stagedPath);
    await regularFile(stagedPath);

    staged.push({
      ...entry,
      stagedPath,
    });
  }

  return staged;
}

async function proveTargetsSafe(entries) {
  for (const entry of entries) {
    try {
      await regularFile(entry.target);
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
}

async function rollbackPromotion(journal) {
  const failures = [];

  for (const item of [...journal].reverse()) {
    try {
      await fs.rm(item.target, { force: true });
      if (item.hadExisting) {
        await fs.rename(item.backupPath, item.target);
      }
    } catch (error) {
      failures.push(
        `${item.target}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failures.length) {
    throw new Error(
      `Watcher release rollback failed: ${failures.join("; ")}`,
    );
  }
}

async function promoteStagedFiles(entries, backupDir) {
  const journal = [];

  try {
    for (const entry of entries) {
      const backupPath = path.join(backupDir, path.basename(entry.target));
      let hadExisting = false;

      try {
        await regularFile(entry.target);
        await fs.rename(entry.target, backupPath);
        hadExisting = true;
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      }

      const item = {
        target: entry.target,
        backupPath,
        hadExisting,
      };
      journal.push(item);

      try {
        await fs.rename(entry.stagedPath, entry.target);
      } catch (error) {
        journal.pop();
        if (hadExisting) {
          await fs.rename(backupPath, entry.target);
        }
        throw error;
      }
    }
  } catch (error) {
    await rollbackPromotion(journal);
    throw error;
  }

  return journal;
}

async function atomicWriteText(filePath, content) {
  const temp = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.watcher-sync-${process.pid}-${Date.now()}`,
  );
  try {
    await fs.writeFile(temp, content, "utf8");
    await fs.rename(temp, filePath);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

export async function syncWatcherRelease({
  watcherDir,
  releaseModulePath,
  downloadsDir,
  now = new Date(),
}) {
  const watcherPackagePath = path.join(watcherDir, "package.json");
  const watcherDistDir = path.join(watcherDir, "dist");
  const watcherPackage = JSON.parse(
    await fs.readFile(watcherPackagePath, "utf8"),
  );
  const version = watcherPackage.version;
  if (!/^d+.d+.d+$/.test(version)) {
    throw new Error(`Watcher package version is invalid: ${version}`);
  }

  // Prove the complete certified source bundle before mutating metadata or
  // destination bytes.
  await validateWatcherReleaseBundle(watcherDistDir, version);

  let releasedOn = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Edmonton",
  }).format(now);

  try {
    const currentReleaseModule = await fs.readFile(releaseModulePath, "utf8");
    const existing = readExistingReleaseMetadata(currentReleaseModule);
    if (existing.version === version && existing.releasedOn) {
      releasedOn = existing.releasedOn;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const releaseModuleContent = WATCHER_RELEASE_TEMPLATE({
    version,
    releasedOn,
  });

  await fs.mkdir(downloadsDir, { recursive: true });
  const targetRoot = await fs.realpath(downloadsDir);
  const stageDir = await fs.mkdtemp(
    path.join(targetRoot, `.watcher-sync-stage-${version}-`),
  );
  const backupDir = await fs.mkdtemp(
    path.join(targetRoot, `.watcher-sync-backup-${version}-`),
  );

  let journal = [];
  let committed = false;

  try {
    const plan = artifactCopyPlan(version, watcherDistDir, targetRoot);
    const payloads = await stageCopyPlan(plan.payloads, stageDir);
    const updaters = await stageCopyPlan(plan.updaters, stageDir);

    // Re-prove the exact canonical bundle from staged bytes, not the source
    // paths, before any live target is renamed.
    await validateWatcherReleaseBundle(stageDir, version);

    const promotion = [...payloads, ...updaters];
    await proveTargetsSafe(promotion);

    // Payloads and receipts are installed before updater pointers. Metadata is
    // written only after the complete vault transaction succeeds.
    journal = await promoteStagedFiles(promotion, backupDir);

    try {
      await atomicWriteText(releaseModulePath, releaseModuleContent);
    } catch (error) {
      await rollbackPromotion(journal);
      journal = [];
      throw error;
    }

    committed = true;
  } finally {
    if (!committed && journal.length) {
      await rollbackPromotion(journal);
    }
    await fs.rm(stageDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
  }

  process.stdout.write(
    `Synced watcher release AoE2HDBets Watcher ${version} into ${downloadsDir}\n`,
  );

  return {
    version,
    releasedOn,
    downloadsDir: targetRoot,
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(scriptDir, "..");
  const repoDir = path.resolve(appDir, "..");

  await syncWatcherRelease({
    watcherDir: path.join(repoDir, "aoe2-watcher"),
    releaseModulePath: path.join(appDir, "lib", "watcherRelease.ts"),
    downloadsDir: path.join(appDir, "public", "downloads"),
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
