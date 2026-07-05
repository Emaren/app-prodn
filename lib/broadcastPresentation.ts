export const BATTLE_CAM_STANDBY_VIDEO_URL = "/watch-loops/live-hero-loop.mp4";
export const BETS_BATTLE_CAM_VISIBILITY_STORAGE_KEY =
  "aoe2hdbets.betsBattleCam.v1";

export type BattleCamVisibility = "closed" | "open";

export function readStoredBattleCamVisibility(): BattleCamVisibility {
  if (typeof window === "undefined") {
    return "closed";
  }

  try {
    return window.localStorage.getItem(BETS_BATTLE_CAM_VISIBILITY_STORAGE_KEY) ===
      "open"
      ? "open"
      : "closed";
  } catch {
    return "closed";
  }
}

export function writeStoredBattleCamVisibility(
  visibility: BattleCamVisibility
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      BETS_BATTLE_CAM_VISIBILITY_STORAGE_KEY,
      visibility
    );
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

export function isExplicitlyAttachedBroadcastFeed(
  feed: { id: number; sessionKey: string } | null | undefined,
  sessionKey: string | null | undefined
) {
  const expectedSessionKey = String(sessionKey || "").trim();
  return Boolean(
    feed &&
      feed.id > 0 &&
      expectedSessionKey &&
      feed.sessionKey.trim() === expectedSessionKey
  );
}
