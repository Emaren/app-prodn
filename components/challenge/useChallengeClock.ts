"use client";

import { useEffect, useState } from "react";

/** Server timestamp plus monotonic browser elapsed; device clock never sets a deadline. */
export default function useChallengeClock(serverNow?: string | null) {
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState(() => serverNow ? Date.parse(serverNow) : 0);
  useEffect(() => {
    setMounted(true);
    const receivedAt = performance.now();
    const parsed = serverNow ? Date.parse(serverNow) : Date.now();
    const base = Number.isFinite(parsed) ? parsed : Date.now();
    const tick = () => setNowMs(base + performance.now() - receivedAt);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [serverNow]);
  return { mounted, nowMs };
}
