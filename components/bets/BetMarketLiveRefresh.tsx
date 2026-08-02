"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const MARKET_REFRESH_INTERVAL_MS = 5_000;

export default function BetMarketLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      if (cancelled || document.visibilityState === "hidden") return;
      router.refresh();
    };

    const interval = window.setInterval(
      refresh,
      MARKET_REFRESH_INTERVAL_MS
    );

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
}
