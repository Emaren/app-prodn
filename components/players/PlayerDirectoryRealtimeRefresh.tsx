"use client";

import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useRef } from "react";

export const PLAYER_DIRECTORY_REFRESH_MS = 5_000;
const PLAYER_DIRECTORY_RETRY_MS = 8_000;

type GenerationResponse = {
  generation?: string;
};

export default function PlayerDirectoryRealtimeRefresh({
  initialGeneration,
}: {
  initialGeneration: string;
}) {
  const router = useRouter();
  const renderedGenerationRef = useRef(initialGeneration);
  const requestedGenerationRef = useRef<{
    requestedAt: number;
    value: string;
  } | null>(null);
  const checkingRef = useRef(false);
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    renderedGenerationRef.current = initialGeneration;

    if (requestedGenerationRef.current?.value === initialGeneration) {
      requestedGenerationRef.current = null;
    }
  }, [initialGeneration]);

  const checkForDirectoryTruth = useCallback(async () => {
    if (checkingRef.current) return;

    checkingRef.current = true;
    const requestSequence = ++requestSequenceRef.current;

    try {
      const response = await fetch(
        `/api/players/generation?refresh=${Date.now()}`,
        {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        },
      );

      if (!response.ok || requestSequence !== requestSequenceRef.current) {
        return;
      }

      const payload = (await response.json()) as GenerationResponse;
      const generation = String(payload.generation || "").trim();
      if (!generation || generation === renderedGenerationRef.current) {
        return;
      }

      const requested = requestedGenerationRef.current;
      if (
        requested?.value === generation &&
        Date.now() - requested.requestedAt < PLAYER_DIRECTORY_RETRY_MS
      ) {
        return;
      }

      requestedGenerationRef.current = {
        requestedAt: Date.now(),
        value: generation,
      };

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      console.warn("Failed to refresh public player directory:", error);
    } finally {
      checkingRef.current = false;
    }
  }, [router]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void checkForDirectoryTruth();
      }
    };

    refreshIfVisible();

    const interval = window.setInterval(
      refreshIfVisible,
      PLAYER_DIRECTORY_REFRESH_MS,
    );

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      requestSequenceRef.current += 1;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [checkForDirectoryTruth]);

  return null;
}
