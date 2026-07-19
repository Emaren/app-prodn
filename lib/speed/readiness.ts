import { sanitizeSpeedPath } from "@/lib/speed/routeSanitizer";

export const SPEED_READY_EVENT = "aoe2war:speed-ready";

export type SpeedReadySignal = {
  route: string;
  atEpochMs: number;
};

type SpeedReadyWindow = Window & {
  __AOE2WAR_SPEED_READY__?: Record<string, number>;
};

function speedWindow() {
  return window as SpeedReadyWindow;
}

export function publishExplicitSpeedReady(route: string) {
  if (typeof window === "undefined") return;
  const normalizedRoute = sanitizeSpeedPath(route);
  const atEpochMs = performance.timeOrigin + performance.now();
  const target = speedWindow();
  target.__AOE2WAR_SPEED_READY__ = {
    ...(target.__AOE2WAR_SPEED_READY__ || {}),
    [normalizedRoute]: atEpochMs,
  };
  const signal: SpeedReadySignal = { route: normalizedRoute, atEpochMs };
  window.dispatchEvent(new CustomEvent<SpeedReadySignal>(SPEED_READY_EVENT, { detail: signal }));
}

export function readExplicitSpeedReady(route: string, notBeforeEpochMs: number) {
  if (typeof window === "undefined") return null;
  const normalizedRoute = sanitizeSpeedPath(route);
  const atEpochMs = speedWindow().__AOE2WAR_SPEED_READY__?.[normalizedRoute];
  if (typeof atEpochMs !== "number" || atEpochMs < notBeforeEpochMs) return null;
  return { route: normalizedRoute, atEpochMs } satisfies SpeedReadySignal;
}
