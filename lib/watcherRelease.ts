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
  version: "1.1.1",
  label: "AoE2HDBets Watcher 1.1.1",
  releasedOn: "Apr 11, 2026",
  signingStatus: "Unsigned builds for now",
  featureChips: [
    "AoE2HDBets Watcher 1.1.1",
    "Apr 11, 2026",
    "Windows installer",
    "Windows portable fallback",
    "macOS DMG + ZIP",
    "Linux AppImage",
    "Historical replay import"
  ],
} as const;

export const WATCHER_DOWNLOAD_ARTIFACTS: readonly WatcherDownloadArtifact[] = [
  {
    key: "windows-installer",
    platform: "windows",
    title: "Windows Installer",
    shortLabel: "NSIS installer",
    badge: "Recommended",
    filename: "AoE2HDBets Watcher Setup 1.1.1.exe",
    format: "NSIS",
    description:
      "Smoothest Windows path. Installs cleanly, creates shortcuts, and keeps the first run obvious.",
    downloadPath: "/downloads/AoE2HDBets%20Watcher%20Setup%201.1.1.exe",
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
    filename: "AoE2HDBets Watcher 1.1.1.exe",
    format: "portable",
    description:
      "Same watcher core in a no-installer package if SmartScreen or installer policy gets in the way.",
    downloadPath: "/downloads/AoE2HDBets%20Watcher%201.1.1.exe",
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
    filename: "AoE2HDBets Watcher-1.1.1-arm64.dmg",
    format: "DMG",
    description:
      "Best Mac install path. Drag in, pair once, and keep it open while AoE2HD runs under macOS or CrossOver.",
    downloadPath: "/downloads/AoE2HDBets%20Watcher-1.1.1-arm64.dmg",
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
    filename: "AoE2HDBets Watcher-1.1.1.AppImage",
    format: "AppImage",
    description:
      "Portable Linux watcher for Proton or Wine-heavy setups where manual replay-folder selection matters most.",
    downloadPath: "/downloads/AoE2HDBets%20Watcher-1.1.1.AppImage",
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
