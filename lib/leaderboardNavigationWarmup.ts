let leaderboardClientWarmPromise: Promise<unknown> | null = null;

export function warmLeaderboardClient() {
  leaderboardClientWarmPromise ??= import(
    "@/components/leaderboard/ModernLeaderboardPage"
  );

  return leaderboardClientWarmPromise;
}
