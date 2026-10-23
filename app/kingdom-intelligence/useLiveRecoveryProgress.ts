"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  isOperatorPreviewOnlyPayload,
  isUsableLiveRecoveryPayload,
  LIVE_RECOVERY_POLL_INTERVAL_MS,
  LIVE_RECOVERY_REQUEST_TIMEOUT_MS,
  shouldPollLiveRecovery,
} from "./liveRecoveryPolicy";

export type LiveRecoveryProgress = {
  available: boolean;
  status?: string;
  currentClass?: string;
  completedClasses?: number;
  totalClasses?: number;
  sealedChunks?: number;
  observedBytes?: number;
  expectedBytes?: number | null;
  classPercent?: number | null;
  overallPercent?: number | null;
  elapsedSeconds?: number | null;
  etaSeconds?: number | null;
  throughputBytesPerSecond?: number | null;
  progressBasis?: string;
  denominatorSource?: string;
  sampledAt?: string;
};

export function formatLiveRecoveryProgressLabel(
  value: LiveRecoveryProgress | null,
  fallback: string | null,
) {
  if (!value?.available) return fallback;

  const parts: string[] = [];

  if (
    typeof value.completedClasses === "number" &&
    typeof value.totalClasses === "number" &&
    value.totalClasses > 0
  ) {
    parts.push(`${value.completedClasses}/${value.totalClasses} classes`);
  }

  if (typeof value.sealedChunks === "number") {
    parts.push(`${value.sealedChunks} chunks`);
  }

  if (
    typeof value.observedBytes === "number" &&
    Number.isFinite(value.observedBytes)
  ) {
    parts.push(
      `${(value.observedBytes / 1024 ** 3).toFixed(2)} GiB`,
    );
  }

  return parts.length ? parts.join(" · ") : fallback;
}

type Listener = (value: LiveRecoveryProgress | null) => void;

let sharedValue: LiveRecoveryProgress | null = null;
let sharedTimer: ReturnType<typeof setTimeout> | null = null;
let sharedPollPromise: Promise<void> | null = null;
let sharedController: AbortController | null = null;
let generation = 0;
let operatorPreviewOnly = false;
const listeners = new Set<Listener>();

// Presentation-only evidence state: never creates requests or source truth.
export type RecoverySignalState =
  | "awaiting_sample"
  | "live"
  | "unavailable"
  | "paused"
  | "operator_preview_only";
let recoverySignalState: RecoverySignalState = "awaiting_sample";
const signalListeners = new Set<() => void>();
function publishSignalState(next: RecoverySignalState) {
  if (next === recoverySignalState) return;
  recoverySignalState = next;
  for (const listener of signalListeners) listener();
}
function subscribeSignalState(listener: () => void) {
  signalListeners.add(listener);
  return () => { signalListeners.delete(listener); };
}
function getSignalState() { return recoverySignalState; }

/** Same existing shared polling; an extra read-only presentation signal only. */
export function useRecoverySignalState() {
  return useSyncExternalStore(subscribeSignalState, getSignalState, () => "awaiting_sample");
}

function publish(value: LiveRecoveryProgress | null) {
  sharedValue = value;
  for (const listener of listeners) listener(value);
}

function canPoll() {
  return (
    typeof document !== "undefined" &&
    !operatorPreviewOnly &&
    shouldPollLiveRecovery(listeners.size, document.visibilityState)
  );
}

function cancelSharedPolling() {
  generation += 1; // Fence completions from older fetches, including aborted ones.
  if (sharedTimer) clearTimeout(sharedTimer);
  sharedTimer = null;
  sharedController?.abort();
  sharedController = null;
  sharedPollPromise = null;
  publish(null); // Never show a hidden/abandoned "live" sample as fresh.
  publishSignalState(operatorPreviewOnly ? "operator_preview_only" : "paused");
}

async function pollSharedRecovery() {
  if (!canPoll()) return;
  if (sharedPollPromise) return sharedPollPromise;

  const requestGeneration = ++generation;
  const controller = new AbortController();
  sharedController = controller;
  publishSignalState("awaiting_sample");
  const timeout = setTimeout(
    () => controller.abort(),
    LIVE_RECOVERY_REQUEST_TIMEOUT_MS,
  );

  sharedPollPromise = (async () => {
    try {
      const response = await fetch(
        "/api/kingdom-intelligence/live-recovery",
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );

      if (!response.ok) throw new Error("Recovery signal unavailable");

      const payload: unknown = await response.json();
      if (!isUsableLiveRecoveryPayload(payload)) {
        throw new Error("Recovery signal malformed");
      }

      if (requestGeneration === generation && canPoll()) {
        if (isOperatorPreviewOnlyPayload(payload)) {
          operatorPreviewOnly = true; // Do not keep polling a disabled public-only API.
          publishSignalState("operator_preview_only");
          publish(null);
        } else if ((payload as LiveRecoveryProgress).available) {
          publishSignalState("live");
          publish(payload as LiveRecoveryProgress);
        } else {
          publishSignalState("unavailable");
          publish(null);
        }
      }
    } catch {
      // A failed or timed-out response must not keep a stale live override.
      if (requestGeneration === generation && canPoll()) {
        publishSignalState("unavailable");
        publish(null);
      }
    } finally {
      clearTimeout(timeout);
      if (requestGeneration === generation) {
        sharedPollPromise = null;
        sharedController = null;

        if (canPoll()) {
          sharedTimer = setTimeout(() => {
            sharedTimer = null;
            void pollSharedRecovery();
          }, LIVE_RECOVERY_POLL_INTERVAL_MS);
        }
      }
    }
  })();

  return sharedPollPromise;
}

function handleVisibilityChange() {
  if (!canPoll()) {
    cancelSharedPolling();
    return;
  }
  if (sharedTimer) clearTimeout(sharedTimer);
  sharedTimer = null;
  void pollSharedRecovery();
}

function subscribe(listener: Listener) {
  const firstSubscriber = listeners.size === 0;
  listeners.add(listener);
  listener(sharedValue);

  if (firstSubscriber && !operatorPreviewOnly) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    handleVisibilityChange();
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cancelSharedPolling();
    }
  };
}

export function useLiveRecoveryProgress(enabled = true) {
  const [value, setValue] = useState<LiveRecoveryProgress | null>(sharedValue);

  useEffect(() => {
    if (!enabled) {
      setValue(null);
      return;
    }
    return subscribe(setValue);
  }, [enabled]);

  return value;
}
