export type WatcherArtifactPlatform = "windows" | "macos" | "linux";

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
  version: "1.1.0",
  label: "AoE2HDBets Watcher 1.1.0",
  releasedOn: "Apr 9, 2026",
  signingStatus: "Unsigned builds for now",
  featureChips: [
    "Windows, macOS, Linux",
    "Historical replay import",
    "Live replay watch",
  ],
} as const;

export const WATCHER_DOWNLOAD_ARTIFACTS: readonly WatcherDownloadArtifact[] = [
  {
    key: "windows-installer",
    platform: "windows",
    title: "Windows Installer",
    shortLabel: "NSIS installer",
    badge: "Recommended",
    filename: "AoE2HDBets Watcher Setup 1.1.0.exe",
    format: "NSIS",
    description: "Clean Windows install with shortcuts and the clearest first run.",
    downloadPath: "/downloads/AoE2HDBets%20Watcher%20Setup%201.1.0.exe",
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
    filename: "AoE2HDBets Watcher 1.1.0.exe",
    format: "portable",
    description: "No-installer Windows fallback if SmartScreen or installer policy gets in the way.",
    downloadPath: "/downloads/AoE2HDBets%20Watcher%201.1.0.exe",
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
    filename: "AoE2HDBets Watcher-1.1.0-arm64.dmg",
    format: "DMG",
    description: "Best Mac install path.",
    downloadPath: "/downloads/AoE2HDBets%20Watcher-1.1.0-arm64.dmg",
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
    description: "Direct ZIP fallback for Mac users who hit DMG or Gatekeeper friction.",
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
    filename: "AoE2HDBets Watcher-1.1.0.AppImage",
    format: "AppImage",
    description: "Portable Linux build for Proton or Wine-heavy setups.",
    downloadPath: "/downloads/AoE2HDBets%20Watcher-1.1.0.AppImage",
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
