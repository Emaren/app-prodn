import { invalidateLobbyLeaderboardCache } from "@/lib/lobbyLeaderboard";
import { invalidateLobbySnapshotCache } from "@/lib/lobbySnapshot";
import { invalidatePublicPlayerDirectoryCache } from "@/lib/publicPlayerDirectory";

export function invalidateFeaturedWarriorProjectionCaches() {
  invalidatePublicPlayerDirectoryCache();
  invalidateLobbyLeaderboardCache();
  invalidateLobbySnapshotCache();
}
