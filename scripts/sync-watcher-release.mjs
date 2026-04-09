#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FEATURE_CHIPS = [
  "Windows installer",
  "Windows portable fallback",
  "macOS DMG + ZIP",
  "Linux AppImage",
  "Historical replay import",
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
  signingStatus: "Unsigned builds for now",
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
      "Same watcher core in a no-installer package if SmartScreen or installer policy gets in the way.",
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

async function ensureFileExists(filePath) {
  await fs.access(filePath);
}

async function copyArtifact(sourcePath, targetPath) {
  await ensureFileExists(sourcePath);
  await fs.copyFile(sourcePath, targetPath);
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(scriptDir, "..");
  const repoDir = path.resolve(appDir, "..");
  const watcherDir = path.join(repoDir, "aoe2-watcher");
  const watcherPackagePath = path.join(watcherDir, "package.json");
  const releaseModulePath = path.join(appDir, "lib", "watcherRelease.ts");
  const downloadsDir = path.join(appDir, "public", "downloads");
  const watcherDistDir = path.join(watcherDir, "dist");

  const watcherPackage = JSON.parse(await fs.readFile(watcherPackagePath, "utf8"));
  const version = watcherPackage.version;

  let releasedOn = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Edmonton",
  }).format(new Date());

  try {
    const currentReleaseModule = await fs.readFile(releaseModulePath, "utf8");
    const existing = readExistingReleaseMetadata(currentReleaseModule);
    if (existing.version === version && existing.releasedOn) {
      releasedOn = existing.releasedOn;
    }
  } catch {
    // Fresh release file, so today's date is correct.
  }

  await fs.writeFile(
    releaseModulePath,
    WATCHER_RELEASE_TEMPLATE({ version, releasedOn }),
    "utf8"
  );

  await fs.mkdir(downloadsDir, { recursive: true });

  const artifactCopies = [
    {
      source: path.join(watcherDistDir, `AoE2HDBets Watcher-${version}-arm64.dmg`),
      target: path.join(downloadsDir, `AoE2HDBets Watcher-${version}-arm64.dmg`),
    },
    {
      source: path.join(watcherDistDir, `AoE2HDBets Watcher-${version}-arm64.dmg.blockmap`),
      target: path.join(downloadsDir, `AoE2HDBets Watcher-${version}-arm64.dmg.blockmap`),
    },
    {
      source: path.join(watcherDistDir, "latest-mac.yml"),
      target: path.join(downloadsDir, "latest-mac.yml"),
    },
    {
      source: path.join(watcherDistDir, "aoe2hdbets-watcher-direct.zip"),
      target: path.join(downloadsDir, "aoe2hdbets-watcher-direct.zip"),
    },
    {
      source: path.join(watcherDistDir, `AoE2HDBets Watcher Setup ${version}.exe`),
      target: path.join(downloadsDir, `AoE2HDBets Watcher Setup ${version}.exe`),
    },
    {
      source: path.join(watcherDistDir, `AoE2HDBets Watcher Setup ${version}.exe.blockmap`),
      target: path.join(downloadsDir, `AoE2HDBets Watcher Setup ${version}.exe.blockmap`),
    },
    {
      source: path.join(watcherDistDir, "latest.yml"),
      target: path.join(downloadsDir, "latest.yml"),
    },
    {
      source: path.join(watcherDistDir, `AoE2HDBets Watcher ${version}.exe`),
      target: path.join(downloadsDir, `AoE2HDBets Watcher ${version}.exe`),
    },
    {
      source: path.join(watcherDistDir, `AoE2HDBets Watcher-${version}.AppImage`),
      target: path.join(downloadsDir, `AoE2HDBets Watcher-${version}.AppImage`),
    },
  ];

  for (const artifact of artifactCopies) {
    await copyArtifact(artifact.source, artifact.target);
  }

  process.stdout.write(
    `Synced watcher release AoE2HDBets Watcher ${version} into ${downloadsDir}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
