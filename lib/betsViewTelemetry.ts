"use client";

import type {
  BetsViewVersion,
} from "@/lib/betsViewVersions";

type BetsViewEvent =
  | {
      type: "bets_view_impression";
      metadata: {
        view: BetsViewVersion;
      };
    }
  | {
      type: "bets_view_selected";
      metadata: {
        from: BetsViewVersion;
        to: BetsViewVersion;
      };
    };

export function trackBetsViewEvent(
  event: BetsViewEvent,
) {
  if (typeof window === "undefined") return;

  // Local production-data preview is intentionally read-only.
  // Product telemetry belongs to real production sessions.
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return;
  }

  void fetch("/api/user/experience", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: event.type,
      path: window.location.pathname,
      label: event.type,
      metadata: event.metadata,
      dedupeWithinSeconds: 2,
    }),
    keepalive: true,
  }).catch(() => {
    // Product telemetry must never interrupt betting.
  });
}
