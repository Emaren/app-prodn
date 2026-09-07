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

export function useLiveRecoveryProgress(enabled = true) {
  const [value, setValue] = useState<LiveRecoveryProgress | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(
          "/api/kingdom-intelligence/live-recovery",
          {
            cache: "no-store",
          },
        );

        if (response.ok) {
          const payload = (await response.json()) as LiveRecoveryProgress;
          if (!cancelled) setValue(payload);
        }
      } catch {
        // Best-effort operator enhancement. Published KI remains authoritative.
      } finally {
        if (!cancelled) {
          timer = setTimeout(poll, 5000);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  return value;
}
