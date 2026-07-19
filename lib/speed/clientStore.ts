import { postSpeedSample } from "@/lib/speed/transport";
import type { SpeedSample } from "@/lib/speed/types";

const RECENT_KEY = "aoe2hdbets:speed-recent-samples";
const MAX_RECENT = 20;

const samples = new Map<string, SpeedSample>();
let initialSampleId: string | null = null;
const pendingVitals: Partial<Pick<SpeedSample, "ttfb_ms" | "fcp_ms" | "lcp_ms" | "inp_ms" | "cls">> = {};

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000;
}

function persistRecent(sample: SpeedSample) {
  try {
    const existing = JSON.parse(window.sessionStorage.getItem(RECENT_KEY) || "[]") as SpeedSample[];
    const next = [sample, ...existing.filter((item) => item?.sample_id !== sample.sample_id)].slice(0, MAX_RECENT);
    window.sessionStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Local proof history is best-effort only.
  }
}

export function createSpeedSampleId() {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `SPD_${randomPart.slice(0, 40)}`;
}

export function registerSpeedSample(sample: SpeedSample, options?: { initial?: boolean }) {
  const next = options?.initial ? { ...sample, ...pendingVitals } : sample;
  samples.set(next.sample_id, next);
  if (options?.initial) initialSampleId = next.sample_id;
  persistRecent(next);
  void postSpeedSample(next);
  return next;
}

export function patchSpeedSample(
  sampleId: string,
  patch: Partial<SpeedSample>,
  options?: { includeDetails?: boolean },
) {
  const existing = samples.get(sampleId);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  samples.set(sampleId, next);
  persistRecent(next);
  void postSpeedSample(options?.includeDetails ? next : { ...next, details: undefined });
  return next;
}

export function updateInitialWebVital(name: string, rawValue: number) {
  if (!Number.isFinite(rawValue)) return;
  const value = roundMetric(rawValue);
  const key =
    name === "TTFB"
      ? "ttfb_ms"
      : name === "FCP"
        ? "fcp_ms"
        : name === "LCP"
          ? "lcp_ms"
          : name === "INP"
            ? "inp_ms"
            : name === "CLS"
              ? "cls"
              : null;
  if (!key) return;

  if (!initialSampleId) {
    Object.assign(pendingVitals, { [key]: value });
    return;
  }

  patchSpeedSample(initialSampleId, { [key]: value });
}

export function getRecentSpeedSamples() {
  try {
    return JSON.parse(window.sessionStorage.getItem(RECENT_KEY) || "[]") as SpeedSample[];
  } catch {
    return [];
  }
}
