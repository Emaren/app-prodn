"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const REFRESH_INTERVAL_MS = 12_000;
const FIRST_REFRESH_MS = 2_000;

export default function StakingLiveRefresh() {
  const router = useRouter();
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const clearTimer = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const schedule = (delay: number) => {
      clearTimer();
      timerRef.current = window.setTimeout(refresh, delay);
    };

    const refresh = () => {
      if (cancelled) return;

      if (document.visibilityState !== "visible") {
        schedule(REFRESH_INTERVAL_MS);
        return;
      }

      if (!inFlightRef.current) {
        inFlightRef.current = true;
        router.refresh();

        window.setTimeout(() => {
          inFlightRef.current = false;
        }, 900);
      }

      schedule(REFRESH_INTERVAL_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        schedule(250);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule(FIRST_REFRESH_MS);

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
