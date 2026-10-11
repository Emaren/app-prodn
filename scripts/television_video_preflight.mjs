#!/usr/bin/env node
// Read-only Television WOLO / Video OS capacity projection.
// Does not create capture directories, change limits, or claim decoder proof.
import { stat, statfs } from "node:fs/promises";
import path from "node:path";

const GiB = 1024 ** 3;
const TWO_HOURS_SECONDS = 2 * 60 * 60;
const RESERVE_DEFAULT = 6 * GiB;
const MODES = [
  { name: "Stable", videoBitsPerSecond: 1_400_000 },
  { name: "Full Screen", videoBitsPerSecond: 1_800_000 },
  { name: "Sharp", videoBitsPerSecond: 2_600_000 },
];

function bounded(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

export function videoCapacityPlan(env = process.env) {
  const maxBytes = bounded(env.AOE2_STREAM_MAX_BYTES, 3 * GiB, 8 * 1024 * 1024, 4 * GiB);
  const maxChunks = bounded(env.AOE2_STREAM_MAX_CHUNKS, 12_000, 16, 20_000);
  const reserveBytes = bounded(env.AOE2_STREAM_MIN_FREE_BYTES, RESERVE_DEFAULT, GiB, 40 * GiB);
  const modes = MODES.map((mode) => {
    const projectedBytes = Math.ceil(mode.videoBitsPerSecond * TWO_HOURS_SECONDS / 8 * 1.12);
    const projectedChunks = TWO_HOURS_SECONDS + 1; // initial WebM header plus ~1s media.
    return {
      mode: mode.name,
      projectedBytes,
      projectedChunks,
      fitsStreamBytes: projectedBytes <= maxBytes,
      fitsStreamChunks: projectedChunks <= maxChunks,
      fitsOwnCaps: projectedBytes <= maxBytes && projectedChunks <= maxChunks,
    };
  });
  return { maxBytes, maxChunks, reserveBytes, modes };
}

export async function videoStorageObservation(env = process.env) {
  const location = env.AOE2_STREAM_STORAGE_DIR ||
    (env.AOE2_VIDEO_CAPTURE_DIR
      ? path.join(env.AOE2_VIDEO_CAPTURE_DIR, "live")
      : null);
  if (!location) return { state: "unknown", reason: "video_storage_not_configured" };
  try {
    const [mount, dir, root] = await Promise.all([
      statfs(location),
      stat(location),
      stat(path.parse(location).root || "/"),
    ]);
    if (!dir.isDirectory()) return { state: "blocked", reason: "not_a_directory" };
    const availableBytes = Number(mount.bavail) * Number(mount.bsize);
    if (!Number.isSafeInteger(availableBytes) || availableBytes < 0) {
      return { state: "unknown", reason: "free_space_unverifiable" };
    }
    return {
      state: "observed",
      mountedSeparately: dir.dev !== root.dev,
      availableBytes,
    };
  } catch {
    // Missing mounts are blocked, not a cue to mkdir on the host root.
    return { state: "blocked", reason: "video_storage_unavailable" };
  }
}

export async function inspectVideoCapacity(env = process.env) {
  const limits = videoCapacityPlan(env);
  const storage = await videoStorageObservation(env);
  const projectedSharpBytes = limits.modes.find((mode) => mode.mode === "Sharp")?.projectedBytes || 0;
  const checks = [
    {
      id: "long_game_per_stream_limits",
      state: limits.modes.every((mode) => mode.fitsOwnCaps) ? "pass" : "blocked",
      detail: limits.modes.every((mode) => mode.fitsOwnCaps)
        ? "All Watcher modes fit the modeled two-hour per-stream ceilings."
        : "At least one Watcher mode exceeds the configured per-stream limit.",
    },
    {
      id: "video_volume_mount",
      state: storage.state !== "observed" ? storage.state
        : storage.mountedSeparately ? "pass" : "blocked",
      detail: storage.state !== "observed" ? storage.reason
        : storage.mountedSeparately ? "Video storage is on a separate device." : "Video storage shares the host root device.",
    },
    {
      id: "one_sharp_camera_headroom",
      state: storage.state !== "observed" ? storage.state
        : storage.availableBytes - projectedSharpBytes >= limits.reserveBytes ? "pass" : "blocked",
      detail: storage.state !== "observed" ? storage.reason
        : storage.availableBytes - projectedSharpBytes >= limits.reserveBytes
          ? "Observed free bytes cover one two-hour Sharp camera plus reserve."
          : "Free bytes cannot cover a two-hour Sharp camera while preserving reserve.",
    },
  ];
  const overall = checks.some((check) => check.state === "blocked")
    ? "blocked" : checks.some((check) => check.state !== "pass") ? "unknown" : "pass";
  return {
    schema: "aoe2war-television-video-preflight/v1",
    generatedAt: new Date().toISOString(),
    source: "read-only-local-observation",
    limits,
    storage,
    checks,
    overall,
    fieldProof: "not_measured",
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const report = await inspectVideoCapacity();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exitCode = report.overall === "pass" ? 0 : report.overall === "unknown" ? 2 : 1;
}
