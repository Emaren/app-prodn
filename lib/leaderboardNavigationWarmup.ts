let leaderboardClientWarmPromise: Promise<unknown> | null = null;

export function warmLeaderboardClient() {
  if (!leaderboardClientWarmPromise) {
    leaderboardClientWarmPromise = import(
      "@/components/leaderboard/ModernLeaderboardPage"
    ).catch(() => {
      // This import is speculative navigation warmup only. A transient dev/prod
      // chunk-load failure must never crash the surface the user is currently on.
      // Clear the cache so the next real intent can retry against fresh chunks.
      leaderboardClientWarmPromise = null;
      return null;
    });
  }

  return leaderboardClientWarmPromise;
}
