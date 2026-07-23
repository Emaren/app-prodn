"use client";

import { useEffect } from "react";

import {
  writeStoredLeaderboardView,
  type LeaderboardView,
} from "@/lib/leaderboardViewPreference";

export function LeaderboardViewPreferenceMarker({
  view,
}: {
  view: LeaderboardView;
}) {
  useEffect(() => {
    writeStoredLeaderboardView(view);
  }, [view]);

  return null;
}
