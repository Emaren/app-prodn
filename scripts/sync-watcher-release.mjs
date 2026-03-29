#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FEATURE_CHIPS = [
  "Growth-aware retry",
  "Replay-size gate",
  "Battle archive link",
  "Recorded resignation",
  "CrossOver ready",
];

const WATCHER_RELEASE_TEMPLATE = ({
  version,
  label,
  releasedOn,
  featureChips,
}) => `export const WATCHER_RELEASE = {
  version: ${JSON.stringify(version)},
  label: ${JSON.stringify(label)},
  releasedOn: ${JSON.stringify(releasedOn)},
  downloadHref: "/downloads/aoe2-watcher-mac.zip",
  featureChips: ${JSON.stringify(featureChips, null, 2).replace(/\n/g, "\n  ")},
} as const;
`;

function readExistingReleaseMetadata(content) {
  const versionMatch = content.match(/version:\s*"([^"]+)"/);
  const releasedOnMatch = content.match(/releasedOn:\s*"([^"]+)"/);

  return {
    version: versionMatch?.[1] ?? null,
    releasedOn: releasedOnMatch?.[1] ?? null,
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(scriptDir, "..");
  const repoDir = path.resolve(appDir, "..");
  const watcherDir = path.join(repoDir, "aoe2-watcher");
  const watcherPackagePath = path.join(watcherDir, "package.json");
  const releaseModulePath = path.join(appDir, "lib", "watcherRelease.ts");
  const downloadsDir = path.join(appDir, "public", "downloads");
  const zipPath = path.join(downloadsDir, "aoe2-watcher-mac.zip");

  const watcherPackage = JSON.parse(await fs.readFile(watcherPackagePath, "utf8"));
  const version = watcherPackage.version;
  const label = `Live v${version}`;

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
    // If the file does not exist yet, today's release date is the right default.
  }

  const featureChips = [label, releasedOn, ...FEATURE_CHIPS];

  await fs.writeFile(
    releaseModulePath,
    WATCHER_RELEASE_TEMPLATE({ version, label, releasedOn, featureChips }),
    "utf8",
  );

  await fs.mkdir(downloadsDir, { recursive: true });
  await fs.rm(zipPath, { force: true });

  execFileSync(
    "zip",
    [
      "-qj",
      zipPath,
      "README.md",
      ".env.example",
      ".gitignore",
      "main.js",
      "package.json",
      "package-lock.json",
      "watcher.js",
    ],
    { cwd: watcherDir, stdio: "inherit" },
  );

  process.stdout.write(`Synced watcher release ${label} -> ${zipPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
