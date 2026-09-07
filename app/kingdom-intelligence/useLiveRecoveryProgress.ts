"use client";

import { useEffect, useState } from "react";

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
const listeners = new Set<Listener>();

function publish(value: LiveRecoveryProgress | null) {
  sharedValue = value;
  for (const listener of listeners) listener(value);
}

async function pollSharedRecovery() {
  if (sharedPollPromise) return sharedPollPromise;

  sharedPollPromise = (async () => {
    try {
      const response = await fetch(
        "/api/kingdom-intelligence/live-recovery",
        {
          cache: "no-store",
        },
      );

      if (response.ok) {
        const payload = (await response.json()) as LiveRecoveryProgress;
        publish(payload);
      }
    } catch {
      // Best-effort operator enhancement. Published KI remains authoritative.
    } finally {
      sharedPollPromise = null;

      if (listeners.size > 0) {
        sharedTimer = setTimeout(() => {
          void pollSharedRecovery();
        }, 5000);
      }
    }
  })();

  return sharedPollPromise;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  listener(sharedValue);

  if (listeners.size === 1) {
    if (sharedTimer) {
      clearTimeout(sharedTimer);
      sharedTimer = null;
    }
    void pollSharedRecovery();
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0 && sharedTimer) {
      clearTimeout(sharedTimer);
      sharedTimer = null;
    }
  };
}

export function useLiveRecoveryProgress(enabled = true) {
  const [value, setValue] = useState<LiveRecoveryProgress | null>(
    sharedValue,
  );

  useEffect(() => {
    if (!enabled) {
      setValue(null);
      return;
    }

    return subscribe(setValue);
  }, [enabled]);

  return value;
}
