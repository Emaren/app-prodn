"use client";

import { useEffect } from "react";

import { publishExplicitSpeedReady } from "@/lib/speed/readiness";

export default function SpeedReadyMarker({
  route,
  ready = true,
}: {
  route: string;
  ready?: boolean;
}) {
  useEffect(() => {
    if (!ready) return;
    const frame = window.requestAnimationFrame(() => {
      publishExplicitSpeedReady(route);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ready, route]);

  return null;
}
